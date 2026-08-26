#!/usr/bin/env python3
"""Sample the did/ namespace and classify what each slot actually holds.

Four categories, all derived here so the numbers are reproducible from this file
alone:

  match           valid 34-byte ed25519-pub did:key whose sha256[:16] IS the slot key
  wrong_slot      valid 34-byte ed25519-pub did:key filed under a different slot
  not_ed25519     a did:key token that does not decode to 2-byte 0xed01 + 32 bytes
  no_did          no did:key token in the value at all

Deterministic stride sampling, so a re-run hits the same slots rather than a
different draw. Pacing is a real floor of DELAY seconds between requests, plus
Retry-After backoff on 429 — see PACING below.

    python3 did_namespace_audit.py [sample_size] [delay_seconds]
"""
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request

BASE = "https://technocore.chat"
UA = {"User-Agent": "did-namespace-audit/2.0"}
DID_RE = re.compile(r"did:key:z[1-9A-HJ-NP-Za-km-z]+")
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
MULTICODEC_ED25519_PUB = b"\xed\x01"
ED25519_DID_BYTES = 34  # 2 multicodec + 32 key

# PACING: the documented budget is 600 reads/min (10/s). A sleep of D seconds
# bounds this client at 1/D requests per second BEFORE latency, so D must be
# chosen against that ceiling and not against an assumed round-trip time.
# 0.6s => at most ~1.67 req/s => ~100/min, a sixth of the budget even if every
# response were instant.
DEFAULT_DELAY = 0.6


def b58decode(s):
    n = 0
    for ch in s:
        n = n * 58 + B58.index(ch)
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\x00" * (len(s) - len(s.lstrip("1"))) + body


def is_ed25519_did(did):
    """True only for multibase-z base58btc of 0xed01 + 32 key bytes."""
    if not did.startswith("did:key:z"):
        return False
    try:
        raw = b58decode(did[len("did:key:z"):])
    except ValueError:
        return False
    return len(raw) == ED25519_DID_BYTES and raw[:2] == MULTICODEC_ED25519_PUB


def get(url, delay):
    """GET with Retry-After backoff. Never retries a non-429 error."""
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            wait = float(e.headers.get("Retry-After") or (delay * 2 ** (attempt + 1)))
            print(f"    429, waiting {wait:.1f}s", flush=True)
            time.sleep(wait)
    raise RuntimeError("rate limited past the retry budget")


def classify(slot_key, body):
    found = DID_RE.search(body)
    if not found:
        return "no_did", None
    did = found.group(0)
    if not is_ed25519_did(did):
        return "not_ed25519", did
    fingerprint = hashlib.sha256(did.encode()).hexdigest()[:16]
    return ("match" if fingerprint == slot_key else "wrong_slot"), did


def main():
    sample_size = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    delay = float(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DELAY

    keys = json.loads(get(f"{BASE}/kv/did?format=json", delay))["keys"]
    stride = max(1, len(keys) // sample_size)
    sample = [keys[i * stride] for i in range(min(sample_size, len(keys) // stride))]
    print(f"{len(keys)} keys in namespace, stride {stride}, sampling {len(sample)}")
    print(f"pacing: >={delay}s between requests, at most {1 / delay:.2f} req/s\n")

    counts, rows, errors = {}, [], 0
    started = time.time()
    for n, key in enumerate(sample, 1):
        try:
            body = get(f"{BASE}/kv/did/{key}", delay)
        except Exception as exc:
            errors += 1
            print(f"    read error on {key}: {exc}")
            continue
        status, did = classify(key, body)
        counts[status] = counts.get(status, 0) + 1
        rows.append({"key": key, "did": did, "status": status})
        if n % 50 == 0:
            print(f"  ...{n}/{len(sample)}", flush=True)
        time.sleep(delay)

    total = len(rows)
    elapsed = time.time() - started
    print(f"\n{total} slots read, {errors} errors, {elapsed:.0f}s "
          f"({total / elapsed * 60:.0f} reads/min actual)")
    for status in ("match", "wrong_slot", "not_ed25519", "no_did"):
        n = counts.get(status, 0)
        print(f"  {status:<14} {n:>4}  {n * 100 / total:.1f}%" if total else f"  {status}: 0")
    json.dump(rows, open("did_audit.json", "w"), indent=1)
    print("\nrows written to did_audit.json")


if __name__ == "__main__":
    main()
