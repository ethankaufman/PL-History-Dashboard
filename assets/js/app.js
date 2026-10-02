/* Shared by both pages: navigation bar, data loading, number formatting, club colours, chart look. */
const PL = (() => {
  const files = {
    matches: "data/matches.csv", teamMatches: "data/team_matches.csv", finalTables: "data/final_tables.csv",
    playerMatches: "data/player_matches.csv", transfers: "data/transfers.csv",
    seasons: "data/seasons.json", awards: "data/awards.json", honours: "data/honours.json", teams: "data/teams.json",
    players: "data/current_players.json", map: "data/uk_map.json",
  };
  // approximate download sizes (MB) so the progress bar moves smoothly
  const weight = { matches: 2, teamMatches: 6, finalTables: 0.2, playerMatches: 14, transfers: 0.6, seasons: 0.1, awards: 0.2, honours: 0.1, teams: 0.4, players: 0.8, map: 0.1 };

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

  // one colour per club (readable on the dark background); unknown clubs get a stable colour from their name
  const clubColors = {
    "Arsenal": "#ef3340", "Aston Villa": "#95bfe5", "AFC Bournemouth": "#e5383b", "Brentford": "#ff4d5a", "Brighton & Hove Albion": "#4da3ff",
    "Burnley": "#b0457a", "Chelsea": "#2f7de1", "Crystal Palace": "#d6324e", "Everton": "#5a7bea", "Fulham": "#d8d8d8", "Leeds United": "#ffd60a",
    "Leicester City": "#4a78e6", "Liverpool": "#e0243c", "Manchester City": "#6cc4f0", "Manchester United": "#e8342a", "Newcastle United": "#c9c9c9",
    "Nottingham Forest": "#e84a50", "Southampton": "#e0383f", "Tottenham Hotspur": "#f0f0f8", "Sunderland": "#ff5a67", "West Ham United": "#c85a78",
    "Wolverhampton Wanderers": "#fdb913", "Coventry City": "#59cbe8", "Hull City": "#f5a12d", "Ipswich Town": "#4f7fc4", "Blackburn Rovers": "#58a6f2",
    "Middlesbrough": "#ff4b4b", "Sheffield United": "#ff3b3b", "Sheffield Wednesday": "#6d8cff", "Norwich City": "#ffe14d", "Stoke City": "#ff5252",
    "Watford": "#ffe94a", "West Bromwich Albion": "#5b8def", "Wigan Athletic": "#4d7cff", "Swansea City": "#e8e8e8", "Cardiff City": "#4d83ff",
    "Bolton Wanderers": "#7a9cff", "Birmingham City": "#4f7dff", "Charlton Athletic": "#ff4d4d", "Derby County": "#d9d9d9", "Portsmouth": "#4a7bff",
    "Reading": "#5f8dff", "Queens Park Rangers": "#6aa0ff", "Blackpool": "#ff9a2e", "Huddersfield Town": "#5aa0ff", "Luton Town": "#ff8a2a",
    "Barnsley": "#ff5555", "Bradford City": "#d4a017", "Oldham Athletic": "#4d7bff", "Swindon Town": "#ff5a5a", "Wimbledon": "#ffd54a",
  };
  const clubColor = (name) => {
    if (clubColors[name]) return clubColors[name];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 70% 62%)`;
  };

  const palette = ["#00ff85", "#ff2d78", "#04f5ff", "#ffc83d", "#b388ff", "#ff8a3d", "#7bd88f", "#5aa9ff"];

  function chartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#b9abd3";
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.borderColor = "rgba(255,255,255,0.08)";
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = "#0d0416ee";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(0,255,133,0.5)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.animation.duration = 500;
  }

  return { load, renderNav, int, dec, pct, esc, short, clubColor, palette, chartDefaults };
})();
