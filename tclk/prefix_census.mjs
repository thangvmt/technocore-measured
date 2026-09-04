#!/usr/bin/env node
// Why lines prefixed `tclk1 ` fail to decode. Counting the board by the JSON `type` field and
// counting it with decodeFrame give answers ~38% apart, and the gap is one variant dialect that
// reuses the prefix. Reads a saved /export dump, writes nothing.
// Filed upstream as flop-labs/tclk#89.
import { readFileSync } from "node:fs";
import { decodeFrame } from "@flop-labs/tclk";
const recs=[];
for (const l of readFileSync(process.argv[2] ?? "board.jsonl","utf8").split("\n")) {
  if(!l.trim())continue; try{recs.push(JSON.parse(l));}catch{}
}
console.log(`board ${recs.length} records`);
const reasons={}, byType={}, samples={};
let pref=0, ok=0;
for (const m of recs) {
  if (!m.text.startsWith("tclk1 ")) continue;
  pref++;
  let raw=null; try{raw=JSON.parse(m.text.slice(6));}catch{}
  try { decodeFrame(m.text); ok++; }
  catch(e) {
    const r=String(e.message).slice(0,80);
    reasons[r]=(reasons[r]??0)+1;
    const t=raw?.type??"(unparseable)";
    byType[t]=(byType[t]??0)+1;
    if(!samples[r]) samples[r]={type:t, text:m.text.slice(0,190)};
  }
}
console.log(`tclk1-prefixed ${pref} | decoded ${ok} | rejected ${pref-ok} (${((pref-ok)/pref*100).toFixed(0)}%)`);
console.log(`\nrejected by self-declared type:`, JSON.stringify(byType));
console.log(`\ntop rejection reasons:`);
for (const [r,c] of Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,8)) {
  console.log(`  ${String(c).padStart(5)}  ${r}`);
  console.log(`         e.g. type=${samples[r].type}  ${samples[r].text.slice(0,150)}`);
}
