"""Download the season that is being played now and write data/current_season.json (the "This season" section of the dashboard).

It uses the same Premier League statistics service as fetch_pl_matches.py and is just as gentle (few workers, a pause after each request),
but it only touches the newest season, so it takes seconds and can be run every week.

What it does:
  1. finds the newest season on the service (for example 2026/27)
  2. lists all 380 fixtures (played and still to come)
  3. downloads the full record of every finished match it has not saved yet (line-ups, goals, assists, cards).
     Matches from the last few days are downloaded again, because the league sometimes corrects a scorer or an assist.
  4. downloads the player top lists (goals, assists, clean sheets, yellow and red cards) for the season
  5. checks itself (see "checks" below) and writes data/current_season.json

Checks (the script stops with an error, and writes nothing, if one fails):
  * the score of every finished match equals the goals in its event list (own goals count for the other side)
  * the season's goals added up from the matches equal the goals added up from the official scores
  * every player in the official top-scorer list has the same number of goals in our match events

Nothing here changes the 34 finished seasons: their data and the 32-check audit are separate.
Raw downloads are kept in data/raw/plcurrent/ so a run only asks for what is new.
Run:  python3 scripts/update_current_season.py
"""
import json
import re
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "plcurrent"
OUT = ROOT / "data" / "current_season.json"
BASE = "https://footballapi.pulselive.com/football"
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (student project; polite, low-rate)",
           "Origin": "https://www.premierleague.com", "Referer": "https://www.premierleague.com/"}
PAUSE = 0.25
REFRESH_DAYS = 4          # matches this recent are downloaded again, in case the league corrected something
CLUB_NAMES = {"Bournemouth": "AFC Bournemouth"}     # the service's name -> the name used everywhere else in this project
TOP_LISTS = [("goals", "goals"), ("goal_assist", "assists"), ("clean_sheet", "clean_sheets"), ("yellow_card", "yellow_cards"), ("red_card", "red_cards")]


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


def club(name):
    return CLUB_NAMES.get(name, name)


def newest_season():
    """(label such as '2026–27', service id) of the newest season on the service."""
    best = None
    for s in get(f"{BASE}/competitions/1/compseasons?page=0&pageSize=50")["content"]:
        m = re.search(r"(\d{4})/(\d{2,4})", s["label"])
        if m and (best is None or int(m.group(1)) > best[0]):
            best = (int(m.group(1)), int(s["id"]))
    start, sid = best
    return f"{start}–{(start + 1) % 100:02d}", sid


def all_fixtures(sid):
    out, page = [], 0
    while True:
        d = get(f"{BASE}/fixtures?comps=1&compSeasons={sid}&page={page}&pageSize=100&sort=asc")
        out += d["content"]
        page += 1
        if page >= d["pageInfo"]["numPages"]:
            return out


def minute_label(clock):
    """'15'00' -> '15', '90+5'00' -> '90+5'."""
    return re.sub(r"'\d\d$", "", (clock or {}).get("label", "")) or str(round((clock or {}).get("secs", 0) / 60))


def compact_detail(d):
    """Keep only what the dashboard needs from one finished match."""
    teams = {int(t["team"]["id"]): club(t["team"]["name"]) for t in d["teams"]}
    ids = [int(t["team"]["id"]) for t in d["teams"]]            # [home, away]
    people = {}
    lineups = {}
    for tl in d.get("teamLists", []):
        team = int(tl["teamId"])
        lineups[teams[team]] = {"formation": tl.get("formation"), "start": [], "subs": []}
        for key, plist in (("start", tl.get("lineup", [])), ("subs", tl.get("substitutes", []))):
            for p in plist:
                people[int(p["id"])] = {"name": p["name"]["display"], "team": teams[team]}
                lineups[teams[team]][key].append(p["name"]["display"])
    events = []
    for e in d.get("events", []):
        typ = e["type"]
        if typ not in ("G", "P", "O", "B", "MP"):
            continue
        pid = int(e["personId"]) if e.get("personId") is not None else None
        aid = int(e["assistId"]) if e.get("assistId") is not None else None
        who = people.get(pid)
        events.append({"type": typ + (":" + str(e.get("description")) if typ == "B" else ""), "min": minute_label(e.get("clock")), "secs": int((e.get("clock") or {}).get("secs", 0)),
                       "pid": pid, "player": who["name"] if who else None, "team": who["team"] if who else teams.get(e.get("teamId")),
                       "assist": people[aid]["name"] if aid in people else None})
    refs = [o["name"]["display"] for o in d.get("matchOfficials", []) if o.get("role") == "MAIN"]
    return {"ref": refs[0] if refs else "", "att": d.get("attendance"), "events": events, "lineups": lineups,
            "ht": [(d.get("halfTimeScore") or {}).get("homeScore"), (d.get("halfTimeScore") or {}).get("awayScore")], "ids": ids}


