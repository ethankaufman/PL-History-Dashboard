"""Look up latitude/longitude for each club's current ground using Wikipedia's coordinates API.

Reads  data/raw/ground_pages.json  (club -> Wikipedia page title of its ground)
Writes data/raw/ground_coordinates.json  (club -> {title, lat, lng})

Run:  python3 scripts/fetch_coordinates.py
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (personal learning project)"}


def lookup(titles):
    query = urllib.parse.urlencode({
        "action": "query", "prop": "coordinates", "titles": "|".join(titles), "redirects": "1",
        "colimit": "max", "coprimary": "primary", "format": "json", "formatversion": "2",
    })
    req = urllib.request.Request(f"https://en.wikipedia.org/w/api.php?{query}", headers=HEADERS)
    for attempt in range(6):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=60).read())["query"]
        except Exception as err:
            print(f"   problem ({err}); waiting {10 * (attempt + 1)}s")
            time.sleep(10 * (attempt + 1))
    raise SystemExit("giving up")


def main():
    grounds = json.loads((RAW / "ground_pages.json").read_text())
    titles = sorted({t for t in grounds.values() if t})
    found = {}  # final page title -> (lat, lng)
    redirect = {}  # title we asked for -> final page title
    for i in range(0, len(titles), 20):
        data = lookup(titles[i:i + 20])
        for r in data.get("redirects", []) + data.get("normalized", []):
            redirect[r["from"]] = r["to"]
        for page in data["pages"]:
            if page.get("coordinates"):
                c = page["coordinates"][0]
                found[page["title"]] = (c["lat"], c["lon"])
        time.sleep(3)
    out = {}
    for club, title in grounds.items():
        final = redirect.get(title, title)
        # follow normalisation then redirect chain
        final = redirect.get(final, final)
        if final in found:
            out[club] = {"title": final, "lat": found[final][0], "lng": found[final][1]}
        else:
            print("no coordinates for", club, title)
    (RAW / "ground_coordinates.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"{len(out)} of {len(grounds)} clubs have coordinates")


if __name__ == "__main__":
    main()
