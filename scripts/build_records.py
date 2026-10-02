"""Build data/records.json: league records and club records.

  official  - all-time player and team records exactly as listed on Wikipedia's 'Premier League records and statistics'
              (career goals, assists, appearances, clean sheets, penalties, free kicks, best and worst seasons, all-time table)
              plus the list of players with 100+ Premier League goals.
  league    - records computed from this project's own match data: biggest wins, highest-scoring matches, best and worst
              seasons, longest unbeaten / winning / losing runs.
  clubs     - for each of the 51 clubs: its Premier League record, best and worst seasons, streaks, biggest win and defeat,
              top scorer, and its domestic trophies.

The computed numbers are checked against the official ones (for example the most points ever, the fewest points ever
and Arsenal's 49-game unbeaten run).
Run:  python3 scripts/build_records.py
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

from build_matches import club
from wikitables import tables_from_file

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
read = lambda f: list(csv.DictReader(open(ROOT / "data" / f)))


def table_dicts(rows):
    head = [h.replace("¦", " ").strip() for h in rows[0]]
    return [dict(zip(head, r)) for r in rows[1:]]


def official():
    t = tables_from_file(RAW / "pl_records.json")
    labels = ["best_seasons", "worst_seasons", "most_appearances", "most_goals", "most_penalties", "most_free_kicks",
              "most_assists", "most_clean_sheets"]
    out = {name: table_dicts(t[i][1]) for i, name in enumerate(labels)}
    out["all_time_table"] = table_dicts(t[8][1])
    out["100_goals"] = table_dicts(tables_from_file(RAW / "pl_100_goals.json")[0][1])
    return out


def season_start(s):
    return int(s[:4])


def streaks(games):
    """Longest unbeaten, winning and losing runs. `games` are sorted by season then date; a run only continues
    from one season to the next if the club played in both (a spell outside the league breaks it)."""
    best = {"unbeaten": None, "winning": None, "losing": None, "winless": None, "clean_sheets": None}
    cur = {k: [] for k in best}
    prev_season = None
    test = {"unbeaten": lambda g: g["result"] != "L", "winning": lambda g: g["result"] == "W", "losing": lambda g: g["result"] == "L",
            "winless": lambda g: g["result"] != "W", "clean_sheets": lambda g: int(g["goals_against"]) == 0}
    for g in games:
        if prev_season is not None and season_start(g["season"]) - season_start(prev_season) > 1:
            cur = {k: [] for k in best}
        prev_season = g["season"]
        for k, f in test.items():
            if f(g):
                cur[k].append(g)
                if best[k] is None or len(cur[k]) > best[k]["length"]:
                    best[k] = {"length": len(cur[k]), "from": cur[k][0]["date"], "to": g["date"], "from_season": cur[k][0]["season"], "to_season": g["season"]}
            else:
                cur[k] = []
    return best


def main():
    matches = read("matches.csv")
    tm = read("team_matches.csv")
    ft = read("final_tables.csv")
    teams = {t["name"]: t for t in json.loads((ROOT / "data" / "teams.json").read_text())}
    dom = json.loads((ROOT / "data" / "domestic_honours.json").read_text())["by_club"]
    for m in matches:
        m["hg"], m["ag"] = int(m["home_goals"]), int(m["away_goals"])

    mrow = lambda m, extra=None: {"date": m["date"], "season": m["season"], "home": m["home"], "away": m["away"], "score": f'{m["hg"]}–{m["ag"]}', **(extra or {})}
    league = {
        "biggest_wins": [mrow(m, {"margin": abs(m["hg"] - m["ag"])}) for m in sorted(matches, key=lambda m: (-abs(m["hg"] - m["ag"]), -(m["hg"] + m["ag"]), m["date"]))[:8]],
        "highest_scoring": [mrow(m, {"goals": m["hg"] + m["ag"]}) for m in sorted(matches, key=lambda m: (-(m["hg"] + m["ag"]), m["date"]))[:8]],
    }
    for r in ft:
        for k in ("position", "played", "won", "drawn", "lost", "goals_for", "goals_against", "goal_difference", "points", "points_deducted"):
            r[k] = int(r[k])
    row = lambda r: {"team": r["team"], "season": r["season"], "points": r["points"], "won": r["won"], "drawn": r["drawn"], "lost": r["lost"], "goals_for": r["goals_for"], "goals_against": r["goals_against"], "position": r["position"]}
    full = [r for r in ft if r["played"] == 38]          # compare like with like: 38-game seasons
    league["most_points"] = [row(r) for r in sorted(full, key=lambda r: (-r["points"], -r["goal_difference"]))[:5]]
    league["fewest_points"] = [row(r) for r in sorted(full, key=lambda r: (r["points"], r["goal_difference"]))[:5]]
    league["most_wins"] = [row(r) for r in sorted(full, key=lambda r: (-r["won"], -r["points"]))[:5]]
    league["most_goals_scored"] = [row(r) for r in sorted(ft, key=lambda r: -r["goals_for"])[:5]]
    league["fewest_goals_conceded"] = [row(r) for r in sorted(full, key=lambda r: (r["goals_against"], -r["points"]))[:5]]
    league["most_goals_conceded"] = [row(r) for r in sorted(ft, key=lambda r: -r["goals_against"])[:5]]

    by_team = defaultdict(list)
    for r in tm:
        by_team[r["team"]].append(r)
    for rows in by_team.values():
        rows.sort(key=lambda r: (season_start(r["season"]), r["date"], r["match_id"]))
    all_streaks = {t: streaks(rows) for t, rows in by_team.items()}
    for kind in ("unbeaten", "winning", "losing", "winless", "clean_sheets"):
        league[f"longest_{kind}_runs"] = [{"team": t, **s[kind]} for t, s in sorted(all_streaks.items(), key=lambda kv: -kv[1][kind]["length"])[:5]]

    clubs = {}
    for name, rows in by_team.items():
        seasons = [r for r in ft if r["team"] == name]
        mine = [m for m in matches if name in (m["home"], m["away"])]
        def result(m):
            gf, ga = (m["hg"], m["ag"]) if m["home"] == name else (m["ag"], m["hg"])
            return gf, ga
        bw = max(mine, key=lambda m: (result(m)[0] - result(m)[1], result(m)[0], m["date"]), default=None)
        bd = min(mine, key=lambda m: (result(m)[0] - result(m)[1], -result(m)[1], m["date"]), default=None)
        mrec = lambda m: None if m is None else {"date": m["date"], "season": m["season"], "home": m["home"], "away": m["away"], "score": f'{m["hg"]}–{m["ag"]}'}
        s = streaks(rows)
        clubs[name] = {
            "premier_league": {
                "seasons": len(seasons), "played": len(rows),
                "won": sum(r["result"] == "W" for r in rows), "drawn": sum(r["result"] == "D" for r in rows), "lost": sum(r["result"] == "L" for r in rows),
                "goals_for": sum(int(r["goals_for"]) for r in rows), "goals_against": sum(int(r["goals_against"]) for r in rows),
                "points": sum(r["points"] for r in seasons), "titles": sum(r["position"] == 1 for r in seasons),
            },
            "best_finish": row(min(seasons, key=lambda r: (r["position"], -r["points"]))),
            "worst_finish": row(max(seasons, key=lambda r: (r["position"] / r["played"], -r["points"]))) if seasons else None,
            "most_points": row(max(seasons, key=lambda r: (r["points"] / r["played"], r["points"]))),
            "fewest_points": row(min(seasons, key=lambda r: (r["points"] / r["played"], r["points"]))),
            "most_goals_scored": row(max(seasons, key=lambda r: r["goals_for"])),
            "most_wins": row(max(seasons, key=lambda r: r["won"])),
            "biggest_win": mrec(bw), "biggest_defeat": mrec(bd),
            "longest_unbeaten": s["unbeaten"], "longest_winning": s["winning"], "longest_losing": s["losing"],
            "longest_winless": s["winless"], "most_clean_sheets_in_a_row": s["clean_sheets"],
            "top_scorer": teams[name]["premier_league"]["top_scorer"],
            "domestic_trophies": dom[name]["counts"],
        }

    out = {"official": official(), "league": league, "clubs": clubs}

    # ---- checks against the official records ----
    off = out["official"]
    top = league["most_points"][0]
    assert f'{top["team"]} ({top["season"]})' in off["best_seasons"][0]["Team"], (top, off["best_seasons"][0])
    low = league["fewest_points"][0]
    assert f'{low["team"]} ({low["season"]})' in off["worst_seasons"][0]["Team"], (low, off["worst_seasons"][0])
    assert league["longest_unbeaten_runs"][0]["team"] == "Arsenal" and league["longest_unbeaten_runs"][0]["length"] == 49
    assert clubs["Manchester City"]["premier_league"]["titles"] == 8
    shearer = next(r for r in off["most_goals"] if r["Player"] == "Alan Shearer")
    assert shearer["Rank"] == "1" and shearer["Goals"] == "260"
    print("checks passed: most points, fewest points and Arsenal's 49-game run agree with the official records; Shearer 260")
    (ROOT / "data" / "records.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("biggest win:", league["biggest_wins"][0]); print("highest scoring:", league["highest_scoring"][0])
    print("unbeaten:", league["longest_unbeaten_runs"][:2]); print("winning:", league["longest_winning_runs"][0]); print("losing:", league["longest_losing_runs"][0])
    print("Arsenal:", json.dumps(clubs["Arsenal"])[:700])


if __name__ == "__main__":
    main()
