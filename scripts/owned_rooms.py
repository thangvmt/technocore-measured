#!/usr/bin/env python3
"""How many claimed rooms still have a room behind them.

Only `d-` rooms can be owned, and the claim is a note in `room-owners` that
survives on its own terms. The room does not: a room with no write for seven
days is deleted, and one still on its first message goes after twenty-four
hours. Nothing links the two lifetimes, so a claim outlives the thing it
claims and the namespace keeps the receipt.

This counts the claims, then samples them on a fixed stride and asks each
room whether it holds anything. A room that was reaped answers `messages 0`
with `range None..0` rather than 404, so the check is on the count, not the
status. Reading does not create a room — the room total is sampled before and
after to show the scan did not move it.
"""
import re
import sys

from _common import get, get_json

CLAIM_LINE = re.compile(r"^/kv/room-owners/(\S+)", re.M)
ROOMS_HEADER = re.compile(r"of (\d+) rooms \(cap (\d+)")
AUTO_NAME = re.compile(r"^d-[0-9a-f]{16}$")
DEFAULT_SAMPLE = 80


def room_total():
    found = ROOMS_HEADER.search(get("/rooms").split("\n", 1)[0])
    return int(found.group(1)), int(found.group(2))


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SAMPLE

    rooms_before, cap = room_total()
    claims = CLAIM_LINE.findall(get("/kv/room-owners"))
    auto = sum(1 for c in claims if AUTO_NAME.match(c))

    print(f"claims in room-owners   {len(claims)}")
    print(f"  auto-generated names  {auto}")
    print(f"  names someone chose   {len(claims) - auto}")
    print(f"rooms on the network    {rooms_before} of {cap}\n")

    # Fixed stride, so a re-run against an unchanged namespace hits the same slots.
    stride = max(1, len(claims) // want)
    sample = claims[::stride][:want]
    print(f"sampling every {stride}th claim, {len(sample)} rooms\n")

    alive, empty, failed = [], [], {}
    for name in sample:
        try:
            body = get_json(f"/r/{name}?limit=1&format=json")
        except Exception as e:
            code = getattr(e, "code", type(e).__name__)
            failed.setdefault(code, []).append(name)
            continue
        (alive if body.get("messages") else empty).append(name)

    checked = len(alive) + len(empty)
    rooms_after, _ = room_total()

    unreadable = sum(len(v) for v in failed.values())
    print(f"claims checked          {checked}   ({unreadable} unreadable)")
    for code, names in sorted(failed.items(), key=str):
        print(f"    {code}: {len(names)}  e.g. {names[0]}")
    if checked:
        print(f"  room still holds text {len(alive)}   ({len(alive) / checked * 100:.1f}%)")
        print(f"  room is gone or empty {len(empty)}   ({len(empty) / checked * 100:.1f}%)")
    if alive:
        print(f"\nstill alive: {', '.join(alive[:10])}")
    print(f"\nroom total before scan  {rooms_before}")
    print(f"room total after scan   {rooms_after}   "
          f"(reading a reaped room does not recreate it)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
