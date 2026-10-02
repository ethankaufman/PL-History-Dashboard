"""Build current-player profiles and the signings / departures lists.

Reads   data/player_matches.csv                       (every appearance 2016-17 to 2025-26)
        data/raw/vaastav/bootstrap_static_current.json (today's Premier League player list)
Writes  data/current_players.json   one profile per player in a 2026-27 squad, with career Premier League stats
        data/transfers.csv          signings and departures, one row per move

How moves are found (no fee data is available, so this is derived from where players actually played):
  - A player's club in each season comes from the matches he appeared in.
  - If his club changes from one season to the next (or part-way through a season) that is a move.
  - A player who appears for a club but did not play in the Premier League the season before is
    'from outside the Premier League' (another league, the lower leagues, or the youth team).
  - A player who plays his last Premier League match for a club and never appears again has 'left the Premier League'
    (we cannot see where he went).
  - 2026-27 arrivals and departures come from comparing the 2025-26 appearances with today's squad lists.
Run:  python3 scripts/build_profiles_transfers.py
"""
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

from build_matches import ALIASES, OFFICIAL

ROOT = Path(__file__).resolve().parent.parent
TODAY = date(2026, 10, 2)
CURRENT_SEASON = "2026–27"
LAST_SEASON = "2025–26"
POSITIONS = {1: "Goalkeeper", 2: "Defender", 3: "Midfielder", 4: "Forward"}
FPL_CLUBS = dict(ALIASES, **{"Man Utd": "Manchester United", "Spurs": "Tottenham Hotspur", "Leeds": "Leeds United",
                             "Newcastle": "Newcastle United", "Nott'm Forest": "Nottingham Forest", "Brighton": "Brighton & Hove Albion"})


def club(name):
    name = FPL_CLUBS.get(name, name)
    assert name in OFFICIAL, name
    return name


def season_order(s):
    return int(s[:4])


def load_appearances():
    people = {}                                   # player_id -> info
    seg = defaultdict(lambda: defaultdict(lambda: dict(first="9999", minutes=0, apps=0, goals=0, assists=0,
                                                       clean_sheets=0, yellow=0, red=0)))
    for r in csv.DictReader(open(ROOT / "data" / "player_matches.csv")):
        pid = r["player_id"]
        people[pid] = {"name": r["player"], "position": r["position"]}
        s = seg[pid][(r["season"], r["team"])]
        s["first"] = min(s["first"], r["date"])
        s["minutes"] += int(r["minutes"]); s["apps"] += 1
        s["goals"] += int(r["goals"]); s["assists"] += int(r["assists"]); s["clean_sheets"] += int(r["clean_sheet"] or 0)
        s["yellow"] += int(r["yellow_cards"]); s["red"] += int(r["red_cards"])
    return people, seg


def build_profiles(people, seg, boot):
    teams = {t["id"]: club(t["name"]) for t in boot["teams"]}
    out = []
    for e in boot["elements"]:
        pid = str(e["code"])
        history = []
        for (season, team), s in sorted(seg.get(pid, {}).items(), key=lambda kv: (season_order(kv[0][0]), kv[1]["first"])):
            history.append({"season": season, "club": team, "appearances": s["apps"], "minutes": s["minutes"], "goals": s["goals"],
                            "assists": s["assists"], "clean_sheets": s["clean_sheets"], "yellow_cards": s["yellow"], "red_cards": s["red"]})
        totals = {k: sum(h[k] for h in history) for k in ("appearances", "minutes", "goals", "assists", "clean_sheets", "yellow_cards", "red_cards")}
        born = e["birth_date"]
        age = None
        if born:
            b = date.fromisoformat(born)
            age = TODAY.year - b.year - ((TODAY.month, TODAY.day) < (b.month, b.day))
        out.append({
            "player_id": pid, "name": f'{e["first_name"]} {e["second_name"]}'.strip(), "known_as": e["web_name"],
            "club": teams[e["team"]], "position": POSITIONS[e["element_type"]], "squad_number": e["squad_number"],
            "birth_date": born, "age": age, "joined_club": e["team_join_date"],
            "photo": f"https://resources.premierleague.com/premierleague25/photos/players/110x140/{e['code']}.png",
            "availability": {"a": "Available", "i": "Injured", "d": "Doubtful", "s": "Suspended", "u": "Unavailable", "n": "Not in squad"}.get(e["status"], e["status"]),
            "news": e["news"] or None,
            "this_season": {"season": CURRENT_SEASON, "minutes": e["minutes"], "starts": e["starts"], "goals": e["goals_scored"],
                            "assists": e["assists"], "clean_sheets": e["clean_sheets"], "saves": e["saves"],
                            "yellow_cards": e["yellow_cards"], "red_cards": e["red_cards"],
                            "expected_goals": float(e["expected_goals"] or 0), "expected_assists": float(e["expected_assists"] or 0)},
            "premier_league_career": {"note": "Appearances from 2016-17 to 2025-26 in this project's data", **totals, "seasons": history},
        })
    out.sort(key=lambda p: (p["club"], ["Goalkeeper", "Defender", "Midfielder", "Forward"].index(p["position"]), p["name"]))
    return out


