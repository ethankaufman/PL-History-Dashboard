"""Build data/domestic_honours.json: domestic trophies by season and by club.

  by_season: for each Premier League season (1992-93 to 2025-26): the FA Cup winner and runner-up, the League Cup winner,
             and the Community Shield winner (the match played in August at the start of that season).
  by_club:   for each of the 51 clubs, every year it won the league (top flight, since 1888), FA Cup, League Cup and
             Community Shield, with counts.

Every club's totals are cross-checked against the totals printed on Wikipedia's summary tables.
Run:  python3 scripts/build_domestic_honours.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

from build_matches import OFFICIAL
from wikitables import tables_from_file

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
ALIASES = {"Wolves": "Wolverhampton Wanderers", "The Wednesday": "Sheffield Wednesday", "Bournemouth": "AFC Bournemouth", "Brighton and Hove Albion": "Brighton & Hove Albion"}


def norm(name):
    name = re.sub(r"\(\s*\d+\s*\)|[#*†‡§]|\[.*?\]|\(R\)", "", name).strip()
    return ALIASES.get(name, name)


def season_label(start):
    return f"{start}–{'2000' if start == 1999 else f'{(start + 1) % 100:02d}'}"


def start_year(season):
    return int(season[:4])


def fa_cup():
    out = {}
    for r in tables_from_file(RAW / "facup_finals.json")[1][1][1:]:
        if re.match(r"\d{4}–", r[0]):
            season = r[0].replace("-", "–")
            out[season] = {"winner": norm(r[1]), "runner_up": norm(r[3]),
                           "score": re.sub(r"[*†\s]*\(R\)|[*†]", "", r[2]).strip()}   # the last row for a season is the replay
    return out


def league_cup():
    out = {}
    for r in tables_from_file(RAW / "efl_cup.json")[0][1][1:]:
        if re.match(r"\d{4}$", r[0]):
            out[season_label(int(r[0]) - 1)] = {"winner": norm(r[1])}
    return out


def community_shield():
    """year -> [winners]; the table lists years per club, with * for a shared shield."""
    out = defaultdict(list)
    shared = defaultdict(set)
    for r in tables_from_file(RAW / "community_shield.json")[1][1][1:]:
        team = norm(r[0])
        for y in re.findall(r"(\d{4})(\*?)", r[2]):
            out[int(y[0])].append(team)
            if y[1]:
                shared[int(y[0])].add(team)
    return out, shared


def league_titles():
    out = defaultdict(list)
    for r in tables_from_file(RAW / "eng_champions.json")[1][1][1:]:
        if re.match(r"\d+$", r[2]):
            for s in re.findall(r"\d{4}–\d{2,4}", r[4]):
                out[norm(r[1])].append(s)
    return out


def main():
    fa, lc = fa_cup(), league_cup()
    cs, cs_shared = community_shield()
    titles = league_titles()

    by_season = {}
    for y in range(1992, 2026):
        s = season_label(y)
        by_season[s] = {
            "fa_cup": fa[s], "league_cup": lc[s],
            "community_shield": {"year": y, "winners": cs[y], "shared": y in cs_shared} if y in cs else None,
        }

    by_club = {}
    for club in sorted(OFFICIAL):
        fa_years = sorted([s for s, v in fa.items() if v["winner"] == club], key=start_year)
        lc_years = sorted([s for s, v in lc.items() if v["winner"] == club], key=start_year)
        cs_years = sorted(y for y, w in cs.items() if club in w)
        entry = {"league_titles": sorted(titles.get(club, []), key=start_year), "fa_cup": fa_years, "league_cup": lc_years,
                 "community_shield": cs_years, "community_shield_shared": sorted(y for y in cs_years if club in cs_shared.get(y, ()))}
        entry["counts"] = {"league": len(entry["league_titles"]), "fa_cup": len(fa_years), "league_cup": len(lc_years), "community_shield": len(cs_years)}
        entry["counts"]["total"] = sum(entry["counts"].values())
        by_club[club] = entry

    # cross-check against the totals printed on Wikipedia
    problems = []
    for r in tables_from_file(RAW / "facup_finals.json")[2][1][1:]:
        c = norm(r[0])
        if c in by_club and by_club[c]["counts"]["fa_cup"] != int(r[1]):
            problems.append(("FA Cup", c, by_club[c]["counts"]["fa_cup"], r[1]))
    for r in tables_from_file(RAW / "efl_cup.json")[1][1][1:]:
        c = norm(r[0])
        if c in by_club and by_club[c]["counts"]["league_cup"] != int(r[1]):
            problems.append(("League Cup", c, by_club[c]["counts"]["league_cup"], r[1]))
    for r in tables_from_file(RAW / "community_shield.json")[1][1][1:]:
        c = norm(r[0]); n = int(re.match(r"\d+", r[1]).group())
        if c in by_club and by_club[c]["counts"]["community_shield"] != n:
            problems.append(("Community Shield", c, by_club[c]["counts"]["community_shield"], r[1]))
    for r in tables_from_file(RAW / "eng_champions.json")[1][1][1:]:
        c = norm(r[1])
        if c in by_club and re.match(r"\d+$", r[2]) and by_club[c]["counts"]["league"] != int(r[2]):
            problems.append(("League titles", c, by_club[c]["counts"]["league"], r[2]))
    print("cross-check problems:", problems or "none")
    seasons = json.loads((ROOT / "data" / "seasons.json").read_text())
    assert all(by_club[s["champion"]]["counts"]["league"] >= 1 for s in seasons)
    (ROOT / "data" / "domestic_honours.json").write_text(json.dumps({"by_season": by_season, "by_club": by_club}, ensure_ascii=False, indent=1))
    top = sorted(by_club.items(), key=lambda kv: -kv[1]["counts"]["total"])[:6]
    print([(c, v["counts"]) for c, v in top])
    print("2025–26:", by_season["2025–26"])
    print("1999–2000:", by_season["1999–2000"])


if __name__ == "__main__":
    main()
