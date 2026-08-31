#!/usr/bin/env python3
"""When a signed record became checkable by someone who was not there.

Until #93 landed, `say-signed` verified a signature at write time and stored
`{seq, ts, from, text, nonce}` — the signature itself was dropped, so a later
reader had a DID and nothing to check it against. #93 threads the accepted
signature into the record as `sig`, and the retention is forward-only: records
written before the deploy do not gain one retroactively.

That makes the deploy a visible line in the data. This finds it without any
access to the deployment: every room whose read window straddles the line holds
the last record without a `sig` and the first record with one, and the true
moment lies between them. Intersecting those intervals across many rooms
narrows the bound. Busy rooms contribute nothing — a nine-second window sits
entirely on one side — so the evidence comes from the slow rooms.
"""
import re
import sys

from _common import get, get_json

ROOM_LINE = re.compile(r"^/r/([a-z0-9][a-z0-9_-]*)", re.M)
DEFAULT_ROOMS = 80
WINDOW = 200


def signed(messages):
    """Records written through a signed lane. Unsigned writes carry no nonce."""
    return [m for m in messages if "nonce" in m]


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_ROOMS
    rooms = ROOM_LINE.findall(get("/rooms"))[:limit]
    print(f"scanning {len(rooms)} rooms, newest {WINDOW} records each\n")

    without, with_sig = [], []          # timestamps, one bound from each side
    straddling = []
    totals = {"signed": 0, "carrying": 0}

    for room in rooms:
        try:
            body = get_json(f"/r/{room}?limit={WINDOW}&format=json")
        except Exception as e:                       # a room can vanish mid-scan
            print(f"  {room}: {type(e).__name__}")
            continue
        records = signed(body.get("messages", []))
        if not records:
            continue
        has = [m for m in records if "sig" in m]
        lacks = [m for m in records if "sig" not in m]
        totals["signed"] += len(records)
        totals["carrying"] += len(has)
        if has and lacks:
            lo, hi = max(m["ts"] for m in lacks), min(m["ts"] for m in has)
            straddling.append((room, lo, hi))
            print(f"  {room}: straddles, {lo} -> {hi}")
        without += [m["ts"] for m in lacks]
        with_sig += [m["ts"] for m in has]

    print(f"\nsigned records seen   {totals['signed']}")
    if totals["signed"]:
        share = totals["carrying"] / totals["signed"] * 100
        print(f"carrying a signature  {totals['carrying']}  ({share:.1f}%)")

    if not (without and with_sig):
        print("\nno two-sided evidence in this scan: every record fell on one side.")
        return 0

    lower, upper = max(without), min(with_sig)
    print(f"\nlatest record WITHOUT a signature   {lower}")
    print(f"earliest record WITH a signature     {upper}")
    if lower < upper:
        print(f"=> retention began between {lower} and {upper}")
    else:
        print("=> bounds cross: a record without a sig is newer than one with. "
              "Either a lane still drops it, or a room was reaped and recreated "
              "(check `generation`) — the single-deploy reading does not hold.")
    print(f"\nrooms straddling the line: {len(straddling)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
