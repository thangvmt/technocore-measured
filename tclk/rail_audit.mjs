#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Read the retained board export and PaperRail notes for a structural diagnostic. This script
// does not authenticate transport signatures: the released 0.1.0 npm package does not expose
// the authenticated transcript API that exists on upstream main. Its result is therefore not a
// payment proof or an authoritative transcript audit.
//
//   node rail_audit.mjs                         # GET only; writes rail_audit.generated.json
//   node rail_audit.mjs --out audit.json        # GET only; writes the requested local file
//
// Every network operation below is a GET. The default output never overwrites the tracked
// rail_audit.json snapshot; use --out explicitly if replacing that file is intentional.
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyFrame, decodeFrame, decodePaperRecord, openContract, paperNote } from "@flop-labs/tclk";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = "https://technocore.chat";
const DEFAULT_ROOM = "tclk-offers";
const DEFAULT_OUT = resolve(SCRIPT_DIR, "rail_audit.generated.json");
const SLEEP_MS = 620;
const HELP = `Usage: node rail_audit.mjs [--out <path>]

Read-only diagnostic:
  node rail_audit.mjs                 GET the board export and PaperRail notes
  node rail_audit.mjs --out <path>    choose the local JSON output path
  node rail_audit.mjs --help          show this help

The script never posts to Technocore. It performs a room-agnostic structural fold using the
released 0.1.0 library, so signatures, sender binding, room binding, and rail value are not
verified. The default output is rail_audit.generated.json, not the tracked snapshot.
`;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function oneLine(value, max = 240) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  return text ? text.slice(0, max) : "<empty response>";
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  let out = DEFAULT_OUT;
  let outSeen = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      if (outSeen || !argv[i + 1] || argv[i + 1].startsWith("--")) {
        throw new Error("--out requires one path and may be supplied only once");
      }
      out = resolve(argv[++i]);
      outSeen = true;
    } else {
      throw new Error(`unknown option ${arg}; use --help`);
    }
  }
  return { help: false, out, outSeen };
}

function baseUrl() {
  const raw = process.env.TECHNOCORE_URL ?? DEFAULT_BASE;
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

async function getText(url, label) {
  let response;
  try { response = await fetch(url, { method: "GET", headers: { accept: "text/plain" }, redirect: "error" }); }
  catch (error) { throw new Error(`${label}: network request failed: ${error instanceof Error ? error.message : String(error)}`); }
  let body;
  try { body = await response.text(); }
  catch (error) { throw new Error(`${label}: could not read response body: ${error instanceof Error ? error.message : String(error)}`); }
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status} ${response.statusText || ""}; ${oneLine(body)}`.trim());
  return body;
}

async function readPaper(base, contract) {
  const { ns, key } = paperNote(contract);
  const label = `GET /kv/${ns}/${key}`;
  let response;
  try { response = await fetch(`${base}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, { method: "GET", redirect: "error", headers: { accept: "text/plain" } }); }
  catch (error) {
    return { status: "network-error", error: error instanceof Error ? error.message : String(error) };
  }
  let body;
  try { body = await response.text(); }
  catch (error) { return { status: "read-error", error: error instanceof Error ? error.message : String(error) }; }
  if (response.status === 404) return { status: "absent" };
  if (!response.ok) return { status: "http-error", httpStatus: response.status, error: oneLine(body) };
  const line = body.split(/\r?\n/u).find((entry) => entry.startsWith("tclkpaper1"));
  if (!line) return { status: "unparseable" };
  const record = decodePaperRecord(line);
  if (!record) return { status: "unparseable" };
  return { status: "present", record };
}

function readRecordRows(text) {
  const rows = [];
  let malformed = 0;
  let undecodable = 0;
  let invalidTimestamp = 0;
  for (const line of text.split(/\r?\n/u).filter((entry) => entry.trim())) {
    let message;
    try { message = JSON.parse(line); }
    catch { malformed += 1; continue; }
    if (!message || typeof message !== "object" || typeof message.text !== "string" || typeof message.ts !== "string") {
      malformed += 1;
      continue;
    }
    const timestampMs = Date.parse(message.ts);
    if (!Number.isFinite(timestampMs)) {
      invalidTimestamp += 1;
      continue;
    }
    if (!message.text.startsWith("tclk1 ")) continue;
    let frame;
    try { frame = decodeFrame(message.text); }
    catch { undecodable += 1; continue; }
    rows.push({ message, frame, timestampMs });
  }
  return { rows, malformed, undecodable, invalidTimestamp };
}

