/* GIF and video parts for the profile card.
 * Everything runs in the browser: the file is never uploaded. GIFs are decoded here (no library), so they work in every browser;
 * videos use the browser's own player (muted), so which formats work depends on the browser (MP4/H.264 and WebM are the safest).
 * A part keeps a "frame" (0..1 through the clip). The preview plays the clip, and the PNG uses the chosen frame.
 * Exposes window.YayMedia.
 */
(() => {
  "use strict";
  const MAX_GIF = 40 * 1024 * 1024, MAX_VIDEO = 250 * 1024 * 1024, MAX_FRAMES = 300, PIXEL_BUDGET = 24e6, STILL_MAX = 1280;
  const wrap = v => ((v % 1) + 1) % 1;
  const tick = () => new Promise(r => setTimeout(r));

  /* ---------- GIF decoding ---------- */
  function lzw(mcs, data, npix) {
    const clear = 1 << mcs, eoi = clear + 1, prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097), out = new Uint8Array(npix);
    let size = mcs + 1, next = eoi + 1, mask = (1 << size) - 1, bits = 0, cnt = 0, pos = 0, op = 0, prev = -1, first = 0;
    for (let i = 0; i < clear; i++) suffix[i] = i;
    while (op < npix) {
      while (cnt < size) { if (pos >= data.length) return out; bits |= data[pos++] << cnt; cnt += 8; }
      const code = bits & mask; bits >>= size; cnt -= size;
      if (code === clear) { size = mcs + 1; next = eoi + 1; mask = (1 << size) - 1; prev = -1; continue; }
      if (code === eoi) break;
      if (prev === -1) { out[op++] = suffix[code]; prev = code; first = code; continue; }
      let c = code, sp = 0;
      if (code >= next) { stack[sp++] = first; c = prev; }
      while (c >= clear) { stack[sp++] = suffix[c]; c = prefix[c]; }
      first = suffix[c]; stack[sp++] = first;
      while (sp > 0 && op < npix) out[op++] = stack[--sp];
      if (next < 4096) { prefix[next] = prev; suffix[next] = first; next++; if ((next & mask) === 0 && next < 4096) { size++; mask = (1 << size) - 1; } }
      prev = code;
    }
    return out;
  }

  const rowMap = {};
  const rows = h => rowMap[h] || (rowMap[h] = [[0, 8], [4, 8], [2, 4], [1, 2]].flatMap(([st, sp]) => { const a = []; for (let y = st; y < h; y += sp) a.push(y); return a; }));

  async function readGif(buf) {
    const b = new Uint8Array(buf); let pos = 6;
    if (!/^GIF8[79]a$/.test(String.fromCharCode(...b.subarray(0, 6)))) throw new Error("GIFファイルではありません。");
    const u16 = () => { const v = b[pos] | (b[pos + 1] << 8); pos += 2; return v; };
    const skip = () => { while (pos < b.length) { const n = b[pos++]; if (!n) break; pos += n; } };
    const W = u16(), H = u16(), pk = b[pos++]; pos += 2;
    if (!W || !H || W > 4096 || H > 4096) throw new Error("GIFの大きさが大きすぎます。");
    let gct = null; if (pk & 0x80) { const n = 2 << (pk & 7); gct = b.subarray(pos, pos + n * 3); pos += n * 3; }
    const recs = []; let gc = { delay: 10, trans: -1, disp: 0 };
    while (pos < b.length) {                                          // pass 1: read the structure
      const t = b[pos++];
      if (t === 0x21) {
        const ext = b[pos++];
        if (ext === 0xF9) { pos++; const pf = b[pos++], d = u16(), ti = b[pos++]; pos++; gc = { delay: d <= 1 ? 10 : d, trans: (pf & 1) ? ti : -1, disp: (pf >> 2) & 7 }; } else skip();
      } else if (t === 0x2C) {
        const l = u16(), tp = u16(), w = u16(), h = u16(), ip = b[pos++]; let ct = gct;
        if (ip & 0x80) { const n = 2 << (ip & 7); ct = b.subarray(pos, pos + n * 3); pos += n * 3; }
        const mcs = b[pos++], chunks = []; let total = 0;
        while (pos < b.length) { const n = b[pos++]; if (!n) break; chunks.push(b.subarray(pos, pos + n)); pos += n; total += n; }
        const data = new Uint8Array(total); let o = 0; for (const c of chunks) { data.set(c, o); o += c.length; }
        recs.push({ l, tp, w, h, il: !!(ip & 0x40), ct, mcs, data, gc }); gc = { delay: 10, trans: -1, disp: 0 };
      } else if (t === 0x3B) break; else break;
    }
    if (!recs.length) throw new Error("GIFの中に画像が見つかりませんでした。");
    const n = recs.length, step = Math.max(1, Math.ceil(n / MAX_FRAMES)), kept = Math.ceil(n / step);
    const k = Math.min(1, Math.sqrt(PIXEL_BUDGET / (W * H * kept))), ow = Math.max(1, Math.round(W * k)), oh = Math.max(1, Math.round(H * k));
    const cur = new Uint8ClampedArray(W * H * 4), tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H; const tg = tmp.getContext("2d");
    const frames = []; let saved = null, last = null, t = 0;
    for (let i = 0; i < n; i++) {                                     // pass 2: decode + compose
      const r = recs[i];
      if (last) {                                                      // dispose of the previous frame
        if (last.gc.disp === 2) for (let y = last.tp; y < Math.min(H, last.tp + last.h); y++) cur.fill(0, (y * W + last.l) * 4, (y * W + Math.min(W, last.l + last.w)) * 4);
        else if (last.gc.disp === 3 && saved) cur.set(saved);
      }
      saved = r.gc.disp === 3 ? cur.slice() : null;
      const idx = lzw(r.mcs, r.data, r.w * r.h), ct = r.ct || gct;
      if (ct) for (let y = 0; y < r.h; y++) {
        const sy = r.il ? rows(r.h)[y] : y;
        const dy = r.tp + sy; if (dy >= H) continue;
        for (let x = 0; x < r.w; x++) {
          const dx = r.l + x; if (dx >= W) continue; const ci = idx[y * r.w + x]; if (ci === r.gc.trans) continue;
          const o = (dy * W + dx) * 4, c = ci * 3; cur[o] = ct[c]; cur[o + 1] = ct[c + 1]; cur[o + 2] = ct[c + 2]; cur[o + 3] = 255;
        }
      }
      if (i % step === 0) {
        tg.putImageData(new ImageData(cur, W, H), 0, 0);
        let c = tmp; if (k < 1) { c = document.createElement("canvas"); c.width = ow; c.height = oh; c.getContext("2d").drawImage(tmp, 0, 0, ow, oh); }
        else { c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(tmp, 0, 0); }
        frames.push({ c, t, d: 0 });
      }
      const d = r.gc.delay / 100; frames[frames.length - 1].d += d; t += d; last = r;
      if (i % 8 === 7) await tick();                                   // keep the page responsive while decoding
    }
    return { kind: "gif", frames, w: ow, h: oh, dur: Math.max(.05, t) };
  }

  /* ---------- video ---------- */
  const videos = new Set();
  function makeVideo(url) {
    const v = document.createElement("video");
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); v.preload = "auto";
    v.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none"; document.body.append(v); v.src = url; videos.add(v); return v;
  }
  async function readVideo(file) {
    const url = URL.createObjectURL(file), v = makeVideo(url);
    await new Promise((ok, ng) => { v.onloadeddata = ok; v.onerror = () => ng(new Error("この動画は読み込めませんでした。お使いのブラウザが対応していない形式かもしれません（MP4(H.264)かWebMがおすすめです）。")); v.load(); });
    if (!v.videoWidth) throw new Error("動画の映像を読み込めませんでした。");
    if (!isFinite(v.duration)) { v.currentTime = 1e7; await new Promise(r => v.addEventListener("timeupdate", r, { once: true })); v.currentTime = 0; }   // some recorded WebM files report no length
    return { kind: "video", video: v, url, w: v.videoWidth, h: v.videoHeight, dur: Math.max(.05, v.duration || 1) };
  }

  async function load(file) {
    if (/gif$/i.test(file.type) || /\.gif$/i.test(file.name)) {
      if (file.size > MAX_GIF) throw new Error("GIFが大きすぎます（40MBまで）。");
      return readGif(await file.arrayBuffer());
    }
    if (/^video\//.test(file.type) || /\.(mp4|m4v|mov|webm|ogv)$/i.test(file.name)) {
      if (file.size > MAX_VIDEO) throw new Error("動画が大きすぎます（250MBまで）。");
      return readVideo(file);
    }
    throw new Error("GIFまたは動画のファイルを選んでください。");
  }

  /* ---------- using a media part (a part with .media, .frame in 0..1, .still) ---------- */
  const gifIndex = (m, f) => { const t = wrap(f) * m.dur; let lo = 0, hi = m.frames.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (m.frames[mid].t <= t) lo = mid; else hi = mid - 1; } return lo; };
  // How far through the clip the preview is right now.
  const live = (o, elapsed) => o.media.kind === "video" ? wrap(o.media.video.currentTime / o.media.dur) : wrap((o.frame || 0) + elapsed / o.media.dur);
  // What to draw: the chosen frame for saved images, the moving picture for the preview.
  function pick(o, exporting, playing, elapsed) {
    const m = o.media;
    if (exporting) return o.still || (m.kind === "gif" ? m.frames[gifIndex(m, o.frame || 0)].c : null);
    if (m.kind === "gif") return m.frames[gifIndex(m, playing ? live(o, elapsed) : (o.frame || 0))].c;
    return m.video.readyState >= 2 ? m.video : o.still || null;
  }
  function seek(m, t) {
    const v = m.video, to = Math.min(Math.max(0, t), Math.max(0, m.dur - .02));
    if (Math.abs(v.currentTime - to) < .002) return Promise.resolve();
    return m.pending = new Promise(r => { const done = () => { v.removeEventListener("seeked", done); r(); }; v.addEventListener("seeked", done); v.currentTime = to; });
  }
  function snapshot(o) {                                              // copy the frame now showing into o.still
    const m = o.media;
    if (m.kind === "gif") { o.still = m.frames[gifIndex(m, o.frame || 0)].c; return; }
    const v = m.video; if (v.readyState < 2) return; const k = Math.min(1, STILL_MAX / Math.max(m.w, m.h));
    const c = o.still && o.still.dataset && o.still.dataset.own ? o.still : Object.assign(document.createElement("canvas"), {});
    c.dataset.own = "1"; c.width = Math.round(m.w * k); c.height = Math.round(m.h * k); c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); o.still = c;
  }
  // Put the part on a chosen frame.
  async function setFrame(o, f) {
    o.frame = wrap(f); const m = o.media;
    if (m.kind === "gif") { snapshot(o); o.img = o.still; return; }
    await seek(m, o.frame * m.dur); snapshot(o); if (o.still) o.img = o.still;
  }
  // Before saving: make sure every media part has its chosen frame ready (video seeks are asynchronous).
  async function prepare(objs, playing) {
    for (const o of objs) {
      if (!o.media) continue;
      if (o.media.kind === "video" && !playing && o.media.pending) await o.media.pending;
      snapshot(o);
    }
  }
  const sync = o => { if (o.media.kind === "gif") { snapshot(o); } else if (o.media.video.paused) seek(o.media, (o.frame || 0) * o.media.dur); };
  const clone = m => m.kind === "gif" ? m : { ...m, video: makeVideo(m.url), pending: null };
  function enforce(objs, playing) {                                   // keep every video playing/paused to match the animation switch
    const used = new Set();
    for (const o of objs) {
      if (!o.media || o.media.kind !== "video") continue; const v = o.media.video; used.add(v);
      if (playing && v.paused) v.play().catch(() => {}); else if (!playing && !v.paused) v.pause();
    }
    for (const v of videos) if (!used.has(v) && !v.paused) v.pause();   // deleted parts stop decoding
  }
  const seekAll = objs => objs.forEach(o => { if (o.media && o.media.kind === "video") seek(o.media, (o.frame || 0) * o.media.dur); });
  window.YayMedia = { load, live, pick, seek, snapshot, setFrame, prepare, sync, clone, enforce, seekAll, gifIndex };
})();
