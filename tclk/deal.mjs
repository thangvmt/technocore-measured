#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// A tclk/1 public PAPER rehearsal. It never talks to the venue unless --live is explicit.
// The live choreography intentionally stays in the caller-supplied room: offer, accept, lock,
// reveal, and receipt are all bound to the same ROOM. This is not a real FLOP settlement, and
// it does not use a Binance wallet.
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFrame, decodeFrame, encodeFrame, generateHashLock, lockTerms, makeAccept, makeOffer,
  openContract, PaperRail, paperNote,
} from "@flop-labs/tclk";
import { canonicalMessage, nextNonce, signerFromSeed, sweep } from "@flop-labs/tclk-mcp/dist/signing.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOM = "tclk-offers";
const HELP = `Usage: node deal.mjs [room] [--parties <path>] [--live]

Safe default:
  node deal.mjs                         validate options only; make no network request
  node deal.mjs <room> --parties <path> --live
                                        run the public PAPER rehearsal
  node deal.mjs --help                  show this help

--live is mandatory for every network write. The live run posts the complete choreography to
one existing public room (the supplied room, default ${DEFAULT_ROOM}); it does not silently
switch to a derived room. A live run uses disposable 64-hex seeds in parties.json, not an
identity.pem or wallet key.

WARNING: this is a public PAPER rehearsal, not real FLOP and not a payment. It does not use a
Binance wallet. Room messages and paper-rail notes are public and the paper note is world-writable.
`;

function oneLine(value, max = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : "<empty response>";
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  let room = DEFAULT_ROOM;
  let roomSeen = false;
  let live = false;
  let partiesSpec;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--live") {
      live = true;
    } else if (arg === "--parties") {
      partiesSpec = argv[++i];
      if (!partiesSpec || partiesSpec.startsWith("--")) {
        throw new Error("--parties requires a file path");
      }
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}; use --help`);
    } else if (!roomSeen) {
      room = arg;
      roomSeen = true;
    } else {
      throw new Error(`unexpected argument ${arg}; use --help`);
    }
  }
  return { help: false, room, live, partiesSpec };
}

function validateRoom(room) {
  // Keep room binding unambiguous and prevent path/query injection into the transport URL.
  if (typeof room !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(room)) {
    throw new Error("room must be 1-128 characters of letters, digits, '.', '_', '~', or '-'; it cannot be a path");
  }
  if (room === "." || room === "..") throw new Error("room cannot be '.' or '..'");
  return room;
}

function baseUrl() {
  const raw = process.env.TECHNOCORE_URL ?? "https://technocore.chat";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("TECHNOCORE_URL is not a valid URL");
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
  if (parsed.search || parsed.hash || (parsed.pathname !== "" && parsed.pathname !== "/")) {
    throw new Error("TECHNOCORE_URL must not contain a path, query string, or fragment");
  }
  if (/[\u0000-\u0020\u007f\u0080-\u009f\u200b\u200c\u200d\u2060\ufeff]/u.test(parsed.hostname)) {
    throw new Error("TECHNOCORE_URL hostname must not contain whitespace or control characters");
  }
  return parsed.href.replace(/\/+$/, "");
}

function rejectSensitivePath(pathSpec, label) {
  const name = basename(pathSpec).toLowerCase();
  // Refuse before opening common identity/wallet files. These scripts only accept a dedicated
  // parties JSON or a raw 64-hex seed file; they must never inspect identity.pem or wallet keys.
  if (name === "identity.pem" || name.endsWith(".pem") || name.includes("wallet") || name.includes("keystore")) {
    throw new Error(`${label} must be a dedicated tclk seed file, not an identity.pem or wallet/keystore file`);
  }
}

function parseSeed(value, label) {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be exactly 64 hexadecimal characters (one Ed25519 seed)`);
  }
  return value;
}

function parseParties(raw, path) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: invalid JSON (${detail})`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected an object containing exactly payer and payee seeds`);
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "payer" || keys[1] !== "payee") {
    throw new Error(`${path}: expected exactly the payer and payee fields; no other key material is accepted`);
  }
  return {
    payer: parseSeed(value.payer, `${path}.payer`),
    payee: parseSeed(value.payee, `${path}.payee`),
  };
}

async function readParties(path) {
  rejectSensitivePath(path, "parties path");
  let raw;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${path}: parties file does not exist; a live run can create it at this path`);
    }
    throw new Error(`${path}: cannot read parties file: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseParties(raw, path);
}

