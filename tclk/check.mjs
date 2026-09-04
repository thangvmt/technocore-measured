#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Read-only by default: show the venue's room listing and count the frame types in the
// existing public tclk-offers room. Creating a probe room is deliberately opt-in.
import { randomBytes } from "node:crypto";
import { canonicalMessage, nextNonce, signerFromSeed, sweep } from "@flop-labs/tclk-mcp/dist/signing.js";

const HELP = `Usage: node check.mjs [--probe-create]

Read-only default:
  node check.mjs              GET /rooms and count existing tclk-offers records
  node check.mjs --probe-create
                              opt in to one signed POST to a newly named probe room
  node check.mjs --probe       compatibility alias for --probe-create
  node check.mjs --help       show this help

WARNING: --probe-create creates a public room that cannot be deleted and consumes
venue room/quota capacity. Do not use it for a routine health check.
`;

function oneLine(value, max = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : "<empty response>";
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  let probe = false;
  for (const arg of argv) {
    if (arg === "--probe-create" || arg === "--probe") {
      probe = true;
      continue;
    }
    throw new Error(`unknown option ${arg}; use --help`);
  }
  return { help: false, probe };
}

function baseUrl() {
  // Do not silently fall back when an explicitly supplied URL is bad.
  const raw = process.env.TECHNOCORE_URL ?? "https://technocore.chat";
  if (/[\u0000-\u0020\u007f-\u009f\u200b\u200c\u200d\u2060\ufeff]/u.test(raw)) {
    throw new Error("TECHNOCORE_URL must not contain whitespace or control characters");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`TECHNOCORE_URL is not a valid URL: ${oneLine(raw, 120)}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("TECHNOCORE_URL must use http:// or https://");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!hostname || parsed.username || parsed.password) {
    throw new Error("TECHNOCORE_URL must have a hostname and no username/password credentials");
  }
  if (/[\u0000-\u0020\u007f-\u009f\u200b\u200c\u200d\u2060\ufeff]/u.test(hostname)) {
    throw new Error("TECHNOCORE_URL hostname must not contain whitespace or control characters");
  }
  if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("TECHNOCORE_URL may use HTTP only for a loopback test server");
  }
  try {
    void parsed.port;
  } catch {
    throw new Error("TECHNOCORE_URL contains an invalid port");
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new Error("TECHNOCORE_URL must not contain a path");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("TECHNOCORE_URL must not contain a query string or fragment");
  }
  return parsed.href.replace(/\/+$/, "");
}

async function requestRaw(url, label, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: "error" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: network request failed: ${detail}`);
  }
  let body;
  try {
    body = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: could not read HTTP response body: ${detail}`);
  }
  return { response, body };
}

async function getText(url, label) {
  const { response, body } = await requestRaw(url, label, {
    method: "GET",
    headers: { accept: "text/plain" },
  });
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim());
  }
  return body;
}

async function getJson(url, label) {
  const body = await getText(url, label);
  try {
    return JSON.parse(body);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: invalid JSON (${detail}); ${oneLine(body)}`);
  }
}

async function probeCreate(base) {
  console.error("WARNING: --probe-create will POST a public room that cannot be deleted and consumes venue quota.");
  const signer = signerFromSeed(randomBytes(32));
  const room = `probe-${randomBytes(4).toString("hex")}`;
  const text = sweep("checking whether a new room can be created");
  const nonce = nextNonce();
  const url = `${base}/r/${encodeURIComponent(room)}`;
  const { response, body } = await requestRaw(url, "probe room creation", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain" },
    body: JSON.stringify({
      did: signer.did,
      sig: signer.sign(canonicalMessage(room, nonce, text)),
      nonce: String(nonce),
      text,
    }),
  });
  if (!response.ok) {
    throw new Error(`probe room creation: HTTP ${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim());
  }
  console.log(`  probe room             ${room}`);
  console.log(`  creation response      ${response.status} ${oneLine(body, 120)}`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const base = baseUrl();
  const rooms = await getText(`${base}/rooms`, "GET /rooms");
  const roomLine = rooms.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!roomLine) throw new Error("GET /rooms: successful response was empty");

  console.log(`\n  ${roomLine.replace(/^# /, "")}\n`);

  if (args.probe) await probeCreate(base);

  const body = await getJson(`${base}/r/tclk-offers?limit=200&format=json`, "GET /r/tclk-offers?limit=200&format=json");
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    throw new Error("GET /r/tclk-offers?limit=200&format=json: JSON must contain a messages array");
  }

  const kinds = {};
  let malformedMessages = 0;
  for (let index = 0; index < body.messages.length; index += 1) {
    const message = body.messages[index];
    if (!message || typeof message !== "object" || typeof message.text !== "string") {
      malformedMessages += 1;
      continue;
    }
    if (!message.text.startsWith("tclk1 ")) continue;
    let frame;
    try {
      frame = JSON.parse(message.text.slice(6));
    } catch {
      malformedMessages += 1;
      continue;
    }
    if (!frame || typeof frame !== "object" || typeof frame.type !== "string") {
      malformedMessages += 1;
      continue;
    }
    kinds[frame.type] = (kinds[frame.type] ?? 0) + 1;
  }

  console.log(`  /r/tclk-offers, newest ${body.messages.length} records:\n`);
  for (const kind of ["offer", "accept", "lock", "reveal", "receipt"]) {
    console.log(`  ${kind.padEnd(34)}${kinds[kind] ?? 0}`);
  }
  if (malformedMessages > 0) {
    throw new Error(`GET /r/tclk-offers?limit=200&format=json: ${malformedMessages} malformed message record(s) were skipped`);
  }
  console.log();
}

try {
  await run();
} catch (error) {
  console.error(`check.mjs: error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
