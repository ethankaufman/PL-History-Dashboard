"""Settle the 'most assists' award records using the Premier League's own statistics.

Wikipedia's list of assist leaders differs from the Premier League's statistics in a few seasons (for example 2014-15: Wikipedia says
Cesc Fabregas had 19, the Premier League's statistics and its match records both say 18). The statistics service and the official match
records agree with each other (99.98%), so the 'top_assists' award records are recomputed from the player table; every difference from
Wikipedia is logged in data/source_disagreements_awards.csv and summarised in data/raw/awards_reconcile.json.

Run (after build_awards_seasons.py and build_player_seasons.py):  python3 scripts/reconcile_awards.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
data = json.loads((D / "awards.json").read_text())
awards = data["awards"]
season_start = lambda s: int(s[:4])

players = defaultdict(lambda: defaultdict(lambda: {"assists": 0, "name": "", "clubs": defaultdict(int)}))
for r in csv.DictReader(open(D / "player_seasons.csv")):
    p = players[r["season"]][r["player_id"]]
    p["assists"] += int(r["assists"]); p["name"] = r["player"]; p["clubs"][r["club"]] += int(r["assists"])

wiki = defaultdict(list)
for a in awards:
    if a["award"] == "top_assists":
        wiki[a["season"]].append(a)

new_records, log, agree = [], [], 0
for season in sorted(players, key=season_start):
    top = max(p["assists"] for p in players[season].values())
    leaders = sorted([p for p in players[season].values() if p["assists"] == top], key=lambda p: p["name"])
    mine = sorted((p["name"], top) for p in leaders)
    theirs = sorted({(w["winner"], w["assists"]) for w in wiki.get(season, [])})
    same = [n.split()[-1].lower() for n, _ in mine] == [n.split()[-1].lower() for n, _ in theirs] and {a for _, a in mine} == {a for _, a in theirs}
    agree += same
    if not same:
        log.append([season, "most assists", "; ".join(f"{n} {a}" for n, a in theirs), "; ".join(f"{n} {a}" for n, a in mine)])
    for p in leaders:
        main_club = max(p["clubs"].items(), key=lambda kv: kv[1])[0]
        rec = {"award": "top_assists", "season": season, "winner": p["name"], "club": main_club, "assists": top}
        if len(p["clubs"]) > 1:
            rec["clubs"] = list(p["clubs"])
        # keep the nationality from the Wikipedia record when we have one
        nat = next((w.get("nationality") for w in wiki.get(season, []) if w["winner"].split()[-1] == p["name"].split()[-1]), None)
        if nat:
            rec["nationality"] = nat
        new_records.append(rec)

others = [a for a in awards if a["award"] != "top_assists"]
order = list(data["award_types"])
data["awards"] = sorted(others + new_records, key=lambda a: (season_start(a["season"]), order.index(a["award"])))
(D / "awards.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
with open(D / "source_disagreements_awards.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["season", "award", "wikipedia", "premier_league_statistics_used"]); w.writerows(log)
(D / "raw" / "awards_reconcile.json").write_text(json.dumps({"seasons": len(players), "agree": agree, "differences": log}, ensure_ascii=False))
print(f"assists leaders: Wikipedia and the Premier League agree in {agree} of {len(players)} seasons; {len(log)} differences logged:")
for row in log:
    print("  ", row)
