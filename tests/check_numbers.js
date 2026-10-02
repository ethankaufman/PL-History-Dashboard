// Recomputes the report's key numbers with the same code the website uses (assets/js/calc.js) and checks the data.
// Run:  node tests/check_numbers.js          (prints a summary and exits non-zero on any failed check)
//       node tests/check_numbers.js --json   (prints the numbers as JSON; scripts/verify.py compares them with an independent calculation)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const Papa = require(path.join(root, "assets/vendor/papaparse.min.js"));
const C = require(path.join(root, "assets/js/calc.js"));
const csv = (f) => Papa.parse(fs.readFileSync(path.join(root, "data", f), "utf8"), { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
const json = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));

const matches = csv("matches.csv"), tm = csv("team_matches.csv"), ft = csv("final_tables.csv"), pm = csv("player_matches.csv");
const seasons = json("seasons.json"), teams = json("teams.json");
const ss = C.seasonStats(matches), tr = C.titleRaces(ft), totals = C.playerTotals(pm).sort((a, b) => b.goals - a.goals);
const numbers = {
  matches: matches.length, goals: C.sum(matches, (m) => m.home_goals + m.away_goals), playerRows: pm.length,
  firstHomeWinPct: ss[0].homeWinPct, lastHomeWinPct: ss[ss.length - 1].homeWinPct,
  highestGoalsPerGameSeason: ss.reduce((a, b) => (b.goalsPerGame > a.goalsPerGame ? b : a)).season,
  manUtdTitles: C.titleCounts(seasons)[0][1], titleWinners: C.titleCounts(seasons).length,
  topScorer: totals[0].name, topScorerGoals: totals[0].goals,
  promotedGoneDown: C.promotionOutcomes(seasons).filter((p) => p.relegatedFirstSeason).length, promotions: C.promotionOutcomes(seasons).length,
  groundMoves: C.groundMoves(teams).length, maxTitleMargin: Math.max(...tr.map((r) => r.margin)),
};
if (process.argv.includes("--json")) { console.log(JSON.stringify(numbers)); process.exit(0); }

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); if (!ok) failures++; };

check("13,166 matches = 3×462 + 31×380", matches.length === 3 * 462 + 31 * 380, matches.length);
check("26,332 team-match rows (2 per match)", tm.length === 2 * matches.length, tm.length);
check("goals in matches.csv = goals in team_matches.csv", C.sum(matches, (m) => m.home_goals + m.away_goals) === C.sum(tm, (r) => r.goals_for), numbers.goals);
check("player table has at least 50,000 rows and 8 columns", pm.length >= 50000 && Object.keys(pm[0]).length >= 8, `${pm.length} rows, ${Object.keys(pm[0]).length} columns`);

// official final tables = results (plus the four known deductions)
const agg = {};
for (const r of tm) {
  const k = r.season + "|" + r.team;
  const a = (agg[k] ||= { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, n: 0 });
  a.p += r.points; a.gf += r.goals_for; a.ga += r.goals_against; a.n++;
  r.result === "W" ? a.w++ : r.result === "D" ? a.d++ : a.l++;
}
let bad = 0, deducted = 0;
for (const r of ft) {
  const a = agg[r.season + "|" + r.team];
  if (!a || a.n !== r.played || a.w !== r.won || a.d !== r.drawn || a.l !== r.lost || a.gf !== r.goals_for || a.ga !== r.goals_against || a.p - r.points !== r.points_deducted) bad++;
  if (r.points_deducted) deducted++;
}
check("every club-season's W/D/L/goals/points agree with the official final tables", bad === 0 && ft.length === 686, `${ft.length} rows, ${bad} mismatches`);
check("exactly four clubs lost points to deductions", deducted === 4, deducted);
const lastPos = {};
for (const r of tm) if (r.game_no === (r.season < "1995" ? 42 : 38)) lastPos[r.season + "|" + r.team] = r.position;
check("table position after the last game = official final position", ft.every((r) => lastPos[r.season + "|" + r.team] === r.position), "686 rows");
check("every champion matches seasons.json", tr.every((r) => seasons.find((s) => s.season === r.season).champion === r.champion));

