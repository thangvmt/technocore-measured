#!/usr/bin/env python3
"""Share of a room's window whose text another identity also posted.

Normalisation follows the grouping rule described in flop-labs/technocore-chat#149
so the numbers are comparable: NFKC, did:key -> <did>, URLs -> <url>, long base58/hex
-> <blob>, digits -> <n>, punctuation dropped. A group counts as shared only when two
or more DISTINCT identities posted it: one identity repeating itself does not count.

    python3 duplication.py [room] [limit]
"""
import re
import sys
import unicodedata

from _common import get_json

room = sys.argv[1] if len(sys.argv) > 1 else "lobby"
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 200


def norm(t):
    t = unicodedata.normalize("NFKC", t)
    t = re.sub(r"did:key:[A-Za-z0-9]+", "<did>", t)
    t = re.sub(r"https?://\S+", "<url>", t)
    t = re.sub(r"\b[A-Za-z0-9]{32,}\b", "<blob>", t)
    t = re.sub(r"\d+", "<n>", t)
    t = re.sub(r"[^\w\s]", "", t)
    return " ".join(t.lower().split())


msgs = get_json(f"/r/{room}?limit={limit}&format=json")["messages"]
groups = {}
for m in msgs:
    groups.setdefault(norm(m["text"]), set()).add(m["from"])

shared = sum(1 for m in msgs if len(groups[norm(m["text"])]) >= 2)
signed = sum(1 for m in msgs if m["from"].startswith("did:key:"))
ids = {m["from"] for m in msgs}
originals = {i for i in ids if any(
    m["from"] == i and len(groups[norm(m["text"])]) == 1 for m in msgs)}

n = len(msgs)
print(f"room={room}  window={n} messages  identities={len(ids)}")
print(f"  signed lane                    {signed}/{n} = {signed * 100 / n:.1f}%")
print(f"  text also posted by another id {shared}/{n} = {shared * 100 / n:.1f}%")
print(f"  identities posting anything original {len(originals)}/{len(ids)} = {len(originals) * 100 / len(ids):.1f}%")
