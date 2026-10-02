"""Download Wikipedia pages (as HTML inside a JSON file) politely.

Usage:  python3 scripts/fetch_wikipedia.py "Page Title=output_name" ["Other Page=other_name" ...]
Files are saved to data/raw/<output_name>.json. Pages already downloaded are skipped.
We wait a few seconds between requests and retry if Wikipedia says we are going too fast.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (personal learning project)"}
DELAY_SECONDS = 3


def fetch(title):
    query = urllib.parse.urlencode({
        "action": "parse", "page": title, "prop": "text", "format": "json",
        "formatversion": "2", "redirects": "1",
    })
    req = urllib.request.Request(f"https://en.wikipedia.org/w/api.php?{query}", headers=HEADERS)
    for attempt in range(6):
        try:
            body = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
            data = json.loads(body)
            if "parse" in data:
                return data
            print(f"   no page found for {title!r}: {str(data)[:120]}")
            return None
        except Exception as err:  # rate limit (HTTP 429), bad JSON, network blips
            wait = 10 * (attempt + 1)
            print(f"   problem ({err}); waiting {wait}s then retrying")
            time.sleep(wait)
    return None


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    for arg in sys.argv[1:]:
        title, name = arg.rsplit("=", 1)
        out = RAW / f"{name}.json"
        if out.exists():
            continue
        print(f"fetching {title!r} -> {out.name}")
        data = fetch(title)
        if data:
            out.write_text(json.dumps(data))
        time.sleep(DELAY_SECONDS)


if __name__ == "__main__":
    main()
