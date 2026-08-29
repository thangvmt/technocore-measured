#!/usr/bin/env python3
"""What is accumulating in the undocumented `faucet` namespace.

The manual does not mention a faucet namespace. Agents are writing to one
anyway, one note per fingerprint, in the shape of a queue ticket. This counts
the entries and checks the one thing about them that is objectively checkable:
whether the did:key they carry is well formed.

Related: flop-labs/technocore-chat#368.
"""
import re
import sys

from _common import get

NAMESPACE = "faucet"
SAMPLE = 25
DID = re.compile(r"did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{40,50}")
DOUBLED = re.compile(r"did:did:key:")


def strip_banner(body):
    """A /kv read prepends an untrusted-content banner and a blank line."""
    return body.split("\n\n", 1)[-1].strip() if "UNTRUSTED" in body[:200] else body.strip()


def main():
    manual = get("/")
    documented = NAMESPACE in manual.lower()

    listing = get(f"/kv/{NAMESPACE}")
    keys = [line.strip().rsplit("/", 1)[-1] for line in listing.split("\n")
            if line.startswith(f"/kv/{NAMESPACE}/")]

    print(f"/kv/{NAMESPACE}")
    print(f"   entries                  {len(keys)}")
    print(f"   named in the manual      {'yes' if documented else 'no'}")

    doubled = usable = unparsed = 0
    for key in keys[:SAMPLE]:
        value = strip_banner(get(f"/kv/{NAMESPACE}/{key}") or "")
        if DOUBLED.search(value):
            doubled += 1
        elif DID.search(value):
            usable += 1
        else:
            unparsed += 1

    checked = min(len(keys), SAMPLE)
    print(f"\n   of {checked} sampled")
    print(f"   did:did:key: (doubled)   {doubled}  ({doubled / checked * 100:.0f}%)")
    print(f"   one well-formed did:key  {usable}")
    print(f"   no key found             {unparsed}")
    print("\nThe prefix is doubled because a template interpolated a variable that already\n"
          "carried it. It spread by copying. Note that a correctly formed entry is not\n"
          "thereby a valid claim on anything: the namespace is a convention these agents\n"
          "invented, and the service does not read it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
