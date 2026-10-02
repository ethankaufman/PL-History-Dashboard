/* Calculations shared by the report, the dashboard and the number checker (scripts run under Node too).
 * Every number the site shows comes from these functions applied to the files in /data.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const has = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(v);
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const avg = (arr) => (arr.length ? sum(arr) / arr.length : null);
  const byKey = (rows, keyFn) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const seasonStart = (s) => parseInt(String(s).slice(0, 4), 10);
  const bySeason = (a, b) => seasonStart(a) - seasonStart(b);

  /** Per-season totals from the match table (one row per match). */
  function seasonStats(matches) {
    const out = [];
    for (const [season, ms] of byKey(matches, (m) => m.season)) {
      const goals = sum(ms, (m) => m.home_goals + m.away_goals);
      const cardMatches = ms.filter((m) => has(m.home_yellow) && has(m.away_yellow));
      const shotMatches = ms.filter((m) => has(m.home_shots) && has(m.away_shots));
      out.push({
        season,
        matches: ms.length,
        goals,
        goalsPerGame: goals / ms.length,
        homeWinPct: (100 * ms.filter((m) => m.result === "H").length) / ms.length,
        drawPct: (100 * ms.filter((m) => m.result === "D").length) / ms.length,
        awayWinPct: (100 * ms.filter((m) => m.result === "A").length) / ms.length,
        cardCoverage: cardMatches.length / ms.length,
        yellowPerGame: cardMatches.length ? sum(cardMatches, (m) => m.home_yellow + m.away_yellow) / cardMatches.length : null,
        redPerGame: cardMatches.length ? sum(cardMatches, (m) => (m.home_red || 0) + (m.away_red || 0)) / cardMatches.length : null,
        shotsPerGame: shotMatches.length ? sum(shotMatches, (m) => m.home_shots + m.away_shots) / shotMatches.length : null,
      });
    }
    return out.sort((a, b) => bySeason(a.season, b.season));
  }

  /** How many titles each club has won (from the seasons list). */
  function titleCounts(seasons) {
    const c = {};
    for (const s of seasons) c[s.champion] = (c[s.champion] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  /** Per-season title race numbers from the official final tables. */
  function titleRaces(finalTables) {
    const out = [];
    for (const [season, rows] of byKey(finalTables, (r) => r.season)) {
      rows.sort((a, b) => a.position - b.position);
      const drop = season === "1994–95" ? 4 : 3;
      const survivor = rows[rows.length - drop - 1];
      out.push({
        season,
        champion: rows[0].team, championPoints: rows[0].points,
        runnerUp: rows[1].team, runnerUpPoints: rows[1].points,
        margin: rows[0].points - rows[1].points,
        goalDiffGap: rows[0].goal_difference - rows[1].goal_difference,
        safetyClub: survivor.team, safetyPoints: survivor.points,
        teams: rows.length,
      });
    }
    return out.sort((a, b) => bySeason(a.season, b.season));
  }

  /** The biggest upsets: matches won by the side the bookmakers rated least likely to win. */
  function upsets(matches, n) {
    const rows = [];
    for (const m of matches) {
      if (!has(m.odds_home) || m.result === "D") continue;
      const winnerIsHome = m.result === "H";
      rows.push({
        season: m.season, date: m.date, winner: winnerIsHome ? m.home : m.away, loser: winnerIsHome ? m.away : m.home,
        score: `${m.home_goals}–${m.away_goals}`, odds: winnerIsHome ? m.odds_home : m.odds_away, home: m.home, away: m.away,
      });
    }
    return rows.sort((a, b) => b.odds - a.odds).slice(0, n);
  }

  /** Players used per club per season (a player counts if he played at least one minute). */
  function squadSizes(playerMatches) {
    const perClubSeason = new Map();
    for (const r of playerMatches) {
      const k = r.season + "|" + r.team;
      if (!perClubSeason.has(k)) perClubSeason.set(k, new Set());
      perClubSeason.get(k).add(r.player_id);
    }
    const perSeason = new Map();
    for (const [k, set] of perClubSeason) {
      const season = k.split("|")[0];
      if (!perSeason.has(season)) perSeason.set(season, []);
      perSeason.get(season).push(set.size);
    }
    return [...perSeason].map(([season, sizes]) => ({ season, avgPlayersUsed: avg(sizes), clubs: sizes.length })).sort((a, b) => bySeason(a.season, b.season));
  }

  /** Career totals by player across the player-match table. */
  function playerTotals(playerMatches) {
    const m = new Map();
    for (const r of playerMatches) {
      let p = m.get(r.player_id);
      if (!p) m.set(r.player_id, (p = { id: r.player_id, name: r.player, position: r.position, appearances: 0, minutes: 0, goals: 0, assists: 0 }));
      p.appearances++; p.minutes += r.minutes; p.goals += r.goals; p.assists += r.assists;
    }
    return [...m.values()];
  }

  /** Clubs that played in each season (taken from the match table) and how many are from London. */
  function clubsPerSeason(matches) {
    const m = new Map();
    for (const r of matches) {
      if (!m.has(r.season)) m.set(r.season, new Set());
      m.get(r.season).add(r.home); m.get(r.season).add(r.away);
    }
    return [...m].map(([season, set]) => ({ season, clubs: [...set] })).sort((a, b) => bySeason(a.season, b.season));
  }

  /** Promoted clubs and whether they went straight back down the following season. */
  function promotionOutcomes(seasons) {
    const sorted = [...seasons].sort((a, b) => bySeason(a.season, b.season));
    const out = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const goneDown = new Set(sorted[i + 1].relegated);
      for (const club of sorted[i].promoted) {
        out.push({ promotedAfter: sorted[i].season, firstSeason: sorted[i + 1].season, club, relegatedFirstSeason: goneDown.has(club) });
      }
    }
    return out;
  }

  /** Permanent ground moves since 1992 (temporary ground-shares are left out). */
  function groundMoves(teams) {
    const moves = [];
    for (const t of teams) {
      let prev = null;
      for (const s of t.stadiums) {
        if (s.temporary) continue;
        if (prev && s.from && s.from >= 1992 && s.name !== prev.name) moves.push({ club: t.name, year: s.from, from: prev.name, to: s.name });
        prev = s;
      }
    }
    return moves.sort((a, b) => a.year - b.year);
  }

  return { has, sum, avg, byKey, seasonStart, bySeason, seasonStats, titleCounts, titleRaces, upsets, squadSizes, playerTotals, clubsPerSeason, promotionOutcomes, groundMoves };
});
