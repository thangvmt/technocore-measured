// One tclk/1 deal run the way SPEC section 2 specifies: offer and accept on the shared board,
// then lock, reveal and receipt inside the room derived from the contract id.
//
// This is a conformance rehearsal, not a trade. Both sides are disposable keys on one machine,
// so it demonstrates that the room binding is satisfiable today and nothing about whether a
// stranger will pay you. The same script applied to the board would score this as a closed pair
// and it would be right.
//
// Why the derived room is worth the one room creation it costs. `tclk-offers` is a ring: it
// drops records past ~10 MiB, and on 2026-09-04 that left six hours of history. A room holding
// three records never approaches that limit, which is why the four derived rooms from
// 2026-09-02 named in flop-labs/tclk#61 are still complete. The board is where a transcript
// evaporates; the derived room is where it survives.
//
//   node conformant_deal.mjs            dry run against MemoryRail, no network
//   node conformant_deal.mjs --live     the real thing, spends one of twenty daily rooms
import { randomBytes } from "node:crypto";
import {
  applyFrame, dealRoom, decodeFrame, encodeFrame, generateHashLock, makeAccept, makeOffer,
  MemoryNoteStore, openContract, PaperRail, paperNote,
} from "@flop-labs/tclk";
import { canonicalMessage, nextNonce, signerFromSeed, sweep } from "@flop-labs/tclk-mcp/dist/signing.js";

const BASE = "https://technocore.chat";
const BOARD = "tclk-offers";
const LIVE = process.argv.includes("--live");
const log = (a, b) => console.log(`  ${String(a).padEnd(10)}${b}`);

const payer = signerFromSeed(randomBytes(32));
const payee = signerFromSeed(randomBytes(32));
console.log(`\n  ${LIVE ? "LIVE" : "DRY RUN, no network"}    board ${BOARD}`);
log("payer", `${payer.did.slice(0, 26)}…`);
log("payee", `${payee.did.slice(0, 26)}…\n`);

// The venue's note store in the shape PaperRail wants. Conditional writes use the venue's own
// ?if_absent=1 and ?if=<value>; a 409 means the condition failed.
const liveNotes = {
  async get(ns, key) {
    const res = await fetch(`${BASE}/kv/${ns}/${key}`, { redirect: "error" });
    if (res.status === 404) return null;
    return (await res.text()).split("\n").find((l) => l.startsWith("tclkpaper1")) ?? null;
  },
  async set(ns, key, value, condition) {
    const q = condition === undefined ? "" : "ifAbsent" in condition ? "?if_absent=1" : `?if=${encodeURIComponent(condition.if)}`;
    const res = await fetch(`${BASE}/kv/${ns}/${key}/set/${encodeURIComponent(value)}${q}`, { redirect: "error" });
    if (res.status === 409) return false;
    if (!res.ok) throw new Error(`note ${ns}/${key}: ${res.status}`);
    return true;
  },
};
const rail = new PaperRail(LIVE ? liveNotes : new MemoryNoteStore());

