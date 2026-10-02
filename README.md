# Premier League History: Report and Dashboard

A two-page website about every Premier League season since it began in 1992–93, in the league's purple and white.

* **Report** (`index.html`) — 18 findings, each with a chart, a table of every season's winners, a closing section on the data, and a live "How we know the numbers are right" section. It opens with an interactive spinning football (the pink-and-purple 2026–27 Premier League ball, the Puma Stellar Nitro Ultimate, recreated in 3D) that explodes into a rotating map of the UK once the data has loaded. Every club is a pin topped with its crest, and the largest cities (and capitals) are named, with more appearing as you zoom in. On the map you can hover or click any club, zoom to the cursor, jump to London or Manchester and Liverpool, and open each club's history, trophies, records and every ground.
* **Both pages** open with a pile of balls, one per club, each showing its crest. Click or tap anywhere in the pile and a ball is kicked at that spot, knocking the crests around (simple 2D physics, no library; `assets/js/pile.js`).
* **Dashboard** (`dashboard.html`) — four sections (Players, Clubs, Seasons, League records), each with a few views: filters, summary numbers, four charts with a measure switch and a breakdown switch, a sortable table and a reset button (Explore the numbers); player profiles; club comparison; club records and trophies; signings and departures; matchweek table race; season summary and awards; record books.

Live site: https://ethankaufman.github.io/PL-History-Dashboard/

## The data set

The main data set is `data/player_matches.csv`: **one row is one player in one Premier League match he played in** (as a starter or as a substitute who came on). It has **355,716 rows and 19 columns**, covering all **34 seasons** (1992–93 to 2025–26), 5,112 players, 51 clubs and all 13,166 matches. Time columns: season and matchweek. Group columns: player and club. Categorical columns include season, club, opponent, position and venue; numeric columns include minutes, goals, assists, clean sheets and cards.

It is built from the Premier League's official match records: both line-ups, every substitution time, and every goal, assist and card. Around it sit the season-by-season player statistics, 13,166 matches, 686 official final-table rows, 34 seasons, 359 awards, honours, trophies, records, and 51 club histories with every stadium.

## How the numbers are checked

Every data set was collected from at least two independent places and compared. `python3 scripts/audit.py` runs **32 checks, and all 32 pass**; `node tests/check_numbers.js` runs 34 more and `python3 scripts/verify.py` recomputes the headline numbers in plain Python. The report shows the audit live. Highlights:

| What | Compared with | Result |
|---|---|---|
| The official score of every match | football-data.co.uk | 13,166 of 13,166 agree |
| The goal events of every match | the official score | 13,166 of 13,166 add up exactly |
| Each club-season's W/D/L, goals and points | the official final tables | 686 of 686 agree; the four points deductions are confirmed |
| Final position after each club's last game | the official final position | 686 of 686 |
| Match-record goals and assists per player-season | the Premier League's season statistics | 99.98% agree |
| Career records (goals, assists, appearances, clean sheets) | the official top-10 lists | 40 of 40 reproduced exactly |
| Each season's promoted and relegated clubs | the clubs that actually play the next season | 33 of 33 seasons |
| Golden Boot, Golden Glove, top scorers | the player table | all agree |
| Every Goal of the Season | the official match events (player, club, opponent, date) | 34 of 34 |
| Each club's ground in every season | the ground the Premier League recorded for home matches | 685 of 686 at first sight; the rest were sponsor names for the same stadium |
| Hand-written club histories | the club pages and our data | every year and number traced to a source |

### Where sources disagreed, and what was done
Nothing is hidden: every disagreement is written to `data/source_disagreements.csv` (1,131 rows) and `data/source_disagreements_awards.csv`.
* **Cards, referees, dates, half-time scores**: football-data.co.uk differs from the official record in 716 card counts, 304 referees, 104 kick-off dates (mostly by a day) and 7 half-time scores. A third independent source decided it: the Premier League's player statistics agree with the official match events to within a card or two for almost every club-season, but not with football-data.co.uk. The official record was used.
* **Yellow cards**: a player sent off for two yellows is counted as a red only (this is how the Premier League's own statistic works; with this rule the match records reproduce it for 99.9% of player-seasons). The raw event list keeps every card as shown. 228 cards in the official record name no player and are not counted.
* **Most assists in a season**: Wikipedia and the Premier League's statistics differ in 4 of 34 seasons (1993–94, 2009–10, 2013–14, 2014–15); the Premier League's statistics and match records agree with each other, so those were used.
* **Appearances**: for 82 player-seasons (0.4%), almost all Stoke 2008–09 and Burnley 2009–10, the Premier League's season statistics show one or two fewer appearances than the official line-ups. The line-ups are the primary evidence, so the match table uses them.
* **Wikipedia's all-time table** has four slips (for example West Ham's own W+D+L add up to 1,148 games but it says 1,110). Our totals equal the sum of the 34 official season tables.

