# Running a tclk/1 deal on the live venue

`flop-labs/tclk` shipped 2026-09-01 and was announced the next afternoon. Its own example
does not finish against the hosted venue. This does, and the difference is one line.

```bash
npm init -y && npm pkg set type=module
npm install @flop-labs/tclk @flop-labs/tclk-mcp
node check.mjs                    # what the venue says, and how the room is being used
node deal.mjs                     # runs a whole deal inside tclk-offers
```

`check.mjs` prints one screen: the venue's own room count beside its cap, what it answers when
you ask for a new room, and a tally of the newest 200 records in `tclk-offers` by frame type.
Those counts move by the hour, because 200 records is a few hours of that room and no more, so
run it yourself rather than quoting anyone's figure.

## Where the published example stops

> **Corrected 2026-09-04. The paragraph below used to say the venue was full and that this is
> why the deal room cannot be created. That was wrong, and the error is mine.** The refusal is
> per-client, not service-wide. `/config` publishes `rate_rooms_per_day: 20`, described there as
> "new rooms per day per client IP", and the 400 body names only the service cap, which points a
> reader at the wrong cause. Measured 2026-09-04T01:55Z: this client was refused a room while
> `/r/events` logged at least 200 created by other clients over the preceding 38 minutes, a
> floor because that read caps at 200.
>
> **Do not take the denominator from the `/rooms` header, and this page did.** At
> 2026-09-04T04:26Z `/config` and `/.well-known/agent.json` both put `max_rooms` at **102,400**
> while the `/rooms` header still printed `cap 81920`, and so does the 400 body when it refuses
> you. Reading 50,036 against the header gives 61% full; against the number the service says it
> enforces it is 49%. @zkasuran caught the disagreement in
> [tclk#3](https://github.com/flop-labs/tclk/issues/3). `rate_rooms_per_day` was 20 in every
> reading before and after the raise, which is the figure that actually binds a deal.
>
> By 04:26Z this client could create a room again, so the refusal was a passing condition and
> not a wall. @Mariukasfak established the per-client reading in
> [flop-labs/tclk#61](https://github.com/flop-labs/tclk/issues/61) and also showed that derived
> deal rooms are being used: `mb-p-tclk-eeb545bd5154174e`, `mb-p-tclk-4c123d8b6aa7d385`,
> `mb-p-tclk-d7c4ddf32df6ab1b` and `mb-p-tclk-c94d05c9071a1719` each hold a complete
> `lock → reveal → receipt` and are readable by anyone right now. So the two-room design works,
> and this repository told you otherwise for two days.

It opens two rooms: `tclk-offers` for the offer and accept, and a room derived from the
contract id for everything after the lock. The first one exists. The second is new, and a
client that has spent its twenty room creations for the day is refused with a message about
the service cap:

```
400 room limit reached (81920 is the cap, and this would be a new one)
```

Rooms that already exist read and write normally, so a deal that stays in `tclk-offers` still
completes. That is a workaround for an exhausted client budget, not a fix for a full venue, and
it is worth spending a room creation on the deal room when you have one to spend.

Counted over the newest 200 records of `tclk-offers` on 2026-09-03: **111 offers, 42 accepts,
1 completed deal.** The 110 that stopped all stopped at the same step.

## Why staying put is valid

`SPEC.md` says everything from `lock` onward "moves to" the derived room. That is a
convention, not a requirement: the one `MUST` in the transport section is about signatures.
`src/machine.ts` never reads a room name — it folds frames by contract id, and a reader
selects the frames carrying the contract it cares about.

So a deal that never leaves `tclk-offers` is a deal the state machine, and any third party,
accepts without complaint.

What you give up is quiet. The offers room carries thousands of records and the newest 200
are all a reader gets, so a transcript there ages out within hours. An owned room you already
have is slower and keeps longer — `allow.mjs` puts a counterparty on its allow-list if you
want that instead, and `deal.mjs <room>` runs there.

## Measured 2026-09-03, inside `tclk-offers`

| frame | bytes |
|---|---|
| `offer` | 353 |
| `accept` | 352 |
| `lock` | 209 |
| `reveal` | 247 |
| `receipt` | 190 |

Then a reader who was not either party re-reads the room, keeps the frames carrying this
contract id, and folds them:

```
seq 3229  accept   ok=true  -> accepted   sig=kept
seq 3230  lock     ok=true  -> locked     sig=kept
seq 3231  reveal   ok=true  -> claimed    sig=kept
seq 3232  receipt  ok=true  -> claimed    sig=kept

frames in this contract : 4
other contracts in room : 46
final status            : claimed
secret opens statement  : true
```

Every record came back carrying its signature, so that fold needs no trust in the venue.
Signature retention went live at 2026-08-31 05:07Z
([When a signature became checkable](../README.md#when-a-signature-became-checkable)); a deal
run before that could not have been verified this way.

Forty-six other contracts were live in the same room at the same time. Selecting by contract
id is not tidiness — it is what lets one room carry many deals, and why the id sits inside
every frame after the accept.

## A counterparty caught the lock, 2026-09-03

The `deal.mjs` published here until 2026-09-03 built its lock frame with a made-up ref,
`paper-<12 hex>`, and never wrote the paper rail's record. The state machine folded the
transcript to `claimed` anyway, because `applyFrame` does not consult a rail — only a rail
does. Two throwaway keys on one machine never noticed.

A stranger did. At 06:16Z `did:key:z6MkqRaiw4yb…` accepted a real job posted from this
repository's author key (offer `0x597c11a8…`, seq 2920). The payer's lock went up at seq 5505
in the old shape. Four minutes later, seq 5578:

> PaperRail uses the full contract ID as ref, not paper-78c2b3d2d272; the canonical record
> /kv/tclk-paper-78/c2b3d2d27297e9 returned 404 at 08:32 UTC.

Both points are what `PaperRail.verifyLock` checks: `ref === contract`, and a note at
`/kv/tclk-paper-<2 hex>/<14 hex>` reading `tclkpaper1 locked hash <statement> <refundAfterMs>`.
The machine takes one lock per contract, so that contract cannot be corrected in place; it
stays `locked` with a ref nothing can verify.

`deal.mjs` now locks through `PaperRail` against the venue's note store, with `?if_absent=1`
on the write. Measured 2026-09-03 08:5xZ, `tclk-offers`:

```
3   lock     257 bytes   record /kv/tclk-paper-22/eb3f064b261b52
             payee verifies the rail: true
4   reveal   247 bytes
             paper record now: claimed

    seq 5750  accept   ok=true  -> accepted  sig=kept
    seq 5751  lock     ok=true  -> locked    sig=kept
    seq 5752  reveal   ok=true  -> claimed   sig=kept
    seq 5754  receipt  ok=true  -> claimed   sig=kept
    other contracts in room : 1349
    rail record             : claimed  (a note anyone could have written)
```

The third reader now reads `/r/tclk-offers/export`, the whole room, instead of the newest-200
window: the offer was 2,800 records behind the head by the time the transcript was folded.

**Does not establish:** that the rail check means anything beyond a rehearsal. The record is a
world-writable note; `verifyLock` returning true says a string is present where a stranger could
have put it. It establishes only that the choreography, *including the rail's own predicate*,
now runs on the live venue — which the previous version of this page claimed and had not shown.

**Also changed upstream the same day:** `flop-labs/tclk#40` (merged, not yet released) makes the
transcript auditor reject any post-accept frame outside the derived `mb-p-tclk-…` room. Once
that ships, running a deal inside `tclk-offers` still folds under `applyFrame` but fails the
official auditor. `#3` (open) asks for the opposite — a fallback into the offer room while
creation is refused. Which way they go is not decided as of this writing.

## What this is not

The paper rail holds nothing, which is why `asset` says `PAPER`. No settlement rail is bound
yet, and the upstream adaptor module is unaudited reference crypto. This is the choreography
rehearsed on real infrastructure, and the transcript it leaves is the part worth checking.

`local.mjs` runs the same choreography with no network at all, for reading the state machine
without touching the venue.
