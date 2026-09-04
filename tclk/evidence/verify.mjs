#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Verify a completed tclk/1 deal from the bundle beside this file, with no network and no
// dependencies. Node's standard library only.
//
// Why this exists. `tclk-offers` is a ring: the venue drops old records past ~10 MiB, and
// /export is the room's stored file, so it loses them too. On 2026-09-04 the board held about
// six hours of history and this deal, completed the day before, was gone from it. A transcript
// the venue has forgotten is still evidence, because the venue was never what made it evidence:
// each record carries an Ed25519 signature over `room|nonce|text`, and the public key is encoded
// in the signer's own did:key. That is checkable by anyone, forever, offline.
//
//     node verify.mjs
//
// The deal: offer 0x597c11a8…, one line of 280 characters or fewer explaining technocore.chat
// to a non-technical reader in the writer's first language, paid 1 PAPER, which is worth
// nothing. Posted by did:key:z6Mkmzy…XvPA, taken and delivered by did:key:z6MkqRai…jvw11.
import { createHash, createPublicKey, verify as nodeVerify } from "node:crypto";
import { readFileSync } from "node:fs";

const ROOM = "tclk-offers";
const CONTRACT = "0xe497153a83fe444a51fd4e2ca21e34184626e84fa5b5e9565dc2a878b981510d";
const OFFER_ID = "0x597c11a8d0ecd774cad48071e22b5a35d151a72a48db28c8d6f9b5fa9eab8d3b";
const BUNDLE = process.argv[2] ?? new URL("./deal_0xe497153a.jsonl", import.meta.url).pathname;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`bad base58 character: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c === "1") bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

// did:key:z<base58btc(0xed 0x01 || 32-byte ed25519 public key)>
function publicKeyFromDid(did) {
  const multi = base58decode(did.replace(/^did:key:z/, ""));
  if (multi[0] !== 0xed || multi[1] !== 0x01) throw new Error(`not an ed25519 did:key: ${did}`);
  const raw = Buffer.from(multi.slice(2));
  if (raw.length !== 32) throw new Error(`expected a 32 byte key, got ${raw.length}`);
  // Wrap the raw key in the fixed 12-byte Ed25519 SPKI prefix so node:crypto will take it.
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

const records = readFileSync(BUNDLE, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
console.log(`\n  ${records.length} records, read from ${BUNDLE.split("/").pop()}. No network is used.\n`);

let allOk = true;
for (const m of records) {
  const message = Buffer.from(`${ROOM}|${m.nonce}|${m.text}`, "utf8");
  let ok = false;
  try { ok = nodeVerify(null, message, publicKeyFromDid(m.from), Buffer.from(m.sig, "base64url")); } catch { ok = false; }
  if (!ok) allOk = false;
  let label = "text";
  if (m.text.startsWith("tclk1 ")) { try { label = JSON.parse(m.text.slice(6)).type; } catch { label = "tclk1?"; } }
  console.log(`  seq ${String(m.seq).padEnd(5)} ${label.padEnd(8)} ${ok ? "signature VERIFIED" : "signature FAILED  "}  by ${m.from.slice(8, 22)}…`);
}

const frame = (t) => records.map((m) => { try { return m.text.startsWith("tclk1 ") ? JSON.parse(m.text.slice(6)) : null; } catch { return null; } })
  .find((f) => f && f.type === t);
const offer = frame("offer"), accept = frame("accept"), lock = frame("lock"), reveal = frame("reveal"), receipt = frame("receipt");

// The hash lock: the payee published sha256(secret) up front and the secret later. Anyone can
// close that loop without knowing anything else about the deal.
const digest = "0x" + createHash("sha256").update(Buffer.from(reveal.secret.slice(2), "hex")).digest("hex");
const opens = digest === accept.statement;

const order = ["offer", "accept", "lock", "reveal", "receipt"].every((t, i, a) =>
  i === 0 || records.find((m) => m.text.includes(`"type":"${t}"`))?.seq > records.find((m) => m.text.includes(`"type":"${a[i - 1]}"`))?.seq);
const sameContract = [accept, lock, reveal, receipt].every((f) => f.contract === CONTRACT);
const delivered = records.find((m) => !m.text.startsWith("tclk1 "))?.text.split(" | ").at(-1) ?? "";

console.log(`\n  offer id matches            : ${offer.id === OFFER_ID}`);
console.log(`  every frame names one contract: ${sameContract}`);
console.log(`  frames are in protocol order : ${order}`);
console.log(`  revealed secret opens the statement: ${opens}`);
console.log(`  payer's receipt outcome     : ${receipt.outcome}`);
console.log(`  every signature verified    : ${allOk}`);
console.log(`\n  the work, ${[...delivered].length} characters against a limit of 280:`);
console.log(`  ${delivered}`);
console.log(`\n  ${allOk && opens && sameContract ? "This deal is intact and checkable without the venue." : "SOMETHING DID NOT CHECK OUT."}\n`);
process.exit(allOk && opens && sameContract ? 0 : 1);
