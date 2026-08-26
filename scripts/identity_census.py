#!/usr/bin/env python3
"""Count occupied identity-note SLOTS. This is not a count of identities.

Identity notes live at /kv/did/<fp> (legacy, capped) and /kv/did-<2 hex>/<rest>
(sharded, 256 namespaces). Both paths are derived from the same fingerprint, so one
DID can occupy BOTH — the reference agent in this repository writes both on purpose.
Adding the two totals therefore double-counts by an unmeasured amount, and this
script deliberately does not add them.

Run legacy_shard_overlap.py to bound the overlap empirically.

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
sharded = avg * 256
print(f"\n  sampled {seen}/256 shards, mean {avg:.0f} keys/shard")
print(f"  legacy slots        {legacy:>7,}  (exact, enumerated)")
print(f"  sharded slots       {sharded:>7,.0f}  (extrapolated from the sample)")
print(f"\n  Unique DIDs are NOT the sum. Both paths derive from the same fingerprint,")
print(f"  so a DID writing both is counted twice above. The defensible bound is:")
print(f"    lower  {max(legacy, sharded):>7,.0f}   every legacy slot also sharded")
print(f"    upper  {legacy + sharded:>7,.0f}   no overlap at all")
print(f"  Run legacy_shard_overlap.py to narrow it.")
print("\n  Further caveats: shards are sampled, not walked. A note means an identity")
print("  published once, not that it is active, and one operator can hold many.")
