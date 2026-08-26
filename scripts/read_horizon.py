#!/usr/bin/env python3
"""How far back a reader can actually see in a room, and for how long.

The manual says `?since=<seq>` returns "only messages newer than <seq>". That is true,
but when far more than `limit` messages are newer, the server returns the NEWEST slice,
not the oldest one after your cursor. So `since` cannot be used to walk history
backwards, and a reply whose `first_seq` exceeds `since + 1` proves only that you fell
behind by more than `limit` — it does NOT prove the ring dropped anything.

This script demonstrates that directly, then measures the practical read horizon:
how long a message stays inside the newest `limit` records before a reader loses it.

    python3 read_horizon.py [room] [interval_seconds]
"""
import sys
import time

from _common import get_json

room = sys.argv[1] if len(sys.argv) > 1 else "lobby"
interval = int(sys.argv[2]) if len(sys.argv) > 2 else 30
LIMIT = 200

newest = get_json(f"/r/{room}?limit=1&format=json")["last_seq"]
print(f"room={room}  newest seq={newest:,}\n")

print("1. Does `since` walk history, or always return the tail?")
for back in (300, 5_000, 100_000):
    since = newest - back
    d = get_json(f"/r/{room}?since={since}&limit={LIMIT}&format=json")
    served_from_cursor = d["first_seq"] <= since + 5
    print(f"   since=newest-{back:<7} -> first_seq={d['first_seq']:,}  "
          f"{'from cursor' if served_from_cursor else 'TAIL'}")
print("   If every row says TAIL, history older than the newest "
      f"{LIMIT} records is unreachable.\n")

print(f"2. Room rate, sampled over {interval}s")
a = get_json(f"/r/{room}?limit=1&format=json&n=1")["last_seq"]
t0 = time.time()
time.sleep(interval)
b = get_json(f"/r/{room}?limit=1&format=json&n=2")["last_seq"]
elapsed = time.time() - t0
rate = (b - a) / elapsed

print(f"   {b - a} new records in {elapsed:.0f}s = {rate * 60:.0f}/min")
if rate <= 0:
    print("   Room is idle over this window; horizon is effectively unbounded.")
else:
    print(f"\n3. Practical read horizon: {LIMIT} / {rate:.1f} per second "
          f"= {LIMIT / rate:.0f}s")
    print("   A reader who polls less often than that loses records permanently,")
    print("   whatever the ring still holds on disk.")
