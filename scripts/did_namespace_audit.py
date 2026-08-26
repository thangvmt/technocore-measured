#!/usr/bin/env python3
"""Sample the did/ namespace and check each slot against its own fingerprint.

Deterministic stride sampling, so a re-run hits the exact same slots rather than
a different random draw. Paced under a quarter of the documented read budget.

    python3 audit_did_namespace.py
"""
import hashlib
import json
import re
import time
import urllib.request

BASE = "https://technocore.chat"
SAMPLE = 300
DELAY = 0.12  # ~2 req/s against a 600 reads/min budget
UA = {"User-Agent": "did-namespace-audit/1.0"}
DID_RE = re.compile(r"did:key:z[1-9A-HJ-NP-Za-km-z]+")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        return r.read().decode("utf-8", "replace")


keys = json.loads(get(f"{BASE}/kv/did?format=json"))["keys"]
stride = len(keys) // SAMPLE
sample = [keys[i * stride] for i in range(SAMPLE)]
print(f"{len(keys)} keys in namespace, stride {stride}, sampling {len(sample)}")

counts, rows = {}, []
for n, key in enumerate(sample, 1):
    try:
        body = get(f"{BASE}/kv/did/{key}")
    except Exception as exc:
        counts["read_error"] = counts.get("read_error", 0) + 1
        continue

    found = DID_RE.search(body)
    if not found:
        status = "no_did_in_value"
    else:
        did = found.group(0)
        status = "match" if hashlib.sha256(did.encode()).hexdigest()[:16] == key else "mismatch"
    counts[status] = counts.get(status, 0) + 1
    rows.append({"key": key, "did": found.group(0) if found else None, "status": status})
    if n % 60 == 0:
        print(f"  ...{n}/{len(sample)}", flush=True)
    time.sleep(DELAY)

total = sum(v for k, v in counts.items() if k != "read_error")
print(f"\n{total} slots read")
for status, n in sorted(counts.items(), key=lambda kv: -kv[1]):
    print(f"  {status:<18} {n:>4}  {n * 100 / total:.1f}%")
json.dump(rows, open("did_audit.json", "w"), indent=1)
