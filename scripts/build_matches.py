"""Build the match tables from the downloaded results.

Reads   data/raw/footballdata/E0_*.csv   (1993-94 to 2025-26)
        data/raw/footballcsv/eng.1_1992-93.csv   (1992-93)
Writes  data/matches.csv        one row per match (13,166 rows)
        data/team_matches.csv   one row per team per match (26,332 rows) with the running league table

'Matchweek' in this project means "the team's nth game of the season" (game_no). Every team has played
the same number of games at game n, so the table at game n is a fair comparison between clubs.

Run:  python3 scripts/build_matches.py
"""
import csv
import glob
import io
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# football-data.co.uk uses short names; map every name to the one official club name used across the project.
ALIASES = {
    "Birmingham": "Birmingham City", "Blackburn": "Blackburn Rovers", "Bolton": "Bolton Wanderers",
    "Bournemouth": "AFC Bournemouth", "Bradford": "Bradford City", "Brighton": "Brighton & Hove Albion",
    "Cardiff": "Cardiff City", "Charlton": "Charlton Athletic", "Coventry": "Coventry City",
    "Derby": "Derby County", "Huddersfield": "Huddersfield Town", "Hull": "Hull City", "Ipswich": "Ipswich Town", "Leeds": "Leeds United",
    "Leicester": "Leicester City", "Luton": "Luton Town", "Man City": "Manchester City",
    "Man United": "Manchester United", "Newcastle": "Newcastle United", "Norwich": "Norwich City",
    "Nott'm Forest": "Nottingham Forest", "Oldham": "Oldham Athletic", "QPR": "Queens Park Rangers",
    "Sheffield Weds": "Sheffield Wednesday", "Stoke": "Stoke City", "Swansea": "Swansea City",
    "Swindon": "Swindon Town", "Tottenham": "Tottenham Hotspur", "West Brom": "West Bromwich Albion",
    "West Ham": "West Ham United", "Wigan": "Wigan Athletic", "Wolves": "Wolverhampton Wanderers",
}
OFFICIAL = {t["name"] for t in json.loads((ROOT / "data" / "teams.json").read_text())}


# Official points deductions: (season, club, date it took effect, points). Confirmed against the official final tables
# by scripts/build_tables.py (official points = points earned on the pitch minus these). The date decides from which game
# the running table includes the deduction.
DEDUCTIONS = [
    ("1996–97", "Middlesbrough", "1997-01-02", 3),
    ("2009–10", "Portsmouth", "2010-02-26", 9),
    ("2023–24", "Everton", "2023-11-17", 6),
    ("2023–24", "Everton", "2024-04-19", 2),
    ("2023–24", "Nottingham Forest", "2024-03-18", 4),
]


def club(name):
    name = name.strip()
    name = re.sub(r"\s+(A?FC)$", "", name)          # footballcsv writes 'Arsenal FC', 'Oldham Athletic AFC'
    name = ALIASES.get(name, name)
    assert name in OFFICIAL, f"unknown club name: {name!r}"
    return name


def season_label(start):
    return f"{start}–{'2000' if start == 1999 else f'{(start + 1) % 100:02d}'}"


def to_int(x):
    x = (x or "").strip()
    return int(float(x)) if x not in ("", "NA") else None


def to_float(x):
    x = (x or "").strip()
    try:
        return float(x)
    except ValueError:
        return None


def parse_date(text):
    text = text.strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%a %b %d %Y"):
        try:
            d = datetime.strptime(text, fmt)
            if fmt == "%d/%m/%y" and d.year > 2030:   # two-digit years: 93 means 1993
                d = d.replace(year=d.year - 100)
            return d.date()
        except ValueError:
            pass
    raise ValueError(f"bad date {text!r}")


def odds(row):
    """Home/draw/away odds from the first bookmaker that has all three."""
    for h, d, a in (("B365H", "B365D", "B365A"), ("BbAvH", "BbAvD", "BbAvA"), ("AvgH", "AvgD", "AvgA"),
                    ("WHH", "WHD", "WHA"), ("IWH", "IWD", "IWA")):
        vals = [to_float(row.get(k)) for k in (h, d, a)]
        if all(v for v in vals):
            return vals
    return [None, None, None]


