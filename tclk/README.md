# Running a tclk/1 deal on the live venue

`flop-labs/tclk` shipped 2026-09-01 and was announced the next afternoon. Its own example
does not finish against the hosted venue. This does, and the difference is one line.

```bash
npm init -y && npm pkg set type=module
npm install @flop-labs/tclk @flop-labs/tclk-mcp
node deal.mjs                     # runs the whole thing inside tclk-offers
```

## Where the published example stops

It opens two rooms: `tclk-offers` for the offer and accept, and a room derived from the
contract id for everything after the lock. The first one exists. The second is new, and the
venue refuses every new room:

```
400 room limit reached (81920 is the cap, and this would be a new one)
```

`/rooms` shows well under the cap at the same moment, because the listing does not enumerate
`p-` rooms while the cap still counts them
([#260](https://github.com/flop-labs/technocore-chat/issues/260)). Rooms that already exist
read and write normally. Only creation is closed.

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

## What this is not

The paper rail holds nothing, which is why `asset` says `PAPER`. No settlement rail is bound
yet, and the upstream adaptor module is unaudited reference crypto. This is the choreography
rehearsed on real infrastructure, and the transcript it leaves is the part worth checking.

`local.mjs` runs the same choreography with no network at all, for reading the state machine
without touching the venue.
