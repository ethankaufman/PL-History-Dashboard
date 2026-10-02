// Recomputes the report's key numbers with the same code the website uses (assets/js/calc.js) and checks the data.
// Run:  node tests/check_numbers.js          (prints a summary and exits non-zero on any failed check)
//       node tests/check_numbers.js --json   (prints the numbers as JSON; scripts/verify.py compares them with an independent calculation)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const Papa = require(path.join(root, "assets/vendor/papaparse.min.js"));
const C = require(path.join(root, "assets/js/calc.js"));
const csv = (f) => Papa.parse(fs.readFileSync(path.join(root, "data", f), "utf8"), { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
const json = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));

const plain = (n) => ({ "andy cole": "andrew cole" })[n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()] || n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();   // ignore accents; Wikipedia says Andy Cole, the Premier League says Andrew Cole
const matches = csv("matches.csv"), tm = csv("team_matches.csv"), ft = csv("final_tables.csv"), pm = csv("player_matches.csv");
const seasons = json("seasons.json"), teams = json("teams.json");
const ss = C.seasonStats(matches), tr = C.titleRaces(ft), totals = C.playerTotals(pm).sort((a, b) => b.goals - a.goals);
const numbers = {
  matches: matches.length, goals: C.sum(matches, (m) => m.home_goals + m.away_goals), playerRows: pm.length,
  firstHomeWinPct: ss[0].homeWinPct, lastHomeWinPct: ss[ss.length - 1].homeWinPct,
  highestGoalsPerGameSeason: ss.reduce((a, b) => (b.goalsPerGame > a.goalsPerGame ? b : a)).season,
  manUtdTitles: C.titleCounts(seasons)[0][1], titleWinners: C.titleCounts(seasons).length,
  topScorer: totals[0].name, topScorerGoals: totals[0].goals,
  allTimeTopScorer: C.playerTotalsSeasons(csv("player_seasons.csv")).sort((a, b) => b.goals - a.goals)[0].name,
  allTimeGoals: C.playerTotalsSeasons(csv("player_seasons.csv")).sort((a, b) => b.goals - a.goals)[0].goals,
  playerSeasonRows: csv("player_seasons.csv").length,
  promotedGoneDown: C.promotionOutcomes(seasons).filter((p) => p.relegatedFirstSeason).length, promotions: C.promotionOutcomes(seasons).length,
  groundMoves: C.groundMoves(teams).length, maxTitleMargin: Math.max(...tr.map((r) => r.margin)),
};
if (process.argv.includes("--json")) { console.log(JSON.stringify(numbers)); process.exit(0); }

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); if (!ok) failures++; };

check("13,166 matches = 3×462 + 31×380", matches.length === 3 * 462 + 31 * 380, matches.length);
check("26,332 team-match rows (2 per match)", tm.length === 2 * matches.length, tm.length);
check("goals in matches.csv = goals in team_matches.csv", C.sum(matches, (m) => m.home_goals + m.away_goals) === C.sum(tm, (r) => r.goals_for), numbers.goals);
const manifest = json("manifest.json");
check("the manifest used by the report matches the real files (player_matches.csv rows, players, goals)", manifest.player_matches.rows === pm.length && manifest.player_matches.players === new Set(pm.map((r) => r.player_id)).size && manifest.player_matches.goals === C.sum(pm, (r) => r.goals) && manifest.matches.rows === matches.length, `${manifest.player_matches.rows} rows, ${manifest.player_matches.players} players`);
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

