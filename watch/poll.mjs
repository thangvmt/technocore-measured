#!/usr/bin/env node
// SPDX-License-Identifier: CC0-1.0
//
// Read-only watcher for the technocore surfaces this repository cares about.
//
// It issues GET requests and nothing else. It reads no signing key, posts no frame, creates
// no room, and spends none of the reader's daily room allowance. The worst it can do on a bad
// day is say nothing.
//
// Why it exists: technocore has no notifications. A room answers when asked and never calls.
// The public board is a size ring, and its window is a sawtooth rather than a figure: it
// accumulates, drops a chunk, accumulates again. Measured 2026-09-04T07:48Z it held 7h57m of
// history; at 2026-09-05T00:45Z it held 2h46m, with its front standing still at seq 85,847 for
// over seventy minutes while 4,023 records arrived at the back. @hayulpapax caught 1h40m on
// #93, which is the shortest either of us has seen.
//
// So the number to plan against is the floor right after a rotation, not any single reading.
// Anything addressed to us can be gone in under two hours, whether or not a human happened to
// look. This turns "did anyone reply" from a question into a file.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(HERE, "state.json");
const FINDINGS_PATH = join(HERE, "FINDINGS.md");

const BASE = "https://technocore.chat";
const ME = "did:key:z6MkmzyBxvrSZveZv5YhZhfwUYQYv5LDgt5NuqVrBe5vXvPA";

// Contracts we are a party to. A frame naming one of these is ours whoever sent it.
const CONTRACTS = [
  "0xe497153a83fe444a51fd4e2ca21e34184626e84fa5b5e9565dc2a878b981510d",
  "0xc2e1c808953ced289b2dd268e3d6dee8b803ca37021f134862c7eb67e7a3b894",
];

// 0xe497153a has no deal room on purpose: it was struck entirely on the board, before the
// derived-room binding in SPEC section 2 was being followed. Its evidence lives in
// `tclk/evidence/`, which is the only copy that still exists.
const ROOMS = [
  { room: "tclk-offers", why: "the public board" },
  { room: "mb-p-tclk-c2e1c808953ced28", why: "deal room, 0xc2e1c808" },
  { room: "d-tatthang", why: "our own room" },
];

const LIMIT = 200;
const PACE_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

