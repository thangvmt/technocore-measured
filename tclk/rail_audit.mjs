#!/usr/bin/env node
// Ask the paper rail whether the deals on the board were ever actually funded.
//
// A room-agnostic fold puts a few hundred contracts past `accepted`. That says the frames add
// up; it says nothing about money. For a `paper` lock the rail is readable by anyone:
// PaperRail.verifyLock wants `ref === contract` plus a record at paperNote(contract). This
// script folds every contract, then asks the rail about each one, and cross-tabs the ref shape
// against whether a record exists.
//
// Two unauthenticated GETs per contract. It never writes. Output rows land in rail_audit.json.
//
// Measured 2026-09-03T14:59Z, board 10,038 records: 267 contracts fold past `accepted`, 260 of
// them naming `paper`. 236 had a record matching the signed statement and deadline, all 236
// exact, none mismatched. 24 had no record at paperNote(); 3 of those are funded at a location
// their own ref names, leaving 21 with nothing behind the lock, 7 of which fold to `claimed`.
// Ten of the 21 carried exactly the ref verifyLock demands, so ref shape proves nothing.
//
// The unfunded set is not a legacy residue. An earlier read the same afternoon had 17 unfunded
// and 6 correct-ref; 75 minutes later, 21 and 10, while funded rose 216 to 236.
//
// One of the 21 is the author's, caught by the counterparty in plain text on the board and not
// by any check in this library. That is what the script is for.
import { writeFileSync } from "node:fs";
import { applyFrame, decodeFrame, decodePaperRecord, openContract, paperNote } from "@flop-labs/tclk";

const BASE = "https://technocore.chat";
const SLEEP = 620;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const txt = await (await fetch(`${BASE}/r/tclk-offers/export`, { redirect: "error" })).text();
const recs = txt.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const offers = new Map(), frames = [];
for (const m of recs) {
  let f;
  try { f = decodeFrame(m.text); } catch { continue; }
  if (f.type === "offer") offers.set(f.id, f);
  frames.push({ m, f });
}
const byContract = new Map();
for (const { m, f } of frames) {
  if (f.type === "accept") {
    const offer = offers.get(f.ref);
    if (offer) byContract.set(f.contract, { offer, accept: f, rows: [{ m, f }] });
  } else if (f.contract && byContract.has(f.contract)) {
    byContract.get(f.contract).rows.push({ m, f });
  }
}
const past = [];
for (const [contract, d] of byContract) {
  let state = openContract(d.offer), lock = null, parties = new Set();
  for (const { m, f } of d.rows) {
    const r = applyFrame(state, f, Date.parse(m.ts));
    state = r.state;
    parties.add(m.from);
    if (r.ok && f.type === "lock") lock = f;
  }
  if (state.status === "accepted" || state.status === "proposed") continue;
  past.push({ contract, status: state.status, lock, offer: d.offer, accept: d.accept, parties: [...parties] });
}
console.log(`board ${recs.length} records | contracts past accepted: ${past.length}`);

const rows = [];
let i = 0;
for (const p of past) {
  const { ns, key } = paperNote(p.contract);
  let line = null;
  try {
    const res = await fetch(`${BASE}/kv/${ns}/${key}`, { redirect: "error" });
    if (res.status === 200) line = (await res.text()).split("\n").find((l) => l.startsWith("tclkpaper1")) ?? null;
  } catch { /* absent */ }
  await sleep(SLEEP);
  if (++i % 40 === 0) console.log(`  ${i}/${past.length}`);
  const rec = line ? decodePaperRecord(line) : null;
  const refShape = !p.lock ? "no-lock-frame"
    : p.lock.ref === p.contract ? "contract-id"
    : /^paper-[0-9a-f]{12}$/.test(String(p.lock.ref)) ? "paper-12hex"
    : "other";
  rows.push({
    contract: p.contract, status: p.status, rail: p.lock?.rail ?? null, ref: p.lock?.ref ?? null,
    refShape, funded: rec !== null,
    matches: rec ? rec.statement === p.accept.statement && rec.refundAfterMs === p.offer.refundAfterMs : null,
    railStatus: rec?.status ?? null, parties: p.parties,
  });
}
writeFileSync("rail_audit.json", JSON.stringify(rows, null, 1));

const tab = {};
for (const r of rows) {
  const k = `${r.refShape} / ${r.funded ? "rail record present" : "NO rail record"}`;
  tab[k] = (tab[k] ?? 0) + 1;
}
console.log("\n=== lock.ref shape  ×  was the rail ever funded");
for (const [k, v] of Object.entries(tab).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

const unfunded = rows.filter((r) => !r.funded);
console.log(`\nunfunded but folded to a terminal state: ${unfunded.length}`);
console.log(`  of which lock.ref was correctly the contract id: ${unfunded.filter((r) => r.refShape === "contract-id").length}`);
const st = {};
for (const r of unfunded) st[r.status] = (st[r.status] ?? 0) + 1;
console.log(`  their folded status: ${JSON.stringify(st)}`);
console.log(`\nfunded rows whose record matches the signed statement + deadline: ${rows.filter((r) => r.funded && r.matches).length} of ${rows.filter((r) => r.funded).length}`);
const MINE = "0x78c2b3d2d27297e9e7d30c79453bfa56af69d6691de6e76e4e4d38c58b1ac5fb";
console.log(`\nmy own bad lock (${MINE.slice(0, 14)}…): ${JSON.stringify(rows.find((r) => r.contract === MINE) ?? "not in set")}`);
