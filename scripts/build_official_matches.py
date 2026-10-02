"""Turn the official Premier League match records into match and player-match tables, and cross-check them.

Reads   data/raw/plmatches/season_*.json     (every match: line-ups, referee, attendance, half-time score, events)
        data/matches.csv, data/player_seasons.csv, data/raw/vaastav/*  (for linking and for the expected-goals columns)
Writes  data/match_details.csv    one row per match: official score, half-time score, referee, attendance, ground
        data/match_events.csv     every goal, penalty, own goal and card, with minute, player and assister
        data/player_matches.csv   THE MAIN DATA SET: one row per player per match he played in (starters and substitutes who came on), 1992-93 to 2025-26
        data/appearances_lean.csv the same rows with ids instead of names, which is what the dashboard loads (much smaller)
        data/raw/official_card_counts.json, official_checks_build.json   inputs for reconcile_matches.py and audit.py

Cards: a player sent off for a second yellow card is counted as a red card only (his earlier yellow in that match is not counted as a yellow),
which is how the Premier League's own statistics work; the raw event list keeps every card as shown.
Clean sheet: the team conceded no goals and the player played the full match (this rule reproduces the Premier League's own clean-sheet totals).
Minutes: a starter plays from 0 until he is substituted or sent off, otherwise 90; a substitute plays from the minute he comes on.
Stoppage time is not counted (the Premier League's own minutes totals work the same way).

Run:  python3 scripts/build_official_matches.py --final      (without --final it writes test copies that do not replace the main files)
"""
import csv
import glob
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

from build_matches import club

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
season_label = lambda start: f"{start}–{'2000' if start == 1999 else f'{(start + 1) % 100:02d}'}"


def plain(n):
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", n)


def iso_birth(label):
    try:
        return datetime.strptime(label, "%d %B %Y").date().isoformat()
    except (ValueError, TypeError):
        return ""


def uk_date(millis):
    """Kick-off as a UK calendar date (the Premier League stores UTC milliseconds)."""
    t = datetime.fromtimestamp(millis / 1000, tz=timezone.utc)
    # British Summer Time runs from the last Sunday in March to the last Sunday in October; a 7:45pm kick-off is still the same day in UTC,
    # so the UTC date is the UK date for every Premier League kick-off.
    return t.date().isoformat()


def load_fixtures():
    out = []
    for f in sorted(glob.glob(str(D / "raw" / "plmatches" / "season_*.json")), key=lambda p: json.loads(Path(p).read_text())["start"]):
        d = json.loads(Path(f).read_text())
        for fx in d["fixtures"].values():
            fx["season"] = season_label(d["start"])
            out.append(fx)
    return out


