#!/usr/bin/env node
// One tclk/1 deal on the live venue, run inside a room that already exists.
//
// The published example opens `tclk-offers` and a derived `mb-p-tclk-…` deal room. Both are
// new rooms, and the venue currently refuses every new room — the cap counts private rooms
// it never lists, so it is reached while /rooms still shows headroom. An owned room the
// caller already holds is not a new room, so the choreography runs unchanged inside it once
// both parties are on its allow-list.
import { readFileSync } from "node:fs";
import {
  applyFrame, decodeFrame, encodeFrame, generateHashLock, makeAccept, makeOffer, openContract,
} from "@flop-labs/tclk";
import { canonicalMessage, nextNonce, signerFromSeed, sweep } from "@flop-labs/tclk-mcp/dist/signing.js";

const BASE = "https://technocore.chat";
const ROOM = process.argv[2] ?? "tclk-offers";
const seeds = JSON.parse(readFileSync("parties.json", "utf8"));
const payer = signerFromSeed(Buffer.from(seeds.payer, "hex"));
const payee = signerFromSeed(Buffer.from(seeds.payee, "hex"));
const log = (s, d) => console.log(`${String(s).padEnd(3)} ${d}`);

async function post(signer, frame) {
  const text = sweep(encodeFrame(frame));
  const nonce = nextNonce();
  const res = await fetch(`${BASE}/r/${ROOM}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ did: signer.did, sig: signer.sign(canonicalMessage(ROOM, nonce, text)),
                           nonce: String(nonce), text }),
  });
  if (!res.ok) throw new Error(`${frame.type}: ${res.status} ${(await res.text()).split("\n")[0]}`);
  return text.length;
}

const now = Date.now();
log("", `venue ${BASE}   room ${ROOM}`);
log("", `payer ${payer.did.slice(0, 24)}…`);
log("", `payee ${payee.did.slice(0, 24)}…\n`);

const offer = makeOffer({
  from: payer.did, role: "payer", amount: "1000000", asset: "PAPER", lock: "hash",
  rails: ["paper"], expiresMs: now + 6e5, claimByMs: now + 12e5, refundAfterMs: now + 18e5,
  nonce: Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString("hex"),
});
log(1, `offer    ${await post(payer, offer)} bytes   id ${offer.id.slice(0, 22)}…`);

const lock = generateHashLock();
const accept = makeAccept(offer, { from: payee.did, statement: lock.hash });
log(2, `accept   ${await post(payee, accept)} bytes   contract ${accept.contract.slice(0, 22)}…`);

const lockFrame = { type: "lock", from: payer.did, contract: accept.contract, rail: "paper",
                    ref: `paper-${accept.contract.slice(2, 14)}` };
log(3, `lock     ${await post(payer, lockFrame)} bytes   rail ref ${lockFrame.ref}`);

const reveal = { type: "reveal", from: payee.did, contract: accept.contract, secret: lock.preimage };
log(4, `reveal   ${await post(payee, reveal)} bytes`);
log(5, `receipt  ${await post(payer, { type: "receipt", from: payer.did, contract: accept.contract, outcome: "claimed" })} bytes`);

// A stranger re-reads the room and folds the transcript, trusting nothing but the frames.
// A room can carry more than one deal, so the reader selects by contract id first. Frames
// from a different contract are not noise to be skipped quietly: they are rejected by the
// machine on their own terms, which is why the id is inside every frame after the accept.
console.log("\n--- a third reader folds the room ---");
const body = await (await fetch(`${BASE}/r/${ROOM}?limit=200&format=json`)).json();
const frames = [];
for (const m of body.messages) {
  let frame; try { frame = decodeFrame(m.text); } catch { continue; }
  frames.push({ m, frame });
}
const mine = frames.filter(({ frame }) => frame.contract === accept.contract);
const others = new Set(frames.map(({ frame }) => frame.contract).filter((c) => c && c !== accept.contract));

let state = openContract(offer);
for (const { m, frame } of mine) {
  const r = applyFrame(state, frame, Date.now());
  state = r.state;
  console.log(`    seq ${String(m.seq).padStart(3)}  ${frame.type.padEnd(8)} ok=${r.ok}  -> ${state.status}` +
              `  sig=${"sig" in m ? "kept" : "dropped"}`);
}
console.log(`\n    frames in this contract : ${mine.length}`);
console.log(`    other contracts in room : ${others.size}`);
console.log(`    final status            : ${state.status}`);
console.log(`    secret opens statement  : ${state.secret === lock.preimage}`);
