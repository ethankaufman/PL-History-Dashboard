"""Download Premier League match results for every season.

  1993-94 to 2025-26  ->  football-data.co.uk (results, and from about 2000-01 shots, cards, fouls, referees, odds)
  1992-93             ->  footballcsv/england on GitHub (results only: date, round, teams, score)

Files are saved to data/raw/footballdata/ and data/raw/footballcsv/. Existing files are skipped.
Run:  python3 scripts/fetch_matches.py
"""
import time
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
HEADERS = {"User-Agent": "PLHistoryDashboard/0.1 (personal learning project)"}


def get(url, out):
    if out.exists():
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(5):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60).read()
            out.write_bytes(data)
            print("saved", out.name, len(data), "bytes")
            time.sleep(1)
            return
        except Exception as err:
            print("  problem", err, "- retrying")
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"could not download {url}")


def main():
    for start in range(1993, 2026):                       # 1993-94 ... 2025-26
        code = f"{start % 100:02d}{(start + 1) % 100:02d}"  # e.g. 9394, 2526
        get(f"https://www.football-data.co.uk/mmz4281/{code}/E0.csv", RAW / "footballdata" / f"E0_{code}.csv")
    get("https://raw.githubusercontent.com/footballcsv/england/master/1990s/1992-93/eng.1.csv",
        RAW / "footballcsv" / "eng.1_1992-93.csv")


if __name__ == "__main__":
    main()
