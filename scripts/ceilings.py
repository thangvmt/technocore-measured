#!/usr/bin/env python3
"""Where each published ceiling stands, and how fast it is being approached.

Two of them moved apart. max_notes_per_ns was raised from 40,960 to 131,072;
max_rooms was left at 40,960. This samples the room count over a few minutes so
the fill rate is measured rather than guessed, and reads the note namespace once.

A linear projection is stated because it is the honest reading of a short
sample, not because rooms fill linearly. Reaping returns rooms that go a week
without a write, and a room still on its first message after a day.
"""
import re
import sys
import time

from _common import get

SAMPLES = 6
INTERVAL = 40
ROOMS_LINE = re.compile(r"of (\d+) rooms \(cap (\d+), ([\d.]+)M of ([\d.]+)G")


def config_int(config, key):
    found = re.search(rf'"{key}":\s*(\d+)', config)
    return int(found.group(1)) if found else None


def sample_rooms():
    line = get("/rooms").split("\n", 1)[0]
    found = ROOMS_LINE.search(line)
    if not found:
        raise SystemExit("could not read the /rooms header line")
    return {"t": time.monotonic(), "rooms": int(found.group(1)), "cap": int(found.group(2)),
            "used_mb": float(found.group(3)), "total_gb": float(found.group(4))}


def main():
    config = get("/config")
    max_rooms = config_int(config, "max_rooms")
    max_notes = config_int(config, "max_notes_per_ns")

    notes = get("/kv/did").count("/kv/did/")

    points = []
    for n in range(SAMPLES):
        points.append(sample_rooms())
        print(f"   sample {n + 1}/{SAMPLES}: {points[-1]['rooms']} rooms", flush=True)
        if n < SAMPLES - 1:
            time.sleep(INTERVAL)

    span = points[-1]["t"] - points[0]["t"]
    rate = (points[-1]["rooms"] - points[0]["rooms"]) / span * 3600
    now, cap = points[-1]["rooms"], points[-1]["cap"]
    free = cap - now

    print(f"\nmax_rooms         {max_rooms}")
    print(f"rooms now         {now}  ({now / cap * 100:.1f}%), {free} free")
    print(f"net fill rate     {rate:+.0f} rooms/hour over {span / 60:.1f} minutes")
    if rate > 0:
        print(f"linear projection {free / rate:.1f} hours, before reaping is accounted for")

    print(f"\nmax_notes_per_ns  {max_notes}")
    print(f"did/ namespace    {notes}  ({notes / max_notes * 100:.1f}% of the raised ceiling)")

    storage_left = points[-1]["total_gb"] * 1024 - points[-1]["used_mb"]
    srate = (points[-1]["used_mb"] - points[0]["used_mb"]) / span * 3600
    print(f"\nstorage           {points[-1]['used_mb']:.0f}M of {points[-1]['total_gb']}G, "
          f"{srate:+.1f} M/hour")
    if srate > 0:
        print(f"                  {storage_left / srate / 24:.1f} days at this rate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
