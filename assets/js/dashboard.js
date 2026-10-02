/* Dashboard: loads the data files in the browser and recalculates everything when a filter or switch changes. */
(async function () {
  PL.renderNav("dashboard");
  PL.chartDefaults();
  const { int, dec, pct, esc, clubColor, palette } = PL;
  const C = Calc;
  const $ = (id) => document.getElementById(id);
  let d;
  try {
    d = await PL.load(["playerMatches", "matches", "teamMatches", "finalTables", "seasons", "awards", "honours", "teams", "players", "transfers"], (p) => {
      $("load-bar").style.width = Math.round(p * 100) + "%"; $("load-text").textContent = `Loading the data… ${Math.round(p * 100)}%`;
    });
  } catch (e) { $("load-text").innerHTML = `Couldn't load the data: ${esc(e.message)} <button class="btn small" onclick="location.reload()">Retry</button>`; return; }
  $("loading").remove(); $("app").hidden = false;

  const pm = d.playerMatches;
  for (const r of pm) { r.goals = r.goals || 0; r.assists = r.assists || 0; r.clean_sheet = r.clean_sheet || 0; r.yellow_cards = r.yellow_cards || 0; r.red_cards = r.red_cards || 0; }
  const seasonList = [...new Set(pm.map((r) => r.season))].sort(C.bySeason);
  const clubList = [...new Set(pm.map((r) => r.team))].sort();
  const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
  const optionHtml = (items, all) => (all ? `<option value="">${all}</option>` : "") + items.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");

  // ---------------- tabs ----------------
  const inited = { explore: true };
  const initFns = {};
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t === b));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "panel-" + b.dataset.tab));
    if (!inited[b.dataset.tab]) { inited[b.dataset.tab] = true; initFns[b.dataset.tab](); }
    history.replaceState(null, "", "#" + b.dataset.tab);
  }));

  // =====================================================================
  // EXPLORE: filters, summary numbers, four charts with switches, table, reset
  // =====================================================================
  const FILTERS = [
    { id: "f-from", label: "From season", html: optionHtml(seasonList), def: seasonList[0] },
    { id: "f-to", label: "To season", html: optionHtml(seasonList), def: seasonList[seasonList.length - 1] },
    { id: "f-club", label: "Club", html: optionHtml(clubList, "All clubs"), def: "" },
    { id: "f-opp", label: "Opponent", html: optionHtml(clubList, "All opponents"), def: "" },
    { id: "f-pos", label: "Position", html: optionHtml(positions, "All positions"), def: "" },
    { id: "f-venue", label: "Venue", html: optionHtml(["Home", "Away"], "Home and away"), def: "" },
    { id: "f-mw1", label: "Matchweek from", html: null, def: 1, type: "number" },
    { id: "f-mw2", label: "Matchweek to", html: null, def: 38, type: "number" },
    { id: "f-player", label: "Player name contains", html: null, def: "", type: "search" },
  ];
  $("filters").innerHTML = FILTERS.map((f) => `<div><label for="${f.id}">${f.label}</label>` +
    (f.html !== null ? `<select id="${f.id}">${f.html}</select>` : `<input id="${f.id}" type="${f.type}" ${f.type === "number" ? 'min="1" max="42"' : 'placeholder="e.g. Salah"'}>`) + `</div>`).join("") +
    `<div><button class="btn primary" id="reset" type="button" style="width:100%">Reset all filters</button></div>`;
  const resetFilters = () => { FILTERS.forEach((f) => ($(f.id).value = f.def)); redrawExplore(); };
  FILTERS.forEach((f) => $(f.id).addEventListener(f.type === "search" ? "input" : "change", redrawExplore));
  $("reset").addEventListener("click", resetFilters);
  FILTERS.forEach((f) => ($(f.id).value = f.def));

  function filtered() {
    const from = C.seasonStart($("f-from").value), to = C.seasonStart($("f-to").value);
    const club = $("f-club").value, opp = $("f-opp").value, pos = $("f-pos").value, venue = $("f-venue").value;
    const mw1 = +$("f-mw1").value || 1, mw2 = +$("f-mw2").value || 99, q = $("f-player").value.trim().toLowerCase();
    return pm.filter((r) => {
      const s = C.seasonStart(r.season);
      return s >= from && s <= to && (!club || r.team === club) && (!opp || r.opponent === opp) && (!pos || r.position === pos) &&
        (!venue || r.venue === venue) && r.game_no >= mw1 && r.game_no <= mw2 && (!q || r.player.toLowerCase().includes(q));
    });
  }

  const MIN_RATE_MINUTES = 900;
  const MEASURES = {
    appearances: { label: "Appearances", val: (g) => g.n },
    players: { label: "Different players", val: (g) => g.ids.size },
    minutes: { label: "Minutes played", val: (g) => g.minutes },
    goals: { label: "Goals", val: (g) => g.goals },
    assists: { label: "Assists", val: (g) => g.assists },
    clean_sheets: { label: "Clean sheets", val: (g) => g.cs },
    yellow: { label: "Yellow cards", val: (g) => g.yellow },
    red: { label: "Red cards", val: (g) => g.red },
    goals_per_90: { label: `Goals per 90 min (groups with ${MIN_RATE_MINUTES}+ min)`, val: (g) => (g.minutes >= MIN_RATE_MINUTES ? (g.goals * 90) / g.minutes : null), rate: true },
    goals_per_app: { label: "Goals per appearance", val: (g) => (g.n ? g.goals / g.n : null), rate: true },
  };
  const BREAKDOWNS = {
    season: { label: "Season", key: (r) => r.season, order: "time" },
    matchweek: { label: "Matchweek", key: (r) => r.game_no, order: "time" },
    club: { label: "Club", key: (r) => r.team },
    opponent: { label: "Opponent", key: (r) => r.opponent },
    position: { label: "Position", key: (r) => r.position },
    venue: { label: "Venue", key: (r) => r.venue },
    player: { label: "Player", key: (r) => r.player_id + "|" + r.player },
  };
  function group(rows, keyFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      let g = m.get(k);
      if (!g) m.set(k, (g = { n: 0, minutes: 0, goals: 0, assists: 0, cs: 0, yellow: 0, red: 0, ids: new Set() }));
      g.n++; g.minutes += r.minutes; g.goals += r.goals; g.assists += r.assists; g.cs += r.clean_sheet; g.yellow += r.yellow_cards; g.red += r.red_cards; g.ids.add(r.player_id);
    }
    return m;
  }
  const keyLabel = (k, bd) => (bd === "player" ? String(k).split("|")[1] : bd === "matchweek" ? "MW " + k : k);

  // KPIs
  function drawKpis(rows) {
    const g = [...group(rows, () => 1).values()][0] || { n: 0, minutes: 0, goals: 0, assists: 0, cs: 0, yellow: 0, red: 0, ids: new Set() };
    const tiles = [[int(g.n), "appearances in view"], [int(g.ids.size), "different players"], [int(g.goals), "goals"], [int(g.assists), "assists"],
      [g.minutes ? dec((g.goals * 90) / g.minutes, 3) : "–", "goals per 90 minutes"], [int(g.yellow + g.red), `cards (${int(g.yellow)} yellow, ${int(g.red)} red)`]];
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
    let items = [...group(rows, B.key)].map(([k, g]) => ({ k, label: keyLabel(k, bKey), v: M.val(g), g })).filter((x) => x.v !== null);
    const timeline = B.order === "time";
    if (timeline) items.sort((a, b) => (bKey === "season" ? C.bySeason(a.k, b.k) : a.k - b.k));
    else { items.sort((a, b) => b.v - a.v); items = items.slice(0, bKey === "position" || bKey === "venue" ? 10 : 12); }
    const useLine = timeline && c.id === "c2";
    const useDoughnut = !timeline && (bKey === "position" || bKey === "venue") && c.id === "c3" && !M.rate;
    const type = useDoughnut ? "doughnut" : useLine ? "line" : "bar";
    const colors = items.map((x, i) => (bKey === "club" || bKey === "opponent" ? clubColor(x.k) : palette[i % palette.length]));
    const data = { labels: items.map((x) => x.label), datasets: [{ label: M.label, data: items.map((x) => (M.rate ? +x.v.toFixed(4) : x.v)),
      backgroundColor: type === "line" ? "#00ff8533" : colors.map((cl) => cl + (type === "doughnut" ? "" : "")), borderColor: type === "line" ? palette[0] : type === "doughnut" ? "#150726" : colors, fill: type === "line", tension: 0.3, pointRadius: 2 }] };
    const horizontal = type === "bar" && !timeline;
    const options = { responsive: true, maintainAspectRatio: true, aspectRatio: 1.45, indexAxis: horizontal ? "y" : "x",
      plugins: { legend: { display: type === "doughnut" } }, scales: type === "doughnut" ? {} : { x: { ticks: { maxTicksLimit: horizontal ? 12 : 9 } }, y: { beginAtZero: true } } };
    if (chartObjs[c.id]) chartObjs[c.id].destroy();
    chartObjs[c.id] = new Chart($(c.id), { type, data, options });
    $(c.id + "-n").textContent = items.length ? `${B.label}: ${M.label}${timeline ? "" : ` — top ${items.length}`}` : "No rows match the filters.";
  }

  // table
  const TBL_COLS = [["label", "Group"], ["n", "Apps"], ["minutes", "Minutes"], ["goals", "Goals"], ["assists", "Assists"], ["cs", "Clean sheets"], ["yellow", "Yellow"], ["red", "Red"], ["g90", "Goals / 90"]];
  let tblSort = { col: "goals", dir: -1 }, tblRows = [];
  $("tbl-group").innerHTML = Object.entries(BREAKDOWNS).map(([k, b]) => `<option value="${k}" ${k === "player" ? "selected" : ""}>${b.label}</option>`).join("");
  $("tbl-group").addEventListener("change", () => drawTable(currentRows));
  function drawTable(rows) {
    const bKey = $("tbl-group").value, B = BREAKDOWNS[bKey];
    tblRows = [...group(rows, B.key)].map(([k, g]) => ({ k, label: keyLabel(k, bKey), n: g.n, minutes: g.minutes, goals: g.goals, assists: g.assists, cs: g.cs, yellow: g.yellow, red: g.red, g90: g.minutes ? (g.goals * 90) / g.minutes : null }));
    const col = tblSort.col;
    tblRows.sort((a, b) => (col === "label" ? String(a.label).localeCompare(String(b.label), undefined, { numeric: true }) * tblSort.dir : ((a[col] ?? -1) - (b[col] ?? -1)) * tblSort.dir));
    const shown = tblRows.slice(0, 250);
    $("tbl").innerHTML = `<thead><tr>${TBL_COLS.map(([k, l]) => `<th class="${k === "label" ? "" : "num"}" data-col="${k}">${l}${tblSort.col === k ? (tblSort.dir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead><tbody>` +
      shown.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${int(r.n)}</td><td class="num">${int(r.minutes)}</td><td class="num">${int(r.goals)}</td><td class="num">${int(r.assists)}</td><td class="num">${int(r.cs)}</td><td class="num">${int(r.yellow)}</td><td class="num">${int(r.red)}</td><td class="num">${r.g90 === null ? "–" : dec(r.g90, 3)}</td></tr>`).join("") + `</tbody>`;
    $("tbl").querySelectorAll("th").forEach((th) => th.addEventListener("click", () => { const c = th.dataset.col; tblSort = { col: c, dir: tblSort.col === c ? -tblSort.dir : c === "label" ? 1 : -1 }; drawTable(currentRows); }));
    $("tbl-note").textContent = `${int(tblRows.length)} group${tblRows.length === 1 ? "" : "s"} · showing the first ${int(shown.length)} · click a column heading to sort`;
  }
  $("tbl-csv").addEventListener("click", () => {
    const csv = [TBL_COLS.map((c) => c[1]).join(",")].concat(tblRows.map((r) => TBL_COLS.map(([k]) => (k === "label" ? `"${String(r.label).replace(/"/g, '""')}"` : r[k] ?? "")).join(","))).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "premier-league-view.csv"; a.click();
  });

  let currentRows = pm;
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
    root.innerHTML = `<div class="row"><div><label for="r-season">Season</label><select id="r-season">${optionHtml(seasonsDesc)}</select></div>
      <div class="grow"><label for="r-mw" id="r-mw-l">Matchweek</label><input id="r-mw" type="range" min="1" max="38" value="38" style="width:100%"></div>
      <div><button class="btn primary" id="r-play" type="button">▶ Play the season</button></div>
      <div><label for="r-hi">Highlight a club</label><select id="r-hi"></select></div></div>
      <p class="note">Matchweek means each club's nth game. Every club has played the same number of games at that point, so the table is a fair snapshot. Points deductions are applied from the day they took effect.</p>
      <div class="grid2"><div class="card"><h3 id="r-title1">League table race</h3><canvas id="r-race"></canvas></div>
      <div class="card"><h3>League position after every matchweek</h3><canvas id="r-bump"></canvas><div class="note" id="r-sum"></div></div></div>
      <div class="card"><h3 id="r-title2">League table</h3><div class="tablewrap"><table class="plain" id="r-table"></table></div></div>`;
    let race, bump, timer = null;
    const marker = { id: "marker", afterDatasetsDraw(ch) { const mw = +$("r-mw").value; const x = ch.scales.x.getPixelForValue(mw - 1); const { ctx, chartArea } = ch; ctx.save(); ctx.strokeStyle = "#00ff85"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke(); ctx.restore(); } };
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
      race.data.labels = snap.map((s) => `${s.row.position}. ${PL.short(s.team)}`);
      race.data.datasets[0].data = snap.map((s) => s.row.cum_points);
      race.data.datasets[0].backgroundColor = snap.map((s) => clubColor(s.team) + (hi && s.team !== hi ? "44" : ""));
      race.update();
      bump.data.datasets.forEach((ds) => { const on = !hi || ds.label === hi; ds.borderWidth = hi && ds.label === hi ? 5 : 2; ds.borderColor = clubColor(ds.label) + (on ? "" : "33"); });
      bump.update("none");
      const lead = snap[0], bottom = snap[snap.length - 1];
      $("r-title1").textContent = `${season}: table after matchweek ${mw}`;
      $("r-sum").textContent = `After matchweek ${mw}, ${lead.team} lead with ${lead.row.cum_points} points; ${bottom.team} are bottom with ${bottom.row.cum_points}.`;
      $("r-title2").textContent = `${season} league table after matchweek ${mw}`;
      $("r-table").innerHTML = `<thead><tr><th class="num">Pos</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th></tr></thead><tbody>` +
        snap.map((s) => { const rs = s.rows.slice(0, mw); const w = rs.filter((r) => r.result === "W").length, dr = rs.filter((r) => r.result === "D").length, ga = C.sum(rs, (r) => r.goals_against);
          return `<tr><td class="num ${s.row.position === 1 ? "pos-1" : ""}">${s.row.position}</td><td>${esc(s.team)}${s.row.cum_deduction ? ` <span class="muted">(−${s.row.cum_deduction} pts)</span>` : ""}</td><td class="num">${mw}</td><td class="num">${w}</td><td class="num">${dr}</td><td class="num">${mw - w - dr}</td><td class="num">${s.row.cum_goals_for}</td><td class="num">${ga}</td><td class="num">${s.row.cum_goal_diff > 0 ? "+" : ""}${s.row.cum_goal_diff}</td><td class="num"><b>${s.row.cum_points}</b></td></tr>`; }).join("") + "</tbody>";
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
    root.innerHTML = `<div class="row">${[0, 1, 2, 3].map((i) => `<div><label for="cmp${i}">Club ${i + 1}${i > 1 ? " (optional)" : ""}</label><select id="cmp${i}">${optionHtml(names, i > 1 ? "—" : "")}</select></div>`).join("")}</div>
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
      $("cmp-cards").innerHTML = sel.map((n) => { const t = teamsBy[n], g = t.current_ground; return `<div class="clubhead" style="border-color:${clubColor(n)}"><h3 style="color:${clubColor(n)}">${esc(n)}</h3>
        <div class="muted">${esc(t.city)} · founded ${t.founded} · ${t.status === "current" ? "in the 2026–27 Premier League" : t.status === "defunct" ? "defunct" : "former Premier League club"}</div>
        <div>${g ? `Ground: <b>${esc(g.name)}</b>${g.capacity ? ` (${int(g.capacity)})` : ""}` : "Ground: none (club dissolved)"} · ${t.stadiums.filter((s) => !s.temporary).length === 1 ? "one ground" : t.stadiums.filter((s) => !s.temporary).length + " grounds"} in all</div>
        <div class="muted" style="font-size:.85rem;margin-top:4px">${esc(t.summary.split(". ")[0])}.</div></div>`; }).join("");
      // season by season
      const byClubSeason = (club) => Object.fromEntries(d.finalTables.filter((r) => r.team === club).map((r) => [r.season, r]));
      const make = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), cfg); };
      make("cmp-pts", { type: "line", data: { labels: seasonsAll, datasets: sel.map((n) => { const b = byClubSeason(n); return { label: n, data: seasonsAll.map((s) => b[s]?.points ?? null), borderColor: clubColor(n), backgroundColor: clubColor(n), spanGaps: false, tension: 0.2, pointRadius: 3 }; }) }, options: { responsive: true, aspectRatio: 1.5, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { title: { display: true, text: "Points" } } } } });
      make("cmp-pos", { type: "line", data: { labels: seasonsAll, datasets: sel.map((n) => { const b = byClubSeason(n); return { label: n, data: seasonsAll.map((s) => b[s]?.position ?? null), borderColor: clubColor(n), backgroundColor: clubColor(n), spanGaps: false, tension: 0.2, pointRadius: 3 }; }) }, options: { responsive: true, aspectRatio: 1.5, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { reverse: true, min: 1, max: 22, title: { display: true, text: "Final position" } } } } });
      // all-time record + style
      const stats = sel.map((n) => {
        const ft = d.finalTables.filter((r) => r.team === n), ms = d.teamMatches.filter((r) => r.team === n);
        const played = ms.length, w = ms.filter((r) => r.result === "W").length, dr = ms.filter((r) => r.result === "D").length;
        const gf = C.sum(ms, (r) => r.goals_for), ga = C.sum(ms, (r) => r.goals_against);
        const cs = ms.filter((r) => r.goals_against === 0).length;
        return { n, seasons: ft.length, played, w, d: dr, l: played - w - dr, gf, ga, pts: C.sum(ft, (r) => r.points), titles: ft.filter((r) => r.position === 1).length,
          top4: ft.filter((r) => r.position <= 4).length, best: ft.length ? Math.min(...ft.map((r) => r.position)) : null, rel: ft.filter((r) => /relegated/i.test(r.outcome)).length,
          ppg: played ? C.sum(ft, (r) => r.points) / played : 0, gfpg: played ? gf / played : 0, gapg: played ? ga / played : 0, winp: played ? (100 * w) / played : 0, csp: played ? (100 * cs) / played : 0 };
      });
      const rows = [["Seasons in the Premier League", "seasons"], ["Matches played", "played"], ["Won", "w"], ["Drawn", "d"], ["Lost", "l"], ["Goals scored", "gf"], ["Goals conceded", "ga"], ["Points (official)", "pts"], ["Titles", "titles"], ["Top-four finishes", "top4"], ["Best finish", "best"], ["Relegations", "rel"]];
      $("cmp-tbl").innerHTML = `<thead><tr><th>Measure</th>${stats.map((s) => `<th class="num" style="color:${clubColor(s.n)}">${esc(PL.short(s.n))}</th>`).join("")}</tr></thead><tbody>` + rows.map(([l, k]) => `<tr><td>${l}</td>${stats.map((s) => `<td class="num">${s[k] === null ? "–" : int(s[k])}</td>`).join("")}</tr>`).join("") + "</tbody>";
      const mx = (k) => Math.max(...stats.map((s) => s[k])) || 1, mn = (k) => Math.min(...stats.map((s) => s[k])) || 1;
      make("cmp-radar", { type: "radar", data: { labels: ["Points per game", "Goals scored", "Goals conceded (fewer)", "Win %", "Clean sheets %"], datasets: sel.map((n, i) => { const s = stats[i]; return { label: n, data: [100 * s.ppg / mx("ppg"), 100 * s.gfpg / mx("gfpg"), 100 * mn("gapg") / s.gapg, 100 * s.winp / mx("winp"), 100 * s.csp / mx("csp")], borderColor: clubColor(n), backgroundColor: clubColor(n) + "33", pointBackgroundColor: clubColor(n) }; }) }, options: { responsive: true, aspectRatio: 1.3, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: "#ffffff22" }, angleLines: { color: "#ffffff22" } } }, plugins: { legend: { display: true } } } });
      // head to head
      if (sel.length === 2) {
        const [a, b] = sel, meet = d.matches.filter((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a));
        let wa = 0, wb = 0, dr = 0, ga = 0, gb = 0;
        for (const m of meet) { const ah = m.home === a; const fa = ah ? m.home_goals : m.away_goals, fb = ah ? m.away_goals : m.home_goals; ga += fa; gb += fb; fa > fb ? wa++ : fa < fb ? wb++ : dr++; }
        const last = [...meet].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 8);
        $("cmp-h2h").innerHTML = `<div class="card" style="margin-bottom:16px"><h3>Head to head in the Premier League (${meet.length} meetings)</h3>
          <div class="h2h"><div><div class="big" style="color:${clubColor(a)}">${wa}</div><div>${esc(a)} wins</div></div><div><div class="big">${dr}</div><div>draws</div></div><div><div class="big" style="color:${clubColor(b)}">${wb}</div><div>${esc(b)} wins</div></div></div>
          <div class="note" style="text-align:center">Goals: ${esc(a)} ${ga} – ${gb} ${esc(b)}</div>
          <div class="tablewrap" style="max-height:260px"><table class="plain"><thead><tr><th>Date</th><th>Home</th><th class="num">Score</th><th>Away</th></tr></thead><tbody>${last.map((m) => `<tr><td>${m.date}</td><td>${esc(m.home)}</td><td class="num">${m.home_goals}–${m.away_goals}</td><td>${esc(m.away)}</td></tr>`).join("")}</tbody></table></div>
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
    root.innerHTML = `<div class="row"><div><label for="s-season">Season</label><select id="s-season">${optionHtml(all)}</select></div></div><div id="s-body"></div>`;
    function draw() {
      const season = $("s-season").value, s = d.seasons.find((x) => x.season === season), h = d.honours.find((x) => x.season === season);
      const table = d.finalTables.filter((r) => r.season === season).sort((a, b) => a.position - b.position);
      const awards = d.awards.awards.filter((a) => a.season === season);
      const chips = (arr, cls) => (arr.length ? arr.map((x) => `<span class="chip ${cls || ""}">${esc(x)}</span>`).join("") : `<span class="muted">—</span>`);
      const bd = h.ballon_dor.player ? `${esc(h.ballon_dor.player)} <span class="muted">(${esc(h.ballon_dor.club || "")}, ${h.ballon_dor_year})</span>` : `<span class="muted">${esc(h.ballon_dor.note)}</span>`;
      const kp = [[s.champion, "Premier League champions"], [table[1].team, "Runners-up"], [h.champions_league.winner, `Champions League winners (${h.champions_league.score})`], [h.europa_league.winner, `UEFA Cup / Europa League winners (${h.europa_league.score})`], [h.world_cup ? h.world_cup.winner + " (" + h.world_cup.year + ")" : "—", "World Cup winners (summer after the season)"]];
      const byAward = C.byKey(awards, (a) => a.award);
      $("s-body").innerHTML = `<div class="kpis">${kp.map(([n, l]) => `<div class="kpi"><div class="n" style="font-size:1.1rem">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join("")}<div class="kpi"><div class="n" style="font-size:1.1rem">${bd}</div><div class="l">Ballon d'Or</div></div></div>
        <div class="grid2"><div class="card"><h3>Promoted to the Premier League afterwards</h3><div class="chips">${chips(s.promoted, "up")}</div>
          <h3 style="margin-top:14px">Relegated at the end of the season</h3><div class="chips">${chips(s.relegated, "down")}</div>
          <h3 style="margin-top:14px">Champions League places</h3><div class="chips">${chips(s.champions_league)}</div>
          <h3 style="margin-top:14px">UEFA Cup / Europa League places</h3><div class="chips">${chips(s.uefa_cup_europa_league)}</div>
          <h3 style="margin-top:14px">Top scorer${s.top_scorers.length > 1 ? "s" : ""}</h3><div class="chips">${chips(s.top_scorers.map((x) => x + (s.top_scorer_goals ? " (" + s.top_scorer_goals + ")" : "")))}</div></div>
        <div class="card"><h3>Every award this season</h3><div class="tablewrap" style="max-height:420px"><table class="plain"><tbody>${[...byAward].map(([k, list]) => `<tr><td class="muted">${esc(info[k]?.label || k)}</td><td>${list.map((a) => `<b>${esc(a.winner)}</b> <span class="muted">${esc(a.club || "")}${a.goals ? " · " + a.goals + " goals" : ""}${a.assists ? " · " + a.assists + " assists" : ""}${a.clean_sheets ? " · " + a.clean_sheets + " clean sheets" : ""}${a.score ? " · " + esc(a.score) + " v " + esc(a.opponent || "") : ""}</span>`).join("<br>")}</td></tr>`).join("")}</tbody></table></div></div></div>
        <div class="card"><h3>Final league table ${season}</h3><div class="tablewrap"><table class="plain"><thead><tr><th class="num">Pos</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th><th>Outcome</th></tr></thead><tbody>${table.map((r) => `<tr><td class="num ${r.position === 1 ? "pos-1" : ""}">${r.position}</td><td>${esc(r.team)}${r.points_deducted ? ` <span class="muted">(−${r.points_deducted})</span>` : ""}</td><td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.drawn}</td><td class="num">${r.lost}</td><td class="num">${r.goals_for}</td><td class="num">${r.goals_against}</td><td class="num">${r.goal_difference > 0 ? "+" : ""}${r.goal_difference}</td><td class="num"><b>${r.points}</b></td><td class="muted">${esc(r.outcome || "")}</td></tr>`).join("")}</tbody></table></div></div>`;
    }
    $("s-season").addEventListener("change", draw);
    draw();
  };

  // =====================================================================
  // PLAYER PROFILES (everyone in a 2026-27 squad)
  // =====================================================================
  initFns.players = function () {
    const root = $("panel-players"), P = d.players;
    root.innerHTML = `<div class="filters"><div><label for="p-club">Club</label><select id="p-club">${optionHtml([...new Set(P.map((p) => p.club))].sort(), "All clubs")}</select></div>
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
      $("p-count").textContent = `${int(list.length)} players in 2026–27 squads. Career figures are Premier League appearances from 2016–17 to 2025–26.`;
      $("p-grid").innerHTML = list.slice(0, shown).map((p, i) => `<button class="pcard" data-i="${i}"><img src="${esc(p.photo)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=avatar>${esc(initials(p.known_as))}</div>'"><div><b>${esc(p.known_as)}</b><small>${esc(p.club)}</small><small>${esc(p.position)}${p.age ? " · " + p.age : ""}</small><small>${p.premier_league_career.appearances ? int(p.premier_league_career.appearances) + " apps · " + int(p.premier_league_career.goals) + " goals" : "new to our data"}</small></div></button>`).join("");
      $("p-more").hidden = shown >= list.length;
      $("p-grid").querySelectorAll(".pcard").forEach((b) => b.addEventListener("click", () => open(list[+b.dataset.i])));
    }
    function open(p) {
      const c = p.premier_league_career, t = p.this_season, dlg = $("dlg");
      dlg.innerHTML = `<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px"><img src="${esc(p.photo)}" alt="" style="width:84px;height:106px;object-fit:cover;object-position:top;border-radius:12px;background:#2d1650" onerror="this.style.display='none'"><div><h3 style="margin:0">${esc(p.name)}</h3><div class="muted">${esc(p.club)} · ${esc(p.position)}${p.squad_number ? " · #" + p.squad_number : ""}</div><div class="muted">${p.birth_date ? "Born " + p.birth_date + " (age " + p.age + ")" : "Birth date not listed"} · at the club since ${esc(p.joined_club || "?")}</div><div>${esc(p.availability)}${p.news ? " — " + esc(p.news) : ""}</div></div></div>
        <div class="kpis"><div class="kpi"><div class="n">${int(c.appearances)}</div><div class="l">PL appearances 2016–26</div></div><div class="kpi"><div class="n">${int(c.goals)}</div><div class="l">goals</div></div><div class="kpi"><div class="n">${int(c.assists)}</div><div class="l">assists</div></div><div class="kpi"><div class="n">${int(t.minutes)}</div><div class="l">minutes in 2026–27 so far (${t.goals} goals, ${t.assists} assists)</div></div></div>
        ${c.seasons.length ? `<div class="tablewrap" style="max-height:260px"><table class="plain"><thead><tr><th>Season</th><th>Club</th><th class="num">Apps</th><th class="num">Min</th><th class="num">Goals</th><th class="num">Assists</th><th class="num">Yellow</th><th class="num">Red</th></tr></thead><tbody>${c.seasons.map((s) => `<tr><td>${s.season}</td><td>${esc(s.club)}</td><td class="num">${s.appearances}</td><td class="num">${int(s.minutes)}</td><td class="num">${s.goals}</td><td class="num">${s.assists}</td><td class="num">${s.yellow_cards}</td><td class="num">${s.red_cards}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No Premier League appearances in our 2016–17 to 2025–26 data.</p>`}
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
    root.innerHTML = `<div class="filters"><div><label for="t-season">Season</label><select id="t-season">${optionHtml(seasonsT)}</select></div>
      <div><label for="t-club">Club</label><select id="t-club">${optionHtml(clubsT, "All clubs")}</select></div>
      <div><label for="t-dir">Direction</label><select id="t-dir"><option value="">Signings and departures</option><option>Signing</option><option>Departure</option></select></div>
      <div><label for="t-kind">Type of move</label><select id="t-kind">${optionHtml(kinds, "All types")}</select></div>
      <div><label for="t-min">Minimum minutes</label><input id="t-min" type="number" min="0" value="0"></div></div>
      <p class="note">Derived from where players actually played, since no fees are available: a move is a player appearing for a different club than before (or, for 2026–27, comparing 2025–26 appearances with today's squad lists). Loans count as moves. "From outside the Premier League" also covers promoted youth players. Minutes are those in the later season for a signing, or the last season at the club for a departure.</p>
      <div class="kpis" id="t-kpis"></div><div class="grid2"><div class="card"><h3>Signings and departures by club</h3><canvas id="t-chart"></canvas></div>
      <div class="card"><h3>The moves</h3><div class="tablewrap" id="t-wrap"><table class="plain" id="t-tbl"></table></div></div></div>`;
    $("t-season").value = "2025–26";
    let chart;
    function draw() {
      const s = $("t-season").value, club = $("t-club").value, dir = $("t-dir").value, kind = $("t-kind").value, mn = +$("t-min").value || 0;
      const rows = T.filter((r) => r.season === s && (!club || r.club === club) && (!dir || r.direction === dir) && (!kind || r.kind === kind) && (r.minutes_that_season || 0) >= mn);
      const sig = rows.filter((r) => r.direction === "Signing").length, dep = rows.filter((r) => r.direction === "Departure").length;
      $("t-kpis").innerHTML = [[int(rows.length), "moves in view"], [int(sig), "signings"], [int(dep), "departures"], [int(rows.filter((r) => /another Premier League club|Mid-season/.test(r.kind) && r.direction === "Signing").length), "between Premier League clubs"]].map(([n, l]) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
      const clubs = C.byKey(rows, (r) => r.club);
      const items = [...clubs].map(([c, rs]) => ({ c, sig: rs.filter((r) => r.direction === "Signing").length, dep: rs.filter((r) => r.direction === "Departure").length })).sort((a, b) => b.sig + b.dep - (a.sig + a.dep)).slice(0, 14);
      if (chart) chart.destroy();
      chart = new Chart($("t-chart"), { type: "bar", data: { labels: items.map((x) => PL.short(x.c)), datasets: [{ label: "Signings", data: items.map((x) => x.sig), backgroundColor: "#00ff85cc" }, { label: "Departures", data: items.map((x) => x.dep), backgroundColor: "#ff2d78cc" }] }, options: { indexAxis: "y", responsive: true, aspectRatio: 1.1, plugins: { legend: { display: true } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { autoSkip: false, font: { size: 10 } } } } } });
      rows.sort((a, b) => (b.minutes_that_season || 0) - (a.minutes_that_season || 0));
      $("t-tbl").innerHTML = `<thead><tr><th>Club</th><th>Player</th><th></th><th>From → to</th><th class="num">Min</th></tr></thead><tbody>` + rows.slice(0, 300).map((r) => `<tr><td>${esc(r.club)}</td><td>${esc(r.player)} <span class="muted">${esc(r.position)}</span></td><td><span class="chip ${r.direction === "Signing" ? "up" : "down"}">${r.direction}</span></td><td class="muted">${esc(r.from_club || "outside the PL")} → ${esc(r.to_club || "left the PL")}<br>${esc(r.kind)}</td><td class="num">${int(r.minutes_that_season)}</td></tr>`).join("") + "</tbody>";
    }
    ["t-season", "t-club", "t-dir", "t-kind"].forEach((i) => $(i).addEventListener("change", draw));
    $("t-min").addEventListener("input", draw);
    draw();
  };

  const startTab = location.hash.slice(1);
  if (startTab && initFns[startTab]) document.querySelector(`.tab[data-tab="${startTab}"]`).click();
})();
