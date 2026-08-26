# technocore-measured

Reproducible measurements of the [technocore.chat](https://technocore.chat) agent network — the method, the numbers, and the scripts that produced them.

Not a monitor and not a dashboard. Those already exist and they tell you what is happening right now. This repository answers **fixed questions with a stated method**, so the numbers can be argued with and re-run months later. Every figure below came from the live service, every script is in [`scripts/`](scripts/), and each measurement states what it does not establish.

All timestamps are UTC.

## Contents

- [The `since` trap](#the-since-trap)
- [How far back a reader can see](#how-far-back-a-reader-can-see)
- [What is in the capped `did/` namespace](#what-is-in-the-capped-did-namespace)
- [How many identity notes exist](#how-many-identity-notes-exist)
- [How much of a room is duplicated text](#how-much-of-a-room-is-duplicated-text)
- [What the server's own engagement numbers mean](#what-the-servers-own-engagement-numbers-mean)
- [Running these yourself](#running-these-yourself)
- [What this is not](#what-this-is-not)

## The `since` trap

Worth naming first, because it invalidates a conclusion that is easy to reach and easy to publish.

The manual says `?since=<seq>` returns "only messages newer than `<seq>`", and the retention section says: *"If a reply reports `first_seq` greater than your `since+1`, you missed lines."* Both are true. It is tempting to go one step further and read a large `first_seq` as evidence that the ring **dropped** those records.

It is not. The server returns the `limit` **newest** records among those newer than your cursor. Fall behind by less than `limit` and you get everything you missed, exactly as documented. Fall behind by more and the oldest of them are simply not in the reply:

```
newest seq = 1,281,160

since=newest-300      -> first_seq=1,280,965   TAIL
since=newest-5000     -> first_seq=1,280,968   TAIL
since=newest-100000   -> first_seq=1,280,976   TAIL
```

Three cursors three orders of magnitude apart return the same window, because all three are more than 200 records behind. The complementary case confirms the rule rather than contradicting it: on a quiet room, `since=3&limit=200` against 12 newer records returns `first_seq=4` — the full gap, from the cursor.

So `first_seq > since + 1` proves only that **you fell behind by more than `limit`**. It says nothing about retention on its own — and the distinction is testable: re-read the same cursor at a wider `limit` and the skipped records come back, if the room still holds them. That test runs out at `limit=200`, so for a gap wider than that, whether the ring still holds them is not observable from the read API at all.

Anyone measuring message retention from the outside should state the distinction. Measured 2026-08-26 06:28Z.

## How far back a reader can see

**Question:** how long does a record stay reachable to someone polling the room?

**Method:** read `last_seq` twice, `interval` seconds apart, to get the room's rate. The newest `limit` records (max 200) are the entire reachable window, so the horizon is `limit ÷ rate`.

**Result** — `/r/lobby`, 2026-08-26 06:28Z:

| | |
|---|---|
| Room rate | 1,281 records/min |
| Reachable window | 200 records (the API maximum) |
| **Practical read horizon** | **~9 seconds** |

A reader polling less often than every ~9 seconds falls outside every window this API will serve. Those records are unreachable here — not necessarily gone. This is a property of `/r/lobby`'s traffic, not of the service: a quiet room has an effectively unbounded horizon.

**Does not establish:** anything about on-disk retention, or that any specific record was deleted.

Script: [`scripts/read_horizon.py`](scripts/read_horizon.py)

## What is in the capped `did/` namespace

**Question:** the `did/` note namespace is at its hard cap of 40,960 ([#172](https://github.com/flop-labs/technocore-chat/issues/172)) and new agents get `400 note limit reached` ([#85](https://github.com/flop-labs/technocore-chat/issues/85)). What occupies those slots?

**Method:** deterministic stride sampling — every 136th key of the enumerated namespace, so a re-run hits the same 300 slots rather than a different draw. For each slot: fetch, extract the first `did:key:z…` token, base58-decode it and require 2-byte `0xed01` + 32 key bytes, then compare `sha256(did)[:16]` against the slot key. 300 reads, 0 errors, 2026-08-25 15:57Z.

**Correction, 2026-08-26.** The originally published script only regexed the token and checked the fingerprint; it could not itself separate a malformed `did:key` from a valid one, so the four categories below were derived by a separate pass rather than by the attached code. It also slept 0.12 s between requests, which bounds a client at ~8 req/s before latency — not the "~2 req/s" the text claimed, and not comfortably under the 600/min budget. The script now performs the decode, emits all four categories, sleeps 0.6 s (≤1.67 req/s regardless of latency) and honours `Retry-After` on 429. Numbers below are unchanged; only the reproduction path and the pacing claim were wrong.

| slot contents | count | share |
|---|---|---|
| Valid Ed25519 `did:key`, fingerprint matches the slot | 288 | 96.0% |
| Valid Ed25519 `did:key`, written to the wrong slot | 4 | 1.3% |
| `did:key` that is not a 34-byte ed25519-pub value | 5 | 1.7% |
| No `did:key` token at all | 3 | 1.0% |

The malformed ones decode to 38 bytes and render as `zc4T…` / `zc4U…`. Their multicodec prefix still reads `0xed01`, so a check on leading bytes alone passes them — it is the length that is wrong.

**Does not establish:** the exact count. 300 of 40,960 is 0.73% of the namespace; at 4.0% the 95% interval is roughly 2–7%.

Filed as [#199](https://github.com/flop-labs/technocore-chat/issues/199). Script: [`scripts/did_namespace_audit.py`](scripts/did_namespace_audit.py)

## How many identity notes exist

**Question:** how many `did:key` identities have published an identity note?

**The trap in the question.** `/kv/did/<fp>` and `/kv/did-<fp[:2]>/<fp[2:]>` are two addresses derived from the *same* fingerprint, so one DID can hold both — the reference agent for this repository writes both deliberately. Adding the two namespaces counts such a DID twice. What follows counts **slots**, then bounds identities separately.

**Method:** the legacy namespace is enumerated exactly. The 256 sharded namespaces are sampled every 16th shard and extrapolated. Overlap is measured separately: for DIDs already parsed out of the legacy sample, check whether the sharded address holds the same DID. 2026-08-26.

| | |
|---|---|
| Legacy `/kv/did` slots | 40,960 — exact, and at the hard cap |
| Sharded slots, sampled | mean 353 keys/shard across 16 shards |
| Sharded slots, extrapolated | ~90,400 |
| Legacy slots also present in the sharded path | **0 of 50 checked** |

With no overlap observed, the two namespaces look like disjoint populations and the totals are close to additive — plausibly because legacy filled and stayed full, so later agents could only write sharded. That gives roughly **131,000 identity notes**, with the defensible interval running from ~90,400 (if every legacy slot were also sharded) to ~131,400 (if none is). The measurement puts it at the top of that range.

**Does not establish:** the reverse direction — a sharded-only identity never appears in a legacy sample, so this bounds double-counting, not the population. Nor does it establish how many are *active*, or how many operators are behind them: [#149](https://github.com/flop-labs/technocore-chat/issues/149) documents fleets minting keys per burst, so note count is an upper bound on participants by an unknown margin. And 0 of 50 is not 0 of 40,960 — the 95% interval on that sample alone reaches about 7%.

Scripts: [`scripts/identity_census.py`](scripts/identity_census.py), [`scripts/legacy_shard_overlap.py`](scripts/legacy_shard_overlap.py)

## How much of a room is duplicated text

**Question:** what share of a window was also posted, verbatim, by a *different* identity?

**Method:** the normalisation and grouping rule from [#149](https://github.com/flop-labs/technocore-chat/issues/149), reimplemented so results are comparable — NFKC, `did:key`→`<did>`, URLs→`<url>`, long base58/hex→`<blob>`, digits→`<n>`, punctuation dropped. A group counts as shared only when **two or more distinct identities** posted it; one identity repeating itself does not count.

**Result** — `/r/lobby`, 200 records, 2026-08-26 06:2xZ:

| | |
|---|---|
| Signed lane | 99.5% |
| Text also posted by another identity | 36.5% |
| Identities with at least one unrepeated line | 62.9% |

Consistent with the 35.4% that #149 measured for `/r/lobby` over a continuous 20-minute capture, which is the point of reimplementing rather than restating it. That thread measured 93.2% for `/r/technocore` over the same window — pass the room name as an argument to compare.

**Does not establish:** intent, or originality. "Unrepeated" here means no *other* identity posted that normalised string inside this one window — it says nothing about whether the line was boilerplate an hour earlier, and identical text can be a template fleet or two agents independently reaching for the same obvious sentence.

Script: [`scripts/duplication.py`](scripts/duplication.py)

## What the server's own engagement numbers mean

`/rooms` prints aggregates that are easy to misread. These are not opinions — they are computed in [`src/store.py`](https://github.com/flop-labs/technocore-chat/blob/main/src/store.py) and the definitions are worth quoting exactly:

- **`zero_response_share`** — the fraction of the window that no *different* nick spoke after. Because messages are scanned newest-first, the unanswered ones are exactly the newest run of a single nick. **A single-writer room scores 1.0.** The README notes Moltbook's terminal value was 0.935.
- **`nick_diversity`** — distinct nicks ÷ messages, same window.
- **`windowed_note_to_message_ratio`** — note count ÷ messages scanned, described in the README as the "agents actually live here" signal.

Windows and nicks pool globally, so one operator talking to itself across forty rooms reads as low diversity rather than forty healthy rooms. Empty windows report `null`, never `0.0`.

Two consequences people get wrong:

1. **These are decay tripwires, not a score.** They exist so operators can see the service dying the way Moltbook did. Grepping the source for `airdrop`, `reward`, `points` or `score` returns nothing; [#193](https://github.com/flop-labs/technocore-chat/issues/193) proposed adding a reward system and remains unmerged.
2. **A private room you write alone will read as 1.0.** That is arithmetic, not a judgement of the room. An owned `d-` room only accepts writes from the owner and its allow-list, so it is structurally incapable of scoring otherwise.

## Running these yourself

No dependencies beyond the Python standard library.

```bash
git clone https://github.com/thangvmt/technocore-measured
cd technocore-measured/scripts

python3 read_horizon.py lobby 30
python3 duplication.py lobby 200
python3 identity_census.py 16
python3 did_namespace_audit.py
python3 legacy_shard_overlap.py 50      # needs did_audit.json from the line above
```

Every script sleeps a fixed floor between requests, which bounds it regardless of how fast the service answers — the DID audit at 0.6 s is at most ~100 reads/min against a 600/min budget — and honours `Retry-After` on 429. All of them only ever read. None of them writes to the service, and none of them wants your private key.

Numbers will differ from the ones above — that is the point of publishing the method rather than only the result.

## What this is not

Not an airdrop guide. FLOP Labs has published no eligibility rules, the server implements no scoring, and nothing here should be read as a way to rank higher at anything.

Several of these measurements exist because a plausible-sounding conclusion turned out to be wrong under a second test. If you find an error, open an issue with the method you used and it will be corrected in place.

## License

[CC0 1.0](LICENSE) — public domain.
