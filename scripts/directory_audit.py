#!/usr/bin/env python3
"""Verify liveness and recent commit activity of GitHub repos listed in README.md.

Reads the `## Community projects` section from ../README.md and checks every GitHub
repository link against the GitHub REST API (or `gh api` if installed).

    python3 directory_audit.py [--since YYYY-MM-DD] [--json]
"""
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_LINK_RE = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)")


def extract_listed_repos(readme_text):
    start = readme_text.index("## Community projects")
    after = readme_text[start + len("## Community projects"):]
    next_h2 = re.search(r"^## ", after, flags=re.M)
    section = after[:next_h2.start()] if next_h2 else after
    # Ignore any subsection explicitly marked as historical removal notes if needed; check all GitHub URLs first
    seen = []
    for match in REPO_LINK_RE.finditer(section):
        slug = match.group(1).rstrip(").,]")
        if slug not in seen:
            seen.append(slug)
    return seen


def fetch_github_repo(slug, token=None, use_gh=False):
    if token or not use_gh:
        url = f"https://api.github.com/repos/{slug}"
        headers = {
            "User-Agent": "technocore-measured-directory-audit/1.0",
            "Accept": "application/vnd.github+json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        time.sleep(0.25 if token else 0.7)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as resp:
                return 200, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            return err.code, None
    proc = subprocess.run(["gh", "api", f"repos/{slug}"], capture_output=True, text=True)
    if proc.returncode == 0:
        return 200, json.loads(proc.stdout)
    if "404" in proc.stderr or "Not Found" in proc.stderr:
        return 404, None
    return 500, None


def main(argv):
    as_json = "--json" in argv
    since = "2026-10-01"
    for idx, arg in enumerate(argv):
        if arg == "--since" and idx + 1 < len(argv):
            since = argv[idx + 1]

    readme_path = Path(__file__).resolve().parent.parent / "README.md"
    slugs = extract_listed_repos(readme_path.read_text(encoding="utf-8"))

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    use_gh = bool(shutil.which("gh")) and not token

    checked_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for slug in slugs:
        code, info = fetch_github_repo(slug, token=token, use_gh=use_gh)
        if code == 200 and info:
            pushed = (info.get("pushed_at") or "")[:10]
            rows.append({
                "repo": slug,
                "official": slug.lower().startswith("flop-labs/"),
                "status": "archived" if info.get("archived") else "live",
                "pushed_at": pushed,
                "stars": info.get("stargazers_count", 0),
                "size_kb": info.get("size", 0),
                "active_since": pushed >= since,
            })
        elif code == 404:
            rows.append({"repo": slug, "official": slug.lower().startswith("flop-labs/"),
                         "status": "dead_404", "pushed_at": None, "stars": 0, "size_kb": 0, "active_since": False})
        else:
            rows.append({"repo": slug, "official": slug.lower().startswith("flop-labs/"),
                         "status": f"http_{code}", "pushed_at": None, "stars": 0, "size_kb": 0, "active_since": False})

    community = [r for r in rows if not r["official"]]
    summary = {
        "checked_at_utc": checked_at,
        "active_since_cutoff": since,
        "total_listed": len(rows),
        "community_total": len(community),
        "community_live": sum(1 for r in community if r["status"] == "live"),
        "community_dead_404": sum(1 for r in community if r["status"] == "dead_404"),
        "community_archived": sum(1 for r in community if r["status"] == "archived"),
        "community_active_since": [r for r in community if r["active_since"]],
        "dead_or_error": [r for r in rows if r["status"] not in ("live", "archived")],
    }

    if as_json:
        print(json.dumps(summary, indent=2))
        return 0

    print(f"Checked at: {checked_at} | Listed repos: {summary['total_listed']} "
          f"(community: {summary['community_total']})")
    print(f"Community status: live={summary['community_live']}, dead_404={summary['community_dead_404']}, "
          f"archived={summary['community_archived']}")
    print(f"Community active since {since}: {len(summary['community_active_since'])}/{summary['community_total']}")
    for item in sorted(summary["community_active_since"], key=lambda x: x["pushed_at"], reverse=True):
        print(f"  ACTIVE  {item['pushed_at']} | stars={item['stars']:3d} | {item['repo']}")
    for item in summary["dead_or_error"]:
        print(f"  DEAD    {item['status']} | {item['repo']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