def read_matches():
    out = []
    for f in sorted(glob.glob(str(RAW / "footballdata" / "E0_*.csv"))):
        code = re.search(r"E0_(\d{4})", f).group(1)
        start = int(code[:2]) + (1900 if int(code[:2]) >= 90 else 2000)
        rows = [r for r in csv.DictReader(io.StringIO(Path(f).read_text(encoding="latin-1"))) if r.get("HomeTeam")]
        for r in rows:
            o = odds(r)
            out.append(dict(
                season=season_label(start), date=parse_date(r["Date"]), home=club(r["HomeTeam"]), away=club(r["AwayTeam"]),
                hg=to_int(r["FTHG"]), ag=to_int(r["FTAG"]), hthg=to_int(r.get("HTHG")), htag=to_int(r.get("HTAG")),
                referee=(r.get("Referee") or "").strip(), hs=to_int(r.get("HS")), as_=to_int(r.get("AS")),
                hst=to_int(r.get("HST")), ast=to_int(r.get("AST")), hf=to_int(r.get("HF")), af=to_int(r.get("AF")),
                hc=to_int(r.get("HC")), ac=to_int(r.get("AC")), hy=to_int(r.get("HY")), ay=to_int(r.get("AY")),
                hr=to_int(r.get("HR")), ar=to_int(r.get("AR")), oh=o[0], od=o[1], oa=o[2]))
    for r in csv.DictReader(open(RAW / "footballcsv" / "eng.1_1992-93.csv")):
        hg, ag = (int(x) for x in r["FT"].split("-"))
        out.append(dict(season=season_label(1992), date=parse_date(r["Date"]), home=club(r["Team 1"]), away=club(r["Team 2"]),
                        hg=hg, ag=ag, hthg=None, htag=None, referee="", hs=None, as_=None, hst=None, ast=None, hf=None,
                        af=None, hc=None, ac=None, hy=None, ay=None, hr=None, ar=None, oh=None, od=None, oa=None))
    # the official Premier League kick-off dates (written by reconcile_matches.py) replace football-data.co.uk's where the two differ
    official = ROOT / "data" / "raw" / "official_dates.csv"
    if official.exists():
        fixed = {(r["season"], r["home"], r["away"]): r["date"] for r in csv.DictReader(open(official))}
        for m in out:
            d = fixed.get((m["season"], m["home"], m["away"]))
            if d:
                m["date"] = datetime.strptime(d, "%Y-%m-%d").date()
    out.sort(key=lambda m: (m["date"], m["home"]))
    return out


def result(gf, ga):
    return "W" if gf > ga else ("D" if gf == ga else "L")


MATCH_COLUMNS = ["match_id", "season", "date", "home", "away", "home_goals", "away_goals", "result", "ht_home_goals",
                 "ht_away_goals", "referee", "home_shots", "away_shots", "home_shots_on_target", "away_shots_on_target",
                 "home_fouls", "away_fouls", "home_corners", "away_corners", "home_yellow", "away_yellow", "home_red",
                 "away_red", "odds_home", "odds_draw", "odds_away"]

TEAM_COLUMNS = ["match_id", "season", "date", "game_no", "team", "opponent", "venue", "goals_for", "goals_against",
                "result", "points", "ht_goals_for", "ht_goals_against", "shots", "shots_against", "shots_on_target",
                "shots_on_target_against", "fouls", "fouls_against", "corners", "corners_against", "yellow_cards",
                "red_cards", "referee", "cum_points", "cum_goal_diff", "cum_goals_for", "cum_deduction", "position"]