def build():
    fixtures = load_fixtures()
    matches = {(m["season"], m["home"], m["away"]): m for m in csv.DictReader(open(D / "matches.csv"))}
    ps = list(csv.DictReader(open(D / "player_seasons.csv")))
    opta_by_name_birth = {}
    for r in ps:
        opta_by_name_birth.setdefault((plain(r["player"]), r["birth_date"]), r["player_id"])
    team_games = {(r["match_id"], r["team"]): int(r["game_no"]) for r in csv.DictReader(open(D / "team_matches.csv"))}
    xg = {}
    xg_file = D / "raw" / "expected_goals_2022_on.csv"      # Opta expected goals / assists, saved from the earlier player table
    if xg_file.exists():
        for r in csv.DictReader(open(xg_file)):
            xg[(r["match_id"], r["player_id"])] = (r["expected_goals"], r["expected_assists"])

    # every person who appears in any line-up, so events about someone missing from one match's line-up (an unused substitute who was booked,
    # or a substitute missing from the bench list) can still be understood
    everyone = {}
    for fx in fixtures:
        for tl in fx["lineups"]:
            for p in tl["start"] + tl["subs"]:
                everyone.setdefault(p[0], p)
    details, events_out, rows, problems = [], [], [], []
    internal_to_opta = {}
    unlinked = Counter()
    card_counts = {}                                          # match_id -> {team: [yellow, red]} for the card cross-check

    for fx in sorted(fixtures, key=lambda f: (f["kick"], f["id"])):
        season = fx["season"]
        home, away = club(fx["teams"][0]["name"]), club(fx["teams"][1]["name"])
        m = matches.get((season, home, away))
        if m is None:
            problems.append(("no matching match", season, home, away)); continue
        mid = m["match_id"]
        hg, ag = fx["teams"][0]["score"], fx["teams"][1]["score"]
        details.append([mid, fx["id"], season, uk_date(fx["kick"]), home, away, hg, ag, fx["ht"][0], fx["ht"][1], fx["ref"], fx["att"], fx["ground"][0], fx["ground"][1], fx["gw"]])
        team_by_id = {fx["teams"][0]["id"]: home, fx["teams"][1]["id"]: away}

        # who is who in this match
        info = {}                                             # internal id -> dict
        for tl in fx["lineups"]:
            team = team_by_id[tl["team"]]
            for started, plist in ((1, tl["start"]), (0, tl["subs"])):
                for p in plist:
                    pid = p[0]
                    info[pid] = {"team": team, "started": started, "name": p[1], "pos": p[2], "captain": p[4], "opta": re.sub(r"\D", "", p[5]) or "", "birth": iso_birth(p[6]),
                                 "on": 0 if started else None, "off": 90, "goals": 0, "assists": 0, "own": 0, "yellow": 0, "red": 0}
        def person_in_match(pid, team_id):
            """The person's entry for this match; created from the all-matches lookup if the line-up list left him out."""
            if pid in info:
                return info[pid]
            p = everyone.get(pid)
            team = team_by_id.get(team_id)
            if p is None or team is None:
                return None
            info[pid] = {"team": team, "started": 0, "name": p[1], "pos": p[2], "captain": p[4], "opta": re.sub(r"\D", "", p[5]) or "", "birth": iso_birth(p[6]),
                         "on": None, "off": 90, "goals": 0, "assists": 0, "own": 0, "yellow": 0, "red": 0, "added": True}
            return info[pid]

        evs = sorted(fx["events"], key=lambda e: e[1])
        sub_on = {}
        score = {home: 0, away: 0}
        for typ, secs, person, team_id, assist, desc, reason in evs:
            minute = min(90, int(round(secs / 60)))
            team = team_by_id.get(team_id)
            who = person_in_match(person, team_id)
            if typ == "S":
                if who is None:
                    problems.append(("substitution with no player recorded in the official record", mid, person)); continue
                if desc == "ON":
                    who["on"] = minute
                elif desc == "OFF":
                    who["off"] = min(who["off"], minute)
            elif typ in ("G", "P"):
                if who is None:
                    problems.append(("scorer not in the line-up", mid, person)); continue
                who["goals"] += 1
                score[who["team"]] += 1
                a = info.get(assist) if assist else None
                if a:
                    a["assists"] += 1
                events_out.append([mid, minute, "Penalty goal" if typ == "P" else "Goal", who["team"], person, who["name"], assist or "", a["name"] if a else ""])
            elif typ == "O":
                if who is None:
                    problems.append(("own-goal scorer not in the line-up", mid, person)); continue
                who["own"] += 1
                score[away if who["team"] == home else home] += 1
                events_out.append([mid, minute, "Own goal", who["team"], person, who["name"], "", ""])
            elif typ == "B":
                if who is None:
                    # the official record names no player for this card (not counted: cards here are cards shown to a named player, like the player statistics)
                    problems.append(("booking with no player recorded (not counted)", mid, person)); continue
                if desc == "Y":
                    who["yellow"] += 1; events_out.append([mid, minute, "Yellow card", who["team"], person, who["name"], "", ""])
                elif desc == "R":
                    who["red"] += 1; who["off"] = min(who["off"], minute); events_out.append([mid, minute, "Red card", who["team"], person, who["name"], "", ""])
                elif desc == "YR":
                    # sent off for a second yellow: the incident counts as a red card only (this is how the Premier League's own yellow-card statistic works)
                    who["yellow"] = 0; who["red"] += 1; who["off"] = min(who["off"], minute)
                    events_out.append([mid, minute, "Second yellow card", who["team"], person, who["name"], "", ""])
                else:
                    problems.append(("unlabelled booking", mid, person, desc))
        # team card counts = the sum over every named person (the same rule as the player rows)
        cards = {home: [sum(p["yellow"] for p in info.values() if p["team"] == home), sum(p["red"] for p in info.values() if p["team"] == home)],
                 away: [sum(p["yellow"] for p in info.values() if p["team"] == away), sum(p["red"] for p in info.values() if p["team"] == away)]}
        card_counts[mid] = cards
        if (score[home], score[away]) != (hg, ag):
            problems.append(("events do not add up to the score", mid, (score[home], score[away]), (hg, ag)))

        for pid, p in info.items():
            if p["on"] is None:
                continue                                      # unused substitute
            minutes = max(0, p["off"] - p["on"])
            opta = p["opta"] or internal_to_opta.get(pid) or opta_by_name_birth.get((plain(p["name"]), p["birth"]), "")
            if p["opta"]:
                internal_to_opta[pid] = p["opta"]
            if not opta:
                unlinked[(p["name"], p["birth"])] += 1
                opta = f"int{pid}"
            team, opp = p["team"], (away if p["team"] == home else home)
            tg, og = (hg, ag) if team == home else (ag, hg)
            x = xg.get((mid, opta), ("", ""))
            rows.append([opta, p["name"], p["pos"], season, team_games[(mid, team)], mid, team, opp, "Home" if team == home else "Away", minutes, p["started"],
                         p["goals"], p["assists"], p["own"], 1 if (og == 0 and minutes == 90) else 0, p["yellow"], p["red"], x[0], x[1]])
    return details, events_out, rows, problems, card_counts, unlinked, fixtures


