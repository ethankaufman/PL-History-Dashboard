"""Fill the 'minutes' column of player_seasons.csv for every season, and check it against the Premier League's own minutes.

The Premier League's season statistics only record minutes from about 2006-07. For every season we can also compute minutes from the
official line-ups and substitution times (player_matches.csv). This script
  1. checks the computed minutes against the Premier League's own totals wherever both exist, and
  2. fills the blank seasons with the computed minutes.
Run (after build_official_matches.py --final):  python3 scripts/finish_player_seasons.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
mins = defaultdict(int)
for r in csv.DictReader(open(D / "player_matches.csv")):
    mins[(r["player_id"], r["season"], r["team"])] += int(r["minutes"])
rows = list(csv.DictReader(open(D / "player_seasons.csv")))
both = same = within5 = 0
for r in rows:
    got = mins.get((r["player_id"], r["season"], r["club"]), 0)
    if r["minutes"] != "":
        both += 1
        same += int(r["minutes"]) == got
        within5 += abs(int(r["minutes"]) - got) <= 5
filled = 0
for r in rows:
    if r["minutes"] == "":
        r["minutes"] = mins.get((r["player_id"], r["season"], r["club"]), 0)
        filled += 1
with open(D / "player_seasons.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
report = {"compared": both, "identical": same, "within_5_minutes": within5, "filled": filled}
(D / "raw" / "minutes_check.json").write_text(json.dumps(report))
print(report)
