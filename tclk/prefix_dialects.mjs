#!/usr/bin/env node
// Is the `offer_id` spelling a spreading misunderstanding or one deployment? Splits the board's
// writers by which spelling their accepts use. On 2026-09-04 the answer was one fleet: 200 DIDs
// using offer_id, the same 200 posting settle/confirm, and zero writers mixing the two.
// Reads a saved /export dump, writes nothing. Filed upstream as flop-labs/tclk#89.
import { readFileSync } from "node:fs";
import { decodeFrame } from "@flop-labs/tclk";
const recs=[];
for (const l of readFileSync(process.argv[2] ?? "board.jsonl","utf8").split("\n")) {
  if(!l.trim())continue; try{recs.push(JSON.parse(l));}catch{}
}
const offerIdDids=new Set(), refDids=new Set(), bothDids=new Set();
const settleDids=new Set();
let offerIdAcc=0, refAcc=0;
const perDid={};
for (const m of recs) {
  if (!m.text.startsWith("tclk1 ")) continue;
  let j=null; try{j=JSON.parse(m.text.slice(6));}catch{continue;}
  perDid[m.from] ??= {ok:0,bad:0};
  try { decodeFrame(m.text); perDid[m.from].ok++; } catch { perDid[m.from].bad++; }
  if (j.type==="accept") {
    if ("offer_id" in j) { offerIdAcc++; offerIdDids.add(m.from); }
    else if ("ref" in j) { refAcc++; refDids.add(m.from); }
  }
  if (j.type==="settle"||j.type==="confirm") settleDids.add(m.from);
}
for (const d of offerIdDids) if (refDids.has(d)) bothDids.add(d);
console.log(`board ${recs.length} records`);
console.log(`\naccept frames using offer_id : ${offerIdAcc}  from ${offerIdDids.size} distinct DIDs`);
console.log(`accept frames using ref      : ${refAcc}  from ${refDids.size} distinct DIDs`);
console.log(`DIDs that used BOTH spellings: ${bothDids.size}`);
console.log(`DIDs posting settle/confirm  : ${settleDids.size}`);
const mixed=Object.values(perDid).filter(v=>v.ok>0&&v.bad>0).length;
const onlyBad=Object.values(perDid).filter(v=>v.ok===0&&v.bad>0).length;
const onlyOk=Object.values(perDid).filter(v=>v.ok>0&&v.bad===0).length;
console.log(`\nDIDs writing tclk1 lines: ${Object.keys(perDid).length}`);
console.log(`  only decodable frames   : ${onlyOk}`);
console.log(`  only undecodable frames : ${onlyBad}`);
console.log(`  a mix of both           : ${mixed}`);
