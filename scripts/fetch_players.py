"""Download today's Premier League squad lists (used for the current-player profiles).

History: this script used to download per-match player data from an open fantasy-game archive for 2016-17 to 2025-26. That data is no longer used:
the official match records (fetch_pl_matches.py) cover every match since 1992-93 and use the official definition of an assist.

Original description: one row per player per match, for 2016-17 to 2025-26.

Source: the open 'vaastav/Fantasy-Premier-League' archive on GitHub, which saves the Premier League's
public data every gameweek. We only use real football facts (minutes, goals, assists...) and drop
every fantasy-game column (fantasy points, prices, bonus, ICT index and so on).
Also downloads today's player list from the Premier League's public API, for current-player profiles.

Files go to data/raw/vaastav/ (not committed to git - it is ~50 MB; this script re-creates it).
Run:  python3 scripts/fetch_players.py
"""
import time
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "vaastav"
BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (personal learning project)"}


def get(url, out):
    if out.exists():
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(5):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=120).read()
            out.write_bytes(data)
            print("saved", out.relative_to(RAW), len(data), "bytes")
            time.sleep(1)
            return
        except Exception as err:
            print("  problem", err, "- retrying")
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"could not download {url}")


def main():
    # Only today's squad lists are needed now (for the current-player profiles); the match-by-match player data comes from fetch_pl_matches.py.
    get("https://fantasy.premierleague.com/api/bootstrap-static/", RAW / "bootstrap_static_current.json")


if __name__ == "__main__":
    main()
