/* A pile of football-shaped club crests at the top of each page. Click or tap anywhere in it and a ball is kicked at that spot.
 * Plain 2D physics (gravity, bouncing, spin, friction); no library. One ball per club that has played in the Premier League.
 */
(() => {
  const GRAVITY = 2300, STEP = 1 / 120, BOUNCE = 0.38, WALL_BOUNCE = 0.3, FRICTION = 0.4;

  function startPile(box) {
    const canvas = box.querySelector("canvas"), ctx = canvas.getContext("2d");
    const hint = box.querySelector(".pile-hint"), again = box.querySelector(".pile-again");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1, R = 24, bodies = [], kickers = [], running = false, last = 0, acc = 0, quiet = 0, spawnQueue = [], clock = 0, hover = null, started = false;
    let clubs = [], shade = null, kickImg = null;

    // ---------- pictures ----------
    const crests = new Map();
    function loadCrest(c) {
      return new Promise((res) => { const img = new Image(); img.onload = () => { crests.set(c.name, img); res(); }; img.onerror = res; img.src = c.file; });
    }
    function ballSprite(img) {
      // a white ball with a thin seam pattern and the club crest in the middle; it is drawn rotated, so the crest turns as the ball rolls
      const d = Math.ceil(R * 2 * dpr), c = document.createElement("canvas"); c.width = c.height = d;
      const x = c.getContext("2d"), r = d / 2;
      x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.fillStyle = "#fff"; x.fill();
      x.save(); x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.clip();
      x.strokeStyle = "rgba(56,0,60,.16)"; x.lineWidth = Math.max(1, d / 60);
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; x.beginPath(); x.moveTo(r + Math.cos(a) * r * 0.62, r + Math.sin(a) * r * 0.62); x.lineTo(r + Math.cos(a) * r * 1.2, r + Math.sin(a) * r * 1.2); x.stroke(); }
      x.restore();
      if (img) { const k = Math.min((r * 1.24) / img.width, (r * 1.24) / img.height); x.drawImage(img, r - (img.width * k) / 2, r - (img.height * k) / 2, img.width * k, img.height * k); }
      return c;
    }
    function kickSprite() {
      // the ball that gets kicked: a classic white-and-black football
      const d = Math.ceil(R * 3.2 * dpr), c = document.createElement("canvas"); c.width = c.height = d;
      const x = c.getContext("2d"), r = d / 2;
      x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.fillStyle = "#fff"; x.fill();
      x.save(); x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.clip();
      const pent = (cx, cy, rad, rot) => { x.beginPath(); for (let i = 0; i < 5; i++) { const a = rot + (i * 2 * Math.PI) / 5; x[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } x.closePath(); x.fillStyle = "#1c1020"; x.fill(); };
      pent(r, r, r * 0.34, -Math.PI / 2);
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5 + Math.PI / 5; pent(r + Math.cos(a) * r * 1.02, r + Math.sin(a) * r * 1.02, r * 0.34, a + Math.PI / 2 + Math.PI / 5); }
      x.strokeStyle = "#1c1020"; x.lineWidth = Math.max(1.5, d / 55);
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; x.beginPath(); x.moveTo(r + Math.cos(a) * r * 0.34, r + Math.sin(a) * r * 0.34); x.lineTo(r + Math.cos(a) * r * 0.7, r + Math.sin(a) * r * 0.7); x.stroke(); }
      x.restore();
      return c;
    }
    function makeShade() {
      // light and shadow painted over every ball so they look round; it does not rotate with the ball
      const d = Math.ceil(R * 2 * dpr) + 2, c = document.createElement("canvas"); c.width = c.height = d;
      const x = c.getContext("2d"), r = d / 2;
      const g = x.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
      g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(0.35, "rgba(255,255,255,0)"); g.addColorStop(0.8, "rgba(56,0,60,0.10)"); g.addColorStop(1, "rgba(56,0,60,0.42)");
      x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.fillStyle = g; x.fill();
      x.lineWidth = Math.max(1.5, dpr * 1.5); x.strokeStyle = "rgba(56,0,60,.55)"; x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.stroke();
      return c;
    }

    // ---------- physics ----------
    function body(x, y, r, sprite, name) {
      const m = r * r * 0.01;
      return { x, y, vx: 0, vy: 0, r, m, im: 1 / m, I: 0.5 * m * r * r, a: Math.random() * 6.28, w: 0, sprite, name, life: 0 };
    }
    function dropOne(c) {
      const b = body(R + Math.random() * Math.max(1, W - 2 * R), -R - Math.random() * R, R, ballSprite(crests.get(c.name)), c.name);
      b.vx = (Math.random() - 0.5) * 120; b.vy = 60 + Math.random() * 120; b.w = (Math.random() - 0.5) * 5; bodies.push(b);
    }
    function solve(all) {
      for (let it = 0; it < 8; it++) {
        for (const b of all) {
          if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * WALL_BOUNCE; }
          if (b.x > W - b.r) { b.x = W - b.r; if (b.vx > 0) b.vx = -b.vx * WALL_BOUNCE; }
          if (b.y > H - b.r) {
            b.y = H - b.r; b.touch = true;
            if (b.vy > 0) b.vy = b.vy > 160 ? -b.vy * BOUNCE : 0;
            const slip = b.vx - b.w * b.r;                 // the floor grips the ball, so it rolls
            b.vx -= slip * 0.12; b.w += (slip * 0.24) / b.r;
          }
        }
        for (let i = 0; i < all.length; i++) {
          const p = all[i];
          for (let j = i + 1; j < all.length; j++) {
            const q = all[j], rr = p.r + q.r;
            let dx = q.x - p.x, dy = q.y - p.y;
            if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
            let d = Math.hypot(dx, dy);
            if (d >= rr) continue;
            if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
            p.touch = q.touch = true;
            const nx = dx / d, ny = dy / d, over = rr - d, sum = p.im + q.im;
            p.x -= nx * over * (p.im / sum) * 0.9; p.y -= ny * over * (p.im / sum) * 0.9;
            q.x += nx * over * (q.im / sum) * 0.9; q.y += ny * over * (q.im / sum) * 0.9;
            const vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
            if (vn >= 0) continue;
            const jn = (-(1 + (-vn > 140 ? BOUNCE : 0)) * vn) / sum;
            p.vx -= jn * nx * p.im; p.vy -= jn * ny * p.im; q.vx += jn * nx * q.im; q.vy += jn * ny * q.im;
            // friction where the two surfaces touch: a glancing blow sets both balls spinning
            const tx = -ny, ty = nx;
            const slip = (q.vx * tx + q.vy * ty - q.w * q.r) - (p.vx * tx + p.vy * ty + p.w * p.r);
            let jt = -slip / (sum + (p.r * p.r) / p.I + (q.r * q.r) / q.I);
            const lim = FRICTION * jn; jt = Math.max(-lim, Math.min(lim, jt));
            p.vx -= jt * tx * p.im; p.vy -= jt * ty * p.im; q.vx += jt * tx * q.im; q.vy += jt * ty * q.im;
            p.w -= (jt * p.r) / p.I; q.w -= (jt * q.r) / q.I;
          }
        }
      }
    }
    function step(dt) {
      const all = bodies.concat(kickers);
      for (const b of all) { b.vy += GRAVITY * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt; b.vx *= 1 - 0.05 * dt; b.w *= 1 - 0.25 * dt; }
      for (const b of all) b.touch = false;
      solve(all);
      // a ball that is resting on something and barely moving is held still, so the pile does not shiver
      for (const b of all) if (b.touch && Math.hypot(b.vx, b.vy) < 50 && Math.abs(b.w) * b.r < 40) b.vx = b.vy = b.w = 0;
      for (const k of kickers) k.life += dt;
      kickers = kickers.filter((k) => k.life < 7);
    }
    function energy() { let e = 0; for (const b of bodies.concat(kickers)) e = Math.max(e, Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.w) * b.r * 0.3); return e; }

    // ---------- the kick: a heavy ball flies in from the side and lands where you clicked ----------
    function kickAt(tx, ty) {
      if (!kickImg) kickImg = kickSprite();
      const fromLeft = tx > W / 2 ? Math.random() < 0.7 : Math.random() < 0.3;   // usually from the side farther from the click
      const r = R * 1.6, sx = fromLeft ? r + 2 : W - r - 2, sy = H - r - 4 - Math.random() * H * 0.35;
      const dist = Math.hypot(tx - sx, ty - sy), speed = Math.max(2300, Math.min(3200, 1400 + W * 0.8)), t = dist / speed;
      const k = body(sx, sy, r, kickImg, "ball");
      k.m = r * r * 0.1; k.im = 1 / k.m; k.I = 0.5 * k.m * r * r;
      k.vx = (tx - sx) / t; k.vy = (ty - sy) / t - 0.5 * GRAVITY * t; k.w = (fromLeft ? 1 : -1) * 22;
      kickers.push(k); if (kickers.length > 4) kickers.shift();
      wake();
    }

    // ---------- drawing ----------
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      for (const b of bodies.concat(kickers)) {
        ctx.save(); ctx.translate(b.x, b.y);
        ctx.globalAlpha = b.life > 6 ? Math.max(0, 7 - b.life) : 1;
        ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(2, b.r * 0.9, b.r * 0.8, b.r * 0.18, 0, 0, 7); ctx.fill();   // soft shadow
        ctx.save(); ctx.rotate(b.a); const s = b.sprite.width / dpr; ctx.drawImage(b.sprite, -s / 2, -s / 2, s, s); ctx.restore();
        if (b.name !== "ball") { const sh = shade.width / dpr; ctx.drawImage(shade, -sh / 2, -sh / 2, sh, sh); }
        ctx.restore();
      }
      if (hover && bodies.includes(hover)) {
        ctx.font = "700 13px system-ui, sans-serif"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(hover.name).width + 16, tx = Math.max(4, Math.min(W - tw - 4, hover.x - tw / 2)), ty = Math.max(4, hover.y - hover.r - 30);
        ctx.fillStyle = "#38003c"; ctx.strokeStyle = "#00ff85"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(tx, ty, tw, 24, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.fillText(hover.name, tx + 8, ty + 12.5);
      }
    }

    // ---------- loop: it stops by itself once everything has come to rest ----------
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt; clock += dt;
      while (spawnQueue.length && clock * 1000 > spawnQueue[0].t) dropOne(spawnQueue.shift().c);
      while (acc >= STEP) { step(STEP); acc -= STEP; }
      draw();
      if (!spawnQueue.length && !kickers.length && energy() < 18) {
        if (++quiet > 40) { running = false; for (const b of bodies) b.vx = b.vy = b.w = 0; draw(); return; }
      } else quiet = 0;
      requestAnimationFrame(frame);
    }
    function wake() { quiet = 0; if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

    // ---------- set up ----------
    function size() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width), h = Math.round(rect.height);
      if (w === W && h === H) return true;
      const first = !W; W = w; H = h;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const r = Math.max(19, Math.min(30, W / 36));
      if (first || Math.abs(r - R) > 1.5) {
        R = r; shade = makeShade(); kickImg = null;
        for (const b of bodies) { b.r = R; b.sprite = ballSprite(crests.get(b.name)); b.m = R * R * 0.01; b.im = 1 / b.m; b.I = 0.5 * b.m * R * R; }
      }
      for (const b of bodies) { b.x = Math.min(Math.max(b.x, b.r), W - b.r); b.y = Math.min(b.y, H - b.r); }
      if (!first) wake();
      return true;
    }
    function build() {
      bodies = []; kickers = []; spawnQueue = []; clock = 0; acc = 0;
      const order = clubs.slice().sort(() => Math.random() - 0.5);
      if (reduceMotion) {   // no falling animation: show the finished pile straight away
        order.forEach(dropOne); bodies.forEach((b) => { b.y = H * Math.random() * 0.5; });
        for (let i = 0; i < 1500; i++) step(STEP);
        for (const b of bodies) b.vx = b.vy = b.w = 0;
        running = false; draw(); return;
      }
      order.forEach((c, i) => spawnQueue.push({ c, t: 150 + i * 45 }));
      wake();
    }
    function begin() { if (started || !clubs.length || !size()) return; started = true; build(); }

    canvas.addEventListener("pointerdown", (e) => {
      if (!started) return;
      const r = canvas.getBoundingClientRect(); kickAt(e.clientX - r.left, e.clientY - r.top);
      if (hint) hint.classList.add("done");
    });
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const h = bodies.find((b) => Math.hypot(b.x - x, b.y - y) < b.r) || null;
      if (h !== hover) { hover = h; if (!running) draw(); }
    });
    canvas.addEventListener("pointerleave", () => { if (hover) { hover = null; if (!running) draw(); } });
    if (again) again.addEventListener("click", () => { if (started) build(); });

    new ResizeObserver(() => { if (!started) begin(); else if (size() && !running) draw(); }).observe(canvas);
    fetch("data/badges.json").then((r) => r.json()).then((list) => { clubs = list; return Promise.all(list.map(loadCrest)); }).then(() => begin());
    box.__pile = { get bodies() { return bodies; }, get kickers() { return kickers; }, kickAt, energy, get running() { return running; }, get size() { return [W, H, R]; } };   // handy for testing in the browser
  }

  document.querySelectorAll("[data-pile]").forEach(startPile);
})();
