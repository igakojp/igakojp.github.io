(() => {
  "use strict";
  const ROOT = "https://proxy.cors.dev/https://api.yay.space", API = `${ROOT}/v2`, V3 = `${ROOT}/v3`;
  const W = 1200, H = 800, G = 40, M = 24;
  const $ = id => document.getElementById(id);
  const FONTS = { sans: "system-ui,'Noto Sans JP','Yu Gothic UI',Meiryo,sans-serif", serif: "'Noto Serif JP','Yu Mincho',serif", round: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN','Yu Gothic UI',sans-serif", mono: "ui-monospace,Consolas,monospace" };
  const PRESETS = [["#1b2a55", "#0b1226", "#8de5ff", "#8b9cff", "#ffffff"], ["#ffe3ee", "#e6dcff", "#ff6f9f", "#b79cff", "#3b2748"], ["#d9fff1", "#cfe9ff", "#2fc9a0", "#4aa8ff", "#173b3a"], ["#ffd9a8", "#ff9db8", "#ff7a3d", "#ffcf4a", "#42203a"], ["#f2f2f2", "#bfc3cc", "#222222", "#777777", "#1b1b1b"], ["#2b1055", "#0f0c29", "#ff6fe5", "#46f0ff", "#ffffff"], ["#e7e0ff", "#c9dcff", "#7a63ff", "#53b6ff", "#2c2552"], ["#fff6bf", "#ffd9a0", "#ff9a1f", "#ff5d5d", "#47321a"]];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); kids.forEach(k => n.append(k)); return n; };
  const showErr = m => { $("pcError").textContent = m; $("pcError").classList.toggle("hidden", !m); };
  const setWarn = (p, kind) => { p.textContent = kind ? `${kind}らしき内容が含まれているため、反映していません。個人情報は書かないでください。` : ""; p.classList.toggle("hidden", !kind); };
  const S = { objs: [], sel: null, pen: false, user: null, hist: [], redo: [], guides: [], fol: { uid: null, users: [], next: null, done: false, loading: false }, theme: { text: "#ffffff", bg1: "#1b2a55", bg2: "#0b1226", pattern: "none", radius: 48, shade: 25, shape: "circle", ring: "gradient", ring1: "#8de5ff", ring2: "#8b9cff", ringW: 12 } };
  let uid = 1, drag = null;
  const mctx = document.createElement("canvas").getContext("2d");

  /* ---------- network ---------- */
  async function getJson(url) {
    const res = await window.YayAPI.fetch(url, { headers: { Accept: "application/json" } });
    let d = null; try { d = await res.json(); } catch { /* below */ }
    if (res.status === 429 || Number(d?.error_code) === 429) { const e = new Error("APIのアクセス制限を検出したため、処理を停止しました。時間をおいて再実行してください。"); e.stop = true; throw e; }
    if (res.status === 404) { const e = new Error("not found"); e.notFound = true; throw e; }
    if (!res.ok || !d || (d.result && d.result !== "success")) throw new Error(d?.message || `APIエラー (HTTP ${res.status})`);
    return d;
  }
  const get = path => getJson(`${API}${path}`);
  async function resolveUser(t) {
    t = String(t || "").trim(); if (!t) throw new Error("投稿のURL、プロフィールURL、またはユーザーIDを入力してください。");
    let id = (t.match(/user\/(\d+)/) || t.match(/^@?(\d+)$/) || [])[1];
    if (!id) {
      const pid = (t.match(/post\/(\d+)/) || [])[1]; if (!pid) throw new Error("URLまたはIDの形式を確認してください。");
      try { id = String((await get(`/posts/${pid}`)).post?.user?.id || ""); }
      catch (e) { if (e.notFound) throw new Error("この投稿はフォロワー限定のため特定できません。プロフィールURLまたはユーザーIDを入力してください。"); throw e; }
      if (!id) throw new Error("投稿からユーザーを特定できませんでした。");
    }
    const u = (await get(`/users/fresh/${id}`)).user; if (!u?.id) throw new Error("ユーザーが見つかりませんでした。"); return u;
  }
  async function loadImg(url) {
    if (!url) return null;
    for (const c of [url, `https://proxy.cors.dev/${url}`]) {
      try {
        const r = await fetch(c, { mode: "cors", credentials: "omit" }); if (!r.ok) continue;
        const b = await r.blob(); if (!b.type.startsWith("image/")) continue;
        const img = new Image(); img.src = URL.createObjectURL(b); await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; }); return img;
      } catch { /* next */ }
    }
    return null;
  }

  /* ---------- personal-information check ---------- */
  const NOT_SCHOOL = new Set(["女子", "男子", "私立", "公立", "県立", "市立", "国立", "都立", "道立", "府立", "同じ", "共学", "附属"]);
  function findPII(raw) {
    const t = String(raw || "").normalize("NFKC").toLowerCase();
    if (!t.trim()) return null;
    const digits = t.replace(/[\s\-‐‑–—ー−.()（）・,、_/]/g, "");
    if (/(\+?81|0)[5789]0\d{8}|0\d{9,10}|\+81\d{9,10}|\d{11,}/.test(digits) || /(tel|電話|でんわ|携帯|番号)[^0-9]{0,5}\d{8,}/.test(digits)) return "電話番号";
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(t) || /(gmail|yahoo|icloud|hotmail|outlook|docomo|softbank|au)\.(com|co\.jp|ne\.jp|jp)/.test(t)) return "メールアドレス";
    if (/https?:|www\.|[a-z0-9-]+\.(com|jp|net|me|gg|tv|io|co|xyz|app|link|page)(\/|\b)/.test(t)) return "URL・リンク";
    if (/(^|[^a-z])(line|insta|instagram|ig|twitter|x|tiktok|discord|snap|snapchat|kik|kakao|id)\s*[:=→⇒@]\s*[a-z0-9._-]{3,}/.test(t) || /(ライン|らいん|インスタ|ツイッター|ティックトック|ディスコ|ディスコード|スナチャ|カカオ|アイディー|あいでぃー|ゼンリー|ビーリアル)[\s:=→⇒@は]*[a-z0-9._-]{4,}/.test(t) || /@[a-z0-9._]{3,}/.test(t)) return "SNSのID";
    if (/〒|\d{3}-\d{4}/.test(t) || /\d+丁目|\d+番地|\d+号室|(都|道|府|県)[^\s、,。]{0,8}?(市|区|町|村|郡)/.test(t)) return "住所";
    const re = /([一-鿿ァ-ヶa-z0-9]{2,})(小学校|中学校|高等学校|高校|大学|学園|高専|専門学校)/g; let m;
    while ((m = re.exec(t))) if (!NOT_SCHOOL.has(m[1])) return "学校名";
    return null;
  }
  let imgNoticed = false;
  const imageNotice = () => imgNoticed || (imgNoticed = confirm("顔・制服・学校名・住所などが分かる写真は使わないでください。続けますか？"));

  /* ---------- objects ---------- */
  const mk = (type, p) => Object.assign({ id: uid++, type, x: 100, y: 100, w: 300, h: 100, color: S.theme.text, colorAuto: true, size: 40, bold: false, under: false, strike: false, font: "sans", strokeC: "#000000", strokeW: 0, alpha: 100, fillOn: true, rot: 0 }, p);
  const sel = () => S.objs.find(o => o.id === S.sel);
  const add = o => { hist(); S.objs.push(o); fit(o); S.sel = o.id; syncPanel(); draw(); return o; };
  const setFont = (c, o) => { c.font = `${o.bold ? "800" : "500"} ${o.size}px ${FONTS[o.font]}`; };
  function wrapLines(c, o) {
    const out = [];
    for (const para of String(o.text || "").split("\n")) {
      let line = "";
      for (const ch of Array.from(para)) { if (line && c.measureText(line + ch).width > o.w) { out.push(line); line = ch; } else line += ch; }
      out.push(line);
    }
    return out;
  }
  function textBox(o) { setFont(mctx, o); return { lines: wrapLines(mctx, o), lh: o.size * 1.4 }; }
  function ell(c, text, maxW) { if (c.measureText(text).width <= maxW) return text; const a = Array.from(text); while (a.length > 1 && c.measureText(a.join("") + "…").width > maxW) a.pop(); return a.join("") + "…"; }
  function layoutTags(o) {
    mctx.font = `700 ${o.size}px ${FONTS[o.font]}`;
    const ph = Math.round(o.size * 1.75), gap = Math.round(o.size * .45), pad = Math.round(o.size * .65), head = o.label ? Math.round(o.size * 1.3) : 0, items = [];
    let x = 0, y = head;
    for (const it of o.items) {
      const ic = it.img ? ph - 10 : 0, extra = pad * 2 + (ic ? ic + 8 : 0), t = ell(mctx, it.text || "", Math.max(20, o.w - extra)), w = extra + mctx.measureText(t).width;
      if (x && x + w > o.w) { x = 0; y += ph + gap; }
      items.push({ it, t, x, y, w, ph, ic, pad }); x += w + gap;
    }
    return { items, ph, head, total: items.length ? y + ph : head + ph };
  }
  function bounds(o) {
    if (o.type === "text") { const t = textBox(o); o.h = Math.max(o.size * 1.4, t.lines.length * t.lh); return { x: o.x, y: o.y, w: o.w, h: o.h }; }
    if (o.type === "tags") { o.h = layoutTags(o).total; return { x: o.x, y: o.y, w: o.w, h: o.h }; }
    if (o.type === "pen") { const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]), pad = o.strokeW / 2; return { x: Math.min(...xs) - pad + o.x, y: Math.min(...ys) - pad + o.y, w: Math.max(...xs) - Math.min(...xs) + o.strokeW, h: Math.max(...ys) - Math.min(...ys) + o.strokeW }; }
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
  function shapePath(ctx, o) {
    const { x, y, w, h } = o; ctx.beginPath();
    if (o.kind === "circle") ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    else if (o.kind === "round") ctx.roundRect(x, y, w, h, Math.min(Math.abs(w), Math.abs(h)) * .25);
    else if (o.kind === "star") { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? .45 : 1, px = x + w / 2 + Math.cos(a) * w / 2 * k, py = y + h / 2 + Math.sin(a) * h / 2 * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
    else if (o.kind === "heart") { ctx.moveTo(x + w / 2, y + h); ctx.bezierCurveTo(x - w * .25, y + h * .45, x + w * .1, y - h * .15, x + w / 2, y + h * .3); ctx.bezierCurveTo(x + w * .9, y - h * .15, x + w * 1.25, y + h * .45, x + w / 2, y + h); ctx.closePath(); }
    else if (o.kind === "line") { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); }
    else ctx.rect(x, y, w, h);
  }
  function cover(ctx, img, x, y, w, h) { const k = Math.max(w / img.width, h / img.height); ctx.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k); }
  function ringPath(ctx, o, inset) { ctx.beginPath(); if (S.theme.shape === "round") ctx.roundRect(o.x + inset, o.y + inset, o.w - inset * 2, o.h - inset * 2, (o.w - inset * 2) * .28); else ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(1, o.w / 2 - inset), Math.max(1, o.h / 2 - inset), 0, 0, Math.PI * 2); }
  function drawAvatar(ctx, o) {
    const t = S.theme, rw = t.ring === "none" ? 0 : Math.min(t.ringW, o.w / 6);
    ctx.save(); ringPath(ctx, o, rw); ctx.clip(); if (o.img) cover(ctx, o.img, o.x, o.y, o.w, o.h); else { ctx.fillStyle = "#667"; ctx.fillRect(o.x, o.y, o.w, o.h); } ctx.restore();
    if (!rw) return;
    const g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h); g.addColorStop(0, t.ring1); g.addColorStop(1, t.ring === "gradient" ? t.ring2 : t.ring1);
    ctx.lineWidth = t.ring === "double" ? rw / 2.4 : rw; ctx.strokeStyle = g; ringPath(ctx, o, t.ring === "double" ? rw / 4.8 : rw / 2); ctx.stroke();
    if (t.ring === "double") { ctx.strokeStyle = t.ring2; ringPath(ctx, o, rw - rw / 4.8); ctx.stroke(); }
  }
  function drawTags(ctx, o) {
    const L = layoutTags(o); ctx.textBaseline = "middle"; ctx.textAlign = "left";
    if (o.label) { ctx.font = `700 ${Math.round(o.size * .8)}px ${FONTS[o.font]}`; ctx.fillStyle = o.color; ctx.fillText(ell(ctx, o.label, o.w), o.x, o.y + L.head / 2 - 2); }
    ctx.font = `700 ${o.size}px ${FONTS[o.font]}`;
    for (const p of L.items) {
      const x = o.x + p.x, y = o.y + p.y;
      ctx.save(); ctx.globalAlpha *= .18; ctx.fillStyle = o.color; ctx.beginPath(); ctx.roundRect(x, y, p.w, p.ph, p.ph / 2); ctx.fill(); ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = o.color; ctx.beginPath(); ctx.roundRect(x, y, p.w, p.ph, p.ph / 2); ctx.stroke();
      let tx = x + p.pad;
      if (p.ic && p.it.img) { const d = p.ic, cx0 = x + 5 + d / 2, cy0 = y + p.ph / 2; ctx.save(); ctx.beginPath(); ctx.arc(cx0, cy0, d / 2, 0, Math.PI * 2); ctx.clip(); cover(ctx, p.it.img, cx0 - d / 2, cy0 - d / 2, d, d); ctx.restore(); tx = x + 5 + d + 8 + p.pad * .5; }
      ctx.fillStyle = o.color; ctx.fillText(p.t, tx, y + p.ph / 2 + 1);
    }
  }
  function drawObj(ctx, o) {
    ctx.save(); ctx.globalAlpha = o.alpha / 100;
    if (o.type === "text") {
      setFont(ctx, o); ctx.textBaseline = "top"; ctx.textAlign = "left"; const t = textBox(o);
      t.lines.forEach((l, i) => {
        const y = o.y + i * t.lh + (t.lh - o.size) / 2, wd = ctx.measureText(l).width, th = Math.max(2, o.size / 16);
        if (o.strokeW) { ctx.lineJoin = "round"; ctx.lineWidth = o.strokeW; ctx.strokeStyle = o.strokeC; ctx.strokeText(l, o.x, y); }
        ctx.fillStyle = o.color; ctx.fillText(l, o.x, y);
        if (o.under) ctx.fillRect(o.x, y + o.size * 1.05, wd, th);
        if (o.strike) ctx.fillRect(o.x, y + o.size * .52, wd, th);
      });
    } else if (o.type === "tags") drawTags(ctx, o);
    else if (o.type === "person") {
      const d = Math.min(o.h, o.w), gap = Math.round(o.size * .5);
      drawAvatar(ctx, { x: o.x, y: o.y, w: d, h: d, img: o.img });
      const t = Object.assign({}, o, { type: "text", text: o.name || "", x: o.x + d + gap, w: Math.max(40, o.w - d - gap) });
      t.y = o.y + d / 2 - textBox(t).lines.length * o.size * 1.4 / 2; drawObj(ctx, t);
    } else if (o.type === "image" || o.type === "header") {
      ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
      if (o.img) cover(ctx, o.img, o.x, o.y, o.w, o.h);
      if (o.type === "header") { ctx.fillStyle = `rgba(0,0,0,${S.theme.shade / 100})`; ctx.fillRect(o.x, o.y, o.w, o.h); }
      ctx.restore(); if (o.strokeW) { ctx.lineWidth = o.strokeW; ctx.strokeStyle = o.strokeC; ctx.strokeRect(o.x, o.y, o.w, o.h); }
    } else if (o.type === "avatar") drawAvatar(ctx, o);
    else if (o.type === "shape") {
      shapePath(ctx, o);
      if (o.fillOn && o.kind !== "line") { ctx.fillStyle = o.color; ctx.fill(); }
      if (o.strokeW || o.kind === "line") { ctx.lineWidth = o.strokeW || 6; ctx.strokeStyle = o.kind === "line" ? o.color : o.strokeC; ctx.lineJoin = "round"; ctx.stroke(); }
    } else if (o.type === "pen") {
      ctx.translate(o.x, o.y); ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = o.strokeC; ctx.lineWidth = o.strokeW; ctx.beginPath();
      o.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (o.pts.length === 1) ctx.lineTo(o.pts[0][0] + .1, o.pts[0][1]); ctx.stroke();
    }
    ctx.restore();
  }
  function drawBg(ctx) {
    const t = S.theme, g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, t.bg1); g.addColorStop(1, t.bg2);
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, W, H, t.radius); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2;
    if (t.pattern === "dots") for (let x = 20; x < W; x += 40) for (let y = 20; y < H; y += 40) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    if (t.pattern === "grid") { for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
    if (t.pattern === "stripe") for (let x = -H; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
    ctx.restore();
  }
  const cv = $("pcCanvas"), cx = cv.getContext("2d");
  const ctr = b => [b.x + b.w / 2, b.y + b.h / 2];
  const handles = b => [{ k: "se", x: b.x + b.w, y: b.y + b.h }, { k: "e", x: b.x + b.w, y: b.y + b.h / 2 }, { k: "s", x: b.x + b.w / 2, y: b.y + b.h }];
  const rotPt = b => ({ k: "rot", x: b.x + b.w / 2, y: b.y - 50 });
  function rotated(ctx, o, f) { if (!o.rot) return f(); const [x0, y0] = ctr(bounds(o)); ctx.save(); ctx.translate(x0, y0); ctx.rotate(o.rot * Math.PI / 180); ctx.translate(-x0, -y0); f(); ctx.restore(); }
  function render(ctx, withUi) {
    ctx.clearRect(0, 0, W, H); drawBg(ctx);
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, W, H, S.theme.radius); ctx.clip(); S.objs.forEach(o => rotated(ctx, o, () => drawObj(ctx, o))); ctx.restore();
    if (!withUi) return;
    if (drag && drag.m !== "pen" && gridOn()) { ctx.save(); ctx.fillStyle = "rgba(255,255,255,.3)"; for (let x = G; x < W; x += G) for (let y = G; y < H; y += G) ctx.fillRect(x - 1.5, y - 1.5, 3, 3); ctx.restore(); }
    if (S.guides.length) { ctx.save(); ctx.strokeStyle = "#ff6fa8"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); S.guides.forEach(g => { ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x, 0); ctx.lineTo(g.x, H); } else { ctx.moveTo(0, g.y); ctx.lineTo(W, g.y); } ctx.stroke(); }); ctx.restore(); }
    const o = sel(); if (!o) return; const b = bounds(o);
    rotated(ctx, o, () => {
      ctx.save(); ctx.strokeStyle = "#46caff"; ctx.lineWidth = 3; ctx.setLineDash([10, 7]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]); ctx.fillStyle = "#fff";
      if (o.type !== "pen") handles(b).forEach(h => { ctx.beginPath(); ctx.rect(h.x - 13, h.y - 13, 26, 26); ctx.fill(); ctx.stroke(); });
      const r = rotPt(b); ctx.beginPath(); ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(r.x, r.y); ctx.stroke(); ctx.beginPath(); ctx.arc(r.x, r.y, 15, 0, Math.PI * 2); ctx.fillStyle = "#46caff"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.restore();
    });
  }
  const draw = () => { render(cx, true); renderLayers(); };

  /* ---------- history, grid, keeping parts inside the card ---------- */
  const gridOn = () => $("pcSnap").checked;
  const cloneObjs = () => S.objs.map(o => ({ ...o, pts: o.pts && o.pts.map(p => p.slice()), items: o.items && o.items.map(i => ({ ...i })) }));
  function hist() { S.hist.push({ objs: cloneObjs(), sel: S.sel }); if (S.hist.length > 60) S.hist.shift(); S.redo = []; }
  function undo(redo) { const from = redo ? S.redo : S.hist, to = redo ? S.hist : S.redo, st = from.pop(); if (!st) return; to.push({ objs: cloneObjs(), sel: S.sel }); S.objs = st.objs; S.sel = st.sel; tgSig = ""; syncPanel(); draw(); }
  let lastH = 0; const histSoon = () => { const t = Date.now(); if (t - lastH > 700) hist(); lastH = t; };
  function fit(o) {
    if (o.type === "pen") { const b = bounds(o); if (b.x < M) o.x += M - b.x; if (b.x + b.w > W - M) o.x -= b.x + b.w - (W - M); if (b.y < M) o.y += M - b.y; if (b.y + b.h > H - M) o.y -= b.y + b.h - (H - M); return; }
    if (o.type === "header") { o.x = 0; o.w = W; o.h = clamp(o.h, G, H - G * 2); o.y = clamp(o.y, 0, H - o.h); return; }
    const textual = o.type === "text" || o.type === "tags";
    o.w = clamp(o.w, textual ? 80 : 40, W - M * 2); if (!textual) o.h = clamp(o.h, 20, H - M * 2);
    if (o.type === "person") o.w = Math.max(o.w, Math.min(o.h * 1.6, W - M * 2));
    const b = bounds(o); o.x = clamp(o.x, M, Math.max(M, W - M - b.w)); o.y = clamp(o.y, M, Math.max(M, H - M - b.h));
  }
  function snapMove(o) {
    S.guides = [];
    if (o.type !== "pen") {
      if (gridOn()) { o.x = Math.round(o.x / G) * G; o.y = Math.round(o.y / G) * G; }
      else { const b = bounds(o), dx = W / 2 - (b.x + b.w / 2), dy = H / 2 - (b.y + b.h / 2); if (Math.abs(dx) < 10) o.x += dx; if (Math.abs(dy) < 10) o.y += dy; }
    }
    fit(o); if (o.type === "pen") return;
    const b = bounds(o); if (Math.abs(b.x + b.w / 2 - W / 2) < 1) S.guides.push({ x: W / 2 }); if (Math.abs(b.y + b.h / 2 - H / 2) < 1) S.guides.push({ y: H / 2 });
  }

  /* ---------- pointer ---------- */
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const toLocal = (o, x, y) => { if (!o.rot) return [x, y]; const [c0, c1] = ctr(bounds(o)), a = -o.rot * Math.PI / 180, dx = x - c0, dy = y - c1; return [c0 + dx * Math.cos(a) - dy * Math.sin(a), c1 + dx * Math.sin(a) + dy * Math.cos(a)]; };
  const hit = (o, x, y) => { const [lx, ly] = toLocal(o, x, y), b = bounds(o); return lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h; };
  cv.addEventListener("pointerdown", e => {
    const [x, y] = pos(e); cv.setPointerCapture(e.pointerId);
    if (S.pen) { hist(); const o = mk("pen", { x: 0, y: 0, pts: [[x, y]], strokeC: $("pStrokeC").value, strokeW: Math.max(2, +$("pStrokeW").value || 8) }); S.objs.push(o); S.sel = o.id; drag = { m: "pen", o }; draw(); return; }
    const cur = sel();
    if (cur) {
      const b = bounds(cur), [lx, ly] = toLocal(cur, x, y), hs = (cur.type !== "pen" ? handles(b) : []).concat([rotPt(b)]);
      const h = hs.find(h => Math.abs(h.x - lx) < 26 && Math.abs(h.y - ly) < 26);
      if (h) { drag = { m: h.k, o: cur, x, y, b: { ...b }, size0: cur.size }; return; }
    }
    const o = [...S.objs].reverse().find(o => hit(o, x, y)); S.sel = o ? o.id : null;
    drag = o ? { m: "move", o, x, y, ox: o.x, oy: o.y } : null; syncPanel(); draw();
  });
  cv.addEventListener("pointermove", e => {
    if (!drag) return; const [x, y] = pos(e), o = drag.o;
    if (drag.m !== "pen" && !drag.pushed) { hist(); drag.pushed = true; }
    if (drag.m === "pen") o.pts.push([x, y]);
    else if (drag.m === "move") { o.x = drag.ox + x - drag.x; o.y = drag.oy + y - drag.y; snapMove(o); }
    else if (drag.m === "rot") { const [c0, c1] = ctr(drag.b); let a = Math.atan2(y - c1, x - c0) * 180 / Math.PI + 90; a = ((a + 540) % 360) - 180; o.rot = Math.round(a / 15) * 15; syncPanel(); }
    else {
      const b = drag.b, th = (o.rot || 0) * Math.PI / 180, dx = x - drag.x, dy = y - drag.y;
      const dxl = dx * Math.cos(th) + dy * Math.sin(th), dyl = -dx * Math.sin(th) + dy * Math.cos(th), nw = Math.max(20, b.w + dxl), nh = Math.max(20, b.h + dyl);
      const gs = gridOn(), sw = gs ? Math.max(G, Math.round(nw / G) * G) : nw, sh = gs ? Math.max(G, Math.round(nh / G) * G) : nh;
      o.x = b.x; o.y = b.y;
      if (o.type === "text" || o.type === "tags") {
        // width = wrapping width; the corner scales the whole block from its size at drag start (never compounds)
        if (drag.m !== "s") o.w = sw;
        if (drag.m === "se") o.size = clamp(Math.round(drag.size0 * (sw / b.w) / 2) * 2, 14, 160);
      } else {
        if (drag.m !== "s") o.w = sw; if (drag.m !== "e") o.h = sh;
        if (o.type === "avatar" && drag.m === "se") o.h = o.w;
        if (o.type === "person") o.size = clamp(Math.round(o.h * .32 / 2) * 2, 14, 160);
      }
      if (th) { const nb = bounds(o), v = (w, h, cx0, cy0) => [cx0 - w / 2 * Math.cos(th) + h / 2 * Math.sin(th), cy0 - w / 2 * Math.sin(th) - h / 2 * Math.cos(th)]; const v0 = v(b.w, b.h, b.x + b.w / 2, b.y + b.h / 2), v1 = v(nb.w, nb.h, nb.x + nb.w / 2, nb.y + nb.h / 2); o.x += v0[0] - v1[0]; o.y += v0[1] - v1[1]; }
      fit(o); syncPanel();
    }
    draw();
  });
  const end = () => { drag = null; S.guides = []; draw(); };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  const focusText = () => { const o = sel(); if (o && (o.type === "text" || o.type === "person")) { $("pText").scrollIntoView({ block: "center", behavior: "smooth" }); $("pText").focus({ preventScroll: true }); $("pText").select(); } };
  cv.addEventListener("dblclick", focusText); $("pcEditText").onclick = focusText;

  /* ---------- panel ---------- */
  const P = { color: "pColor", size: "pSize", strokeC: "pStrokeC", strokeW: "pStrokeW", alpha: "pAlpha", rot: "pRot" };
  const NAMES = { text: "文字", image: "画像", header: "ヘッダー", avatar: "アイコン", shape: "図形", pen: "ペンの線", tags: "タググループ", person: "ユーザー" };
  function syncPanel() {
    const o = sel(), isText = !!o && (o.type === "text" || o.type === "person");
    $("pcSelName").textContent = o ? `選択中: ${NAMES[o.type]}` : "パーツを選ぶとここで編集できます。";
    $("pTextWrap").classList.toggle("hidden", !isText);
    if (o) {
      for (const k in P) $(P[k]).value = o[k]; $("pBold").checked = o.bold; $("pUnder").checked = o.under; $("pStrike").checked = o.strike; $("pFont").value = o.font; $("pFillOn").value = o.fillOn ? "1" : "0";
      if (isText && document.activeElement !== $("pText")) $("pText").value = o.type === "text" ? o.text : o.name;
    }
    renderTagEditor();
  }
  const edit = (k, f) => $(k).addEventListener("input", () => { const o = sel(); if (!o) return; histSoon(); f(o, $(k)); draw(); });
  for (const k in P) edit(P[k], (o, el2) => { o[k] = k.endsWith("C") || k === "color" ? el2.value : +el2.value; });
  $("pColor").addEventListener("input", () => { const o = sel(); if (o) o.colorAuto = false; });
  edit("pBold", (o, e2) => o.bold = e2.checked); edit("pUnder", (o, e2) => o.under = e2.checked); edit("pStrike", (o, e2) => o.strike = e2.checked);
  edit("pFont", (o, e2) => o.font = e2.value); edit("pFillOn", (o, e2) => o.fillOn = e2.value === "1");
  $("pText").addEventListener("input", () => {
    const o = sel(); if (!o || (o.type !== "text" && o.type !== "person")) return;
    const v = $("pText").value, bad = findPII(v); setWarn($("pTextWarn"), bad); if (bad) return;
    histSoon(); if (o.type === "text") { o.text = v; o.api = false; } else { o.name = v; o.nameEdited = true; } draw();
  });
  const T = { tBg1: "bg1", tBg2: "bg2", tPattern: "pattern", tRadius: "radius", tShade: "shade", tShape: "shape", tRing: "ring", tRing1: "ring1", tRing2: "ring2", tRingW: "ringW" };
  function markTiles() { document.querySelectorAll(".pc-tiles").forEach(box => { const sl = $(box.dataset.for); box.querySelectorAll(".pc-tile").forEach(b => b.classList.toggle("on", b.dataset.v === sl.value)); }); }
  function syncTheme() { for (const id in T) $(id).value = S.theme[T[id]]; markTiles(); }
  function buildTiles() {
    document.querySelectorAll(".pc-tiles").forEach(box => {
      const sl = $(box.dataset.for); box.innerHTML = "";
      [...sl.options].forEach(op => { const b = el("button", { type: "button", className: "pc-tile", textContent: op.textContent }); b.dataset.v = op.value; if (sl.id === "tPreset") { const p = PRESETS[+op.value]; b.style.background = `linear-gradient(135deg,${p[0]},${p[1]})`; b.style.color = p[4]; b.style.borderColor = p[2]; } b.onclick = () => { sl.value = op.value; sl.dispatchEvent(new Event("input")); markTiles(); }; box.appendChild(b); });
    }); markTiles();
  }
  for (const id in T) $(id).addEventListener("input", () => { S.theme[T[id]] = ["tRadius", "tShade", "tRingW"].includes(id) ? +$(id).value : $(id).value; draw(); });
  $("tPreset").addEventListener("input", () => {
    const p = PRESETS[+$("tPreset").value]; Object.assign(S.theme, { bg1: p[0], bg2: p[1], ring1: p[2], ring2: p[3], text: p[4] });
    S.objs.forEach(o => { if (o.colorAuto && ["text", "tags", "person"].includes(o.type)) o.color = p[4]; }); syncTheme(); syncPanel(); draw();
  });

  /* ---------- tag groups (any number of groups, any number of tags) ---------- */
  let tgSig = "", pendingItem = null;
  function renderTagEditor(force) {
    const box = $("tgEditor"), o = sel(), g = o && o.type === "tags" ? o : null;
    const sig = g ? g.id + ":" + g.items.map(i => i.id + (i.img ? "i" : "")).join(",") : "none";
    if (!force && sig === tgSig) return; tgSig = sig; box.innerHTML = "";
    if (!g) { box.append(el("p", { className: "subtle", textContent: "キャンバス上のタググループを選ぶと、ここで編集できます。「＋タググループ」で新しいグループを作れます。" })); return; }
    const warn = el("p", { className: "pc-warn hidden" });
    const title = el("input", { className: "pc-in", value: g.label || "", placeholder: "例: ○ いいこと／ゲーム／好きな食べ物（空でもOK）", maxLength: 60 });
    title.oninput = () => { const bad = findPII(title.value); setWarn(warn, bad); if (bad) return; histSoon(); g.label = title.value.trim(); draw(); };
    box.append(el("label", { className: "pc-field" }, "グループの名前", title));
    g.items.forEach(it => {
      const thumb = el("button", { type: "button", className: "pc-tagthumb", title: it.img ? "画像を変更" : "画像を付ける" });
      if (it.img) thumb.append(el("img", { src: it.img.src, alt: "" })); else thumb.textContent = "＋";
      thumb.onclick = () => { if (!imageNotice()) return; pendingItem = it; $("tagFile").click(); };
      const inp = el("input", { className: "pc-in", value: it.text, maxLength: 200 });
      inp.oninput = () => { const bad = findPII(inp.value); setWarn(warn, bad); if (bad) return; histSoon(); it.text = inp.value; it.api = false; draw(); };
      const del = el("button", { type: "button", className: "secondary-btn", textContent: "×", title: "このタグを削除" });
      del.onclick = () => { hist(); g.items = g.items.filter(x => x !== it); renderTagEditor(true); draw(); };
      const row = el("div", { className: "pc-tagrow2" }, thumb, inp);
      if (it.img) { const rm = el("button", { type: "button", className: "secondary-btn", textContent: "画像を外す" }); rm.onclick = () => { hist(); it.img = null; renderTagEditor(true); draw(); }; row.append(rm); }
      row.append(del); box.append(row);
    });
    const nw = el("input", { className: "pc-in", placeholder: "新しいタグを入力（Enterで追加。改行・カンマで複数）" }); nw.dataset.new = "1";
    const addTags = () => {
      const parts = nw.value.split(/[\n,、，]+/).map(s => s.trim()).filter(Boolean); if (!parts.length) return;
      const bad = parts.map(findPII).find(Boolean); if (bad) { setWarn(warn, bad); return; }
      hist(); parts.forEach(t => g.items.push({ id: uid++, text: t, img: null, api: false })); renderTagEditor(true); draw(); const n = $("tgEditor").querySelector("[data-new]"); if (n) n.focus();
    };
    nw.onkeydown = e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addTags(); } };
    const addBtn = el("button", { type: "button", className: "secondary-btn", textContent: "＋追加" }); addBtn.onclick = addTags;
    const userBtn = el("button", { type: "button", className: "secondary-btn", textContent: "＋ユーザーを追加" });
    userBtn.onclick = () => openPicker(async u => { const img = await loadImg(u.profile_icon_thumbnail || u.profile_icon); hist(); g.items.push({ id: uid++, text: u.nickname || "", img, api: true }); if (sel() === g) renderTagEditor(true); draw(); });
    const delGrp = el("button", { type: "button", className: "secondary-btn", textContent: "このグループを削除" });
    delGrp.onclick = () => { hist(); S.objs = S.objs.filter(q => q !== g); S.sel = null; syncPanel(); draw(); };
    box.append(el("div", { className: "pc-tagrow2" }, nw, addBtn), warn, el("div", { className: "pc-toolbar" }, userBtn, delGrp));
  }
  $("tagFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f || !pendingItem) return;
    const img = new Image(); img.src = URL.createObjectURL(f); await new Promise(r => { img.onload = r; img.onerror = r; });
    if (img.width) { hist(); pendingItem.img = img; tgSig = ""; renderTagEditor(true); draw(); } pendingItem = null;
  };
  const addGroup = () => add(mk("tags", { x: 80, y: 480, w: 680, size: 26, label: "タグ", items: [], font: "round" }));
  $("pcTagAdd").onclick = addGroup; $("tgAdd").onclick = addGroup;

  /* ---------- user picker: type an ID / profile URL / post URL, or choose from the card owner's followers ---------- */
  let pickCb = null;
  const modalOpen = () => !$("pcPicker").classList.contains("hidden");
  function openPicker(cb) {
    pickCb = cb; $("pkErr").classList.add("hidden"); $("pkInput").value = ""; query = ""; searchTok++;
    $("pkFolLbl").textContent = `${S.user.nickname} さんのフォロワーから選ぶ`; $("pcPicker").classList.remove("hidden"); document.body.classList.add("pc-modal-open");
    if (S.fol.uid !== String(S.user.id)) { S.fol = { uid: String(S.user.id), users: [], next: null, done: false, loading: false }; $("pkList").innerHTML = ""; $("pkMore").textContent = ""; }
    if (!S.fol.users.length) loadFollowers(); else { $("pkMore").textContent = moreText(); }
  }
  function closePicker() { $("pcPicker").classList.add("hidden"); document.body.classList.remove("pc-modal-open"); pickCb = null; }
  async function pickUser(u) {
    const cb = pickCb; closePicker(); if (!cb) return;
    try { await cb(u); } catch (e) { showErr(e.message || "追加できませんでした。"); }
  }
  /* follower list: names are filtered as you type; when the text is not an ID/URL it searches the owner's followers */
  let query = "", searchTok = 0;
  const isIdLike = t => /user\/\d+|post\/\d+|^@?\d+$/.test(String(t).trim());
  const norm = x => String(x || "").normalize("NFKC").toLowerCase();
  const matches = name => { const n = norm(name); return norm(query).split(/\s+/).filter(Boolean).every(t => n.includes(t)); };
  function applyFilter() {
    const searching = !!query.trim() && !isIdLike(query); let shown = 0;
    [...$("pkList").children].forEach(b => { const ok = !searching || matches(b.dataset.n); b.hidden = !ok; if (ok) shown++; });
    return { searching, shown };
  }
  function moreText() {
    const f = S.fol, { searching, shown } = applyFilter(), q = query.trim();
    if (searching) return shown ? `「${q}」に合う人: ${shown}人${f.done ? "（全員を確認しました）" : `（${f.users.length}人を確認済み。続きを探しています…）`}` : f.done ? `「${q}」に合う人は見つかりませんでした。` : `探しています…（${f.users.length}人を確認済み）`;
    return f.done ? (f.users.length ? "これで全員です。" : "フォロワーが見つかりませんでした。") : "一番下までスクロールすると、続きを読み込みます。";
  }
  function renderFollowers(list) {
    const box = $("pkList");
    list.forEach(u => {
      const b = el("button", { type: "button", className: "pc-pick-item" }, el("img", { src: u.profile_icon_thumbnail || u.profile_icon || "", alt: "", loading: "lazy", referrerPolicy: "no-referrer" }), el("span", { textContent: u.nickname || `@${u.id}` }));
      b.dataset.n = u.nickname || ""; b.onclick = () => pickUser(u); box.append(b);
    });
  }
  async function loadFollowers() {
    const f = S.fol; if (f.loading || f.done) return; f.loading = true; f.error = false; $("pkMore").textContent = "読み込み中…";
    try {
      const d = await getJson(`${V3}/users/${f.uid}/followers?number=50${f.next ? `&from=${encodeURIComponent(f.next)}` : ""}`);
      const seen = new Set(f.users.map(u => String(u.id))), fresh = (Array.isArray(d.users) ? d.users : []).filter(u => u && !seen.has(String(u.id)));
      f.users.push(...fresh); f.pages = (f.pages || 0) + 1; renderFollowers(fresh);
      f.next = d.next_page_value ? String(d.next_page_value) : null; if (!f.next || !fresh.length) f.done = true;
      $("pkMore").textContent = moreText();
    } catch (e) { f.error = true; $("pkMore").textContent = e.message; if (e.stop) f.done = true; }
    finally { f.loading = false; }
    const l = $("pkList"); if (!f.done && !f.error && modalOpen() && (f.pages || 0) < 40 && l.scrollHeight <= l.clientHeight + 4) loadFollowers();
  }
  async function searchMore() {
    const tok = ++searchTok, f = S.fol; $("pkMore").textContent = moreText();
    while (tok === searchTok && !f.done && !f.error && modalOpen()) {
      const { searching, shown } = applyFilter(); if (!searching || shown >= 8 || (f.pages || 0) >= 40) break;
      if (f.loading) { await new Promise(r => setTimeout(r, 200)); continue; }
      await loadFollowers();
    }
    if (tok === searchTok && !f.error) $("pkMore").textContent = moreText();
  }
  $("pkList").addEventListener("scroll", () => { const l = $("pkList"); if (l.scrollTop + l.clientHeight >= l.scrollHeight - 60) loadFollowers(); });
  $("pkInput").addEventListener("input", () => { query = $("pkInput").value; $("pkErr").classList.add("hidden"); const { searching } = applyFilter(); if (searching) searchMore(); else { searchTok++; $("pkMore").textContent = moreText(); } });
  $("pkFind").onclick = async () => {
    const v = $("pkInput").value.trim(), btn = $("pkFind"); $("pkErr").classList.add("hidden");
    if (v && !isIdLike(v)) { query = v; searchMore(); return; }   // not an ID/URL: look for the name among the followers
    btn.disabled = true;
    try { pickUser(await resolveUser(v)); } catch (e) { $("pkErr").textContent = e.message; $("pkErr").classList.remove("hidden"); } finally { btn.disabled = false; }
  };
  $("pkInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) $("pkFind").click(); });
  $("pkLikers").onclick = () => { if (window.YayLikers) window.YayLikers.open(u => pickUser(u)); };
  $("pkClose").onclick = closePicker; $("pcPicker").addEventListener("pointerdown", e => { if (e.target === $("pcPicker")) closePicker(); });
  $("pcUserAdd").onclick = () => openPicker(async u => {
    const img = await loadImg(u.profile_icon || u.profile_icon_thumbnail);
    add(mk("person", { x: 440, y: 320, w: 440, h: 120, name: u.nickname || "", img, size: 38, bold: true }));
  });

  /* ---------- toolbar ---------- */
  document.querySelectorAll("[data-add=text]").forEach(b => b.onclick = () => add(mk("text", { text: "テキスト", x: 120, y: 340, w: 600, size: 56 })));
  $("pcImgBtn").onclick = () => { if (imageNotice()) $("pcFile").click(); };
  $("pcFile").onchange = async e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.src = URL.createObjectURL(f); await new Promise(r => { img.onload = r; }); const k = Math.min(500 / img.width, 400 / img.height, 1); add(mk("image", { img, x: 200, y: 300, w: img.width * k, h: img.height * k })); e.target.value = ""; };
  $("pcShapeAdd").onchange = e => { const k = e.target.value; if (k) add(mk("shape", { kind: k, x: 320, y: 360, w: 240, h: k === "line" ? 40 : 240, color: S.theme.ring1, colorAuto: false, strokeW: 0 })); e.target.value = ""; };
  $("pcPen").onclick = () => { S.pen = !S.pen; $("pcPen").textContent = `✎ ペン: ${S.pen ? "オン" : "オフ"}`; $("pcPen").classList.toggle("primary-btn", S.pen); cv.style.cursor = S.pen ? "crosshair" : ""; };
  function splitObj(o) {
    if (o.type === "tags") {
      const L = layoutTags(o), out = [];
      if (o.label) out.push(mk("text", { x: o.x, y: o.y, w: 360, size: Math.round(o.size * .8), bold: true, color: o.color, font: o.font, text: o.label, alpha: o.alpha }));
      L.items.forEach(p => out.push(mk("tags", { x: o.x + p.x, y: o.y + p.y, w: p.w + 4, size: o.size, color: o.color, font: o.font, items: [{ ...p.it, id: uid++ }], label: "", alpha: o.alpha })));
      return o.items.length > 1 || o.label ? out : [];
    }
    if (o.type === "text" && o.text.includes("\n")) { let y = o.y; return o.text.split("\n").filter(l => l !== "").map(l => { const p = Object.assign({}, o, { id: uid++, text: l, y, rot: 0 }); y += textBox(p).lines.length * o.size * 1.4; return p; }); }
    return [];
  }
  document.querySelectorAll("[data-z]").forEach(b => b.onclick = () => {
    const o = sel(); if (!o) return; hist(); const i = S.objs.indexOf(o), a = S.objs, z = b.dataset.z;
    if (z === "del") { a.splice(i, 1); S.sel = null; }
    else if (z === "split") { const parts = splitObj(o); if (!parts.length) { S.hist.pop(); return; } a.splice(i, 1, ...parts); S.sel = parts[parts.length - 1].id; }
    else if (z === "dup") { const c = Object.assign({}, o, { id: uid++, x: o.x + 30, y: o.y + 30, pts: o.pts && o.pts.map(p => p.slice()), items: o.items && o.items.map(it => ({ ...it, id: uid++ })) }); a.push(c); S.sel = c.id; }
    else { a.splice(i, 1); a.splice(z === "top" ? a.length : z === "bottom" ? 0 : z === "up" ? Math.min(a.length, i + 1) : Math.max(0, i - 1), 0, o); }
    tgSig = ""; syncPanel(); draw();
  });
  let layerSig = "";
  function renderLayers() {
    const sig = S.objs.map(o => o.id).join(",") + "|" + S.sel; if (sig === layerSig) return; layerSig = sig;
    const box = $("pcLayers"); box.innerHTML = "";
    [...S.objs].reverse().forEach(o => {
      const extra = o.type === "text" ? (o.text || "").replace(/\n/g, " ") : o.type === "person" ? o.name : o.type === "tags" ? (o.label || o.items.map(i => i.text).join(" ")) : "";
      const b = el("button", { type: "button", className: "pc-layer" + (o.id === S.sel ? " on" : ""), textContent: NAMES[o.type] + (extra ? "：" + extra.slice(0, 14) : "") });
      b.onclick = () => { S.sel = o.id; syncPanel(); draw(); }; box.appendChild(b);
    });
  }
  $("pcUndo").onclick = () => undo(false); $("pcRedo").onclick = () => undo(true);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modalOpen()) { closePicker(); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || $("pcEditor").classList.contains("hidden") || modalOpen()) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); undo(e.shiftKey); return; }
    if (mod && k === "y") { e.preventDefault(); undo(true); return; }
    const o = sel(); if (!o) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); hist(); S.objs = S.objs.filter(q => q !== o); S.sel = null; syncPanel(); draw(); return; }
    const d = gridOn() ? (e.shiftKey ? G * 3 : G) : (e.shiftKey ? 10 : 1), m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (m) { e.preventDefault(); histSoon(); o.x += m[0]; o.y += m[1]; fit(o); draw(); }
  });

  /* ---------- save ---------- */
  $("pcSave").onclick = async () => {
    const bad = S.objs.map(o => o.type === "text" && !o.api ? findPII(o.text) : o.type === "person" && o.nameEdited ? findPII(o.name) : o.type === "tags" ? findPII([o.label, ...o.items.filter(i => !i.api).map(i => i.text)].join(" ")) : null).find(Boolean);
    if (bad) { showErr(`カードに${bad}らしき内容が含まれているため、保存できません。個人情報は削除してください。`); return; }
    showErr(""); const btn = $("pcSave"); btn.disabled = true;
    try {
      const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d"); render(ctx, false);
      let cr = window.__yayCreator;
      if (!cr) { try { const d = await get("/users/11044343"); if (d.user?.nickname) cr = { nickname: d.user.nickname }; } catch { /* fall back to ID */ } }
      const logo = $("tLogo").checked ? await loadImg("https://yay.space/images/logotype.svg") : null;
      ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, W, H, S.theme.radius); ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, H - 56, W, 56); ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.font = `600 22px ${FONTS.sans}`; ctx.textAlign = "left";
      ctx.fillText(`制作: ${cr?.nickname ? Array.from(cr.nickname).slice(0, 18).join("") : "Yay! ID 11044343"}`, 30, H - 28);
      if (logo) { const w0 = logo.naturalWidth || 130, h0 = logo.naturalHeight || 34, k = Math.min(130 / w0, 34 / h0), lw = Math.round(w0 * k), lh = Math.round(h0 * k), tc = document.createElement("canvas"); tc.width = lw; tc.height = lh; const g = tc.getContext("2d"); g.drawImage(logo, 0, 0, lw, lh); g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, lw, lh); ctx.drawImage(tc, W - 30 - lw, H - 28 - lh / 2); }
      ctx.restore();
      const blob = await new Promise(r => c.toBlob(r, "image/png")); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `yay-profile-card-${S.user.id}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } catch (e) { showErr(`画像を生成できませんでした: ${e.message}`); } finally { btn.disabled = false; }
  };

  /* ---------- start ---------- */
  async function findUser() {
    showErr(""); $("pcUser").classList.add("hidden");
    if (!$("pcOwn").checked) return showErr("カードは自分のアカウントでのみ作れます。「自分のアカウントです」にチェックを入れてください。");
    const btn = $("pcFind"); btn.disabled = true;
    try {
      const u = await resolveUser($("pcInput").value); S.user = u;
      $("pcUser").innerHTML = `<img class="pc-ava" src="${esc(u.profile_icon_thumbnail || u.profile_icon || "")}" alt="" referrerpolicy="no-referrer"><div><b>${esc(u.nickname)}</b><small>@${esc(u.id)}</small><p class="subtle">このアカウントでカードを作ります。</p></div><button id="pcStart" class="primary-btn" type="button"><span>カードを作る</span></button>`;
      $("pcUser").classList.remove("hidden"); $("pcStart").onclick = startEditor;
    } catch (e) { showErr(e.message); } finally { btn.disabled = false; }
  }
  async function startEditor() {
    const u = S.user; $("pcStart").disabled = true;
    const [hd, av] = await Promise.all([loadImg(u.cover_image || u.cover_image_thumbnail), loadImg(u.profile_icon || u.profile_icon_thumbnail)]);
    S.objs = []; uid = 1; S.hist = []; S.redo = []; layerSig = ""; tgSig = ""; S.fol = { uid: null, users: [], next: null, done: false, loading: false };
    Object.assign(S.theme, { bg1: PRESETS[0][0], bg2: PRESETS[0][1], ring1: PRESETS[0][2], ring2: PRESETS[0][3], text: PRESETS[0][4] }); $("tPreset").value = "0"; syncTheme();
    S.objs.push(mk("header", { x: 0, y: 0, w: W, h: 280, img: hd }));
    S.objs.push(mk("avatar", { x: 80, y: 160, w: 280, h: 280, img: av }));
    S.objs.push(mk("text", { x: 80, y: 460, w: 320, size: 40, bold: true, text: u.nickname, api: true }));
    $("pcEditor").classList.remove("hidden"); S.sel = null; syncPanel(); draw(); $("pcEditor").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("pcFind").onclick = findUser;
  // Use the same liker picker both before opening the editor and inside the user-add dialog.
  $("pcLikers").onclick = () => {
    if (!window.YayLikers) return showErr("いいねした人の一覧を読み込めませんでした。ページを再読み込みしてください。");
    window.YayLikers.open(u => {
      $("pcInput").value = String(u.id);
      showErr("");
      $("pcUser").classList.add("hidden");
      $("pcInput").focus();
    });
  };
  $("pcInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) findUser(); });
  syncTheme(); buildTiles();
})();
