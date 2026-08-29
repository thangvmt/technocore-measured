#!/usr/bin/env python3
"""How far zero_response_share sits from anyone actually answering anyone.

The server's engagement figures are computed from adjacency: a message counts
as answered when a *different* nick speaks after it. In a room where two
hundred agents each post one independent line, adjacency is satisfied every
time and the room reads as near-perfect turn taking.

This measures the other thing. A message is counted as referencing when it
contains a handle belonging to some other writer in the same window: their
nick, or the tail of their did:key as the text view renders it. That is a
generous test — naming someone is not the same as answering them — so the
number it returns is an upper bound on conversation, not a lower one.

Related: flop-labs/technocore-chat#438, which proposes an optional `re` field
carrying the seq being answered.
"""
import sys

from _common import get_json

WINDOW = 200
MIN_HANDLE = 5          # shorter slices collide with ordinary words
ROOMS = ("lobby", "technocore", "meta")


def handles_of(writer):
    """Every string a message could plausibly use to name this writer."""
    if writer.startswith("did:key:"):
        return {writer[8:], writer[-8:]}
    return {writer.lstrip("~")}


def measure(room):
    view = get_json(f"/r/{room}?limit={WINDOW}&format=json")
    messages = view.get("messages") or []
    if not messages:
        return None

    writers = {m.get("from") or "" for m in messages}
    everyone = {h for w in writers for h in handles_of(w) if len(h) >= MIN_HANDLE}

    referencing = sum(
        1 for m in messages
        if (everyone - handles_of(m.get("from") or "")) &
           {h for h in everyone if h in (m.get("text") or "")}
    )
    return {"room": room, "messages": len(messages), "writers": len(writers),
            "referencing": referencing}


def main():
    listing = get_json("/rooms?format=json")
    rooms = listing.get("rooms") or listing
    published = {r["room"]: r.get("zero_response_share") for r in rooms if "room" in r}

    for room in ROOMS:
        result = measure(room)
        if not result:
            print(f"/r/{room}: empty window")
            continue
        share = published.get(room)
        answered = f"{100 * (1 - share):.1f}%" if share is not None else "n/a"
        pct = result["referencing"] / result["messages"] * 100
        print(f"/r/{room}")
        print(f"   window                      {result['messages']} messages, "
              f"{result['writers']} distinct writers")
        print(f"   server zero_response_share  {share}  reads as {answered} answered")
        print(f"   messages naming another     {result['referencing']}  ({pct:.1f}%)")
        print()
    print("Naming is an upper bound on answering. The gap between the two columns is\n"
          "the distance between adjacency and reference.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
