"""Write data/manifest.json: row counts of the main data files, counted from the files themselves.

The report shows these counts without having to download the 33 MB match-by-match table, and tests/check_numbers.js re-counts the
files to prove the manifest is right.  Run (after the data files are built):  python3 scripts/make_manifest.py
"""
import csv
import json
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "data"
out = {}
for name in ("player_matches", "appearances_lean", "player_seasons", "matches", "team_matches", "final_tables", "match_events", "match_details", "transfers"):
    with open(D / f"{name}.csv", newline="") as f:
        out[name] = {"rows": sum(1 for _ in csv.DictReader(f))}
pm = list(csv.DictReader(open(D / "player_matches.csv")))
out["player_matches"].update({"players": len({r["player_id"] for r in pm}), "seasons": len({r["season"] for r in pm}), "clubs": len({r["team"] for r in pm}),
                              "goals": sum(int(r["goals"]) for r in pm), "assists": sum(int(r["assists"]) for r in pm), "columns": len(pm[0])})
(D / "manifest.json").write_text(json.dumps(out, indent=1))
print(json.dumps(out["player_matches"]))
