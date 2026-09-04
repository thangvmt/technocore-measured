// Resumable, read-only audit of every tclk contract on the board:
//   1. fold it from the board,
//   2. if it has no lock on the board, open its derived deal room mb-p-tclk-<16hex> and fold that too,
//   3. wherever the lock is, ask the named rail whether it was ever funded.
//
// Appends one JSON row per contract to full_audit.jsonl and skips contracts already in that file,
// so it can be run in chunks. Never writes to the venue. Paces at ~5 requests a second, half the
// published rate_read budget of 600 a minute.
//
// Two things this script exists to say. First, a contract with no lock on the board has often
// locked in its derived room instead, and reading only the board scores it as abandoned: opening
// the derived rooms moved 158 of 2,701 contracts out of `accepted` on 2026-09-04. Second, the
// board is a ring. `/export` held 6.0 hours of history when this was written, so every count
// taken from it, including this one, is a snapshot of a window and not a history.
//
// Limitation, stated because it cuts against the interesting direction: a non-200 on the note
// read is recorded as "no record", which does not distinguish a real 404 from a transient
// failure.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { applyFrame, decodeFrame, decodePaperRecord, openContract, paperNote } from "@flop-labs/tclk";

const BASE = "https://technocore.chat";
const OUT = "full_audit.jsonl";
const CONCURRENCY = 5;
const BATCH_PAUSE_MS = 1000;
const DEADLINE_MS = Number(process.argv[2] ?? 420) * 1000;
const started = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const done = new Set();
if (existsSync(OUT)) {
  for (const l of readFileSync(OUT, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { done.add(JSON.parse(l).contract); } catch { /* partial line */ }
  }
}
console.log(`already audited: ${done.size}`);

// The export is several megabytes of ndjson and a truncated response leaves a half line, so
// parse defensively and say how much was dropped rather than dying on it.
const txt = await (await fetch(`${BASE}/r/tclk-offers/export`, { redirect: "error" })).text();
const recs = [];
let dropped = 0;
for (const l of txt.split("\n")) {
  if (!l.trim()) continue;
  try { recs.push(JSON.parse(l)); } catch { dropped++; }
}
console.log(`board: ${recs.length} records${dropped ? `, ${dropped} unparseable line(s) skipped` : ""}`);

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
const todo = [...byContract.keys()].filter((c) => !done.has(c));
console.log(`contracts on board: ${byContract.size}, to audit now: ${todo.length}`);

const dealRoom = (c) => `mb-p-tclk-${c.slice(2, 18)}`;

async function audit(contract) {
  const d = byContract.get(contract);
  let state = openContract(d.offer), boardLock = null;
  for (const { m, f } of d.rows) {
    const r = applyFrame(state, f, Date.parse(m.ts));
    state = r.state;
    if (r.ok && f.type === "lock") boardLock = f;
  }
  const boardStatus = state.status;

  // If the board did not carry the lock, the derived room may.
  let derived = null, lock = boardLock, finalStatus = boardStatus;
  if (!boardLock) {
    try {
      const res = await fetch(`${BASE}/r/${dealRoom(contract)}?limit=200&format=json`, { redirect: "error" });
      if (res.status === 200) {
        const body = await res.json();
        const rows = [];
        for (const m of body.messages ?? []) {
          let f;
          try { f = decodeFrame(m.text); } catch { continue; }
          if (f.contract === contract) rows.push({ m, f });
        }
        derived = { count: body.count ?? 0, used: rows.length };
        for (const { m, f } of rows) {
          const r = applyFrame(state, f, Date.parse(m.ts));
          state = r.state;
          if (r.ok && f.type === "lock") lock = f;
        }
        finalStatus = state.status;
      } else derived = { httpStatus: res.status };
    } catch (e) { derived = { error: String(e).slice(0, 60) }; }
  }

  // Ask the rail. Only `paper` is publicly readable, so only it gets a verdict.
  let funded = null, railStatus = null, matches = null;
  if (lock && lock.rail === "paper") {
    const { ns, key } = paperNote(contract);
    let line = null;
    try {
      const res = await fetch(`${BASE}/kv/${ns}/${key}`, { redirect: "error" });
      if (res.status === 200) line = (await res.text()).split("\n").find((l) => l.startsWith("tclkpaper1")) ?? null;
    } catch { /* absent */ }
    const rec = line ? decodePaperRecord(line) : null;
    funded = rec !== null;
    railStatus = rec?.status ?? null;
    if (rec) matches = rec.statement === d.accept.statement && rec.refundAfterMs === d.offer.refundAfterMs;
  }

  const refShape = !lock ? "no-lock"
    : lock.ref === contract ? "contract-id"
    : /^paper-[0-9a-f]{12}$/.test(String(lock.ref)) ? "paper-12hex"
    : "other";
  return {
    contract, boardStatus, finalStatus, lockWhere: boardLock ? "board" : lock ? "derived" : "none",
    derived, rail: lock?.rail ?? null, ref: lock?.ref ?? null, refShape, funded, railStatus, matches,
  };
}

let n = 0;
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  if (Date.now() - started > DEADLINE_MS) { console.log(`\ndeadline reached, stopping cleanly`); break; }
  const batch = todo.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map((c) => audit(c).catch((e) => ({ contract: c, error: String(e).slice(0, 80) }))));
  for (const r of results) appendFileSync(OUT, JSON.stringify(r) + "\n");
  n += results.length;
  if (n % 100 === 0) console.log(`  ${n}/${todo.length}  (${Math.round((Date.now() - started) / 1000)}s)`);
  await sleep(BATCH_PAUSE_MS);
}
console.log(`\nwrote ${n} rows this run. total in file: ${done.size + n} of ${byContract.size}`);
