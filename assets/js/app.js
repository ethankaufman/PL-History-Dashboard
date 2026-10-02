/* Shared by both pages: navigation bar, data loading, number formatting, club colours, chart look. */
const PL = (() => {
  const files = {
    matches: "data/matches.csv", teamMatches: "data/team_matches.csv", finalTables: "data/final_tables.csv",
    playerMatches: "data/player_matches.csv", transfers: "data/transfers.csv",
    seasons: "data/seasons.json", awards: "data/awards.json", honours: "data/honours.json", teams: "data/teams.json",
    players: "data/current_players.json", map: "data/uk_map.json", cities: "data/cities.json", badges: "data/badges.json", cityCase: "data/city_case.json",
    domestic: "data/domestic_honours.json", records: "data/records.json", playerSeasons: "data/player_seasons.csv", appearances: "data/appearances_lean.csv", audit: "data/audit.json", manifest: "data/manifest.json", disagreements: "data/source_disagreements.csv",
  };
  // approximate download sizes (MB) so the progress bar moves smoothly
  const weight = { matches: 2, teamMatches: 6, finalTables: 0.2, playerMatches: 14, transfers: 0.6, seasons: 0.1, awards: 0.2, honours: 0.1, teams: 0.4, players: 0.8, map: 0.1, cities: 0.01, badges: 0.01, cityCase: 0.01, domestic: 0.15, records: 0.2, playerSeasons: 1.8, appearances: 12, audit: 0.1, manifest: 0.01, disagreements: 0.3 };

  async function load(names, onProgress) {
    const total = names.reduce((s, n) => s + weight[n], 0);
    let done = 0;
    const out = {};
    await Promise.all(names.map(async (name) => {
      const res = await fetch(files[name]);
      if (!res.ok) throw new Error(`Could not load ${files[name]} (${res.status})`);
      const text = await res.text();
      out[name] = files[name].endsWith(".csv")
        ? Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data
        : JSON.parse(text);
      done += weight[name];
      if (onProgress) onProgress(done / total, name);
    }));
    return out;
  }

  function renderNav(active) {
    const el = document.getElementById("nav");
    if (!el) return;
    el.className = "nav";
    el.innerHTML = `<div class="wrap">
      <a class="brand" href="index.html"><span class="dot"></span>PL&nbsp;History</a>
      <a class="link ${active === "report" ? "active" : ""}" href="index.html">Report</a>
      <a class="link ${active === "dashboard" ? "active" : ""}" href="dashboard.html">Dashboard</a>
      <span class="spacer"></span>
      ${active === "report" ? '<button class="btn small" id="open-map" type="button">Club map</button>' : ""}
      <a class="link" href="https://github.com/ethankaufman/PL-History-Dashboard" target="_blank" rel="noopener">GitHub</a>
    </div>`;
  }

  const int = (n) => (n === null || n === undefined || Number.isNaN(n) ? "–" : Math.round(n).toLocaleString("en-GB"));
  const dec = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? "–" : Number(n).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? "–" : dec(n, d) + "%");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (s) => String(s).replace(/ (United|City|Town|Rovers|Athletic|Wanderers|Albion|Hotspur|County|Wednesday|Rangers|Forest)$/, " $1");

  // one colour per club. Two sets: darker, saturated colours for white surfaces (charts) and lighter ones for the dark intro map.
  const clubColorsLight = {
    "Arsenal": "#db0007", "Aston Villa": "#7b1e3a", "AFC Bournemouth": "#b91c1c", "Brentford": "#e30613", "Brighton & Hove Albion": "#0057b8",
    "Burnley": "#6c1d45", "Chelsea": "#034694", "Crystal Palace": "#c4122e", "Everton": "#003399", "Fulham": "#333333", "Leeds United": "#d4a900",
    "Leicester City": "#2b3a9e", "Liverpool": "#b3001b", "Manchester City": "#5aa9e0", "Manchester United": "#e03a2f", "Newcastle United": "#222222",
    "Nottingham Forest": "#c8102e", "Southampton": "#d71920", "Tottenham Hotspur": "#132257", "Sunderland": "#d71921", "West Ham United": "#7a263a",
    "Wolverhampton Wanderers": "#e6a100", "Coventry City": "#2aa8cc", "Hull City": "#e8891d", "Ipswich Town": "#1f4bb3", "Blackburn Rovers": "#0b86c4",
    "Middlesbrough": "#d0021b", "Sheffield United": "#c8102e", "Sheffield Wednesday": "#0e4c92", "Norwich City": "#00a650", "Stoke City": "#d12027",
    "Watford": "#d9c200", "West Bromwich Albion": "#122f67", "Wigan Athletic": "#1d59af", "Swansea City": "#555555", "Cardiff City": "#0070b5",
    "Bolton Wanderers": "#263c7e", "Birmingham City": "#2a2aff", "Charlton Athletic": "#d4021d", "Derby County": "#222222", "Portsmouth": "#001489",
    "Reading": "#004494", "Queens Park Rangers": "#1d5ba4", "Blackpool": "#f68712", "Huddersfield Town": "#0e63ad", "Luton Town": "#f78f1e",
    "Barnsley": "#d71920", "Bradford City": "#a32035", "Oldham Athletic": "#0066b3", "Swindon Town": "#d6001c", "Wimbledon": "#1a3fa0",
  };
  const clubColorsDark = {
    "Arsenal": "#ef3340", "Aston Villa": "#95bfe5", "AFC Bournemouth": "#e5383b", "Brentford": "#ff4d5a", "Brighton & Hove Albion": "#4da3ff",
    "Burnley": "#b0457a", "Chelsea": "#2f7de1", "Crystal Palace": "#d6324e", "Everton": "#5a7bea", "Fulham": "#d8d8d8", "Leeds United": "#ffd60a",
    "Leicester City": "#4a78e6", "Liverpool": "#e0243c", "Manchester City": "#6cc4f0", "Manchester United": "#e8342a", "Newcastle United": "#c9c9c9",
    "Nottingham Forest": "#e84a50", "Southampton": "#e0383f", "Tottenham Hotspur": "#f0f0f8", "Sunderland": "#ff5a67", "West Ham United": "#c85a78",
    "Wolverhampton Wanderers": "#fdb913", "Coventry City": "#59cbe8", "Hull City": "#f5a12d", "Ipswich Town": "#4f7fc4", "Blackburn Rovers": "#58a6f2",
  };
  const lighten = (hex, k = 0.5) => {
    const n = parseInt(hex.slice(1), 16), mix = (c) => Math.round(c + (255 - c) * k);
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  };
  const clubColor = (name, onDark = false) => {
    if (onDark) {
      if (clubColorsDark[name]) return clubColorsDark[name];
      if (clubColorsLight[name]) return lighten(clubColorsLight[name]);
      let h = 0;
      for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
      return `hsl(${h} 70% 70%)`;
    }
    if (clubColorsLight[name]) return clubColorsLight[name];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 65% 38%)`;
  };

  // club crests: saved by scripts/fetch_badges.py as assets/badges/<club name with underscores>.png
  const badge = (name) => "assets/badges/" + String(name).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + ".png";

  // generic series colours: the Premier League purple first, then its pink, then softer partners
  const palette = ["#38003c", "#e90052", "#00c76f", "#0aa5c2", "#963cff", "#f2a900", "#5b1a66", "#8a7b92"];

  function chartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#5a4666";
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.borderColor = "rgba(56,0,60,0.10)";
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = "#38003c";
    Chart.defaults.plugins.tooltip.titleColor = "#ffffff";
    Chart.defaults.plugins.tooltip.bodyColor = "#f1e6f5";
    Chart.defaults.plugins.tooltip.borderColor = "#00ff85";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.animation.duration = 500;
  }

  // ---- the Manchester City asterisk (data/city_case.json): seasons 2009-10 to 2017-18 are flagged, nothing is removed ----
  let CASE = null, caseFrom = 0, caseTo = 0;
  function setCase(c) { CASE = c; caseFrom = +c.first_season.slice(0, 4); caseTo = +c.last_season.slice(0, 4); }
  const flagYear = (club, y) => !!CASE && club === CASE.club && y >= caseFrom && y <= caseTo;
  const flagged = (club, season) => flagYear(club, +String(season).slice(0, 4));             // a season label such as "2011–12", or a year
  const flaggedDate = (club, iso) => !!CASE && club === CASE.club && iso >= CASE.window_start && iso <= CASE.window_end;
  const flaggedRun = (club, from, to) => !!CASE && club === CASE.club && from <= CASE.window_end && to >= CASE.window_start;
  const isCaseClub = (club) => !!CASE && club === CASE.club;
  const star = (on) => (on && CASE ? `<a class="star" href="#city-note" title="${esc(CASE.short)}">*</a>` : "");   // clickable asterisk (HTML)
  const starText = (on) => (on && CASE ? "*" : "");                                                              // plain asterisk for chart labels
  const starOpensNote = (e) => { const a = e.target.closest && e.target.closest("a.star"); const box = document.getElementById("city-note"); if (a && box && box.tagName === "DETAILS") box.open = true; };
  document.addEventListener("click", starOpensNote);
  function caseBox() {
    if (!CASE) return "";
    return `<h2>${CASE.title}</h2><p class="muted" style="margin-top:-6px">Status as of ${new Date(CASE.as_of + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>${CASE.paragraphs.map((p) => `<p>${p}</p>`).join("")}
      <table class="plain"><thead><tr><th class="num">Charges</th><th>What</th><th>Period</th><th>Outcome</th></tr></thead><tbody>${CASE.charges.map((c) => `<tr><td class="num">${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td><td>${c[3]}</td></tr>`).join("")}</tbody></table>
      <p class="note">Sources: ${CASE.sources.map((x) => `<a href="${x.url}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join("; ")}.</p>`;
  }

  // ---- club facts shared by the map card and the dashboard ----
  const ordinal = (n) => { const v = n % 100; return n + (["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"); };
  const year = (d) => String(d).slice(0, 4);
  // domestic trophy chips; for the flagged club each chip also says how many of those trophies fall in the flagged seasons
  function trophyChips(c, club, entry) {
    if (!c) return "";
    const n = (list) => (club && entry && list ? list.filter((x) => flagged(club, x)).length : 0);
    const item = (count, label, flaggedCount) => `<span class="chip ${count ? "up" : ""}"><b>${count}</b> ${label}${flaggedCount ? ` ${star(true)}<small>(${flaggedCount} flagged)</small>` : ""}</span>`;
    return item(c.league, "league title" + (c.league === 1 ? "" : "s"), n(entry?.league_titles)) + item(c.fa_cup, "FA Cup" + (c.fa_cup === 1 ? "" : "s"), n(entry?.fa_cup)) +
      item(c.league_cup, "League Cup" + (c.league_cup === 1 ? "" : "s"), n(entry?.league_cup)) + item(c.community_shield, "Community Shield" + (c.community_shield === 1 ? "" : "s"), n(entry?.community_shield));
  }
  function recordLines(r, club) {
    if (!r) return [];
    const m = (x) => (x ? `${x.score} ${esc(x.home)} v ${esc(x.away)} (${year(x.date)})${star(flaggedDate(club, x.date))}` : "–");
    const run = (x) => (x ? `${x.length} games (${x.from_season === x.to_season ? x.from_season : x.from_season + " to " + x.to_season})${star(flaggedRun(club, x.from, x.to))}` : "–");
    return [
      ["Best finish", `${ordinal(r.best_finish.position)} in ${r.best_finish.season} (${r.best_finish.points} points)${star(flagged(club, r.best_finish.season))}`],
      ["Most points in a season", `${r.most_points.points} in ${r.most_points.season}${star(flagged(club, r.most_points.season))}`],
      ["Most goals in a season", `${r.most_goals_scored.goals_for} in ${r.most_goals_scored.season}${star(flagged(club, r.most_goals_scored.season))}`],
      ["Biggest win", m(r.biggest_win)], ["Heaviest defeat", m(r.biggest_defeat)],
      ["Longest unbeaten run", run(r.longest_unbeaten)], ["Longest winning run", run(r.longest_winning)], ["Longest losing run", run(r.longest_losing)],
      ["Top Premier League scorer", esc(r.top_scorer)],
    ];
  }

  return { load, renderNav, ordinal, trophyChips, recordLines, setCase, flagged, flagYear, flaggedDate, flaggedRun, isCaseClub, star, starText, caseBox, get caseData() { return CASE; }, int, dec, pct, esc, short, clubColor, badge, palette, chartDefaults };
})();
