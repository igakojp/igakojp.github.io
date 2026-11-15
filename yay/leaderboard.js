(() => {
  "use strict";
  // Public CORS relay: anonymous GET access only; no account, cookie or API key is sent.
  const ROOT = "https://proxy.cors.dev/https://api.yay.space";
  const API = `${ROOT}/v2`;
  const POST_ID = "615227650";                 // like this post to join
  const MAX_PAGES = 30, REFRESH_MS = 60000, HYDRATE_CONCURRENCY = 2, EXPORT_COUNT = 10, MAX_HYDRATE_TRIES = 3;
  const PRIVATE_ERROR = -363;
  const RATE_LIMIT_MESSAGE = "Yay! APIのアクセス制限を検出したため、処理を完全に停止しました。これ以上取得できません。時間をおいてから「今すぐ更新」を押してください。";

  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
  const initials = name => String(name || "?").trim().slice(0, 1).toUpperCase() || "?";

  // Columns are shared by the table and the exported image.
  const COLS = [
    { key: "level", label: "ミックスレベル", lines: ["ミックス", "レベル"] },
    { key: "followers", label: "フォロワー", lines: ["フォロワー"] },
    { key: "following", label: "フォロー", lines: ["フォロー"] },
    { key: "diff", label: "フォロワー − フォロー", lines: ["フォロワー", "−フォロー"] },
    { key: "posts", label: "投稿数", lines: ["投稿数"] },
    { key: "avg", label: "1日平均投稿", lines: ["1日平均", "投稿数"] },
    { key: "streak", label: "ログイン連続", lines: ["ログイン", "連続日数"] },
    { key: "age", label: "アカウント年齢", lines: ["アカウント", "年齢"] }
  ];
  const colLabel = key => COLS.find(c => c.key === key)?.label || key;

  // Everything lives in memory only. Nothing is written to storage.
  const state = {
    users: new Map(),          // id -> user, only users who currently like the post
    sortKey: "level", sortDir: "desc", filter: "",
    startId: null, sorted: [],
    stopped: false, refreshing: false, lastUpdated: null, loaded: false,
    hydrateQueue: [], hydrateActive: 0, timer: null, renderQueued: false, listSig: ""
  };

  /* ---------- API ---------- */
  function stopForRateLimit() {
    state.stopped = true;
    clearInterval(state.timer); state.timer = null;
    showError(RATE_LIMIT_MESSAGE);
    const error = new Error(RATE_LIMIT_MESSAGE); error.code = 429; error.fatal = true; return error;
  }
  async function apiGet(url) {
    let attempt = 0;
    while (true) {
      try {
        const res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } });
        if (res.status === 429) throw stopForRateLimit();
        if (res.status >= 500 && attempt++ < 2) { await sleep(1000 * 2 ** attempt); continue; }
        const body = await res.text();
        let data = null; try { data = JSON.parse(body); } catch { /* handled below */ }
        const apiMessage = String(data?.message || "");
        if (Number(data?.error_code) === 429 || (data && data.result && data.result !== "success" && /429|rate.?limit|too many requests|アクセス制限/i.test(apiMessage))) throw stopForRateLimit();
        if (!res.ok) { const e = new Error(`Yay! API エラー (HTTP ${res.status})${apiMessage ? `: ${apiMessage}` : ""}`); e.code = res.status; e.fatal = true; throw e; }
        if (!data) { const e = new Error("APIまたはCORS中継サービスからJSON以外の応答を受信しました。"); e.fatal = true; throw e; }
        if (data.result && data.result !== "success") { const e = new Error(apiMessage || "Yay! APIから正常な応答がありませんでした。"); e.fatal = true; throw e; }
        return data;
      } catch (e) {
        if (e.fatal || e.code === 429) throw e;
        if (attempt++ < 2) { await sleep(750 * 2 ** attempt); continue; }
        throw new Error("Yay! APIまたはCORS中継サービスに接続できませんでした。");
      }
    }
  }
  function avatarOf(raw) {
    const value = raw?.profile_icon_thumbnail || raw?.profile_icon || "";
    if (typeof value !== "string") return "";
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("/")) return `https://yay.space${value}`;
    return value;
  }

  /* ---------- likers ---------- */
  // Only the IDs are kept at this stage. Names/avatars are shown only after the user's timeline proves to be viewable.
  async function fetchLikerIds() {
    const ids = new Set(); let from = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await apiGet(`${ROOT}/v1/posts/${POST_ID}/likers${from ? `?from_id=${from}` : ""}`);
      const list = Array.isArray(data.users) ? data.users : [];
      let added = 0;
      for (const u of list) if (u && u.id != null && !ids.has(String(u.id))) { ids.add(String(u.id)); added++; }
      if (!list.length || !added || data.last_id == null || String(data.last_id) === String(from)) break;
      from = data.last_id;
    }
    return ids;
  }
  function reconcile(ids) {
    for (const id of [...state.users.keys()]) if (!ids.has(id)) state.users.delete(id); // like removed -> removed
    if (state.startId && !state.users.has(state.startId)) state.startId = null;
    for (const id of ids) if (!state.users.has(id)) state.users.set(id, { id, status: "idle", tries: 0, nickname: "", avatar: "", followers: null, following: null, posts: null, streak: null, createdAt: null });
  }

  /* ---------- per-user lookup: timeline first, profile only when something is missing ---------- */
  function findStreak(obj) {
    const entries = Object.entries(obj || {}).filter(([, v]) => typeof v === "number");
    const bad = /logged_?in|last|at$/i;
    const hit = entries.find(([k]) => /login/i.test(k) && /(streak|consecutive|continuous|row|days|count)/i.test(k) && !bad.test(k))
      || entries.find(([k]) => /(streak|consecutive|continuous)/i.test(k) && !bad.test(k));
    return hit ? Math.max(0, hit[1]) : null;
  }
  function absorb(u, raw) {
    if (!raw) return;
    if (raw.nickname) u.nickname = raw.nickname;
    const av = avatarOf(raw); if (av) u.avatar = av;
    const f = num(raw.followers_count); if (f != null) u.followers = f;
    const g = num(raw.followings_count ?? raw.following_count); if (g != null) u.following = g;
    const p = num(raw.posts_count); if (p != null) u.posts = p;
    const c = num(raw.created_at); if (c != null) u.createdAt = c;
    const st = findStreak(raw); if (st != null) u.streak = st;
  }
  // Returns the timeline's user object, or "private" when the timeline cannot be viewed (error_code -363).
  async function timelineUser(id) {
    const res = await fetch(`${API}/posts/user_timeline?number=1&user_id=${id}`, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } });
    if (res.status === 429) throw stopForRateLimit();
    let data = null; try { data = JSON.parse(await res.text()); } catch { /* handled below */ }
    if (Number(data?.error_code) === 429 || (data && data.result && data.result !== "success" && /429|rate.?limit|too many requests|アクセス制限/i.test(String(data.message || "")))) throw stopForRateLimit();
    if (Number(data?.error_code) === PRIVATE_ERROR) return "private";
    if (!data || data.result !== "success") { const e = new Error(String(data?.message || `HTTP ${res.status}`)); e.fatal = true; throw e; }
    const post = Array.isArray(data.posts) ? data.posts[0] : null;
    return post?.user && String(post.user.id) === String(id) ? post.user : null;
  }
  const missing = u => !u.nickname || u.followers == null || u.following == null || u.posts == null || u.createdAt == null || u.streak == null;
  async function hydrate(u) {
    try {
      const tl = await timelineUser(u.id);
      if (state.users.get(u.id) !== u) return;
      if (tl === "private") { u.status = "private"; await sleep(250); return; }   // no profile call for private users
      absorb(u, tl);
      if (missing(u)) {
        const data = await apiGet(`${API}/users/${u.id}`);
        if (state.users.get(u.id) !== u) return;
        absorb(u, data?.user);
      }
      if (!u.nickname) throw new Error("no profile");
      u.status = "done";
    } catch (e) {
      if (e.code === 429) return;
      u.tries++; u.status = u.tries >= MAX_HYDRATE_TRIES ? "failed" : "error";
    }
    await sleep(250);
  }
  function enqueueHydration() {
    for (const u of state.users.values()) if (u.status === "idle" || u.status === "error") { u.status = "queued"; state.hydrateQueue.push(u.id); }
    pumpHydration();
  }
  function pumpHydration() {
    while (!state.stopped && state.hydrateActive < HYDRATE_CONCURRENCY && state.hydrateQueue.length) {
      const u = state.users.get(state.hydrateQueue.shift());
      if (!u || u.status !== "queued") continue;
      u.status = "loading"; state.hydrateActive++;
      hydrate(u).finally(() => { state.hydrateActive--; scheduleRender(); pumpHydration(); });
    }
  }

  /* ---------- metrics ---------- */
  function buildRows() {
    const now = Date.now(), rows = [];
    for (const u of state.users.values()) {
      if (u.status !== "done") continue;               // private / failed / pending users are not ranked
      const age = u.createdAt ? Math.max(1, Math.floor((now - u.createdAt * 1000) / 864e5)) : null;
      const followers = Math.max(0, u.followers || 0), following = u.following == null ? null : Math.max(0, u.following);
      const posts = u.posts == null ? null : Math.max(0, u.posts);
      const streak = u.streak == null ? null : Math.max(0, u.streak);
      const avg = (posts == null || age == null) ? null : posts / age;
      const partial = streak == null || following == null || age == null;
      let level = null;
      if (posts != null) {
        const a2 = age || 0, smoothed = posts / Math.max(a2, 14);
        const positive = 100 * (Math.log(1 + followers) * 0.30 + Math.log(1 + smoothed) * 0.30 + Math.log(1 + (streak || 0)) * 0.20 + Math.log(1 + Math.min(a2, 3650)) * 0.10);
        const penalty = 100 * Math.log(1 + Math.max(0, (following || 0) - 100)) * 0.12;
        level = Math.round(Math.max(0, positive - penalty) * 10) / 10;
      }
      rows.push({ id: u.id, nickname: u.nickname, avatar: u.avatar, level, followers, following: following ?? null, diff: following == null ? null : followers - following, posts, avg, streak, age, partial });
    }
    return rows;
  }
  function sortRows(rows) {
    const key = state.sortKey, dir = state.sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null && y == null) return a.nickname.localeCompare(b.nickname, "ja");
      if (x == null) return 1;
      if (y == null) return -1;
      return (x - y) * dir || (b.level ?? -1) - (a.level ?? -1) || a.nickname.localeCompare(b.nickname, "ja");
    });
  }
  function fmtAge(days) {
    const y = Math.floor(days / 365);
    if (y > 0) return `${y}年${Math.floor((days % 365) / 30)}か月`;
    const m = Math.floor(days / 30);
    return m > 0 ? `${m}か月${days % 30}日` : `${days}日`;
  }
  function cellText(r, key) {
    const v = r[key]; if (v == null) return null;
    switch (key) {
      case "level": return v.toFixed(1);
      case "avg": return v.toFixed(2);
      case "diff": return (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v));
      case "age": return fmtAge(v);
      default: return fmt(v);
    }
  }

  /* ---------- rendering ---------- */
  const showError = msg => { $("errorBox").textContent = msg; $("errorBox").classList.remove("hidden"); };
  const clearError = () => $("errorBox").classList.add("hidden");
  function scheduleRender() { if (state.renderQueued) return; state.renderQueued = true; requestAnimationFrame(() => { state.renderQueued = false; render(); }); }

  function renderHead() {
    const arrow = state.sortDir === "asc" ? "↑" : "↓";
    $("lbHead").innerHTML = `<tr><th class="c-rank">順位</th><th class="c-avatar"></th><th class="c-user">名前・ユーザーID</th>${COLS.map(c => {
      const on = c.key === state.sortKey;
      return `<th class="num${on ? " is-sorted" : ""}" aria-sort="${on ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"}"><button type="button" class="th-btn" data-sort="${c.key}">${esc(c.label)}<span class="arrow">${on ? arrow : ""}</span></button></th>`;
    }).join("")}</tr>`;
    $("sortKey").value = state.sortKey;
    $("sortDir").textContent = state.sortDir === "asc" ? "昇順 ↑" : "降順 ↓";
  }
  function cellHtml(r, c, maxLevel) {
    const text = cellText(r, c.key);
    if (text == null) return `<td class="num"><span class="pending">—</span></td>`;
    if (c.key === "level") {
      const star = r.partial ? `<sup title="一部の項目を取得できなかったため0として計算">＊</sup>` : "";
      return `<td class="num c-level"><div class="lvl"><b>${text}${star}</b><i style="--w:${maxLevel > 0 ? Math.max(2, Math.round(r.level / maxLevel * 100)) : 0}%"></i></div></td>`;
    }
    const cls = c.key === "diff" ? (r.diff > 0 ? " pos" : r.diff < 0 ? " neg" : "") : "";
    return `<td class="num${cls}">${text}</td>`;
  }
  function medalClass(rank) { return rank <= 3 ? ` rank-${rank}` : ""; }

  function render() {
    const rows = sortRows(buildRows());
    state.sorted = rows;
    renderHead();
    const maxLevel = Math.max(0, ...rows.map(r => r.level || 0));
    const q = state.filter.trim().toLowerCase();
    const body = [];
    rows.forEach((r, i) => {
      if (q && !(r.nickname.toLowerCase().includes(q) || r.id.includes(q))) return;
      const rank = i + 1;
      body.push(`<tr class="${r.id === state.startId ? "is-me" : ""}"><td class="c-rank"><span class="rank-badge${medalClass(rank)}">${rank}</span></td>` +
        `<td class="c-avatar"><span class="lb-avatar${medalClass(rank)}"><b>${esc(initials(r.nickname))}</b>${r.avatar ? `<img src="${esc(r.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span></td>` +
        `<td class="c-user"><a class="lb-name" href="https://yay.space/user/${esc(r.id)}" target="_blank" rel="noopener">${esc(r.nickname)}</a><small>@${esc(r.id)}</small></td>` +
        COLS.map(c => cellHtml(r, c, maxLevel)).join("") + `</tr>`);
    });
    const pending = [...state.users.values()].filter(u => ["idle", "queued", "loading", "error"].includes(u.status)).length;
    $("lbBody").innerHTML = body.join("") || `<tr><td colspan="11" class="empty-state">${!state.loaded ? "読み込み中…" : rows.length ? "該当するユーザーがいません。" : pending ? "ユーザー情報を読み込み中…" : "この投稿にいいねしたユーザーがまだいません。"}</td></tr>`;
    $("starNote").classList.toggle("hidden", !rows.some(r => r.partial));
    renderUnknown();
    updateStartList(rows);
    renderStatus(rows);
    updateRangeHint();
  }
  function renderUnknown() {
    const list = [...state.users.values()].filter(u => u.status === "private" || u.status === "failed");
    $("unknownPanel").classList.toggle("hidden", !list.length);
    $("unknownCount").textContent = list.length ? `（${fmt(list.length)}人）` : "";
    $("unknownList").innerHTML = list.map(u => `<li><a href="https://yay.space/user/${esc(u.id)}" target="_blank" rel="noopener"><i>?</i>@${esc(u.id)}</a></li>`).join("");
  }
  function renderStatus(rows) {
    const all = state.users.size, unknown = [...state.users.values()].filter(u => u.status === "private" || u.status === "failed").length;
    $("statCount").textContent = state.loaded ? `${fmt(all)} 人` : "—";
    $("statDetail").textContent = state.loaded ? `${fmt(rows.length + unknown)} / ${fmt(all)}` : "—";
    $("statUpdated").textContent = state.lastUpdated ? state.lastUpdated.toLocaleTimeString("ja-JP") : "—";
  }
  function updateStartList(rows) {
    const sel = $("startUser"), sig = rows.map(r => `${r.id}:${r.nickname}`).join("|");
    if (sig !== state.listSig) {
      state.listSig = sig;
      sel.innerHTML = rows.map((r, i) => `<option value="${esc(r.id)}">${i + 1}位　${esc(r.nickname)}</option>`).join("");
    }
    if (!rows.length) return;
    if (!state.startId || !rows.some(r => r.id === state.startId)) state.startId = rows[0].id;
    sel.value = state.startId;
  }
  function pickedRows() {
    const idx = Math.max(0, state.sorted.findIndex(r => r.id === state.startId));
    return { from: idx + 1, picked: state.sorted.slice(idx, idx + EXPORT_COUNT) };
  }
  function updateRangeHint() {
    const el = $("rangeHint");
    if (!state.sorted.length) { el.textContent = "参加者が読み込まれると画像を作成できます。"; return; }
    const { from, picked } = pickedRows();
    el.textContent = `${from}位から下に${picked.length}人（${from}位〜${from + picked.length - 1}位）・${colLabel(state.sortKey)}の${state.sortDir === "asc" ? "昇順" : "降順"}。上が高く、下が低い順で画像になります。`;
  }

  /* ---------- refresh ---------- */
  async function refresh(manual) {
    if (state.refreshing) return;
    if (state.stopped && !manual) return;
    if (manual) { state.stopped = false; startTimer(); }
    state.refreshing = true; $("refreshBtn").disabled = true;
    try {
      reconcile(await fetchLikerIds());
      state.loaded = true; state.lastUpdated = new Date(); clearError();
      enqueueHydration();
    } catch (e) {
      if (e.code !== 429) showError(`取得できませんでした: ${e.message}`);
    } finally {
      state.refreshing = false; $("refreshBtn").disabled = false; render();
    }
  }
  function startTimer() {
    clearInterval(state.timer); state.timer = null;
    if ($("autoRefresh").checked && !state.stopped) state.timer = setInterval(() => { if (!document.hidden) refresh(false); }, REFRESH_MS);
  }

  /* ---------- PNG export (light "cards + bars" design, different from the dark table pages) ---------- */
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = Array.from(text);
    while (s.length > 1 && ctx.measureText(s.join("") + "…").width > maxW) s.pop();
    return s.join("") + "…";
  }
  async function exportImage() {
    const btn = $("imageBtn"), label = btn.firstElementChild;
    const rows = sortRows(buildRows());
    if (!rows.length) { showError("画像に表示するユーザーがまだいません。"); return; }
    state.sorted = rows;
    const { from, picked } = pickedRows();
    btn.disabled = true; label.textContent = "画像を生成中…";
    const objectUrls = [];
    try {
      const W = 1400, HEAD = 270, ROW = 132, GAP = 18, FOOT = 190, H = HEAD + picked.length * (ROW + GAP) + FOOT;
      const FONT = "system-ui, 'Noto Sans JP', 'Yu Gothic UI', Meiryo, sans-serif";
      const key = state.sortKey, metric = r => (key === "diff" ? r.diff : r[key]);
      const vals = picked.map(r => metric(r)).filter(v => v != null);
      const hi = Math.max(1, ...vals.map(Math.abs));
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#fff3e4"); bg.addColorStop(.55, "#ffe0ec"); bg.addColorStop(1, "#dbe6ff");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(W - 120, 90, 260, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,160,190,.18)"; ctx.beginPath(); ctx.arc(80, H - 160, 300, 0, Math.PI * 2); ctx.fill();

      async function loadImage(url) {
        if (!url) return null;
        for (const candidate of [url, `https://proxy.cors.dev/${url}`]) {
          try {
            const response = await fetch(candidate, { mode: "cors", credentials: "omit", cache: "force-cache" });
            if (!response.ok) continue;
            const blob = await response.blob(); if (!blob.type.startsWith("image/")) continue;
            const objectUrl = URL.createObjectURL(blob); objectUrls.push(objectUrl);
            const img = new Image(); img.src = objectUrl;
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
            return img;
          } catch { /* try next */ }
        }
        return null;
      }
      let creator = window.__yayCreator || null;
      if (!creator) {
        try {
          const r = await fetch(`${API}/users/11044343`, { headers: { Accept: "application/json" }, mode: "cors", credentials: "omit" });
          if (r.ok) { const d = await r.json(); if (d?.result === "success" && d.user?.id) creator = { id: String(d.user.id), nickname: d.user.nickname, avatar: avatarOf(d.user) }; }
        } catch { /* credit is optional */ }
      }
      const [logoImg, creatorImg, ...avatarImgs] = await Promise.all([loadImage("https://yay.space/images/logotype.svg"), loadImage(creator?.avatar || ""), ...picked.map(r => loadImage(r.avatar))]);

      function drawAvatar(img, cx, cy, r, name, border, bw) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        if (img) { const k = Math.max(r * 2 / img.width, r * 2 / img.height); ctx.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); }
        else { const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, "#ff9ec0"); g.addColorStop(1, "#8f9bff"); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `800 ${Math.round(r * .9)}px ${FONT}`; ctx.fillText(initials(name), cx, cy + 2); }
        ctx.restore(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.stroke();
      }
      const medal = rank => rank === 1 ? ["#ffb81f", "#ff8a00"] : rank === 2 ? ["#b9c4d3", "#8c99ac"] : rank === 3 ? ["#e0995c", "#b86a2e"] : ["#b9a8ff", "#8a74f0"];

      // Title block
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillStyle = "#2b2140"; ctx.font = `800 76px ${FONT}`; ctx.fillText("いいねランキング", 70, 100);
      ctx.fillStyle = "#6d5f8f"; ctx.font = `600 30px ${FONT}`;
      ctx.fillText(`${from}位 から ${from + picked.length - 1}位 ・ ${colLabel(key)}の${state.sortDir === "asc" ? "昇順" : "降順"}`, 72, 178);
      ctx.fillStyle = "#9a8cb8"; ctx.font = `24px ${FONT}`; ctx.fillText(`参加者 ${fmt(rows.length)}人 ・ ${new Date().toLocaleDateString("ja-JP")}`, 72, 224);

      // Side arrow: top = higher, bottom = lower
      const ax = 44, ay0 = HEAD + 10, ay1 = H - FOOT - 10;
      const ag = ctx.createLinearGradient(0, ay0, 0, ay1); ag.addColorStop(0, "#ff7aa8"); ag.addColorStop(1, "#8a74f0");
      ctx.fillStyle = ag; roundRect(ctx, ax - 4, ay0, 8, ay1 - ay0 - 14, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ax - 16, ay1 - 18); ctx.lineTo(ax + 16, ay1 - 18); ctx.lineTo(ax, ay1 + 6); ctx.closePath(); ctx.fill();

      // Cards
      picked.forEach((r, i) => {
        const rank = from + i, y0 = HEAD + i * (ROW + GAP), cy = y0 + ROW / 2, me = r.id === state.startId, [m1, m2] = medal(rank);
        ctx.save(); ctx.shadowColor = "rgba(90,60,150,.16)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
        ctx.fillStyle = "#fff"; roundRect(ctx, 90, y0, W - 150, ROW, 34); ctx.fill(); ctx.restore();
        if (me) { ctx.strokeStyle = "#ff6f9f"; ctx.lineWidth = 5; roundRect(ctx, 90, y0, W - 150, ROW, 34); ctx.stroke(); }
        // rank badge
        const g = ctx.createLinearGradient(120, cy - 40, 200, cy + 40); g.addColorStop(0, m1); g.addColorStop(1, m2);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(162, cy, 42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `800 ${rank >= 1000 ? 30 : rank >= 100 ? 36 : 46}px ${FONT}`; ctx.fillText(String(rank), 162, cy + 2);
        drawAvatar(avatarImgs[i], 276, cy, 48, r.nickname, "#fff", 6);
        // name
        ctx.textAlign = "left"; ctx.fillStyle = "#2b2140"; ctx.font = `bold 34px ${FONT}`; ctx.fillText(fit(ctx, r.nickname, 420), 346, cy - 20);
        ctx.fillStyle = "#9a8cb8"; ctx.font = `22px ${FONT}`; ctx.fillText(`@${r.id}　フォロワー ${fmt(r.followers)}`, 346, cy + 24);
        // value + bar
        const v = metric(r), text = cellText(r, key) ?? "—";
        ctx.textAlign = "right"; ctx.fillStyle = "#2b2140"; ctx.font = `800 44px ${FONT}`; ctx.fillText(text + (key === "level" && r.partial ? "＊" : ""), W - 90, cy - 22);
        const bx = 830, bh = 18, by = cy + 18;
        ctx.fillStyle = "#efe9fb"; roundRect(ctx, bx, by, W - 90 - bx, bh, 9); ctx.fill();
        if (v != null && v > 0) { const w = Math.max(18, (W - 90 - bx) * Math.min(1, v / hi)); const bg2 = ctx.createLinearGradient(bx, 0, bx + w, 0); bg2.addColorStop(0, m1); bg2.addColorStop(1, m2); ctx.fillStyle = bg2; roundRect(ctx, bx, by, w, bh, 9); ctx.fill(); }
      });

      // Footer: creator pill (left) + Yay! logo pill (right)
      const fy = H - FOOT / 2 + 6;
      if (picked.some(r => r.partial) && key === "level") { ctx.textAlign = "right"; ctx.fillStyle = "#9a8cb8"; ctx.font = `20px ${FONT}`; ctx.fillText("＊ 一部の項目を取得できなかったため0として計算", W - 70, H - FOOT + 12); }
      if (creator?.nickname) {
        ctx.save(); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.shadowColor = "rgba(90,60,150,.14)"; ctx.shadowBlur = 16; roundRect(ctx, 70, fy - 54, 600, 108, 54); ctx.fill(); ctx.restore();
        if (creatorImg) drawAvatar(creatorImg, 132, fy, 38, creator.nickname, "#fff", 4); else { ctx.beginPath(); ctx.arc(132, fy, 38, 0, Math.PI * 2); ctx.fillStyle = "#c9b8ff"; ctx.fill(); }
        ctx.textAlign = "left"; ctx.fillStyle = "#9a8cb8"; ctx.font = `20px ${FONT}`; ctx.fillText("このプロジェクトの制作者", 188, fy - 17);
        ctx.fillStyle = "#2b2140"; ctx.font = `bold 30px ${FONT}`; ctx.fillText(fit(ctx, creator.nickname, 440), 188, fy + 20);
      }
      if (logoImg) {
        const lw0 = logoImg.naturalWidth || logoImg.width, lh0 = logoImg.naturalHeight || logoImg.height, k = Math.min(210 / lw0, 56 / lh0), lw = lw0 * k, lh = lh0 * k;
        ctx.fillStyle = "#2b2140"; roundRect(ctx, W - 70 - lw - 56, fy - 46, lw + 56, 92, 46); ctx.fill();
        ctx.save(); ctx.filter = "brightness(0) invert(1)"; ctx.drawImage(logoImg, W - 70 - lw - 28, fy - lh / 2, lw, lh); ctx.restore();
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG画像を作成できませんでした。");
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `yay-like-ranking-${from}-${from + picked.length - 1}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) { showError(`画像を生成できませんでした: ${e.message}`); }
    finally { objectUrls.forEach(u => URL.revokeObjectURL(u)); btn.disabled = false; label.textContent = "画像をダウンロード"; }
  }

  /* ---------- events ---------- */
  function setSort(key) {
    if (key === state.sortKey) state.sortDir = state.sortDir === "desc" ? "asc" : "desc"; else { state.sortKey = key; state.sortDir = "desc"; }
    render();
  }
  $("sortKey").innerHTML = COLS.map(c => `<option value="${c.key}">${esc(c.label)}</option>`).join("");
  $("sortKey").addEventListener("change", e => { state.sortKey = e.target.value; render(); });
  $("sortDir").addEventListener("click", () => { state.sortDir = state.sortDir === "desc" ? "asc" : "desc"; render(); });
  $("lbHead").addEventListener("click", e => { const b = e.target.closest("[data-sort]"); if (b) setSort(b.dataset.sort); });
  $("userFilter").addEventListener("input", e => { state.filter = e.target.value; render(); });
  $("refreshBtn").addEventListener("click", () => refresh(true));
  $("autoRefresh").addEventListener("change", startTimer);
  $("imageBtn").addEventListener("click", exportImage);
  $("startUser").addEventListener("change", e => { state.startId = e.target.value; render(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.loaded && !state.stopped && state.lastUpdated && Date.now() - state.lastUpdated > REFRESH_MS) refresh(false); });

  renderHead(); render(); startTimer(); refresh(false);
})();
