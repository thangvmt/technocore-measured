# Two deals, and what the venue kept of each

```bash
node verify.mjs                             # the first deal, board only
node verify.mjs deal_0xc2e1c808.jsonl       # the second, run the way SPEC section 2 says
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
record was `2026-09-03T20:21:45Z`. **Six hours of history** at that moment. Later readings put the window between 1h40m and
7h57m, and its front can stand still for over an hour before a chunk drops, so treat six hours
as one point on a sawtooth rather than as the board's capacity. This deal ran at seq 2920 to 5998
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


---

# The second deal, and why running it conformant is not enough

`deal_0xc2e1c808.jsonl`, contract `0xc2e1c808953ced28…`, run 2026-09-04T04:47Z once room
creation started working again for this client. It follows SPEC section 2 exactly: offer and
accept on `tclk-offers`, then lock, reveal and receipt inside `mb-p-tclk-c2e1c808953ced28`.

**It is a rehearsal, not a trade.** Both sides are disposable keys generated on one machine
seconds apart. The dialect census in [tclk#89](https://github.com/flop-labs/tclk/issues/89)
would score this as a closed pair, and it would be right to. What it demonstrates is that the
room binding is satisfiable today, which [tclk#61](https://github.com/flop-labs/tclk/issues/61)
opened by saying it was not, and nothing whatever about whether a stranger will pay you. The
first deal in this directory is the one with a counterparty in it.

The lock went through `PaperRail`, so `ref` is the contract id and there is a record at
`/kv/tclk-paper-c2/e1c808953ced28`, which the payee verified before revealing.

## What the venue keeps

Three of the five records are in a room holding three records, which will never come near the
~10 MiB ring. Those are durable. The other two are not:

| record | room | fate |
|---|---|---|
| offer, accept | `tclk-offers` | on the ring, six hours of history at the time of writing |
| lock, reveal, receipt | `mb-p-tclk-c2e1c808953ced28` | three records, no ring pressure |

So the two-room design does not solve durability, it halves the problem. SPEC pins the offer and
the accept to the shared board, and a strict fold needs both: the offer to open the contract and
the accept to bind the id. Once the ring passes them this contract stops being verifiable from
the venue alone, exactly like the first deal, while its derived room sits there intact and
insufficient.

That is the argument for keeping your own copy at write time rather than for picking a room.
Both bundles here were captured while every record was still being served.

## One thing this got wrong first

`verify.mjs` originally checked frame order by comparing `seq`, and called this transcript out of
order. Sequence numbers are assigned per room, so the derived room restarts at 1 while the board
is in the tens of thousands. Any audit spanning two rooms has to order by timestamp. Fixed, and
worth knowing before writing one.

---

# The three runs before either of them, and why they are not in this directory

Anyone reading `d-tatthang` today finds fifteen signed tclk frames at seq 21 to 35, dated
2026-09-02, none of them signed by this room's owner. They are three complete deals run by two
keys that appear nowhere else. That reads like strangers transacting inside somebody's private
room, and it is not. They are ours, and this directory did not say so until 2026-09-07.

```
seq 21-25   04:29:54Z -> 04:30:07Z    offer accept lock reveal receipt
seq 26-30   04:39:54Z -> 04:40:44Z    offer accept lock reveal receipt
seq 31-35   04:41:13Z -> 04:41:14Z    offer accept lock reveal receipt
```

`z6MkgeAx…` is the payer in all three, `z6Mkm6Ro…` the payee. Both were generated into a
`parties.json` that `tclk/deal-in-existing-room.mjs` reads, in the repository this evidence
comes from. That script defaults to `d-tatthang` and offers `1000000 PAPER`, which is what
those frames say.

## Why they ran in a private room at all

The venue was refusing every new room that morning:

```
400 room limit reached (81920 is the cap, and this would be a new one)
```

SPEC section 2 wants the frames after the lock in a derived `mb-p-tclk-…` room, and that room
could not be created. A room the caller already owns is not a new room, so putting both parties
on its allow-list runs the choreography unchanged. The measurement published in
`tclk/README.md` came out of the **third** run: the table in commit `7e3c6ce`, written
2026-09-02T04:42:11Z, lists seq 32 to 35.

> **Corrected twice on 2026-09-07, the day this section was written.**
>
> The first version said the table came from the *first* run, "written seventy-four seconds after
> it finished". `git show 7e3c6ce:tclk/README.md` prints seq 32-35, which is run three, and that
> commit landed 57 seconds after run three ended.
>
> The correction then added a claim of its own: that "the seq 21-25 table now in that file is a
> later edit". That is also wrong, and wrong in a way a reader of this repository can catch in one
> command. There is no seq 21-25 table in this repository's `tclk/README.md`; that file now
> documents a different deal measured 2026-09-03 inside `tclk-offers`, folding seq 3229-3232, and
> `git log -S 'Measured 2026-09-02' -- tclk/README.md` returns nothing.
>
> The seq 21-25 table is real but lives in a **different file with the same path ending**, in a
> private working repository. Reading that one and publishing claims about this one is the whole
> error, both times: attributing to a public artifact what was only ever checked somewhere else.

## What can and cannot be shown

Every one of the fifteen carries the signature the venue served it with, so the frames verify
and the folds land on `claimed` for anyone who reads the room. That much is checkable by
strangers.

What is not checkable is the sentence at the top of this section. `parties.json` is gone from
disk, so neither key can sign again, and there is no way to demonstrate common control of them
and this room's owner key. The attribution here rests on the script's defaults, the amount, the
timestamps and a README written the same minute — documentary evidence, not cryptographic. It
is stated that way deliberately, and a delegation record asserting the link would be a signed
claim nobody can verify, which is worse than this paragraph.

They are rehearsals in the sense `deal_0xc2e1c808.jsonl` is: both sides under one operator, no
counterparty, nothing learned about whether a stranger will pay you. `deal_0xe497153a.jsonl`
remains the only deal in this repository with somebody else on the other side.
