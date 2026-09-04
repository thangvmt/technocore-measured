#!/usr/bin/env node
// SPDX-License-Identifier: CC0-1.0
//
// The body of a tclk agent. One pass per invocation: read the venue, notice what concerns us,
// decide, act. Three of those four steps are implemented; `decide` needs a model and `act`
// needs a signing key, and neither is present on this host yet.
//
// Written so that arriving at the FLOP testnet is a configuration change rather than a rewrite:
//   read   — implemented, GET only
//   notice — implemented
//   decide — behind model.mjs, provider "none" today
//   act    — behind the policy gate, and unimplementable here because there is no key
//
// It holds no key. It posts nothing. On this host that is not a setting, it is a fact about
// what the host contains.

import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createModel } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, "state");
const STATE_PATH = join(STATE_DIR, "state.json");
const FINDINGS_PATH = join(STATE_DIR, "findings.md");
const PACE_MS = 1000;
const LIMIT = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

// ─── read ──────────────────────────────────────────────────────────────────────────────────

// The venue answers 503 often enough that a single attempt is not a reading. Retry only what
// is transient: a 429 means slow down and a 5xx means the venue, not the request. Anything
// else is our fault and retrying it just repeats a mistake at a slower rate.
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const MAX_TRIES = 4;

async function readRoom(base, room) {
  const url = `${base}/r/${encodeURIComponent(room)}?format=json&limit=${LIMIT}`;
  let lastReason = "unknown";
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    let response;
    try {
      response = await fetch(url, { redirect: "error", headers: { accept: "application/json" } });
    } catch (error) {
      lastReason = `network: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    if (response.ok) {
      const body = await response.json();
      return Array.isArray(body?.messages) ? body.messages : [];
    }
    lastReason = `HTTP ${response.status}`;
    if (!TRANSIENT.has(response.status)) break;
  }
  throw new Error(`GET /r/${room} -> ${lastReason} after ${MAX_TRIES} tries`);
}

// ─── notice ────────────────────────────────────────────────────────────────────────────────

function concerns(config, room, message) {
  const text = typeof message?.text === "string" ? message.text : "";
  if (text.includes(config.did)) return "names our DID";
  for (const contract of config.contracts) {
    if (text.includes(contract)) return `names contract ${contract.slice(0, 10)}`;
  }
  if (room !== "tclk-offers" && message?.from !== config.did) return "someone else wrote in our room";
  return null;
}

// ─── act ───────────────────────────────────────────────────────────────────────────────────

function actionsAllowed(policy) {
  return Object.entries(policy)
    .filter(([key, value]) => key !== "note" && value === true)
    .map(([key]) => key);
}

// ─── the pass ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const config = await readJson(join(HERE, "config.json"), null);
  if (config === null) throw new Error("config.json is missing or unparseable");

  const model = createModel(config.model);
  const allowed = actionsAllowed(config.policy);
  const state = await readJson(STATE_PATH, {});
  await mkdir(STATE_DIR, { recursive: true });

  const noticed = [];
  const alerts = [];
  let stateChanged = false;

  for (const { room, why } of config.rooms) {
    await sleep(PACE_MS);
    let messages;
    try {
      messages = await readRoom(config.base, room);
    } catch (error) {
      // A room that cannot be read is itself a signal: the venue deletes one after seven days
      // with no write, and a settled deal stops writing by definition.
      //
      // But say it once, not every five minutes. A watcher that repeats the same line 288
      // times a day teaches the person reading it to stop reading it, which costs more than
      // the missing alert would have. First failure speaks, then once an hour.
      const failing = (state[room]?.failing ?? 0) + 1;
      state[room] = { ...state[room], failing };
      stateChanged = true;
      if (failing === 1) {
        alerts.push(`\`${room}\` (${why}) unreadable: ${error.message}`);
      } else if (failing % 12 === 0) {
        alerts.push(`\`${room}\` (${why}) still unreadable after ${failing} passes: ${error.message}`);
      }
      continue;
    }
    if (state[room]?.failing) {
      alerts.push(`\`${room}\` (${why}) readable again after ${state[room].failing} failed pass(es)`);
      state[room] = { ...state[room], failing: 0 };
      stateChanged = true;
    }

    const seqs = messages.map((m) => m?.seq).filter(Number.isInteger);
    if (seqs.length === 0) continue;
    const minSeq = Math.min(...seqs);
    const maxSeq = Math.max(...seqs);
    const seen = state[room]?.lastSeq ?? null;

    if (seen === null) {
      state[room] = { lastSeq: maxSeq };
      stateChanged = true;
      continue;
    }

    if (minSeq > seen + 1) {
      alerts.push(
        `\`${room}\` window moved past us: ${minSeq - seen - 1} record(s) evicted between runs`,
      );
    }

    for (const message of messages) {
      if (!Number.isInteger(message?.seq) || message.seq <= seen) continue;
      const reason = concerns(config, room, message);
      if (reason) noticed.push({ room, seq: message.seq, ts: message.ts, from: message.from, text: String(message.text ?? "").slice(0, 400), reason });
    }

    if (maxSeq !== seen) {
      state[room] = { ...state[room], lastSeq: maxSeq };
      stateChanged = true;
    }
  }

  // ── decide ──
  // Every noticed record gets put to the model, and today every answer is a refusal. That is
  // the point of running it anyway: the path from "something happened" to "we asked" is
  // exercised on every quiet day, so it is not first exercised on the day it matters.
  const decisions = [];
  for (const item of noticed) {
    const answer = await model.ask({ kind: "record", item });
    decisions.push({ item, answer });
  }

  const undecided = decisions.filter((d) => !d.answer.ok);

  if (noticed.length > 0 || alerts.length > 0) {
    const lines = [`\n## ${stamp()}\n`];
    for (const { item, answer } of decisions) {
      lines.push(
        `- \`${item.room}#${item.seq}\` ${item.ts ?? ""} — **${item.reason}**\n` +
          `  from \`${String(item.from).slice(0, 32)}…\`\n` +
          `  \`${item.text.replace(/\s+/g, " ")}\`\n` +
          `  decision: ${answer.ok ? "taken" : `none (${answer.reason})`}\n`,
      );
    }
    for (const alert of alerts) lines.push(`- ALERT ${alert}\n`);
    await appendFile(FINDINGS_PATH, lines.join(""));
  }

  if (stateChanged) await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);

  console.log(
    `${stamp()} noticed=${noticed.length} alerts=${alerts.length} undecided=${undecided.length} ` +
      `model=${model.provider}(${model.configured ? "ready" : "unconfigured"}) allowed=[${allowed.join(",") || "nothing"}]`,
  );
}

main().catch((error) => {
  console.error(`${stamp()} FAILED ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
