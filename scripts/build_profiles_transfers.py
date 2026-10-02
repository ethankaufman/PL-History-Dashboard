"""Build current-player profiles and the signings / departures lists.

Reads   data/player_seasons.csv                         (every player, club and season, 1992-93 to 2025-26)
        data/raw/vaastav/bootstrap_static_current.json  (today's Premier League player list)
Writes  data/current_players.json   one profile per player in a 2026-27 squad, with his full Premier League career
        data/transfers.csv          signings and departures for every season from 1993-94 to 2026-27, one row per move

How moves are found (no fee data is available, so this is derived from where players actually played):
  - A player's club in each season comes from the clubs he made appearances for.
  - If his club changes from one season to the next (or part-way through a season) that is a move.
  - A player who appears for a club but did not play in the Premier League the season before is
    'from outside the Premier League' (another league, the lower leagues, or the youth team).
  - A player who plays his last Premier League match for a club and never appears again has 'left the Premier League'
    (we cannot see where he went).
  - If a player appears for two clubs in one season, the order is taken from his clubs in the seasons before and after
    (the data has no dates for season totals).
  - 2026-27 arrivals and departures come from comparing the 2025-26 appearances with today's squad lists.
Run:  python3 scripts/build_profiles_transfers.py
"""
import csv
import json
from collections import Counter, defaultdict
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
season_order = lambda s: int(s[:4])
next_season = lambda s: f"{season_order(s) + 1}–{'2000' if season_order(s) == 1998 else f'{(season_order(s) + 2) % 100:02d}'}"


def club(name):
    name = FPL_CLUBS.get(name, name)
    assert name in OFFICIAL, name
    return name


def load():
    people = {}
    by_player = defaultdict(lambda: defaultdict(list))        # player -> season -> [row dicts]
    for r in csv.DictReader(open(ROOT / "data" / "player_seasons.csv")):
        pid = r["player_id"]
        people[pid] = {"name": r["player"], "position": r["position"], "nationality": r["nationality"], "birth_date": r["birth_date"]}
        row = {k: int(r[k]) for k in ("appearances", "goals", "assists", "clean_sheets", "yellow_cards", "red_cards")}
        row.update(season=r["season"], club=r["club"], minutes=int(r["minutes"]) if r["minutes"] != "" else None)
        by_player[pid][r["season"]].append(row)
    return people, by_player


def segments(player_seasons):
    """The player's club-by-club path through the league, in order. Two clubs in one season are ordered using the
    club he was at before and the club he moved to next."""
    seasons = sorted(player_seasons, key=season_order)
    out = []
    for i, s in enumerate(seasons):
        rows = player_seasons[s]
        if len(rows) > 1:
            before = out[-1]["club"] if out else None
            after = player_seasons[seasons[i + 1]][0]["club"] if i + 1 < len(seasons) else None
            clubs = {r["club"] for r in rows}
            if before in clubs:
                rows = sorted(rows, key=lambda r: r["club"] != before)
            elif after in clubs:
                rows = sorted(rows, key=lambda r: r["club"] == after)
            else:
                rows = sorted(rows, key=lambda r: -r["appearances"])
        out.extend(rows)
    return out


def build_profiles(people, by_player, boot):
    teams = {t["id"]: club(t["name"]) for t in boot["teams"]}
    out = []
    for e in boot["elements"]:
        pid = str(e["code"])
        history = []
        for s in segments(by_player.get(pid, {})):
            history.append({"season": s["season"], "club": s["club"], "appearances": s["appearances"], "minutes": s["minutes"], "goals": s["goals"],
                            "assists": s["assists"], "clean_sheets": s["clean_sheets"], "yellow_cards": s["yellow_cards"], "red_cards": s["red_cards"]})
        totals = {k: sum(h[k] for h in history) for k in ("appearances", "goals", "assists", "clean_sheets", "yellow_cards", "red_cards")}
        totals["minutes_recorded"] = sum(h["minutes"] or 0 for h in history)
        born = e["birth_date"]
        age = None
        if born:
            b = date.fromisoformat(born)
            age = TODAY.year - b.year - ((TODAY.month, TODAY.day) < (b.month, b.day))
        out.append({
            "player_id": pid, "name": f'{e["first_name"]} {e["second_name"]}'.strip(), "known_as": e["web_name"],
            "club": teams[e["team"]], "position": POSITIONS[e["element_type"]], "squad_number": e["squad_number"],
            "nationality": people.get(pid, {}).get("nationality") or None,
            "birth_date": born, "age": age, "joined_club": e["team_join_date"],
            "photo": f"https://resources.premierleague.com/premierleague25/photos/players/110x140/{e['code']}.png",
            "availability": {"a": "Available", "i": "Injured", "d": "Doubtful", "s": "Suspended", "u": "Unavailable", "n": "Not in squad"}.get(e["status"], e["status"]),
            "news": e["news"] or None,
            "this_season": {"season": CURRENT_SEASON, "minutes": e["minutes"], "starts": e["starts"], "goals": e["goals_scored"],
                            "assists": e["assists"], "clean_sheets": e["clean_sheets"], "saves": e["saves"],
                            "yellow_cards": e["yellow_cards"], "red_cards": e["red_cards"],
                            "expected_goals": float(e["expected_goals"] or 0), "expected_assists": float(e["expected_assists"] or 0)},
            "premier_league_career": {"note": "Premier League appearances from 1992-93 to 2025-26", **totals, "seasons": history},
        })
    out.sort(key=lambda p: (p["club"], ["Goalkeeper", "Defender", "Midfielder", "Forward"].index(p["position"]), p["name"]))
    return out


