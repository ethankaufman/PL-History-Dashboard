/* Intro: an interactive spinning football while the data loads; when the load succeeds it explodes into a rotating
 * map of the UK showing where every club plays. Also loads the data and then draws the report underneath.
 */
import * as THREE from "../vendor/three.module.min.js";

const REPORT_DATA = ["matches", "teamMatches", "finalTables", "seasons", "awards", "honours", "teams", "map", "domestic", "records", "playerSeasons", "audit", "disagreements", "manifest"];
const CODES = { "Arsenal": "ARS", "Aston Villa": "AVL", "AFC Bournemouth": "BOU", "Brentford": "BRE", "Brighton & Hove Albion": "BHA", "Chelsea": "CHE", "Coventry City": "COV", "Crystal Palace": "CRY", "Everton": "EVE", "Fulham": "FUL", "Hull City": "HUL", "Ipswich Town": "IPS", "Leeds United": "LEE", "Liverpool": "LIV", "Manchester City": "MCI", "Manchester United": "MUN", "Newcastle United": "NEW", "Nottingham Forest": "NFO", "Tottenham Hotspur": "TOT", "Sunderland": "SUN" };

const root = document.getElementById("intro");
const statusEl = document.getElementById("intro-status");
const barEl = document.getElementById("intro-bar");
const hintEl = document.getElementById("intro-hint");
const enterBtn = document.getElementById("intro-enter");
const skipBtn = document.getElementById("intro-skip");
const tooltip = document.getElementById("intro-tip");
const card = document.getElementById("club-card");
const labelsEl = document.getElementById("intro-labels");

let reportDone = false;
function finishWithoutIntro(data) {
  root.classList.add("hidden");
  document.body.classList.remove("no-scroll");
  if (!reportDone && data) { reportDone = true; renderReport(data); }
}
let loadFailed = false;
function showError(err) {
  loadFailed = true;
  console.error(err);
  statusEl.innerHTML = `<span style="color:#ff7aa5">Couldn't load the data (${PL.esc(err.message)}).</span> <button class="btn small" onclick="location.reload()">Try again</button>`;
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let renderer = null;
try {
  const test = document.createElement("canvas");
  if (reduceMotion || !(test.getContext("webgl2") || test.getContext("webgl"))) throw new Error("no webgl or reduced motion");
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("intro-canvas"), antialias: true, alpha: true });
} catch (e) { renderer = null; }

document.body.classList.add("no-scroll");
PL.renderNav("report");

if (!renderer) {
  // no 3D available (or the visitor asked for less motion): skip the show, still load everything
  statusEl.textContent = "Loading Premier League data…";
  PL.load(REPORT_DATA, (p) => { if (!loadFailed) barEl.style.width = Math.round(p * 100) + "%"; }).then((d) => { window.PLDATA = d; finishWithoutIntro(d); setupMapButton(null, d); }).catch(showError);
} else {
  runIntro();
}

function setupMapButton(api) {
  const b = document.getElementById("open-map");
  if (b && api) b.addEventListener("click", () => api.reopen());
  else if (b) b.style.display = "none";
}

