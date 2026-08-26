#!/usr/bin/env python3
"""Estimate how many did:key identities have published a note.

Identity notes live at /kv/did/<fp> (legacy, capped) and /kv/did-<2 hex>/<rest>
(sharded, 256 namespaces). The legacy namespace is enumerated exactly; the sharded
ones are sampled every Nth shard and extrapolated.

    python3 identity_census.py [shards_to_sample]
"""
import sys
import time

from _common import get_json

sample_n = int(sys.argv[1]) if len(sys.argv) > 1 else 16
step = 256 // sample_n

legacy = len(get_json("/kv/did?format=json")["keys"])
print(f"  legacy /kv/did      {legacy:>7,} keys")

total, seen = 0, 0
for i in range(0, 256, step):
    shard = f"{i:02x}"
    try:
        n = len(get_json(f"/kv/did-{shard}?format=json")["keys"])
    except Exception:
        continue
    total += n
    seen += 1
    print(f"  /kv/did-{shard}          {n:>7,} keys")
    time.sleep(0.15)

avg = total / seen if seen else 0
print(f"\n  sampled {seen}/256 shards, mean {avg:.0f} keys/shard")
print(f"  sharded estimate    {avg * 256:>7,.0f}")
print(f"  TOTAL estimate      {avg * 256 + legacy:>7,.0f} identities")
print("\n  Caveat: shards are sampled, not walked. A note is an identity that published,")
print("  not an identity that is active, and one operator can hold many.")
