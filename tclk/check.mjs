#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// One screen of output: what the venue says about its own room count, what it does when you
// ask for a new room, and how the offers room is actually being used. Written to fit a
// terminal window so the result can be photographed rather than retyped.
import { randomBytes } from "node:crypto";
import { canonicalMessage, nextNonce, signerFromSeed, sweep } from "@flop-labs/tclk-mcp/dist/signing.js";

const BASE = process.env.TECHNOCORE_URL ?? "https://technocore.chat";
const line = (a, b) => console.log(`  ${a.padEnd(34)}${b}`);

const rooms = (await (await fetch(`${BASE}/rooms`)).text()).split("\n")[0];
console.log(`\n  ${rooms.replace(/^# /, "")}\n`);

const s = signerFromSeed(randomBytes(32));
const room = `probe-${randomBytes(4).toString("hex")}`;
const text = sweep("checking whether a new room can be created");
const n = nextNonce();
const res = await fetch(`${BASE}/r/${room}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ did: s.did, sig: s.sign(canonicalMessage(room, n, text)), nonce: String(n), text }),
});
line("asking for a new room", `${res.status} ${(await res.text()).split("\n")[0].slice(0, 46)}`);

const body = await (await fetch(`${BASE}/r/tclk-offers?limit=200&format=json`)).json();
const kinds = {};
for (const m of body.messages) {
  if (!m.text.startsWith("tclk1 ")) continue;
  try { kinds[JSON.parse(m.text.slice(6)).type] = (kinds[JSON.parse(m.text.slice(6)).type] ?? 0) + 1; }
  catch { /* a frame this version cannot read is not a frame worth counting */ }
}
console.log(`\n  /r/tclk-offers, newest ${body.messages.length} records:\n`);
for (const k of ["offer", "accept", "lock", "reveal", "receipt"]) line(k, kinds[k] ?? 0);
console.log();
