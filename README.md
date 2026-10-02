# Premier League History: Report and Dashboard

A two-page website about every Premier League season since it began in 1992–93.

* **Report** (`index.html`) — 18 findings, each with a chart, a table of every season's winners, and a closing section on the data. It opens with an interactive spinning football (the pink-and-purple 2026–27 Premier League ball, the Puma Stellar Nitro Ultimate, recreated in 3D) that explodes into a rotating map of the UK once the data has loaded. On the map you can hover or click any club, zoom to the cursor, jump to London or Manchester and Liverpool, and open each club's history, trophies, records and every ground.
* **Dashboard** (`dashboard.html`) — loads the data in the browser and recalculates everything as you filter: four charts with a measure switch and a breakdown switch, summary numbers, a sortable table, a reset button, and extra tools (matchweek table race, club comparison, season and award explorer, records and trophies, player profiles, signings and departures).

Live site: https://ethankaufman.github.io/PL-History-Dashboard/

## The data set

The main data set is `data/player_matches.csv`: **one row is one player in one Premier League match he played in** (at least one minute). It has **108,681 rows and 26 columns** across 10 seasons (2016–17 to 2025–26), 1,909 players and 34 clubs. Time column: season and matchweek. Group column: player and club. Categorical columns include season, club, opponent, position and venue; numeric columns include minutes, goals, assists, clean sheets, saves, cards and expected goals.

Supporting tables cover every season back to 1992–93: **`data/player_seasons.csv`** (every player, club and season, with appearances, goals, assists, clean sheets, cards and nationality), 13,166 matches, 686 official final-table rows, 34 seasons, 359 awards, honours, trophies, records, and 51 club histories with every stadium.

## Where the data comes from

