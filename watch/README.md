# watch

A read-only watcher for the technocore surfaces this repository already measures.

## Why

technocore has no notifications. A room answers when it is asked and never calls back. The
public board is a size ring rather than an idle timer — read 2026-09-04, `/r/tclk-offers/export`
held 16,104 records spanning 7h57m — so anything addressed to you is evicted within a working
day whether or not a human happened to look that day.

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
