"""Combine everything we know about each club into one file: data/teams.json

Inputs
  data/raw/clubs.json            Wikipedia's 'List of Premier League clubs' (Premier League record per club)
  data/raw/club_pages.json       club name -> Wikipedia page title
  data/raw/clubs/<slug>.json     each club's Wikipedia page (we read the quick-facts box)
  data/raw/ground_coordinates.json   latitude/longitude of each club's ground
  data/curated/teams_*.json      the hand-written brief history + stadium timeline per club
  data/seasons.json              used to count Premier League titles

Run:  python3 scripts/build_teams.py
"""
import glob
import json
import re
import urllib.parse
from collections import Counter
from pathlib import Path

from build_awards_seasons import club_name
from extract_club_text import text_of
from wikitables import SEP, tables_from_file

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# Wikipedia's API doesn't mark Bloomfield Road's coordinates as primary, but the page itself lists them.
COORDINATE_FALLBACKS = {"blackpool": (53.80472, -3.04806)}


def slugify(label):
    return re.sub(r"[^a-z0-9]+", "_", label.lower().replace("&", "and")).strip("_")


def infobox_rows(page_html):
    """Return the quick-facts box as {label: value text}."""
    m = re.search(r'<table class="infobox[^"]*".*?</table>', page_html, re.S)
    rows = {}
    if not m:
        return rows
    for tr in re.findall(r"<tr.*?</tr>", m.group(0), re.S):
        th = re.search(r"<th[^>]*>(.*?)</th>", tr, re.S)
        td = re.search(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if th and td:
            label = text_of(th.group(1)).strip()
            rows[label] = text_of(td.group(1)).strip()
    return rows


def first_int(text):
    m = re.search(r"\d[\d,]*", text or "")
    return int(m.group().replace(",", "")) if m else None


def founded_year(text):
    """'21 November 1874; 151 years ago' -> 1874 (the first four-digit year, not the day of the month)."""
    m = re.search(r"\b(1[6-9]\d\d|20\d\d)\b", text or "")
    return int(m.group(1)) if m else None


def build():
    # Premier League record per club, from the club table
    table = tables_from_file(RAW / "clubs.json")[0][1]
    header = [h.replace(SEP, " ") for h in table[0]]
    pl_rows = {club_name(r[0]): dict(zip(header, r)) for r in table[1:]}

    pages = {club_name(label): title for label, title in json.loads((RAW / "club_pages.json").read_text())}
    coords = json.loads((RAW / "ground_coordinates.json").read_text())
    curated = {}
    for f in sorted(glob.glob(str(ROOT / "data" / "curated" / "teams_*.json"))):
        curated.update(json.loads(Path(f).read_text()))
    seasons = json.loads((ROOT / "data" / "seasons.json").read_text())
    titles = Counter(s["champion"] for s in seasons)

    teams = []
    for name, wiki_title in sorted(pages.items()):
        slug = slugify(name if name != "AFC Bournemouth" else "bournemouth")
        page = json.loads((RAW / "clubs" / f"{slug}.json").read_text())["parse"]["text"]
        box = infobox_rows(page)
        pl = pl_rows[name]
        seasons_text = pl["Seasons"].replace(SEP, ", ")
        defunct = "Dissolved" in box
        status = "defunct" if defunct else ("current" if seasons_text.rstrip().endswith("–") else "former")

        loc = pl["Location"]
        m = re.match(r"(.*?)\s*\((.*)\)", loc)
        city, area = (m.group(1), m.group(2)) if m else (loc, None)

        ground_label = "Ground" if "Ground" in box else "Stadium"
        ground_name = box.get(ground_label, "").split("\n")[0] if not defunct else None
        # A blank end year on an early ground means "unknown"; only the last entry can be the current ground.
        stadiums = [dict(s, current=False) for s in curated[slug]["stadiums"]]
        if not defunct:
            stadiums[-1]["current"] = True
        current_stadium = stadiums[-1]["name"] if not defunct else None
        c = coords.get(slug)
        lat, lng = (c["lat"], c["lng"]) if c else COORDINATE_FALLBACKS[slug]

        team = {
            "slug": slug,
            "name": name,
            "status": status,   # current = in the 2026–27 Premier League, former, or defunct
            "city": city,
            "area": area,
            "founded": founded_year(box.get("Founded")),
            "nicknames": [n.strip() for n in re.split(r"\n|,", box.get("Nicknames", box.get("Nickname", ""))) if n.strip()
                          and "supporters" not in n.lower()],
            "map": {"lat": round(lat, 5), "lng": round(lng, 5),
                    "label": ground_name or "Plough Lane (historic home)"},
            "current_ground": None if defunct else {
                "name": ground_name, "capacity": first_int(box.get("Capacity")),
                "timeline_name": current_stadium},
            "premier_league": {
                # Wikipedia's total counts the 2026–27 season in progress for current clubs; we count finished seasons only.
                "seasons_completed": int(pl["Total seasons"]) - (1 if status == "current" else 0),
                "in_2026_27": status == "current",
                "spells": seasons_text,
                "titles": titles.get(name, 0),
                "highest_finish": pl["Highest finish"],
                "last_season_result": pl["Most recent finish (2025–26)"].replace(SEP, " "),
                "top_scorer": pl["Top scorer"],
            },
            "summary": curated[slug]["summary"],
            "stadiums": stadiums,
            "source": {"title": wiki_title,
                       "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(wiki_title.replace(" ", "_")),
                       "license": "Facts and figures from Wikipedia (CC BY-SA 4.0); summary written for this project"},
        }
        if name == "Wimbledon":
            team["note"] = ("Wimbledon F.C. moved to Milton Keynes in 2003 and became Milton Keynes Dons. "
                            "Fans formed AFC Wimbledon, which now plays at a new ground near Plough Lane. "
                            "The map pin shows Plough Lane, the club's home from 1912 to 1991.")
        teams.append(team)
    return teams


def check(teams):
    assert len(teams) == 51, len(teams)
    current = [t for t in teams if t["status"] == "current"]
    assert len(current) == 20, [t["name"] for t in current]
    assert [t["name"] for t in teams if t["status"] == "defunct"] == ["Wimbledon"]
    for t in teams:
        assert 49.8 <= t["map"]["lat"] <= 55.9 and -6.0 <= t["map"]["lng"] <= 1.9, t["name"]
        assert t["summary"] and t["stadiums"], t["name"]
        if t["status"] != "defunct":
            assert [s["current"] for s in t["stadiums"]].count(True) == 1, t["name"]
            assert t["stadiums"][-1]["current"] and t["stadiums"][-1]["to"] is None, t["name"]
            assert not t["stadiums"][-1].get("temporary"), t["name"]
        for s in t["stadiums"]:
            if s["from"] and s["to"]:
                assert s["from"] <= s["to"], (t["name"], s)
    print("checks passed: 51 clubs, 20 current, coordinates inside the UK, stadium timelines consistent")


if __name__ == "__main__":
    data = build()
    check(data)
    (ROOT / "data" / "teams.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print("wrote data/teams.json")
