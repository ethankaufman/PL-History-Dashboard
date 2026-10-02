"""Cross-check the two independent match sources and fill the gaps in matches.csv and team_matches.csv.

Source A: football-data.co.uk (results for every match; shots, fouls, corners, referee, cards and odds from 2000-01)
Source B: the Premier League's official match records (score, half-time score, referee, attendance, ground, and every card)

Step 1  compare A and B match by match: score, date, half-time score, referee surname, yellow and red cards.
Step 2  settle disagreements and fill gaps. The official record wins: it matches the Premier League's separate player statistics
        (for 2000-01 the official card events and the player statistics agree to within one card in 1,210, while football-data.co.uk's
        card counts are off for many clubs). Every disagreement is written to data/source_disagreements.csv, so nothing is hidden.
        Dates, half-time scores, referees and cards come from the official record for every match; attendance and ground are added.
        Shots, fouls, corners and betting odds exist only in football-data.co.uk and are kept as they are.
Writes  data/matches.csv and data/team_matches.csv (updated), data/source_disagreements.csv, data/raw/official_dates.csv, data/raw/reconcile_report.json

Run order:  build_matches.py  ->  build_official_matches.py  ->  reconcile_matches.py
"""
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"


def plain(n):
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower())


def ref_key(name):
    """'Anthony Taylor' and 'A Taylor' both become 'a|taylor'; 'Mike Dean' and 'M Dean' become 'm|dean'."""
    parts = [p for p in re.split(r"[\s.]+", name.strip()) if p]
    if not parts:
        return ""
    return plain(parts[0])[:1] + "|" + plain(parts[-1])


def read(f):
    return list(csv.DictReader(open(D / f)))


