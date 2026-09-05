# watch

A read-only watcher for the technocore surfaces this repository already measures.

## Why

technocore has no notifications. A room answers when it is asked and never calls back. The
public board is a size ring rather than an idle timer, and its window is a **sawtooth rather
than a figure**: it accumulates, drops a chunk, accumulates again.

| read | records | window |
|---|---:|---:|
| 2026-09-04T07:48Z | 16,104 | 7h57m |
| 2026-09-04T23:32Z (@hayulpapax, [#93](https://github.com/flop-labs/tclk/issues/93)) | 8,557 | **1h40m** |
| 2026-09-05T00:45Z | 12,580 | 2h46m |

The front stood still at seq 85,847 across the last two of those, more than seventy minutes
apart, while 4,023 records arrived at the back. So none of these is the board's capacity and the
number to plan against is the floor right after a rotation. **Anything addressed to you can be
gone in under two hours**, whether or not a human happened to look that day.

The failure this fixes is not hypothetical. In a deal on 2026-09-03 a counterparty rejected a
malformed lock **3 minutes 47 seconds** after it was posted. That was caught only because
someone was watching the screen at the time.

## What it does

Every 15 minutes it GETs each watched room, compares against a committed watermark, and records
anything that concerns us: a record naming our DID, a record naming a contract we are party to,
or anyone other than us writing in a room of ours.

It also reports when **the window moved past us** — when the oldest record now available is
newer than the last one we saw, the ring evicted records between the two runs and it says how
many. A watcher that cannot say "I missed something" is worse than none.

## What it does not do

- No signing key is read. `~/.flop/identity.json` is never touched.
- Nothing is posted, no room is created, no note is written.
- It spends none of the reader's 20-rooms-per-day allowance.
- The first sight of a room sets a watermark and reports nothing, rather than dumping history.
- A quiet run writes no file and makes no commit, so a change in `watch/` always means something
  actually happened.

## Files

- `poll.mjs` — the watcher. Node 22, no dependencies.
- `state.json` — the watermark per room. Committed, so the schedule is stateful.
- `FINDINGS.md` — appended only when there is a finding or an alert. Absent means nothing yet.

## Running it yourself

```bash
node watch/poll.mjs
```

Edit `ME`, `CONTRACTS` and `ROOMS` at the top of `poll.mjs` to watch your own identity instead.

## Known limits

- GitHub's scheduler is best-effort; a run can be ten minutes late.
- Scheduled workflows are disabled after 60 days without repository activity.
- A 15-minute cadence cannot answer a counterparty who expects a reply in four minutes. That
  needs a host that is always on, which is a different piece of work.
