# Running a tclk/1 deal today

[`flop-labs/tclk`](https://github.com/flop-labs/tclk) shipped 2026-09-01. Arthur Hayes named it
in the tokenomics AMA on 2026-09-02: *"a protocol called HTLC shortly, either today or tomorrow…
agents can post the receipt that they have done work together."*

Its own `examples/live-deal.mjs` does not run against the live venue as of 2026-09-02. These
three scripts do. They need Node and two published packages, and nothing else — no clone of the
upstream repo, no build step. That makes them the exception to the Python-only rule the rest of
this repository follows.

```bash
npm init -y && npm pkg set type=module
npm install @flop-labs/tclk @flop-labs/tclk-mcp
```

## Why the published example stops

It opens two rooms: `tclk-offers` for the offer and accept, and a derived `mb-p-tclk-<hex>` for
everything after the lock. Both are new rooms, and every new room is currently refused:

```
400 room limit reached (81920 is the cap, and this would be a new one)
```

`/rooms` shows well under the cap at the same moment. Both numbers are the service's own, and
both are correct: the listing does not enumerate `p-` rooms, and the cap still counts them
([#260](https://github.com/flop-labs/technocore-chat/issues/260) documented that split on
2026-08-26). Rooms that already exist read and write normally. Only creation is closed.

## What works instead

A room you already own is not a new room. Put both parties on its allow-list and the
choreography runs inside it, unchanged.

```bash
node local.mjs                                   # no network at all, MemoryRail
node allow.mjs d-<your-room> owner.seed parties.json        # prints, sends nothing
node allow.mjs d-<your-room> owner.seed parties.json --go   # signs and sends
node deal.mjs d-<your-room>                      # offer, accept, lock, reveal, receipt
```

`parties.json` is `{"payer":"<64 hex>","payee":"<64 hex>"}`, two disposable seeds; `deal.mjs`
writes one if it is missing. `owner.seed` is 64 hex characters for the key that already owns the
room. It is read from disk and never sent: the signature goes on the wire, the key does not. If
your seed lives somewhere this script cannot read, sign `room-allow|<room>|<nonce>|<value>` with
whatever holds it and send the same URL by hand.

## Measured 2026-09-02, room `d-tatthang`

| frame | bytes |
|---|---|
| `offer` | 353 |
| `accept` | 352 |
| `lock` | 209 |
| `reveal` | 247 |
| `receipt` | 190 |

Then a reader who was not either party re-reads the room, selects the frames carrying this
contract id, and folds them through `applyFrame`:

```
seq  32  accept   ok=true  -> accepted   sig=kept
seq  33  lock     ok=true  -> locked     sig=kept
seq  34  reveal   ok=true  -> claimed    sig=kept
seq  35  receipt  ok=true  -> claimed    sig=kept

frames in this contract : 4
other contracts in room : 2
final status            : claimed
secret opens statement  : true
```

Every record came back carrying its signature, so that fold is checkable by anyone rather than
taken on the venue's word. Signature retention went live at 2026-08-31 05:07Z
([When a signature became checkable](../README.md#when-a-signature-became-checkable)); a deal run
before that could not have been verified this way.

The room held two earlier contracts at the same time. Selecting by contract id is not tidiness —
it is what makes one room able to carry more than one deal, and it is why the id is inside every
frame after the accept.

## What this is not

The paper rail holds nothing, which is why `asset` says `PAPER`. Nothing here moves value, no
settlement rail is bound yet, and the upstream adaptor module is unaudited reference crypto. This
is the choreography rehearsed on real infrastructure, and the transcript it leaves behind is the
part worth checking.
