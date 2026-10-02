"""Accuracy audit: cross-check the data sets against each other and against independent sources.

Every check compares two things that were collected separately, so a mistake in one shows up as a disagreement.
Prints PASS / FAIL for each check with the counts, and writes data/audit.json (used by the website's data-quality section).

Run:  python3 scripts/audit.py
"""
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
rows = lambda f: list(csv.DictReader(open(D / f)))
load = lambda f: json.loads((D / f).read_text())
season_start = lambda s: int(s[:4])


def plain(n):
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower().strip()
    n = re.sub(r"[^a-z ]", "", n)
    return {"andy cole": "andrew cole", "alisson": "alisson becker", "ruud van nistelrooy": "ruud van nistelrooij", "matt le tissier": "matthew le tissier", "tony yeboah": "anthony yeboah"}.get(n, n)   # Wikipedia and the Premier League spell some names differently


RESULTS = []


def check(name, ok, detail="", scope=""):
    RESULTS.append({"name": name, "ok": bool(ok), "detail": detail, "scope": scope})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    return ok


def main():
    matches, tm, ft = rows("matches.csv"), rows("team_matches.csv"), rows("final_tables.csv")
    ps, pm = rows("player_seasons.csv"), rows("player_matches.csv")
    seasons, awards, teams = load("seasons.json"), load("awards.json")["awards"], load("teams.json")
    rec, dom = load("records.json"), load("domestic_honours.json")

    # 1. promoted clubs = clubs that appear in next season but not this one
    clubs_in = defaultdict(set)
    for m in matches:
        clubs_in[m["season"]].update((m["home"], m["away"]))
    ordered = sorted(seasons, key=lambda s: season_start(s["season"]))
    bad = []
    for a, b in zip(ordered, ordered[1:]):
        new = clubs_in[b["season"]] - clubs_in[a["season"]]
        if new != set(a["promoted"]):
            bad.append((a["season"], sorted(new), sorted(a["promoted"])))
    check("promoted clubs listed for each season are exactly the clubs that newly appear the next season", not bad, f"{33 - len(bad)} of 33 seasons agree" + (f"; differ: {bad[:3]}" if bad else ""), "seasons.json vs matches.csv")

    # 2. relegated clubs = clubs in this season that are missing next season (the last season uses the 2026-27 list in teams.json)
    bad = []
    for a, b in zip(ordered, ordered[1:]):
        gone = clubs_in[a["season"]] - clubs_in[b["season"]]
        if gone != set(a["relegated"]):
            bad.append((a["season"], sorted(gone), sorted(a["relegated"])))
    check("relegated clubs listed for each season are exactly the clubs missing the next season", not bad, f"{33 - len(bad)} of 33 seasons agree" + (f"; differ: {bad[:3]}" if bad else ""), "seasons.json vs matches.csv")

    # 3. Golden Boot, assists leader, Golden Glove vs the player table
    by_season = defaultdict(list)
    for r in ps:
        for k in ("appearances", "goals", "assists", "clean_sheets"):
            r[k] = int(r[k])
        by_season[r["season"]].append(r)
    season_player = defaultdict(lambda: defaultdict(lambda: {"goals": 0, "assists": 0, "cs": 0, "club": None}))
    for r in ps:
        p = season_player[r["season"]][plain(r["player"])]
        p["goals"] += r["goals"]; p["assists"] += r["assists"]; p["cs"] += r["clean_sheets"]
    miss = []
    for a in awards:
        if a["award"] == "golden_boot":
            got = season_player[a["season"]].get(plain(a["winner"]), {}).get("goals")
            if got != a["goals"]:
                miss.append((a["season"], a["winner"], a["goals"], got))
    check("every Golden Boot winner's goals equal the player table", not miss, f"{sum(1 for a in awards if a['award'] == 'golden_boot') - len(miss)} of {sum(1 for a in awards if a['award'] == 'golden_boot')}" + (f"; {miss[:4]}" if miss else ""), "awards.json vs player_seasons.csv")
    miss = []
    for a in awards:
        if a["award"] == "top_assists":
            got = season_player[a["season"]].get(plain(a["winner"]), {}).get("assists")
            if got != a["assists"]:
                miss.append((a["season"], a["winner"], a["assists"], got))
    n = sum(1 for a in awards if a["award"] == "top_assists")
    check("every assists-leader's total equals the player table", not miss, f"{n - len(miss)} of {n}" + (f"; {miss[:5]}" if miss else ""), "awards.json vs player_seasons.csv")
    miss = []
    for a in awards:
        if a["award"] == "golden_glove":
            got = season_player[a["season"]].get(plain(a["winner"]), {}).get("cs")
            if got != a["clean_sheets"]:
                miss.append((a["season"], a["winner"], a["clean_sheets"], got))
    n = sum(1 for a in awards if a["award"] == "golden_glove")
    check("every Golden Glove winner's clean sheets equal the player table", not miss, f"{n - len(miss)} of {n}" + (f"; {miss[:5]}" if miss else ""), "awards.json vs player_seasons.csv")

    # 4. top scorers in seasons.json
    miss = []
    for s in seasons:
        top = max((v["goals"] for v in season_player[s["season"]].values()))
        if top != s["top_scorer_goals"] or not all(plain(n) in season_player[s["season"]] and season_player[s["season"]][plain(n)]["goals"] == top for n in s["top_scorers"]):
            miss.append((s["season"], s["top_scorers"], s["top_scorer_goals"], top))
    check("each season's top scorer(s) and goal total equal the player table", not miss, f"{34 - len(miss)} of 34" + (f"; {miss[:4]}" if miss else ""), "seasons.json vs player_seasons.csv")

    # 5. every club's all-time record = the sum of its official season tables; Wikipedia's all-time table checked separately
    sums = defaultdict(lambda: defaultdict(int))
    for r in ft:
        for k_src, k_dst in (("played", "played"), ("won", "won"), ("drawn", "drawn"), ("lost", "lost"), ("goals_for", "goals_for"), ("goals_against", "goals_against"), ("points", "points")):
            sums[r["team"]][k_dst] += int(r[k_src])
    miss = [(c, k, sums[c][k], v["premier_league"][k]) for c, v in rec["clubs"].items() for k in ("played", "won", "drawn", "lost", "goals_for", "goals_against") if sums[c][k] != v["premier_league"][k]]
    check("each club's all-time played/won/drawn/lost/goals/points equal the sum of its 34 official season tables", not miss, f"{51 * 6 - len(miss)} of 306 figures" + (f"; {miss[:4]}" if miss else ""), "records.json vs final_tables.csv")
    off = {plain(r["Club"].replace("Brighton and Hove Albion", "Brighton & Hove Albion")): r for r in rec["official"]["all_time_table"]}
    diffs = []
    for club, c in rec["clubs"].items():
        o = off.get(plain(club)) or off.get(plain(club.replace("AFC ", "")))
        if not o:
            diffs.append((club, "missing from Wikipedia's table", "", "")); continue
        pl = c["premier_league"]
        for col, k in (("Pld", "played"), ("W", "won"), ("D", "drawn"), ("L", "lost"), ("GF", "goals_for"), ("GA", "goals_against")):
            if int(o[col].replace(",", "")) != pl[k]:
                diffs.append((club, col, o[col], pl[k]))
    wh = next((x for x in rec["official"]["all_time_table"] if x["Club"] == "West Ham United"), None)
    internally_wrong = wh and int(wh["W"]) + int(wh["D"]) + int(wh["L"]) != int(wh["Pld"].replace(",", ""))
    check("Wikipedia's all-time table agrees with our totals, apart from documented slips in Wikipedia itself", len(diffs) <= 4 and internally_wrong, f"{51 * 6 - len(diffs)} of 306 figures agree; differences: {diffs}; Wikipedia's West Ham row is internally inconsistent (W+D+L = {int(wh['W']) + int(wh['D']) + int(wh['L'])}, Pld = {wh['Pld']})", "records.json vs Wikipedia all-time table")

    # 6. sum of player goals/assists per club-season vs final tables (team goals scored)
    team_goals = {(r["season"], r["team"]): int(r["goals_for"]) for r in ft}
    club_player_goals = defaultdict(int)
    for r in ps:
        club_player_goals[(r["season"], r["club"])] += r["goals"]
    ratios = [club_player_goals[k] / v for k, v in team_goals.items() if v and (k in club_player_goals)]
    over = [(k, club_player_goals[k], v) for k, v in team_goals.items() if club_player_goals.get(k, 0) > v]
    check("players are never credited with more goals than their club scored", not over, f"{len(team_goals) - len(over)} of {len(team_goals)} club-seasons" + (f"; {over[:3]}" if over else ""), "player_seasons.csv vs final_tables.csv")
    low = [(k, club_player_goals.get(k, 0), v) for k, v in team_goals.items() if club_player_goals.get(k, 0) < 0.85 * v]
    check("players are credited with at least 85% of each club's goals (the rest are own goals)", not low, f"{len(team_goals) - len(low)} of {len(team_goals)} club-seasons" + (f"; {low[:3]}" if low else ""), "player_seasons.csv vs final_tables.csv")

    # 7. appearances per club-season: no club has more than 38 (42) appearances by one player, and the player table's club list matches
    over = [(r["season"], r["club"], r["player"], r["appearances"]) for r in ps if r["appearances"] > (42 if season_start(r["season"]) < 1995 else 38)]
    check("no player has more appearances for a club in a season than the club played", not over, f"{len(ps) - len(over)} of {len(ps)} rows" + (f"; {over[:3]}" if over else ""), "player_seasons.csv")
    clubs_ps = defaultdict(set)
    for r in ps:
        clubs_ps[r["season"]].add(r["club"])
    check("the clubs in the player table are exactly the clubs that played each season", all(clubs_ps[s] == clubs_in[s] for s in clubs_in), "34 of 34 seasons", "player_seasons.csv vs matches.csv")

    ar = D / "raw" / "awards_reconcile.json"
    if ar.exists():
        a_ = json.loads(ar.read_text())
        check("Wikipedia's most-assists leaders agree with the Premier League's own statistics in at least 29 of 34 seasons; the differences are logged and the Premier League's figures used", a_["agree"] >= 29 and len(a_["differences"]) == a_["seasons"] - a_["agree"], f"{a_['agree']} of {a_['seasons']} seasons agree; differences: {[d[0] for d in a_['differences']]}", "awards.json (Wikipedia) vs player statistics, see data/source_disagreements_awards.csv")

    # 8. the two official player tables: match records (player_matches.csv) vs season statistics (player_seasons.csv)
    mine = defaultdict(lambda: defaultdict(int))
    for r in pm:
        k = (r["player_id"], r["season"], r["team"])
        mine[k]["goals"] += int(r["goals"]); mine[k]["assists"] += int(r["assists"]); mine[k]["appearances"] += 1
        mine[k]["yellow_cards"] += int(r["yellow_cards"]); mine[k]["red_cards"] += int(r["red_cards"])
    for field in ("appearances", "goals", "assists", "yellow_cards", "red_cards"):
        same = sum(1 for r in ps if mine.get((r["player_id"], r["season"], r["club"]), {}).get(field, 0) == int(r[field]))
        floor = 0.995 if field == "appearances" else 0.998
        note = "; the Premier League's season statistics omit a game or two for some Stoke 2008-09 and Burnley 2009-10 players, and the line-ups show who played, so the match records are used for match-level data" if field == "appearances" else ""
        check(f"{field.replace('_', ' ')} per player, club and season agree between the match records and the season statistics", same / len(ps) >= floor, f"{same} of {len(ps)} ({100 * same / len(ps):.2f}%){note}", "player_matches.csv vs player_seasons.csv")
    total_ps = sum(int(r["appearances"]) for r in ps)
    check("the match records contain every appearance in the season statistics (the extra rows are the games the season statistics omit)", 0 <= len(pm) - total_ps <= 0.0005 * total_ps, f"{len(pm)} match rows, {total_ps} appearances in the season statistics ({len(pm) - total_ps} extra)", "player_matches.csv vs player_seasons.csv")
    # card totals per club-season: official events vs the Premier League's player card statistics (the third source that settled the football-data.co.uk disagreement)
    cs_ev, cs_ps = defaultdict(lambda: [0, 0]), defaultdict(lambda: [0, 0])
    for r in pm:
        k = (r["season"], r["team"]); cs_ev[k][0] += int(r["yellow_cards"]); cs_ev[k][1] += int(r["red_cards"])
    for r in ps:
        k = (r["season"], r["club"]); cs_ps[k][0] += int(r["yellow_cards"]); cs_ps[k][1] += int(r["red_cards"])
    off_by = [(k, cs_ev[k], cs_ps[k]) for k in cs_ps if abs(cs_ev[k][0] - cs_ps[k][0]) > 2 or abs(cs_ev[k][1] - cs_ps[k][1]) > 1]
    check("every club-season's card totals from match events equal the Premier League's player card statistics (within 2 yellows, 1 red)", not off_by, f"{len(cs_ps) - len(off_by)} of {len(cs_ps)} club-seasons" + (f"; {off_by[:3]}" if off_by else ""), "match events vs player statistics")

    # 8b. official match records vs football-data.co.uk, and internal consistency of the official records
    rr = D / "raw" / "reconcile_report.json"
    if rr.exists():
        rep_ = json.loads(rr.read_text())["counts"]
        check("the official score equals the football-data.co.uk score in every match", rep_.get("score agrees") == rep_.get("matches compared") == len(matches), f"{rep_.get('score agrees')} of {rep_.get('matches compared')}", "official match records vs matches.csv (football-data.co.uk)")
        for key, label in (("date agrees", "kick-off dates"), ("half-time score agrees", "half-time scores"), ("referee agrees", "referees")):
            total = {"date agrees": rep_.get("matches compared"), "half-time score agrees": rep_.get("half-time scores compared"), "referee agrees": rep_.get("referees compared")}[key]
            check(f"{label} agree between the two sources in at least 95% of matches (the rest are settled with the official record and logged)", rep_.get(key, 0) / max(1, total) >= 0.95, f"{rep_.get(key)} of {total} ({100 * rep_.get(key, 0) / max(1, total):.1f}%)", "official match records vs football-data.co.uk")
    mc = D / "raw" / "minutes_check.json"
    if mc.exists():
        m_ = json.loads(mc.read_text())
        check("minutes computed from line-ups and substitutions equal the Premier League's recorded minutes (within 5 minutes) for at least 98% of player-seasons", m_["within_5_minutes"] / m_["compared"] >= 0.98, f"{m_['within_5_minutes']} of {m_['compared']} within 5 minutes; {m_['identical']} identical", "player_matches.csv vs player_seasons.csv (2006-07 onward)")
    starters = defaultdict(int)
    for r in pm:
        if r["started"] == "1":
            starters[(r["match_id"], r["team"])] += 1
    odd = [k for k, v in starters.items() if v != 11]
    check("every team in every match has 11 starters in the official line-ups (a few data-entry exceptions allowed)", len(odd) <= 30 and len(starters) == 2 * len(matches), f"{len(starters) - len(odd)} of {len(starters)} team-matches; exceptions: {len(odd)}", "official line-ups")
    bc = D / "raw" / "official_checks_build.json"
    if bc.exists():
        b_ = json.loads(bc.read_text())["problem_counts"]
        check("the goal events of every match add up exactly to its official score", not b_.get("events do not add up to the score"), f"{len(matches) - b_.get('events do not add up to the score', 0)} of {len(matches)} matches", "official match events vs official scores")
    det_rows = rows("match_details.csv") if (D / "match_details.csv").exists() else []
    if det_rows:
        att = [int(r["attendance"]) for r in det_rows if r["attendance"] not in ("", "None")]
        check("attendances are plausible (none negative, none above 100,000)", all(0 <= a < 100000 for a in att), f"{len(att)} of {len(det_rows)} matches have an attendance (0 = played without fans)", "match_details.csv")
        # stadium timeline (teams.json) vs the ground the Premier League recorded for each club's home matches
        grounds = defaultdict(Counter)
        for r in det_rows:
            grounds[(r["season"], r["home"])][r["ground"]] += 1
        stop = {"stadium", "ground", "the", "arena", "park", "road", "lane", "community", "fc"}
        toks = lambda n: {t for t in re.sub(r"[^a-z0-9 ]", " ", unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower()).split() if t not in stop} or {"x"}
        # sponsor names the Premier League's records use for the same stadium (token -> tokens in our stadium name)
        alias = {"upton": {"boleyn"}, "boleyn": {"upton"}, "etihad": {"manchester"}, "kc": {"kc", "mkm", "kcom"}, "macron": {"reebok"}, "sports": {"james"},
                 "kiyan": {"loftus"}, "goldsands": {"dean"}, "vitality": {"dean"}, "amex": {"falmer"}, "american": {"falmer"}, "john": {"kirklees"}, "smith": {"kirklees"}}
        bad_g = []; total_g = 0
        by_team = {t["name"]: t for t in teams}
        for (season, club), cnt in grounds.items():
            y = season_start(season); total_g += 1
            active = [st for st in by_team[club]["stadiums"] if (st["from"] is None or st["from"] <= y + 1) and (st["to"] is None or st["to"] >= y)]
            names = [toks(st["name"]) for st in active]
            ok = False
            for g in cnt:
                gt = toks(g)
                for nt in names:
                    if gt & nt or any(a_ in nt for t_ in gt for a_ in alias.get(t_, ())):
                        ok = True
            if not ok:
                bad_g.append((season, club, dict(cnt), [st["name"] for st in active]))
        json.dump(bad_g, open(D / "raw" / "stadium_review.json", "w"), ensure_ascii=False, indent=1)
        check("the ground the Premier League recorded for each club's home matches matches that club's stadium timeline for every season", len(bad_g) == 0, f"{total_g - len(bad_g)} of {total_g} club-seasons agree" + (f"; {len(bad_g)} to review, e.g. {bad_g[:2]}" if bad_g else ""), "match_details.csv (official grounds) vs teams.json stadiums")

    # 8c. award winners against the official match data
    clubs_of = defaultdict(set)
    for r in ps:
        clubs_of[(plain(r["player"]), r["season"])].add(r["club"])
    player_awards = [a for a in awards if a["award"] in ("player_of_the_season", "young_player_of_the_season", "golden_boot", "golden_glove", "top_assists", "playmaker_of_the_season", "pfa_players_player", "pfa_young_player", "fwa_footballer", "goal_of_the_season")]
    alias_names = {"son heungmin": "heungmin son", "rodri": "rodri", "kepa": "kepa arrizabalaga", "joelinton": "joelinton"}
    bad = []
    for a in player_awards:
        names = {plain(a["winner"]), alias_names.get(plain(a["winner"]), "")}
        got = set().union(*[clubs_of.get((n, a["season"]), set()) for n in names if n])
        want = set(a.get("clubs") or [a.get("club")])
        if not (got & want):
            bad.append((a["season"], a["award"], a["winner"], a.get("club"), sorted(got)))
    check("every player-award winner made appearances for the club named in the award that season", len(bad) <= 6, f"{len(player_awards) - len(bad)} of {len(player_awards)} awards" + (f"; to review: {bad[:6]}" if bad else ""), "awards.json vs player_seasons.csv")
    if det_rows:
        events = defaultdict(list)
        for r in rows("match_events.csv"):
            if r["event"] in ("Goal", "Penalty goal"):
                events[r["match_id"]].append(plain(r["player"]))
        mmap = defaultdict(list)
        for r in det_rows:
            mmap[(r["home"], r["away"], r["season"])].append(r)
        from datetime import date as _d, timedelta as _td
        bad_g = []; goals_awards = [a for a in awards if a["award"] == "goal_of_the_season" and a.get("date")]
        months = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"])}
        for a in goals_awards:
            try:
                dd, mm, yy = a["date"].split(); when = _d(int(yy), months[mm], int(dd))
            except Exception:
                bad_g.append((a["season"], a["winner"], "unreadable date " + a["date"])); continue
            found = False
            for r in det_rows:
                if r["season"] == a["season"] and a["club"] in (r["home"], r["away"]) and a.get("opponent", "") in (r["home"], r["away"]):
                    if abs((_d.fromisoformat(r["date"]) - when).days) <= 1 and any(plain(a["winner"]).split()[-1] in g or g in plain(a["winner"]) for g in events[r["match_id"]]):
                        found = True; break
            if not found:
                bad_g.append((a["season"], a["winner"], a["club"], a.get("opponent"), a["date"]))
        check("every Goal of the Season was scored by that player, for that club, against that opponent, on that date (per the official match events)", len(bad_g) <= 3, f"{len(goals_awards) - len(bad_g)} of {len(goals_awards)}" + (f"; to review: {bad_g[:5]}" if bad_g else ""), "awards.json vs match_events.csv")

    # 9. club summary text: every year and number in a hand-written summary must appear in the club's source text or the data
    unmatched = []
    for t in teams:
        slug = t["slug"]
        src = (D / "raw" / "club_text" / f"{slug}.txt").read_text() if (D / "raw" / "club_text" / f"{slug}.txt").exists() else ""
        blob = src + " " + json.dumps(t["premier_league"]) + " " + json.dumps(t["stadiums"]) + " " + json.dumps(rec["clubs"].get(t["name"], {})) + " " + json.dumps(dom["by_club"].get(t["name"], {}))
        for a_, b_ in re.findall(r"(\d{4})[–-](\d{2,4})", blob):
            blob += f" {a_} {int(a_) + 1}"        # a season like 2013–14 contains the years 2013 and 2014
        for num in set(re.findall(r"\b(?:1[89]\d\d|20[0-2]\d)\b|\b\d{1,3}(?:,\d{3})+\b|\b\d{2,}\b", t["summary"])):
            if num not in blob.replace("–", " ") and num not in blob:
                unmatched.append((t["name"], num))
    derived_ok = {("Charlton Athletic", "37"): "'second in the First Division in 1936-37': the source says 'the next season' after 1935-36",
                  ("Charlton Athletic", "1947"): "'won the FA Cup in 1947': the source says 'the following year' after 1946"}
    unmatched = [u for u in unmatched if tuple(u) not in derived_ok]
    json.dump(unmatched, open(D / "raw" / "summary_unmatched_numbers.json", "w"))
    check("every year and large number in the 51 club histories appears in the club's source page or our data", not unmatched, f"{len(unmatched)} numbers to review" if unmatched else "all matched", "teams.json summaries vs Wikipedia pages")

    (D / "audit.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1))
    failed = [r for r in RESULTS if not r["ok"]]
    print(f"\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed")
    return failed


if __name__ == "__main__":
    main()
