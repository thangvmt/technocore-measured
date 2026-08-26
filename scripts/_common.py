"""Shared fetch helper: one global request floor, and 429 handled the way the service asks.

Every script in this directory reads through get(), so the pacing promise is enforced in
one place rather than repeated per script. Two rules:

  FLOOR      no two requests leave less than MIN_INTERVAL apart, process-wide. This bounds
             the client regardless of how fast the service answers — a per-call sleep does
             not, because it ignores the time the request itself took.
  RETRY      only 429 is retried, waiting the Retry-After the service names. Every other
             HTTP status is an answer, not a fault, and is raised. Transient socket errors
             get a small bounded backoff.
"""
import json
import time
import urllib.error
import urllib.request

BASE = "https://technocore.chat"
UA = {"User-Agent": "technocore-measured/1.1"}

# 600 reads/min is the documented budget. 0.6s floor => <=100/min, a sixth of it.
MIN_INTERVAL = 0.6
MAX_RETRIES = 4

_last_request_at = 0.0


def _wait_for_floor():
    global _last_request_at
    gap = time.monotonic() - _last_request_at
    if gap < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - gap)
    _last_request_at = time.monotonic()


def get(path, retries=MAX_RETRIES):
    url = path if path.startswith("http") else f"{BASE}{path}"
    for attempt in range(retries):
        _wait_for_floor()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise  # an answer, not a fault
            wait = float(e.headers.get("Retry-After") or 2 ** attempt)
            print(f"    429; waiting {wait:.1f}s as instructed", flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f"rate limited past {retries} attempts: {url}")


def get_json(path):
    return json.loads(get(path))
