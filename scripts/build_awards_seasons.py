"""Turn the raw Wikipedia tables in data/raw into clean data files:

  data/awards.json   - one record per award winner per season
  data/seasons.json  - one record per season (champions, relegated, promoted, top scorer...)

Run:  python3 scripts/build_awards_seasons.py
"""
import json
import re
from pathlib import Path

from wikitables import SEP, tables_from_file

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

FIRST_SEASON = 1992  # the Premier League started in the 1992–93 season


# ---------- small cleaning helpers ----------

def season_label(text):
    """'2025-26' / '2025–26' -> '2025–26' (always an en dash)."""
    return re.sub(r"[-–—]", "–", text.strip())


def start_year(season):
    return int(season[:4])


def in_scope(season):
    return start_year(season) >= FIRST_SEASON


def name(text):
    """Remove footnote symbols and '(3)' win counts from a name."""
    text = re.sub(r"\(\s*\d+\s*\)", "", text)       # '(1)' = how many times they've won so far
    text = re.sub(r"[†‡§£*^~#]", "", text)
    text = re.sub(r"\s*&$", "", text.strip())        # a lone trailing '&' is a footnote mark (but keep 'Brighton & Hove')
    return re.sub(r"\s+", " ", text).strip()


def names(text):
    """A cell holding several names (separated by line breaks) -> list of clean names."""
    return [n for n in (name(p) for p in text.split(SEP)) if n and n != "—"]


def season_from_end_year(year):
    """1993 -> '1992–93', 2000 -> '1999–2000' (Wikipedia's spelling)."""
    return f"{year - 1}–{'2000' if year == 2000 else str(year)[2:]}"


def club_names(text):
    return [club_name(n) for n in names(text)]


def to_int(text):
    m = re.search(r"\d+", text or "")
    return int(m.group()) if m else None


def table(filename, index):
    return tables_from_file(RAW / filename)[index][1]


def rows_as_dicts(rows):
    header = rows[0]
    return [dict(zip(header, r)) for r in rows[1:]]


# ---------- awards ----------

AWARD_INFO = {
    "player_of_the_season": {
        "label": "Premier League Player of the Season", "category": "player",
        "official": "Premier League", "first_season": "1994–95"},
    "young_player_of_the_season": {
        "label": "Premier League Young Player of the Season", "category": "player",
        "official": "Premier League", "first_season": "2019–20"},
    "golden_boot": {
        "label": "Premier League Golden Boot (top scorer)", "category": "player",
        "official": "Premier League", "first_season": "1992–93"},
    "golden_glove": {
        "label": "Premier League Golden Glove (most clean sheets)", "category": "player",
        "official": "Premier League", "first_season": "2004–05"},
    "top_assists": {
        "label": "Most assists in the season", "category": "player",
        "official": "Premier League", "first_season": "1992–93"},
    "playmaker_of_the_season": {
        "label": "Premier League Playmaker of the Season", "category": "player",
        "official": "Premier League", "first_season": "2017–18"},
    "goal_of_the_season": {
        "label": "Premier League Goal of the Season", "category": "player",
        "official": "Premier League", "first_season": "1992–93"},
    "pfa_players_player": {
        "label": "PFA Players' Player of the Year", "category": "player",
        "official": "Professional Footballers' Association", "first_season": "1973–74"},
    "pfa_young_player": {
        "label": "PFA Young Player of the Year", "category": "player",
        "official": "Professional Footballers' Association", "first_season": "1973–74"},
    "fwa_footballer": {
        "label": "FWA Footballer of the Year", "category": "player",
        "official": "Football Writers' Association", "first_season": "1947–48"},
    "manager_of_the_season": {
        "label": "Premier League Manager of the Season", "category": "manager",
        "official": "Premier League", "first_season": "1993–94"},
    "lma_manager_of_the_year": {
        "label": "LMA Manager of the Year", "category": "manager",
        "official": "League Managers Association", "first_season": "1992–93"},
}


CLUB_ALIASES = {"Bournemouth": "AFC Bournemouth"}  # one official spelling per club


def club_name(text):
    return CLUB_ALIASES.get(text, text)


def rec(award, season, **fields):
    record = {"award": award, "season": season, **{k: v for k, v in fields.items() if v not in (None, "")}}
    for key in ("club", "opponent"):
        if key in record:
            record[key] = club_name(record[key])
    if SEP in record.get("club", ""):               # winner changed clubs mid-season, e.g. Charlton -> Chelsea
        record["clubs"] = [club_name(c) for c in record["club"].split(SEP)]
        record["club"] = record["clubs"][0]         # the club they were at when they won it
    return record


