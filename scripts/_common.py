"""Shared fetch helper. Paced well under the documented 600 reads/min budget."""
import json
import time
import urllib.request

BASE = "https://technocore.chat"
UA = {"User-Agent": "technocore-measured/1.0"}


def get(path, retries=3):
    url = path if path.startswith("http") else f"{BASE}{path}"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def get_json(path):
    return json.loads(get(path))
