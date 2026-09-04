#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Put two parties on an owned room's allow-list. Dry-run is the default; --go performs
// one public signed note write and replaces the current allow-list value.
//
//   node allow.mjs <room> <owner-seed-file> <parties.json>          # reads nonce, sends nothing
//   node allow.mjs <room> <owner-seed-file> <parties.json> --go     # signs and sends
//
// Seed files contain exactly 64 hexadecimal characters. They are read locally and never sent;
// only the resulting DID and signature are sent to the venue. Do not pass identity.pem,
// wallet files, or a seed from an unrelated project.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { signerFromSeed } from "@flop-labs/tclk-mcp/dist/signing.js";

const HELP = `Usage: node allow.mjs <room> <owner-seed-file> <parties.json> [--go]

Default mode reads the room nonce and prints the signed allow-list URL without sending it.
--go       send the signed allow-list write (public and replacement-style)
--help     show this help

The room must already be an owned d- room. The write replaces the current allow-list value;
this script does not merge concurrent changes. Use a fresh nonce and inspect the response.
`;

function oneLine(value, max = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : "<empty response>";
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const positional = [];
  let go = false;
  for (const arg of argv) {
    if (arg === "--go") go = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}; use --help`);
    else positional.push(arg);
  }
  if (positional.length !== 3) throw new Error("expected <room> <owner-seed-file> <parties.json>; use --help");
  return { help: false, room: positional[0], seedFile: positional[1], partiesFile: positional[2], go };
}

function validateRoom(room) {
  if (typeof room !== "string" || !/^d-[a-z0-9][a-z0-9_-]{0,46}$/u.test(room)) {
    throw new Error("room must be an owned d- room name (lowercase letters, digits, '_' or '-')");
  }
  return room;
}

function baseUrl() {
  const raw = process.env.TECHNOCORE_URL ?? "https://technocore.chat";
  if (/[\u0000-\u0020\u007f-\u009f\u200b\u200c\u200d\u2060\ufeff]/u.test(raw)) {
    throw new Error("TECHNOCORE_URL must not contain whitespace or control characters");
  }
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("TECHNOCORE_URL is not a valid URL"); }
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
  try { void parsed.port; }
  catch { throw new Error("TECHNOCORE_URL contains an invalid port"); }
  if (parsed.search || parsed.hash || (parsed.pathname !== "" && parsed.pathname !== "/")) {
    throw new Error("TECHNOCORE_URL must not contain a path, query string, or fragment");
  }
  return parsed.href.replace(/\/+$/u, "");
}

function validateSeed(value, label) {
  const seed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/u.test(seed)) {
    throw new Error(`${label} must contain exactly 64 hexadecimal characters`);
  }
  return seed;
}

function rejectSensitivePath(path, label) {
  const name = basename(path).toLowerCase();
  if (name === "identity.pem" || name.endsWith(".pem") || name.includes("wallet") || name.includes("keystore")) {
    throw new Error(`${label} must not be identity.pem, a PEM file, a wallet file, or a keystore`);
  }
}

function readSeedFile(path, label) {
  rejectSensitivePath(path, label);
  let value;
  try { value = readFileSync(path, "utf8"); }
  catch (error) { throw new Error(`${label}: cannot read file: ${error instanceof Error ? error.message : String(error)}`); }
  return validateSeed(value, label);
}

function readParties(path) {
  rejectSensitivePath(path, "parties file");
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw new Error(`${path}: invalid JSON or unreadable file: ${error instanceof Error ? error.message : String(error)}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected an object with payer and payee seeds`);
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "payer" || keys[1] !== "payee") {
    throw new Error(`${path}: expected exactly payer and payee fields`);
  }
  return {
    payer: validateSeed(value.payer, `${path}.payer`),
    payee: validateSeed(value.payee, `${path}.payee`),
  };
}

async function getResponse(url, label) {
  let response;
  try { response = await fetch(url, { method: "GET", redirect: "error", headers: { accept: "text/plain" } }); }
  catch (error) { throw new Error(`${label}: network request failed: ${error instanceof Error ? error.message : String(error)}`); }
  let body;
  try { body = await response.text(); }
  catch (error) { throw new Error(`${label}: could not read response body: ${error instanceof Error ? error.message : String(error)}`); }
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim());
  }
  return body;
}

function parseNonce(body, label) {
  const candidate = body.split(/\r?\n/u).map((line) => line.trim()).find((line) => /^\d{1,19}$/u.test(line));
  if (!candidate) throw new Error(`${label}: response did not contain a valid 1-19 digit nonce`);
  return BigInt(candidate);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  const room = validateRoom(args.room);
  const base = baseUrl();
  const owner = signerFromSeed(Buffer.from(readSeedFile(args.seedFile, "owner seed file"), "hex"));
  const seeds = readParties(args.partiesFile);
  const dids = [seeds.payer, seeds.payee].map((seed) => signerFromSeed(Buffer.from(seed, "hex")).did);
  const value = dids.join(" ");

  const nonceBody = await getResponse(`${base}/kv/room-nonce/${encodeURIComponent(room)}`, `GET /kv/room-nonce/${room}`);
  const claimNonce = parseNonce(nonceBody, `GET /kv/room-nonce/${room}`);
  const nonce = claimNonce + 1n > BigInt(Date.now()) ? claimNonce + 1n : BigInt(Date.now());
  if (nonce > 9999999999999999999n) throw new Error("generated nonce exceeds the protocol's 19-digit limit");
  const nonceText = nonce.toString();
  const payload = `room-allow|${room}|${nonceText}|${value}`;
  const url = `${base}/kv/room-allow/${encodeURIComponent(room)}/set-signed/${owner.did}/${owner.sign(payload)}/${nonceText}/${encodeURIComponent(value)}`;

  console.log(`  room        ${room}`);
  console.log(`  owner       ${owner.did}`);
  console.log(`  allowing    ${dids.join("\n              ")}`);
  console.log(`  claim nonce ${claimNonce.toString()}  ->  using ${nonceText}`);
  if (!args.go) {
    console.log("  [dry run] nothing sent. Re-run with --go to replace the public allow-list value.");
    console.log("  signature prepared locally; the full signed URL is not printed to avoid leaking a replayable write request");
    return;
  }

  const body = await getResponse(url, "signed room-allow write");
  console.log(`  -> ${oneLine(body, 160)}`);
}

try {
  await run();
} catch (error) {
  console.error(`allow.mjs: error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