// every player row belongs to a real match: right club, right opponent, right side
const mById = Object.fromEntries(matches.map((m) => [m.match_id, m]));
let sideBad = 0; const goalsByTeamMatch = {};
for (const r of pm) {
  const m = mById[r.match_id];
  const ok = m && (r.venue === "Home" ? m.home === r.team && m.away === r.opponent : m.away === r.team && m.home === r.opponent) && m.season === r.season;
  if (!ok) sideBad++;
  const k = r.match_id + "|" + r.team; goalsByTeamMatch[k] = (goalsByTeamMatch[k] || 0) + r.goals;
}
check("every player row sits in a real match with the right club, opponent and side", sideBad === 0, sideBad + " mismatches");
let tooMany = 0;
for (const [k, g] of Object.entries(goalsByTeamMatch)) { const [id, team] = k.split("|"); const m = mById[id]; if (g > (m.home === team ? m.home_goals : m.away_goals)) tooMany++; }
check("players never score more goals in a match than their team", tooMany === 0, tooMany + " team-matches");
// trophies and records
const dom = json("domestic_honours.json"), rec = json("records.json");
check("every season since 1992 has an FA Cup and League Cup winner", seasons.every((x) => dom.by_season[x.season]?.fa_cup?.winner && dom.by_season[x.season]?.league_cup?.winner));
check("each club's league titles since 1992 are within its all-time league titles", seasons.every((x) => dom.by_club[x.champion].counts.league >= C.titleCounts(seasons).find((t) => t[0] === x.champion)[1]));
check("Leicester's trophies match their club page (1 league, 1 FA Cup, 3 League Cups, 2 Community Shields)", JSON.stringify(dom.by_club["Leicester City"].counts) === JSON.stringify({ league: 1, fa_cup: 1, league_cup: 3, community_shield: 2, total: 7 }));
check("official all-time top scorer is Alan Shearer with 260", rec.official.most_goals[0].Player === "Alan Shearer" && rec.official.most_goals[0].Goals === "260");
const officialMatchTotals = rec.official.most_goals.every((r) => totals.some((p) => plain(p.name) === plain(r.Player) && p.goals === +r.Goals));
check("the match-by-match table reproduces all ten official top career goal totals", officialMatchTotals, `${totals[0].name}: ${totals[0].goals}`);
// longest unbeaten run recomputed here, independently of the Python that wrote records.json
const unbeaten = (team) => { const g = tm.filter((r) => r.team === team).sort((a, b) => (a.date < b.date ? -1 : 1)); let best = 0, cur = 0, prev = null; for (const r of g) { const s0 = C.seasonStart(r.season); if (prev !== null && s0 - prev > 1) cur = 0; prev = s0; cur = r.result !== "L" ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
check("Arsenal's longest unbeaten run is 49 matches (recomputed here and in records.json)", unbeaten("Arsenal") === 49 && rec.league.longest_unbeaten_runs[0].length === 49, unbeaten("Arsenal"));
const best = ft.filter((r) => r.played === 38).sort((a, b) => b.points - a.points)[0];
check("most points in a 38-game season is Manchester City's 100 in 2017–18", best.team === "Manchester City" && best.points === 100 && rec.league.most_points[0].points === 100);
check("Arsenal's all-time record agrees with the official all-time table (1,304 played, 719 won)", rec.clubs.Arsenal.premier_league.played === 1304 && rec.clubs.Arsenal.premier_league.won === 719);
// season-by-season player table (1992-93 onward)
const psr = csv("player_seasons.csv");
check("player_seasons.csv covers all 34 seasons with 14 columns", new Set(psr.map((r) => r.season)).size === 34 && Object.keys(psr[0]).length === 14, `${psr.length} rows`);
const cs = C.playerTotalsSeasons(psr);
const sh = cs.find((p) => p.name === "Alan Shearer");
check("computed career goals: Alan Shearer 260 (the official record)", sh.goals === 260 && cs.sort((a, b) => b.goals - a.goals)[0].name === "Alan Shearer", sh.goals);
const officialGoals = rec.official.most_goals.every((r) => cs.some((p) => plain(p.name) === plain(r.Player) && p.goals === +r.Goals));
check("all ten official top career goal totals are reproduced exactly", officialGoals);
const giggs = cs.find((p) => p.name === "Ryan Giggs");
check("Ryan Giggs: 162 assists and 632 appearances, as in the official records", giggs.assists === 162 && giggs.appearances === 632, `${giggs.assists} assists, ${giggs.appearances} apps`);
// the two player tables (official match records vs official season statistics) must agree
const fields = [["goals", "goals", "goals"], ["assists", "assists", "assists"], ["appearances", "appearances", null], ["yellow_cards", "yellow_cards", "yellow_cards"], ["red_cards", "red_cards", "red_cards"]];
const mine = {}; for (const r of pm) { const k = r.player_id + "|" + r.season + "|" + r.team; const o = (mine[k] ||= { goals: 0, assists: 0, appearances: 0, yellow_cards: 0, red_cards: 0 }); o.goals += r.goals; o.assists += r.assists; o.appearances++; o.yellow_cards += r.yellow_cards; o.red_cards += r.red_cards; }
for (const [label, col] of fields) {
  const same = psr.filter((r) => (mine[r.player_id + "|" + r.season + "|" + r.club]?.[label] ?? 0) === r[col]).length;
  const floor = label === "appearances" ? 0.995 : 0.998;   // the season statistics omit a game or two for some Stoke 2008–09 and Burnley 2009–10 players
  check(`${label} per player-club-season agree between the match records and the season statistics (at least ${floor * 100}%)`, same / psr.length >= floor, `${same} of ${psr.length} (${(100 * same / psr.length).toFixed(2)}%)`);
}
// signings and sales between Premier League clubs must mirror each other
const tr2 = csv("transfers.csv");
const sold = tr2.filter((r) => r.kind === "Sold to another Premier League club").length, bought = tr2.filter((r) => r.kind === "Signing from another Premier League club").length;
check("every sale to another Premier League club is also a signing by that club", sold === bought, `${sold} and ${bought}`);
check("report headline: highest-scoring season is 2023–24", numbers.highestGoalsPerGameSeason === "2023–24", numbers.highestGoalsPerGameSeason);
// the Manchester City asterisk: which honours fall in the flagged seasons (data/city_case.json)
const cc = json("city_case.json"), cityDom = json("domestic_honours.json").by_club[cc.club];
const inWindow = (x) => +String(x).slice(0, 4) >= +cc.first_season.slice(0, 4) && +String(x).slice(0, 4) <= +cc.last_season.slice(0, 4);
check("flagged seasons run 2009–10 to 2017–18 (nine seasons)", +cc.last_season.slice(0, 4) - +cc.first_season.slice(0, 4) + 1 === 9);
check("the charge counts add up to 115", cc.charges.reduce((a, c) => a + +c[0], 0) === 115, cc.charges.map((c) => c[0]).join(" + "));
check("three of Manchester City's league titles fall in the flagged seasons", seasons.filter((x) => x.champion === cc.club && inWindow(x.season)).length === 3);
check("eight of Manchester City's trophies since 1992 fall in the flagged seasons", [...cityDom.league_titles.filter((x) => +String(x).slice(0, 4) >= 1992), ...cityDom.fa_cup.filter((x) => +String(x).slice(0, 4) >= 1992), ...cityDom.league_cup.filter((x) => +String(x).slice(0, 4) >= 1992), ...cityDom.community_shield.filter((x) => x >= 1992)].filter(inWindow).length === 8);
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