def build():
    matches = read_matches()
    per_season = {}
    for m in matches:
        per_season.setdefault(m["season"], []).append(m)
    match_rows, team_rows = [], []
    for season, ms in per_season.items():
        for i, m in enumerate(ms, 1):
            m["match_id"] = f"{season[:4]}-{i:03d}"
            match_rows.append([m["match_id"], season, m["date"].isoformat(), m["home"], m["away"], m["hg"], m["ag"],
                               "H" if m["hg"] > m["ag"] else ("A" if m["hg"] < m["ag"] else "D"), m["hthg"], m["htag"],
                               m["referee"], m["hs"], m["as_"], m["hst"], m["ast"], m["hf"], m["af"], m["hc"], m["ac"],
                               m["hy"], m["ay"], m["hr"], m["ar"], m["oh"], m["od"], m["oa"]])
        # one row per team per match, then running totals by the team's own game number
        games = {}
        for m in ms:
            for side in ("home", "away"):
                team = m["home"] if side == "home" else m["away"]
                opp = m["away"] if side == "home" else m["home"]
                p = "h" if side == "home" else "a"
                q = "a" if side == "home" else "h"
                gf, ga = (m["hg"], m["ag"]) if side == "home" else (m["ag"], m["hg"])
                g = lambda k: m[k.replace("#", p)]  # noqa: E731
                stat = lambda mine, theirs: (m[mine.replace("#", p)], m[theirs.replace("#", q)])  # noqa: E731
                shots = (m["hs"], m["as_"]) if side == "home" else (m["as_"], m["hs"])
                sot = (m["hst"], m["ast"]) if side == "home" else (m["ast"], m["hst"])
                fouls = (m["hf"], m["af"]) if side == "home" else (m["af"], m["hf"])
                corners = (m["hc"], m["ac"]) if side == "home" else (m["ac"], m["hc"])
                yellow = m["hy"] if side == "home" else m["ay"]
                red = m["hr"] if side == "home" else m["ar"]
                ht = (m["hthg"], m["htag"]) if side == "home" else (m["htag"], m["hthg"])
                games.setdefault(team, []).append(dict(
                    match_id=m["match_id"], season=season, date=m["date"], team=team, opponent=opp,
                    venue="Home" if side == "home" else "Away", gf=gf, ga=ga, res=result(gf, ga),
                    pts={"W": 3, "D": 1, "L": 0}[result(gf, ga)], htf=ht[0], hta=ht[1], shots=shots[0], shots_a=shots[1],
                    sot=sot[0], sot_a=sot[1], fouls=fouls[0], fouls_a=fouls[1], corners=corners[0], corners_a=corners[1],
                    yellow=yellow, red=red, referee=m["referee"]))
        for team, gl in games.items():
            gl.sort(key=lambda r: (r["date"], r["match_id"]))
            cp = cd = cf = 0
            for n, r in enumerate(gl, 1):
                cp += r["pts"]; cd += r["gf"] - r["ga"]; cf += r["gf"]
                r.update(game_no=n, cum_points=cp, cum_gd=cd, cum_gf=cf, cum_ded=0)
            for dseason, dteam, dwhen, dpts in DEDUCTIONS:
                if dseason == season and dteam == team:
                    for r in gl:
                        if r["date"].isoformat() >= dwhen:
                            r["cum_points"] -= dpts
                            r["cum_ded"] += dpts
        # league position after each game number (everyone has played the same number of games)
        max_n = max(len(gl) for gl in games.values())
        for n in range(1, max_n + 1):
            snap = sorted(((gl[n - 1]["cum_points"], gl[n - 1]["cum_gd"], gl[n - 1]["cum_gf"], t) for t, gl in games.items() if len(gl) >= n),
                          key=lambda x: (-x[0], -x[1], -x[2], x[3]))
            for pos, (_, _, _, t) in enumerate(snap, 1):
                games[t][n - 1]["position"] = pos
        for gl in games.values():
            for r in gl:
                team_rows.append([r["match_id"], r["season"], r["date"].isoformat(), r["game_no"], r["team"], r["opponent"],
                                  r["venue"], r["gf"], r["ga"], r["res"], r["pts"], r["htf"], r["hta"], r["shots"], r["shots_a"],
                                  r["sot"], r["sot_a"], r["fouls"], r["fouls_a"], r["corners"], r["corners_a"], r["yellow"],
                                  r["red"], r["referee"], r["cum_points"], r["cum_gd"], r["cum_gf"], r["cum_ded"], r["position"]])
    team_rows.sort(key=lambda r: (r[1], r[2], r[0], r[6] != "Home"))
    return match_rows, team_rows


def check(match_rows, team_rows):
    from collections import Counter
    n = Counter(r[1] for r in match_rows)
    for season, count in n.items():
        assert count == (462 if season[:4] in ("1992", "1993", "1994") else 380), (season, count)
    assert len(match_rows) == 13166 and len(team_rows) == 26332, (len(match_rows), len(team_rows))
    games = Counter((r[1], r[4]) for r in team_rows)
    for (season, team), g in games.items():
        assert g == (42 if season[:4] in ("1992", "1993", "1994") else 38), (season, team, g)
    # champions and relegated clubs must match the season list we built from Wikipedia
    seasons = {s["season"]: s for s in json.loads((ROOT / "data" / "seasons.json").read_text())}
    final = {}
    for r in team_rows:
        if r[3] == (42 if r[1][:4] in ("1992", "1993", "1994") else 38):
            final.setdefault(r[1], []).append((r[28], r[4], r[24]))
    problems = []
    for season, rows in final.items():
        rows.sort()
        champion = rows[0][1]
        drop = 4 if season == "1994–95" else 3
        relegated = {t for _, t, _ in rows[-drop:]}
        if champion != seasons[season]["champion"]:
            problems.append(("champion", season, champion, seasons[season]["champion"]))
        if relegated != set(seasons[season]["relegated"]):
            problems.append(("relegated", season, sorted(relegated), sorted(seasons[season]["relegated"])))
    return problems


if __name__ == "__main__":
    mrows, trows = build()
    problems = check(mrows, trows)
    print("problems:", problems if problems else "none - champions and relegated clubs agree with seasons.json")
    with open(ROOT / "data" / "matches.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(MATCH_COLUMNS); w.writerows(mrows)
    with open(ROOT / "data" / "team_matches.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(TEAM_COLUMNS); w.writerows(trows)
    print(len(mrows), "matches;", len(trows), "team-match rows written")
