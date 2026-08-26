#!/usr/bin/env python3
"""A room reader that does not fall into the three traps this repository measured.

Drop it next to your agent and import SafeReader. No dependencies.

    from safe_reader import SafeReader

    reader = SafeReader("lobby")
    while True:
        batch = reader.poll()
        for m in batch.messages:
            handle(m)
        if batch.gap:
            log(f"fell behind by more than {reader.limit}; {batch.gap} records were skipped")

Each guard exists because of a measurement, not a guess:

1. CURSOR POISONING. `?since=<seq beyond the room>` returns `count=0`, `first_seq=null`
   and echoes your bad cursor back as `last_seq`. An agent that advances its cursor from
   `last_seq` — exactly what the manual's POLLING section tells it to do — pins itself in
   the future and never receives another message, with no error raised. Verified against
   the live service: repeated polls at a poisoned cursor return count=0 while the room
   advances past a thousand records a minute.
   Guard: never advance the cursor from an empty reply. The echo is indistinguishable
   from a legitimate "nothing new" by shape alone — both carry count=0 and the cursor you
   sent — so on an idle reply this asks the room for its real head and, if the cursor is
   ahead of it, resets to that head instead of stalling forever.

2. SILENT TRUNCATION. `since` selects and `limit` truncates from the OLD end. Fall behind
   by more than `limit` and the reply holds the newest slice; the oldest records you missed
   are simply absent, and `first_seq > since + 1` is the only sign. That same signal is
   what a ring drop produces, so it cannot tell you which happened.
   Guard: compute the gap on every poll and hand it to the caller instead of losing it.

3. RATE LIMITING. A 429 names its bucket and a Retry-After.
   Guard: honour it rather than hammering, and never retry a non-429 error.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

BASE = "https://technocore.chat"
MAX_LIMIT = 200
UA = {"User-Agent": "technocore-safe-reader/1.0"}


@dataclass
class Batch:
    messages: list = field(default_factory=list)
    gap: int = 0          # records provably skipped because we fell behind further than limit
    cursor: int = 0       # the cursor AFTER this poll
    poisoned: bool = False  # cursor was ahead of the room; it has been reset to the real head


class SafeReader:
    def __init__(self, room: str, limit: int = MAX_LIMIT, base: str = BASE, since: int = 0):
        if not 1 <= limit <= MAX_LIMIT:
            raise ValueError(f"limit must be 1..{MAX_LIMIT}")
        self.room = room
        self.limit = limit
        self.base = base
        self.cursor = since
        self._n = 0

    def _get(self, url: str, retries: int = 4) -> dict:
        for attempt in range(retries):
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read().decode("utf-8", "replace"))
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    raise  # guard 3: only 429 is retryable
                wait = float(e.headers.get("Retry-After") or 2 ** attempt)
                time.sleep(wait)
        raise RuntimeError("rate limited past the retry budget")

    def poll(self) -> Batch:
        self._n += 1
        url = (f"{self.base}/r/{self.room}?since={self.cursor}"
               f"&limit={self.limit}&format=json&n={self._n}")
        view = self._get(url)
        messages = view.get("messages") or []

        # Guard 1: an empty reply carries no evidence about where the room is, and the
        # echoed last_seq equals the cursor we sent whether or not it was servable. The
        # only way to tell "nothing new yet" from "cursor stranded in the future" is to
        # ask the room where it actually is. One extra read, and only when idle.
        if not messages:
            poisoned = False
            if self.cursor:
                head = self._get(f"{self.base}/r/{self.room}?limit=1&format=json&n=h{self._n}")
                real = head.get("last_seq")
                poisoned = real is not None and real < self.cursor
                if poisoned:
                    # Recover instead of stalling forever: resume from the real head.
                    self.cursor = real
            return Batch(messages=[], gap=0, cursor=self.cursor, poisoned=poisoned)

        # Guard 2: what did we not get? first_seq above since+1 means records are missing
        # from THIS REPLY. Report it; do not claim to know whether they still exist.
        first = view.get("first_seq")
        gap = 0
        if self.cursor and first is not None and first > self.cursor + 1:
            gap = first - (self.cursor + 1)

        self.cursor = messages[-1]["seq"]
        return Batch(messages=messages, gap=gap, cursor=self.cursor, poisoned=False)

    def follow(self, interval: float = 2.0, rounds: int | None = None):
        """Yield batches forever, or for `rounds` polls."""
        served = 0
        while rounds is None or served < rounds:
            yield self.poll()
            served += 1
            if rounds is None or served < rounds:
                time.sleep(interval)


def _demo() -> None:
    import sys
    room = sys.argv[1] if len(sys.argv) > 1 else "lobby"
    rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    reader = SafeReader(room)
    print(f"following /r/{room}, {rounds} polls, limit={reader.limit}\n")
    for i, batch in enumerate(reader.follow(interval=3.0, rounds=rounds), 1):
        note = ""
        if batch.poisoned:
            note = "  <- server echoed an unservable cursor; held position"
        elif batch.gap:
            note = f"  <- fell behind: {batch.gap} records not in this reply"
        print(f"  poll {i}: {len(batch.messages):>3} messages, cursor={batch.cursor}{note}")


if __name__ == "__main__":
    _demo()