def build_transfers(people, by_player, profiles):
    rows = []
    for pid, ps in by_player.items():
        seq = segments(ps)
        for i, s in enumerate(seq):
            prev = seq[i - 1] if i else None
            if prev is None and s["season"] == "1992–93":
                continue                                           # first season of data: nobody can be called a signing
            if prev and prev["club"] == s["club"] and season_order(s["season"]) - season_order(prev["season"]) <= 1:
                continue                                           # stayed
            if prev is None or season_order(s["season"]) - season_order(prev["season"]) > 1:
                kind, frm = ("Returned to the Premier League", prev["club"]) if prev else ("Signing from outside the Premier League", "")
            else:
                kind, frm = ("Mid-season move" if prev["season"] == s["season"] else "Signing from another Premier League club"), prev["club"]
            rows.append([s["season"], "Signing", s["club"], pid, people[pid]["name"], people[pid]["position"], frm, s["club"], kind, s["appearances"], s["goals"]])
        for i, s in enumerate(seq):
            nxt = seq[i + 1] if i + 1 < len(seq) else None
            if nxt and nxt["club"] == s["club"] and season_order(nxt["season"]) - season_order(s["season"]) <= 1:
                continue
            if nxt is None and s["season"] == LAST_SEASON:
                continue                                           # still there; 2026 summer is handled below
            if nxt and nxt["season"] == s["season"]:
                kind, to = "Mid-season move", nxt["club"]
            elif nxt and season_order(nxt["season"]) - season_order(s["season"]) == 1:
                kind, to = "Sold to another Premier League club", nxt["club"]
            elif nxt:
                kind, to = "Left the Premier League for a time", ""
            else:
                kind, to = "Left the Premier League", ""
            leave = s["season"] if kind == "Mid-season move" else next_season(s["season"])
            rows.append([leave, "Departure", s["club"], pid, people[pid]["name"], people[pid]["position"], s["club"], to, kind, s["appearances"], s["goals"]])
    # summer 2026: compare 2025-26 squads with today's squad lists
    now = {p["player_id"]: p for p in profiles}
    for pid, ps in by_player.items():
        last = ps.get(LAST_SEASON)
        if not last:
            continue
        s = max(last, key=lambda r: r["appearances"])
        cur = now.get(pid)
        if cur is None:
            rows.append([CURRENT_SEASON, "Departure", s["club"], pid, people[pid]["name"], people[pid]["position"], s["club"], "", "Left the Premier League", s["appearances"], s["goals"]])
        elif cur["club"] != s["club"]:
            rows.append([CURRENT_SEASON, "Departure", s["club"], pid, people[pid]["name"], people[pid]["position"], s["club"], cur["club"], "Sold to another Premier League club", s["appearances"], s["goals"]])
            rows.append([CURRENT_SEASON, "Signing", cur["club"], pid, people[pid]["name"], people[pid]["position"], s["club"], cur["club"], "Signing from another Premier League club", 0, 0])
    for p in profiles:
        hist = [h for h in p["premier_league_career"]["seasons"] if h["season"] == LAST_SEASON]
        if p["joined_club"] and p["joined_club"] >= "2026-06-01" and not hist:
            earlier = p["premier_league_career"]["seasons"]
            kind = "Returned to the Premier League" if earlier else "Signing from outside the Premier League"
            rows.append([CURRENT_SEASON, "Signing", p["club"], p["player_id"], p["name"], p["position"], earlier[-1]["club"] if earlier else "", p["club"], kind, 0, 0])
    rows.sort(key=lambda r: (season_order(r[0]), r[2], r[1], r[4]))
    return rows


if __name__ == "__main__":
    people, by_player = load()
    boot = json.loads((ROOT / "data" / "raw" / "vaastav" / "bootstrap_static_current.json").read_text())
    profiles = build_profiles(people, by_player, boot)
    transfers = build_transfers(people, by_player, profiles)
    (ROOT / "data" / "current_players.json").write_text(json.dumps(profiles, ensure_ascii=False, indent=0))
    with open(ROOT / "data" / "transfers.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["season", "direction", "club", "player_id", "player", "position", "from_club", "to_club", "kind", "appearances_that_season", "goals_that_season"])
        w.writerows(transfers)
    print(len(profiles), "current players;", sum(1 for p in profiles if p["premier_league_career"]["appearances"]), "have Premier League appearances")
    print(len(transfers), "move rows;", Counter(r[1] for r in transfers))
    print(Counter(r[8] for r in transfers).most_common())
    c = Counter((r[0], r[1]) for r in transfers)
    print(sorted((k, v) for k, v in c.items() if k[0] in ("1993–94", "2005–06", "2025–26", "2026–27")))