| Data | Source |
|---|---|
| Season totals for every player since 1992–93 (appearances, goals, assists, clean sheets, cards, nationality, minutes from about 2006) | The Premier League's public statistics service (the back end of premierleague.com), collected politely at a low request rate and checked against the official career records. It is not an official documented API, so it could change. |
| Player appearances (2016–17 to 2025–26) and today's player list | The open [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) archive of the Premier League's public data, and the Premier League's public API. Only real football facts are kept; fantasy-game columns (points, prices, bonus) are dropped. |
| Match results, shots, cards, referees, odds (1993–94 on) | [football-data.co.uk](https://www.football-data.co.uk/englandm.php) |
| 1992–93 match results | [footballcsv/england](https://github.com/footballcsv/england) |
| Final tables, seasons, awards, European and World Cup winners, Ballon d'Or, FA Cup / League Cup / Community Shield / league champions, all-time player records, club histories, stadiums, club coordinates | Wikipedia via its public API (CC BY-SA 4.0). Club histories were written for this project from the club pages. |
| Player photos | Linked from premierleague.com; initials are shown if a photo does not load. |

## Files

**Pages**
* `index.html` — the report page and the intro overlay.
* `dashboard.html` — the dashboard page.

**Site code (`assets/`)**
* `css/style.css` — one set of colours, fonts and layout used by both pages.
* `js/app.js` — navigation bar, data loading, number formatting, club colours, chart look.
* `js/calc.js` — every calculation (goals per game, home win %, title margins, upsets, squad sizes...). Used by the report, the dashboard and the test script, so numbers agree everywhere.
* `js/report.js` — builds the report: headline numbers, 14 findings, winners table, data section. All text and numbers are computed from the data.
* `js/dashboard.js` — the dashboard: filters, charts, table and the extra tabs.
* `js/intro.js` — the spinning ball, the explosion and the rotating UK club map (Three.js).
* `vendor/` — Chart.js, PapaParse (CSV reader) and Three.js, saved locally.

**Data (`data/`)**
* `player_matches.csv` — the main data set (see above).
* `player_seasons.csv` — one row per player per club per season, 1992–93 to 2025–26 (about 17,000 rows). Minutes are only recorded from about 2006–07.
* `matches.csv` — one row per match, 1992–93 to 2025–26.
* `team_matches.csv` — one row per team per match, with the running league table (points, goal difference, position) after every game.
* `final_tables.csv` — official final league tables, including points deductions.
* `seasons.json` — champion, European places, promoted and relegated clubs, top scorer for each season.
* `awards.json` — every award winner by season (Premier League, PFA, FWA and LMA awards).
* `honours.json` — Champions League, UEFA Cup/Europa League, Ballon d'Or and World Cup winners by year.
* `teams.json` — the 51 clubs: history, every stadium in order, map coordinates, Premier League record.
* `current_players.json` — profiles of the 667 players in 2026–27 squads, with career Premier League stats.
* `transfers.csv` — signings and departures for every season from 1993–94, derived from where players played (no fees).
* `domestic_honours.json` — FA Cup, League Cup and Community Shield winners for every season since 1992–93, and every club's league, cup and shield wins of all time (cross-checked against Wikipedia's totals).
* `records.json` — official all-time player records (goals, assists, appearances, clean sheets...) plus league and club records computed from the match data (biggest wins, longest runs, best and worst seasons, per-club records).
* `uk_map.json` — simplified outline of the UK and Ireland for the intro map.
* `curated/` — the hand-written club histories and stadium lists. `raw/` — files exactly as downloaded.

**Scripts (`scripts/`, Python 3, no installs needed)**
* `fetch_wikipedia.py`, `fetch_matches.py`, `fetch_players.py`, `fetch_pl_stats.py`, `fetch_coordinates.py` — download the raw data politely (they wait between requests).
* `wikitables.py`, `extract_club_text.py` — read tables and text out of the Wikipedia pages.
* `build_awards_seasons.py`, `build_teams.py`, `build_honours.py`, `build_domestic_honours.py`, `build_records.py`, `build_tables.py`, `build_matches.py`, `build_players.py`, `build_player_seasons.py`, `build_profiles_transfers.py`, `build_map.py` — turn the raw files into the files in `data/`, running checks as they go.
* `verify.py` — recomputes the headline numbers in plain Python and compares them with the website's code.

**Tests (`tests/`)**
* `check_numbers.js` — run `node tests/check_numbers.js`. 20 checks, for example: the match count is exactly 3 × 462 + 31 × 380; every club-season's results agree with the official final tables; every player row links to a real match with the same score; Shearer's 260 is the official top scorer; Arsenal's 49-match unbeaten run is recomputed independently.

## How to rebuild

```
python3 scripts/fetch_matches.py && python3 scripts/fetch_players.py     # download (a few minutes)
python3 scripts/fetch_pl_stats.py                                          # player season stats, 1992-2026 (about 10-20 minutes)
python3 scripts/build_matches.py && python3 scripts/build_tables.py
python3 scripts/build_players.py && python3 scripts/build_player_seasons.py && python3 scripts/build_profiles_transfers.py
node tests/check_numbers.js && python3 scripts/verify.py                  # check everything
python3 -m http.server                                                    # then open http://localhost:8000
```

## Method notes and limits
* **Matchweek** means a club's nth game, so every club has played the same number of games at each point. Points deductions (Middlesbrough 1996–97, Portsmouth 2009–10, Everton and Nottingham Forest 2023–24) count from the day they took effect.
* Match-by-match player data (who played in which match) only exists in free form from 2016–17. Before that, player data is season totals (`player_seasons.csv`). Shots, cards, referees and odds start in 2000–01, and player minutes in about 2006–07.
* **Signings and departures** are derived (a player turning out for a different club than before), for every season from 1993–94, so loans count as moves and fees are not known. If a player appears for two clubs in one season, the order is inferred from his clubs before and after. 2026–27 moves compare 2025–26 appearances with today's squad lists.
* The 2026 Ballon d'Or is not announced until 26 October 2026; 2020 had no award.
* Career totals are now computed from `player_seasons.csv` and match the official all-time lists (for example Shearer's 260 goals).
* The ball in the intro is a recreation from published descriptions (white with jagged neon pink and purple graphics), not the official artwork.
* Student project, not affiliated with the Premier League.
