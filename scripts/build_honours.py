"""Build data/honours.json: for each Premier League season, the other big winners of that year.

  Champions League winner and runner-up, UEFA Cup / Europa League winner and runner-up,
  Ballon d'Or winner (the award year that matches the year the season ends), and the World Cup winner
  (World Cups are played in the summer after the season ends, so they sit on the season that ends that year).

Run:  python3 scripts/build_honours.py
"""
import json
import re
from pathlib import Path

from wikitables import tables_from_file

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"


def season_label(start):
    return f"{start}–{'2000' if start == 1999 else f'{(start + 1) % 100:02d}'}"


def clean(text):
    return re.sub(r"[*†‡§]|\[.*?\]|\(\d+\)", "", text).strip()   # also drops '(8)' win counts


def finals(filename):
    """Season -> {winner, winner_country, score, runner_up, runner_up_country} from a European finals table."""
    rows = tables_from_file(RAW / filename)[1][1]
    out = {}
    for r in rows[1:]:
        if re.match(r"\d{4}–\d{2,4}$", r[0].replace("-", "–")):
            season = r[0].replace("-", "–")
            out[season] = {"winner": clean(r[2]), "winner_country": r[1], "score": clean(r[3]),
                           "score_note": "after extra time or penalties" if re.search(r"[*†]", r[3]) else "",
                           "runner_up": clean(r[4]), "runner_up_country": r[5]}
    return out


def ballon_dor():
    rows = tables_from_file(RAW / "ballon_dor.json")[1][1]
    out = {}
    for r in rows[1:]:
        if re.match(r"\d{4}$", r[0]) and r[1] == "1st":
            if "announced" in r[2].lower():
                out[int(r[0])] = {"player": None, "club": None, "note": "To be announced on 26 October 2026"}
            else:
                out[int(r[0])] = {"player": clean(r[2]), "club": clean(r[3])}
    out.setdefault(2020, {"player": None, "club": None, "note": "Not awarded in 2020 (COVID-19)"})
    return out


def world_cup():
    rows = tables_from_file(RAW / "wc_finals.json")[1][1]
    out = {}
    for r in rows[1:]:
        if re.match(r"\d{4}$", r[0]):
            out[int(r[0])] = {"winner": clean(r[1]), "score": clean(r[2]), "runner_up": clean(r[3]), "host": r[5].split(",")[-1].strip()}
    return out


def main():
    ucl, uel, bd, wc = finals("ucl_finals.json"), finals("uel_finals.json"), ballon_dor(), world_cup()
    seasons = []
    for start in range(1992, 2026):
        s = season_label(start)
        end_year = start + 1
        seasons.append({
            "season": s,
            "champions_league": ucl[s],
            "europa_league": uel[s],
            "ballon_dor": bd.get(end_year),
            "ballon_dor_year": end_year,
            "world_cup": dict(wc[end_year], year=end_year) if end_year in wc else None,
        })
    (ROOT / "data" / "honours.json").write_text(json.dumps(seasons, ensure_ascii=False, indent=1))
    eng_ucl = [x["season"] for x in seasons if x["champions_league"]["winner_country"] == "England"]
    print(len(seasons), "seasons. English Champions League winners:", eng_ucl)
    print("World Cups:", [(x["world_cup"]["year"], x["world_cup"]["winner"]) for x in seasons if x["world_cup"]])
    print("Ballon d'Or:", [(x["ballon_dor_year"], x["ballon_dor"]["player"]) for x in seasons if x["ballon_dor"]["player"]][-4:], "... no winner:", [(x["ballon_dor_year"], x["ballon_dor"]["note"]) for x in seasons if not x["ballon_dor"]["player"]])


if __name__ == "__main__":
    main()
