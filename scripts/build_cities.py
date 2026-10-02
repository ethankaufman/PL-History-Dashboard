"""Look up the coordinates of the large and relevant cities that are labelled on the intro map.

The list below is our choice (tier 1 = the biggest cities and capitals, shown from the start; tier 2 = other large cities, county towns and
cities that matter to English football, shown as you zoom in). Coordinates come from each city's Wikipedia page (CC BY-SA 4.0).

Writes  data/cities.json
Run:    python3 scripts/build_cities.py
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (personal learning project)"}

# (name shown, Wikipedia page, tier, country)
CITIES = [
    ("London", "London", 1, "England"), ("Birmingham", "Birmingham", 1, "England"), ("Manchester", "Manchester", 1, "England"),
    ("Liverpool", "Liverpool", 1, "England"), ("Leeds", "Leeds", 1, "England"), ("Sheffield", "Sheffield", 1, "England"),
    ("Newcastle", "Newcastle upon Tyne", 1, "England"), ("Bristol", "Bristol", 1, "England"),
    ("Glasgow", "Glasgow", 1, "Scotland"), ("Edinburgh", "Edinburgh", 1, "Scotland"),
    ("Cardiff", "Cardiff", 1, "Wales"), ("Belfast", "Belfast", 1, "Northern Ireland"), ("Dublin", "Dublin", 1, "Ireland"),
    ("Aberdeen", "Aberdeen", 2, "Scotland"), ("Dundee", "Dundee", 2, "Scotland"), ("Inverness", "Inverness", 2, "Scotland"),
    ("Derry", "Derry", 2, "Northern Ireland"), ("Cork", "Cork (city)", 2, "Ireland"), ("Galway", "Galway", 2, "Ireland"), ("Limerick", "Limerick", 2, "Ireland"),
    ("Nottingham", "Nottingham", 2, "England"), ("Leicester", "Leicester", 2, "England"), ("Southampton", "Southampton", 2, "England"),
    ("Plymouth", "Plymouth", 2, "England"), ("Exeter", "Exeter", 2, "England"), ("Oxford", "Oxford", 2, "England"),
    ("Cambridge", "Cambridge", 2, "England"), ("Norwich", "Norwich", 2, "England"), ("York", "York", 2, "England"),
    ("Carlisle", "Carlisle", 2, "England"), ("Lincoln", "Lincoln, England", 2, "England"), ("Bath", "Bath, Somerset", 2, "England"),
    ("Canterbury", "Canterbury", 2, "England"), ("Swansea", "Swansea", 2, "Wales"), ("Newport", "Newport, Wales", 2, "Wales"),
    ("Stoke-on-Trent", "Stoke-on-Trent", 2, "England"), ("Coventry", "Coventry", 2, "England"),
]


def main():
    query = urllib.parse.urlencode({
        "action": "query", "prop": "coordinates", "titles": "|".join(c[1] for c in CITIES), "redirects": "1",
        "colimit": "max", "coprimary": "primary", "format": "json", "formatversion": "2",
    })
    data = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://en.wikipedia.org/w/api.php?{query}", headers=HEADERS), timeout=60).read())["query"]
    redirect = {r["from"]: r["to"] for r in data.get("normalized", [])}
    redirect.update({r["from"]: r["to"] for r in data.get("redirects", [])})
    coords = {p["title"]: p["coordinates"][0] for p in data["pages"] if p.get("coordinates")}
    out = []
    for name, title, tier, country in CITIES:
        final = title
        for _ in range(3):
            final = redirect.get(final, final)
        c = coords.get(final)
        assert c, f"no coordinates for {name} ({title} -> {final})"
        out.append({"name": name, "lat": round(c["lat"], 4), "lng": round(c["lon"], 4), "tier": tier, "country": country, "page": final})
    (ROOT / "data" / "cities.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    for c in out:
        print(f'{c["name"]:15} {c["lat"]:8} {c["lng"]:8} {c["page"]}')


if __name__ == "__main__":
    main()