async function createParties(path) {
  rejectSensitivePath(path, "parties path");
  const data = JSON.stringify({
    payer: randomBytes(32).toString("hex"),
    payee: randomBytes(32).toString("hex"),
  }) + "\n";
  let handle;
  try {
    // wx is exclusive: a concurrent run cannot replace or silently reuse a file. Write the
    // complete small payload through the open handle, sync it, and request owner-only mode.
    handle = await fs.open(path, "wx", 0o600);
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } catch (error) {
    if (handle) {
      try { await handle.close(); } catch { /* preserve the original error */ }
      try { await fs.unlink(path); } catch { /* remove only our incomplete file when possible */ }
    }
    if (error?.code === "EEXIST") return readParties(path);
    if (error?.code === "ENOENT") {
      throw new Error(`${path}: parent directory does not exist; choose --parties with an existing directory`);
    }
    throw new Error(`${path}: could not create parties file exclusively: ${error instanceof Error ? error.message : String(error)}`);
  }
  try { await handle.close(); } catch (error) {
    throw new Error(`${path}: parties file was written but could not be closed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await fs.chmod(path, 0o600);
  } catch {
    console.error(`WARNING: could not tighten permissions on ${path}; protect this temporary key file manually`);
  }
  console.log(`  wrote ${path} (two disposable seeds; seed values are not printed)`);
  return parseParties(data, path);
}

async function loadParties(path) {
  try {
    return await readParties(path);
  } catch (error) {
    if (error?.code === "ENOENT") return createParties(path);
    if (error instanceof Error && error.message.includes("does not exist")) return createParties(path);
    throw error;
  }
}

async function requestRaw(url, label, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: "error" });
  } catch (error) {
    throw new Error(`${label}: network request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  let body;
  try {
    body = await response.text();
  } catch (error) {
    throw new Error(`${label}: could not read HTTP response body: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { response, body };
}

async function getText(base, path, label) {
  const { response, body } = await requestRaw(`${base}${path}`, label, { method: "GET", headers: { accept: "text/plain" } });
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim());
  }
  return body;
}

async function post(base, room, signer, frame) {
  const text = sweep(encodeFrame(frame));
  const nonce = nextNonce();
  const { response, body } = await requestRaw(`${base}/r/${encodeURIComponent(room)}`, `POST /r/${room} (${frame.type})`, {
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
    const detail = `${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim();
    if (response.status === 400 || response.status === 429) {
      throw new Error(`${frame.type}: HTTP ${detail}. The supplied public room may not exist, may be at a deployment/quota cap, or may be rate-limited; choose an already-existing room, check GET /rooms, honor Retry-After, and do not retry blindly.`);
    }
    throw new Error(`${frame.type}: HTTP ${detail}`);
  }
  return text.length;
}

// The venue's note store, in the shape PaperRail asks for. Conditional writes are the venue's
// own ?if_absent=1 and ?if=<value>; 409 means the condition failed. This is a public rehearsal
// note, not a settlement record.
function makeNotes(base) {
  return {
    async get(ns, key) {
      const { response, body } = await requestRaw(`${base}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, `GET /kv/${ns}/${key}`, {
        method: "GET", headers: { accept: "text/plain" },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GET /kv/${ns}/${key}: HTTP ${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim());
      const paperLine = body.split(/\r?\n/).find((line) => line.startsWith("tclkpaper1"));
      return paperLine ?? (body.trim() || null);
    },
    async set(ns, key, value, condition) {
      const query = condition === undefined ? "" : "ifAbsent" in condition ? "?if_absent=1" : `?if=${encodeURIComponent(condition.if)}`;
      const path = `/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}/set/${encodeURIComponent(value)}${query}`;
      const { response, body } = await requestRaw(`${base}${path}`, `write /kv/${ns}/${key}`, {
        method: "GET", headers: { accept: "text/plain" },
      });
      if (response.status === 409) return false;
      if (!response.ok) throw new Error(`write /kv/${ns}/${key}: HTTP ${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim());
      return true;
    },
  };
}

async function runLive(room, base, partiesPath) {
  const seeds = await loadParties(partiesPath);
  const payer = signerFromSeed(Buffer.from(seeds.payer, "hex"));
  const payee = signerFromSeed(Buffer.from(seeds.payee, "hex"));
  const log = (status, detail) => console.log(`${String(status).padEnd(3)} ${detail}`);

  console.log("PUBLIC PAPER rehearsal only: this is not a real FLOP payment and does not use a Binance wallet.");
  console.log("Every message below is public; temporary seeds stay on this machine and are never printed or uploaded.");
  console.log("The old npm 0.1.0 package cannot by itself prove signature authenticity, room binding, or rail evidence as a complete authenticated audit.\n");
  log("", `venue ${base}   room ${room}`);
  log("", `payer ${payer.did.slice(0, 24)}…`);
  log("", `payee ${payee.did.slice(0, 24)}…\n`);

  const now = Date.now();
  const offer = makeOffer({
    from: payer.did, role: "payer", amount: "1000000", asset: "PAPER", lock: "hash", rails: ["paper"],
    expiresMs: now + 6e5, claimByMs: now + 12e5, refundAfterMs: now + 18e5,
    nonce: randomBytes(8).toString("hex"),
  });
  log(1, `offer    ${await post(base, room, payer, offer)} bytes   id ${offer.id.slice(0, 22)}…`);

  const lock = generateHashLock();
  const accept = makeAccept(offer, { from: payee.did, statement: lock.hash });
  log(2, `accept   ${await post(base, room, payee, accept)} bytes   contract ${accept.contract.slice(0, 22)}…`);

  // Project the accepted state into the complete rail contract. PaperRail currently checks
  // only a non-value subset, but keeping all terms here prevents a future rail from silently
  // receiving an incomplete contract.
  const accepted = applyFrame(openContract(offer), accept, Date.now());
  if (!accepted.ok) throw new Error(`accept: state transition failed: ${accepted.reason ?? "unknown reason"}`);
  const terms = lockTerms(accepted.state);
  const rail = new PaperRail(makeNotes(base));
  const ref = await rail.lock(terms);
  const { ns, key } = paperNote(accept.contract);
  const lockFrame = { type: "lock", from: payer.did, contract: accept.contract, rail: "paper", ref };
  log(3, `lock     ${await post(base, room, payer, lockFrame)} bytes   record /kv/${ns}/${key}`);
  log("", `         payee verifies paper predicate: ${await rail.verifyLock(terms, ref)} (not payment proof)`);

  const reveal = { type: "reveal", from: payee.did, contract: accept.contract, secret: lock.preimage };
  log(4, `reveal   ${await post(base, room, payee, reveal)} bytes`);
  await rail.claim(ref, lock.preimage);
  log("", `         paper record now: ${(await rail.read(ref))?.status}`);
  log(5, `receipt  ${await post(base, room, payer, { type: "receipt", from: payer.did, contract: accept.contract, outcome: "claimed" })} bytes`);

  console.log("\n--- an unauthenticated third-reader structural fold ---");
  const txt = await getText(base, `/r/${encodeURIComponent(room)}/export`, `GET /r/${room}/export`);
  const frames = [];
  let malformed = 0;
  for (const line of txt.split(/\r?\n/).filter((entry) => entry.trim())) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    if (!message || typeof message !== "object" || typeof message.text !== "string" || typeof message.ts !== "string") {
      malformed += 1;
      continue;
    }
    const timestampMs = Date.parse(message.ts);
    if (!Number.isFinite(timestampMs)) {
      malformed += 1;
      continue;
    }
    if (!message.text.startsWith("tclk1 ")) continue;
    let frame;
    try { frame = decodeFrame(message.text); }
    catch { malformed += 1; continue; }
    frames.push({ message, frame, timestampMs });
  }
  if (malformed > 0) {
    throw new Error(`GET /r/${room}/export: ${malformed} malformed, undecodable, or untimestamped export row(s) were skipped; refusing to present an incomplete fold`);
  }

  const mine = frames.filter(({ frame }) => frame.contract === accept.contract);
  const others = new Set(frames.map(({ frame }) => frame.contract).filter((contract) => contract && contract !== accept.contract));
  let state = openContract(offer);
  for (const { message, frame, timestampMs } of mine) {
    const result = applyFrame(state, frame, timestampMs);
    state = result.state;
    console.log(`    seq ${String(message.seq ?? "?").padStart(4)}  ${frame.type.padEnd(8)} ok=${result.ok}  -> ${state.status}` +
                `  sig=${"sig" in message ? "present (not verified)" : "absent"}`);
  }
  console.log(`\n    frames in this contract : ${mine.length}`);
  console.log(`    other contracts in room : ${others.size}`);
  console.log(`    final status            : ${state.status}`);
  console.log(`    secret opens statement  : ${state.secret === lock.preimage}`);
  console.log(`    rail record             : ${(await rail.read(ref))?.status ?? "none"}  (public note, not payment proof)`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const room = validateRoom(args.room);
  const base = baseUrl();
  const partiesPath = args.partiesSpec ? resolve(args.partiesSpec) : resolve(SCRIPT_DIR, "parties.json");
  rejectSensitivePath(partiesPath, "parties path");

  if (!args.live) {
    console.log("[dry run] No network request and no parties file write will occur.");
    console.log(`  room: ${room}`);
    console.log(`  parties path: ${partiesPath}`);
    console.log("Re-run with --live only for the explicitly authorized public PAPER rehearsal.");
    return;
  }

  await runLive(room, base, partiesPath);
}

try {
  await run();
} catch (error) {
  console.error(`deal.mjs: error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