## Where the data comes from

| Data | Source |
|---|---|
| Every match: line-ups, substitutions, goals, assists, cards, referee, attendance, ground, half-time score | The Premier League's public statistics service (the back end of premierleague.com), collected politely at a low request rate |
| Season totals for every player since 1992–93 | The same service |
| Match results, shots, fouls, corners, betting odds | [football-data.co.uk](https://www.football-data.co.uk/englandm.php) (1993–94 on; shots, fouls, corners and odds from 2000–01) and [footballcsv/england](https://github.com/footballcsv/england) (1992–93) |
| Expected goals and assists (2022–23 on) and today's squad lists | The open [vaastav](https://github.com/vaastav/Fantasy-Premier-League) archive and the Premier League's public API |
| Final tables, seasons, awards, European and World Cup winners, Ballon d'Or, FA Cup / League Cup / Community Shield / league champions, all-time records, club histories, stadiums, coordinates | Wikipedia via its public API (CC BY-SA 4.0); club histories were written for this project from the club pages |
| Player photos | Linked from premierleague.com; initials are shown if a photo does not load |
| Club crests | Downloaded from premierleague.com (`scripts/fetch_badges.py`, saved in `assets/badges/`). The crests belong to their clubs and appear only to identify them, in a non-commercial student project |
| City names on the map | A chosen list of large cities and capitals; coordinates from each city's Wikipedia page (`scripts/build_cities.py`) |

The Premier League's service is not an official, documented API and could change. The processed tables are in the repository, so the site would keep working. football-data.org was also considered: every request needs a personal access key, and it holds nothing the Premier League's own records do not.

## Files

**Pages**: `index.html` (report + intro), `dashboard.html`.

**Site code (`assets/`)**: `css/style.css` (one purple-and-white style for both pages); `js/app.js` (navigation, data loading, formatting, club colours, chart look); `js/calc.js` (every calculation, shared by the pages and the tests); `js/report.js`; `js/dashboard.js`; `js/intro.js` (ball, explosion and map, Three.js); `js/pile.js` (the pile of club balls); `badges/` (51 club crests); `vendor/` (Chart.js, PapaParse, Three.js).

**Data (`data/`)**
* `player_matches.csv` — the main data set (see above). `appearances_lean.csv` — the same rows with ids, which the dashboard loads (smaller and faster).
* `player_seasons.csv` — the Premier League's season statistics: one row per player per club per season (18,662 rows). Minutes before 2006–07 are computed from line-ups and substitutions.
* `matches.csv`, `team_matches.csv` — 13,166 matches (and one row per team per match with the league table after every game); `match_details.csv` (official referee, attendance, ground), `match_events.csv` (79,000 goals and cards with minutes).
* `final_tables.csv`, `seasons.json`, `awards.json`, `honours.json`, `domestic_honours.json`, `records.json`, `teams.json`, `current_players.json`, `transfers.csv` (signings and departures by season, derived from where players played; no fees), `uk_map.json`, `cities.json` (map city labels), `badges.json` (club name to crest file), `city_case.json` (the Manchester City asterisk: dates, charges, wording and sources).
* `audit.json` (the audit results shown in the report), `manifest.json` (row counts), `source_disagreements*.csv`.
* `curated/` — hand-written club histories and stadium lists. `raw/` — files as downloaded (plus small check outputs).

**Every script (`scripts/`)**

| File | What it does |
|---|---|
| `audit.py` | Accuracy audit: cross-check the data sets against each other and against independent sources. |
| `build_awards_seasons.py` | Turn the raw Wikipedia tables in data/raw into data/awards.json and data/seasons.json (awards and season summaries). |
| `build_cities.py` | Look up the coordinates of the large and relevant cities that are labelled on the intro map. |
| `build_domestic_honours.py` | Build data/domestic_honours.json: domestic trophies by season and by club. |
| `build_honours.py` | Build data/honours.json: for each Premier League season, the other big winners of that year. |
| `build_map.py` | Extract a simplified outline of the UK and Ireland for the intro map. |
| `build_matches.py` | Build data/matches.csv and data/team_matches.csv from the downloaded football-data.co.uk and footballcsv results. |
| `build_official_matches.py` | Turn the official Premier League match records into match and player-match tables, and cross-check them. |
| `build_player_seasons.py` | Build data/player_seasons.csv: one row per player, per club, per season, 1992-93 to 2025-26. |
| `build_players.py` | LEGACY (superseded by build_official_matches.py): an earlier player-match table built from the open vaastav archive (2016-17 onward). |
| `build_profiles_transfers.py` | Build current-player profiles and the signings / departures lists. |
| `build_records.py` | Build data/records.json: league records and club records. |
| `build_tables.py` | Read each season's official final league table from the saved Wikipedia pages. |
| `build_teams.py` | Combine everything we know about each club into one file: data/teams.json. |
| `extract_club_text.py` | Pull readable text out of each saved club page so it can be reviewed and turned into data. |
| `fetch_badges.py` | Download every club's crest from premierleague.com and list them in data/badges.json. |
| `fetch_coordinates.py` | Look up latitude/longitude for each club's current ground using Wikipedia's coordinates API. |
| `fetch_matches.py` | Download Premier League match results for every season. |
| `fetch_pl_matches.py` | Download the official record of every Premier League match, 1992-93 to 2025-26, from the Premier League's statistics service. |
| `fetch_pl_stats.py` | Download player season statistics from the Premier League's own statistics service, for every season 1992/93 to 2025/26. |
| `fetch_players.py` | Download today's Premier League squad lists (used for the current-player profiles). |
| `fetch_wikipedia.py` | Download Wikipedia pages (as HTML inside a JSON file) politely. |
| `finish_player_seasons.py` | Fill the 'minutes' column of player_seasons.csv for every season, and check it against the Premier League's own minutes. |
| `make_manifest.py` | Write data/manifest.json: row counts of the main data files, counted from the files themselves. |
| `rebuild_all.sh` | Rebuilds every data file from the raw downloads in the right order, then runs every check. |
| `reconcile_awards.py` | Settle the 'most assists' award records using the Premier League's own statistics. |
| `reconcile_matches.py` | Cross-check the two independent match sources and fill the gaps in matches.csv and team_matches.csv. |
| `verify.py` | Independent check of the website's headline numbers: recomputes them in plain Python and compares them with the JavaScript results. |
| `wikitables.py` | Tiny helper that pulls tables out of Wikipedia HTML using only Python's standard library. |

**Tests**: `tests/check_numbers.js` (34 checks: recomputes the report's numbers with the site's own calculation code and checks the data).

**Also in the repository**: `.gitignore` (keeps the very large raw match downloads, `data/raw/plmatches/`, out of git), `assets/vendor/` (Chart.js, PapaParse and Three.js, saved locally so the site does not depend on a CDN), `assets/badges/` (51 crest images, one per club), `data/raw/` (every download as received, plus small check outputs; the scripts above read these).

## How to rebuild

```
# downloads (slow; each is gentle on the servers and can be resumed)
python3 scripts/fetch_matches.py && python3 scripts/fetch_pl_stats.py && python3 scripts/fetch_pl_matches.py && python3 scripts/fetch_players.py
# build everything and run every check
./scripts/rebuild_all.sh
python3 -m http.server        # then open http://localhost:8000
```

## The Manchester City asterisk
Manchester City were charged in 2023 with 115 breaches of Premier League rules, and on 29 September 2026 an independent commission found them guilty of 114 (all 80 financial-rules charges and 34 of 35 cooperation charges). The financial charges cover 2009–10 to 2017–18, so every Manchester City result, record, trophy and league position in those seasons carries a **\*** on both pages, linked to a plain-language note (what was found, which seasons, how severe, what the asterisk does and does not mean). It is a flag only: sanctions and an appeal are still to come, and nothing has been removed or changed. The dates, charge counts, wording and sources are in `data/city_case.json` (status as of 2 October 2026), so the flag can be updated in one place. `tests/check_numbers.js` checks that three league titles and eight trophies since 1992 fall in the flagged seasons.

## Method notes and limits
* **Matchweek** means a club's nth game, so every club has played the same number of games at each point. Points deductions (Middlesbrough 1996–97, Portsmouth 2009–10, Everton and Nottingham Forest 2023–24) count from the day they took effect.
* **Minutes** run from the start (or the minute a substitute came on) until he is substituted, sent off or the 90th minute; stoppage time is not counted, which is how the Premier League's own totals work (they match for 99.5% of player-seasons within five minutes). **Clean sheet** means the team conceded nothing and the player played the full match.
* Shots, fouls, corners and betting odds exist only in football-data.co.uk (from 2000–01) and could not be cross-checked.
* **Signings and departures** are derived (a player turning out for a different club than before), for every season from 1993–94, so loans count as moves and fees are not known. If a player appears for two clubs in one season, the order is inferred from his clubs before and after.
* The 2026 Ballon d'Or is not announced until 26 October 2026; 2020 had no award.
* The ball in the intro is a recreation from published descriptions (white with jagged neon pink and purple graphics), not the official artwork.
* Student project, not affiliated with the Premier League.