function foldSequential(rows) {
  const offers = new Map();
  const deals = new Map();
  for (const { message, frame, timestampMs } of rows) {
    const row = { message, frame, timestampMs };
    if (frame.type === "offer") {
      offers.set(frame.id, row);
      continue;
    }
    if (frame.type === "accept") {
      const offer = offers.get(frame.ref);
      if (!offer || deals.has(frame.contract)) continue;
      deals.set(frame.contract, { offer, accept: row, rows: [row] });
      continue;
    }
    if (frame.contract && deals.has(frame.contract)) deals.get(frame.contract).rows.push(row);
  }
  return deals;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  const base = baseUrl();
  const exportPath = `/r/${DEFAULT_ROOM}/export`;
  const exportText = await getText(`${base}${exportPath}`, `GET ${exportPath}`);
  const parsed = readRecordRows(exportText);
  const deals = foldSequential(parsed.rows);
  const past = [];
  for (const [contract, deal] of deals) {
    let state = openContract(deal.offer.frame);
    let lock = null;
    const senders = new Set();
    for (const { message, frame, timestampMs } of deal.rows) {
      const result = applyFrame(state, frame, timestampMs);
      state = result.state;
      if (typeof message.from === "string") senders.add(message.from);
      if (result.ok && frame.type === "lock") lock = frame;
    }
    if (state.status === "accepted" || state.status === "proposed") continue;
    past.push({ contract, status: state.status, lock, offer: deal.offer.frame, accept: deal.accept.frame, senders: [...senders], rows: deal.rows });
  }

  console.log(`board ${parsed.rows.length} decodable records | malformed rows: ${parsed.malformed} | undecodable frames: ${parsed.undecodable} | invalid timestamps: ${parsed.invalidTimestamp}`);
  console.log(`contracts past accepted: ${past.length}`);
  if (parsed.malformed || parsed.undecodable || parsed.invalidTimestamp) {
    console.error("WARNING: export contains records this released-package diagnostic could not fold; results are incomplete.");
  }

  const rows = [];
  let index = 0;
  for (const item of past) {
    const rail = await readPaper(base, item.contract);
    const paper = rail.status === "present" ? rail.record : null;
    const lock = item.lock;
    const refShape = !lock ? "no-lock-frame"
      : lock.ref === item.contract ? "contract-id"
      : /^paper-[0-9a-f]{12}$/u.test(String(lock.ref)) ? "paper-12hex"
      : "other";
    rows.push({
      contract: item.contract,
      status: item.status,
      rail: lock?.rail ?? null,
      ref: lock?.ref ?? null,
      refShape,
      railRecord: rail.status,
      funded: paper !== null,
      matches: paper ? paper.statement === item.accept.statement && paper.refundAfterMs === item.offer.refundAfterMs : null,
      railStatus: paper?.status ?? null,
      parties: item.senders,
      transportSignatures: item.rows.map(({ message }) => ({ seq: message.seq ?? null, present: typeof message.sig === "string" })),
    });
    await sleep(SLEEP_MS);
    index += 1;
    if (index % 40 === 0) console.log(`  ${index}/${past.length}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: { base, room: DEFAULT_ROOM, export: `${base}${exportPath}` },
    mode: "room-agnostic-structural-diagnostic",
    authenticatedTranscript: false,
    signatures: "presence-only; not verified by released npm 0.1.0",
    roomBinding: "not checked",
    venueMetadata: "seq/ts read from export and not signed",
    rail: "PaperRail note is world-writable and holds no value",
    boardRecords: parsed.rows.length,
    malformedExportRows: parsed.malformed,
    undecodableFrames: parsed.undecodable,
    invalidTimestamps: parsed.invalidTimestamp,
    incomplete: Boolean(parsed.malformed || parsed.undecodable || parsed.invalidTimestamp),
    contractsPastAccepted: rows.length,
    rows,
  };
  await writeFile(args.out, JSON.stringify(output, null, 1) + "\n", "utf8");
  console.log(`\nwrote ${args.out}`);
  console.log("This is a structural diagnostic only; it is not an authenticated transcript or payment audit.");
}

try {
  await run();
} catch (error) {
  console.error(`rail_audit.mjs: error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
