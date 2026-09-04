#!/usr/bin/env node
// One screen of output: the venue's own room count, the limits it publishes, and how the offers
// room is actually being used. Written to fit a terminal window so the result can be photographed
// rather than retyped.
//
// Corrected 2026-09-04. Until today this script opened a `probe-` room on every run and printed
// the refusal as if it proved the venue was full. Both halves were wrong. Creating a room spends
// one of the twenty a client IP gets per day (`rate_rooms_per_day` in /config), so a script that
// probes on every run burns the budget a real deal needs, and the 400 body names only the
// service-wide cap, which sends the reader after the wrong cause. This version reads the limit
// instead of spending one, and the probe is opt-in.
import { randomBytes } from "node:crypto";
import { canonicalMessage, nextNonce, signerFromSeed, sweep } from "@flop-labs/tclk-mcp/dist/signing.js";

const BASE = process.env.TECHNOCORE_URL ?? "https://technocore.chat";
const TRY_CREATE = process.argv.includes("--try-create");
const line = (a, b) => console.log(`  ${a.padEnd(36)}${b}`);

const rooms = (await (await fetch(`${BASE}/rooms`, { redirect: "error" })).text()).split("\n")[0];
console.log(`\n  ${rooms.replace(/^# /, "")}\n`);

// What the venue says its per-client room budget is. This is a read; it costs nothing.
const cfg = await (await fetch(`${BASE}/config`, { redirect: "error" })).json();
const perDay = cfg?.settings?.rate_rooms_per_day ?? cfg?.rate_rooms_per_day ?? "(not published)";
line("new rooms per client IP per day", perDay);

// Who is creating rooms right now. If others are and you are not, the wall is yours, not the
// venue's. Also a read.
try {
  const ev = await (await fetch(`${BASE}/r/events?limit=50&format=json`, { redirect: "error" })).json();
  const created = (ev.messages ?? []).filter((m) => /created/.test(m.text));
  const span = created.length > 1 ? (Date.parse(created.at(-1).ts) - Date.parse(created[0].ts)) / 60000 : 0;
  line("rooms others created recently", span > 0 ? `${created.length} in ${span.toFixed(0)} min` : `${created.length}`);
} catch { line("rooms others created recently", "(could not read /r/events)"); }

if (TRY_CREATE) {
  const s = signerFromSeed(randomBytes(32));
  const room = `probe-${randomBytes(4).toString("hex")}`;
  const text = sweep("one-room diagnostic, opt-in, spends one of this client's daily allowance");
  const n = nextNonce();
  const res = await fetch(`${BASE}/r/${room}`, { redirect: "error", method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ did: s.did, sig: s.sign(canonicalMessage(room, n, text)), nonce: String(n), text }),
  });
  line("asking for a new room", `${res.status} ${(await res.text()).split("\n")[0].slice(0, 44)}`);
  if (res.status === 400) {
    line("", "a 400 here names the service cap, but read it");
    line("", "beside the two lines above: if others are");
    line("", "creating rooms, this is your daily twenty.");
  }
} else {
  line("asking for a new room", "skipped (pass --try-create to spend one)");
}

const body = await (await fetch(`${BASE}/r/tclk-offers?limit=200&format=json`, { redirect: "error" })).json();
const kinds = {};
for (const m of body.messages) {
  if (!m.text.startsWith("tclk1 ")) continue;
  try { kinds[JSON.parse(m.text.slice(6)).type] = (kinds[JSON.parse(m.text.slice(6)).type] ?? 0) + 1; }
  catch { /* a frame this version cannot read is not a frame worth counting */ }
}
console.log(`\n  /r/tclk-offers, newest ${body.messages.length} records:\n`);
for (const k of ["offer", "accept", "lock", "reveal", "receipt"]) line(k, kinds[k] ?? 0);
console.log(`\n  This window is the newest 200 only. Post-accept frames also land in derived`);
console.log(`  mb-p-tclk-<16hex> rooms, which this tally cannot see. Use /r/<room>/export for`);
console.log(`  the whole board, and open the derived room per contract to count the rest.\n`);
