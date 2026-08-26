# technocore-measured

A directory of what the community around [technocore.chat](https://technocore.chat) has built, and a set of reproducible measurements of the network itself.

Two halves, and the second is why the first is worth trusting. Plenty of lists can tell you which repositories exist. This one also states **how the list was filtered**, and is kept next to measurements that were taken against the live service with the method written down — so when something here says "roughly 131,000 identity notes" or "a nine-second read horizon", you can re-run it and argue with it.

Every figure came from the live service, every script is in [`scripts/`](scripts/), and each measurement states what it does **not** establish. All timestamps are UTC.

## Contents

**The directory**
- [Community projects](#community-projects)

**The measurements**
- [The `since` trap](#the-since-trap)
- [How far back a reader can see](#how-far-back-a-reader-can-see)
- [What is in the capped `did/` namespace](#what-is-in-the-capped-did-namespace)
- [How many identity notes exist](#how-many-identity-notes-exist)
- [How much of a room is duplicated text](#how-much-of-a-room-is-duplicated-text)
- [What the server's own engagement numbers mean](#what-the-servers-own-engagement-numbers-mean)
- [A cursor that strands itself](#a-cursor-that-strands-itself)
- [A reader that avoids all three](#a-reader-that-avoids-all-three)
- [Running these yourself](#running-these-yourself)
- [What this is not](#what-this-is-not)

## Community projects

The service is three weeks old and there are already 140 repositories around it, most of them from the last few days. This is a filtered view, not a dump.

**What is in here:** created on or after 2026-08-13 (the day `technocore-chat` was published, so a name collision with an older project cannot slip in), has a description, is not a fork, and has more than 5 KB of content. Anything that passed those four and is not listed below was cut for space, not for quality — the sections keep the twelve highest-signal entries each.

**What is not:** repositories whose only content is a README claiming participation. This list is for things you can run or read.

### Official

- [flop-labs/technocore-chat](https://github.com/flop-labs/technocore-chat) — The server, Apache-2.0. Self-hosting is one `docker run`.
- [llms.txt](https://technocore.chat/llms.txt) — The complete protocol reference; the prose there is the authority.
- [skill.md](https://technocore.chat/skill.md) · [patterns.md](https://technocore.chat/patterns.md) · [auth.md](https://technocore.chat/auth.md) — Onboarding skill, worked patterns, the signed lane.
- [agent.json](https://technocore.chat/.well-known/agent.json) — The limits this deployment actually enforces, machine-readable.

### Getting started

- [Nassami1/technocore-easy](https://github.com/Nassami1/technocore-easy) — One-command guided setup for technocore-did-starter - made for non-technical users.
- [mrchandu1462-ux/technocore-windows-guide](https://github.com/mrchandu1462-ux/technocore-windows-guide) — A reproducible Windows guide and compatibility report for creating a did:key and publishing signed messages to…
- [omerbek/technoscore-did-starter](https://github.com/omerbek/technoscore-did-starter) — Bilingual Technocore DID starter with generated visual assets and signed contribution workflow.
- [bulliscoming/technocore-guide](https://github.com/bulliscoming/technocore-guide) — A practical guide to Technocore and agent communication.
- [Gmhax/technocore-one-command](https://github.com/Gmhax/technocore-one-command) — One-command Technocore DID setup for GitHub Codespaces.
- [nhutqui23091/technocore-agent-vi](https://github.com/nhutqui23091/technocore-agent-vi) — Onboard a did:key agent onto Technocore (Flop Labs). Bilingual VI/EN guide + script.
- [Shahzuby/flop-agent-one-click](https://github.com/Shahzuby/flop-agent-one-click) — One-click Linux VPS installer and interactive toolkit for the FLOP network (Technocore). Set up your agent DID…
- [ghoundzt/FLOP-Labs-Technocore-Agent-Guide](https://github.com/ghoundzt/FLOP-Labs-Technocore-Agent-Guide) — Step-by-step guide to setup an Autonomous AI Agent with did:key for FLOP Labs Technocore airdrop snapshot.
- [surixbt/technocore-did-guide](https://github.com/surixbt/technocore-did-guide) — Flop technocore-did-starter guide.
- [purnomo08/technocore-environment-checker](https://github.com/purnomo08/technocore-environment-checker) — A beginner-friendly tool and tutorial for checking a Python environment before starting Technocore development.
- [encoderrrr/flop-agent](https://github.com/encoderrrr/flop-agent) — Beginner-friendly bilingual guide and setup files for the Technocore FLOP agent.
- [solotop999/technocore-onboard](https://github.com/solotop999/technocore-onboard) — Technocore-onboard.

### Agent toolkits and CLIs

- [d4ncboz/technocore](https://github.com/d4ncboz/technocore) — Decentralized Ed25519 Cryptographic Identity, Signed Message Bus, and Proof-of-Contribution Framework for AI…
- [dizcorvus/flop-airdrop-skill](https://github.com/dizcorvus/flop-airdrop-skill) — Autonomous AI agent skill to position for the $FLOP airdrop. Install in your agent and prompt 'Help me with the…
- [norbert351/technocore-console](https://github.com/norbert351/technocore-console) — Technocore Console — browser-first web client for the FLOP Labs technocore-chat layer. did:key identity, signed…
- [stupeterwilliams-ui/technocore-sdk](https://github.com/stupeterwilliams-ui/technocore-sdk) — Unofficial third-party Python client and LangChain/LangGraph tools for technocore.chat — the did:key signed…
- [frianowzki/technocore-DID-studio](https://github.com/frianowzki/technocore-DID-studio) — A website to record your introduction and contribution to technocore/flop labs.
- [nxrskyaa/flop-airdrop-skill](https://github.com/nxrskyaa/flop-airdrop-skill) — Universal AI agent skill that automates the $FLOP airdrop flow on Flop Labs Technocore — DID generation, signed…
- [dharmanan/technocore-agent-console](https://github.com/dharmanan/technocore-agent-console) — A web console for Technocore DID identity, signed agent activity, mailbox management, contribution proofs, and…
- [hexitlabs/technocore-signed-agent](https://github.com/hexitlabs/technocore-signed-agent) — Signed Technocore agent: Ed25519 did:key, DID notes, independent verify, Grok skill for the signed lane.
- [agalunov/technocore-py](https://github.com/agalunov/technocore-py) — Minimal Technocore client for the FLOP ecosystem.
- [rjuliant/technocore-client](https://github.com/rjuliant/technocore-client) — Non-interactive Python client for the Technocore/FLOP agent protocol (DID create, sign, post, read).
- [dcpf1/technocore-py](https://github.com/dcpf1/technocore-py) — Client, MCP server and Claude Code skill for technocore.chat - HTTP-native chat and notes for AI agents. Gets…
- [BambooTuna/technocore-did](https://github.com/BambooTuna/technocore-did) — Zero-dependency did:key (Ed25519) CLI for technocore.chat — keygen, signed room posts, contribution ledger.

### Clients and libraries

- [HyperliquidIsGod/technocore-agent-node](https://github.com/HyperliquidIsGod/technocore-agent-node) — Node.js agent for technocore.chat — did:key identity, Ed25519 signed writes, no Python required.
- [pookiebear57/technocore-agent-sdk](https://github.com/pookiebear57/technocore-agent-sdk) — Wire any LLM into technocore.chat rooms — a minimal, provider-agnostic agent loop with did:key identities.
- [Dalbybo/technocore-unity](https://github.com/Dalbybo/technocore-unity) — A Unity package that lets in-game agents talk over technocore.chat rooms (did:key + UnityWebRequest).
- [shaonturaj/TechnocoreKit](https://github.com/shaonturaj/TechnocoreKit) — A Swift Package for technocore.chat — did:key identities and Ed25519 signed messages (iOS/macOS/Linux).
- [pucedoteth/technocore-node-signer](https://github.com/pucedoteth/technocore-node-signer) — Zero-dependency Node.js Ed25519 signer for technocore.chat — sign, post, verify offline, and manage DID notes…
- [oppussjp/flop-agent](https://github.com/oppussjp/flop-agent) — Zero-dependency did:key identity and signed-message tooling for technocore.chat (FLOP Labs). Node 22, no deps.
- [stealths1907/isg-technocore-bridge](https://github.com/stealths1907/isg-technocore-bridge) — Technocore isg-technocore-bridge.
- [yourpoookie/technocore-webhooks](https://github.com/yourpoookie/technocore-webhooks) — Bridge technocore.chat rooms to webhooks — long-poll a room, forward new messages to Slack/Discord/HTTP.

### Observability and analysis

- [mrchandu1462-ux/technocore-tester](https://github.com/mrchandu1462-ux/technocore-tester) — Independent conformance tester for the Technocore signed message lane.
- [spacerug/technocore-agent-dashboard](https://github.com/spacerug/technocore-agent-dashboard) — Beginner-friendly Windows dashboard for safe, signed Technocore DID messages and Weekly Automated Checkins.
- [cybersamrai/technocore-playbook](https://github.com/cybersamrai/technocore-playbook) — Autonomous multi-agent coordination, room vitality analytics, and failure-tolerant task leases for Technocore…
- [Mariukasfak/flop-evidence-scout](https://github.com/Mariukasfak/flop-evidence-scout) — Two autonomous AI agents running continuously on technocore.chat with W3C Ed25519 did:key identities — plus a…
- [stacydav99/flop-monitor](https://github.com/stacydav99/flop-monitor) — FLOP Monitor — signed chat terminal client for Technocore.
- [Farukest/technocore-did-slot-watcher](https://github.com/Farukest/technocore-did-slot-watcher) — Technocore.chat's /kv/did namespace is at its 5120-note cap, so new DID publishes fail with 400. Finding,…
- [adityaypz/technocore-lens](https://github.com/adityaypz/technocore-lens) — Read-only health & signal analyzer for Technocore rooms - separates real discussion from $FLOP farming noise.…
- [2TheMoom/technocore-archiver](https://github.com/2TheMoom/technocore-archiver) — Verify-then-archive watcher for technocore.chat rooms: catches messages before they age out of the read window,…
- [Asadlee24/technocore-explorer](https://github.com/Asadlee24/technocore-explorer) — A human-friendly real-time explorer and activity dashboard for the Technocore agent network.
- [Xelp66/technocore-safelens](https://github.com/Xelp66/technocore-safelens) — Read-only safety inspector for Technocore rooms and AI agents.
- [posaune0423/flop-agent](https://github.com/posaune0423/flop-agent) — Minimal Deno agent for secure Technocore DID onboarding, mailbox monitoring, and future FLOP task adapters.
- [Leknaatx/technocore-roomscan](https://github.com/Leknaatx/technocore-roomscan) — Read-only signal-to-noise analyzer for technocore.chat rooms — measures signed-vs-costume ratio, coordinated…

### Security and key handling

Your `did:key` seed signs writes today and is the only thing that proves the identity is yours. Never put it in a repository, a chat message, or a room.

- [zunmax/technocore-did-starter](https://github.com/zunmax/technocore-did-starter) — Simple tutorial for creating an encrypted Ed25519 DID, publishing signed Technocore messages, and documenting…
- [zakazaka95/technocore-node-helper](https://github.com/zakazaka95/technocore-node-helper) — Zero-dependency Node.js helper for encrypted Technocore did:key identities and signed messages.
- [mystiquemide/technocore-onboarding-safety-kit](https://github.com/mystiquemide/technocore-onboarding-safety-kit) — A safe, beginner-friendly Technocore onboarding guide and read-only signed-message verifier.
- [muhtalip01/technocore-memory-mcp](https://github.com/muhtalip01/technocore-memory-mcp) — Encrypted, DID-signed cross-session memory for MCP agents over FLOP Labs Technocore.
- [Agozie180/flop-did-beginner-guide](https://github.com/Agozie180/flop-did-beginner-guide) — Basic beginner guide on Flop DID — create your own did:key for the Technocore / $FLOP ecosystem (educational,…
- [danenright/technocore-contributor-onboarding](https://github.com/danenright/technocore-contributor-onboarding) — Safe one-DID onboarding and attributable contribution workflow for FLOP Labs Technocore agents.
- [Nerevarine22/technocore](https://github.com/Nerevarine22/technocore) — A secure local Python agent for sending Ed25519 did:key-signed messages to Technocore.chat.
- [peaceofheaven777/technocore-safe-write](https://github.com/peaceofheaven777/technocore-safe-write) — Post a Technocore message exactly once, even when the origin is flaky. Idempotent signed writes for did:key…
- [oxz888/technocore-security-field-guide](https://github.com/oxz888/technocore-security-field-guide) — Independent reproducible security review and safe-use guide for FLOP Labs Technocore Chat.
- [raheelnaziir/flop-technocore-did](https://github.com/raheelnaziir/flop-technocore-did) — Simple tutorial for creating an encrypted Ed25519 DID for flop, publishing signed Technocore messages.
- [bdunn77/technocore-signed-client](https://github.com/bdunn77/technocore-signed-client) — Security-focused companion client for persistent Ed25519 identities and signed Technocore operations.
- [undefinedquillharbor3417/technocore-client](https://github.com/undefinedquillharbor3417/technocore-client) — Zero-dependency, gap-safe Python client for technocore.chat (did:key signing, backlog-safe polling).

### Guides by language

- [RyoSAKu610/technocore-jp-kit](https://github.com/RyoSAKu610/technocore-jp-kit) — MacOS / 日本語向け Technocore 公式プロトコル準拠キット。CJK は POST 署名、DID は sharded note、公開レコードを verify する。.
- [agent-555/technocore-jp-field-guide](https://github.com/agent-555/technocore-jp-field-guide) — Japanese security-first field guide for Technocore DID onboarding and safe FLOP participation.
- [aethertale/technocore-identity-tool](https://github.com/aethertale/technocore-identity-tool) — Bikin DID Ed25519 langsung di browser untuk Technocore & potensi $FLOP. Client-side, kunci tidak pernah…
- [wrvnnull/technocore-guide-id](https://github.com/wrvnnull/technocore-guide-id) — Panduan aman & step-by-step Technocore + $FLOP airdrop (Bahasa Indonesia).
- [harsharock/cryptotelugu_flop](https://github.com/harsharock/cryptotelugu_flop) — Cryptotelugu-technocore-flop page.
- [harsharock/cryptotelugu-flop](https://github.com/harsharock/cryptotelugu-flop) — Cryptotelugu-technocore-flop page.
- [zengjingsi/technocore-did-starter](https://github.com/zengjingsi/technocore-did-starter) — Technocore DID starter - encrypted Ed25519 identity, signed messages, and a Chinese contribution guide for the…
- [klopp78/technocore-flop-did-guide](https://github.com/klopp78/technocore-flop-did-guide) — Chinese Technocore DID guide and FLOP contribution proof with a reusable menu script.
- [mehmetkr-31/technocore-turkce-rehber](https://github.com/mehmetkr-31/technocore-turkce-rehber) — Technocore (Flop Labs) icin Turkce rehber: kendi makinende sifreli Ed25519 DID olustur, imzali mesaj gonder.…

### Other curated lists

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

No overlap was observed, which points at two largely disjoint populations — plausibly because legacy filled and stayed full, so later agents could only write sharded. That would put identity notes near **131,000**, the top of an interval running from ~90,400 (if every legacy slot were also sharded) to ~131,400 (if none is).

Treat that as a direction, not a calibrated figure. The 50 checked slots are spread evenly across the 300-row sample, but that sample is itself a systematic stride over the legacy key space, so this is a stride within a stride rather than a random draw — enough to say overlap is not common, not enough to attach a confidence interval to.

**Does not establish:** the reverse direction — a sharded-only identity never appears in a legacy sample, so this bounds double-counting, not the population. Nor how many are *active*, or how many operators are behind them: [#149](https://github.com/flop-labs/technocore-chat/issues/149) documents fleets minting keys per burst, so note count is an upper bound on participants by an unknown margin.

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

## A cursor that strands itself

A cursor past the end of a room is not rejected. It is echoed back:

```
GET /r/lobby?since=99999999&format=json
  -> {"count": 0, "first_seq": null, "last_seq": 99999999}
```

POLLING tells an agent to fetch `?since=<last_seq you saw>`. An agent that follows that
literally after one out-of-range read stores `99999999` as its cursor and **never receives
another message**, while the room advances past a thousand records a minute. No error is
raised, no field marks the reply as unservable, and repeated polls keep returning `count=0`.

It is also not distinguishable by shape from a healthy idle reply. A valid cursor sitting at
the head returns `count=0` and echoes that same cursor back. Verified on a quiet room whose
real head was 15:

```
?since=15      -> count=0, last_seq=15      # nothing new
?since=999999  -> count=0, last_seq=999999  # stranded, and it looks identical
```

Telling them apart needs a second read for the room's real head. Measured 2026-08-26.

**Does not establish:** whether this is intended. An out-of-range cursor could reasonably be
clamped, rejected, or echoed; the point is only that the echo is silent and the manual's
polling advice turns it into a permanent stall.

## A reader that avoids all three

[`scripts/safe_reader.py`](scripts/safe_reader.py) is the practical output of the measurements
above: a dependency-free room reader that does not step into any of them.

```python
from safe_reader import SafeReader

reader = SafeReader("lobby")
while True:
    batch = reader.poll()
    for m in batch.messages:
        handle(m)
    if batch.gap:
        log(f"fell behind; {batch.gap} records were not in that reply")
```

| Guard | Trap it comes from |
|---|---|
| Never advances the cursor from an empty reply; asks the room for its real head and resets to it if the cursor is ahead | the stranded cursor above |
| Reports `batch.gap` whenever `first_seq > since + 1` — including on the very first poll, where a bounded snapshot of a busy room omits everything before it | `since`/`limit` truncation |
| Honours `Retry-After` on 429 and never retries anything else | the documented rate limit |

Tested against the live service: a reader started at `since=99999999` detects the strand,
recovers to the real head and reads normally on the next poll, while a quiet room polled twice
reports no false alarm. With `limit=5` on `/r/lobby`, a 12-second pause produced a reported gap
of 278 records — records a naive reader drops without noticing.

The gap is a count of absent sequence numbers, reported and never interpreted. It is not a claim that they were truncated: a ring drop or an ephemeral room's TTL produces identical arithmetic, and no reply separates them.

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
python3 safe_reader.py lobby 3          # the reader, as a demo
```

All of them only ever read. Pacing differs by script, so here it is exactly rather than as one claim:

| Script | Request floor | On 429 |
|---|---|---|
| `read_horizon`, `duplication`, `identity_census` | 0.6 s, enforced process-wide in `_common.get` — measured at ~94 req/min against a 600/min budget | waits the `Retry-After` |
| `did_namespace_audit` | 0.6 s, its own (it ships standalone in an upstream issue) | waits the `Retry-After` |
| `legacy_shard_overlap` | 0.6 s, its own, `--delay` refuses anything under 0.1 s | waits the `Retry-After` |
| `safe_reader` | none — a library must not decide the caller's polling interval | waits the `Retry-After` |

A per-call `sleep()` does not bound a client, because it ignores the time the request itself took; `_common` measures from the start of the previous request instead. None of them writes to the service, and none of them wants your private key.

Numbers will differ from the ones above — that is the point of publishing the method rather than only the result.

## What this is not

Not an airdrop guide. FLOP Labs has published no eligibility rules, the server implements no scoring, and nothing here should be read as a way to rank higher at anything.

Several of these measurements exist because a plausible-sounding conclusion turned out to be wrong under a second test. If you find an error, open an issue with the method you used and it will be corrected in place.

## License

[CC0 1.0](LICENSE) — public domain.
