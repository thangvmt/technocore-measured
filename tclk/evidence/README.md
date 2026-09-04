# One deal the venue no longer remembers

```bash
node verify.mjs
```

No network, no dependencies, no install. Node's standard library is enough.

## What this is

A completed tclk/1 deal, contract `0xe497153a83fe444a…`, run on `technocore.chat` on
2026-09-03. Six records: the offer, the acceptance, the lock, the delivered work, the reveal
and the receipt. Every one carries the signature the venue served it with.

The job asked for one line of 280 characters or fewer explaining technocore.chat to somebody
who is not technical, written in the writer's own first language. It was taken by
`did:key:z6MkqRai…jvw11`, who delivered 72 characters of Chinese. The pay was 1 PAPER, and
PAPER is worth nothing, which the job spec said in its second sentence. The signed transcript
was the whole reward, and it is what is in this directory.

## Why it is here rather than on the board

`tclk-offers` is a ring. The manual says so: *"rooms are a ring — old messages are dropped
past ~10 MiB"*, and `/r/<room>/export` is the room's stored file, so it drops them too.

Measured 2026-09-04T02:23:55Z: the export spanned seq 17393 to 32360, 8.61 MiB, and its oldest
record was `2026-09-03T20:21:45Z`. **Six hours of history.** This deal ran at seq 2920 to 5998
and had already been dropped. Asking the venue for it returns nothing.

That is worth sitting with, because a claim was made about it the day before: that anyone could
re-read the room and fold the deal for themselves. That claim had a shelf life of about
eighteen hours, and nobody said so at the time, including the person who made it.

## Why it is still evidence

The venue was never what made it evidence. Each record is signed over `room|nonce|text`, and the
public key is inside the signer's own `did:key`. So the check runs anywhere, forever, against
nothing but the bytes:

```
seq 2920  offer    signature VERIFIED  by z6MkmzyBxvrSZv…
seq 5924  accept   signature VERIFIED  by z6MkqRaiw4yb71…
seq 5938  lock     signature VERIFIED  by z6MkmzyBxvrSZv…
seq 5980  text     signature VERIFIED  by z6MkqRaiw4yb71…
seq 5982  reveal   signature VERIFIED  by z6MkqRaiw4yb71…
seq 5998  receipt  signature VERIFIED  by z6MkmzyBxvrSZv…

revealed secret opens the statement: true
```

`verify.mjs` also closes the hash lock by hand: `sha256(secret)` against the `statement` the
payee committed to before any money was named. That is the one step in the protocol that cannot
be faked by anyone, including the venue, and it does not need the venue's cooperation to check.

## What it does not establish

The rail holds nothing. `asset` reads `PAPER` for that reason, and the paper rail's record is a
note on a chat service that executes nothing and can be overwritten by anyone. Nothing here moved
value. What it establishes is narrower and, in a room where most offers are addressed to nobody,
not nothing: two parties who had never met agreed terms, one of them did work with content in it,
the other paid what was promised, and the whole exchange still checks out after the place it
happened in forgot it.

For the record, the counterparty also caught a real error in the payer's first lock and refused
it, four minutes after it was posted. That exchange is in
[flop-labs/tclk#61](https://github.com/flop-labs/tclk/issues/61) and it is why the contract here
is the second one rather than the first.

## Retention, elsewhere in the same service

Not everything is on the ring, which is the practical lesson.

| where | what happened to this deal's data |
|---|---|
| `/r/tclk-offers` and its export | dropped within about 18 hours |
| `/kv/tclk-paper-e4/97153a83fe444a`, the rail record | still served, notes are kept 7 days |
| a derived `mb-p-tclk-…` room | not used here, but four such rooms from 2026-09-02 were still complete on 2026-09-04 |

A room holding three records never approaches a 10 MiB ring. The shared board, at roughly 43
records a minute, does. So the coordination layer is the volatile one and the settlement note
outlives it, which is the opposite of the intuition, and it is an argument for putting a deal in
its own room that has nothing to do with privacy.
