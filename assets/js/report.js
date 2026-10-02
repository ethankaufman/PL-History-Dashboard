/* The report page: every number and sentence below is computed from the files in /data when the page loads. */
function renderReport(d) {
  const { int, dec, pct, esc, clubColor, palette } = PL;
  const C = Calc;
  PL.chartDefaults();

  const matches = d.matches, seasons = d.seasons, finalTables = d.finalTables, pm = d.playerMatches, teams = d.teams;
  const seasonStats = C.seasonStats(matches);
  const totalGoals = C.sum(matches, (m) => m.home_goals + m.away_goals);
  const lastSeason = seasonStats[seasonStats.length - 1];
  const firstSeason = seasonStats[0];
  const max = (arr, f) => arr.reduce((a, b) => (f(b) > f(a) ? b : a));
  const min = (arr, f) => arr.reduce((a, b) => (f(b) < f(a) ? b : a));
  const titleCounts = C.titleCounts(seasons);
  const races = C.titleRaces(finalTables);

  // ---------- hero ----------
  document.getElementById("summary").innerHTML =
    `This report follows every Premier League season from 1992–93 to 2025–26: ${int(matches.length)} matches, ${int(totalGoals)} goals ` +
    `and ${int(seasons.length)} champions' stories, plus ${int(pm.length)} player appearances from 2016–17 onward. ` +
    `The league has become a little less home-friendly (home wins fell from ${pct(firstSeason.homeWinPct)} of matches in ${firstSeason.season} to ${pct(lastSeason.homeWinPct)} in ${lastSeason.season}), ` +
    `goals have crept up to ${dec(lastSeason.goalsPerGame)} a game, and a handful of clubs still win everything: only ${titleCounts.length} clubs have ever won the title, ` +
    `and ${titleCounts[0][0]} alone won ${titleCounts[0][1]}.`;
  const statBlock = [
    [int(matches.length), "matches played, 1992–93 to 2025–26"],
    [int(totalGoals), "goals scored in those matches"],
    [int(seasons.length), "seasons covered"],
    [int(pm.length), "player appearances in the player dataset (2016–17 onward)"],
    [int(teams.length), "clubs that have played in the Premier League"],
    [int(titleCounts.length), "different clubs have won the title"],
  ];
  document.getElementById("stats").innerHTML = statBlock.map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");

  // ---------- chart helpers ----------
  const charts = [];
  const lineOpts = (extra = {}) => ({
    responsive: true, maintainAspectRatio: true, aspectRatio: 1.6, interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: extra.legend ?? false } },
    scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { ...(extra.y || {}) } }, ...(extra.rest || {}),
  });
  const sections = [];
  const add = (s) => sections.push(s);

  // 1 goals
  const gHigh = max(seasonStats, (s) => s.goalsPerGame), gLow = min(seasonStats, (s) => s.goalsPerGame);
  add({
    title: `${gHigh.season} was the highest-scoring season ever, at ${dec(gHigh.goalsPerGame)} goals a game`,
    body: [`Across ${int(matches.length)} matches the Premier League has produced ${int(totalGoals)} goals, an average of ${dec(totalGoals / matches.length)} per match. ` +
      `The quietest season was ${gLow.season} with ${dec(gLow.goalsPerGame)} a game; the first season, ${firstSeason.season}, averaged ${dec(firstSeason.goalsPerGame)}.`,
      `Goals per game is total goals divided by matches played in the season. The latest season, ${lastSeason.season}, averaged ${dec(lastSeason.goalsPerGame)}.`],
    chart: { type: "line", data: { labels: seasonStats.map((s) => s.season), datasets: [{ label: "Goals per game", data: seasonStats.map((s) => +s.goalsPerGame.toFixed(3)), borderColor: palette[0], backgroundColor: "#00ff8522", fill: true, tension: .3, pointRadius: 2 }] }, options: lineOpts({ y: { min: 2, title: { display: true, text: "Goals per game" } } }) },
    caption: "Source: matches.csv — every Premier League match, 1992–93 to 2025–26.",
  });

  // 2 home advantage
  const homeLow = min(seasonStats, (s) => s.homeWinPct);
  add({
    title: `Home wins have slipped from ${pct(firstSeason.homeWinPct)} to ${pct(lastSeason.homeWinPct)} of matches, bottoming out at ${pct(homeLow.homeWinPct)} in ${homeLow.season}`,
    body: [`Playing at home used to be worth more. In ${firstSeason.season} ${pct(firstSeason.homeWinPct)} of matches ended in a home win; in ${lastSeason.season} it was ${pct(lastSeason.homeWinPct)}. ` +
      `The lowest point was ${homeLow.season}, when ${pct(homeLow.homeWinPct)} of matches were home wins and ${pct(homeLow.awayWinPct)} were away wins — the season most affected by matches played in empty stadiums.`,
      `Home win % is home wins divided by all matches in the season; draws and away wins are calculated the same way, so the three lines add to 100%.`],
    chart: { type: "line", data: { labels: seasonStats.map((s) => s.season), datasets: [
      { label: "Home win %", data: seasonStats.map((s) => +s.homeWinPct.toFixed(2)), borderColor: palette[0], tension: .3, pointRadius: 1.5 },
      { label: "Draw %", data: seasonStats.map((s) => +s.drawPct.toFixed(2)), borderColor: palette[3], tension: .3, pointRadius: 1.5 },
      { label: "Away win %", data: seasonStats.map((s) => +s.awayWinPct.toFixed(2)), borderColor: palette[1], tension: .3, pointRadius: 1.5 }] }, options: lineOpts({ legend: true, y: { title: { display: true, text: "% of matches" } } }) },
    caption: "Source: matches.csv — result column (H, D, A).",
  });

  // 3 titles
  const topClub = titleCounts[0];
  add({
    title: `Only ${titleCounts.length} clubs have won the Premier League, and ${topClub[0]} won ${topClub[1]} of the ${seasons.length} titles`,
    body: [`${titleCounts.slice(0, 3).map(([c, n]) => `${c} (${n})`).join(", ")} have between them won ${titleCounts.slice(0, 3).reduce((s, x) => s + x[1], 0)} of ${seasons.length} titles, ` +
      `${pct(100 * titleCounts.slice(0, 3).reduce((s, x) => s + x[1], 0) / seasons.length, 0)} of the total. ` +
      `${titleCounts.slice(-2).map(([c]) => c).join(" and ")} are the one-time winners who broke the pattern (Blackburn in 1994–95, Leicester in 2015–16).`,
      `A title is counted for the club that finished first in the official final table. Seasons come from seasons.json; the champion is checked against the final tables.`],
    chart: { type: "bar", data: { labels: titleCounts.map((x) => x[0]), datasets: [{ label: "Titles", data: titleCounts.map((x) => x[1]), backgroundColor: titleCounts.map((x) => clubColor(x[0])) }] }, options: { indexAxis: "y", responsive: true, aspectRatio: 1.5, plugins: { legend: { display: false } } } },
    caption: "Source: seasons.json (champion of each season).",
  });

  // 4 points needed
  const champMin = min(races, (r) => r.championPoints), champMax = max(races, (r) => r.championPoints);
  const safeMin = min(races, (r) => r.safetyPoints), safeMax = max(races, (r) => r.safetyPoints);
  add({
    title: `A title has taken between ${champMin.championPoints} and ${champMax.championPoints} points; staying up has taken between ${safeMin.safetyPoints} and ${safeMax.safetyPoints}`,
    body: [`The lowest points total to win the league was ${champMin.championPoints} (${champMin.champion}, ${champMin.season}) and the highest was ${champMax.championPoints} (${champMax.champion}, ${champMax.season}). ` +
      `The "safety line" — the points of the last club to avoid relegation — was lowest in ${safeMin.season} (${safeMin.safetyPoints} points, ${safeMin.safetyClub}) and highest in ${safeMax.season} (${safeMax.safetyPoints}, ${safeMax.safetyClub}).`,
      `Safety points are the points of the club in the lowest position that was not relegated (17th place in a 20-club season; 19th in 1992–93 and 1993–94 and 18th in 1994–95, when 22 clubs played). Points are the official totals, including deductions.`],
    chart: { type: "line", data: { labels: races.map((r) => r.season), datasets: [
      { label: "Champions' points", data: races.map((r) => r.championPoints), borderColor: palette[0], tension: .25, pointRadius: 2 },
      { label: "Safety line", data: races.map((r) => r.safetyPoints), borderColor: palette[1], tension: .25, pointRadius: 2 }] }, options: lineOpts({ legend: true, y: { title: { display: true, text: "Points" } } }) },
    caption: "Source: final_tables.csv — official final league tables.",
  });

  // 5 margins
  const tight = [...races].sort((a, b) => a.margin - b.margin || Math.abs(a.goalDiffGap) - Math.abs(b.goalDiffGap))[0];
  const wide = max(races, (r) => r.margin);
  const scoreOf = (season, team) => finalTables.find((r) => r.season === season && r.team === team);
  const ch = scoreOf(tight.season, tight.champion), ru = scoreOf(tight.season, tight.runnerUp);
  add({
    title: `The closest title race was ${tight.season}, decided by ${tight.margin === 0 ? "goal difference after a tie on points" : `${tight.margin} point${tight.margin > 1 ? "s" : ""}`}; the widest margin was ${wide.margin} points in ${wide.season}`,
    body: [`In ${tight.season}, ${tight.champion} and ${tight.runnerUp} finished on ${ch.points} and ${ru.points} points; ${tight.champion}'s goal difference was ${ch.goal_difference > 0 ? "+" : ""}${ch.goal_difference} against ${ru.goal_difference > 0 ? "+" : ""}${ru.goal_difference}. ` +
      `At the other extreme ${wide.champion} won ${wide.season} by ${wide.margin} points over ${wide.runnerUp}.`,
      `Margin is the champion's points minus the runner-up's points. In ${races.filter((r) => r.margin <= 3).length} of ${races.length} seasons it was 3 points or fewer, one win's worth.`],
    chart: { type: "bar", data: { labels: races.map((r) => r.season), datasets: [{ label: "Winning margin (points)", data: races.map((r) => r.margin), backgroundColor: races.map((r) => (r === tight ? palette[1] : r === wide ? palette[3] : "#00ff8599")) }] }, options: lineOpts({ y: { title: { display: true, text: "Points ahead of 2nd place" } } }) },
    caption: "Source: final_tables.csv. Pink = closest race, gold = widest margin.",
  });

  // 6 cards
  const cardSeasons = seasonStats.filter((s) => s.cardCoverage > 0.9);
  const redPeak = max(cardSeasons, (s) => s.redPerGame), redLast = cardSeasons[cardSeasons.length - 1];
  const yelPeak = max(cardSeasons, (s) => s.yellowPerGame);
  add({
    title: `Red cards fell from ${dec(redPeak.redPerGame)} a game in ${redPeak.season} to ${dec(redLast.redPerGame)} in ${redLast.season}, while yellows hit a record ${dec(yelPeak.yellowPerGame)} in ${yelPeak.season}`,
    body: [`Referees show far more yellow cards than they used to, but fewer players are sent off. Yellow cards per game rose from ${dec(cardSeasons[0].yellowPerGame)} in ${cardSeasons[0].season} to a peak of ${dec(yelPeak.yellowPerGame)} in ${yelPeak.season}; red cards were ${dec(cardSeasons[0].redPerGame)} per game then and ${dec(redLast.redPerGame)} in ${redLast.season}.`,
      `Card data exists for every match from ${cardSeasons[0].season} on, so earlier seasons are left out. Cards per game is total yellow (or red) cards, both teams combined, divided by matches.`],
    chart: { type: "line", data: { labels: cardSeasons.map((s) => s.season), datasets: [
      { label: "Yellow cards per game", data: cardSeasons.map((s) => +s.yellowPerGame.toFixed(3)), borderColor: palette[3], yAxisID: "y", tension: .3, pointRadius: 2 },
      { label: "Red cards per game", data: cardSeasons.map((s) => +s.redPerGame.toFixed(3)), borderColor: palette[1], yAxisID: "y2", tension: .3, pointRadius: 2 }] },
      options: { responsive: true, aspectRatio: 1.6, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { title: { display: true, text: "Yellow / game" } }, y2: { position: "right", grid: { display: false }, title: { display: true, text: "Red / game" } } } } },
    caption: "Source: matches.csv — home and away yellow and red cards.",
  });

  // 7 upsets
  const ups = C.upsets(matches, 10);
  const u0 = ups[0];
  add({
    title: `The biggest upset on record: ${u0.winner} beat ${u0.loser} ${u0.winnerScore} ${u0.winnerAway ? "away from home" : "at home"}, at bookmaker odds of ${dec(u0.odds, 1)}`,
    body: [`Using bookmaker odds, the ten greatest surprises since 2000–01 all share one feature: a big club beaten by a side the bookmakers gave almost no chance. ` +
      `${ups.filter((u) => u.loser === "Manchester City" || u.loser === "Manchester United").length} of the ten victims are Manchester City or Manchester United. The longest odds were ${dec(u0.odds, 1)} (decimal) for ${u0.winner} on ${u0.date}.`,
      `Odds are decimal Bet365 prices (or the average of several bookmakers when Bet365 is missing) for the team that won; a decimal price of ${dec(u0.odds, 0)} means a ${pct(100 / u0.odds, 1)} implied chance. Odds exist from 2000–01, so earlier matches can't be ranked.`],
    chart: { type: "bar", data: { labels: ups.map((u) => `${PL.short(u.winner)} v ${PL.short(u.loser)} (${u.date.slice(0, 4)})`), datasets: [{ label: "Decimal odds on the winner", data: ups.map((u) => u.odds), backgroundColor: ups.map((u) => clubColor(u.winner)) }] }, options: { indexAxis: "y", responsive: true, aspectRatio: 1.3, plugins: { legend: { display: false } } } },
    caption: "Source: matches.csv — odds_home / odds_away for the winning side.",
  });

  // 8 squad rotation
  const squad = C.squadSizes(pm);
  const sqHigh = max(squad, (s) => s.avgPlayersUsed), sqLow = min(squad, (s) => s.avgPlayersUsed);
  add({
    title: `Clubs used an average of ${dec(sqHigh.avgPlayersUsed, 1)} players in ${sqHigh.season}, up from ${dec(sqLow.avgPlayersUsed, 1)} in ${sqLow.season}`,
    body: [`Squad rotation has increased. Over ${squad.length} seasons of player data, the average club used between ${dec(sqLow.avgPlayersUsed, 1)} (${sqLow.season}) and ${dec(sqHigh.avgPlayersUsed, 1)} (${sqHigh.season}) different players in the league. ` +
      `That is about ${dec(sqHigh.avgPlayersUsed - sqLow.avgPlayersUsed, 1)} extra players a season.`,
      `A player counts for a club in a season if he played at least one minute for that club. The average is over all ${squad[0].clubs} clubs in each season's player table.`],
    chart: { type: "bar", data: { labels: squad.map((s) => s.season), datasets: [{ label: "Average players used per club", data: squad.map((s) => +s.avgPlayersUsed.toFixed(2)), backgroundColor: "#04f5ffaa" }] }, options: lineOpts({ y: { min: 20, title: { display: true, text: "Players used" } } }) },
    caption: "Source: player_matches.csv — distinct players with at least one minute, per club per season.",
  });

  // 9 London share
  const cps = C.clubsPerSeason(matches);
  const city = Object.fromEntries(teams.map((t) => [t.name, t.city]));
  const london = cps.map((c) => ({ season: c.season, n: c.clubs.filter((x) => city[x] === "London").length, of: c.clubs.length }));
  const lMax = max(london, (l) => l.n / l.of);
  const lSeasons = london.filter((l) => l.n / l.of === lMax.n / lMax.of);
  add({
    title: `London now supplies ${london[london.length - 1].n} of the ${london[london.length - 1].of} clubs, ${lMax.n / lMax.of === london[london.length - 1].n / london[london.length - 1].of ? "its highest share" : "close to its peak share"} in Premier League history`,
    body: [`London clubs made up ${london[0].n} of ${london[0].of} (${pct(100 * london[0].n / london[0].of, 0)}) in ${london[0].season}. The share peaked at ${lMax.n} of ${lMax.of} (${pct(100 * lMax.n / lMax.of, 0)}) in ${lSeasons.length > 1 ? `${lSeasons[0].season} to ${lSeasons[lSeasons.length - 1].season}` : lSeasons[0].season}. ` +
      `The league's centre of gravity sits in the capital and the northwest; the club map on this site shows where every club plays.`,
      `A club counts as a London club when its ground's city in teams.json is London. Clubs per season come from the matches actually played.`],
    chart: { type: "bar", data: { labels: london.map((l) => l.season), datasets: [{ label: "London clubs", data: london.map((l) => l.n), backgroundColor: "#ffc83dcc" }] }, options: lineOpts({ y: { min: 0, ticks: { stepSize: 1 }, title: { display: true, text: "London clubs in the league" } } }) },
    caption: "Source: matches.csv (clubs per season) and teams.json (city).",
  });

  // 10 ground moves
  const moves = C.groundMoves(teams);
  const blocks = [[1992, 1996], [1997, 2001], [2002, 2006], [2007, 2011], [2012, 2016], [2017, 2021], [2022, 2026]];
  const blockCounts = blocks.map(([a, b]) => moves.filter((m) => m.year >= a && m.year <= b).length);
  const early = moves.filter((m) => m.year <= 2006).length;
  add({
    title: `Clubs have made ${moves.length} permanent ground moves since 1992, ${early} of them by 2006`,
    body: [`The Taylor Report's all-seater rules pushed clubs into new stadiums in the 1990s and 2000s: Middlesbrough (1995), Sunderland and Derby (1997), Southampton (2001), Manchester City (2003) and Arsenal (2006), among others. ` +
      `The most recent moves were West Ham (2016), Tottenham (2019), Brentford (2020) and Everton (${moves.filter((m) => m.club === "Everton").map((m) => m.year).join("")}).`,
      `Counted: every change of home ground between 1992 and 2026 recorded in teams.json, excluding temporary ground-shares (such as Tottenham at Wembley in 2017–19). A club returning to its previous ground is not counted as a move.`],
    chart: { type: "bar", data: { labels: blocks.map(([a, b]) => `${a}–${String(b).slice(2)}`), datasets: [{ label: "Ground moves", data: blockCounts, backgroundColor: "#b388ffcc" }] }, options: lineOpts({ y: { min: 0, ticks: { stepSize: 1 }, title: { display: true, text: "Ground moves" } } }) },
    caption: "Source: teams.json — stadium timeline of every club.",
  });

  // 11 promoted clubs
  const po = C.promotionOutcomes(seasons);
  const down = po.filter((p) => p.relegatedFirstSeason).length;
  const perSeason = C.byKey(po, (p) => p.firstSeason);
  const poSeasons = [...perSeason.keys()];
  add({
    title: `${down} of ${po.length} promoted clubs (${pct(100 * down / po.length, 0)}) were relegated straight away`,
    body: [`Promotion is risky. Of ${po.length} club-promotions from 1992–93 to 2024–25, ${down} ended with relegation in the first Premier League season and ${po.length - down} survived. ` +
      `${seasons.length} seasons produced ${C.sum(seasons, (s) => s.promoted.length)} promotions in total; the 2025–26 promotions (Coventry, Ipswich, Hull) are still to play out.`,
      `For each season's promoted clubs, we check whether the club appears in the next season's relegated list. Seasons with 22 clubs promoted more clubs.`],
    chart: { type: "bar", data: { labels: poSeasons, datasets: [
      { label: "Survived", data: poSeasons.map((s) => perSeason.get(s).filter((p) => !p.relegatedFirstSeason).length), backgroundColor: "#00ff85cc" },
      { label: "Relegated at once", data: poSeasons.map((s) => perSeason.get(s).filter((p) => p.relegatedFirstSeason).length), backgroundColor: "#ff2d78cc" }] },
      options: { responsive: true, aspectRatio: 1.6, plugins: { legend: { display: true } }, scales: { x: { stacked: true, ticks: { maxTicksLimit: 9 } }, y: { stacked: true, ticks: { stepSize: 1 }, title: { display: true, text: "Promoted clubs" } } } } },
    caption: "Source: seasons.json — promoted and relegated lists for every season.",
  });

  // 12 golden boot nationalities
  const gb = d.awards.awards.filter((a) => a.award === "golden_boot");
  const dec10 = (a) => Math.floor(parseInt(a.season, 10) / 10) * 10;
  const decades = [1990, 2000, 2010, 2020];
  const eng = decades.map((x) => gb.filter((a) => dec10(a) === x && a.nationality === "England").length);
  const oth = decades.map((x) => gb.filter((a) => dec10(a) === x && a.nationality !== "England").length);
  add({
    title: `English players won ${eng[0]} of ${eng[0] + oth[0]} Golden Boots in the 1990s, but only ${eng[3]} of ${eng[3] + oth[3]} in the 2020s`,
    body: [`The top scorer used to be English: ${eng[0]} of the ${eng[0] + oth[0]} Golden Boot wins in the 1990s. In the 2000s the figure was ${eng[1]} of ${eng[1] + oth[1]}. ` +
      `Overall, ${C.sum(eng)} of ${C.sum(eng) + C.sum(oth)} Golden Boots went to English players and ${C.sum(oth)} to players from other countries.`,
      `Golden Boots are counted per winner, so a shared award in the same season counts once for each player. Nationality is from the Premier League's award records. The 2020s cover 2020–21 to 2025–26.`],
    chart: { type: "bar", data: { labels: decades.map((x) => `${x}s`), datasets: [{ label: "English winners", data: eng, backgroundColor: "#ff2d78cc" }, { label: "Winners from other countries", data: oth, backgroundColor: "#04f5ffcc" }] }, options: { responsive: true, aspectRatio: 1.5, plugins: { legend: { display: true } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { stepSize: 2 } } } } },
    caption: "Source: awards.json — Premier League Golden Boot winners by season.",
  });

  // 13 top scorers
  const totals = C.playerTotals(pm).sort((a, b) => b.goals - a.goals).slice(0, 10);
  const t0 = totals[0];
  const hl = [...totals].sort((a, b) => b.goals / b.minutes - a.goals / a.minutes)[0];
  add({
    title: `${t0.name} leads the 2016–17 to 2025–26 scoring charts with ${t0.goals} goals; ${hl.name} scores fastest, a goal every ${int(90 * hl.minutes / (90 * hl.goals))} minutes`,
    body: [`${totals.slice(0, 3).map((p) => `${p.name} (${p.goals})`).join(", ")} head a list built from ${int(pm.length)} appearances. ` +
      `${hl.name} has ${hl.goals} goals in ${int(hl.minutes)} minutes, ${dec(90 * hl.goals / hl.minutes, 2)} goals per 90 minutes — the best rate among the top ten.`,
      `Goals are summed over every match a player appeared in during 2016–17 to 2025–26 (own goals not included). Goals per 90 minutes is goals divided by minutes played, times 90.`],
    chart: { type: "bar", data: { labels: totals.map((p) => p.name), datasets: [{ label: "Goals 2016–17 to 2025–26", data: totals.map((p) => p.goals), backgroundColor: palette[0] + "cc" }] }, options: { indexAxis: "y", responsive: true, aspectRatio: 1.4, plugins: { legend: { display: false } } } },
    caption: "Source: player_matches.csv — goals by player, one row per appearance.",
  });

  // 14 Champions League winners by country
  const uclBy = {};
  for (const s of d.honours) uclBy[s.champions_league.winner_country] = (uclBy[s.champions_league.winner_country] || 0) + 1;
  const uclList = Object.entries(uclBy).sort((a, b) => b[1] - a[1]);
  const engRank = uclList.findIndex((x) => x[0] === "England") + 1;
  const engWins = d.honours.filter((s) => s.champions_league.winner_country === "England").map((s) => `${s.champions_league.winner} (${s.season})`);
  add({
    title: `English clubs have won the Champions League ${uclBy.England} times since 1992–93, ${engRank === 1 ? "more than any other country" : engRank === 2 ? "second only to " + uclList[0][0] : "behind " + uclList.slice(0, engRank - 1).map((x) => x[0]).join(" and ")}`,
    body: [`${uclList.map(([c, n]) => `${c} ${n}`).slice(0, 4).join(", ")}: that is how the ${d.honours.length} European Cups since the Premier League began are shared. English winners: ${engWins.join(", ")}.`,
      `Counted by the country of the winning club in each season's final, from the list of Champions League finals. Season labels follow the Premier League season in which the final was played.`],
    chart: { type: "bar", data: { labels: uclList.map((x) => x[0]), datasets: [{ label: "Champions League wins since 1992–93", data: uclList.map((x) => x[1]), backgroundColor: uclList.map((x) => (x[0] === "England" ? "#ff2d78cc" : "#8f7bb8aa")) }] }, options: { responsive: true, aspectRatio: 1.5, plugins: { legend: { display: false } }, scales: { y: { ticks: { stepSize: 2 } } } } },
    caption: "Source: honours.json — Champions League finals by season.",
  });

  // ---------- render sections ----------
  const host = document.getElementById("sections");
  host.innerHTML = sections.map((s, i) => `
    <section class="section" id="finding-${i + 1}">
      <div><div class="num">FINDING ${String(i + 1).padStart(2, "0")}</div><h2>${esc(s.title)}</h2>${s.body.map((p) => `<p>${p}</p>`).join("")}</div>
      <div class="chartbox"><canvas id="chart-${i + 1}" role="img" aria-label="${esc(s.title)}"></canvas><div class="cap">${esc(s.caption)}</div></div>
    </section>`).join("");
  sections.forEach((s, i) => charts.push(new Chart(document.getElementById(`chart-${i + 1}`), s.chart)));

  // ---------- season-by-season winners table (extra) ----------
  const champByS = Object.fromEntries(seasons.map((s) => [s.season, s]));
  const raceByS = Object.fromEntries(races.map((r) => [r.season, r]));
  const rows = d.honours.map((h) => {
    const wc = h.world_cup ? `${esc(h.world_cup.winner)} (${h.world_cup.year})` : "–";
    const bd = h.ballon_dor.player ? esc(h.ballon_dor.player) : `<span class="muted">${esc(h.ballon_dor.note)}</span>`;
    return `<tr><td>${h.season}</td><td><b>${esc(champByS[h.season].champion)}</b></td><td>${esc(raceByS[h.season].runnerUp)}</td><td>${esc(h.champions_league.winner)}</td><td>${esc(h.europa_league.winner)}</td><td>${bd}</td><td>${wc}</td></tr>`;
  }).join("");
  document.getElementById("honours").innerHTML = `
    <div class="num">EVERY SEASON AT A GLANCE</div><h2>The Premier League champion and the world's other big winners, year by year</h2>
    <p>The Premier League champion and runner-up for each season next to that year's UEFA Champions League winner, UEFA Cup / Europa League winner, Ballon d'Or recipient (the award year in which the season ends) and FIFA World Cup winner (played in the summer after the season).</p>
    <div class="chartbox" style="max-height:520px;overflow:auto"><table class="plain"><thead><tr><th>Season</th><th>Premier League</th><th>Runner-up</th><th>Champions League</th><th>UEFA Cup / Europa League</th><th>Ballon d'Or</th><th>World Cup</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  // ---------- closing: about the data (all counts computed) ----------
  const nPromoted = C.sum(seasons, (s) => s.promoted.length);
  const noMin = pm.filter((r) => !(r.minutes > 0)).length;
  const tm = d.teamMatches;
  document.getElementById("dataset").innerHTML = `
    <h2>About the data</h2>
    <p>This site is built from open data. Everything on it can be rebuilt from the scripts in the repository.</p>
    <ul>
      <li><b>The main data set — <code>player_matches.csv</code></b>: one row is one player in one Premier League match he played in (at least one minute), ${int(pm.length)} rows across ${new Set(pm.map((r) => r.season)).size} seasons (2016–17 to 2025–26), ${int(new Set(pm.map((r) => r.player_id)).size)} players and ${new Set(pm.map((r) => r.team)).size} clubs.
        Columns include season, matchweek, date, player, position, team, opponent, home or away, score, minutes, goals, assists, clean sheet, saves, cards and expected goals and assists (from 2022–23). It comes from the public Premier League data saved each gameweek in the open vaastav archive; fantasy-game columns (points, prices, bonus) were dropped.</li>
      <li><b>Matches — <code>matches.csv</code> and <code>team_matches.csv</code></b>: ${int(matches.length)} matches, one row per match and ${int(tm.length)} rows with one per team per match, plus the league table after every game. 1993–94 onward from football-data.co.uk; 1992–93 from the footballcsv project. Shots, fouls, cards, referees and odds exist only from 2000–01.</li>
      <li><b>Final tables, seasons, awards, honours, clubs</b>: ${int(finalTables.length)} official table rows, ${seasons.length} seasons (${int(nPromoted)} promotions), ${int(d.awards.awards.length)} award records, European and World Cup winners, and ${teams.length} club histories with ${int(C.sum(teams, (t) => t.stadiums.length))} stadium entries, all from Wikipedia (CC BY-SA 4.0).</li>
      <li><b>Rows dropped</b>: player rows with zero minutes (the archive lists every player every gameweek, including those who did not play) are removed (${int(noMin)} remain in the final file); 6 duplicate rows for one 2025–26 player who was entered twice in the source were dropped. Seasons before 2016–17 have no player-level data, and 1992–93 has no shots, cards or odds.</li>
      <li><b>Matchweek</b> means a club's nth game of the season. Every club has played the same number of games at game n, so the table at game n is a fair comparison. Points deductions (Middlesbrough 1996–97, Portsmouth 2009–10, Everton and Nottingham Forest 2023–24) are applied from the date they took effect, and the final points match the official tables.</li>
      <li><b>How the numbers are computed</b>: goals per game = goals ÷ matches; home win % = home wins ÷ matches; cards per game = (home + away cards) ÷ matches with card data; margin = champion points − runner-up points; safety points = points of the last club not relegated; goals per 90 = goals ÷ minutes × 90; players used = distinct players with at least one minute for a club in a season. Each is calculated by the same code (<code>assets/js/calc.js</code>) on this page, the dashboard and the check script <code>tests/check_numbers.js</code>.</li>
      <li><b>Checks</b>: every club name matches one official list; the number of matches is exactly 3 × 462 + 31 × 380; every season's champion and relegated clubs agree with the official record; the final points computed from results equal the official final tables; every player row links to a real match with a matching score.</li>
    </ul>`;
  document.getElementById("report-root").hidden = false;
  return charts;
}