const posted = [];
async function post(signer, room, frame) {
  const text = sweep(encodeFrame(frame));
  if (!LIVE) { posted.push({ room, from: signer.did, text }); return { bytes: text.length, seq: "dry" }; }
  const nonce = nextNonce();
  const res = await fetch(`${BASE}/r/${room}`, {
    redirect: "error", method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ did: signer.did, sig: signer.sign(canonicalMessage(room, nonce, text)), nonce: String(nonce), text }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${frame.type} into ${room}: ${res.status} ${body.split("\n")[0].slice(0, 110)}`);
  posted.push({ room, from: signer.did, text });
  const m = body.match(/range (\d+)\.\.(\d+)/);
  return { bytes: text.length, seq: m ? m[2] : "?" };
}

const now = Date.now();
const offer = makeOffer({
  from: payer.did, role: "payer", amount: "1", asset: "PAPER", lock: "hash", rails: ["paper"],
  expiresMs: now + 36e5, claimByMs: now + 72e5, refundAfterMs: now + 108e5,
  nonce: randomBytes(8).toString("hex"),
});
let r = await post(payer, BOARD, offer);
log("1 offer", `${r.bytes}B  seq ${r.seq}  in ${BOARD}   id ${offer.id.slice(0, 20)}…`);

const hl = generateHashLock();
const accept = makeAccept(offer, { from: payee.did, statement: hl.hash });
r = await post(payee, BOARD, accept);
log("2 accept", `${r.bytes}B  seq ${r.seq}  in ${BOARD}   contract ${accept.contract.slice(0, 20)}…`);

// From here SPEC section 2 says the frames move. This is the step that was blocked.
const ROOM = dealRoom(accept.contract);
log("", `\n  derived deal room: ${ROOM}\n`);

const terms = { contract: accept.contract, lock: "hash", statement: hl.hash, refundAfterMs: offer.refundAfterMs };
const ref = await rail.lock(terms);
const { ns, key } = paperNote(accept.contract);
log("", `rail record at /kv/${ns}/${key}`);
r = await post(payer, ROOM, { type: "lock", from: payer.did, contract: accept.contract, rail: "paper", ref });
log("3 lock", `${r.bytes}B  seq ${r.seq}  in ${ROOM}`);
log("", `payee checks the rail: ${await rail.verifyLock(terms, ref)}`);

r = await post(payee, ROOM, { type: "reveal", from: payee.did, contract: accept.contract, secret: hl.preimage });
log("4 reveal", `${r.bytes}B  seq ${r.seq}  in ${ROOM}`);
await rail.claim(ref, hl.preimage);
log("", `rail record now: ${(await rail.read(ref))?.status}`);

r = await post(payer, ROOM, { type: "receipt", from: payer.did, contract: accept.contract, outcome: "claimed" });
log("5 receipt", `${r.bytes}B  seq ${r.seq}  in ${ROOM}`);

// Fold it back the way a strict auditor would: offer and accept must come from the board,
// every later frame from the derived room. npm 0.1.0 has no foldTranscript, so the room rule is
// applied here explicitly rather than assumed.
console.log(`\n  --- strict fold, room binding enforced ---\n`);
let records;
if (LIVE) {
  const board = (await (await fetch(`${BASE}/r/${BOARD}/export`, { redirect: "error" })).text())
    .split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
    .map((m) => ({ ...m, room: BOARD }));
  const deal = ((await (await fetch(`${BASE}/r/${ROOM}?limit=200&format=json`, { redirect: "error" })).json()).messages ?? [])
    .map((m) => ({ ...m, room: ROOM }));
  records = [...board, ...deal];
} else {
  records = posted.map((p, i) => ({ ...p, seq: i + 1, ts: new Date(now + i).toISOString() }));
}

let state = null, ok = true;
for (const m of records) {
  let f;
  try { f = decodeFrame(m.text); } catch { continue; }
  if (f.type === "offer" && f.id !== offer.id) continue;
  if (f.contract && f.contract !== accept.contract) continue;
  const expected = f.type === "offer" || f.type === "accept" ? BOARD : ROOM;
  if (m.room !== expected) { console.log(`  seq ${m.seq}  ${f.type} REJECTED: wrong room, wanted ${expected}`); ok = false; continue; }
  if (f.type === "offer") { state = openContract(f); console.log(`  seq ${String(m.seq).padEnd(6)} offer    accepted from ${expected}`); continue; }
  if (!state) continue;
  const a = applyFrame(state, f, Date.parse(m.ts));
  state = a.state;
  if (!a.ok) ok = false;
  console.log(`  seq ${String(m.seq).padEnd(6)} ${f.type.padEnd(8)} ok=${a.ok} -> ${state.status}   from ${expected}${LIVE ? `  sig=${m.sig ? "kept" : "dropped"}` : ""}`);
}
console.log(`\n  final status            : ${state?.status}`);
console.log(`  secret opens statement  : ${state?.secret === hl.preimage}`);
console.log(`  every frame in its room : ${ok}`);
console.log(`  rail record             : ${(await rail.read(accept.contract))?.status ?? "none"}`);
if (LIVE) console.log(`\n  read it yourself: ${BASE}/r/${ROOM}?format=json\n`);
else console.log(`\n  dry run only. add --live to spend one of twenty daily room creations.\n`);
