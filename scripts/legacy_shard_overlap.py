#!/usr/bin/env python3
"""How many identities occupy BOTH the legacy and the sharded note path?

Needed because /kv/did/<fp> and /kv/did-<fp[:2]>/<fp[2:]> are two addresses derived
from one fingerprint. Summing the two namespaces counts a DID that wrote both twice,
which inflates any "how many agents are there" estimate by an unknown factor.

Method: take DIDs already parsed out of a legacy sample (did_audit.json, produced by
did_namespace_audit.py), and for each one check whether its sharded address holds the
same DID. Only slots whose fingerprint matched are used — a misfiled slot says nothing
about its occupant's own address.

    python3 legacy_shard_overlap.py [max_checks] [delay_seconds]
"""
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "https://technocore.chat"
UA = {"User-Agent": "legacy-shard-overlap/1.0"}
DEFAULT_DELAY = 0.6


def get(url, retries=4):
    """Body, or None for 404 — an absent note is an answer, not an error.

    429 is retried on the Retry-After the service names; every other status is raised.
    """
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code != 429:
                raise
            wait = float(e.headers.get("Retry-After") or 2 ** attempt)
            print(f"    429; waiting {wait:.1f}s as instructed", flush=True)
            time.sleep(wait)
    raise RuntimeError("rate limited past the retry budget")


def main():
    max_checks = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    delay = float(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DELAY
    if max_checks < 1:
        print("max_checks must be >= 1"); return 1
    if delay < 0.1:
        print("delay must be >= 0.1s — this reads a shared public service"); return 1

    try:
        rows = json.load(open("did_audit.json"))
    except FileNotFoundError:
        print("did_audit.json not found — run did_namespace_audit.py first")
        return 1

    pool = [r for r in rows if r.get("status") == "match" and r.get("did")]
    # Take an evenly spaced subset, not the first N. did_audit.json is ordered by the
    # legacy stride, so slicing the head samples only the low end of the key space.
    step = max(1, len(pool) // max_checks)
    usable = [pool[i * step] for i in range(min(max_checks, len(pool) // step))]
    print(f"{len(pool)} usable rows in the frame; checking {len(usable)} spread evenly across it")
    print(f"pacing: >={delay}s between requests\n")

    both, legacy_only, errors = 0, 0, 0
    for n, row in enumerate(usable, 1):
        did = row["did"]
        fp = hashlib.sha256(did.encode()).hexdigest()[:16]
        try:
            body = get(f"{BASE}/kv/did-{fp[:2]}/{fp[2:]}")
        except Exception as exc:
            errors += 1
            print(f"    error on {fp}: {exc}")
            time.sleep(delay)
            continue
        # Exact match on a payload line, not substring: a note holding a different DID
        # that merely contains this one as a prefix must not count as present.
        present = False
        if body is not None:
            for line in body.splitlines():
                line = line.strip()
                if line and not line.startswith("!!") and line.split()[0] == did:
                    present = True
                    break
        if present:
            both += 1
        else:
            legacy_only += 1
        if n % 20 == 0:
            print(f"  ...{n}/{len(usable)}", flush=True)
        time.sleep(delay)

    checked = both + legacy_only
    if not checked:
        print("nothing checked")
        return 1
    share = both / checked
    print(f"\n{checked} checked, {errors} errors")
    print(f"  also present in the sharded path  {both:>4}  {share * 100:.1f}%")
    print(f"  legacy only                       {legacy_only:>4}  {(1 - share) * 100:.1f}%")
    print(f"\n  Read as: {share * 100:.0f}% of correctly-filed legacy slots are a second address")
    print("  for an identity the sharded namespace also holds. Subtract that many before")
    print("  treating legacy + sharded as a population.")
    print("\n  Does not establish: the reverse direction. A sharded-only identity never")
    print("  appears in a legacy sample, so this bounds double-counting, not the total.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
