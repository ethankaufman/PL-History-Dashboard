# Premier League History Dashboard

A data dashboard covering every Premier League season since it began in 1992–93.
Planned pages: **Report** and **Dashboard**, plus an animated intro (a spinning soccer ball
that explodes into a rotating map of the UK showing where each club plays).

**Status: Step 1 (data) is done. No website code has been written yet.**

## The data (in `data/`)

| File | What it holds |
|---|---|
| `seasons.json` | One entry per season (1992–93 to 2025–26): champion, European qualifiers, relegated and promoted clubs, top scorer. |
| `awards.json` | 359 award records, one per winner per season. `award_types` explains each award; `awards` is the list. |
| `teams.json` | All 51 clubs that have played in the Premier League: brief history, every stadium in order up to the current one, current ground, map coordinates, Premier League record. |

### Awards included
- Premier League: Player of the Season (from 1994–95), Young Player of the Season (from 2019–20),
  Golden Boot, Golden Glove (from 2004–05), most assists every season, Playmaker of the Season (from 2017–18),
  Goal of the Season, Manager of the Season (from 1993–94).
- Other long-running awards, every season since 1992–93: PFA Players' Player of the Year,
  PFA Young Player of the Year, FWA Footballer of the Year, LMA Manager of the Year.

The Premier League's own awards only started in the mid-1990s or later, which is why some seasons are empty for them.
That is how the awards were created, not missing data.

### How a club record looks (`teams.json`)
- `status`: `current` (in the 2026–27 Premier League — 20 clubs), `former`, or `defunct` (Wimbledon only).
- `map`: latitude and longitude of the current ground (for Wimbledon, the old Plough Lane ground).
- `stadiums`: in date order. A blank `from`/`to` means the year isn't known. `current: true` marks today's ground.
  `temporary: true` marks a short stay, such as a ground-share while a stadium was rebuilt.
- `premier_league.seasons_completed` counts finished seasons only (the 2026–27 season is still in progress).

## Where the data came from
Wikipedia, downloaded through its public API and saved untouched in `data/raw/`.
Facts and figures are from Wikipedia (CC BY-SA 4.0). The club histories were written for this project from
the club pages, in our own words. Keep this credit on the website, e.g. in the footer.

Everything was checked as it was built: all club names match one official list of 51 clubs; the number of
club-seasons adds up exactly (3 seasons of 22 teams + 31 of 20 teams = 686); every ground is inside the UK;
stadium timelines are in date order.

## Rebuilding the data
You need Python 3 (no extra installs). From this folder:

```
python3 scripts/build_awards_seasons.py   # awards.json + seasons.json
python3 scripts/build_teams.py            # teams.json
```

To re-download from Wikipedia first (takes a few minutes; it waits between requests on purpose):
`scripts/fetch_wikipedia.py` and `scripts/fetch_coordinates.py`.
The hand-written club histories and stadium lists live in `data/curated/`.

## Known gaps / ideas
- No final league tables yet (so no runners-up, points, or relegation battles).
- No team-level awards beyond champions (for example Fair Play), and no monthly awards or PFA Team of the Year.
- Some early grounds have no known dates; a few clubs' earliest grounds aren't named on Wikipedia (Manchester City, Arsenal's very first pitch).
- Wikipedia changes over time, so re-run the download occasionally.