def build_awards():
    out = []

    # Premier League Player of the Season
    for r in rows_as_dicts(table("player_of_season.json", 1)):
        out.append(rec("player_of_the_season", season_label(r["Season"]), winner=name(r["Player"]),
                       club=name(r["Club"]), nationality=r["Nationality"], position=r["Position"]))

    # Premier League Young Player of the Season
    for r in rows_as_dicts(table("young_player.json", 1)):
        out.append(rec("young_player_of_the_season", season_label(r["Season"]), winner=name(r["Player"]),
                       club=name(r["Club"]), nationality=r["Nationality"]))

    # Golden Boot (ties give several rows for one season)
    for r in rows_as_dicts(table("golden_boot.json", 1)):
        out.append(rec("golden_boot", season_label(r["Season"]), winner=name(r["Player"]),
                       club=name(r["Club"]), nationality=r["Nationality"],
                       goals=to_int(r["Goals"]), games=to_int(r["Games"])))

    # Golden Glove
    for r in rows_as_dicts(table("golden_glove.json", 1)):
        out.append(rec("golden_glove", season_label(r["Season"]), winner=name(r["Player"]),
                       club=name(r["Club"]), nationality=r["Nationality"],
                       clean_sheets=to_int(r["Clean sheets"])))

    # Assists leader every season, and the official Playmaker award (2017–18 on)
    for r in rows_as_dicts(table("playmaker.json", 1)):
        out.append(rec("top_assists", season_label(r["Season"]), winner=name(r["Player"]),
                       club=name(r["Club"]), nationality=r["Nationality"], assists=to_int(r["Assists"])))
    for r in rows_as_dicts(table("playmaker.json", 2)):          # the Playmaker award IS the assists leader
        out.append(rec("top_assists", season_label(r["Season"]), winner=name(r["Player"]),
                       club=name(r["Club"]), nationality=r["Nationality"], assists=to_int(r["Assists"])))
        out.append(rec("playmaker_of_the_season", season_label(r["Season"]), winner=name(r["Player"]),
                       club=name(r["Club"]), nationality=r["Nationality"], assists=to_int(r["Assists"])))

    # Goal of the Season: two tables (2016–17 on, and 1992–93 to 2015–16)
    for idx in (1, 2):
        for r in rows_as_dicts(table("goal_of_season.json", idx)):
            out.append(rec("goal_of_the_season", season_label(r["Season"]), winner=name(r["Player"]),
                           club=name(r["Team"]), nationality=r["Nationality"],
                           opponent=name(r["Opponent"]), score=r["Score"], date=r["Date"]))

    # PFA and FWA awards: the 'Year' column is the season label already
    for fname, key in (("pfa_players.json", "pfa_players_player"), ("pfa_young.json", "pfa_young_player"),
                       ("fwa.json", "fwa_footballer")):
        for r in rows_as_dicts(table(fname, 0)):
            season = season_label(r["Year"])
            if not in_scope(season):
                continue
            out.append(rec(key, season, winner=name(r["Player"]), club=name(r["Club"])))

    # Managers
    for r in rows_as_dicts(table("manager.json", 1)):
        out.append(rec("manager_of_the_season", season_label(r["Season"]), winner=name(r["Manager"]),
                       club=name(r["Club"]), nationality=r["Nationality"]))
    for r in rows_as_dicts(table("lma.json", 0)):
        year = to_int(r["Year"])                       # LMA lists the year the season ended, e.g. 1993
        season = season_from_end_year(year)
        out.append(rec("lma_manager_of_the_year", season, winner=name(r["Manager"]),
                       club=name(r["Club"]), nationality=r["Nationality"]))

    out = [a for a in out if in_scope(a["season"])]
    out.sort(key=lambda a: (start_year(a["season"]), list(AWARD_INFO).index(a["award"])))
    return out


# ---------- seasons ----------

def build_seasons():
    rows = table("seasons_list.json", 1)
    seasons = []
    for r in rows[2:]:                                  # first two rows are headers
        season = season_label(r[0])
        if not in_scope(season) or not re.match(r"\d{4}–", season):
            continue
        champion_text = r[1]
        titles = to_int(re.search(r"\((\d+)\)", champion_text).group(1)) if "(" in champion_text else None
        seasons.append({
            "season": season,
            "champion": club_name(name(champion_text)),
            "champion_title_number": titles,
            "champions_league": club_names(r[2]),
            "uefa_cup_europa_league": club_names(r[3]),
            "conference_league": club_names(r[4]),
            "relegated": club_names(r[5]),
            "promoted": club_names(r[6]),
            "top_scorers": names(r[7]),
            "top_scorer_goals": to_int(r[8]),
        })
    seasons.sort(key=lambda s: start_year(s["season"]))
    return seasons


def check_club_names(awards, seasons):
    """Every club mentioned must be one of the 51 clubs in Wikipedia's list of Premier League clubs."""
    official = {club_name(r[0]) for r in table("clubs.json", 0)[1:]}
    used = {a[k] for a in awards for k in ("club", "opponent") if k in a}
    for s in seasons:
        used.add(s["champion"])
        for k in ("champions_league", "uefa_cup_europa_league", "conference_league", "relegated", "promoted"):
            used.update(s[k])
    unknown = used - official
    # Opponents in 'goal of the season' are all PL clubs too, so nothing should be unknown.
    assert not unknown, f"club names not in the official list: {sorted(unknown)}"
    print(f"club names OK: {len(used)} used, {len(official)} in the official list")


if __name__ == "__main__":
    awards = build_awards()
    seasons = build_seasons()
    check_club_names(awards, seasons)
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "awards.json").write_text(json.dumps(
        {"award_types": AWARD_INFO, "awards": awards}, ensure_ascii=False, indent=1))
    (ROOT / "data" / "seasons.json").write_text(json.dumps(seasons, ensure_ascii=False, indent=1))
    print(f"{len(awards)} award records, {len(seasons)} seasons")
