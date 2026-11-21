#!/usr/bin/env python3
"""Read-only point-in-time snapshot of live technocore.chat limits, rooms, did/ notes, and tail horizons.

Uses _common.get / get_json so all requests obey the global 0.6s pacing floor and 429 Retry-After rules.
Does not read any private key or write to the service.

    python3 live_snapshot.py [--json]
"""
import datetime
import json
import re
import sys

from _common import get, get_json

ROOMS_HDR_RE = re.compile(r"of (\d+) rooms \(cap (\d+), ([\d.]+)([MG]) of ([\d.]+)([MG]) stored\)")


def to_mb(value, unit):
    val = float(value)
    return val * 1024.0 if unit == "G" else val


def parse_iso_utc(ts):
    return datetime.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
        tzinfo=datetime.timezone.utc
    )


def sample_tail(room, limit=200):
    """Fetch newest `limit` messages from a room and derive instantaneous span and horizon."""
    data = get_json(f"/r/{room}?limit={limit}&format=json")
    msgs = data.get("messages") or []
    first_ts = msgs[0]["ts"] if msgs else None
    last_ts = msgs[-1]["ts"] if msgs else None
    span_s = None
    msg_per_min = None
    horizon_s = None
    if len(msgs) >= 2 and first_ts and last_ts:
        span_s = (parse_iso_utc(last_ts) - parse_iso_utc(first_ts)).total_seconds()
        if span_s > 0:
            rate_per_s = (len(msgs) - 1) / span_s
            msg_per_min = round(rate_per_s * 60.0, 2)
            horizon_s = round(limit / rate_per_s, 1)

    return {
        "room": room,
        "count": data.get("count"),
        "first_seq": data.get("first_seq"),
        "last_seq": data.get("last_seq"),
        "first_ts": first_ts,
        "last_ts": last_ts,
        "tail_span_seconds": round(span_s, 2) if span_s is not None else None,
        "implied_msg_per_min": msg_per_min,
        "implied_200_horizon_seconds": horizon_s,
        "signed_in_tail": sum(1 for m in msgs if m.get("sig")),
        "unique_senders_in_tail": len({m.get("from") for m in msgs if m.get("from")}),
    }


def collect():
    captured_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    agent_json = get_json("/.well-known/agent.json")
    config = get_json("/config")
    rooms_hdr = get("/rooms").split("\n", 1)[0]
    m = ROOMS_HDR_RE.search(rooms_hdr)
    rooms_info = None
    if m:
        used_mb = to_mb(m.group(3), m.group(4))
        total_mb = to_mb(m.group(5), m.group(6))
        rooms_now = int(m.group(1))
        rooms_cap = int(m.group(2))
        rooms_info = {
            "rooms_now": rooms_now,
            "rooms_cap": rooms_cap,
            "rooms_pct": round(rooms_now / rooms_cap * 100.0, 1) if rooms_cap else None,
            "storage_raw": f"{m.group(3)}{m.group(4)} / {m.group(5)}{m.group(6)}",
            "storage_used_mb_approx": round(used_mb, 1),
            "storage_total_mb_approx": round(total_mb, 1),
        }

    did_raw = get("/kv/did")
    did_count = did_raw.count("/kv/did/")
    max_notes_ns = config["settings"]["max_notes_per_ns"]

    lobby_tail = sample_tail("lobby", 200)
    offers_tail = sample_tail("tclk-offers", 200)

    return {
        "captured_at_utc": captured_at,
        "service": config.get("service"),
        "version": config.get("version"),
        "settings": config.get("settings"),
        "limits_summary": agent_json.get("limits"),
        "rooms": rooms_info,
        "did_namespace": {
            "notes_now": did_count,
            "max_notes_per_ns": max_notes_ns,
            "did_pct": round(did_count / max_notes_ns * 100.0, 1) if max_notes_ns else None,
        },
        "tails_limit_200": [lobby_tail, offers_tail],
    }


def main(argv):
    as_json = "--json" in argv
    snap = collect()
    if as_json:
        print(json.dumps(snap, indent=2))
        return 0

    s = snap["settings"]
    r = snap["rooms"]
    d = snap["did_namespace"]
    print(f"Captured: {snap['captured_at_utc']} | {snap['service']} v{snap['version']}")
    print(f"Config ceilings: max_rooms={s['max_rooms']:,}, max_notes_per_ns={s['max_notes_per_ns']:,}, "
          f"max_notes_total={s['max_notes_total']:,}, dupe_filter={s['dupe_filter_seconds']}s")
    if r:
        print(f"Rooms: {r['rooms_now']:,} / {r['rooms_cap']:,} ({r['rooms_pct']}%) | storage {r['storage_raw']}")
    print(f"did/:  {d['notes_now']:,} / {d['max_notes_per_ns']:,} ({d['did_pct']}%)")
    for t in snap["tails_limit_200"]:
        print(f"Room /r/{t['room']}: seq {t['first_seq']:,}..{t['last_seq']:,} | "
              f"200-msg span={t['tail_span_seconds']}s ({t['implied_msg_per_min']}/min) | "
              f"signed={t['signed_in_tail']}/{t['count']} | senders={t['unique_senders_in_tail']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