// every player row's team score matches its match, and players' goals never exceed the team's goals
const mById = Object.fromEntries(matches.map((m) => [m.match_id, m]));
let scoreBad = 0; const goalsByTeamMatch = {};
for (const r of pm) {
  const m = mById[r.match_id];
  const [tg, og] = r.venue === "Home" ? [m.home_goals, m.away_goals] : [m.away_goals, m.home_goals];
  if (tg !== r.team_goals || og !== r.opponent_goals) scoreBad++;
  const k = r.match_id + "|" + r.team; goalsByTeamMatch[k] = (goalsByTeamMatch[k] || 0) + r.goals;
}
check("every player row's score equals its match score", scoreBad === 0, scoreBad + " mismatches");
let tooMany = 0;
for (const [k, g] of Object.entries(goalsByTeamMatch)) { const [id, team] = k.split("|"); const m = mById[id]; if (g > (m.home === team ? m.home_goals : m.away_goals)) tooMany++; }
check("players never score more goals in a match than their team", tooMany === 0, tooMany + " team-matches");
// trophies and records
const dom = json("domestic_honours.json"), rec = json("records.json");
check("every season since 1992 has an FA Cup and League Cup winner", seasons.every((x) => dom.by_season[x.season]?.fa_cup?.winner && dom.by_season[x.season]?.league_cup?.winner));
check("each club's league titles since 1992 are within its all-time league titles", seasons.every((x) => dom.by_club[x.champion].counts.league >= C.titleCounts(seasons).find((t) => t[0] === x.champion)[1]));
check("Leicester's trophies match their club page (1 league, 1 FA Cup, 3 League Cups, 2 Community Shields)", JSON.stringify(dom.by_club["Leicester City"].counts) === JSON.stringify({ league: 1, fa_cup: 1, league_cup: 3, community_shield: 2, total: 7 }));
check("official all-time top scorer is Alan Shearer with 260", rec.official.most_goals[0].Player === "Alan Shearer" && rec.official.most_goals[0].Goals === "260");
check("our 2016–26 player data never exceeds the official career goals (Salah)", totals[0].goals <= +rec.official.most_goals.find((r) => r.Player === totals[0].name).Goals, `${totals[0].name}: ${totals[0].goals} in our data, ${rec.official.most_goals.find((r) => r.Player === totals[0].name).Goals} all-time`);
// longest unbeaten run recomputed here, independently of the Python that wrote records.json
const unbeaten = (team) => { const g = tm.filter((r) => r.team === team).sort((a, b) => (a.date < b.date ? -1 : 1)); let best = 0, cur = 0, prev = null; for (const r of g) { const s0 = C.seasonStart(r.season); if (prev !== null && s0 - prev > 1) cur = 0; prev = s0; cur = r.result !== "L" ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
check("Arsenal's longest unbeaten run is 49 matches (recomputed here and in records.json)", unbeaten("Arsenal") === 49 && rec.league.longest_unbeaten_runs[0].length === 49, unbeaten("Arsenal"));
const best = ft.filter((r) => r.played === 38).sort((a, b) => b.points - a.points)[0];
check("most points in a 38-game season is Manchester City's 100 in 2017–18", best.team === "Manchester City" && best.points === 100 && rec.league.most_points[0].points === 100);
check("Arsenal's all-time record agrees with the official all-time table (1,304 played, 719 won)", rec.clubs.Arsenal.premier_league.played === 1304 && rec.clubs.Arsenal.premier_league.won === 719);
check("report headline: highest-scoring season is 2023–24", numbers.highestGoalsPerGameSeason === "2023–24", numbers.highestGoalsPerGameSeason);
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
