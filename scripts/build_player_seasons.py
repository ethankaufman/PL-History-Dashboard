"""Build data/player_seasons.csv: one row per player, per club, per season, 1992-93 to 2025-26.

Reads  data/raw/plstats/season_*.json   (downloaded by fetch_pl_stats.py from the Premier League's statistics service)
Writes data/player_seasons.csv

Columns: season, player_id (the Opta ID, the same ID as in player_matches.csv), player, position, nationality, birth_date,
club, appearances, goals, assists, clean_sheets, yellow_cards, red_cards, minutes.
 - A player who played for two clubs in one season has two rows.
 - 'minutes' is only recorded by the Premier League from about 2006-07; it is blank before that.
 - 'clean_sheets' counts the team's clean sheets in matches the player took part in.
The table is checked against the official career records (Shearer's 260 goals, Giggs' 162 assists...) and against the
match-by-match data for 2016-17 onward.

Run:  python3 scripts/build_player_seasons.py
"""
import csv
import glob
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from build_matches import club as canonical_club

ROOT = Path(__file__).resolve().parent.parent
POS = {"G": "Goalkeeper", "D": "Defender", "M": "Midfielder", "F": "Forward"}
ALIAS = {"Bournemouth": "AFC Bournemouth", "Sheffield Wednesday": "Sheffield Wednesday"}
COLUMNS = ["season", "player_id", "player", "position", "nationality", "birth_date", "club", "appearances", "goals",
           "assists", "clean_sheets", "yellow_cards", "red_cards", "minutes"]


def season_label(start):
    return f"{start}–{'2000' if start == 1999 else f'{(start + 1) % 100:02d}'}"


def plain(name):
    """Compare names ignoring accents and capitals; Wikipedia says 'Andy Cole' where the Premier League says 'Andrew Cole'."""
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().strip()
    return {"andy cole": "andrew cole"}.get(name, name)


def iso_birth(label):
    try:
        return datetime.strptime(label, "%d %B %Y").date().isoformat()
    except ValueError:
        return ""


def build():
    rows = []
    for f in sorted(glob.glob(str(ROOT / "data" / "raw" / "plstats" / "season_*.json")), key=lambda p: json.loads(Path(p).read_text())["start"]):
        d = json.loads(Path(f).read_text())
        season = season_label(d["start"])
        for team, t in d["teams"].items():
            stats = t["stats"]
            name = canonical_club(ALIAS.get(team, team))
            by = {k: {r[6]: r for r in v} for k, v in stats.items()}          # stat -> {PL player id -> row}
            has_minutes = bool(stats.get("mins_played"))
            for pid, r in by.get("appearances", {}).items():
                value = lambda k: int(by.get(k, {}).get(pid, [0] * 6)[5])
                opta = re.sub(r"\D", "", r[0]) or f"pl{pid}"
                rows.append([season, opta, r[1], POS.get(r[2], ""), r[3], iso_birth(r[4]), name, int(r[5]), value("goals"),
                             value("goal_assist"), value("clean_sheet"), value("yellow_card"), value("red_card"),
                             value("mins_played") if has_minutes else ""])
    # Minutes are only trustworthy in seasons where (nearly) every player has them; blank them elsewhere
    by_season = defaultdict(list)
    for r in rows:
        by_season[r[0]].append(r)
    for season, rs in by_season.items():
        covered = sum(1 for r in rs if r[13] not in ("", 0)) / len(rs)
        if covered < 0.85:
            for r in rs:
                r[13] = ""
    rows.sort(key=lambda r: (int(r[0][:4]), r[6], -r[7], r[2]))
    return rows


def check(rows):
    problems = []
    seasons = sorted({r[0] for r in rows}, key=lambda s: int(s[:4]))
    if len(seasons) != 34:
        problems.append(f"expected 34 seasons, found {len(seasons)}")
    # 1. career totals against the official top-10 lists
    records = json.loads((ROOT / "data" / "records.json").read_text())["official"]
    career = defaultdict(lambda: defaultdict(int))
    for r in rows:
        c = career[r[1]]; c["name"] = r[2]
        c["apps"] += r[7]; c["goals"] += r[8]; c["assists"] += r[9]; c["cs"] += r[10]
    by_name = {}
    for pid, c in career.items():
        by_name.setdefault(plain(c["name"]), []).append(c)
    ok_lists = 0
    for key, col, field in (("most_goals", "Goals", "goals"), ("most_assists", "Assists", "assists"), ("most_appearances", "Games", "apps"), ("most_clean_sheets", "Clean sheets", "cs")):
        for rec in records[key]:
            cands = by_name.get(plain(rec["Player"]), [])
            got = max((c[field] for c in cands), default=None)
            want = int(rec[col])
            if got != want:
                problems.append(f"{key}: {rec['Player']} official {want}, computed {got}")
            else:
                ok_lists += 1
    # 2. total goals per season by players must be close to league goals (own goals are not credited to players)
    matches = list(csv.DictReader(open(ROOT / "data" / "matches.csv")))
    league = defaultdict(int)
    for m in matches:
        league[m["season"]] += int(m["home_goals"]) + int(m["away_goals"])
    ratio = {}
    for s in seasons:
        player_goals = sum(r[8] for r in rows if r[0] == s)
        ratio[s] = player_goals / league[s]
        if not 0.93 <= ratio[s] <= 1.0:
            problems.append(f"{s}: players scored {player_goals} of {league[s]} league goals ({ratio[s]:.3f})")
    return problems, ok_lists, ratio


if __name__ == "__main__":
    rows = build()
    print(len(rows), "player-season-club rows,", len({r[1] for r in rows}), "players")
    problems, ok, ratio = check(rows)
    print(f"{ok} of 40 official top-10 career figures reproduced exactly")
    print("share of league goals credited to players:", {s: round(v, 3) for s, v in list(ratio.items())[:3]}, "...")
    print("PROBLEMS:", problems[:20] if problems else "none")
    with open(ROOT / "data" / "player_seasons.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(COLUMNS); w.writerows(rows)
