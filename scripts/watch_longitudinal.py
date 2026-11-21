#!/usr/bin/env python3
"""Offline longitudinal summary of watch/FINDINGS.md and cron delivery.

Reads the repository's committed alert log (watch/FINDINGS.md) and prints:
  - Total alert runs committed, UTC span, and delivery ratio vs */15 slots
  - Inter-run gap distribution (min, median, p90, max in minutes)
  - Alert classification before vs after the 2026-09-07 correction
  - Monthly tclk-offers sequence throughput (records/day)

Does not touch the network. Usage:
    python3 watch_longitudinal.py [--json] [path/to/FINDINGS.md]
"""
import datetime
import json
import math
import re
import statistics
import sys
from pathlib import Path

SECONDS_PER_DAY = 24 * 3600
CRON_INTERVAL_SECONDS = 15 * 60
HEADING_RE = re.compile(r"^## (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s*$", re.M)
SEQ_RANGE_RE = re.compile(r"between (\d+) and (\d+)")


def parse_findings(text):
    """Parse watch/FINDINGS.md headings and tclk-offers span alerts."""
    parts = HEADING_RE.split(text)
    entries = []
    for idx in range(1, len(parts), 2):
        ts_str = parts[idx]
        body = parts[idx + 1]
        dt = datetime.datetime.strptime(ts_str, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=datetime.timezone.utc
        )
        m_seq = SEQ_RANGE_RE.search(body)
        if "window moved past us" in body:
            kind = "evicted_label"
        elif "gap, cause undetermined" in body:
            kind = "undetermined"
        else:
            kind = "other"
        entries.append({
            "ts": ts_str,
            "dt": dt,
            "kind": kind,
            "seq_start": int(m_seq.group(1)) if m_seq else None,
            "seq_end": int(m_seq.group(2)) if m_seq else None,
        })
    entries.sort(key=lambda item: item["dt"])
    return entries


def percentile(sorted_vals, q):
    """Linear-interpolated percentile on an already sorted non-empty list."""
    if not sorted_vals:
        return None
    pos = (len(sorted_vals) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return sorted_vals[lo]
    frac = pos - lo
    return sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac


def summarize(entries):
    """Compute longitudinal stats from chronological entries."""
    if len(entries) < 2:
        raise ValueError("Need at least two entries in FINDINGS.md to compute gaps")

    first_dt = entries[0]["dt"]
    last_dt = entries[-1]["dt"]
    span_seconds = (last_dt - first_dt).total_seconds()
    span_days = span_seconds / SECONDS_PER_DAY
    slots_15m = int(span_seconds // CRON_INTERVAL_SECONDS) + 1

    gaps_min = sorted(
        (entries[i]["dt"] - entries[i - 1]["dt"]).total_seconds() / 60.0
        for i in range(1, len(entries))
    )

    counts = {"evicted_label": 0, "undetermined": 0, "other": 0}
    by_month = {}
    for item in entries:
        counts[item["kind"]] = counts.get(item["kind"], 0) + 1
        if item["seq_end"] is not None:
            month = item["ts"][:7]
            by_month.setdefault(month, []).append(item)

    monthly = []
    for month, rows in sorted(by_month.items()):
        rows.sort(key=lambda r: r["dt"])
        d_days = max((rows[-1]["dt"] - rows[0]["dt"]).total_seconds() / SECONDS_PER_DAY, 0.01)
        d_seq = rows[-1]["seq_end"] - rows[0]["seq_start"]
        monthly.append({
            "month": month,
            "runs": len(rows),
            "first_ts": rows[0]["ts"],
            "last_ts": rows[-1]["ts"],
            "seq_start": rows[0]["seq_start"],
            "seq_end": rows[-1]["seq_end"],
            "delta_seq": d_seq,
            "span_days": round(d_days, 2),
            "records_per_day": round(d_seq / d_days),
        })

    return {
        "committed_finding_runs": len(entries),
        "first_ts": entries[0]["ts"],
        "last_ts": entries[-1]["ts"],
        "span_days": round(span_days, 2),
        "cron_15m_slots_in_span": slots_15m,
        "committed_per_slot_pct": round(len(entries) / slots_15m * 100.0, 2),
        "gap_minutes": {
            "min": round(gaps_min[0], 1),
            "median": round(statistics.median(gaps_min), 1),
            "p90": round(percentile(gaps_min, 0.90), 1),
            "max": round(gaps_min[-1], 1),
            "under_30m": sum(1 for g in gaps_min if g < 30.0),
            "under_60m": sum(1 for g in gaps_min if g < 60.0),
        },
        "outcomes": counts,
        "monthly_tclk_offers": monthly,
    }


def main(argv):
    as_json = "--json" in argv
    args = [a for a in argv if a != "--json"]
    default_path = Path(__file__).resolve().parent.parent / "watch" / "FINDINGS.md"
    path = Path(args[0]) if args else default_path
    entries = parse_findings(path.read_text(encoding="utf-8"))
    summary = summarize(entries)

    if as_json:
        print(json.dumps(summary, indent=2))
        return 0

    g = summary["gap_minutes"]
    o = summary["outcomes"]
    print(f"Source: {path} (offline)")
    print(f"Span:   {summary['first_ts']} -> {summary['last_ts']} ({summary['span_days']} days)")
    print(f"Runs:   {summary['committed_finding_runs']} finding runs / "
          f"{summary['cron_15m_slots_in_span']} 15-min slots ({summary['committed_per_slot_pct']}%)")
    print(f"Gaps:   min {g['min']}m | median {g['median']}m | p90 {g['p90']}m | "
          f"max {g['max']}m (under 30m: {g['under_30m']}, under 60m: {g['under_60m']})")
    print(f"Labels: undetermined={o['undetermined']}, pre-2026-09-07 evicted={o['evicted_label']}, "
          f"other={o['other']}")
    print("\nMonthly tclk-offers sequence growth:")
    for m in summary["monthly_tclk_offers"]:
        print(f"  {m['month']}: {m['runs']:3d} runs over {m['span_days']:5.2f}d | "
              f"seq {m['seq_start']:,} -> {m['seq_end']:,} "
              f"(+{m['delta_seq']:,}, {m['records_per_day']:,} rec/day)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
