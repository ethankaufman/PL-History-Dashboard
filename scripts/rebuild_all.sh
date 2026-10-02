#!/bin/bash
# Rebuild every data file from the raw downloads, in the right order, then check everything.
# (The downloads themselves are separate and slow: fetch_matches.py, fetch_pl_stats.py, fetch_pl_matches.py, fetch_players.py, fetch_wikipedia.py.)
set -e
cd "$(dirname "$0")/.."

python3 scripts/build_awards_seasons.py
python3 scripts/build_teams.py
python3 scripts/build_honours.py
python3 scripts/build_domestic_honours.py

# match results: build, add the official record, settle disagreements; the second pass lets the official dates flow into the match numbering and league tables
for pass in 1 2; do
  python3 scripts/build_matches.py
  python3 scripts/build_official_matches.py --final
  python3 scripts/reconcile_matches.py
done
python3 scripts/build_tables.py

# players
python3 scripts/build_player_seasons.py
python3 scripts/finish_player_seasons.py
python3 scripts/reconcile_awards.py
python3 scripts/make_manifest.py
python3 scripts/build_records.py
python3 scripts/build_profiles_transfers.py

# checks
python3 scripts/audit.py
node tests/check_numbers.js
python3 scripts/verify.py
