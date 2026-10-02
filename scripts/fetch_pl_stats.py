"""Download player season statistics from the Premier League's own statistics service, for every season 1992/93 to 2025/26.

For each season and each club it asks for the club's players ranked by seven statistics:
appearances, goals, assists, clean sheets, yellow cards, red cards and minutes played (minutes only exist from about 2006).
Each player comes with his Opta ID, which is the same ID used in player_matches.csv, so careers can be joined.

The service is the website's public back end (not an official, documented API), so this script is deliberately gentle:
five workers, a pause after every request, retries on errors, and it saves after every club so it can be stopped and resumed.
Output: data/raw/plstats/season_<id>.json  (one small file per season)
Run:  python3 scripts/fetch_pl_stats.py
"""
import json
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "plstats"
BASE = "https://footballapi.pulselive.com/football"
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (student project; polite, low-rate)",
           "Origin": "https://www.premierleague.com", "Referer": "https://www.premierleague.com/"}
STATS = ["appearances", "goals", "goal_assist", "clean_sheet", "yellow_card", "red_card", "mins_played"]
PAUSE = 0.3            # seconds each worker waits after a request
lock = threading.Lock()


def get(url):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
                data = json.loads(r.read())
            time.sleep(PAUSE)
            return data
        except Exception as err:
            time.sleep(3 * (attempt + 1))
            last = err
    raise RuntimeError(f"failed {url}: {last}")


def season_list():
    d = get(f"{BASE}/competitions/1/compseasons?page=0&pageSize=50")
    out = []
    for s in d["content"]:
        label = s["label"]
        if "/" in label and len(label) == 7 and label[:2] in ("19", "20"):
            start = int(label[:4])
            if start <= 2025:
                out.append((start, int(s["id"])))
    return sorted(out)


def fetch_team_stats(season_id, team_id, stat):
    d = get(f"{BASE}/stats/ranked/players/{stat}?page=0&pageSize=200&compSeasons={season_id}&comps=1&teams={team_id}&altIds=true")
    rows = []
    for e in d["stats"]["content"]:
        o = e["owner"]
        rows.append([(o.get("altIds") or {}).get("opta", ""), o["name"]["display"], o["info"].get("position", ""),
                     (o.get("nationalTeam") or {}).get("country", ""), (o.get("birth", {}).get("date") or {}).get("label", ""),
                     e["value"], int(o["playerId"])])
    return rows


def do_season(start, season_id):
    path = OUT / f"season_{season_id}.json"
    saved = json.loads(path.read_text()) if path.exists() else {"start": start, "season_id": season_id, "teams": {}}
    teams = get(f"{BASE}/teams?pageSize=50&compSeasons={season_id}&comps=1&altIds=true")["content"]
    todo = [(t["name"], int(t["id"]), s) for t in teams for s in STATS if not saved["teams"].get(t["name"], {}).get("stats", {}).get(s) is not None]
    for t in teams:
        saved["teams"].setdefault(t["name"], {"id": int(t["id"]), "stats": {}})

    def work(item):
        name, tid, stat = item
        rows = fetch_team_stats(season_id, tid, stat)
        with lock:
            saved["teams"][name]["stats"][stat] = rows
        return item

    with ThreadPoolExecutor(max_workers=5) as ex:
        for n, _ in enumerate(ex.map(work, todo), 1):
            if n % 40 == 0:
                with lock:
                    path.write_text(json.dumps(saved, ensure_ascii=False, separators=(",", ":")))
    path.write_text(json.dumps(saved, ensure_ascii=False, separators=(",", ":")))
    print(f"{start}-{(start + 1) % 100:02d}: {len(teams)} clubs, {len(todo)} requests", flush=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for start, sid in season_list():
        do_season(start, sid)
    print("done", flush=True)


if __name__ == "__main__":
    main()
