"""Read each season's official final league table from the saved Wikipedia pages.

Writes data/final_tables.csv  (one row per club per season: position, played, W/D/L, goals, points, deduction, outcome)
and prints any club whose official points differ from the points earned in the match results
(those differences are points deductions).

Run:  python3 scripts/build_tables.py
"""
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_matches import club  # noqa: E402
from wikitables import tables_from_file  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def season_label(start):
    return f"{start}–{'2000' if start == 1999 else f'{(start + 1) % 100:02d}'}"


def clean_team(text):
    text = re.sub(r"\[.*?\]|\(.*?\)", "", text)          # '(C)', '(R)', footnote marks
    text = text.split("¦")[0]
    return text.strip().replace(" and ", " & ") if "Brighton" in text else text.strip()


def read_official(start):
    for caption, rows in tables_from_file(ROOT / "data" / "raw" / "seasons" / f"season_{start}.json"):
        head = [h.replace("¦", " ").strip() for h in rows[0]]
        if "Pld" in head and "Pts" in head and "Team" in head:
            out = []
            for r in rows[1:]:
                d = dict(zip(head, r))
                if not re.match(r"\d+$", d.get("Pos", "")):
                    continue
                out.append(d)
            if len(out) in (20, 22):
                return out
    raise SystemExit(f"no league table found for {start}")


def computed_points():
    pts = defaultdict(int)
    for r in csv.DictReader(open(ROOT / "data" / "team_matches.csv")):
        pts[(r["season"], r["team"])] += int(r["points"])
    return pts


def main():
    pts = computed_points()
    rows, diffs = [], []
    for start in range(1992, 2026):
        season = season_label(start)
        for d in read_official(start):
            team = club(clean_team(d["Team"]))
            official = int(re.sub(r"\D", "", d["Pts"]))
            deducted = pts[(season, team)] - official
            if deducted:
                diffs.append((season, team, pts[(season, team)], official))
            outcome = re.sub(r"\s+", " ", d.get("Qualification or relegation", "")).strip()
            rows.append([season, int(d["Pos"]), team, int(d["Pld"]), int(d["W"]), int(d["D"]), int(d["L"]),
                         int(d["GF"]), int(d["GA"]), int(d["GF"]) - int(d["GA"]), official, deducted, outcome])
    with open(ROOT / "data" / "final_tables.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["season", "position", "team", "played", "won", "drawn", "lost", "goals_for", "goals_against",
                    "goal_difference", "points", "points_deducted", "outcome"])
        w.writerows(rows)
    print(len(rows), "table rows; clubs whose official points differ from match results:")
    for x in diffs:
        print("  ", x)


if __name__ == "__main__":
    main()