def build_transfers(people, seg, profiles):
    rows = []
    for pid, segs in seg.items():
        seq = sorted(segs.items(), key=lambda kv: (season_order(kv[0][0]), kv[1]["first"]))   # [((season, team), stats)]
        for i, ((season, team), s) in enumerate(seq):
            prev = seq[i - 1][0] if i else None
            if prev is None and season == "2016–17":
                continue                                           # first season of data: nobody can be called a signing
            if prev and prev[1] == team and season_order(season) - season_order(prev[0]) <= 1:
                continue                                           # stayed
            if prev is None or season_order(season) - season_order(prev[0]) > 1:
                kind, frm = "Signing from outside the Premier League", (prev[1] if prev else None)
                if prev:
                    kind = "Returned to the Premier League"
            else:
                kind = "Mid-season move" if prev[0] == season else "Signing from another Premier League club"
                frm = prev[1]
            rows.append([season, "Signing", team, pid, people[pid]["name"], people[pid]["position"], frm or "", team, kind, s["apps"], s["minutes"]])
        for i, ((season, team), s) in enumerate(seq):
            nxt = seq[i + 1][0] if i + 1 < len(seq) else None
            if nxt and nxt[1] == team and season_order(nxt[0]) - season_order(season) <= 1:
                continue
            if nxt is None and season == LAST_SEASON:
                continue                                           # still there; 2026 summer is handled below
            if nxt and nxt[0] == season:
                kind, to = "Mid-season move", nxt[1]
            elif nxt and season_order(nxt[0]) - season_order(season) == 1:
                kind, to = "Sold to another Premier League club", nxt[1]
            elif nxt:
                kind, to = "Left the Premier League for a time", ""
            else:
                kind, to = "Left the Premier League", ""
            leave_season = season if kind == "Mid-season move" else f"{season_order(season) + 1}–{(season_order(season) + 2) % 100:02d}"
            rows.append([leave_season, "Departure", team, pid, people[pid]["name"], people[pid]["position"], team, to, kind, s["apps"], s["minutes"]])
    # summer 2026: compare 2025-26 squads with today's squad lists
    now = {p["player_id"]: p for p in profiles}
    for pid, segs in seg.items():
        last = max((k for k in segs if k[0] == LAST_SEASON), key=lambda k: segs[k]["first"], default=None)
        if last is None:
            continue
        cur = now.get(pid)
        if cur is None:
            rows.append([CURRENT_SEASON, "Departure", last[1], pid, people[pid]["name"], people[pid]["position"], last[1], "", "Left the Premier League", segs[last]["apps"], segs[last]["minutes"]])
        elif cur["club"] != last[1]:
            rows.append([CURRENT_SEASON, "Departure", last[1], pid, people[pid]["name"], people[pid]["position"], last[1], cur["club"], "Sold to another Premier League club", segs[last]["apps"], segs[last]["minutes"]])
            rows.append([CURRENT_SEASON, "Signing", cur["club"], pid, people[pid]["name"], people[pid]["position"], last[1], cur["club"], "Signing from another Premier League club", 0, 0])
    for p in profiles:
        hist = [h for h in p["premier_league_career"]["seasons"] if h["season"] == LAST_SEASON]
        if p["joined_club"] and p["joined_club"] >= "2026-06-01" and not hist:
            earlier = p["premier_league_career"]["seasons"]
            kind = "Returned to the Premier League" if earlier else "Signing from outside the Premier League"
            frm = earlier[-1]["club"] if earlier else ""
            rows.append([CURRENT_SEASON, "Signing", p["club"], p["player_id"], p["name"], p["position"], frm, p["club"], kind, 0, 0])
    rows.sort(key=lambda r: (season_order(r[0]), r[2], r[1], r[4]))
    return rows


if __name__ == "__main__":
    people, seg = load_appearances()
    boot = json.loads((ROOT / "data" / "raw" / "vaastav" / "bootstrap_static_current.json").read_text())
    profiles = build_profiles(people, seg, boot)
    transfers = build_transfers(people, seg, profiles)
    (ROOT / "data" / "current_players.json").write_text(json.dumps(profiles, ensure_ascii=False, indent=0))
    with open(ROOT / "data" / "transfers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["season", "direction", "club", "player_id", "player", "position", "from_club", "to_club", "kind",
                    "appearances_that_season", "minutes_that_season"])
        w.writerows(transfers)
    from collections import Counter
    print(len(profiles), "current players;", sum(1 for p in profiles if p["premier_league_career"]["appearances"]), "have earlier Premier League appearances in our data")
    print(len(transfers), "move rows;", Counter(r[1] for r in transfers))
    print(Counter(r[8] for r in transfers).most_common())
    c = Counter((r[0], r[1]) for r in transfers if r[0] in ("2017–18", "2025–26", "2026–27"))
    print(sorted(c.items()))
