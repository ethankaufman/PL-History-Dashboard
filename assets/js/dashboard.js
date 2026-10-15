/* Dashboard: loads the data files in the browser and recalculates everything when a filter or switch changes. */
(async function () {
  PL.renderNav("dashboard");
  PL.chartDefaults();
  const { int, dec, pct, esc, clubColor, palette } = PL;
  const C = Calc;
  const $ = (id) => document.getElementById(id);
  let d, failed = false;
  try {
    d = await PL.load(["appearances", "matches", "teamMatches", "finalTables", "seasons", "awards", "honours", "teams", "players", "transfers", "domestic", "records", "playerSeasons", "cityCase"], (p) => {
      if (failed) return;
      $("load-bar").style.width = Math.round(p * 100) + "%"; $("load-text").textContent = `Loading the data… ${Math.round(p * 100)}%`;
    });
  } catch (e) { failed = true; $("load-text").innerHTML = `Couldn't load the data: ${esc(e.message)} <button class="btn small" onclick="location.reload()">Retry</button>`; return; }
  $("loading").remove(); $("app").hidden = false;
  PL.setCase(d.cityCase);   // Manchester City: seasons covered by the Premier League charges get an asterisk
  $("city-note").innerHTML = `<summary>${PL.star(true)} <b>${PL.caseData.club}</b> figures from ${PL.caseData.first_season} to ${PL.caseData.last_season} carry an asterisk: the club was found guilty of 114 of 115 Premier League charges on 29 September 2026. Read the note.</summary>${PL.caseBox()}`;
  $("city-note").hidden = false;

  // The slim appearance file holds only ids; rebuild each full row by joining it with the match, club and player tables.
  const ps = d.playerSeasons;
  const matchById = new Map(d.matches.map((m) => [m.match_id, m]));
  const gameNo = new Map(d.teamMatches.map((r) => [r.match_id + "|" + r.team, r.game_no]));
  const info = new Map(), positionOf = new Map();
  for (const r of ps) {
    if (!info.has(r.player_id)) info.set(r.player_id, { name: r.player, nationality: r.nationality || "Unknown" });
    positionOf.set(r.player_id + "|" + r.season, r.position || "Unknown");
  }
  const pm = d.appearances.map((r) => {
    const m = matchById.get(r.match_id), home = r.side === "H", team = home ? m.home : m.away, who = info.get(r.player_id) || { name: "Unknown player", nationality: "Unknown" };
    return { match_id: r.match_id, season: m.season, team, opponent: home ? m.away : m.home, venue: home ? "Home" : "Away", game_no: gameNo.get(r.match_id + "|" + team),
      player_id: r.player_id, player: who.name, nationality: who.nationality, position: positionOf.get(r.player_id + "|" + m.season) || "Unknown",
      minutes: r.minutes || 0, goals: r.goals || 0, assists: r.assists || 0, own_goals: r.own_goals || 0, yellow_cards: r.yellow_cards || 0, red_cards: r.red_cards || 0,
      clean_sheet: (home ? m.away_goals : m.home_goals) === 0 && r.minutes === 90 ? 1 : 0 };
  });
  // second data set: season totals for every player, every club, every season since 1992-93 (the Premier League's own season statistics)
  for (const r of ps) { r.n = r.appearances; r.team = r.club; r.clean_sheet = r.clean_sheets; r.minutes = r.minutes || 0; r.nationality = r.nationality || "Unknown"; r.position = r.position || "Unknown"; }
  const DATASETS = { matches: { rows: pm, label: "Every appearance, 1992–93 to 2025–26" }, seasons: { rows: ps, label: "Season totals (official statistics)" } };
  let dataset = "matches";
  const seasonsOf = (rows) => [...new Set(rows.map((r) => r.season))].sort(C.bySeason);
  const seasonList = seasonsOf(pm);
  const clubList = [...new Set(pm.map((r) => r.team))].sort();
  const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
  const optionHtml = (items, all) => (all ? `<option value="">${all}</option>` : "") + items.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");

  // ---------------- sections and views ----------------
  // Four sections, each with a few views. A view is one panel; panels are only built the first time you open them.
  const SECTIONS = [
    { id: "now", label: "This season", views: [["nowtable", "Table"], ["nowstats", "Season stats"], ["nowmatches", "Matches by week"]] },
    { id: "players", label: "Players", views: [["explore", "Explore the numbers"], ["players", "Player profiles"]] },
    { id: "clubs", label: "Clubs", views: [["compare", "Compare clubs"], ["clubrecords", "Club records & trophies"], ["transfers", "Signings & departures"]] },
    { id: "seasons", label: "Seasons", views: [["race", "Table race"], ["seasons", "Season summary & awards"]] },
    { id: "records", label: "League records", views: [["records", "Record books & all-time table"]] },
  ];
  const inited = { explore: true };
  const initFns = {};
  const sectionOf = (view) => SECTIONS.find((sec) => sec.views.some((v) => v[0] === view));
  function showView(view) {
    const sec = sectionOf(view);
    $("sectiontabs").innerHTML = SECTIONS.map((x) => `<button class="sectiontab" role="tab" data-section="${x.id}" aria-selected="${x === sec}">${x.label}</button>`).join("");
    $("subnav").innerHTML = sec.views.length > 1 ? sec.views.map(([id, label]) => `<button class="pill" role="tab" data-view="${id}" aria-selected="${id === view}">${label}</button>`).join("") : "";
    $("sectiontabs").querySelectorAll(".sectiontab").forEach((b) => b.addEventListener("click", () => showView(SECTIONS.find((x) => x.id === b.dataset.section).views[0][0])));
    $("subnav").querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
    document.querySelectorAll(".panel").forEach((pn) => (pn.hidden = pn.id !== "panel-" + view));
    if (!inited[view]) { inited[view] = true; initFns[view](); }
    history.replaceState(null, "", "#" + view);
  }

  // =====================================================================
  // EXPLORE: filters, summary numbers, four charts with switches, table, reset
  // =====================================================================
  const FILTERS = [
    { id: "f-data", label: "Data", html: Object.entries(DATASETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join(""), def: "matches", wide: true, primary: true },
    { id: "f-from", label: "From season", html: optionHtml(seasonList), def: seasonList[0], primary: true },
    { id: "f-to", label: "To season", html: optionHtml(seasonList), def: seasonList[seasonList.length - 1], primary: true },
    { id: "f-club", label: "Club", html: optionHtml(clubList, "All clubs"), def: "", primary: true },
    { id: "f-opp", label: "Opponent", html: optionHtml(clubList, "All opponents"), def: "", matchOnly: true },
    { id: "f-pos", label: "Position", html: optionHtml(positions, "All positions"), def: "", primary: true },
    { id: "f-venue", label: "Venue", html: optionHtml(["Home", "Away"], "Home and away"), def: "", matchOnly: true },
    { id: "f-mw1", label: "Matchweek from", html: null, def: 1, type: "number", matchOnly: true },
    { id: "f-mw2", label: "Matchweek to", html: null, def: 42, type: "number", matchOnly: true },
    { id: "f-player", label: "Player name contains", html: null, def: "", type: "search" },
  ];
  const filterHtml = (f) => `<div id="w-${f.id}" ${f.wide ? 'style="grid-column: span 2"' : ""}><label for="${f.id}">${f.label}</label>` +
    (f.html !== null ? `<select id="${f.id}">${f.html}</select>` : `<input id="${f.id}" type="${f.type}" ${f.type === "number" ? 'min="1" max="42"' : 'placeholder="e.g. Haaland"'}>`) + `</div>`;
  $("filters").innerHTML = FILTERS.filter((f) => f.primary).map(filterHtml).join("") +
    `<div><button class="btn" id="more-btn" type="button" aria-expanded="false" style="width:100%">More filters ▾</button></div>` +
    `<div><button class="btn primary" id="reset" type="button" style="width:100%">Reset all filters</button></div>` +
    `<div class="more" id="more-filters" hidden>${FILTERS.filter((f) => !f.primary).map(filterHtml).join("")}</div>`;
  $("more-btn").addEventListener("click", () => { const m = $("more-filters"); m.hidden = !m.hidden; $("more-btn").setAttribute("aria-expanded", String(!m.hidden)); $("more-btn").textContent = m.hidden ? "More filters ▾" : "Fewer filters ▴"; });
  const resetFilters = () => { $("f-data").value = "matches"; applyDataset(); FILTERS.forEach((f) => ($(f.id).value = f.def)); redrawExplore(); };
  FILTERS.forEach((f) => $(f.id).addEventListener(f.type === "search" ? "input" : "change", () => (f.id === "f-data" ? (applyDataset(), redrawExplore()) : redrawExplore())));
  $("reset").addEventListener("click", resetFilters);
  FILTERS.forEach((f) => ($(f.id).value = f.def));

  // switching data set: change the season choices, hide the filters that only make sense match by match, update the breakdowns
  function applyDataset() {
    dataset = $("f-data").value;
    const rows = DATASETS[dataset].rows, seasons = seasonsOf(rows), clubs = [...new Set(rows.map((r) => r.team))].sort();
    $("f-from").innerHTML = optionHtml(seasons); $("f-to").innerHTML = optionHtml(seasons);
    $("f-from").value = seasons[0]; $("f-to").value = seasons[seasons.length - 1];
    $("f-club").innerHTML = optionHtml(clubs, "All clubs");
    FILTERS.filter((f) => f.matchOnly).forEach((f) => { $("w-" + f.id).hidden = dataset !== "matches"; $(f.id).value = f.def; });
    const allowed = Object.keys(BREAKDOWNS).filter((k) => (dataset === "seasons" ? k !== "opponent" && k !== "venue" && k !== "matchweek" : true));
    const fill = (id, keep, fallback) => { $(id).innerHTML = allowed.map((k) => `<option value="${k}">${BREAKDOWNS[k].label}</option>`).join(""); $(id).value = allowed.includes(keep) ? keep : fallback; };
    CHARTS.forEach((c) => fill(c.id + "-b", $(c.id + "-b").value, c.breakdown === "matchweek" ? "season" : c.breakdown));
    fill("tbl-group", $("tbl-group").value, "player");
    $("data-note").textContent = dataset === "matches"
      ? "One row per player per match he played in: minutes, goals, assists and cards, from the official match records of all 13,166 matches."
      : "One row per player per club per season: the Premier League's own season statistics, which every match-by-match total is checked against.";
  }
  function filtered() {
    const from = C.seasonStart($("f-from").value), to = C.seasonStart($("f-to").value);
    const club = $("f-club").value, opp = $("f-opp").value, pos = $("f-pos").value, venue = $("f-venue").value;
    const mw1 = +$("f-mw1").value || 1, mw2 = +$("f-mw2").value || 99, q = $("f-player").value.trim().toLowerCase();
    const match = dataset === "matches";
    return DATASETS[dataset].rows.filter((r) => {
      const s = C.seasonStart(r.season);
      return s >= from && s <= to && (!club || r.team === club) && (!pos || r.position === pos) && (!q || r.player.toLowerCase().includes(q)) &&
        (!match || ((!opp || r.opponent === opp) && (!venue || r.venue === venue) && r.game_no >= mw1 && r.game_no <= mw2));
    });
  }

  const MIN_RATE_MINUTES = 900;
  const MEASURES = {
    appearances: { label: "Appearances", val: (g) => g.n },
    players: { label: "Different players", val: (g) => g.ids.size },
    minutes: { label: "Minutes played (where recorded)", val: (g) => g.minutes },
    goals: { label: "Goals", val: (g) => g.goals },
    assists: { label: "Assists", val: (g) => g.assists },
    clean_sheets: { label: "Clean sheets", val: (g) => g.cs },
    yellow: { label: "Yellow cards", val: (g) => g.yellow },
    red: { label: "Red cards", val: (g) => g.red },
    goals_per_90: { label: `Goals per 90 min (groups with ${MIN_RATE_MINUTES}+ min recorded)`, val: (g) => (g.minutes >= MIN_RATE_MINUTES ? (g.gm * 90) / g.minutes : null), rate: true },
    goals_per_app: { label: "Goals per appearance", val: (g) => (g.n ? g.goals / g.n : null), rate: true },
  };
  const BREAKDOWNS = {
    season: { label: "Season", key: (r) => r.season, order: "time" },
    matchweek: { label: "Matchweek", key: (r) => r.game_no, order: "time" },
    club: { label: "Club", key: (r) => r.team },
    opponent: { label: "Opponent", key: (r) => r.opponent },
    position: { label: "Position", key: (r) => r.position || "Unknown" },
    venue: { label: "Venue", key: (r) => r.venue },
    player: { label: "Player", key: (r) => r.player_id + "|" + r.player },
    nationality: { label: "Nationality", key: (r) => r.nationality },
  };
  function group(rows, keyFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      let g = m.get(k);
      if (!g) m.set(k, (g = { n: 0, minutes: 0, gm: 0, goals: 0, assists: 0, cs: 0, yellow: 0, red: 0, ids: new Set() }));
      if (PL.flagged(r.team, r.season)) g.star = true; g.n += r.n ?? 1; g.minutes += r.minutes; if (r.minutes > 0) g.gm += r.goals; g.goals += r.goals; g.assists += r.assists; g.cs += r.clean_sheet; g.yellow += r.yellow_cards; g.red += r.red_cards; g.ids.add(r.player_id);
    }
    return m;
  }
  const keyLabel = (k, bd) => (bd === "player" ? String(k).split("|")[1] : bd === "matchweek" ? "MW " + k : k);

  // KPIs
  function drawKpis(rows) {
    const g = [...group(rows, () => 1).values()][0] || { n: 0, minutes: 0, gm: 0, goals: 0, assists: 0, cs: 0, yellow: 0, red: 0, ids: new Set() };
    const tiles = [[int(g.n), "appearances in view"], [int(g.ids.size), "different players"], [int(g.goals), "goals"], [int(g.assists), "assists"]];
    $("kpis").innerHTML = tiles.map(([n, l]) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
  }

  // four charts, each with a measure switch and a breakdown switch
  const CHARTS = [
    { id: "c1", title: "Ranking", measure: "goals", breakdown: "club" },
    { id: "c2", title: "Trend", measure: "goals", breakdown: "season" },
    { id: "c3", title: "Share", measure: "minutes", breakdown: "position" },
    { id: "c4", title: "Top players", measure: "assists", breakdown: "player" },
  ];
  $("charts").innerHTML = CHARTS.map((c) => `<div class="card"><h3>${c.title}</h3><div class="ctls">
    <div><label for="${c.id}-m">Measure</label><select id="${c.id}-m">${Object.entries(MEASURES).map(([k, m]) => `<option value="${k}" ${k === c.measure ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></div>
    <div><label for="${c.id}-b">Broken down by</label><select id="${c.id}-b">${Object.entries(BREAKDOWNS).map(([k, b]) => `<option value="${k}" ${k === c.breakdown ? "selected" : ""}>${b.label}</option>`).join("")}</select></div></div>
    <canvas id="${c.id}"></canvas><div class="note" id="${c.id}-n"></div></div>`).join("");
  const chartObjs = {};
  CHARTS.forEach((c) => { $(c.id + "-m").addEventListener("change", () => drawChart(c, currentRows)); $(c.id + "-b").addEventListener("change", () => drawChart(c, currentRows)); });

  function drawChart(c, rows) {
    const mKey = $(c.id + "-m").value, bKey = $(c.id + "-b").value;
    const M = MEASURES[mKey], B = BREAKDOWNS[bKey];
    let items = [...group(rows, B.key)].map(([k, g]) => ({ k, label: keyLabel(k, bKey) + (bKey === "club" && g.star ? "*" : ""), v: M.val(g), g })).filter((x) => x.v !== null);
    const timeline = B.order === "time";
    if (timeline) items.sort((a, b) => (bKey === "season" ? C.bySeason(a.k, b.k) : a.k - b.k));
    else { items.sort((a, b) => b.v - a.v); items = items.slice(0, bKey === "position" || bKey === "venue" ? 10 : 12); }
    const useLine = timeline && c.id === "c2";
    const useDoughnut = !timeline && (bKey === "position" || bKey === "venue") && c.id === "c3" && !M.rate;
    const type = useDoughnut ? "doughnut" : useLine ? "line" : "bar";
    const colors = items.map((x, i) => (bKey === "club" || bKey === "opponent" ? clubColor(x.k) : palette[i % palette.length]));
    const data = { labels: items.map((x) => x.label), datasets: [{ label: M.label, data: items.map((x) => (M.rate ? +x.v.toFixed(4) : x.v)),
      backgroundColor: type === "line" ? "#00c76f33" : colors.map((cl) => cl + (type === "doughnut" ? "" : "")), borderColor: type === "line" ? palette[0] : type === "doughnut" ? "#ffffff" : colors, fill: type === "line", tension: 0.3, pointRadius: 2 }] };
    const horizontal = type === "bar" && !timeline;
    const options = { responsive: true, maintainAspectRatio: true, aspectRatio: 1.45, indexAxis: horizontal ? "y" : "x",
      plugins: { legend: { display: type === "doughnut" } }, scales: type === "doughnut" ? {} : { x: { ticks: { maxTicksLimit: horizontal ? 12 : 9 } }, y: { beginAtZero: true } } };
    if (chartObjs[c.id]) chartObjs[c.id].destroy();
    chartObjs[c.id] = new Chart($(c.id), { type, data, options });
    $(c.id + "-n").textContent = items.length ? `${B.label}: ${M.label}${timeline ? "" : ` — top ${items.length}`}${items.some((x) => String(x.label).endsWith("*")) ? " · * includes seasons covered by the Premier League charges (see the note above)" : ""}` : "No rows match the filters.";
  }

  // table
  const TBL_COLS = [["label", "Group"], ["n", "Apps"], ["minutes", "Minutes"], ["goals", "Goals"], ["assists", "Assists"], ["cs", "Clean sheets"], ["yellow", "Yellow"], ["red", "Red"], ["g90", "Goals / 90"]];
  let tblSort = { col: "goals", dir: -1 }, tblRows = [];
  $("tbl-group").innerHTML = Object.entries(BREAKDOWNS).map(([k, b]) => `<option value="${k}" ${k === "player" ? "selected" : ""}>${b.label}</option>`).join("");
  $("tbl-group").addEventListener("change", () => drawTable(currentRows));
  function drawTable(rows) {
    const bKey = $("tbl-group").value, B = BREAKDOWNS[bKey];
    tblRows = [...group(rows, B.key)].map(([k, g]) => ({ k, label: keyLabel(k, bKey) + (bKey === "club" && g.star ? "*" : ""), n: g.n, minutes: g.minutes, goals: g.goals, assists: g.assists, cs: g.cs, yellow: g.yellow, red: g.red, g90: g.minutes ? (g.gm * 90) / g.minutes : null }));
    const col = tblSort.col;
    tblRows.sort((a, b) => (col === "label" ? String(a.label).localeCompare(String(b.label), undefined, { numeric: true }) * tblSort.dir : ((a[col] ?? -1) - (b[col] ?? -1)) * tblSort.dir));
    const shown = tblRows.slice(0, 250);
    $("tbl").innerHTML = `<thead><tr>${TBL_COLS.map(([k, l]) => `<th class="${k === "label" ? "" : "num"}" data-col="${k}">${l}${tblSort.col === k ? (tblSort.dir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead><tbody>` +
      shown.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${int(r.n)}</td><td class="num">${int(r.minutes)}</td><td class="num">${int(r.goals)}</td><td class="num">${int(r.assists)}</td><td class="num">${int(r.cs)}</td><td class="num">${int(r.yellow)}</td><td class="num">${int(r.red)}</td><td class="num">${r.g90 === null ? "–" : dec(r.g90, 3)}</td></tr>`).join("") + `</tbody>`;
    $("tbl").querySelectorAll("th").forEach((th) => th.addEventListener("click", () => { const c = th.dataset.col; tblSort = { col: c, dir: tblSort.col === c ? -tblSort.dir : c === "label" ? 1 : -1 }; drawTable(currentRows); }));
    $("tbl-note").textContent = `${int(tblRows.length)} group${tblRows.length === 1 ? "" : "s"} · showing the first ${int(shown.length)} · click a column heading to sort${tblRows.some((r) => String(r.label).endsWith("*")) ? " · * includes seasons covered by the Premier League charges (see the note above)" : ""}`;
  }
  $("tbl-csv").addEventListener("click", () => {
    const csv = [TBL_COLS.map((c) => c[1]).join(",")].concat(tblRows.map((r) => TBL_COLS.map(([k]) => (k === "label" ? `"${String(r.label).replace(/"/g, '""')}"` : r[k] ?? "")).join(","))).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "premier-league-view.csv"; a.click();
  });

  let currentRows = pm;
  const noteEl = document.createElement("div"); noteEl.id = "data-note"; noteEl.className = "note"; noteEl.style.margin = "-6px 2px 14px"; $("filters").after(noteEl);
  applyDataset();
  function redrawExplore() { currentRows = filtered(); drawKpis(currentRows); CHARTS.forEach((c) => drawChart(c, currentRows)); drawTable(currentRows); }
  redrawExplore();

  // =====================================================================
  // TABLE RACE: league position matchweek by matchweek
  // =====================================================================
  initFns.race = function () {
    const tm = d.teamMatches;
    const bySeasonTeam = new Map();
    for (const r of tm) {
      if (!bySeasonTeam.has(r.season)) bySeasonTeam.set(r.season, new Map());
      const m = bySeasonTeam.get(r.season);
      if (!m.has(r.team)) m.set(r.team, []);
      m.get(r.team).push(r);
    }
    for (const m of bySeasonTeam.values()) for (const rows of m.values()) rows.sort((a, b) => a.game_no - b.game_no);
    const seasonsDesc = [...bySeasonTeam.keys()].sort((a, b) => C.bySeason(b, a));
    const root = $("panel-race");
    root.innerHTML = `<p class="intro">Watch a season unfold. The bars show the table after any matchweek; the lines show every club's position, week by week. Press play, or drag the slider.</p><div class="row"><div><label for="r-season">Season</label><select id="r-season">${optionHtml(seasonsDesc)}</select></div>
      <div class="grow"><label for="r-mw" id="r-mw-l">Matchweek</label><input id="r-mw" type="range" min="1" max="38" value="38" style="width:100%"></div>
      <div><button class="btn primary" id="r-play" type="button">▶ Play the season</button></div>
      <div><label for="r-hi">Highlight a club</label><select id="r-hi"></select></div></div>
      <p class="note">Matchweek means each club's nth game. Every club has played the same number of games at that point, so the table is a fair snapshot. Points deductions are applied from the day they took effect.</p>
      <div class="grid2"><div class="card"><h3 id="r-title1">League table race</h3><canvas id="r-race"></canvas></div>
      <div class="card"><h3>League position after every matchweek</h3><canvas id="r-bump"></canvas><div class="note" id="r-sum"></div></div></div>
      <div class="card"><h3 id="r-title2">League table</h3><div class="tablewrap"><table class="plain" id="r-table"></table></div></div>`;
    let race, bump, timer = null;
    const marker = { id: "marker", afterDatasetsDraw(ch) { const mw = +$("r-mw").value; const x = ch.scales.x.getPixelForValue(mw - 1); const { ctx, chartArea } = ch; ctx.save(); ctx.strokeStyle = "#38003c"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke(); ctx.restore(); } };
    function state() {
      const season = $("r-season").value, teams = bySeasonTeam.get(season), games = teams.values().next().value.length;
      return { season, teams, games };
    }
    function snapshot(teams, mw) {
      return [...teams].map(([team, rows]) => ({ team, row: rows[mw - 1], rows })).sort((a, b) => a.row.position - b.row.position);
    }
    function build() {
      const { season, teams, games } = state();
      $("r-mw").max = games; if (+$("r-mw").value > games) $("r-mw").value = games;
      const hi = $("r-hi"), keep = hi.value;
      hi.innerHTML = `<option value="">None</option>` + [...teams.keys()].sort().map((t) => `<option>${esc(t)}</option>`).join(""); hi.value = teams.has(keep) ? keep : "";
      const finalPts = Math.max(...[...teams.values()].map((r) => r[r.length - 1].cum_points));
      if (race) race.destroy(); if (bump) bump.destroy();
      race = new Chart($("r-race"), { type: "bar", data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] }, options: { indexAxis: "y", responsive: true, aspectRatio: 0.95, animation: { duration: 250 }, plugins: { legend: { display: false } }, scales: { x: { min: 0, max: finalPts + 2, title: { display: true, text: "Points" } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } } } });
      const labels = Array.from({ length: games }, (_, i) => i + 1);
      bump = new Chart($("r-bump"), { type: "line", data: { labels, datasets: [...teams].map(([team, rows]) => ({ label: team, data: rows.map((r) => r.position), borderColor: clubColor(team), backgroundColor: clubColor(team), pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, tension: 0.15 })) },
        options: { responsive: true, aspectRatio: 0.95, interaction: { mode: "nearest", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => "After matchweek " + i[0].label } } }, scales: { y: { reverse: true, min: 1, max: teams.size, ticks: { stepSize: 1 }, title: { display: true, text: "League position" } }, x: { title: { display: true, text: "Matchweek" }, ticks: { maxTicksLimit: 10 } } } }, plugins: [marker] });
      update();
    }
    function update() {
      const { season, teams, games } = state(), mw = +$("r-mw").value, snap = snapshot(teams, mw), hi = $("r-hi").value;
      $("r-mw-l").textContent = `Matchweek ${mw} of ${games}`;
      race.data.labels = snap.map((s) => `${s.row.position}. ${PL.short(s.team)}${PL.starText(PL.flagged(s.team, season))}`);
      race.data.datasets[0].data = snap.map((s) => s.row.cum_points);
      race.data.datasets[0].backgroundColor = snap.map((s) => clubColor(s.team) + (hi && s.team !== hi ? "44" : ""));
      race.update();
      bump.data.datasets.forEach((ds) => { const on = !hi || ds.label === hi; ds.borderWidth = hi && ds.label === hi ? 5 : 2; ds.borderColor = clubColor(ds.label) + (on ? "" : "33"); });
      bump.update("none");
      const lead = snap[0], bottom = snap[snap.length - 1];
      $("r-title1").textContent = `${season}: table after matchweek ${mw}`;
      $("r-sum").textContent = `After matchweek ${mw}, ${lead.team} lead with ${lead.row.cum_points} points; ${bottom.team} are bottom with ${bottom.row.cum_points}.` + (snap.some((x) => PL.flagged(x.team, season)) ? ` * ${PL.caseData.club} in ${season} is one of the seasons covered by the Premier League charges.` : "");
      $("r-title2").textContent = `${season} league table after matchweek ${mw}`;
      $("r-table").innerHTML = `<thead><tr><th class="num">Pos</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th></tr></thead><tbody>` +
        snap.map((s) => { const rs = s.rows.slice(0, mw); const w = rs.filter((r) => r.result === "W").length, dr = rs.filter((r) => r.result === "D").length, ga = C.sum(rs, (r) => r.goals_against);
          return `<tr><td class="num ${s.row.position === 1 ? "pos-1" : ""}">${s.row.position}</td><td>${esc(s.team)}${PL.star(PL.flagged(s.team, season))}${s.row.cum_deduction ? ` <span class="muted">(−${s.row.cum_deduction} pts)</span>` : ""}</td><td class="num">${mw}</td><td class="num">${w}</td><td class="num">${dr}</td><td class="num">${mw - w - dr}</td><td class="num">${s.row.cum_goals_for}</td><td class="num">${ga}</td><td class="num">${s.row.cum_goal_diff > 0 ? "+" : ""}${s.row.cum_goal_diff}</td><td class="num"><b>${s.row.cum_points}</b></td></tr>`; }).join("") + "</tbody>";
    }
    $("r-season").addEventListener("change", () => { stop(); build(); });
    $("r-mw").addEventListener("input", update);
    $("r-hi").addEventListener("change", update);
    function stop() { if (timer) { clearInterval(timer); timer = null; $("r-play").textContent = "▶ Play the season"; } }
    $("r-play").addEventListener("click", () => {
      if (timer) return stop();
      const games = +$("r-mw").max; if (+$("r-mw").value >= games) $("r-mw").value = 1;
      $("r-play").textContent = "❚❚ Pause";
      timer = setInterval(() => { const v = +$("r-mw").value + 1; if (v > games) return stop(); $("r-mw").value = v; update(); }, 420);
    });
    build();
  };

  // =====================================================================
  // COMPARE CLUBS
  // =====================================================================
  initFns.compare = function () {
    const root = $("panel-compare"), teamsBy = Object.fromEntries(d.teams.map((t) => [t.name, t]));
    const names = d.teams.map((t) => t.name).sort();
    const defaults = ["Arsenal", "Chelsea", "", ""];
    root.innerHTML = `<p class="intro">Pick two to four clubs to compare their records, their finishes season by season, their trophies and how they play. With exactly two clubs you also get their head-to-head.</p><div class="row">${[0, 1, 2, 3].map((i) => `<div><label for="cmp${i}">Club ${i + 1}${i > 1 ? " (optional)" : ""}</label><select id="cmp${i}">${optionHtml(names, i > 1 ? "—" : "")}</select></div>`).join("")}</div>
      <div id="cmp-cards" class="cmpgrid"></div><div id="cmp-h2h"></div>
      <div class="grid2"><div class="card"><h3>Points in each Premier League season</h3><canvas id="cmp-pts"></canvas></div>
      <div class="card"><h3>League position in each season</h3><canvas id="cmp-pos"></canvas></div></div>
      <div class="grid2"><div class="card"><h3>Playing style (100 = best of the selected clubs)</h3><canvas id="cmp-radar"></canvas><div class="note">Points per game, goals scored per game, goals conceded per game (fewer = better), win % and clean-sheet %, from every Premier League match each club played.</div></div>
      <div class="card"><h3>All-time Premier League record</h3><div class="tablewrap"><table class="plain" id="cmp-tbl"></table></div></div></div>`;
    defaults.forEach((v, i) => ($("cmp" + i).value = v));
    const charts = {};
    const seasonsAll = [...new Set(d.finalTables.map((r) => r.season))].sort(C.bySeason);
    function draw() {
      const sel = [0, 1, 2, 3].map((i) => $("cmp" + i).value).filter((v, i, a) => v && a.indexOf(v) === i);
      $("cmp-cards").innerHTML = sel.map((n) => { const t = teamsBy[n], g = t.current_ground; return `<div class="clubhead" style="border-color:${clubColor(n)}"><h3 style="color:${clubColor(n)}">${esc(n)}${PL.star(PL.isCaseClub(n))}</h3>
        <div class="muted">${esc(t.city)} · founded ${t.founded} · ${t.status === "current" ? "in the 2026–27 Premier League" : t.status === "defunct" ? "defunct" : "former Premier League club"}</div>
        <div>${g ? `Ground: <b>${esc(g.name)}</b>${g.capacity ? ` (${int(g.capacity)})` : ""}` : "Ground: none (club dissolved)"} · ${t.stadiums.filter((s) => !s.temporary).length === 1 ? "one ground" : t.stadiums.filter((s) => !s.temporary).length + " grounds"} in all</div>
        <div class="muted" style="font-size:.85rem;margin-top:4px">${esc(t.summary.split(". ")[0])}.</div></div>`; }).join("") + (sel.some(PL.isCaseClub) ? `<p class="starnote" style="grid-column:1/-1">${PL.star(true)} ${esc(PL.caseData.short)} Every total below for ${esc(PL.caseData.club)} counts the flagged seasons (${PL.caseData.first_season} to ${PL.caseData.last_season}).</p>` : "");
      // season by season
      const byClubSeason = (club) => Object.fromEntries(d.finalTables.filter((r) => r.team === club).map((r) => [r.season, r]));
      const make = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), cfg); };
      make("cmp-pts", { type: "line", data: { labels: seasonsAll, datasets: sel.map((n) => { const b = byClubSeason(n); return { label: n + PL.starText(PL.isCaseClub(n)), data: seasonsAll.map((s) => b[s]?.points ?? null), borderColor: clubColor(n), backgroundColor: clubColor(n), spanGaps: false, tension: 0.2, pointRadius: 3 }; }) }, options: { responsive: true, aspectRatio: 1.5, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { title: { display: true, text: "Points" } } } } });
      make("cmp-pos", { type: "line", data: { labels: seasonsAll, datasets: sel.map((n) => { const b = byClubSeason(n); return { label: n + PL.starText(PL.isCaseClub(n)), data: seasonsAll.map((s) => b[s]?.position ?? null), borderColor: clubColor(n), backgroundColor: clubColor(n), spanGaps: false, tension: 0.2, pointRadius: 3 }; }) }, options: { responsive: true, aspectRatio: 1.5, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { reverse: true, min: 1, max: 22, title: { display: true, text: "Final position" } } } } });
      // all-time record + style
      const stats = sel.map((n) => {
        const ft = d.finalTables.filter((r) => r.team === n), ms = d.teamMatches.filter((r) => r.team === n);
        const played = ms.length, w = ms.filter((r) => r.result === "W").length, dr = ms.filter((r) => r.result === "D").length;
        const gf = C.sum(ms, (r) => r.goals_for), ga = C.sum(ms, (r) => r.goals_against);
        const cs = ms.filter((r) => r.goals_against === 0).length;
        return { n, seasons: ft.length, played, w, d: dr, l: played - w - dr, gf, ga, pts: C.sum(ft, (r) => r.points), titles: ft.filter((r) => r.position === 1).length,
          top4: ft.filter((r) => r.position <= 4).length, best: ft.length ? Math.min(...ft.map((r) => r.position)) : null, rel: ft.filter((r) => /relegated/i.test(r.outcome)).length,
          dl: d.domestic.by_club[n].counts.league, dfa: d.domestic.by_club[n].counts.fa_cup, dlc: d.domestic.by_club[n].counts.league_cup, dcs: d.domestic.by_club[n].counts.community_shield, dtot: d.domestic.by_club[n].counts.total,
          ppg: played ? C.sum(ft, (r) => r.points) / played : 0, gfpg: played ? gf / played : 0, gapg: played ? ga / played : 0, winp: played ? (100 * w) / played : 0, csp: played ? (100 * cs) / played : 0 };
      });
      const rows = [["Seasons in the Premier League", "seasons"], ["Matches played", "played"], ["Won", "w"], ["Drawn", "d"], ["Lost", "l"], ["Goals scored", "gf"], ["Goals conceded", "ga"], ["Points (official)", "pts"], ["Titles", "titles"], ["Top-four finishes", "top4"], ["Best finish", "best"], ["Relegations", "rel"], ["League titles (all time)", "dl"], ["FA Cups", "dfa"], ["League Cups", "dlc"], ["Community Shields", "dcs"], ["Domestic trophies in all", "dtot"]];
      $("cmp-tbl").innerHTML = `<thead><tr><th>Measure</th>${stats.map((s) => `<th class="num" style="color:${clubColor(s.n)}">${esc(PL.short(s.n))}${PL.star(PL.isCaseClub(s.n))}</th>`).join("")}</tr></thead><tbody>` + rows.map(([l, k]) => `<tr><td>${l}</td>${stats.map((s) => `<td class="num">${s[k] === null ? "–" : int(s[k])}</td>`).join("")}</tr>`).join("") + "</tbody>";
      const mx = (k) => Math.max(...stats.map((s) => s[k])) || 1, mn = (k) => Math.min(...stats.map((s) => s[k])) || 1;
      make("cmp-radar", { type: "radar", data: { labels: ["Points per game", "Goals scored", "Goals conceded (fewer)", "Win %", "Clean sheets %"], datasets: sel.map((n, i) => { const s = stats[i]; return { label: n, data: [100 * s.ppg / mx("ppg"), 100 * s.gfpg / mx("gfpg"), 100 * mn("gapg") / s.gapg, 100 * s.winp / mx("winp"), 100 * s.csp / mx("csp")], borderColor: clubColor(n), backgroundColor: clubColor(n) + "33", pointBackgroundColor: clubColor(n) }; }) }, options: { responsive: true, aspectRatio: 1.3, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: "rgba(56,0,60,.15)" }, angleLines: { color: "rgba(56,0,60,.15)" } } }, plugins: { legend: { display: true } } } });
      // head to head
      if (sel.length === 2) {
        const [a, b] = sel, meet = d.matches.filter((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a));
        let wa = 0, wb = 0, dr = 0, ga = 0, gb = 0;
        for (const m of meet) { const ah = m.home === a; const fa = ah ? m.home_goals : m.away_goals, fb = ah ? m.away_goals : m.home_goals; ga += fa; gb += fb; fa > fb ? wa++ : fa < fb ? wb++ : dr++; }
        const last = [...meet].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 8);
        $("cmp-h2h").innerHTML = `<div class="card" style="margin-bottom:16px"><h3>Head to head in the Premier League (${meet.length} meetings)</h3>
          <div class="h2h"><div><div class="big" style="color:${clubColor(a)}">${wa}</div><div>${esc(a)} wins</div></div><div><div class="big">${dr}</div><div>draws</div></div><div><div class="big" style="color:${clubColor(b)}">${wb}</div><div>${esc(b)} wins</div></div></div>
          <div class="note" style="text-align:center">Goals: ${esc(a)} ${ga} – ${gb} ${esc(b)}</div>
          <div class="tablewrap" style="max-height:260px"><table class="plain"><thead><tr><th>Date</th><th>Home</th><th class="num">Score</th><th>Away</th></tr></thead><tbody>${last.map((m) => `<tr><td>${m.date}${PL.star(PL.flaggedDate(m.home, m.date) || PL.flaggedDate(m.away, m.date))}</td><td>${esc(m.home)}</td><td class="num">${m.home_goals}–${m.away_goals}</td><td>${esc(m.away)}</td></tr>`).join("")}</tbody></table></div>
          <div class="note">Most recent ${last.length} meetings shown. Meetings only count while both clubs were in the Premier League.</div></div>`;
      } else $("cmp-h2h").innerHTML = `<p class="note">Pick exactly two clubs to see their head-to-head record.</p>`;
    }
    [0, 1, 2, 3].forEach((i) => $("cmp" + i).addEventListener("change", draw));
    draw();
  };

  // =====================================================================
  // SEASONS & AWARDS (promoted, relegated, honours, every award)
  // =====================================================================
  initFns.seasons = function () {
    const root = $("panel-seasons");
    const all = d.seasons.map((s) => s.season).sort((a, b) => C.bySeason(b, a));
    const info = d.awards.award_types;
    root.innerHTML = `<p class="intro">Everything about one season: the champions, the cup winners, who went up and down, the top scorers and every award, plus the final table.</p><div class="row"><div><label for="s-season">Season</label><select id="s-season">${optionHtml(all)}</select></div></div><div id="s-body"></div>`;
    function draw() {
      const season = $("s-season").value, s = d.seasons.find((x) => x.season === season), h = d.honours.find((x) => x.season === season);
      const table = d.finalTables.filter((r) => r.season === season).sort((a, b) => a.position - b.position);
      const awards = d.awards.awards.filter((a) => a.season === season);
      const dm = d.domestic.by_season[season];
      const chips = (arr, cls) => (arr.length ? arr.map((x) => `<span class="chip ${cls || ""}">${esc(x)}${PL.star(PL.flagged(x, season))}</span>`).join("") : `<span class="muted">—</span>`);
      const bd = h.ballon_dor.player ? `${esc(h.ballon_dor.player)} <span class="muted">(${esc(h.ballon_dor.club || "")}, ${h.ballon_dor_year})</span>` : `<span class="muted">${esc(h.ballon_dor.note)}</span>`;
      const kp = [[s.champion, "Premier League champions"], [table[1].team, "Runners-up"], [h.champions_league.winner, `Champions League winners (${h.champions_league.score})`], [h.europa_league.winner, `UEFA Cup / Europa League winners (${h.europa_league.score})`], [h.world_cup ? h.world_cup.winner + " (" + h.world_cup.year + ")" : "—", "World Cup winners (summer after the season)"],
        [dm.fa_cup.winner, `FA Cup winners (beat ${dm.fa_cup.runner_up}, ${dm.fa_cup.score})`], [dm.league_cup.winner, "League Cup winners"],
        [dm.community_shield ? dm.community_shield.winners.join(" & ") + (dm.community_shield.shared ? " (shared)" : "") : "—", `Community Shield (August ${dm.community_shield ? dm.community_shield.year : ""})`]];
      const byAward = C.byKey(awards, (a) => a.award);
      $("s-body").innerHTML = `<div class="kpis">${kp.map(([n, l]) => `<div class="kpi"><div class="n" style="font-size:1.1rem">${esc(n)}${l === "Community Shield (August " + (dm.community_shield ? dm.community_shield.year : "") + ")" ? PL.star((dm.community_shield?.winners ?? []).some((w) => PL.flagYear(w, dm.community_shield.year))) : PL.star(PL.flagged(n, season))}</div><div class="l">${esc(l)}</div></div>`).join("")}<div class="kpi"><div class="n" style="font-size:1.1rem">${bd}</div><div class="l">Ballon d'Or</div></div></div>
        <div class="grid2"><div class="card"><h3>Promoted to the Premier League afterwards</h3><div class="chips">${chips(s.promoted, "up")}</div>
          <h3 style="margin-top:14px">Relegated at the end of the season</h3><div class="chips">${chips(s.relegated, "down")}</div>
          <h3 style="margin-top:14px">Champions League places</h3><div class="chips">${chips(s.champions_league)}</div>
          <h3 style="margin-top:14px">UEFA Cup / Europa League places</h3><div class="chips">${chips(s.uefa_cup_europa_league)}</div>
          <h3 style="margin-top:14px">Top scorer${s.top_scorers.length > 1 ? "s" : ""}</h3><div class="chips">${chips(s.top_scorers.map((x) => x + (s.top_scorer_goals ? " (" + s.top_scorer_goals + ")" : "")))}</div></div>
        <div class="card"><h3>Every award this season</h3><div class="tablewrap" style="max-height:420px"><table class="plain"><tbody>${[...byAward].map(([k, list]) => `<tr><td class="muted">${esc(info[k]?.label || k)}</td><td>${list.map((a) => `<b>${esc(a.winner)}</b> <span class="muted">${esc(a.club || "")}${PL.star(PL.flagged(a.club, season))}${a.goals ? " · " + a.goals + " goals" : ""}${a.assists ? " · " + a.assists + " assists" : ""}${a.clean_sheets ? " · " + a.clean_sheets + " clean sheets" : ""}${a.score ? " · " + esc(a.score) + " v " + esc(a.opponent || "") : ""}</span>`).join("<br>")}</td></tr>`).join("")}</tbody></table></div></div></div>
        <div class="card"><h3>Final league table ${season}</h3><div class="tablewrap"><table class="plain"><thead><tr><th class="num">Pos</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th><th>Outcome</th></tr></thead><tbody>${table.map((r) => `<tr><td class="num ${r.position === 1 ? "pos-1" : ""}">${r.position}</td><td>${esc(r.team)}${PL.star(PL.flagged(r.team, season))}${r.points_deducted ? ` <span class="muted">(−${r.points_deducted})</span>` : ""}</td><td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.drawn}</td><td class="num">${r.lost}</td><td class="num">${r.goals_for}</td><td class="num">${r.goals_against}</td><td class="num">${r.goal_difference > 0 ? "+" : ""}${r.goal_difference}</td><td class="num"><b>${r.points}</b></td><td class="muted">${esc(r.outcome || "")}</td></tr>`).join("")}</tbody></table></div></div>`;
    }
    $("s-season").addEventListener("change", draw);
    draw();
  };


  // =====================================================================
  // RECORDS & TROPHIES (league records, club records, domestic trophies)
  // =====================================================================
  let recordsBuilt = false;
  initFns.records = initFns.clubrecords = function () {
    if (recordsBuilt) return;
    recordsBuilt = true;
    const R = d.records, off = R.official, L = R.league;
    const clubNames = Object.keys(R.clubs).sort();
    const BOOKS = {
      most_goals: ["Most goals (career)", "Goals", ["Rank", "Player", "Goals", "Games", "Ratio", "Position", "First goal", "Last goal"]],
      most_assists: ["Most assists (career)", "Assists", ["Rank", "Player", "Assists", "Games", "Ratio", "Position", "First assist", "Last assist"]],
      most_appearances: ["Most appearances (career)", "Games", ["Rank", "Player", "Games", "Position", "First season", "Last season"]],
      most_clean_sheets: ["Most clean sheets (career)", "Clean sheets", ["Rank", "Player", "Clean sheets", "Games", "Ratio", "First season", "Last season"]],
      most_penalties: ["Most penalties scored (career)", "Scored", ["Rank", "Player", "Scored", "Taken", "Ratio", "Playing position"]],
      most_free_kicks: ["Most direct free-kick goals (career)", "Goals", ["Rank", "Player", "Goals", "Games", "Ratio", "Playing position"]],
    };
    $("panel-records").innerHTML = `<p class="intro">The Premier League's all-time record books, the biggest wins and longest runs, and the table of every club's total Premier League record.</p>
      <h2>Record books</h2>
      <p class="note">All-time player records, 1992–93 to 2025–26, as listed by Wikipedia and reproduced exactly from the season-by-season player table.</p>
      <div class="row"><div><label for="rb-pick">Record book</label><select id="rb-pick">${Object.entries(BOOKS).map(([k, b]) => `<option value="${k}">${b[0]}</option>`).join("")}</select></div></div>
      <div class="grid2"><div class="card"><canvas id="rb-chart"></canvas></div><div class="card"><div class="tablewrap" style="max-height:380px"><table class="plain" id="rb-tbl"></table></div></div></div>
      <h2>Matches, seasons and runs</h2>
      <div class="grid2" id="lg-records"></div>
      <h2>All-time Premier League table</h2>
      <div class="card"><div class="tablewrap" style="max-height:520px"><table class="plain" id="at-tbl"></table></div></div>`;
    $("panel-clubrecords").innerHTML = `<p class="intro">Pick a club to see its Premier League records and every domestic trophy it has ever won, then compare all clubs' trophy counts.</p>
      <div class="row"><div><label for="cr-club">Club</label><select id="cr-club">${optionHtml(clubNames)}</select></div></div>
      <div id="cr-body"></div>
      <h2>Domestic trophies, all time</h2>
      <p class="note">League titles are top-flight titles since 1888; FA Cup, League Cup and Community Shield winners go back to each competition's first year. Click a column heading to sort.</p>
      <div class="card"><div class="tablewrap" style="max-height:520px"><table class="plain" id="tr-tbl"></table></div></div>`;
    let rbChart;
    function drawBook() {
      const k = $("rb-pick").value, [title, valKey, cols] = BOOKS[k], rows = off[k];
      $("rb-tbl").innerHTML = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c, i) => `<td class="${i === 1 || i > 5 ? "" : "num"}">${esc(r[c] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>`;
      if (rbChart) rbChart.destroy();
      rbChart = new Chart($("rb-chart"), { type: "bar", data: { labels: rows.map((r) => r.Player), datasets: [{ label: title, data: rows.map((r) => +String(r[valKey]).replace(/,/g, "")), backgroundColor: rows.map((r, i) => (i === 0 ? "#f2a900cc" : "#00c76faa")) }] }, options: { indexAxis: "y", responsive: true, aspectRatio: 1.15, plugins: { legend: { display: false }, title: { display: true, text: title } } } });
    }
    $("rb-pick").addEventListener("change", drawBook); drawBook();

    // computed league records
    const m = (x) => `<b>${esc(x.score)}</b> ${esc(x.home)} v ${esc(x.away)} <span class="muted">${x.date}</span>${PL.star(PL.flaggedDate(x.home, x.date) || PL.flaggedDate(x.away, x.date))}`;
    const seasonRow = (x) => `<b>${esc(x.team)}</b> ${x.season} <span class="muted">${x.points} pts, ${x.won}W ${x.drawn}D ${x.lost}L</span>${PL.star(PL.flagged(x.team, x.season))}`;
    const run = (x) => `<b>${esc(x.team)}</b> ${x.length} <span class="muted">${x.from_season === x.to_season ? x.from_season : x.from_season + " to " + x.to_season}</span>${PL.star(PL.flaggedRun(x.team, x.from, x.to))}`;
    const list = (title, items, f, note) => `<div class="card"><h3>${title}</h3><ol style="margin:0;padding-left:1.2em;line-height:1.7">${items.map((x) => `<li>${f(x)}</li>`).join("")}</ol>${note ? `<div class="note">${note}</div>` : ""}</div>`;
    $("lg-records").innerHTML = list("Biggest wins", L.biggest_wins.slice(0, 6), m) + list("Highest-scoring matches", L.highest_scoring.slice(0, 6), (x) => `${m(x)} <span class="muted">(${x.goals} goals)</span>`) +
      list("Most points in a season", L.most_points, seasonRow, "38-game seasons only.") + list("Fewest points in a season", L.fewest_points, seasonRow, "38-game seasons only.") +
      list("Longest unbeaten runs", L.longest_unbeaten_runs, run, "Matches without defeat; runs can span seasons.") + list("Longest winning runs", L.longest_winning_runs, run) +
      list("Longest losing runs", L.longest_losing_runs, run) + list("Most goals scored in a season", L.most_goals_scored, (x) => `<b>${esc(x.team)}</b> ${x.season} <span class="muted">${x.goals_for} goals</span>${PL.star(PL.flagged(x.team, x.season))}`) +
      list("Best defences (fewest conceded)", L.fewest_goals_conceded, (x) => `<b>${esc(x.team)}</b> ${x.season} <span class="muted">${x.goals_against} conceded</span>${PL.star(PL.flagged(x.team, x.season))}`, "38-game seasons only.") +
      list("Most wins in a season", L.most_wins, (x) => `<b>${esc(x.team)}</b> ${x.season} <span class="muted">${x.won} wins</span>${PL.star(PL.flagged(x.team, x.season))}`, "38-game seasons only.");

    // club records
    function drawClub() {
      const n = $("cr-club").value, c = R.clubs[n], dom = d.domestic.by_club[n], pl = c.premier_league;
      const years = (a) => (a.length ? a.map((x) => `${x}${PL.star(PL.flagged(n, String(x).replace(/[^0-9–-].*$/, "")))}`).join(", ") : "—");
      $("cr-body").innerHTML = `<div class="kpis">${[[pl.seasons, "Premier League seasons"], [int(pl.played), "matches"], [`${pl.won}–${pl.drawn}–${pl.lost}`, "won–drawn–lost"], [int(pl.points), "official points"], [pl.titles, "Premier League titles"]].map(([v, l]) => `<div class="kpi"><div class="n">${v}${PL.star(PL.isCaseClub(n))}</div><div class="l">${l}</div></div>`).join("")}</div>
        <div class="grid2"><div class="card"><h3 style="color:${clubColor(n)}">${esc(n)} — Premier League records</h3><table class="plain"><tbody>${PL.recordLines(c, n).map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join("")}<tr><td class="muted">Goals in the Premier League</td><td>${int(pl.goals_for)} for, ${int(pl.goals_against)} against</td></tr></tbody></table></div>
        <div class="card"><h3>Domestic trophies</h3><div class="chips" style="margin-bottom:10px">${PL.trophyChips(dom.counts, n, dom)}</div>
          <table class="plain"><tbody><tr><td class="muted">League titles</td><td>${years(dom.league_titles.map((s) => s))}</td></tr><tr><td class="muted">FA Cups</td><td>${years(dom.fa_cup)}</td></tr><tr><td class="muted">League Cups</td><td>${years(dom.league_cup)}</td></tr><tr><td class="muted">Community Shields</td><td>${years(dom.community_shield.map((y) => y + (dom.community_shield_shared.includes(y) ? "†" : "")))}</td></tr></tbody></table><div class="note">† shared shield. Seasons are written as the year the season began, e.g. 2003–04.${PL.isCaseClub(n) ? ` ${PL.star(true)} marks the seasons covered by the Premier League charges; the totals above include them.` : ""}</div></div></div>`;
    }
    $("cr-club").addEventListener("change", drawClub); $("cr-club").value = "Arsenal"; drawClub();

    // all-time table (official, from Wikipedia)
    const at = off.all_time_table;
    const cols = Object.keys(at[0]).filter((k) => k && k !== "Ref");
    $("at-tbl").innerHTML = `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${at.map((r) => `<tr>${cols.map((c) => `<td class="${c === "Club" ? "" : "num"}">${esc(r[c])}${c === "Club" ? PL.star(PL.isCaseClub(String(r[c]).replace(/\[.*?\]/g, "").trim())) : ""}</td>`).join("")}</tr>`).join("")}</tbody>`;

    // trophies table (sortable)
    const rows = Object.entries(d.domestic.by_club).map(([club, v]) => ({ club, ...v.counts })).filter((r) => r.total > 0);
    let sort = { col: "total", dir: -1 };
    const cols2 = [["club", "Club"], ["league", "League titles"], ["fa_cup", "FA Cups"], ["league_cup", "League Cups"], ["community_shield", "Community Shields"], ["total", "Total"]];
    function drawTrophies() {
      rows.sort((a, b) => (sort.col === "club" ? a.club.localeCompare(b.club) * sort.dir : (a[sort.col] - b[sort.col]) * sort.dir || a.club.localeCompare(b.club)));
      $("tr-tbl").innerHTML = `<thead><tr>${cols2.map(([k, l]) => `<th class="${k === "club" ? "" : "num"}" data-col="${k}">${l}${sort.col === k ? (sort.dir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.club)}${PL.star(PL.isCaseClub(r.club))}</td><td class="num">${r.league}</td><td class="num">${r.fa_cup}</td><td class="num">${r.league_cup}</td><td class="num">${r.community_shield}</td><td class="num"><b>${r.total}</b></td></tr>`).join("")}</tbody>`;
      $("tr-tbl").querySelectorAll("th").forEach((th) => th.addEventListener("click", () => { const c = th.dataset.col; sort = { col: c, dir: sort.col === c ? -sort.dir : c === "club" ? 1 : -1 }; drawTrophies(); }));
    }
    drawTrophies();
  };

  // =====================================================================
  // PLAYER PROFILES (everyone in a 2026-27 squad)
  // =====================================================================
  initFns.players = function () {
    const root = $("panel-players"), P = d.players;
    root.innerHTML = `<p class="intro">Every player in a 2026–27 squad, with his full Premier League career since 1992–93. Click a card for his season-by-season record.</p><div class="filters"><div><label for="p-club">Club</label><select id="p-club">${optionHtml([...new Set(P.map((p) => p.club))].sort(), "All clubs")}</select></div>
      <div><label for="p-pos">Position</label><select id="p-pos">${optionHtml(positions, "All positions")}</select></div>
      <div><label for="p-q">Name contains</label><input id="p-q" type="search" placeholder="e.g. Haaland"></div>
      <div><label for="p-sort">Sort by</label><select id="p-sort"><option value="name">Name</option><option value="goals">Career PL goals</option><option value="apps">Career PL appearances</option><option value="age">Age (youngest)</option><option value="mins">Minutes this season</option></select></div></div>
      <p class="note" id="p-count"></p><div class="cardgrid" id="p-grid"></div><p><button class="btn" id="p-more" type="button">Show more</button></p>`;
    let shown = 48, list = [];
    const initials = (n) => n.split(" ").map((x) => x[0]).slice(0, 2).join("");
    function draw() {
      const club = $("p-club").value, pos = $("p-pos").value, q = $("p-q").value.trim().toLowerCase(), sort = $("p-sort").value;
      list = P.filter((p) => (!club || p.club === club) && (!pos || p.position === pos) && (!q || (p.name + " " + p.known_as).toLowerCase().includes(q)));
      const key = { name: (p) => p.name, goals: (p) => -p.premier_league_career.goals, apps: (p) => -p.premier_league_career.appearances, age: (p) => p.age ?? 99, mins: (p) => -p.this_season.minutes }[sort];
      list.sort((a, b) => (typeof key(a) === "string" ? key(a).localeCompare(key(b)) : key(a) - key(b)));
      $("p-count").textContent = `${int(list.length)} players in 2026–27 squads. Career figures are Premier League totals from 1992–93 to 2025–26.`;
      $("p-grid").innerHTML = list.slice(0, shown).map((p, i) => `<button class="pcard" data-i="${i}"><img src="${esc(p.photo)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=avatar>${esc(initials(p.known_as))}</div>'"><div><b>${esc(p.known_as)}</b><small>${esc(p.club)}</small><small>${esc(p.position)}${p.age ? " · " + p.age : ""}</small><small>${p.premier_league_career.appearances ? int(p.premier_league_career.appearances) + " apps · " + int(p.premier_league_career.goals) + " goals" : "new to the Premier League"}</small></div></button>`).join("");
      $("p-more").hidden = shown >= list.length;
      $("p-grid").querySelectorAll(".pcard").forEach((b) => b.addEventListener("click", () => open(list[+b.dataset.i])));
    }
    function open(p) {
      const c = p.premier_league_career, t = p.this_season, dlg = $("dlg");
      dlg.innerHTML = `<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px"><img src="${esc(p.photo)}" alt="" style="width:84px;height:106px;object-fit:cover;object-position:top;border-radius:12px;background:#efe6f3" onerror="this.style.display='none'"><div><h3 style="margin:0">${esc(p.name)}</h3><div class="muted">${esc(p.club)} · ${esc(p.position)}${p.squad_number ? " · #" + p.squad_number : ""}${p.nationality ? " · " + esc(p.nationality) : ""}</div><div class="muted">${p.birth_date ? "Born " + p.birth_date + " (age " + p.age + ")" : "Birth date not listed"} · at the club since ${esc(p.joined_club || "?")}</div><div>${esc(p.availability)}${p.news ? " — " + esc(p.news) : ""}</div></div></div>
        <div class="kpis"><div class="kpi"><div class="n">${int(c.appearances)}</div><div class="l">PL appearances, 1992–2026</div></div><div class="kpi"><div class="n">${int(c.goals)}</div><div class="l">goals</div></div><div class="kpi"><div class="n">${int(c.assists)}</div><div class="l">assists</div></div><div class="kpi"><div class="n">${int(t.minutes)}</div><div class="l">minutes in 2026–27 so far (${t.goals} goals, ${t.assists} assists)</div></div></div>
        ${c.seasons.length ? `<div class="tablewrap" style="max-height:260px"><table class="plain"><thead><tr><th>Season</th><th>Club</th><th class="num">Apps</th><th class="num">Min</th><th class="num">Goals</th><th class="num">Assists</th><th class="num">Yellow</th><th class="num">Red</th></tr></thead><tbody>${c.seasons.map((s) => `<tr><td>${s.season}</td><td>${esc(s.club)}</td><td class="num">${s.appearances}</td><td class="num">${s.minutes == null ? "–" : int(s.minutes)}</td><td class="num">${s.goals}</td><td class="num">${s.assists}</td><td class="num">${s.yellow_cards}</td><td class="num">${s.red_cards}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No Premier League appearances before 2026–27.</p>`}
        <p style="text-align:right;margin:14px 0 0"><button class="btn" onclick="document.getElementById('dlg').close()">Close</button></p>`;
      dlg.showModal();
    }
    ["p-club", "p-pos", "p-sort"].forEach((i) => $(i).addEventListener("change", () => { shown = 48; draw(); }));
    $("p-q").addEventListener("input", () => { shown = 48; draw(); });
    $("p-more").addEventListener("click", () => { shown += 48; draw(); });
    draw();
  };

  // =====================================================================
  // SIGNINGS & DEPARTURES
  // =====================================================================
  initFns.transfers = function () {
    const root = $("panel-transfers"), T = d.transfers;
    const seasonsT = [...new Set(T.map((r) => r.season))].sort((a, b) => C.bySeason(b, a));
    const clubsT = [...new Set(T.map((r) => r.club))].sort();
    const kinds = [...new Set(T.map((r) => r.kind))].sort();
    root.innerHTML = `<p class="intro">Who joined and who left each club, season by season, worked out from where players actually played.</p><div class="filters"><div><label for="t-season">Season</label><select id="t-season">${optionHtml(seasonsT)}</select></div>
      <div><label for="t-club">Club</label><select id="t-club">${optionHtml(clubsT, "All clubs")}</select></div>
      <div><label for="t-dir">Direction</label><select id="t-dir"><option value="">Signings and departures</option><option>Signing</option><option>Departure</option></select></div>
      <div><label for="t-kind">Type of move</label><select id="t-kind">${optionHtml(kinds, "All types")}</select></div>
      <div><label for="t-min">Minimum appearances</label><input id="t-min" type="number" min="0" value="0"></div></div>
      <p class="note">Derived from where players actually played, since no fees are available: a move is a player appearing for a different club than before, for every season from 1993–94 (or, for 2026–27, comparing 2025–26 appearances with today's squad lists). Loans count as moves. "From outside the Premier League" also covers promoted youth players. Appearances are those in the later season for a signing, or in the last season at the club for a departure. If a player appears for two clubs in one season, the order comes from his clubs in the seasons before and after.</p>
      <div class="kpis" id="t-kpis"></div><div class="grid2"><div class="card"><h3>Signings and departures by club</h3><canvas id="t-chart"></canvas></div>
      <div class="card"><h3>The moves</h3><div class="tablewrap" id="t-wrap"><table class="plain" id="t-tbl"></table></div></div></div>`;
    $("t-season").value = "2025–26";
    let chart;
    function draw() {
      const s = $("t-season").value, club = $("t-club").value, dir = $("t-dir").value, kind = $("t-kind").value, mn = +$("t-min").value || 0;
      const rows = T.filter((r) => r.season === s && (!club || r.club === club) && (!dir || r.direction === dir) && (!kind || r.kind === kind) && (r.appearances_that_season || 0) >= mn);
      const sig = rows.filter((r) => r.direction === "Signing").length, dep = rows.filter((r) => r.direction === "Departure").length;
      $("t-kpis").innerHTML = [[int(rows.length), "moves in view"], [int(sig), "signings"], [int(dep), "departures"], [int(rows.filter((r) => /another Premier League club|Mid-season/.test(r.kind) && r.direction === "Signing").length), "between Premier League clubs"]].map(([n, l]) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
      const clubs = C.byKey(rows, (r) => r.club);
      const items = [...clubs].map(([c, rs]) => ({ c, sig: rs.filter((r) => r.direction === "Signing").length, dep: rs.filter((r) => r.direction === "Departure").length })).sort((a, b) => b.sig + b.dep - (a.sig + a.dep)).slice(0, 14);
      if (chart) chart.destroy();
      chart = new Chart($("t-chart"), { type: "bar", data: { labels: items.map((x) => PL.short(x.c)), datasets: [{ label: "Signings", data: items.map((x) => x.sig), backgroundColor: "#00c76fcc" }, { label: "Departures", data: items.map((x) => x.dep), backgroundColor: "#e90052cc" }] }, options: { indexAxis: "y", responsive: true, aspectRatio: 1.1, plugins: { legend: { display: true } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { autoSkip: false, font: { size: 10 } } } } } });
      rows.sort((a, b) => (b.appearances_that_season || 0) - (a.appearances_that_season || 0) || (b.goals_that_season || 0) - (a.goals_that_season || 0));
      $("t-tbl").innerHTML = `<thead><tr><th>Club</th><th>Player</th><th></th><th>From → to</th><th class="num">Apps</th></tr></thead><tbody>` + rows.slice(0, 300).map((r) => `<tr><td>${esc(r.club)}</td><td>${esc(r.player)} <span class="muted">${esc(r.position)}</span></td><td><span class="chip ${r.direction === "Signing" ? "up" : "down"}">${r.direction}</span></td><td class="muted">${esc(r.from_club || "outside the PL")} → ${esc(r.to_club || "left the PL")}<br>${esc(r.kind)}</td><td class="num">${int(r.appearances_that_season)}</td></tr>`).join("") + "</tbody>";
    }
    ["t-season", "t-club", "t-dir", "t-kind"].forEach((i) => $(i).addEventListener("change", draw));
    $("t-min").addEventListener("input", draw);
    draw();
  };

  // =====================================================================
  // THIS SEASON (2026–27): table, season stats, matches by week.
  // Reads data/current_season.json, which scripts/update_current_season.py rewrites every week. Loaded only when you open the section.
  // =====================================================================
  const londonDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const londonTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const crest = (t) => `<img class="crest-sm" src="${PL.badge(t)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const signed = (n) => (n > 0 ? "+" : "") + n;
  let nowPromise = null;
  function currentSeason() {
    if (!nowPromise) nowPromise = PL.load(["currentSeason"]).then((r) => prepareNow(r.currentSeason));
    return nowPromise;
  }
  // everything the three views share: the played matches, the clubs and cards counted by the project's rules
  function prepareNow(cs) {
    const played = cs.matches.filter((m) => m.status === "C");
    const clubs = [...new Set(cs.matches.flatMap((m) => [m.home, m.away]))].sort();
    // Cards follow the rest of the project: only cards shown to a named player count, and a second yellow counts as a red card only.
    let unnamedCards = 0;
    for (const m of played) {
      const secondYellow = new Set((m.cards || []).filter((c) => c.kind === "Second yellow" && c.player).map((c) => c.team + "|" + c.player));
      m.counted = { yellow: {}, red: {} };
      for (const c of m.cards || []) {
        if (!c.player) { unnamedCards++; continue; }
        const key = c.team + "|" + c.player, kind = c.kind === "Yellow" && secondYellow.has(key) ? null : c.kind === "Yellow" ? "yellow" : "red";
        if (kind) m.counted[kind][c.team] = (m.counted[kind][c.team] || 0) + 1;
      }
    }
    const lastWeek = Math.max(...played.map((m) => m.gw));
    return { cs, played, clubs, unnamedCards, lastWeek };
  }
  // shows "loading", builds the view once the data has arrived, and offers a retry if the file could not be loaded
  function nowPanel(view, build) {
    const root = $("panel-" + view);
    root.innerHTML = `<p class="note">Loading the ${esc("2026–27")} season…</p>`;
    currentSeason().then((ns) => { root.innerHTML = `<p class="intro">${nowIntro[view]}</p><p class="note" id="${view}-stamp">${stamp(ns)}</p><div id="${view}-body"></div>`; build($(view + "-body"), ns); })
      .catch((e) => { nowPromise = null; root.innerHTML = `<p class="note">Couldn't load this season's data: ${esc(e.message)} <button class="btn small" type="button" id="${view}-retry">Retry</button></p>`; $(view + "-retry").addEventListener("click", () => nowPanel(view, build)); });
  }
  const stamp = (ns) => `${ns.cs.season} season: ${ns.played.length} of ${ns.cs.total} matches played, up to matchweek ${ns.lastWeek}. Data last updated ${longDate.format(new Date(ns.cs.updated))}; it is refreshed once a week from the Premier League's statistics service.`;
  const nowIntro = {
    nowtable: "The league table as it stands, worked out from every finished match this season. Switch to home or away games only to see who is strong where.",
    nowstats: "The season so far in numbers: goals, results, cards and crowds, the leading players, and how each club is doing.",
    nowmatches: "Every match of the season, matchweek by matchweek, with the scorers, assists and cards for the games that have been played. Choose a club to see all of its games.",
  };

  // ---- the table ----
  function leagueTable(ns, side) {
    const t = new Map(ns.clubs.map((c) => [c, { club: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
    const add = (club, gf, ga) => { const r = t.get(club); r.p++; r.gf += gf; r.ga += ga; const res = gf > ga ? "W" : gf < ga ? "L" : "D"; r[res.toLowerCase()]++; r.pts += res === "W" ? 3 : res === "D" ? 1 : 0; r.form.push(res); };
    for (const m of [...ns.played].sort((a, b) => a.kick.localeCompare(b.kick))) {
      if (side !== "away") add(m.home, m.hg, m.ag);
      if (side !== "home") add(m.away, m.ag, m.hg);
    }
    // the Premier League orders clubs by points, then goal difference, then goals scored
    return [...t.values()].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.club.localeCompare(b.club));
  }
  initFns.nowtable = function () {
    nowPanel("nowtable", (body, ns) => {
      body.innerHTML = `<div class="row"><div><label for="nt-side">Show</label><select id="nt-side"><option value="all">All matches</option><option value="home">Home matches only</option><option value="away">Away matches only</option></select></div>
        <div class="grow"></div><div><button class="btn small" id="nt-csv" type="button">Download CSV</button></div></div>
        <div class="card"><h3 id="nt-title">League table</h3><div class="tablewrap full"><table class="plain" id="nt-tbl"></table></div></div><p class="note" id="nt-note"></p>`;
      let rows = [];
      function draw() {
        const side = $("nt-side").value;
        rows = leagueTable(ns, side);
        $("nt-title").textContent = `${ns.cs.season} Premier League table${side === "all" ? "" : side === "home" ? " (home matches only)" : " (away matches only)"}`;
        $("nt-tbl").innerHTML = `<thead><tr><th class="num">Pos</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th><th>Last 5</th></tr></thead><tbody>` +
          rows.map((r, i) => `<tr class="${i >= rows.length - 3 ? "zone-down" : ""}"><td class="num ${i === 0 && r.p ? "pos-1" : ""}">${i + 1}</td><td>${crest(r.club)}${esc(r.club)}</td><td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${signed(r.gf - r.ga)}</td><td class="num"><b>${r.pts}</b></td>` +
            `<td><span class="form">${r.form.slice(-5).map((x) => `<i class="fm ${x}" title="${{ W: "Win", D: "Draw", L: "Defeat" }[x]}">${x}</i>`).join("")}</span></td></tr>`).join("") + "</tbody>";
        const games = new Set(rows.map((r) => r.p));
        $("nt-note").innerHTML = `The pink marker shows the bottom three, the relegation places. Clubs are ordered by points, then goal difference, then goals scored (the league's own order; head-to-head results are not used here). ` +
          (side === "all" && games.size > 1 ? `Clubs have played different numbers of games (${Math.min(...games)} to ${Math.max(...games)}), so compare points with care. ` : "") + (ns.played.length ? "" : "No matches have been played yet.");
      }
      $("nt-side").addEventListener("change", draw);
      $("nt-csv").addEventListener("click", () => {
        const csv = "position,club,played,won,drawn,lost,goals_for,goals_against,goal_difference,points\n" + rows.map((r, i) => [i + 1, `"${r.club}"`, r.p, r.w, r.d, r.l, r.gf, r.ga, r.gf - r.ga, r.pts].join(",")).join("\n");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `premier-league-table-${ns.cs.season}.csv`; a.click(); URL.revokeObjectURL(a.href);
      });
      draw();
    });
  };

  // ---- season stats ----
  initFns.nowstats = function () {
    nowPanel("nowstats", (body, ns) => {
      const P = ns.played, n = P.length;
      if (!n) { body.innerHTML = `<p class="note">No matches have been played yet.</p>`; return; }
      const goals = C.sum(P, (m) => m.hg + m.ag), hw = P.filter((m) => m.hg > m.ag).length, dr = P.filter((m) => m.hg === m.ag).length, aw = n - hw - dr;
      const pens = C.sum(P, (m) => m.goals.filter((g) => g.kind === "Penalty").length), ogs = C.sum(P, (m) => m.goals.filter((g) => g.kind === "Own goal").length);
      const cleanSheets = C.sum(P, (m) => (m.ag === 0 ? 1 : 0) + (m.hg === 0 ? 1 : 0));
      const sumCards = (kind) => C.sum(P, (m) => C.sum(Object.values(m.counted[kind]), (x) => x));
      const crowds = P.filter((m) => m.att);
      const kpi = (v, l) => `<div class="kpi"><div class="n">${v}</div><div class="l">${l}</div></div>`;
      const margin = (m) => Math.abs(m.hg - m.ag);
      const biggest = [...P].sort((a, b) => margin(b) - margin(a) || (b.hg + b.ag) - (a.hg + a.ag))[0];
      const highest = [...P].sort((a, b) => (b.hg + b.ag) - (a.hg + a.ag) || margin(b) - margin(a))[0];
      const crowd = [...crowds].sort((a, b) => b.att - a.att)[0];
      const line = (m) => `<b>${esc(m.home)} ${m.hg}–${m.ag} ${esc(m.away)}</b> <span class="muted">matchweek ${m.gw}</span>`;
      const topCard = (title, rows, what) => `<div class="card"><h3>${title}</h3><div class="tablewrap full"><table class="plain"><thead><tr><th class="num">#</th><th>Player</th><th>Club</th><th class="num">${what}</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="num">${i > 0 && rows[i - 1].value === r.value ? "=" : i + 1}</td><td>${esc(r.player)}</td><td>${crest(r.club)}${esc(PL.short(r.club))}</td><td class="num"><b>${r.value}</b></td></tr>`).join("")}</tbody></table></div></div>`;
      const teamStats = ns.clubs.map((c) => {
        const mine = P.filter((m) => m.home === c || m.away === c);
        const gf = C.sum(mine, (m) => (m.home === c ? m.hg : m.ag)), ga = C.sum(mine, (m) => (m.home === c ? m.ag : m.hg));
        return { club: c, p: mine.length, gf, ga, cs: mine.filter((m) => (m.home === c ? m.ag : m.hg) === 0).length, yellow: C.sum(mine, (m) => m.counted.yellow[c] || 0), red: C.sum(mine, (m) => m.counted.red[c] || 0) };
      });
      body.innerHTML = `<div class="kpis">${kpi(n + '<span class="muted" style="font-size:1rem"> / ' + ns.cs.total + "</span>", "Matches played")}${kpi(int(goals), "Goals")}${kpi(dec(goals / n), "Goals per match")}
        ${kpi(pct(100 * hw / n, 0), "Home wins")}${kpi(pct(100 * dr / n, 0), "Draws")}${kpi(pct(100 * aw / n, 0), "Away wins")}${kpi(int(cleanSheets), "Clean sheets")}
        ${kpi(int(pens) + " / " + int(ogs), "Penalties / own goals")}${kpi(int(sumCards("yellow")) + " / " + int(sumCards("red")), "Yellow / red cards")}${kpi(crowds.length ? int(C.sum(crowds, (m) => m.att) / crowds.length) : "–", "Average crowd")}</div>
        <div class="grid2"><div class="card"><h3>Goals per match, matchweek by matchweek</h3><canvas id="ns-goals"></canvas></div>
          <div class="card"><h3>Home wins, draws and away wins each matchweek</h3><canvas id="ns-res"></canvas></div></div>
        <div class="card"><h3>Highlights so far</h3><table class="plain"><tbody>
          <tr><td class="muted">Biggest win</td><td>${line(biggest)}</td></tr><tr><td class="muted">Most goals in a match</td><td>${line(highest)}</td></tr>
          ${crowd ? `<tr><td class="muted">Biggest crowd</td><td><b>${int(crowd.att)}</b> <span class="muted">${esc(crowd.home)} v ${esc(crowd.away)}, ${esc(crowd.ground)}</span></td></tr>` : ""}</tbody></table></div>
        <div class="grid2">${topCard("Top scorers", ns.cs.top.goals, "Goals")}${topCard("Most assists", ns.cs.top.assists, "Assists")}${topCard("Most clean sheets (goalkeepers)", ns.cs.top.clean_sheets, "Clean sheets")}${topCard("Most yellow cards", ns.cs.top.yellow_cards, "Yellows")}</div>
        <div class="grid2">${topCard("Most red cards", ns.cs.top.red_cards, "Reds")}<div class="card"><h3>How to read the cards</h3><p class="note" style="margin:0">Cards follow the rest of this project: only cards shown to a named player count, and a player sent off for two yellows counts as a red only (as the Premier League's own statistic does).${ns.unnamedCards ? ` ${ns.unnamedCards} yellow card${ns.unnamedCards === 1 ? " is" : "s are"} not counted because the official record names no player.` : ""} Player lists are the league's own season totals, top 10; ties share a number.</p></div></div>
        <div class="card"><h3>Club by club</h3><div class="row"><div><label for="ns-sort">Sort by</label><select id="ns-sort"><option value="gf">Goals scored</option><option value="ga">Goals conceded (fewest first)</option><option value="cs">Clean sheets</option><option value="yellow">Yellow cards</option><option value="red">Red cards</option><option value="club">Club name</option></select></div></div>
          <div class="tablewrap full"><table class="plain" id="ns-clubs"></table></div></div>`;
      // charts, one bar per matchweek that has been played
      const weeks = [...new Set(P.map((m) => m.gw))].sort((a, b) => a - b);
      const inWeek = (w) => P.filter((m) => m.gw === w);
      new Chart($("ns-goals"), { type: "bar", data: { labels: weeks, datasets: [{ data: weeks.map((w) => +(C.sum(inWeek(w), (m) => m.hg + m.ag) / inWeek(w).length).toFixed(2)), backgroundColor: palette[0] }] },
        options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => "Matchweek " + i[0].label, afterLabel: (i) => `${inWeek(weeks[i.dataIndex]).length} matches played` } } }, scales: { x: { title: { display: true, text: "Matchweek" } }, y: { beginAtZero: true, title: { display: true, text: "Goals per match" } } } } });
      const count = (w, f) => inWeek(w).filter(f).length;
      new Chart($("ns-res"), { type: "bar", data: { labels: weeks, datasets: [{ label: "Home wins", data: weeks.map((w) => count(w, (m) => m.hg > m.ag)), backgroundColor: palette[0] }, { label: "Draws", data: weeks.map((w) => count(w, (m) => m.hg === m.ag)), backgroundColor: palette[7] }, { label: "Away wins", data: weeks.map((w) => count(w, (m) => m.hg < m.ag)), backgroundColor: palette[1] }] },
        options: { responsive: true, plugins: { tooltip: { callbacks: { title: (i) => "Matchweek " + i[0].label } } }, scales: { x: { stacked: true, title: { display: true, text: "Matchweek" } }, y: { stacked: true, title: { display: true, text: "Matches" } } } } });
      function drawClubs() {
        const key = $("ns-sort").value, dir = { club: 1, ga: 1 }[key] || -1;
        const rows = [...teamStats].sort((a, b) => (key === "club" ? a.club.localeCompare(b.club) : (a[key] - b[key]) * dir || a.club.localeCompare(b.club)));
        $("ns-clubs").innerHTML = `<thead><tr><th>Club</th><th class="num">P</th><th class="num">Goals scored</th><th class="num">Goals conceded</th><th class="num">Clean sheets</th><th class="num">Yellows</th><th class="num">Reds</th></tr></thead><tbody>` +
          rows.map((r) => `<tr><td>${crest(r.club)}${esc(r.club)}</td><td class="num">${r.p}</td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.cs}</td><td class="num">${r.yellow}</td><td class="num">${r.red}</td></tr>`).join("") + "</tbody>";
      }
      $("ns-sort").addEventListener("change", drawClubs);
      drawClubs();
    });
  };

  // ---- matches by week ----
  initFns.nowmatches = function () {
    nowPanel("nowmatches", (body, ns) => {
      const weeks = [...new Set(ns.cs.matches.map((m) => m.gw))].sort((a, b) => a - b);
      const done = (w) => ns.cs.matches.filter((m) => m.gw === w).every((m) => m.status === "C");
      body.innerHTML = `<div class="row"><div><label>Matchweek</label><div class="gwbar"><button class="btn small" id="nm-prev" type="button" aria-label="Previous matchweek">◀</button>
          <select id="nm-week" aria-label="Matchweek">${weeks.map((w) => `<option value="${w}">Matchweek ${w}${done(w) ? " ✓" : ""}</option>`).join("")}</select><button class="btn small" id="nm-next" type="button" aria-label="Next matchweek">▶</button></div></div>
        <div><label for="nm-club">Or one club's whole season</label><select id="nm-club">${optionHtml(ns.clubs, "All clubs (use the matchweek)")}</select></div></div><div id="nm-list"></div>`;
      const stateWeek = ns.played.length ? ns.lastWeek : weeks[0];
      $("nm-week").value = stateWeek;
      const goalLine = (g) => `<div>${esc(g.player || "Unknown")} <span class="muted">${esc(g.min)}′${g.kind === "Penalty" ? " (pen)" : g.kind === "Own goal" ? " (own goal)" : ""}${g.assist ? ` · assist ${esc(g.assist)}` : ""}</span></div>`;
      const cardLine = (c) => `<div><i class="cardbox ${c.kind === "Yellow" ? "y" : "r"}"></i>${esc(c.player || "Player not named in the official record")} <span class="muted">${esc(c.min)}′ · ${esc(PL.short(c.team))}${c.kind === "Second yellow" ? " (second yellow)" : ""}</span></div>`;
      function matchHtml(m) {
        const k = new Date(m.kick), center = m.status === "C" || m.status === "L" ? `<span class="score">${m.hg}–${m.ag}</span>` : `<span class="ko">${londonTime.format(k)}</span>`;
        const head = `<summary><span class="mt home">${esc(m.home)}${crest(m.home)}</span>${center}<span class="mt away">${crest(m.away)}${esc(m.away)}</span></summary>`;
        let detail;
        if (m.status !== "C") detail = `<div class="mdetail muted">${m.status === "L" ? "In progress. " : ""}Kick-off ${londonDate.format(k)}, ${londonTime.format(k)} UK time · ${esc(m.ground)}${m.city ? ", " + esc(m.city) : ""}</div>`;
        else {
          const side = (team) => m.goals.filter((g) => g.team === team).map(goalLine).join("") || `<div class="muted">–</div>`;
          detail = `<div class="mdetail"><div class="grid2" style="margin-bottom:8px"><div><h4>${esc(m.home)} goals</h4>${side(m.home)}</div><div><h4>${esc(m.away)} goals</h4>${side(m.away)}</div></div>` +
            (m.cards.length ? `<h4>Cards</h4>${m.cards.map(cardLine).join("")}` : "") +
            `<p class="note" style="margin:8px 0 0">${m.ht && m.ht[0] != null ? `Half-time ${m.ht[0]}–${m.ht[1]} · ` : ""}${m.ref ? `Referee ${esc(m.ref)} · ` : ""}${esc(m.ground)}${m.att ? ` · crowd ${int(m.att)}` : ""}</p></div>`;
        }
        return `<details class="match">${head}${detail}</details>`;
      }
      function draw() {
        const club = $("nm-club").value, w = +$("nm-week").value;
        $("nm-week").disabled = !!club;
        $("nm-prev").disabled = !!club || w <= weeks[0]; $("nm-next").disabled = !!club || w >= weeks[weeks.length - 1];
        const list = ns.cs.matches.filter((m) => (club ? m.home === club || m.away === club : m.gw === w)).sort((a, b) => a.gw - b.gw || a.kick.localeCompare(b.kick) || a.id - b.id);
        const groups = new Map();
        for (const m of list) {
          const key = club ? `Matchweek ${m.gw}` : londonDate.format(new Date(m.kick));
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(m);
        }
        const pl = list.filter((m) => m.status === "C");
        const summary = club ? (() => { const r = pl.map((m) => { const home = m.home === club, gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg; return gf > ga ? "W" : gf < ga ? "L" : "D"; });
          return `${club}: played ${r.length}, won ${r.filter((x) => x === "W").length}, drawn ${r.filter((x) => x === "D").length}, lost ${r.filter((x) => x === "L").length}.`; })()
          : `Matchweek ${w}: ${pl.length} of ${list.length} matches played${pl.length ? `, ${C.sum(pl, (m) => m.hg + m.ag)} goals.` : "."}`;
        $("nm-list").innerHTML = `<p class="note">${esc(summary)} Click a match for the scorers, assists and cards. Times are UK time.</p>` +
          [...groups].map(([title, ms]) => `<div class="card mgroup"><h3>${esc(title)}</h3>${ms.map(matchHtml).join("")}</div>`).join("");
      }
      $("nm-week").addEventListener("change", draw);
      $("nm-club").addEventListener("change", draw);
      $("nm-prev").addEventListener("click", () => { $("nm-week").value = +$("nm-week").value - 1; draw(); });
      $("nm-next").addEventListener("click", () => { $("nm-week").value = +$("nm-week").value + 1; draw(); });
      draw();
    });
  };

  const startView = location.hash.slice(1);
  showView(startView && (initFns[startView] || startView === "explore") ? startView : "explore");
})();
