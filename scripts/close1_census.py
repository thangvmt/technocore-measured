"""Close Call (close-1), read back from the referee's own posts.

FLOP Labs ran close-1 on this server from 2026-09-25 12:00 UTC to the lock at 2026-10-04 09:00 UTC.
Its referee posted every five-minute sweep into rooms nobody else can write to. This script reads
four of them through the paced exporter and reports:

  registrations   owners and keys holding a position, one row a day
  the 452k quote  what "452k agentic traders" (26 Sep) matches in the referee's numbers
  identical rows  the largest group of identical scores in the public top 25, sweep by sweep
  the final two   how long the eventual 1st and 2nd carried the same score
  final           the signed standings post: S, owners, fees, the top three, the record hash

Read-only, standard library only. If the `cryptography` package happens to be installed, every
signature is checked against the referee key; without it the script checks the sender DID only and
says so.

    python3 close1_census.py
"""
import base64
import collections
import json

from _common import get

# The sender of the seed post (d-close1-price seq 1, t="seed", package bae09812...). Every post
# counted below must come from it.
REFEREE = "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte"
ROOMS = ("d-close1-price", "d-close1-state", "d-close1-positions", "d-close1-pnl")
MINT = 10_000  # POLF per owner key, from the rules
QUOTE = ("2026-09-26T20:30:33Z", "https://x.com/CryptoHayes/status/2103945339594252724")
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
except ImportError:
    Ed25519PublicKey = None


def did_public_key(did):
    body = did.removeprefix("did:key:z")
    n = 0
    for ch in body:
        n = n * 58 + B58.index(ch)
    raw = b"\x00" * (len(body) - len(body.lstrip("1"))) + n.to_bytes((n.bit_length() + 7) // 8, "big")
    if raw[:2] != b"\xed\x01" or len(raw) != 34:
        raise ValueError(f"not an ed25519 did:key: {did}")
    return raw[2:]


def fetch(room):
    text = get(f"/r/{room}/export?format=json")
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def check(room, msgs):
    """(posts from another sender, bad signatures or None when signatures were not checked)"""
    foreign = sum(m.get("from") != REFEREE for m in msgs)
    if Ed25519PublicKey is None:
        return foreign, None
    key = Ed25519PublicKey.from_public_bytes(did_public_key(REFEREE))
    bad = 0
    for m in msgs:
        sig = m.get("sig") or ""
        try:
            key.verify(base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4)),
                       f"{room}|{m['nonce']}|{m['text']}".encode())
        except (InvalidSignature, ValueError, KeyError):
            bad += 1
    return foreign, bad


def by_sweep(msgs):
    out, other = {}, []
    for m in msgs:
        body = json.loads(m["text"])
        if "n" in body:
            out[body["n"]] = (body, m["ts"])
        else:
            other.append(body)
    return out, other


def registrations(state, pos):
    print("\nRegistrations, one row a day (sweep, UTC, owners, keys holding a position)")
    last = max(state)
    for n in sorted(set(range(1, last + 1, 288)) | {last}):
        s, ts = state[n]
        p, _ = pos[n]
        print(f"  {n:5d}  {ts[:16]}  {s['owners']:>12,}  {p['longs'] + p['shorts']:>12,}")


def the_quote(state, pos):
    at, url = QUOTE
    n = max(k for k, (_, ts) in pos.items() if ts <= at)
    p, ts = pos[n]
    print(f"\n\"452k agentic traders\" ({at}, {url})")
    print(f"  last sweep before it: {n} at {ts[:19]}: {p['longs'] + p['shorts']:,} keys holding a position "
          f"({p['longs']:,} long, {p['shorts']:,} short), {state[n][0]['owners']:,} owners registered")
    first = min(k for k, (b, _) in pos.items() if b["longs"] + b["shorts"] >= 452_000)
    print(f"  keys holding a position first reached 452,000 at sweep {first} ({pos[first][1][:16]}), "
          f"while owners registered stood at {state[first][0]['owners']:,}")


def identical_rows(pnl):
    groups, counts = {}, collections.Counter()
    for n, (b, ts) in sorted(pnl.items()):
        scores = [v for _, v in b.get("top", []) if float(v) != 0]
        if not scores:
            continue
        v, k = collections.Counter(scores).most_common(1)[0]
        groups[n] = (k, v, ts, len(b["top"]))
        for floor in (5, 10, 20):
            counts[floor] += k >= floor
    k = max(g[0] for g in groups.values())
    hits = [n for n, g in groups.items() if g[0] == k]
    print("\nIdentical scores in the public top 25 (zero scores ignored)")
    first, last = hits[0], hits[-1]
    print(f"  largest group: {k} of {groups[first][3]}, reached in {len(hits):,} sweeps, "
          f"first {first} ({groups[first][2][:16]}, at {groups[first][1]}), "
          f"last {last} ({groups[last][2][:16]}, at {groups[last][1]})")
    print(f"  sweeps with a group of 5+: {counts[5]:,}, 10+: {counts[10]:,}, 20+: {counts[20]:,} of {len(pnl):,}")


def final_two(pnl, places):
    a, b = places[0][0], places[1][0]
    both = [n for n, (body, _) in sorted(pnl.items())
            if a in dict(body.get("top", [])) and b in dict(body.get("top", []))]
    same = [n for n in both if dict(pnl[n][0]["top"])[a] == dict(pnl[n][0]["top"])[b]]
    print(f"\nThe final 1st (...{a[-6:]}) and 2nd (...{b[-6:]})")
    print(f"  both in the public top 25 in {len(both):,} sweeps; identical score in {len(same):,} of them, "
          f"sweeps {same[0]} to {same[-1]}")
    later = [n for n in both if n > same[-1]]
    if later:
        print(f"  first sweep after that with both listed: {later[0]} ({pnl[later[0]][1][:16]}), "
              f"{dict(pnl[later[0]][0]['top'])[a]} vs {dict(pnl[later[0]][0]['top'])[b]}")


def final(standings, price):
    s = standings[-1]
    S = float(s["S"])
    low = min(float(b["ref"]["px"]) for b, _ in price.values())
    print("\nFinal standings post (t=standings)")
    print(f"  S {s['S']}, owners {s['owners']:,}, fees {float(s['fees']):,.2f} POLF, zero_sum {s['zero_sum']}")
    for row in s["places"]:
        print(f"  place {row[2]}: ...{row[0][-6:]} {row[1]}")
    print(f"  record hash {s['file']}: the full per-owner record is at "
          "https://challenges.technocore.chat/close-1/final/README.txt")
    print(f"  buy and hold, before fees: all {MINT:,} POLF long at the lowest close ({low}) and held to S "
          f"= {MINT / low * (S - low):+.1f}")


def main():
    data = {}
    for room in ROOMS:
        msgs = fetch(room)
        foreign, bad = check(room, msgs)
        sigs = "signatures not checked (no cryptography package)" if bad is None else f"{bad} bad signatures"
        print(f"{room}: {len(msgs):,} posts, {foreign} from another sender, {sigs}")
        data[room] = by_sweep(msgs)
    price, _ = data["d-close1-price"]
    state, _ = data["d-close1-state"]
    pos, _ = data["d-close1-positions"]
    pnl, extra = data["d-close1-pnl"]
    standings = [b for b in extra if b.get("t") == "standings"]
    registrations(state, pos)
    the_quote(state, pos)
    identical_rows(pnl)
    final_two(pnl, standings[-1]["places"])
    final(standings, price)


if __name__ == "__main__":
    main()
