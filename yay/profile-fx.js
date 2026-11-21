/* Profile-card effects. Every effect is a seamless loop.
 * Its look at any moment is a pure function of the seed (where each particle starts) and the phase p in [0,1)
 * (how far through the loop it is). p = 0 and p = 1 are identical, so the animation repeats forever,
 * and the PNG for a chosen frame is always exactly what the preview showed.
 * Exposes window.YayFx = { KINDS, DEFAULTS, PERIOD, draw(ctx, part, phase), live(part, elapsedSeconds), newSeed() }.
 */
(() => {
  "use strict";
  const KINDS = {
    star: "流れ星", shower: "流星群", sparkle: "きらきら", starfield: "星空", aurora: "オーロラ", fireflies: "蛍",
    snow: "雪", bokeh: "ぼかし光", hearts: "ハート", petals: "桜の花びら", confetti: "紙吹雪", glow: "やわらかい光"
  };
  const FULL = { x: 0, y: 0, w: 1200, h: 800 };
  const DEFAULTS = {
    star:      { amount: 5,  scale: 100, color: "#ffffff", ...FULL },
    shower:    { amount: 14, scale: 100, color: "#cfe8ff", ...FULL },
    sparkle:   { amount: 16, scale: 100, color: "#fff2b8", ...FULL },
    starfield: { amount: 70, scale: 100, color: "#ffffff", ...FULL },
    aurora:    { amount: 4,  scale: 100, color: "#4dffc4", ...FULL },
    fireflies: { amount: 22, scale: 100, color: "#e4ff7a", ...FULL },
    snow:      { amount: 60, scale: 100, color: "#ffffff", ...FULL },
    bokeh:     { amount: 14, scale: 100, color: "#8de5ff", ...FULL },
    hearts:    { amount: 14, scale: 100, color: "#ff7aa8", ...FULL },
    petals:    { amount: 20, scale: 100, color: "#ffb7cf", ...FULL },
    confetti:  { amount: 50, scale: 100, color: "#ffd24a", ...FULL },
    glow:      { amount: 2,  scale: 100, color: "#8b9cff", ...FULL }
  };
  // Seconds for one full loop at speed 100%.
  const PERIOD = { star: 5, shower: 4, sparkle: 4, starfield: 6, aurora: 10, fireflies: 8, snow: 12, bokeh: 10, hearts: 10, petals: 12, confetti: 8, glow: 6 };
  // Light-emitting effects add their light onto the card (looks luminous); the others are drawn as normal objects.
  const ADDITIVE = new Set(["star", "shower", "sparkle", "starfield", "aurora", "fireflies", "bokeh", "glow"]);
  const CONFETTI = ["#ff6f9f", "#ffd24a", "#46caff", "#8b9cff", "#2fe0a8", "#ffffff"];
  const PETALS = ["#ffc9dc", "#ffb0cb", "#ffd6e4", "#ff9ebb"];
  const STAR_TINTS = [null, "#bcd6ff", "#ffe9c4"];
  const TAU = Math.PI * 2;
  const wrap = v => ((v % 1) + 1) % 1;                          // keep a loop position inside [0,1)
  const wave = v => .5 - .5 * Math.cos(TAU * v);                // 0 -> 1 -> 0 once per unit, smooth and periodic
  const tw = u => Math.pow(Math.sin(Math.PI * wrap(u)), 2);     // twinkle: 0 at the ends, 1 in the middle

  // Small seeded random number generator (mulberry32).
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const toRgb = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); const v = m ? parseInt(m[1], 16) : 0xffffff; return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const rgba = (hex, a) => { const [r, g, b] = toRgb(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };
  const mix = (hex, to, t) => { const a = toRgb(hex), b = toRgb(to); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`; };
  function hueOf(hex) {
    const [r, g, b] = toRgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 160;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360;
  }

  // Soft light: white-hot centre fading out through the colour.
  function glowDot(ctx, x, y, rad, col, a, core = .16) {
    if (rad <= .2 || a <= .01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba("#ffffff", a)); g.addColorStop(core, rgba(col, a * .8)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  // Four-pointed twinkle: white star, coloured glow, and a smaller diagonal pair.
  function spark(ctx, x, y, rad, col, a, rot = 0) {
    if (rad <= .3 || a <= .01) return;
    ctx.save(); ctx.globalAlpha *= Math.min(1, a); ctx.translate(x, y); ctx.rotate(rot);
    glowDot(ctx, 0, 0, rad * 1.15, col, .55, .1);
    const arm = (R, k) => { ctx.beginPath(); ctx.moveTo(0, -R); ctx.quadraticCurveTo(k, -k, R, 0); ctx.quadraticCurveTo(k, k, 0, R); ctx.quadraticCurveTo(-k, k, -R, 0); ctx.quadraticCurveTo(-k, -k, 0, -R); ctx.fill(); };
    ctx.fillStyle = "#fff"; arm(rad, rad * .1);
    ctx.save(); ctx.rotate(Math.PI / 4); ctx.globalAlpha *= .75; ctx.fillStyle = mix(col, "#ffffff", .5); arm(rad * .55, rad * .08); ctx.restore();
    ctx.restore();
  }
  const heartPath = (ctx, k) => { ctx.beginPath(); ctx.moveTo(0, k * .9); ctx.bezierCurveTo(-k * 1.6, -k * .2, -k * .7, -k * 1.3, 0, -k * .45); ctx.bezierCurveTo(k * .7, -k * 1.3, k * 1.6, -k * .2, 0, k * .9); ctx.closePath(); };
  const tail = (ctx, hx, hy, tx, ty, width, g) => { const px = -(hy - ty), py = hx - tx, n = Math.hypot(px, py) || 1, ux = px / n * width, uy = py / n * width; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx + ux, hy + uy); ctx.lineTo(tx, ty); ctx.lineTo(hx - ux, hy - uy); ctx.closePath(); ctx.fill(); };

  // Shooting stars: each streak is born, crosses the area and fades once per loop, staggered so the sky is never empty.
  function shooting(ctx, o, r, s, n, col, shower, p) {
    const win = shower ? .4 : .5, travel = (shower ? 300 : 420) * s;
    for (let i = 0; i < n; i++) {
      const cx = o.x + (.1 + .8 * r()) * o.w, cy = o.y + (.1 + .8 * r()) * o.h;
      const ang = (shower ? 32 : 20 + r() * 30) * Math.PI / 180, lenR = r(), hrR = r(), off = (i + r()) / n;
      const dust = Array.from({ length: 5 }, () => [r() * 2 - 1, r()]);          // always drawn from the seed, so frames stay stable
      const u = wrap(p + off); if (u >= win) continue;
      const k = u / win, env = Math.sin(Math.PI * k);
      const dx = -Math.cos(ang), dy = Math.sin(ang);                               // heading: down-left
      const hx = cx + dx * travel * (k - .5), hy = cy + dy * travel * (k - .5);
      const L = (shower ? 120 + lenR * 120 : 170 + lenR * 170) * s * (.45 + .55 * env);
      const hr = (shower ? 1.6 + 1.6 * hrR : 2.6 + 2.4 * hrR) * s;
      const tx = hx - dx * L, ty = hy - dy * L, nx = -dy, ny = dx;                 // tail points up-right
      ctx.save(); ctx.globalAlpha *= env;
      let g = ctx.createLinearGradient(hx, hy, tx, ty); g.addColorStop(0, rgba(col, .4)); g.addColorStop(1, rgba(col, 0));
      tail(ctx, hx, hy, tx, ty, hr * 3.4, g);                                       // wide soft glow
      g = ctx.createLinearGradient(hx, hy, tx, ty); g.addColorStop(0, rgba("#ffffff", .95)); g.addColorStop(.25, rgba(col, .65)); g.addColorStop(1, rgba(col, 0));
      tail(ctx, hx, hy, tx, ty, hr * 1.1, g);                                       // main tapered tail
      g = ctx.createLinearGradient(hx, hy, tx, ty); g.addColorStop(0, rgba("#ffffff", .95)); g.addColorStop(1, rgba("#ffffff", 0));
      ctx.strokeStyle = g; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1, hr * .45); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + (tx - hx) * .7, hy + (ty - hy) * .7); ctx.stroke();
      dust.forEach(([side, along], j) => {                                          // glittering dust left behind
        const f = (j + .6 + along * .5) / 5.6;
        glowDot(ctx, hx + (tx - hx) * f + nx * side * hr * 5, hy + (ty - hy) * f + ny * side * hr * 5, (1.4 + along * 2.2) * s * (1 - f * .5), col, .55 * (1 - f));
      });
      glowDot(ctx, hx, hy, hr * 7, col, .85, .12);
      spark(ctx, hx, hy, hr * 4.4, col, 1, 0);
      ctx.restore();
    }
  }

  const DRAW = {
    star: (ctx, o, r, s, n, col, p) => shooting(ctx, o, r, s, n, col, false, p),
    shower: (ctx, o, r, s, n, col, p) => shooting(ctx, o, r, s, n, col, true, p),
    sparkle(ctx, o, r, s, n, col, p) {
      for (let i = 0; i < n; i++) {
        const x = o.x + r() * o.w, y = o.y + r() * o.h, rad = (8 + 24 * r()) * s, off = r(), cyc = r() < .5 ? 1 : 2, dir = r() < .5 ? 1 : -1, white = r() < .35;
        const e = tw(p * cyc + off); spark(ctx, x, y, rad * (.3 + .7 * e), white ? "#ffffff" : col, .15 + .85 * e, dir * (Math.PI / 2) * p);
      }
      for (let i = 0; i < n * 2; i++) {
        const x = o.x + r() * o.w, y = o.y + r() * o.h, rad = (1.5 + 2.5 * r()) * s, off = r(), a = .4 + .5 * r();
        glowDot(ctx, x, y, rad * 3, col, a * (.2 + .8 * wave(p + off)), .3);
      }
    },
    starfield(ctx, o, r, s, n, col, p) {
      const big = Math.max(o.w, o.h);                                                // a faint band of distant stars, like the Milky Way
      for (let j = 0; j < 4; j++) {
        const t = (j + .5) / 4, x = o.x + o.w * (.1 + .8 * t), y = o.y + o.h * (.8 - .6 * t), rad = big * (.3 + .06 * j), k = .05 + .02 * wave(p + j / 4);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba(col, k)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
      }
      for (let i = 0; i < n; i++) {
        const x = o.x + r() * o.w, y = o.y + r() * o.h, size = r(), base = .35 + .65 * r(), off = r(), cyc = r() < .5 ? 1 : 2, tint = STAR_TINTS[Math.floor(r() * 3)] || col;
        const e = wave(p * cyc + off);
        if (i % 7 === 0) spark(ctx, x, y, (6 + 12 * size) * s * (.55 + .45 * tw(p * cyc + off)), tint, .45 + .55 * tw(p * cyc + off), Math.PI / 4 * wave(p));
        else { const a = base * (.35 + .65 * e), rad = (1 + 2 * size) * s; ctx.fillStyle = rgba(tint, a); ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill(); glowDot(ctx, x, y, rad * 3.5, tint, a * .35, .2); }
      }
    },
    aurora(ctx, o, r, s, n, col, p) {
      const bands = Math.min(n, 8), hue = hueOf(col);
      for (let i = 0; i < bands; i++) {
        const base = o.y + o.h * (.35 + .35 * r()), amp = o.h * (.04 + .06 * r()), lam = o.w * (.5 + .8 * r()), cyc = r() < .5 ? 1 : 2, off = r(), ht = o.h * (.28 + .25 * r()) * s;
        const hu = (hue + (i / Math.max(1, bands - 1) - .5) * 70 + 360) % 360, c = (a, l = 62) => `hsla(${hu},80%,${l}%,${a})`;
        const edge = x => base + amp * Math.sin(TAU * (x / lam + cyc * p + off)) + amp * .5 * Math.sin(TAU * (x / (lam * .43) + (cyc + 1) * p + off * 2));
        const height = x => ht * (.65 + .35 * Math.sin(TAU * (x / (lam * .7) - cyc * p + off * 3)));
        const g = ctx.createLinearGradient(0, base + amp * 1.6, 0, base - ht * 1.35);
        g.addColorStop(0, c(0)); g.addColorStop(.1, c(.45)); g.addColorStop(.45, c(.17, 58)); g.addColorStop(1, c(0, 55));
        const step = 12; ctx.fillStyle = g; ctx.beginPath();
        for (let x = o.x; x <= o.x + o.w + step; x += step) ctx.lineTo(x, edge(x));
        for (let x = o.x + o.w + step; x >= o.x; x -= step) ctx.lineTo(x, edge(x) - height(x));
        ctx.closePath(); ctx.fill();
        ctx.save(); ctx.globalAlpha *= .3; ctx.strokeStyle = g; ctx.lineWidth = 5 * s; ctx.beginPath();   // vertical rays inside the curtain
        for (let x = o.x; x <= o.x + o.w; x += 14) { const hh = height(x) * (.55 + .45 * Math.sin(x * .09 + off * 9)); ctx.moveTo(x, edge(x)); ctx.lineTo(x, edge(x) - hh); }
        ctx.stroke(); ctx.restore();
      }
    },
    fireflies(ctx, o, r, s, n, col, p) {
      for (let i = 0; i < n; i++) {
        const cx = o.x + (.08 + .84 * r()) * o.w, cy = o.y + (.08 + .84 * r()) * o.h, ax = (30 + 90 * r()) * s, ay = (20 + 60 * r()) * s;
        const c1 = 1 + Math.floor(r() * 2), c2 = 1 + Math.floor(r() * 3), f1 = r(), f2 = r(), size = (9 + 13 * r()) * s, cb = 1 + Math.floor(r() * 2), fb = r();
        for (let t = 2; t >= 0; t--) {                                               // a short fading trail
          const pp = p - t * .012, x = cx + ax * Math.sin(TAU * (c1 * pp + f1)), y = cy + ay * Math.sin(TAU * (c2 * pp + f2));
          const blink = Math.pow(wave(p * cb + fb), 1.4) * .85 + .15, f = 1 - t * .38;
          glowDot(ctx, x, y, size * (.5 + .5 * blink) * f, col, .8 * blink * f * (t ? .5 : 1), .1);
        }
      }
    },
    snow(ctx, o, r, s, n, col, p) {
      for (let i = 0; i < n; i++) {
        const x0 = r(), y0 = r(), d = r(), a0 = r(), sw = (10 + 25 * r()) * s, off = r(), off2 = r(), near = d > .75, cyc = d > .6 ? 2 : 1;
        const rad = (2 + 12 * Math.pow(d, 1.6)) * s, a = near ? .28 + .22 * a0 : .55 + .4 * a0, m = rad * 2;
        const y = o.y - m + wrap(y0 + cyc * p) * (o.h + 2 * m);
        const x = o.x + x0 * o.w + sw * (Math.sin(TAU * (2 * cyc * p + off)) + .4 * Math.sin(TAU * (4 * cyc * p + off2)));
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        if (near) { g.addColorStop(0, rgba(col, a * .6)); g.addColorStop(.4, rgba(col, a * .45)); g.addColorStop(1, rgba(col, 0)); }       // close flakes: big and soft
        else { g.addColorStop(0, rgba(col, a)); g.addColorStop(.55, rgba(col, a * .9)); g.addColorStop(1, rgba(col, 0)); }                   // far flakes: small and crisp
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
    },
    bokeh(ctx, o, r, s, n, col, p) {
      for (let i = 0; i < n; i++) {
        const x0 = o.x + r() * o.w, y0 = o.y + r() * o.h, rad0 = (20 + 60 * r()) * s, a0 = .06 + .14 * r(), drift = (15 + 30 * r()) * s, off = r(), hex = r() < .35, white = r() < .25;
        const c = white ? "#ffffff" : col, x = x0 + drift * Math.cos(TAU * (p + off)), y = y0 + drift * Math.sin(TAU * (p + off));
        const rad = rad0 * (1 + .1 * Math.sin(TAU * (2 * p + off))), k = .7 + .3 * wave(p + off);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, rgba(c, a0 * k)); g.addColorStop(.78, rgba(c, a0 * 1.3 * k)); g.addColorStop(.93, rgba(c, .3 * k)); g.addColorStop(1, rgba(c, .04 * k));
        ctx.fillStyle = g; ctx.beginPath();
        if (hex) for (let j = 0; j < 6; j++) { const a = TAU * j / 6 + off; ctx.lineTo(x + rad * Math.cos(a), y + rad * Math.sin(a)); } else ctx.arc(x, y, rad, 0, TAU);
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = rgba(c, .32 * k); ctx.lineWidth = 1.6 * s; ctx.stroke();
      }
    },
    hearts(ctx, o, r, s, n, col, p) {
      for (let i = 0; i < n; i++) {
        const x0 = r(), y0 = r(), sz = (14 + 26 * r()) * s, a = .6 + .4 * r(), tilt = (r() - .5) * .9, sway = (12 + 22 * r()) * s, off = r(), cyc = sz > 26 * s ? 2 : 1;
        const t = wrap(y0 + cyc * p), m = sz, y = o.y + o.h + m - t * (o.h + 2 * m), x = o.x + x0 * o.w + sway * Math.sin(TAU * (2 * cyc * p + off));
        const fade = Math.min(1, t / .1, (1 - t) / .1), k = sz * (1 + .08 * Math.sin(TAU * (2 * p + off))) / 2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(tilt + .2 * Math.sin(TAU * (cyc * p + off))); ctx.globalAlpha *= a * fade;
        const halo = ctx.createRadialGradient(0, 0, k * .4, 0, 0, k * 2.6); halo.addColorStop(0, rgba(col, .28)); halo.addColorStop(1, rgba(col, 0)); ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, k * 2.6, 0, TAU); ctx.fill();
        const g = ctx.createRadialGradient(-k * .4, -k * .5, k * .1, 0, 0, k * 1.5); g.addColorStop(0, mix(col, "#ffffff", .55)); g.addColorStop(.5, col); g.addColorStop(1, mix(col, "#000000", .3));
        ctx.fillStyle = g; heartPath(ctx, k); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(-k * .48, -k * .55, k * .28, k * .14, -.6, 0, TAU); ctx.fill();    // shine
        ctx.restore();
      }
    },
    petals(ctx, o, r, s, n, col, p) {
      for (let i = 0; i < n; i++) {
        const x0 = r(), y0 = r(), sz = r(), rot0 = r() * TAU, dir = r() < .5 ? 1 : -1, sway = (20 + 40 * r()) * s, off = r(), pick = Math.floor(r() * PETALS.length), cyc = sz > .5 ? 2 : 1;
        const k = (10 + 12 * sz) * s, m = k * 2, flat = .55 + .45 * Math.abs(Math.cos(TAU * (2 * p + off)));
        const y = o.y - m + wrap(y0 + cyc * p) * (o.h + 2 * m), x = o.x + x0 * o.w + sway * Math.sin(TAU * (cyc * p + off));
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot0 + dir * TAU * cyc * p); ctx.scale(1, flat);
        const g = ctx.createLinearGradient(0, -k, 0, k); g.addColorStop(0, PETALS[pick]); g.addColorStop(.7, mix(PETALS[pick], "#ffffff", .55)); g.addColorStop(1, "#fff7fa");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, k); ctx.bezierCurveTo(-k * .9, k * .4, -k * .8, -k * .9, -k * .15, -k * .95); ctx.lineTo(0, -k * .7); ctx.lineTo(k * .15, -k * .95);
        ctx.bezierCurveTo(k * .8, -k * .9, k * .9, k * .4, 0, k); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = Math.max(.6, k * .06); ctx.stroke(); ctx.restore();
      }
    },
    confetti(ctx, o, r, s, n, col, p) {
      for (let i = 0; i < n; i++) {
        const x0 = r(), y0 = r(), w = (8 + 8 * r()) * s, h = (4 + 5 * r()) * s, rot0 = r() * TAU, dir = r() < .5 ? 1 : -1, sway = (15 + 30 * r()) * s, off = r(), pick = Math.floor(r() * CONFETTI.length), cyc = r() < .5 ? 1 : 2, shape = r();
        const m = w * 2, y = o.y - m + wrap(y0 + cyc * p) * (o.h + 2 * m), x = o.x + x0 * o.w + sway * Math.sin(TAU * (cyc * p + off)), f = Math.cos(TAU * (3 * p + off));
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot0 + dir * TAU * cyc * p); ctx.scale(1, f);
        const c = CONFETTI[pick]; ctx.fillStyle = f < 0 ? mix(c, "#000000", .22) : c; ctx.strokeStyle = ctx.fillStyle;   // the back side is darker
        if (shape < .6) ctx.fillRect(-w / 2, -h / 2, w, h);
        else if (shape < .85) { ctx.beginPath(); ctx.arc(0, 0, h * .8, 0, TAU); ctx.fill(); }
        else { ctx.lineWidth = h * .7; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-w, 0); ctx.bezierCurveTo(-w * .4, -h * 2.2, w * .4, h * 2.2, w, 0); ctx.stroke(); }   // curly streamer
        ctx.restore();
      }
    },
    glow(ctx, o, r, s, n, col, p) {
      const base = Math.min(o.w, o.h) / 2;
      for (let i = 0; i < n; i++) {
        // Keep each blob inside the box so its soft edge never gets cut into a hard rectangle.
        const rad0 = Math.min(base * (.6 + .4 * r()) * s, base), off = r(), jx = r() * 2 - 1, jy = r() * 2 - 1;
        const rad = rad0 * (1 + .1 * Math.sin(TAU * (p + off))) * .95, ax = Math.max(0, o.w / 2 - rad), ay = Math.max(0, o.h / 2 - rad), swing = n === 1 ? 0 : 1, orbit = Math.min(o.w, o.h) * .05;
        const x = o.x + o.w / 2 + swing * jx * ax * .85 + orbit * Math.cos(TAU * (p + off)), y = o.y + o.h / 2 + swing * jy * ay * .85 + orbit * Math.sin(TAU * (p + off)), k = .85 + .15 * Math.sin(TAU * (p + off));
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba(col, .55 * k)); g.addColorStop(.45, rgba(col, .2 * k)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
        glowDot(ctx, x, y, rad * .32, col, .45 * k, .3);                              // bright heart
        ctx.save(); ctx.translate(x, y); ctx.scale(1, .06);                           // a soft horizontal lens streak
        const st = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 1.9); st.addColorStop(0, rgba("#ffffff", .32 * k)); st.addColorStop(.3, rgba(col, .16 * k)); st.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = st; ctx.beginPath(); ctx.arc(0, 0, rad * 1.9, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
  };

  function draw(ctx, o, phase) {
    const fn = DRAW[o.fx]; if (!fn) return;
    const p = wrap(phase == null ? (o.frame || 0) : phase);
    const r = rng(o.seed), s = (o.fxScale || 100) / 100, n = Math.max(1, Math.round(o.amount || 1));
    ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();   // never spills outside its own area
    if (ADDITIVE.has(o.fx)) ctx.globalCompositeOperation = "lighter";
    fn(ctx, o, r, s, n, o.color || "#ffffff", p);
    ctx.restore();
  }
  // Where the loop is now, if it started at o.frame and has been playing for `elapsed` seconds.
  const live = (o, elapsed) => wrap((o.frame || 0) + elapsed * ((o.speed || 100) / 100) / (PERIOD[o.fx] || 6));
  window.YayFx = { KINDS, DEFAULTS, PERIOD, draw, live, newSeed: () => 1 + Math.floor(Math.random() * 2147483646) };
})();