def top_list(sid, stat, goalkeepers_only=False):
    """The season's top 10 for one statistic. Clean sheets are shown for goalkeepers only (like the Golden Glove)."""
    d = get(f"{BASE}/stats/ranked/players/{stat}?page=0&pageSize={100 if goalkeepers_only else 10}&compSeasons={sid}&comps=1&altIds=true")
    rows = [{"id": int(e["owner"]["id"]), "player": e["owner"]["name"]["display"], "club": club((e["owner"].get("currentTeam") or {}).get("name", "")),
             "position": (e["owner"].get("info") or {}).get("position", ""), "value": int(e["value"])} for e in d["stats"]["content"]]
    return [r for r in rows if r["position"] == "G"][:10] if goalkeepers_only else rows


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    season, sid = newest_season()
    fixtures = all_fixtures(sid)
    cache_path = RAW / f"season_{sid}.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    now = datetime.now(timezone.utc)

    todo = []
    for f in fixtures:
        if f["status"] != "C":
            continue
        fid = str(int(f["id"]))
        kick = datetime.fromtimestamp(f["kickoff"]["millis"] / 1000, timezone.utc)
        if fid not in cache or now - kick < timedelta(days=REFRESH_DAYS):
            todo.append(f)
    for f in todo:
        cache[str(int(f["id"]))] = compact_detail(get(f"{BASE}/fixtures/{int(f['id'])}"))
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")))

    problems = []
    matches = []
    goal_count = Counter()          # internal player id -> goals (penalties included, own goals not)
    for f in sorted(fixtures, key=lambda x: (int((x.get("gameweek") or {}).get("gameweek", 0)), x["kickoff"]["millis"], int(x["id"]))):
        home, away = f["teams"]
        hn, an = club(home["team"]["name"]), club(away["team"]["name"])
        fid = str(int(f["id"]))
        m = {"id": int(f["id"]), "gw": int((f.get("gameweek") or {}).get("gameweek", 0)),
             "kick": datetime.fromtimestamp(f["kickoff"]["millis"] / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
             "status": f["status"], "home": hn, "away": an,
             "hg": int(home["score"]) if home.get("score") is not None else None, "ag": int(away["score"]) if away.get("score") is not None else None,
             "ground": (f.get("ground") or {}).get("name", ""), "city": (f.get("ground") or {}).get("city", "")}
        if f["status"] == "C" and fid in cache:
            c = cache[fid]
            score = {hn: 0, an: 0}
            goals, cards = [], []
            for e in sorted(c["events"], key=lambda e: e["secs"]):
                if e["type"] in ("G", "P"):
                    score[e["team"]] += 1
                    goals.append({"min": e["min"], "team": e["team"], "player": e["player"], "assist": e["assist"], "kind": "Penalty" if e["type"] == "P" else "Goal"})
                    if e["pid"]:
                        goal_count[e["pid"]] += 1
                elif e["type"] == "O":
                    score[an if e["team"] == hn else hn] += 1
                    goals.append({"min": e["min"], "team": an if e["team"] == hn else hn, "player": e["player"], "assist": None, "kind": "Own goal"})
                elif e["type"].startswith("B:"):
                    cards.append({"min": e["min"], "team": e["team"], "player": e["player"], "kind": {"Y": "Yellow", "R": "Red", "YR": "Second yellow"}.get(e["type"][2:], e["type"][2:])})
            if (score[hn], score[an]) != (m["hg"], m["ag"]):
                problems.append(f"{hn} v {an} (match {m['id']}): official score {m['hg']}-{m['ag']} but the goal events give {score[hn]}-{score[an]}")
            m.update({"ht": c["ht"], "ref": c["ref"], "att": c["att"], "goals": goals, "cards": cards})
        matches.append(m)

    # check: season goals from the events equal season goals from the official scores
    played = [m for m in matches if m["status"] == "C"]
    from_scores = sum(m["hg"] + m["ag"] for m in played)
    from_events = sum(len(m.get("goals", [])) for m in played)
    if from_scores != from_events:
        problems.append(f"season goals: {from_scores} from the official scores but {from_events} from the goal events")

    # player top lists, checked against our own match events
    top = {key: top_list(sid, stat, goalkeepers_only=(key == "clean_sheets")) for stat, key in TOP_LISTS}
    for row in top["goals"]:
        ours = goal_count.get(row["id"], 0)
        if ours != row["value"]:
            problems.append(f"top scorer {row['player']}: the official list says {row['value']} goals, the match events give {ours}")

    if problems:
        print("CHECKS FAILED, nothing written:")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    out = {"season": season, "service_season_id": sid, "updated": now.strftime("%Y-%m-%dT%H:%MZ"),
           "gameweeks": 38, "played": len(played), "total": len(matches), "top": top, "matches": matches,
           "source": "The Premier League's public statistics service (the same one as the rest of this project)."}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{season}: {len(played)} of {len(matches)} matches played, {len(todo)} downloaded, {from_events} goals, all checks passed. Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
