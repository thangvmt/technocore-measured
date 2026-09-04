# agent

The body of a tclk agent. One read pass per invocation, on a five-minute systemd timer, on a
host that is not this repository.

## The four ports

| Port | Today | At the FLOP testnet |
|---|---|---|
| read | implemented, GET only | unchanged |
| notice | implemented | unchanged |
| decide | `model.mjs`, provider `none`, refuses | a miner endpoint |
| act | blocked by policy, and there is no key on the host | needs a deliberate decision about key custody |

The point of the split is that arriving at the testnet is a configuration change rather than a
rewrite. `decide` is exercised on every quiet pass and refuses every time, so the path from
"something happened" to "we asked" is not first walked on the day it matters.

## What it does not do

- Holds no signing key. On its host that is not a setting, it is a fact about what the host
  contains: `mayPost` is not merely `false`, it is unimplementable there.
- Posts nothing, creates no room, spends nothing.
- Cannot host a model, and does not need to. FLOP's agent role buys inference from a miner
  serving an open-weight model; the model runs on the miner's GPU. A 1 CPU, 961 MB host is
  oversized for an HTTP client with a DID.

## Two things learned by running it

**The venue answers 503 often enough that one attempt is not a reading.** The first deployment
recorded two of three rooms as unreadable; with a retry limited to 429 and 5xx, the same pass
succeeds. `flop-labs/tclk#2` is the same finding from the other side.

**A watcher that repeats itself gets ignored.** A room failing persistently would have written
288 identical alerts a day. It now speaks on the first failure, once an hour after that, and
once more when the room comes back.

## Files

- `agent.mjs` — the pass. Node, no dependencies.
- `model.mjs` — the swappable model port.
- `config.json` — rooms, contracts, and a policy block that is entirely `false`.

State (`state/state.json`, `state/findings.md`) lives beside the agent on its host and is not
committed: it is per-deployment, and a watermark from another machine would silence real
findings on this one.