def main():
    matches, tm = read("matches.csv"), read("team_matches.csv")
    det = {r["match_id"]: r for r in read("match_details.csv")}
    cards = json.loads((D / "raw" / "official_card_counts.json").read_text())   # match_id -> {team: [yellow, red]} (red includes second yellows)
    ev_cards = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))              # match_id -> team -> [yellow, straight red, second yellow]
    for r in read("match_events.csv"):
        if r["event"] == "Yellow card":
            ev_cards[r["match_id"]][r["team"]][0] += 1
        elif r["event"] == "Red card":
            ev_cards[r["match_id"]][r["team"]][1] += 1
        elif r["event"] == "Second yellow card":
            ev_cards[r["match_id"]][r["team"]][2] += 1

    # football-data.co.uk's own kick-off dates, remembered from the first run (the second run starts from the official dates)
    saved = D / "raw" / "official_dates.csv"
    fd_dates = {}
    if saved.exists():
        for r in csv.DictReader(open(saved)):
            fd_dates[(r["season"], r["home"], r["away"])] = r.get("football_data_date") or r["date"]
    for m in matches:
        m["fd_date"] = fd_dates.get((m["season"], m["home"], m["away"]), m["date"])
    rep = Counter()
    diffs = defaultdict(list)
    use_conv = {}
    for m in matches:
        o = det.get(m["match_id"])
        if not o:
            rep["matches without an official record"] += 1
            continue
        rep["matches compared"] += 1
        same_score = (int(m["home_goals"]), int(m["away_goals"])) == (int(o["home_goals"]), int(o["away_goals"]))
        rep["score agrees"] += same_score
        if not same_score:
            diffs["score"].append((m["match_id"], m["home"], m["away"], m["home_goals"] + "-" + m["away_goals"], o["home_goals"] + "-" + o["away_goals"]))
        rep["date agrees"] += m["fd_date"] == o["date"]
        if m["fd_date"] != o["date"]:
            diffs["date"].append((m["match_id"], m["home"], m["away"], m["fd_date"], o["date"]))
        if m["ht_home_goals"] != "" and o["ht_home_goals"] != "":
            rep["half-time scores compared"] += 1
            ok = (m["ht_home_goals"], m["ht_away_goals"]) == (o["ht_home_goals"], o["ht_away_goals"])
            rep["half-time score agrees"] += ok
            if not ok:
                diffs["half-time"].append((m["match_id"], m["home"], m["away"], m["ht_home_goals"] + "-" + m["ht_away_goals"], o["ht_home_goals"] + "-" + o["ht_away_goals"]))
        if m["referee"] and o["referee"]:
            rep["referees compared"] += 1
            ok = ref_key(m["referee"]) == ref_key(o["referee"])
            rep["referee agrees"] += ok
            if not ok:
                diffs["referee"].append((m["match_id"], m["home"], m["away"], m["referee"], o["referee"]))
        if m["home_yellow"] != "":
            rep["card counts compared"] += 1
            c_ = cards[m["match_id"]]
            fd = (int(m["home_yellow"]), int(m["away_yellow"]), int(m["home_red"] or 0), int(m["away_red"] or 0))
            mine_ = (c_[m["home"]][0], c_[m["away"]][0], c_[m["home"]][1], c_[m["away"]][1])
            variants = {"official (second yellow counts as a red only)": mine_}
            for name, v in variants.items():
                rep["cards agree under: " + name] += v == fd
            if mine_ != fd:
                diffs["cards"].append((m["match_id"], m["home"], m["away"], fd, mine_))

    best = max((k for k in rep if k.startswith("cards agree under: ")), key=lambda k: rep[k], default=None)
    print({k: v for k, v in sorted(rep.items())})
    print("best card convention:", best)
    for k, v in diffs.items():
        print(f"{k}: {len(v)} differences, e.g. {v[:4]}")

    # ---------- step 2: the official record wins; log every disagreement ----------
    filled = Counter()
    log = []
    for m in matches:
        o = det.get(m["match_id"])
        if not o:
            continue
        def settle(field, ours, theirs, label):
            if ours not in ("", None) and str(ours) != str(theirs):
                log.append([m["match_id"], m["season"], m["home"], m["away"], label, ours, theirs])
                filled["disagreements settled with the official record: " + label] += 1
            elif ours in ("", None):
                filled["gaps filled: " + label] += 1
            return theirs
        m["date"] = settle("date", m["fd_date"], o["date"], "date")
        if o["ht_home_goals"] != "":
            ours = f'{m["ht_home_goals"]}-{m["ht_away_goals"]}' if m["ht_home_goals"] != "" else ""
            new_ht = f'{o["ht_home_goals"]}-{o["ht_away_goals"]}'
            settle("ht", ours, new_ht, "half-time score")
            m["ht_home_goals"], m["ht_away_goals"] = o["ht_home_goals"], o["ht_away_goals"]
        c_ = cards[m["match_id"]]
        new_cards = (c_[m["home"]][0], c_[m["away"]][0], c_[m["home"]][1], c_[m["away"]][1])
        if m["home_yellow"] != "":
            ours = (int(m["home_yellow"]), int(m["away_yellow"]), int(m["home_red"] or 0), int(m["away_red"] or 0))
            settle("cards", ours, new_cards, "cards (home yellow, away yellow, home red, away red)")
        else:
            filled["gaps filled: cards (home yellow, away yellow, home red, away red)"] += 1
        m["home_yellow"], m["away_yellow"], m["home_red"], m["away_red"] = new_cards
        if o["referee"]:
            if m["referee"] and ref_key(m["referee"]) != ref_key(o["referee"]):
                log.append([m["match_id"], m["season"], m["home"], m["away"], "referee", m["referee"], o["referee"]]); filled["disagreements settled with the official record: referee"] += 1
            elif m["referee"] and m["referee"] != o["referee"]:
                filled["referee spelling made consistent"] += 1
            elif not m["referee"]:
                filled["gaps filled: referee"] += 1
            m["referee"] = o["referee"]
        m["attendance"], m["ground"] = o["attendance"], o["ground"]
    by_id = {m["match_id"]: m for m in matches}
    for r in tm:
        m = by_id[r["match_id"]]; home = r["venue"] == "Home"
        r["date"] = m["date"]
        r["ht_goals_for"], r["ht_goals_against"] = (m["ht_home_goals"], m["ht_away_goals"]) if home else (m["ht_away_goals"], m["ht_home_goals"])
        r["yellow_cards"] = m["home_yellow"] if home else m["away_yellow"]
        r["red_cards"] = m["home_red"] if home else m["away_red"]
        r["referee"] = m["referee"]
    print("settled / filled:", dict(filled))
    with open(D / "source_disagreements.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["match_id", "season", "home", "away", "field", "football_data_co_uk", "official_record_used"]); w.writerows(log)
    with open(D / "raw" / "official_dates.csv", "w", newline="") as f:      # build_matches.py uses these dates the next time it runs
        w = csv.writer(f); w.writerow(["season", "home", "away", "date", "football_data_date"]); w.writerows([[m["season"], m["home"], m["away"], m["date"], m["fd_date"]] for m in matches if m["match_id"] in det])

    for m in matches:
        m.pop("fd_date", None)
    for name, data in (("matches.csv", matches), ("team_matches.csv", tm)):
        cols = list(data[0].keys())
        with open(D / name, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(data)
    (D / "raw" / "reconcile_report.json").write_text(json.dumps({"counts": dict(rep), "filled": dict(filled), "differences": {k: v[:50] for k, v in diffs.items()}, "difference_counts": {k: len(v) for k, v in diffs.items()}, "best_card_convention": best}, ensure_ascii=False, indent=1, default=list))


if __name__ == "__main__":
    main()