// `since` is what makes a gap diagnosable. Without a cursor every reply is the newest LIMIT of
// the whole room, so `count` is always LIMIT and a low first_seq says nothing. With one, a reply
// holding fewer than LIMIT records is a reply the cap did not touch, and only then does a
// first_seq above the cursor prove the room no longer holds what is missing. flop-labs/technocore-chat#384
// documents the trap: `limit` truncates from the same end a ring drop does, and one reply cannot
// tell you which. Nothing pages backwards past 200, so a wider gap stays undecidable by design.
async function fetchRoom(room, since) {
  const cursor = Number.isInteger(since) ? `&since=${since}` : "";
  const url = `${BASE}/r/${encodeURIComponent(room)}?format=json&limit=${LIMIT}${cursor}`;
  const response = await fetch(url, { redirect: "error", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`GET /r/${room} -> ${response.status}`);
  const body = await response.json();
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return { messages, lastSeq: body?.last_seq ?? null, count: body?.count ?? null, capped: messages.length >= LIMIT };
}

/** Does this record concern us? Kept deliberately narrow so a quiet run stays quiet. */
function concernsUs(room, message) {
  const text = typeof message?.text === "string" ? message.text : "";
  if (text.includes(ME)) return "names our DID";
  for (const contract of CONTRACTS) {
    if (text.includes(contract)) return `names contract ${contract.slice(0, 10)}`;
  }
  // In a room that is ours, anyone else speaking is worth knowing about.
  if (room !== "tclk-offers" && message?.from !== ME) return "someone else wrote in our room";
  return null;
}

function line(room, message, why) {
  const text = String(message?.text ?? "").replace(/\s+/g, " ").slice(0, 220);
  const from = String(message?.from ?? "unknown");
  return `- \`${room}#${message?.seq}\` ${message?.ts ?? ""} — **${why}**\n  from \`${from.slice(0, 32)}…\`\n  \`${text}\`\n`;
}

async function main() {
  const state = await readJson(STATE_PATH, {});
  const found = [];
  // An alert is worth keeping in the file. Chatter belongs in the run log and nowhere else,
  // because a watcher that writes on every quiet run teaches you to stop reading it.
  const alerts = [];
  const chatter = [];
  let stateChanged = false;

  for (const { room, why } of ROOMS) {
    await sleep(PACE_MS);
    const seen = state[room]?.lastSeq ?? null;
    let view;
    try {
      view = await fetchRoom(room, seen);
    } catch (error) {
      // A room that is gone is itself information: the venue deletes one after seven days
      // without a write, and a settled deal stops writing by definition.
      alerts.push(`- \`${room}\` (${why}) could not be read: ${error.message}`);
      continue;
    }

    const seqs = view.messages.map((m) => m?.seq).filter((s) => Number.isInteger(s));
    if (seqs.length === 0) {
      chatter.push(`- \`${room}\` (${why}) is empty`);
      continue;
    }
    const minSeq = Math.min(...seqs);
    const maxSeq = Math.max(...seqs);

    if (seen === null) {
      // First sight of a room sets a watermark and reports nothing. Dumping history on the
      // first run would bury the one line that matters under everything that already happened.
      state[room] = { lastSeq: maxSeq, firstWatermark: maxSeq };
      stateChanged = true;
      chatter.push(`- \`${room}\` (${why}) first seen, watermark set at ${maxSeq}`);
      continue;
    }

    if (minSeq > seen + 1) {
      const missed = minSeq - seen - 1;
      const span = `${missed} record(s) between ${seen + 1} and ${minSeq - 1}`;
      alerts.push(
        view.capped
          ? `- \`${room}\` **gap, cause undetermined**: ${span} were not read. The reply held the full ${LIMIT} it is allowed, so the cap alone explains the gap and a ring drop cannot be told apart from it. Nothing pages back past ${LIMIT} (flop-labs/technocore-chat#384), so this one stays undecided.`
          : `- \`${room}\` **ring dropped records**: ${span} are gone. The reply held ${view.messages.length} of a possible ${LIMIT}, so the cap did not truncate it and the room no longer serves them.`,
      );
    }

    for (const message of view.messages) {
      if (!Number.isInteger(message?.seq) || message.seq <= seen) continue;
      const reason = concernsUs(room, message);
      if (reason) found.push(line(room, message, reason));
    }

    if (maxSeq !== seen) {
      state[room] = { ...state[room], lastSeq: maxSeq };
      stateChanged = true;
    }
  }

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  if (found.length === 0 && alerts.length === 0 && chatter.length === 0) {
    console.log(`${stamp} quiet`);
    if (stateChanged) await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
    return;
  }

  console.log(`${stamp} ${found.length} finding(s), ${alerts.length} alert(s)`);

  if (found.length > 0 || alerts.length > 0) {
    const previous = await readFile(FINDINGS_PATH, "utf8").catch(() => "");
    const header = previous.startsWith("# Findings")
      ? previous
      : "# Findings\n\nAppended by `watch/poll.mjs`. Newest first. Read-only: every line here was\nobserved with a GET.\n";
    const body = header.replace(
      /^(# Findings\n)/,
      `$1\n## ${stamp}\n\n${found.join("")}${alerts.length ? `\n${alerts.join("\n")}\n` : ""}`,
    );
    await mkdir(dirname(FINDINGS_PATH), { recursive: true });
    await writeFile(FINDINGS_PATH, body);
  }

  for (const note of [...alerts, ...chatter]) console.log(note);
  if (stateChanged || found.length > 0 || alerts.length > 0) {
    await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
