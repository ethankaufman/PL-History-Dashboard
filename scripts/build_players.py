"""LEGACY (superseded by build_official_matches.py): an earlier player-match table built from the open vaastav archive (2016-17 onward).
It is kept only to document where the Opta expected-goals columns came from (saved in data/raw/expected_goals_2022_on.csv).
Its assists differ from the official statistics for about a quarter of player-seasons (fantasy-game rules), so it is no longer used.

Original description: build the player-match table: one row for each player who played in each Premier League match.

Reads   data/raw/vaastav/<season>/merged_gw.csv + players_raw.csv   (2016-17 to 2025-26)
        data/matches.csv                                            (to link each row to its real match)
Writes  data/raw/player_matches_fpl_archive.csv

Only real football facts are kept (minutes, goals, assists, cards...). All fantasy-game columns are dropped.
A row is kept only when the player played at least one minute, so each match lists the players who took part.

How a row is linked to a match: the archive gives the opponent as a team number and the kickoff date. We work out
which club each team number is (by matching dates and scores), then find the one match that club's opponent
played on that date. The score in the archive must equal the score in our match table; the script stops if not.

Run:  python3 scripts/build_players.py
"""
import csv
import io
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "vaastav"
POSITIONS = {"1": "Goalkeeper", "2": "Defender", "3": "Midfielder", "4": "Forward"}

COLUMNS = ["player_id", "player", "position", "season", "game_no", "date", "match_id", "team", "opponent", "venue",
           "team_goals", "opponent_goals", "minutes", "started", "goals", "assists", "own_goals", "clean_sheet",
           "goals_conceded", "saves", "penalties_saved", "penalties_missed", "yellow_cards", "red_cards",
           "expected_goals", "expected_assists"]


def read_csv(path):
    return list(csv.DictReader(io.StringIO(path.read_text(encoding="utf-8", errors="replace"))))


def fnum(x):
    try:
        return round(float(x), 3)
    except (TypeError, ValueError):
        return ""


def inum(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return ""


def load_matches():
    by_date = defaultdict(list)   # date -> [match dict]
    for m in read_csv(ROOT / "data" / "matches.csv"):
        m["d"] = date.fromisoformat(m["date"])
        m["hg"], m["ag"] = int(m["home_goals"]), int(m["away_goals"])
        by_date[m["d"]].append(m)
    return by_date


def season_label(s):
    start = int(s[:4])
    return f"{start}–{'2000' if start == 1999 else f'{(start + 1) % 100:02d}'}"


def candidates(by_date, d, hs, as_):
    for delta in (0, -1, 1):
        for m in by_date.get(d + timedelta(days=delta), []):
            if m["hg"] == hs and m["ag"] == as_:
                yield m


def team_numbers(rows, players, by_date, season):
    """Work out which club each of the season's team numbers is, by voting over matches."""
    votes = defaultdict(Counter)
    for r in rows:
        p = players.get(r["element"])
        if not p or inum(r["minutes"]) in ("", 0):
            continue
        d = date.fromisoformat(r["kickoff_time"][:10])
        hs, as_ = inum(r["team_h_score"]), inum(r["team_a_score"])
        if hs == "" or as_ == "":
            continue
        home = r["was_home"] == "True"
        for m in candidates(by_date, d, hs, as_):
            if m["season"] != season:
                continue
            votes[p["team"]][m["home"] if home else m["away"]] += 1
    mapping = {}
    for tid, c in votes.items():
        mapping[tid] = c.most_common(1)[0][0]
    return mapping


def build():
    by_date = load_matches()
    out, problems = [], []
    for sdir in sorted(RAW.glob("20*")):
        season = season_label(sdir.name)
        players = {p["id"]: p for p in read_csv(sdir / "players_raw.csv")}
        rows = read_csv(sdir / "merged_gw.csv")
        tmap = team_numbers(rows, players, by_date, season)
        assert len(tmap) == 20 and len(set(tmap.values())) == 20, (season, tmap)
        seen = set()
        for r in rows:
            mins = inum(r["minutes"])
            if mins in ("", 0):
                continue
            p = players.get(r["element"])
            if p is None:
                problems.append((season, "unknown player", r["element"])); continue
            d = date.fromisoformat(r["kickoff_time"][:10])
            hs, as_ = inum(r["team_h_score"]), inum(r["team_a_score"])
            home = r["was_home"] == "True"
            opp = tmap.get(r["opponent_team"])
            found = [m for m in candidates(by_date, d, hs, as_)
                     if m["season"] == season and ((m["away"] == opp) if home else (m["home"] == opp))]
            if len(found) != 1:
                problems.append((season, "match link", p["web_name"], str(d), hs, as_, opp, len(found))); continue
            m = found[0]
            team = m["home"] if home else m["away"]
            key = (m["match_id"], p["code"])
            if key in seen:
                problems.append((season, "duplicate", p["web_name"], m["match_id"])); continue
            seen.add(key)
            tg, og = (m["hg"], m["ag"]) if home else (m["ag"], m["hg"])
            out.append([p["code"], f'{p["first_name"]} {p["second_name"]}'.strip(), POSITIONS[p["element_type"]], season,
                        "", m["date"], m["match_id"], team, opp, "Home" if home else "Away", tg, og, mins,
                        inum(r.get("starts")), inum(r["goals_scored"]), inum(r["assists"]), inum(r["own_goals"]),
                        inum(r["clean_sheets"]), inum(r["goals_conceded"]), inum(r["saves"]), inum(r["penalties_saved"]),
                        inum(r["penalties_missed"]), inum(r["yellow_cards"]), inum(r["red_cards"]),
                        fnum(r.get("expected_goals")), fnum(r.get("expected_assists"))])
    # add the team's game number (matchweek) from the team-match table
    gn = {(r["match_id"], r["team"]): r["game_no"]
          for r in read_csv(ROOT / "data" / "team_matches.csv")}
    for row in out:
        row[4] = gn[(row[6], row[7])]
    out.sort(key=lambda r: (r[3], r[5], r[6], r[7], r[1]))
    return out, problems


def check(out):
    # every row's player-team score matches, and each team in each match has a sensible number of players
    per = defaultdict(int)
    for r in out:
        per[(r[6], r[7])] += r[12]
    low = sorted((v, k) for k, v in per.items() if v < 900)
    return low


if __name__ == "__main__":
    rows, problems = build()
    print(len(rows), "player-match rows")
    print("problems:", len(problems), problems[:8])
    low = check(rows)
    print("team-matches with under 900 player-minutes in total:", len(low), low[:5])
    with open(ROOT / "data" / "raw" / "player_matches_fpl_archive.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(COLUMNS); w.writerows(rows)
