import { randomBytes } from "node:crypto";
import { MemoryRail, applyFrame, generateHashLock, lockTerms, makeAccept, makeOffer,
         openContract, encodeFrame } from "@flop-labs/tclk";
const now = Date.now();
const payer = "did:key:z6Mk" + "A".repeat(44), payee = "did:key:z6Mk" + "B".repeat(44);
const offer = makeOffer({ from: payer, role: "payer", amount: "1000000", asset: "PAPER",
  lock: "hash", rails: ["memory"], expiresMs: now + 6e5, claimByMs: now + 12e5,
  refundAfterMs: now + 18e5, nonce: randomBytes(8).toString("hex") });
const lock = generateHashLock();
const accept = makeAccept(offer, { from: payee, statement: lock.hash });
let st = openContract(offer);
const step = (f, label) => { const r = applyFrame(st, f, Date.now());
  st = r.state; console.log(`   ${label.padEnd(8)} ok=${r.ok}  -> ${st.status}${r.reason ? "  (" + r.reason + ")" : ""}`); };
console.log("   offer bytes on the wire:", encodeFrame(offer).length);
console.log("   contract:", accept.contract.slice(0, 26) + "…");
step(accept, "accept");
const rail = new MemoryRail();
const terms = lockTerms(st);
const ref = await rail.lock(terms);
console.log(`   rail lock ref=${ref}  verifyLock=${await rail.verifyLock(terms, ref)}`);
step({ type: "lock", from: payer, contract: st.contract, rail: "memory", ref }, "lock");
await rail.claim(ref, lock.preimage);
step({ type: "reveal", from: payee, contract: st.contract, secret: lock.preimage }, "reveal");
step({ type: "receipt", from: payer, contract: st.contract, outcome: "claimed" }, "receipt");
console.log("   FINAL:", st.status, "| secret matches statement:", st.secret === lock.preimage);
