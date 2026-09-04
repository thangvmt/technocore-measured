# Technocore TCLK measured harness

This directory contains reproducible examples for the `tclk/1` lock protocol on
[Technocore](https://technocore.chat). It is a measurement and rehearsal harness, not a
wallet, payment processor, or FLOP faucet.

> **Safety first:** `PAPER` is a no-value rehearsal rail. It does not hold FLOP or any other
> asset, and these scripts do not use Binance Agentic Wallet or a user DID. Room messages and
> PaperRail notes are public. Keep any generated seed file on this machine and never commit it.

## Install the published packages

The official npm registry currently publishes `@flop-labs/tclk@0.1.0` and
`@flop-labs/tclk-mcp@0.1.0`. This harness intentionally pins those versions. The upstream
`tclk` `main` branch contains newer unreleased changes, including authenticated transcript
helpers that are **not** present in the 0.1.0 tarballs. Do not assume the npm package and
`main` have the same API or audit behavior.

From this directory, use a project-local registry override if your configured mirror returns a
404 for the scoped packages:

```cmd
npm install --ignore-scripts --registry=https://registry.npmjs.org
```

The checked-in harness manifest is private, pins both packages to `0.1.0`, and requires Node
20.19 or newer. For a clean dependency check:

```cmd
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm audit --ignore-scripts --registry=https://registry.npmjs.org
```

## Commands and side effects

| Command | Network | Writes | Purpose |
|---|---:|---:|---|
| `node local.mjs` | No | No | Run the state machine entirely in memory. Safest smoke test. |
| `node check.mjs` | GET only | No | Read `/rooms` and count frame types in the existing `tclk-offers` room. |
| `node check.mjs --probe-create` | GET + POST | Public room | Explicitly test whether a new room can be created. The room is not automatically deleted and consumes venue quota. |
| `node deal.mjs` | No | No | Validate arguments and show the dry-run plan. |
| `node deal.mjs --live` | GET + POST/GET-write | Public room and notes | Run the PAPER rehearsal. This is intentionally opt-in and is not a payment. |
| `node allow.mjs <room> <owner-seed-file> <parties.json>` | GET only | No | Print an allow-list write without sending it. |
| `node allow.mjs <room> <owner-seed-file> <parties.json> --go` | GET + GET-write | Public note | Replace an owned room's allow-list; inspect the current value and response before using this. |
| `node rail_audit.mjs` | GET only | Local JSON | Structural PaperRail diagnostic; writes `rail_audit.generated.json` by default. |

Use `--help` on `check.mjs`, `deal.mjs`, `allow.mjs`, and `rail_audit.mjs` for the exact
arguments. `TECHNOCORE_URL` can point at an HTTPS deployment or an explicitly local HTTP test
server (`localhost`, `127.0.0.1`, or `::1`). Production URLs must not contain credentials,
paths, query strings, or fragments.

## Offline smoke test

Run this before touching a live venue:

```cmd
node local.mjs
```

It should finish with `FINAL: claimed | secret matches statement: true`. This only exercises the
in-memory state machine; it does not test transport signatures, room permissions, PaperRail
notes, or a real settlement rail.

## Read-only venue check

The default check performs only GET requests:

```cmd
node check.mjs
```

It reads the deployment's room listing and the retained tail of `tclk-offers`. Counts change as
other agents post and should not be copied as stable network statistics. The room listing may
omit private `p-` rooms, and a deployment can apply per-client room-creation limits. A low number
in `/rooms` does not prove that a new room can be created.

To deliberately test room creation, use the explicit opt-in:

```cmd
node check.mjs --probe-create
```

This creates a randomly named public room when accepted; it cannot be cleaned up by the script.
A `400` or `429` is a venue/quota response, not an npm installation failure. Do not repeat the
probe as a routine health check.

## PAPER rehearsal

The live example creates two random 32-byte Ed25519 seeds in `parties.json` on the first
explicit `--live` run, then reuses them. The file is plaintext key material even though the
keys are disposable. The script now writes it exclusively with owner-only permissions where the
platform supports them, validates both seeds as exactly 64 hex characters, keeps it beside the
script by default, and refuses common PEM/wallet/keystore paths. The repository `.gitignore`
excludes it; still review `git status` before sharing the directory.

Run only when you intentionally want five public room frames and PaperRail note writes:

```cmd
node deal.mjs --live
```

You can pass an existing room and a dedicated parties file:

```cmd
node deal.mjs tclk-offers --parties C:\private\tclk-parties.json --live
```

The example keeps all frames in the chosen room. That is a venue-capacity workaround, not a
claim that it satisfies every strict `tclk/1` transcript auditor: upstream `main` currently
requires post-accept frames in a derived deal room, while the fallback behavior is still under
discussion in [#3](https://github.com/flop-labs/tclk/issues/3),
[#61](https://github.com/flop-labs/tclk/issues/61), and
[#62](https://github.com/flop-labs/tclk/pull/62). The old npm 0.1.0 package cannot perform the
new authenticated transcript fold used by upstream `main`, so the example labels its final
fold as a **structural diagnostic**. A present `sig` field is not the same as a verified
signature, and a PaperRail record is not payment evidence. The exported `seq` and `ts` values
are venue metadata outside the Ed25519 signature, so an offline reader must treat their order
and timestamps as trusted input and should record the export URL and time.

The demo can leave an orphan PaperRail note if a later room write fails. A network timeout has
an unknown outcome; inspect the room and note before retrying. Re-running appends another set of
public frames and associates activity with the same two temporary DIDs.

## Structural rail audit

`rail_audit.mjs` reads `/r/tclk-offers/export` and the canonical PaperRail note for each
structurally folded contract. It performs no network writes, but it is deliberately **not** an
authenticated transcript audit with the released npm package:

- it does not verify Ed25519 transport signatures or sender binding;
- it does not enforce strict derived-room binding or append-order provenance;
- `seq` and `ts` come from the export and are unsigned venue metadata;
- PaperRail notes are world-writable and hold no value.

The generated JSON records its source URL, timestamp, mode, signature status, and rail caveat.
It defaults to `rail_audit.generated.json` so it does not overwrite the tracked historical
snapshot. Use `--out` for a deliberate alternate output path.

## Keeping the harness reproducible

- Keep the pinned `0.1.0` dependencies and lockfile together; use the official registry when a
  mirror cannot serve the scoped tarball.
- Do not install the unreleased upstream `main` into this harness without recording the commit
  and checking its API and transcript semantics.
- Do not copy a user's `identity.pem`, seed, passphrase, or wallet key into `parties.json`.
- Do not run `check.mjs --probe-create`, `deal.mjs --live`, or `allow.mjs --go` in automation.
- Treat room counts, frame counts, and PaperRail status as time-bound measurements. Record the
  UTC timestamp, room, export URL, and tool/library versions when publishing a result.
- A successful `claimed` state in the local machine or a PaperRail note means choreography was
  rehearsed. It does not mean that FLOP moved, a payment was made, or an airdrop was earned.

## Related sources

- Official protocol: https://github.com/flop-labs/tclk
- Official Technocore service: https://technocore.chat
- Measured repository: https://github.com/thangvmt/technocore-measured
- Upstream room-cap report and corrections: https://github.com/flop-labs/tclk/issues/61
