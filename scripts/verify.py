"""Independent check of the website's headline numbers.

Recomputes them straight from the CSV/JSON files with plain Python (not the website's JavaScript) and compares
with what `node tests/check_numbers.js --json` reports. Run:  python3 scripts/verify.py
"""
import csv
import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rows = lambda f: list(csv.DictReader(open(ROOT / "data" / f)))
matches, pm = rows("matches.csv"), rows("player_matches.csv")
seasons = json.load(open(ROOT / "data" / "seasons.json"))

first, last = sorted({m["season"] for m in matches})[0], sorted({m["season"] for m in matches}, key=lambda s: int(s[:4]))[-1]
home_pct = lambda s: 100 * sum(1 for m in matches if m["season"] == s and m["result"] == "H") / sum(1 for m in matches if m["season"] == s)
gpg = {}
for s in {m["season"] for m in matches}:
    ms = [m for m in matches if m["season"] == s]
    gpg[s] = sum(int(m["home_goals"]) + int(m["away_goals"]) for m in ms) / len(ms)
goals = Counter(); name = {}
for r in pm:
    goals[r["player_id"]] += int(r["goals"]); name[r["player_id"]] = r["player"]
top_id, top_goals = goals.most_common(1)[0]
career, cname = Counter(), {}
psrows = rows("player_seasons.csv")
for r in psrows:
    career[r["player_id"]] += int(r["goals"]); cname[r["player_id"]] = r["player"]
at_id, at_goals = career.most_common(1)[0]
titles = Counter(s["champion"] for s in seasons)
promoted = down = 0
ordered = sorted(seasons, key=lambda s: int(s["season"][:4]))
for a, b in zip(ordered, ordered[1:]):
    for c in a["promoted"]:
        promoted += 1; down += c in b["relegated"]
expected = {
    "matches": len(matches), "goals": sum(int(m["home_goals"]) + int(m["away_goals"]) for m in matches), "playerRows": len(pm),
    "firstHomeWinPct": home_pct("1992–93"), "lastHomeWinPct": home_pct("2025–26"), "highestGoalsPerGameSeason": max(gpg, key=gpg.get),
    "manUtdTitles": titles.most_common(1)[0][1], "titleWinners": len(titles), "topScorer": name[top_id], "topScorerGoals": top_goals,
    "promotedGoneDown": down, "promotions": promoted,
    "allTimeTopScorer": cname[at_id], "allTimeGoals": at_goals, "playerSeasonRows": len(psrows),
}
got = json.loads(subprocess.run(["node", str(ROOT / "tests" / "check_numbers.js"), "--json"], capture_output=True, text=True, check=True).stdout)
bad = 0
for k, v in expected.items():
    ok = abs(got[k] - v) < 1e-9 if isinstance(v, float) else got[k] == v
    bad += not ok
    print(("PASS" if ok else "FAIL"), k, "python:", v, "| website code:", got[k])
raise SystemExit(1 if bad else print("\nPython and the website's JavaScript agree on every headline number."))
