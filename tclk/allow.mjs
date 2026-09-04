#!/usr/bin/env node
// Put two parties on an owned room's allow-list, so a tclk deal can run inside a room that
// already exists rather than a new one the venue will refuse.
//
//   node allow.mjs <room> <owner-seed-file> <parties.json>          # prints, sends nothing
//   node allow.mjs <room> <owner-seed-file> <parties.json> --go     # signs and sends
//
// The owner seed file is 64 hex characters, read from disk and never sent anywhere: the
// signature goes on the wire, the key does not. If you keep your seed somewhere this script
// cannot read, sign `room-allow|<room>|<nonce>|<value>` with whatever holds it and send the
// same URL by hand.
import { readFileSync } from "node:fs";
import { signerFromSeed } from "@flop-labs/tclk-mcp/dist/signing.js";

const [room, seedFile, partiesFile] = process.argv.slice(2);
if (!room || !seedFile || !partiesFile) {
  console.error("usage: node allow.mjs <room> <owner-seed-file> <parties.json> [--go]");
  process.exit(2);
}
const BASE = process.env.TECHNOCORE_URL ?? "https://technocore.chat";

// Refuse the file paths people keep a real key in. This script wants a throwaway 64-hex seed
// for a rail that holds nothing, and a mistyped path should not hand it an identity or a
// wallet. Suggested by @jerry21849 in PR #2.
function readSeedFile(path, label) {
  const name = path.split(/[\\/]/).pop().toLowerCase();
  if (name.endsWith(".pem") || name.includes("wallet") || name.includes("keystore") || name === "identity.json") {
    throw new Error(`${label}: refusing ${path}. Pass a dedicated tclk seed file, not an identity, wallet or keystore.`);
  }
  const seed = readFileSync(path, "utf8").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(seed)) throw new Error(`${label}: expected 64 hex characters in ${path}`);
  return seed;
}

const owner = signerFromSeed(Buffer.from(readSeedFile(seedFile, "owner seed file"), "hex"));
const seeds = JSON.parse(readFileSync(partiesFile, "utf8"));
const dids = [seeds.payer, seeds.payee].map((s) => signerFromSeed(Buffer.from(s, "hex")).did);
const value = dids.join(" ");

// room-owners and room-allow share one replay counter, and the allow-list nonce must be
// greater than the claim nonce. Wall-clock ms clears any claim made before now.
const res = await fetch(`${BASE}/kv/room-nonce/${room}`, { redirect: "error" });
const body = await res.text();
const claimNonce = Number(body.split("\n").filter((l) => /^\d+$/.test(l.trim()))[0] ?? 0);
const nonce = Math.max(Date.now(), claimNonce + 1);
const payload = `room-allow|${room}|${nonce}|${value}`;

console.log(`  room        ${room}`);
console.log(`  owner       ${owner.did}`);
console.log(`  allowing    ${dids.join("\n              ")}`);
console.log(`  claim nonce ${claimNonce}  ->  using ${nonce}`);

const url = `${BASE}/kv/room-allow/${room}/set-signed/${owner.did}/${owner.sign(payload)}/${nonce}/${encodeURIComponent(value)}`;
if (!process.argv.includes("--go")) {
  console.log("  [dry run] nothing sent. Re-run with --go to send.");
  process.exit(0);
}
const put = await fetch(url);
console.log(`  -> ${put.status} ${(await put.text()).split("\n").filter((l) => l && !l.startsWith("!!"))[0] ?? ""}`);
