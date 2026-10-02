"""Download every club's crest from premierleague.com and list them in data/badges.json.

The Premier League's own team list gives each club an Opta id (t3 = Arsenal...); the crest for that id lives at
resources.premierleague.com/premierleague/badges/100/<id>.png. All 51 clubs that have played in the Premier League have one,
including Wimbledon. File names come from the club name (see badgeFile in assets/js/app.js, which uses the same rule).

Writes  assets/badges/<club_name_with_underscores>.png   and   data/badges.json
Run:    python3 scripts/fetch_badges.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEAD = {"Origin": "https://www.premierleague.com", "Referer": "https://www.premierleague.com/", "User-Agent": "Mozilla/5.0"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEAD), timeout=30).read()


def file_name(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower().replace("&", "and")).strip("_")


def plain(n):
    return re.sub(r"^afc ", "", n.lower())


def main():
    api = json.loads(get("https://footballapi.pulselive.com/football/teams?pageSize=100&comps=1&altIds=true"))["content"]
    by_name = {plain(t["name"]): t["altIds"]["opta"] for t in api}
    ours = json.loads((ROOT / "data" / "teams.json").read_text())
    out_dir = ROOT / "assets" / "badges"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for t in ours:
        opta = by_name.get(plain(t["name"]))
        assert opta, f"no Premier League team record for {t['name']}"
        png = get(f"https://resources.premierleague.com/premierleague/badges/100/{opta}.png")
        assert png[:8] == b"\x89PNG\r\n\x1a\n", t["name"]
        fn = file_name(t["name"]) + ".png"
        (out_dir / fn).write_bytes(png)
        rows.append({"name": t["name"], "file": "assets/badges/" + fn, "opta": opta, "status": t["status"]})
        time.sleep(0.2)
    (ROOT / "data" / "badges.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    print(len(rows), "badges saved")


if __name__ == "__main__":
    main()