DETAIL_COLUMNS = ["match_id", "pl_fixture_id", "season", "date", "home", "away", "home_goals", "away_goals", "ht_home_goals", "ht_away_goals", "referee", "attendance", "ground", "ground_city", "gameweek"]
EVENT_COLUMNS = ["match_id", "minute", "event", "team", "player_pl_id", "player", "assist_pl_id", "assist"]
PM_COLUMNS = ["player_id", "player", "position", "season", "game_no", "match_id", "team", "opponent", "venue", "minutes", "started", "goals", "assists",
              "own_goals", "clean_sheet", "yellow_cards", "red_cards", "expected_goals", "expected_assists"]
LEAN_COLUMNS = ["match_id", "player_id", "side", "minutes", "started", "goals", "assists", "own_goals", "yellow_cards", "red_cards"]


if __name__ == "__main__":
    details, events, rows, problems, cards, unlinked, fixtures = build()
    print(len(details), "matches,", len(events), "events,", len(rows), "player-match rows")
    print("problems:", len(problems), Counter(p[0] for p in problems).most_common(8))
    print("players that could not be linked to an Opta id:", len(unlinked), list(unlinked.items())[:5])
    json.dump({"problems": problems[:200], "problem_counts": Counter(p[0] for p in problems), "unlinked": len(unlinked)}, open(D / "raw" / "official_checks_build.json", "w"), default=list)
    final = "--final" in __import__("sys").argv
    lean = [[r[5], r[0], "H" if r[8] == "Home" else "A", r[9], r[10], r[11], r[12], r[13], r[15], r[16]] for r in rows]
    for name, cols, data in (("match_details.csv", DETAIL_COLUMNS, details), ("match_events.csv", EVENT_COLUMNS, events),
                             ("player_matches.csv" if final else "player_matches_official.csv", PM_COLUMNS, rows), ("appearances_lean.csv" if final else "appearances_lean_test.csv", LEAN_COLUMNS, lean)):
        with open(D / name, "w", newline="") as f:
            w = csv.writer(f); w.writerow(cols); w.writerows(data)
    json.dump(cards, open(D / "raw" / "official_card_counts.json", "w"))
