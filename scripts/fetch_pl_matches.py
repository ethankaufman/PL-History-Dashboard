"""Download the official record of every Premier League match, 1992-93 to 2025-26, from the Premier League's statistics service.

For each match: kick-off, ground, attendance, half-time score, referee, both starting line-ups and substitutes, and every event
(goals with scorer and assister, bookings and sending-offs, substitutions) with its minute. Used to fill in match squads for the
whole history and to check every score, card count and referee against the football-data.co.uk results.

Gentle by design: five workers, a short pause after each request, retries, and it saves as it goes so it can be stopped and resumed.
Output: data/raw/plmatches/season_<id>.json  (one file per season, compact)
Run:  python3 scripts/fetch_pl_matches.py
"""
import json
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "plmatches"
BASE = "https://footballapi.pulselive.com/football"
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (student project; polite, low-rate)",
           "Origin": "https://www.premierleague.com", "Referer": "https://www.premierleague.com/"}
PAUSE = 0.25
lock = threading.Lock()


def get(url):
    last = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
                data = json.loads(r.read())
            time.sleep(PAUSE)
            return data
        except Exception as err:
            last = err
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed {url}: {last}")


def seasons():
    d = get(f"{BASE}/competitions/1/compseasons?page=0&pageSize=50")
    out = []
    for s in d["content"]:
        label = s["label"]
        if "/" in label and len(label) == 7 and label[:2] in ("19", "20") and int(label[:4]) <= 2025:
            out.append((int(label[:4]), int(s["id"])))
    return sorted(out)


def fixture_ids(season_id):
    ids, page = [], 0
    while True:
        d = get(f"{BASE}/fixtures?comps=1&compSeasons={season_id}&page={page}&pageSize=100&sort=asc&statuses=C")
        ids += [int(f["id"]) for f in d["content"]]
        page += 1
        if page >= d["pageInfo"]["numPages"]:
            return ids


def player(p):
    return [p.get("id"), p["name"]["display"], (p.get("info") or {}).get("position", ""), p.get("matchShirtNumber"), bool(p.get("captain")),
            (p.get("altIds") or {}).get("opta", ""), ((p.get("birth") or {}).get("date") or {}).get("label", ""),
            (p.get("nationalTeam") or {}).get("country", "")]


def compact(d):
    refs = [o["name"]["display"] for o in d.get("matchOfficials", []) if o.get("role") == "MAIN"]
    return {
        "id": int(d["id"]), "gw": int((d.get("gameweek") or {}).get("gameweek", 0)), "kick": int(d["kickoff"]["millis"]), "label": d["kickoff"].get("label", ""),
        "ground": [(d.get("ground") or {}).get("name", ""), (d.get("ground") or {}).get("city", "")], "att": d.get("attendance"),
        "ht": [(d.get("halfTimeScore") or {}).get("homeScore"), (d.get("halfTimeScore") or {}).get("awayScore")],
        "ref": refs[0] if refs else "", "replay": bool(d.get("replay")),
        "teams": [{"id": int(t["team"]["id"]), "name": t["team"]["name"], "score": t.get("score")} for t in d["teams"]],
        "lineups": [{"team": int(tl["teamId"]), "formation": tl.get("formation"), "start": [player(p) for p in tl.get("lineup", [])],
                     "subs": [player(p) for p in tl.get("substitutes", [])]} for tl in d.get("teamLists", [])],
        "events": [[e["type"], int((e.get("clock") or {}).get("secs", 0)), e.get("personId"), e.get("teamId"), e.get("assistId"), e.get("description"), e.get("reason")] for e in d.get("events", [])],
    }


def do_season(start, sid):
    path = OUT / f"season_{sid}.json"
    saved = json.loads(path.read_text()) if path.exists() else {"start": start, "season_id": sid, "fixtures": {}}
    ids = fixture_ids(sid)
    todo = [i for i in ids if str(i) not in saved["fixtures"]]

    def work(i):
        c = compact(get(f"{BASE}/fixtures/{i}"))
        with lock:
            saved["fixtures"][str(i)] = c

    with ThreadPoolExecutor(max_workers=5) as ex:
        for n, _ in enumerate(ex.map(work, todo), 1):
            if n % 60 == 0:
                with lock:
                    path.write_text(json.dumps(saved, ensure_ascii=False, separators=(",", ":")))
    path.write_text(json.dumps(saved, ensure_ascii=False, separators=(",", ":")))
    print(f"{start}-{(start + 1) % 100:02d}: {len(ids)} fixtures, {len(todo)} downloaded", flush=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for start, sid in seasons():
        do_season(start, sid)
    print("done", flush=True)


if __name__ == "__main__":
    main()