function runIntro() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7);
  const clock = new THREE.Clock();

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------- the ball ----------------
  const phi = (1 + Math.sqrt(5)) / 2;
  const norm = (a) => new THREE.Vector3(...a).normalize();
  const pent = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) { pent.push(norm([0, a, b]), norm([a, b, 0]), norm([b, 0, a])); }
  const hex = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) hex.push(norm([a, b, c]));
  for (const a of [-1, 1]) for (const b of [-phi, phi]) { hex.push(norm([0, b, a / phi]), norm([a / phi, 0, b]), norm([b, a / phi, 0])); }

  const geo = new THREE.IcosahedronGeometry(1, 7);   // already non-indexed: every triangle can fly off separately
  const posA = geo.attributes.position;
  const faces = posA.count / 3;
  const aCenter = new Float32Array(posA.count * 3), aAxis = new Float32Array(posA.count * 3), aSpeed = new Float32Array(posA.count), aSpin = new Float32Array(posA.count);
  for (let f = 0; f < faces; f++) {
    const c = new THREE.Vector3();
    for (let v = 0; v < 3; v++) c.add(new THREE.Vector3().fromBufferAttribute(posA, f * 3 + v));
    c.divideScalar(3);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const speed = 1.6 + Math.random() * 3.6, spin = (Math.random() - 0.5) * 14;
    for (let v = 0; v < 3; v++) {
      const i = f * 3 + v;
      aCenter.set([c.x, c.y, c.z], i * 3); aAxis.set([axis.x, axis.y, axis.z], i * 3); aSpeed[i] = speed; aSpin[i] = spin;
    }
  }
  geo.setAttribute("aCenter", new THREE.BufferAttribute(aCenter, 3));
  geo.setAttribute("aAxis", new THREE.BufferAttribute(aAxis, 3));
  geo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
  geo.setAttribute("aSpin", new THREE.BufferAttribute(aSpin, 1));

  const ballMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uT: { value: 0 }, uFade: { value: 1 }, uPent: { value: pent }, uHex: { value: hex } },
    vertexShader: `
      uniform float uT; attribute vec3 aCenter; attribute vec3 aAxis; attribute float aSpeed; attribute float aSpin;
      varying vec3 vDir; varying vec3 vN; varying vec3 vView;
      vec3 rot(vec3 v, vec3 axis, float a){ float c = cos(a), s = sin(a); return v*c + cross(axis, v)*s + axis*dot(axis, v)*(1.0-c); }
      void main(){
        vDir = normalize(position);
        vec3 p = aCenter + rot(position - aCenter, aAxis, aSpin*uT);
        p += normalize(aCenter) * aSpeed * uT;
        vN = normalize(normalMatrix * rot(vDir, aAxis, aSpin*uT));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uPent[12]; uniform vec3 uHex[20]; uniform float uFade;
      varying vec3 vDir; varying vec3 vN; varying vec3 vView;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 p = normalize(vDir);
        // panel seams (a faint football-panel grid)
        float best = 10.0, second = 10.0;
        for (int i = 0; i < 12; i++) { float a = acos(clamp(dot(p, uPent[i]), -1.0, 1.0)) / 0.652; if (a < best) { second = best; best = a; } else if (a < second) { second = a; } }
        for (int i = 0; i < 20; i++) { float a = acos(clamp(dot(p, uHex[i]), -1.0, 1.0)) / 0.730; if (a < best) { second = best; best = a; } else if (a < second) { second = a; } }
        float seam = 1.0 - smoothstep(0.0, 0.045, second - best);
        // jagged, staggered bursts of pink and purple across a white ball (Puma Stellar Nitro Ultimate colourway)
        float w1 = p.y * 2.3 + 0.62 * abs(fract(p.x * 3.3 + p.z * 1.9) - 0.5) + 0.16 * noise(p * 5.0);
        float w2 = p.x * 2.0 - 0.55 * abs(fract(p.z * 3.9 + p.y * 2.4) - 0.5) + 0.16 * noise(p * 5.0 + 7.0);
        float z1 = abs(fract(w1) - 0.5), z2 = abs(fract(w2 + 0.31) - 0.5);
        float b1 = smoothstep(0.355, 0.375, z1), b2 = smoothstep(0.375, 0.395, z2);
        vec3 pink = mix(vec3(1.0, 0.12, 0.62), vec3(1.0, 0.42, 0.86), noise(p * 4.0 + 3.0));
        vec3 purple = mix(vec3(0.30, 0.06, 0.72), vec3(0.58, 0.28, 0.98), p.y * 0.5 + 0.5);
        vec3 base = vec3(0.97, 0.96, 1.0);
        base = mix(base, pink, b1);
        base = mix(base, purple, b2 * 0.95);
        base = mix(base, vec3(0.62, 0.56, 0.74), seam * 0.75);
        vec3 N = normalize(vN), L = normalize(vec3(-0.5, 0.7, 0.8)), V = normalize(vView), H = normalize(L + V);
        float diff = max(dot(N, L), 0.0) * 0.7 + 0.38;
        float spec = pow(max(dot(N, H), 0.0), 70.0) * 0.6;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = base * diff + spec + rim * vec3(0.0, 1.0, 0.52) * 0.4;
        gl_FragColor = vec4(col, uFade);
      }`,
  });
  const ball = new THREE.Mesh(geo, ballMat);
  ball.frustumCulled = false;
  const ballGroup = new THREE.Group();
  ballGroup.add(ball);
  scene.add(ballGroup);
  ballGroup.scale.setScalar(1.55);

  // ball interaction: drag to spin, click to kick
  const spinVel = new THREE.Vector2(0.35, 0.9);   // radians per second about x and y
  let dragging = false, last = { x: 0, y: 0 }, moved = 0, kick = 0, bounceVel = 0;
  const dom = renderer.domElement;
  let panning = false;
  dom.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; panning = e.shiftKey || e.button === 2; last = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); viewAnim = false; hideChooser(); });
  dom.addEventListener("contextmenu", (e) => e.preventDefault());
  dom.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    moved += Math.abs(dx) + Math.abs(dy);
    last = { x: e.clientX, y: e.clientY };
    if (mode === "ball") { spinVel.y = dx * 0.06; spinVel.x = dy * 0.06; }
    else if (panning) { const k = camera.position.z * 0.0012; tilt.position.x += dx * k; tilt.position.y -= dy * k / Math.max(0.35, Math.cos(tilt.rotation.x)) * 0.6; tilt.position.clampLength(0, 9); autoSpin = false; }
    else { mapSpin.rotation.z -= dx * 0.006; tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + dy * 0.004, -1.35, -0.2); }
  });
  dom.addEventListener("pointerup", (e) => {
    if (dragging && moved < 6 && mode === "ball") { kick = 1; bounceVel = 4.2; spinVel.y += 6; spinVel.x += 3; hintEl.textContent = "Nice kick!"; }
    if (dragging && moved < 6 && mode === "map") handleMapClick(e);
    dragging = false;
  });
  // zoom towards the mouse pointer, so the club you are pointing at stays under it
  const plane = new THREE.Plane(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function mapPointUnder(clientX, clientY) {
    const r = dom.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(tilt.quaternion), tilt.position);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }
  function zoomBy(factor, cx, cy) {
    const before = cx !== undefined ? mapPointUnder(cx, cy) : null;
    camera.position.z = THREE.MathUtils.clamp(camera.position.z * factor, 0.9, 12);
    if (before) { const after = mapPointUnder(cx, cy); if (after) tilt.position.add(after.sub(before)); tilt.position.clampLength(0, 9); }
    targetZ = camera.position.z; viewAnim = false; if (camera.position.z < 5.5) autoSpin = false;
  }
  dom.addEventListener("wheel", (e) => { if (mode === "map") { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0016), e.clientX, e.clientY); } }, { passive: false });

  // ---------------- explosion extras ----------------
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.0, 96), new THREE.MeshBasicMaterial({ color: 0x00ff85, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.visible = false; scene.add(ring);
  const sparkN = 700, sparkGeo = new THREE.BufferGeometry(), sparkPos = new Float32Array(sparkN * 3), sparkVel = [];
  for (let i = 0; i < sparkN; i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 5); sparkVel.push(v); }
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xbaffd9, size: 0.045, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.visible = false; sparks.frustumCulled = false; scene.add(sparks);

  // ---------------- the map ----------------
  let mode = "ball";                       // ball -> exploding -> map
  const tilt = new THREE.Group(), mapSpin = new THREE.Group(), pinGroup = new THREE.Group();
  tilt.rotation.x = -0.95; tilt.visible = false;
  tilt.add(mapSpin); scene.add(tilt);
  const K = 0.46, LON0 = -2.2, LAT0 = 53.2, COS = Math.cos((54 * Math.PI) / 180);
  const project = (lon, lat) => new THREE.Vector3((lon - LON0) * COS * K * 1.0, (lat - LAT0) * K, 0);
  const pins = [], pinMeshes = [], labelDivs = [];
  let showAll = false, hovered = null, pausedUntil = 0;

  function buildMap(data) {
    function addPolys(rings, fillColor, lineColor, fillOpacity, lineOpacity, z) {
      for (const ring of rings) {
        const pts = ring.map(([lo, la]) => project(lo, la));
        const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: fillColor, transparent: true, opacity: fillOpacity, depthWrite: false }));
        mesh.position.z = z; mapSpin.add(mesh);
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: lineOpacity }));
        line.position.z = z + 0.002; mapSpin.add(line);
      }
    }
    addPolys(data.map.ireland, 0x3a0a42, 0x9a6aa5, 0.75, 0.6, 0);
    addPolys(data.map.uk, 0x5a1565, 0x00ff85, 0.97, 0.95, 0.01);
    // faint graticule for a "radar" look
    const grid = new THREE.GridHelper(14, 28, 0x00ff85, 0x6a2a75); grid.rotation.x = Math.PI / 2; grid.position.z = -0.02; grid.material.transparent = true; grid.material.opacity = 0.35; mapSpin.add(grid);
    mapSpin.add(pinGroup);
    data.teams.forEach((t) => {
      const cur = t.status === "current";
      const p = project(t.map.lng, t.map.lat);
      const col = new THREE.Color(PL.clubColor(t.name, true));
      const g = new THREE.Group(); g.position.copy(p);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cur ? 0.34 : 0.2, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: cur ? 0.9 : 0.5 }));
      stem.rotation.x = Math.PI / 2; stem.position.z = cur ? 0.17 : 0.1; g.add(stem);
      const head = new THREE.Mesh(new THREE.SphereGeometry(cur ? 0.065 : 0.04, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: cur ? 1 : 0.6 }));
      head.position.z = cur ? 0.36 : 0.21; head.userData.team = t; g.add(head);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      halo.position.z = 0.02; g.add(halo);
      g.visible = cur; g.scale.setScalar(0.001);
      pinGroup.add(g);
      pins.push({ team: t, group: g, head, halo, cur, delay: 0 });
      pinMeshes.push(head);
      if (cur) {
        const d = document.createElement("div"); d.className = "plabel"; d.textContent = CODES[t.name] || t.name.slice(0, 3).toUpperCase();
        d.style.color = PL.clubColor(t.name, true); labelsEl.appendChild(d); labelDivs.push({ el: d, pos: p.clone().setZ(0.5), pin: pins[pins.length - 1] });
      }
    });
    window.__introPins = pins;   // handy for testing in the browser console
    pins.filter((x) => x.cur).forEach((x, i) => (x.delay = 0.04 * i));
    pins.filter((x) => !x.cur).forEach((x, i) => (x.delay = 0.9 + 0.02 * i));
  }

  // Picking: choose the pin whose on-screen position is closest to the pointer. Pins that sit very close together on screen
  // (London, Manchester, Merseyside...) form a group; hovering lists the group and clicking lets you choose one.
  const pickPx = () => (camera.position.z > 3 ? 16 : 11), groupPx = () => (camera.position.z > 3 ? 20 : 12);
  function visiblePins() { return pins.filter((p) => p.group.visible && p.sx !== undefined && p.group.scale.x > 0.05); }
  function pickAt(x, y) {
    const r = dom.getBoundingClientRect(); x -= r.left; y -= r.top;
    let best = null, bd = pickPx();
    for (const p of visiblePins()) { const d = Math.hypot(p.sx - x, p.sy - y); if (d < bd) { bd = d; best = p; } }
    if (!best) return null;
    const group = visiblePins().filter((p) => Math.hypot(p.sx - best.sx, p.sy - best.sy) < groupPx()).sort((a, b) => a.team.city.localeCompare(b.team.city) || a.team.name.localeCompare(b.team.name));
    return { pin: best, group };
  }
  dom.addEventListener("pointermove", (e) => {
    if (mode !== "map" || dragging) return;
    const hit = pickAt(e.clientX, e.clientY);
    hovered = hit ? hit.pin.team : null;
    dom.style.cursor = hovered ? "pointer" : "grab";
    if (hit) {
      pausedUntil = performance.now() + 600;
      tooltip.hidden = false;
      tooltip.style.left = e.clientX + 14 + "px"; tooltip.style.top = e.clientY + 14 + "px";
      if (hit.group.length > 1) {
        tooltip.innerHTML = `<b>${hit.group.length} clubs close together</b><br>` + hit.group.map((p) => `<span style="color:${PL.clubColor(p.team.name, true)}">●</span> ${PL.esc(p.team.name)}`).join("<br>") + `<br><span class="muted">Click to choose · scroll to zoom in</span>`;
      } else {
        const g = hovered.current_ground;
        tooltip.innerHTML = `<b>${PL.esc(hovered.name)}</b><br><span class="muted">${PL.esc(g ? g.name : "Defunct (home 1912–91)")} · ${PL.esc(hovered.city)}</span>`;
      }
    } else tooltip.hidden = true;
  });
  const chooser = document.getElementById("cluster-menu");
  function hideChooser() { chooser.hidden = true; }
  function handleMapClick(e) {
    const hit = pickAt(e.clientX, e.clientY);
    if (!hit) { hideChooser(); return; }
    if (hit.group.length === 1) { hideChooser(); openCard(hit.pin.team); return; }
    chooser.innerHTML = `<div class="muted" style="margin-bottom:6px">${hit.group.length} clubs here, pick one:</div>` + hit.group.map((p, i) => `<button data-i="${i}" class="btn small" style="border-color:${PL.clubColor(p.team.name, true)}">${PL.esc(p.team.name)}</button>`).join("");
    chooser.hidden = false; tooltip.hidden = true;
    chooser.style.left = Math.min(e.clientX + 10, window.innerWidth - 230) + "px"; chooser.style.top = Math.min(e.clientY + 10, window.innerHeight - 40 - hit.group.length * 36) + "px";
    chooser.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { hideChooser(); openCard(hit.group[+b.dataset.i].team); }));
  }

  // quick views and zoom buttons
  let viewAnim = false, targetZ = 7, targetPos = new THREE.Vector3(), targetTilt = -0.95, autoSpin = true;
  function flyTo(lon, lat, z) {
    const M = project(lon, lat);
    targetPos = M.clone().applyEuler(new THREE.Euler(-0.95, 0, 0)).negate();
    targetZ = z; targetTilt = -0.95; viewAnim = true; autoSpin = false; card.hidden = true; hideChooser();
  }
  function resetView() { targetPos = new THREE.Vector3(); targetZ = 7; targetTilt = -0.95; viewAnim = true; autoSpin = true; hideChooser(); }
  document.getElementById("intro-london").addEventListener("click", () => flyTo(-0.14, 51.50, 1.15));
  document.getElementById("intro-manc").addEventListener("click", () => flyTo(-2.6, 53.43, 1.7));
  document.getElementById("intro-reset").addEventListener("click", resetView);
  document.getElementById("intro-zin").addEventListener("click", () => zoomBy(0.7));
  document.getElementById("intro-zout").addEventListener("click", () => zoomBy(1.4));

  function openCard(t) {
    tooltip.hidden = true;
    const rows = t.stadiums.map((s) => `<li${s.current ? ' class="cur"' : ""}><b>${PL.esc(s.name)}</b> <span class="muted">${s.from ?? "?"}–${s.current ? "now" : s.to ?? "?"}${s.temporary ? " · temporary" : ""}</span></li>`).join("");
    const pl = t.premier_league;
    card.innerHTML = `<button class="x" aria-label="Close" id="card-x">×</button><div class="eyebrow">${t.status === "current" ? "In the 2026–27 Premier League" : t.status === "defunct" ? "Defunct club" : "Former Premier League club"}</div>
      <h3 style="color:${PL.clubColor(t.name, true)}">${PL.esc(t.name)}</h3>
      <p class="muted">${PL.esc(t.city)}${t.area ? " (" + PL.esc(t.area) + ")" : ""} · founded ${t.founded} · ${pl.seasons_completed} Premier League seasons${pl.titles ? " · " + pl.titles + " title" + (pl.titles > 1 ? "s" : "") : ""}</p>
      <p>${PL.esc(t.summary)}</p>
      <h4>Domestic trophies (all-time)</h4><div class="chips">${PL.trophyChips(window.PLDATA.domestic.by_club[t.name]?.counts)}</div>
      <h4>Premier League club records</h4><table class="plain"><tbody>${PL.recordLines(window.PLDATA.records.clubs[t.name]).map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join("")}</tbody></table>
      <h4>Every ground, in order</h4><ol>${rows}</ol>`;
    card.hidden = false;
    document.getElementById("card-x").onclick = () => (card.hidden = true);
  }

  function toggleAll() { showAll = !showAll; pins.filter((p) => !p.cur).forEach((p) => (p.group.visible = showAll)); document.getElementById("intro-all").textContent = showAll ? "Show current clubs only" : "Show all 51 clubs"; }
  document.getElementById("intro-all").addEventListener("click", toggleAll);

  // ---------------- animation ----------------
  let explodeT = -1, mapT = 0, running = true, data = null, ballStart = performance.now();
  const MIN_BALL_MS = 2200;
  let raf = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
    if (mode === "ball") {
      ball.rotation.x += spinVel.x * dt; ball.rotation.y += spinVel.y * dt;
      if (!dragging) { spinVel.x += (0.35 - spinVel.x) * dt * 0.8; spinVel.y += (0.9 - spinVel.y) * dt * 0.8; }
      if (kick > 0) { bounceVel -= 14 * dt; ballGroup.position.y += bounceVel * dt; if (ballGroup.position.y < 0) { ballGroup.position.y = 0; bounceVel = 0; kick = 0; } }
      else ballGroup.position.y = Math.sin(now / 700) * 0.06;
      if (data && now - ballStart > MIN_BALL_MS) startExplosion();
    } else if (mode === "exploding") {
      explodeT += dt;
      const t = explodeT;
      ballMat.uniforms.uT.value = t * 1.15;
      ballMat.uniforms.uFade.value = THREE.MathUtils.clamp(1.4 - t * 0.75, 0, 1);
      ring.visible = true; const rs = 0.4 + t * 7; ring.scale.set(rs, rs, 1); ring.material.opacity = Math.max(0, 0.9 - t * 0.9);
      sparks.visible = true; sparks.material.opacity = Math.max(0, 1 - t * 0.7);
      const arr = sparkGeo.attributes.position.array;
      for (let i = 0; i < sparkN; i++) { arr[i * 3] = sparkVel[i].x * t; arr[i * 3 + 1] = sparkVel[i].y * t; arr[i * 3 + 2] = sparkVel[i].z * t; }
      sparkGeo.attributes.position.needsUpdate = true;
      if (t > 0.8) { tilt.visible = true; mapT = Math.min(1, (t - 0.8) / 1.6); const e = 1 - Math.pow(1 - mapT, 3); tilt.scale.setScalar(0.5 + 0.5 * e); }
      if (t > 2.6) { ball.visible = false; ring.visible = false; sparks.visible = false; mode = "map"; onMapReady(); }
    }
    if (tilt.visible) {
      if (viewAnim) {
        const k = 1 - Math.exp(-dt * 4.5), TWO = Math.PI * 2;
        camera.position.z += (targetZ - camera.position.z) * k;
        tilt.position.lerp(targetPos, k);
        tilt.rotation.x += (targetTilt - tilt.rotation.x) * k;
        if (!autoSpin) mapSpin.rotation.z += (Math.round(mapSpin.rotation.z / TWO) * TWO - mapSpin.rotation.z) * k;
        if (Math.abs(targetZ - camera.position.z) < 0.01 && tilt.position.distanceTo(targetPos) < 0.01) viewAnim = false;
      } else if (autoSpin && now > pausedUntil && !dragging && camera.position.z > 5.5) mapSpin.rotation.z += dt * 0.22;
      const pulse = 1 + 0.25 * Math.sin(now / 400);
      const sizeFactor = Math.pow(THREE.MathUtils.clamp(camera.position.z / 7, 0.07, 1), 1.4);   // pins shrink as you zoom in, so crowded clubs separate
      root.classList.toggle("zoomed", camera.position.z < 5.5);
      pins.forEach((p, i) => {
        const e = mode === "map" ? Math.min(1, Math.max(0, (mapT >= 1 ? now - mapStart : 0) / 1000 - p.delay) * 2.2) : 0;
        const s = mode === "map" ? 1 - Math.pow(1 - Math.min(1, e), 3) : 0.001;
        p.group.scale.setScalar(Math.max(0.001, s * sizeFactor * (p.team === hovered ? 1.5 : 1)));
        p.halo.scale.setScalar(pulse + (p.team === hovered ? 0.4 : 0));
      });
      // where each pin is on screen (used for picking), and labels that follow the pins without piling up
      const w = root.clientWidth, h = root.clientHeight, tmp = new THREE.Vector3();
      pins.forEach((p) => { p.head.getWorldPosition(tmp); tmp.project(camera); p.sx = (tmp.x * 0.5 + 0.5) * w; p.sy = (-tmp.y * 0.5 + 0.5) * h; });
      const placed = [];
      labelDivs.forEach((l) => {
        const x = l.pin.sx, y = l.pin.sy - 20;
        const clash = placed.some((q) => Math.abs(q.x - x) < 30 && Math.abs(q.y - y) < 13) && l.pin.team !== hovered;
        if (!clash) placed.push({ x, y });
        l.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
        l.el.style.opacity = mode === "map" && mapT >= 1 && !clash ? "1" : "0";
      });
    }
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }
  let mapStart = 0;
  function startExplosion() {
    mode = "exploding"; explodeT = 0; hintEl.textContent = ""; statusEl.textContent = "";
    root.classList.add("exploding");
  }
  function onMapReady() {
    mapStart = performance.now();
    root.classList.remove("exploding"); root.classList.add("map");
    hintEl.textContent = "Hover a club · click for its history and every ground · scroll to zoom · drag to turn the map (Shift+drag to move it)";
    document.getElementById("intro-tools").hidden = false;
    enterBtn.hidden = false; document.getElementById("intro-all").hidden = false;
    dom.style.cursor = "grab";
  }
  
  function close() {
    hideChooser(); root.classList.add("hidden"); document.body.classList.remove("no-scroll");
    running = false; cancelAnimationFrame(raf); card.hidden = true; tooltip.hidden = true;
    window.scrollTo(0, 0);
  }
  function reopen() {
    if (mode !== "map") return;
    root.classList.remove("hidden"); document.body.classList.add("no-scroll"); running = true; clock.getDelta();
    mapStart = performance.now() - 5000; raf = requestAnimationFrame(frame);
  }
  enterBtn.addEventListener("click", close);
  skipBtn.addEventListener("click", () => { if (data) { skipBtn.hidden = true; mode = "map"; ball.visible = false; ring.visible = false; sparks.visible = false; tilt.visible = true; mapT = 1; tilt.scale.setScalar(1); onMapReady(); mapStart = performance.now() - 5000; close(); } else { skipped = true; } });
  let skipped = false;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.classList.contains("hidden") && mode === "map") close(); });

  setupMapButton({ reopen });

  // ---------------- load the data ----------------
  statusEl.textContent = "Loading 34 seasons of Premier League history…";
  hintEl.textContent = "Drag the ball to spin it · click to kick";
  PL.load(REPORT_DATA, (p, name) => { if (loadFailed) return; barEl.style.width = Math.round(p * 100) + "%"; statusEl.textContent = `Loading Premier League history… ${Math.round(p * 100)}%`; })
    .then((d) => {
      data = d; window.PLDATA = d;
      buildMap(d);
      reportDone = true; renderReport(d);
      statusEl.textContent = "All loaded — here we go!";
      barEl.style.width = "100%";
      if (skipped) { skipBtn.click(); }
    })
    .catch((err) => { showError(err); });
  raf = requestAnimationFrame(frame);
}
