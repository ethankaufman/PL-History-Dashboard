/* Intro: an interactive spinning football while the data loads; when the load succeeds it explodes into a rotating
 * map of the UK showing where every club plays. Also loads the data and then draws the report underneath.
 */
import * as THREE from "../vendor/three.module.min.js";

const REPORT_DATA = ["matches", "teamMatches", "finalTables", "playerMatches", "seasons", "awards", "honours", "teams", "map"];
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
function showError(err) {
  console.error(err);
  statusEl.innerHTML = `<span style="color:#ff7aa5">Couldn't load the data (${PL.esc(err.message)}).</span> <button class="btn small" onclick="location.reload()">Try again</button>`;
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let renderer = null;
try {
  const test = document.createElement("canvas");
  if (reduceMotion || !(test.getContext("webgl2") || test.getContext("webgl"))) throw new Error("no webgl or reduced motion");
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("intro-canvas"), antialias: true });
} catch (e) { renderer = null; }

document.body.classList.add("no-scroll");
PL.renderNav("report");

if (!renderer) {
  // no 3D available (or the visitor asked for less motion): skip the show, still load everything
  statusEl.textContent = "Loading Premier League data…";
  PL.load(REPORT_DATA, (p) => (barEl.style.width = Math.round(p * 100) + "%")).then((d) => { window.PLDATA = d; finishWithoutIntro(d); setupMapButton(null, d); }).catch(showError);
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
  renderer.setClearColor(0x0d0416, 1);
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
      void main(){
        vec3 p = normalize(vDir);
        float best = 10.0, second = 10.0, isPent = 0.0;
        for (int i = 0; i < 12; i++) { float a = acos(clamp(dot(p, uPent[i]), -1.0, 1.0)) / 0.652; if (a < best) { second = best; best = a; isPent = 1.0; } else if (a < second) { second = a; } }
        for (int i = 0; i < 20; i++) { float a = acos(clamp(dot(p, uHex[i]), -1.0, 1.0)) / 0.730; if (a < best) { second = best; best = a; isPent = 0.0; } else if (a < second) { second = a; } }
        float edge = smoothstep(0.0, 0.05, second - best);
        vec3 base = mix(vec3(0.05, 0.04, 0.08), vec3(0.96, 0.96, 1.0), 1.0 - isPent);
        base = mix(vec3(0.28, 0.26, 0.32), base, edge);
        vec3 N = normalize(vN), L = normalize(vec3(-0.5, 0.7, 0.8)), V = normalize(vView), H = normalize(L + V);
        float diff = max(dot(N, L), 0.0) * 0.72 + 0.34;
        float spec = pow(max(dot(N, H), 0.0), 60.0) * 0.55;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = base * diff + spec + rim * vec3(0.0, 1.0, 0.52) * 0.45;
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
  dom.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    moved += Math.abs(dx) + Math.abs(dy);
    last = { x: e.clientX, y: e.clientY };
    if (mode === "ball") { spinVel.y = dx * 0.06; spinVel.x = dy * 0.06; }
    else { mapSpin.rotation.z -= dx * 0.006; tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + dy * 0.004, -1.35, -0.2); }
  });
  dom.addEventListener("pointerup", () => {
    if (dragging && moved < 6 && mode === "ball") { kick = 1; bounceVel = 4.2; spinVel.y += 6; spinVel.x += 3; hintEl.textContent = "Nice kick!"; }
    dragging = false;
  });
  dom.addEventListener("wheel", (e) => { if (mode === "map") { e.preventDefault(); camera.position.z = THREE.MathUtils.clamp(camera.position.z + e.deltaY * 0.004, 3.5, 12); } }, { passive: false });

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
    addPolys(data.map.ireland, 0x2b1448, 0x6a4a9a, 0.7, 0.55, 0);
    addPolys(data.map.uk, 0x35125c, 0x00ff85, 0.95, 0.95, 0.01);
    // faint graticule for a "radar" look
    const grid = new THREE.GridHelper(14, 28, 0x00ff85, 0x3a1d5e); grid.rotation.x = Math.PI / 2; grid.position.z = -0.02; grid.material.transparent = true; grid.material.opacity = 0.35; mapSpin.add(grid);
    mapSpin.add(pinGroup);
    data.teams.forEach((t) => {
      const cur = t.status === "current";
      const p = project(t.map.lng, t.map.lat);
      const col = new THREE.Color(PL.clubColor(t.name));
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
        d.style.color = PL.clubColor(t.name); labelsEl.appendChild(d); labelDivs.push({ el: d, pos: p.clone().setZ(0.5), pin: pins[pins.length - 1] });
      }
    });
    pins.filter((x) => x.cur).forEach((x, i) => (x.delay = 0.04 * i));
    pins.filter((x) => !x.cur).forEach((x, i) => (x.delay = 0.9 + 0.02 * i));
  }

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  dom.addEventListener("pointermove", (e) => {
    if (mode !== "map" || dragging) return;
    const r = dom.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(pinMeshes.filter((m) => m.parent.visible), false)[0];
    hovered = hit ? hit.object.userData.team : null;
    dom.style.cursor = hovered ? "pointer" : "grab";
    if (hovered) {
      pausedUntil = performance.now() + 600;
      tooltip.hidden = false;
      tooltip.style.left = e.clientX + 14 + "px"; tooltip.style.top = e.clientY + 14 + "px";
      const g = hovered.current_ground;
      tooltip.innerHTML = `<b>${PL.esc(hovered.name)}</b><br><span class="muted">${PL.esc(g ? g.name : "Defunct (home 1912–91)")} · ${PL.esc(hovered.city)}</span>`;
    } else tooltip.hidden = true;
  });
  dom.addEventListener("click", () => { if (mode === "map" && hovered && moved < 6) openCard(hovered); });

  function openCard(t) {
    const rows = t.stadiums.map((s) => `<li${s.current ? ' class="cur"' : ""}><b>${PL.esc(s.name)}</b> <span class="muted">${s.from ?? "?"}–${s.current ? "now" : s.to ?? "?"}${s.temporary ? " · temporary" : ""}</span></li>`).join("");
    const pl = t.premier_league;
    card.innerHTML = `<button class="x" aria-label="Close" id="card-x">×</button><div class="eyebrow">${t.status === "current" ? "In the 2026–27 Premier League" : t.status === "defunct" ? "Defunct club" : "Former Premier League club"}</div>
      <h3 style="color:${PL.clubColor(t.name)}">${PL.esc(t.name)}</h3>
      <p class="muted">${PL.esc(t.city)}${t.area ? " (" + PL.esc(t.area) + ")" : ""} · founded ${t.founded} · ${pl.seasons_completed} Premier League seasons${pl.titles ? " · " + pl.titles + " title" + (pl.titles > 1 ? "s" : "") : ""}</p>
      <p>${PL.esc(t.summary)}</p><h4>Every ground, in order</h4><ol>${rows}</ol>`;
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
      if (now > pausedUntil && !dragging) mapSpin.rotation.z += dt * 0.22;
      const pulse = 1 + 0.25 * Math.sin(now / 400);
      pins.forEach((p, i) => {
        const e = mode === "map" ? Math.min(1, Math.max(0, (mapT >= 1 ? now - mapStart : 0) / 1000 - p.delay) * 2.2) : 0;
        const s = mode === "map" ? 1 - Math.pow(1 - Math.min(1, e), 3) : 0.001;
        p.group.scale.setScalar(Math.max(0.001, s * (p.team === hovered ? 1.5 : 1)));
        p.halo.scale.setScalar(pulse + (p.team === hovered ? 0.4 : 0));
      });
      // labels follow the pins
      const w = root.clientWidth, h = root.clientHeight;
      labelDivs.forEach((l) => {
        const v = l.pos.clone(); mapSpin.localToWorld(v); v.project(camera);
        l.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%,-130%)`;
        l.el.style.opacity = mode === "map" && mapT >= 1 ? "1" : "0";
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
    hintEl.textContent = "Hover a club · click for its history and every ground · drag to turn the map";
    enterBtn.hidden = false; document.getElementById("intro-all").hidden = false;
    dom.style.cursor = "grab";
  }
  
  function close() {
    root.classList.add("hidden"); document.body.classList.remove("no-scroll");
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
  PL.load(REPORT_DATA, (p, name) => { barEl.style.width = Math.round(p * 100) + "%"; statusEl.textContent = `Loading Premier League history… ${Math.round(p * 100)}%`; })
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
