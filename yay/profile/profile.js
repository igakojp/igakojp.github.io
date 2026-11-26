/* Yay! ユーザー情報: a public profile viewer laid out like yay.space, using the same URL names.
 *   profile/                          → search
 *   profile/user/{id}                 → all posts
 *   profile/user/{id}/album           → album             (yay.space/user/{id}/album)
 *   profile/user/{id}/reviews         → letters           (yay.space/user/{id}/reviews)
 *   profile/user/{id}/groups | about | data
 *   profile/user/{id}/followers       → posts with the followers popup open
 *   profile/post/{id}                 → one post and who liked it   (yay.space/post/{id})
 *   profile/conversation/{id}         → a whole reply thread        (yay.space/conversation/{id})
 * On http(s) the routes are real paths (GitHub Pages serves ../404.html for them, which redirects here
 * with ?route=…). On file:// the same routes live in the hash: index.html#/user/{id}/album.
 * Lists load their next page only when you reach the bottom of the list.
 * Every API request goes through the shared proxy layer (YayAPI → proxy.cors.dev).
 * The list of accounts a user follows needs a login on Yay!, so only the number is shown. */
(() => {
  "use strict";
  const API = "https://proxy.cors.dev/https://api.yay.space";
  const BASE = window.__profileBase || location.href.split(/[?#]/)[0].replace(/[^/]*$/, "");
  const PATH_MODE = /^https?:$/.test(location.protocol);
  const $ = id => document.getElementById(id);
  const app = $("upApp");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = v => (v == null || v === "" || isNaN(Number(v))) ? "—" : Number(v).toLocaleString("ja-JP");
  const pad = n => String(n).padStart(2, "0");
  function fmtDate(sec, withTime = true) {
    const t = Number(sec); if (!t) return "—";
    const d = new Date(t * 1000), w = "日月火水木金土"[d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${w})` + (withTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
  }
  function ago(sec) {
    const t = Number(sec); if (!t) return "—"; const d = Math.max(0, Date.now() / 1000 - t);
    if (d < 60) return "たった今"; if (d < 3600) return `${Math.floor(d / 60)}分前`; if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
    if (d < 86400 * 30) return `${Math.floor(d / 86400)}日前`; if (d < 86400 * 365) return `${Math.floor(d / 86400 / 30)}か月前`;
    return `${Math.floor(d / 86400 / 365)}年前`;
  }
  function span(sec) {
    const t = Number(sec); if (!t) return null;
    const from = new Date(t * 1000), to = new Date();
    let y = to.getFullYear() - from.getFullYear(), m = to.getMonth() - from.getMonth(), d = to.getDate() - from.getDate();
    if (d < 0) { m--; d += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    return { text: `${y ? `${y}年` : ""}${m ? `${m}か月` : ""}${d}日`, days: Math.max(0, Math.floor((to - from) / 864e5)) };
  }
  const img = u => (typeof u === "string" && u) ? (u.startsWith("//") ? `https:${u}` : u.startsWith("/") ? `https://yay.space${u}` : u) : "";
  const avatarOf = u => img(u?.profile_icon_thumbnail || u?.profile_icon);
  const initial = u => esc(Array.from(String(u?.nickname || "?"))[0] || "?");
  // URLs become links (yay.space user/post/circle/conversation links open inside this viewer) and #tags open the tag page
  const linkify = text => String(text ?? "").split(/(https?:\/\/[^\s<>"']+|[#＃][^\s#＃<>"'、。，,！!？?「」（）()]+)/).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    if (/^[#＃]/.test(part)) return rlink(`timeline/hashtag/${encodeURIComponent(part.slice(1))}`, esc(part), "ys-hashtag");
    const m = part.match(/^https?:\/\/yay\.space\/(user|post|group|conversation)\/(\d+)/);
    if (m) return rlink(`${m[1]}/${m[2]}`, esc(part));
    return `<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`;
  }).join("");
  const ICON = {
    reply: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    gift: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-2.2A3 3 0 0 0 12 3.8 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3h8V7h2v4h8V8a1 1 0 0 0-1-1zM9 7a1 1 0 1 1 1-1v1H9zm6 0h-1V6a1 1 0 1 1 1 1zM4 13v7a1 1 0 0 0 1 1h6v-8H4zm9 8h6a1 1 0 0 0 1-1v-7h-7v8z"/></svg>`,
    repost: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
    home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>`,
    search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>`
  };

  /* One icon set for the whole viewer: simple filled shapes that follow the text colour.
     Used instead of emoji and symbol characters, which render differently on every device. */
  const IC = {
    external: "M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H7v10h10v-4h2v6H5z",
    copy: "M8 3h11v14h-2V5H8zM4 7h11v14H4zm2 2v10h7V9z",
    pin: "M15 3v2l-1 1v4.6l3 3V16h-4.2v5L12 22l-.8-1v-5H7v-2.4l3-3V6L9 5V3z",
    alert: "M12 2 1 21h22zm-1 7h2v6h-2zm0 8h2v2h-2z",
    heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z",
    "chevron-right": "M9.4 6 15.4 12l-6 6L8 16.6 12.6 12 8 7.4z",
    "chevron-left": "M14.6 6 16 7.4 11.4 12l4.6 4.6-1.4 1.4-6-6z",
    "chevron-up": "M12 8l6 6-1.4 1.4-4.6-4.6-4.6 4.6L6 14z",
    close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z",
    minus: "M5 11h14v2H5z",
    "user-plus": "M15 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4zM6 10V7H4v3H1v2h3v3h2v-3h3v-2z",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z",
    users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 13c-2.7 0-6 1.3-6 3.5V19h12v-2.5C14 14.3 10.7 13 8 13zm8 0c-.4 0-.8 0-1.3.1 1.4.9 2.3 2 2.3 3.4V19h5v-2.5c0-2.2-3.3-3.5-6-3.5z",
    list: "M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z",
    image: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM6 18l3.5-4.5 2.5 3 3.5-4.5L20 18zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    mail: "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z",
    info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z",
    data: "M3 3h18v18H3zm2 2v4h14V5zm0 6v4h6v-4zm8 0v4h6v-4zm-8 6v2h6v-2zm8 0v2h6v-2z",
    link: "M8 17a5 5 0 0 1 0-10h3v2H8a3 3 0 0 0 0 6h3v2zm5 0v-2h3a3 3 0 0 0 0-6h-3V7h3a5 5 0 0 1 0 10zm-5-6h8v2H8z",
    search: "M10.5 3a7.5 7.5 0 0 1 6 12l5 5-1.5 1.5-5-5A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z",
    repost: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
    settings: "M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.4-2.9a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
    book: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4v2h10V6zm0 4v2h10v-2zm0 4v2h7v-2z",
    crown: "M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z",
    hash: "M10 3 9.4 8H5v2h4.2l-.5 4H5v2h3.5L8 21h2l.6-5h3.9L14 21h2l.6-5H20v-2h-3.2l.5-4H21V8h-3.5L18 3h-2l-.6 5h-3.9L12 3zm1.2 7h3.9l-.5 4h-3.9z",
    phone: "M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z",
    trophy: "M17 4V2H7v2H3v3a4 4 0 0 0 4 4h.4A5 5 0 0 0 11 13.9V17H8v3h8v-3h-3v-3.1A5 5 0 0 0 16.6 11h.4a4 4 0 0 0 4-4V4zM5 7V6h2v3a2 2 0 0 1-2-2zm14 0a2 2 0 0 1-2 2V6h2z",
    star: "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z",
    clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.5 2.1-.8 1.3L11 13V6h2z",
    chat: "M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 5v2h10V9zm0 4v2h7v-2z"
  };
  const ic = (name, cls = "") => `<svg class="ic${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[name]}"/></svg>`;

  /* ---------------- routing ---------------- */
  /* Routes live in the query string: profile/?user/123/album. That address is always the real file
   * profile/index.html, so reloading or going back never hits GitHub Pages' own "404 File not found".
   * Older addresses still work: profile/user/123 (via ../404.html → ?route=…), and #/user/123. */
  const routeHref = route => PATH_MODE ? (route ? `${BASE}?${route}` : BASE) : `#/${route}`;
  const rlink = (route, inner, cls = "", extra = "") => `<a href="${esc(routeHref(route))}" data-route="${esc(route)}"${cls ? ` class="${cls}"` : ""}${extra}>${inner}</a>`;
  const safeDecode = v => { try { return decodeURIComponent(v); } catch { return v; } };
  function currentRoute() {
    const params = new URLSearchParams(location.search), raw = location.search.slice(1);
    let r = null;
    if (params.has("route")) r = String(params.get("route") || "");
    else if (raw && !/^[^/]*=/.test(raw)) r = safeDecode(raw.replace(/\+/g, " "));   // ?user/123 (no "key=" form)
    else if (location.hash.startsWith("#/")) r = safeDecode(location.hash.slice(2));
    else if (PATH_MODE) {
      const here = location.href.split(/[?#]/)[0];
      if (here.startsWith(BASE)) r = safeDecode(here.slice(BASE.length)).replace(/^index\.html$/, "");
    }
    r = String(r || "").replace(/^\/+/, "");
    // show the clean ?route address from now on
    if (PATH_MODE && (params.has("route") || location.hash.startsWith("#/") || location.href.split(/[?#]/)[0] !== BASE)) {
      const want = routeHref(r);
      if (location.href !== want) history.replaceState({ route: r }, "", want);
    }
    return r;
  }
  function go(route, replace = false) {
    if (PATH_MODE) { history[replace ? "replaceState" : "pushState"]({ route }, "", routeHref(route)); render(); }
    else if (replace) { history.replaceState({ route }, "", `#/${route}`); render(); }
    else location.hash = `#/${route}`;
  }
  // the page is rebuilt on every route change, so the browser's own scroll restore would jump to a stale spot
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("popstate", render);
  window.addEventListener("hashchange", () => { if (!PATH_MODE || location.hash.startsWith("#/")) render(); });
  const headerH = () => (getComputedStyle(document.querySelector(".topbar")).position === "sticky" ? document.querySelector(".topbar").offsetHeight : 0);
  let navDepth = 0; // how many in-app pages deep we are, so "もどる" can use history.back()
  document.addEventListener("click", e => {
    const a = e.target.closest("a[data-route]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const route = a.dataset.route, parts = route.split("/");
    const sameUser = parts[0] === "user" && S.id && parts[1] === S.id && view.kind === "user";
    const opensPopup = sameUser && parts[2] === "followers";
    const tabs = app.querySelector(".ys-tabs");
    // switching tabs keeps the profile in view; anything else starts at the top
    const keepAt = opensPopup ? window.scrollY : sameUser && tabs ? Math.min(window.scrollY, tabs.getBoundingClientRect().top + window.scrollY - headerH()) : 0;
    navDepth++;
    go(route);
    window.scrollTo({ top: keepAt });
  });
  // posts are clickable as a whole (like yay.space), except their links, buttons and media
  app.addEventListener("click", e => {
    const card = e.target.closest("[data-open-post]");
    if (!card || e.target.closest("a,button,summary,details,video") || window.getSelection()?.toString()) return;
    navDepth++; go(`post/${card.dataset.openPost}`); window.scrollTo({ top: 0 });
  });

  /* ---------------- network ---------------- */
  async function getJson(path) {
    const res = await window.YayAPI.fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
    let d = null; try { d = await res.json(); } catch { /* handled below */ }
    if (res.status === 404 || d?.error_code === -2) { const e = new Error("見つかりませんでした。"); e.notFound = true; throw e; }
    if (!res.ok || !d || (d.result && d.result !== "success")) {
      const e = new Error(d?.message || `通信エラー (HTTP ${res.status})`); e.code = d?.error_code; throw e;
    }
    return d;
  }
  async function resolveInput(raw) {
    const t = String(raw || "").trim();
    if (!t) throw new Error("ユーザーID、プロフィールURL、または投稿URLを入力してください。");
    const uid = (t.match(/user\/(\d+)/) || t.match(/^@?(\d+)$/) || [])[1];
    if (uid) return `user/${uid}`;
    const pid = (t.match(/post\/(\d+)/) || [])[1];
    if (pid) return `post/${pid}`;
    const cid = (t.match(/conversation\/(\d+)/) || [])[1];
    if (cid) return `conversation/${cid}`;
    const gid = (t.match(/group\/(\d+)/) || [])[1];
    if (gid) return `group/${gid}`;
    const tag = (t.match(/^[#＃](.+)$/) || t.match(/hashtag\/([^/?#]+)/) || [])[1];
    if (tag) return `timeline/hashtag/${encodeURIComponent(decodeURIComponent(tag))}`;
    return `search/posts/${encodeURIComponent(t)}`;
  }
  const isPrivateErr = e => e && (e.code === -363 || e.code === -5);

  /* ---------------- state ---------------- */
  let S = blank(null);          // the user being viewed
  const posts = new Map();      // post pages:   id → { post, err, likers }
  const convs = new Map();      // conversations: id → list
  let view = { kind: "landing" };
  function blank(id) {
    return { id, core: null, coreErr: null, coreTask: null,
      lists: { posts: list(), album: list(), followers: list(), reviews: list(), groups: list() },
      view: { posts: { sort: "new", type: "all", q: "" }, album: { sort: "new" }, followers: { sort: "order", q: "", online: false, fresh: false, age: false, hidePrivate: false }, reviews: { sort: "new", q: "" }, groups: { sort: "order" }, data: { sort: "cat", q: "" } } };
  }
  function list() { return { items: [], cursor: null, done: false, loading: false, error: null, started: false, extra: null }; }

  async function loadCore(st) {
    const id = st.id;
    const [fresh, tl, call] = await Promise.allSettled([
      getJson(`/v2/users/fresh/${id}`),
      getJson(`/v2/posts/user_timeline?number=50&user_id=${id}`),
      getJson(`/v1/posts/active_call?user_id=${id}`)
    ]);
    if (fresh.status === "rejected") throw fresh.reason.notFound ? new Error("ユーザーが見つかりませんでした。退会したか、IDが間違っている可能性があります。") : fresh.reason;
    const user = fresh.value.user;
    if (!user?.id) throw new Error("ユーザーが見つかりませんでした。");
    let tlUser = null, timelineError = null;
    const L = st.lists.posts;
    if (tl.status === "fulfilled") {
      const ps = tl.value.posts || [];
      tlUser = ps.map(p => p.user).find(u => String(u?.id) === String(id)) || null;
      // the first page of posts is already here, so the posts tab starts with it
      if (!L.started) { L.started = true; addPosts(L, ps); L.extra = { pinned: tl.value.pinned_posts || (tl.value.pinned_post ? [tl.value.pinned_post] : []) }; }
    } else {
      timelineError = tl.reason;
      if (!L.started) { L.started = true; L.done = true; L.error = isPrivateErr(tl.reason) ? "このアカウントは投稿が非公開（鍵アカウント）のため、投稿を表示できません。" : tl.reason.message; }
    }
    return { user, tlUser, timelineError, call: call.status === "fulfilled" ? call.value.post : null,
      merged: { ...(tlUser || {}), ...user, ...(tlUser ? pick(tlUser, ["followings_count", "created_at", "gender", "prefecture", "login_streak_count", "generation", "mobile_verified", "username", "is_online"]) : {}) } };
  }
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
  function addPosts(L, ps) {
    const seen = new Set(L.items.map(p => p.id));
    const fresh = ps.filter(p => p && !seen.has(p.id));
    L.items.push(...fresh);
    const last = ps[ps.length - 1];
    if (!ps.length || !fresh.length || !last || String(last.id) === String(L.cursor)) L.done = true;
    else L.cursor = last.id;
  }
  function ensureCore() {
    if (!S.coreTask) {
      const id = S.id;
      S.coreTask = loadCore(S).then(c => { if (S.id === id) S.core = c; }, e => { if (S.id === id) S.coreErr = e; }).finally(() => { if (S.id === id) render(); });
    }
  }

  /* list pagers: each fetches one page and advances the cursor */
  const PAGERS = {
    async posts(L, ctx) {
      const d = await getJson(`/v2/posts/user_timeline?number=50&user_id=${ctx}${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      if (!L.extra) L.extra = { pinned: d.pinned_posts || [] };
      addPosts(L, d.posts || []);
    },
    async album(L, ctx) {
      const d = await getJson(`/v2/posts/user_timeline?number=50&post_type=media&user_id=${ctx}${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      addPosts(L, d.posts || []);
    },
    async followers(L, ctx) {
      const d = await getJson(`/v3/users/${ctx}/followers?number=50${L.cursor ? `&from=${encodeURIComponent(L.cursor)}` : ""}`);
      const seen = new Set(L.items.map(u => u.id)), users = (d.users || []).filter(u => !seen.has(u.id));
      L.items.push(...users);
      const next = d.next_page_value;
      if (!next || !users.length || String(next) === String(L.cursor)) L.done = true; else L.cursor = next;
    },
    async reviews(L, ctx) {
      const d = await getJson(`/v1/users/reviews/${ctx}?number=50${L.cursor ? `&from_id=${L.cursor}` : ""}`);
      if (!L.extra) L.extra = { pinned: [...(d.pinned_reviews || []), ...(d.pinned_review ? [d.pinned_review] : [])] };
      const seen = new Set(L.items.map(r => r.id)), rs = (d.reviews || []).filter(r => !seen.has(r.id));
      L.items.push(...rs);
      const min = Math.min(...(d.reviews || []).map(r => Number(r.id)).filter(Boolean));
      if (!rs.length || !isFinite(min) || String(min) === String(L.cursor)) L.done = true; else L.cursor = min;
    },
    async groups(L, ctx) {
      const page = L.cursor || 0;
      const d = await getJson(`/v1/groups/user_group_list?number=50&page=${page}&user_id=${ctx}`);
      const seen = new Set(L.items.map(g => g.id)), gs = (d.groups || []).filter(g => !seen.has(g.id));
      L.items.push(...gs);
      if (!gs.length || (d.groups || []).length < 50) L.done = true; else L.cursor = page + 1;
    },
    async likers(L, ctx) {
      const d = await getJson(`/v1/posts/${ctx}/likers${L.cursor ? `?from_id=${encodeURIComponent(L.cursor)}` : ""}`);
      const seen = new Set(L.items.map(u => u.id)), users = (d.users || []).filter(u => u && !seen.has(u.id));
      L.items.push(...users);
      const next = d.last_id != null ? String(d.last_id) : null;
      if (!users.length || !next || next === String(L.cursor)) L.done = true; else L.cursor = next;
    },
    async thread(L, ctx) {
      // oldest first, so the thread reads top to bottom like on yay.space
      const d = await getJson(`/v2/conversations/${ctx}?number=50&reverse=true${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      addPosts(L, d.posts || []);
    }
  };
  // which list is shown where, so a finished page redraws only the part that shows it
  function listOwner(L) {
    if (S.lists.followers === L) return "followers";
    if (Object.values(S.lists).includes(L)) return "tab";
    return "page";
  }
  async function loadMore(L, kind, ctx) {
    if (!L || L.loading || L.done || L.error) return;
    L.loading = true; L.started = true; redraw(L);
    try { await PAGERS[kind](L, ctx); }
    catch (e) {
      L.error = isPrivateErr(e) ? "このアカウントは非公開（鍵アカウント）のため取得できません。" : (e.message || String(e));
      if (isPrivateErr(e)) L.done = true;
    } finally { L.loading = false; redraw(L); }
  }
  function redraw(L) {
    const owner = listOwner(L);
    if (owner === "followers") renderFollowers();
    else if (owner === "tab") renderTab();
    else if (view.kind !== "user" && view.kind !== "landing") renderPage();
  }

  /* load the next page only when the end of a list comes into view.
     Each list ends with a marker (.ys-more[data-list]); it is watched by an observer
     tied to the page (or, inside the followers popup, to the popup's own scroll box). */
  const markers = new Map(); // marker element → loader
  const pageObserver = "IntersectionObserver" in window ? new IntersectionObserver(onSeen, { rootMargin: "0px 0px 60px 0px" }) : null;
  let popupObserver = null;
  function onSeen(entries) { for (const en of entries) if (en.isIntersecting) markers.get(en.target)?.(); }
  function watch(container, observer, loaders) {
    for (const m of [...markers.keys()]) if (!document.contains(m)) markers.delete(m);
    if (observer && observer === pageObserver) observer.disconnect();
    for (const m of container.querySelectorAll(".ys-more[data-list]")) {
      const fn = loaders[m.dataset.list]; if (!fn) continue;
      markers.set(m, fn);
      if (observer) observer.observe(m);
    }
  }
  window.addEventListener("scroll", () => { // fallback for browsers without IntersectionObserver
    if (pageObserver) return;
    for (const [m, fn] of markers) if (document.contains(m) && m.getBoundingClientRect().top < innerHeight + 60) fn();
  }, { passive: true });

  /* ---------------- rendering ---------------- */
  const TAB_ICON = { "": "list", album: "image", reviews: "mail", groups: "users", about: "info", data: "data", posts: "list", members: "users", related: "link", search: "search", info: "info" };
  const TABS = [
    ["", "全ての投稿", u => u.posts_count], ["album", "アルバム", u => u.media_count], ["reviews", "レター", u => u.reviews_count],
    ["groups", "サークル", u => u.groups_users_count], ["about", "詳細", () => ""], ["data", "データ", () => ""]
  ];
  const TAB_ALIASES = { posts: "", letters: "reviews", following: "about", overview: "about", call: "", followers: "" };
  const TAB_LABEL = Object.fromEntries(TABS.map(t => [t[0], t[1]]));
  let currentTab = "", popup = null, callOpen = false;
  function render() {
    const route = currentRoute(), parts = route.split("/").filter(Boolean);
    $("upError").classList.add("hidden");
    popup = null;
    if (parts[0] === "user" && /^\d+$/.test(parts[1] || "")) {
      const id = parts[1], raw = parts[2] || "";
      let tab = raw in TAB_ALIASES ? TAB_ALIASES[raw] : raw;
      if (!TABS.some(t => t[0] === tab)) tab = "";
      if (S.id !== id) { S = blank(id); callOpen = false; }
      if (raw === "followers") popup = "followers";
      if (raw === "call") callOpen = true;
      currentTab = tab;
      view = { kind: "user" };
      ensureCore();
      renderUser();
    } else if ((parts[0] === "post" || parts[0] === "conversation") && /^\d+$/.test(parts[1] || "")) {
      view = { kind: parts[0], id: parts[1] };
      renderPage();
    } else if (parts[0] === "group" && /^\d+$/.test(parts[1] || "")) {
      const tab = GROUP_TABS.some(t => t[0] === parts[2]) ? parts[2] : "";
      view = { kind: "group", id: parts[1], tab, extra: tab ? parts.slice(3).join("/") : "" };
      renderPage();
    } else if (parts[0] === "groups") {
      view = { kind: "groups", mode: parts[1] === "category" ? "category" : parts[1] === "search" ? "search" : "", val: parts.slice(2).join("/") };
      renderPage();
    } else if (parts[0] === "timeline") {
      view = { kind: "timeline", sub: parts[1] === "calls" ? "calls" : parts[1] === "hashtag" && parts[2] ? "hashtag" : "", tag: parts.slice(2).join("/") };
      renderPage();
    } else if (parts[0] === "search") {
      view = { kind: "search", type: parts[1] || "posts", q: parts.slice(2).join("/") };
      renderPage();
    } else if (parts[0] === "users") {
      view = { kind: "users", sub: parts[1] || "ranking", mode: parts[2] || "" };
      renderPage();
    } else {
      view = { kind: "landing" };
      document.title = "Yay! ユーザー情報";
      app.innerHTML = landing();
    }
    renderFollowers();
    renderCall();
  }
  /* ---- home: things people come for, loaded live; every block has a loading, error and empty look ---- */
  const RECENT_KEY = "yay_viewer_recent_v1", SEARCH_KEY = "yay_viewer_searches_v1";
  const readList = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
  const writeList = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: not remembered */ } };
  function remember(item) {
    if (!item.id) return;
    const list = readList(RECENT_KEY).filter(x => !(x.type === item.type && x.id === item.id));
    writeList(RECENT_KEY, [{ ...item, t: Date.now() }, ...list].slice(0, 16));
  }
  const home = {};
  const HOME = {
    calls: { title: "いま通話中", icon: "phone", more: ["timeline/calls", "すべての通話"], load: async () => (await getJson("/v2/posts/call_timeline?number=12")).posts || [] },
    hima: { title: "今ひまなユーザー", icon: "clock", more: ["users/hima", "もっと見る"], load: async () => ((await getJson("/v1/web/users/hima_users?number=18")).hima_users || []).map(r => r.user).filter(Boolean) },
    rank: { title: "ルーキーランキング", icon: "trophy", more: ["users/ranking/new", "ランキングを見る"], load: async () => ((await getJson("/v1/web/users/ranking?mode=one_month")).users || []).slice(0, 5) },
    groups: { title: "にぎわっているサークル", icon: "users", more: ["groups", "サークルを探す"], load: async () => ((await getJson("/v2/groups?number=20")).groups || []).slice(0, 6) },
    tl: { title: "タイムラインの新着", icon: "list", more: ["timeline", "タイムラインを見る"], load: async () => ((await getJson("/v2/posts/timeline?number=20")).posts || []).filter(x => x.post_type !== "call").slice(0, 3) }
  };
  function homeBlock(key) {
    const d = HOME[key], st = home[key] || { loading: true };
    let body;
    if (st.loading) body = `<div class="ys-home-skel">${"<i></i>".repeat(key === "hima" ? 6 : 3)}</div>`;
    else if (st.err) body = emptyBox("読み込めませんでした。", "alert", `<button class="ys-btn ys-btn-sm" type="button" data-home-retry="${key}">もう一度読み込む</button>`);
    else if (!st.items.length) body = emptyBox({ calls: "いま公開されている通話はありません。少し時間をおいて見てみてください。", hima: "いま「ひま」にしているユーザーはいません。", rank: "ランキングはまだありません。", groups: "サークルが見つかりませんでした。", tl: "新しい投稿はまだありません。" }[key], d.icon);
    else body = HOME_ROW[key](st.items);
    return `<section class="ys-box ys-home" data-home="${key}"><h2 class="ys-box-title">${ic(d.icon)}${d.title}${rlink(d.more[0], `${d.more[1]}${ic("chevron-right")}`, "ys-home-more")}</h2>${body}</section>`;
  }
  const HOME_ROW = {
    calls: items => `<div class="ys-home-calls">${items.slice(0, 6).map(p => {
      const c = p.conference_call || {}, pu = p.user || {}, users = c.conference_call_users || [];
      return rlink(`post/${p.id}`, `<span class="ys-hc-top"><span class="ys-hc-live">${isVideo(c) ? "ビデオ" : "通話中"}</span><span class="ys-hc-time">${durText(Date.now() / 1000 - Number(p.created_at || 0))}</span></span>
        <b class="ys-hc-title">${esc(p.text || "（タイトルなし）")}</b>
        <span class="ys-hc-host">${avatarOf(pu) ? `<img src="${esc(avatarOf(pu))}" alt="" loading="lazy">` : ""}${esc(pu.nickname || "")}</span>
        <span class="ys-hc-faces">${users.slice(0, 7).map(u => avatarOf(u) ? `<img src="${esc(avatarOf(u))}" alt="" loading="lazy">` : "<i></i>").join("")}<em>${num(c.conference_call_users_count)}${c.max_participants ? `/${num(c.max_participants)}` : ""}人</em></span>`, "ys-hc");
    }).join("")}</div>`,
    hima: items => `<div class="ys-home-faces">${items.slice(0, 18).map(u => rlink(`user/${u.id}`, `<span class="ys-ct-ava">${avatarOf(u) ? `<img src="${esc(avatarOf(u))}" alt="" loading="lazy">` : initial(u)}${u.online_status === "online" ? "<i></i>" : ""}</span><span class="ys-ct-name">${esc(u.nickname || u.id)}</span>`, "ys-face")).join("")}</div>`,
    rank: items => `<ul class="fl-list">${items.map((u, i) => personRow2(u, "", `<span class="fl-rank r${Math.min(i + 1, 4)}">${i + 1}</span>`)).join("")}</ul>`,
    groups: items => items.map(groupCard).join(""),
    tl: items => items.map(x => postCard(x)).join("")
  };
  function loadHome(force) {
    for (const key of Object.keys(HOME)) {
      if (home[key] && !force && !home[key].err) continue;
      home[key] = { loading: true };
      HOME[key].load().then(items => { home[key] = { items }; }, e => { home[key] = { err: e }; }).finally(() => {
        const el = app.querySelector(`[data-home="${key}"]`);
        if (view.kind === "landing" && el) el.outerHTML = homeBlock(key);
      });
    }
  }
  function recentBlock() {
    const list = readList(RECENT_KEY);
    const body = list.length ? `<div class="ys-home-faces">${list.map(x => rlink(`${x.type}/${x.id}`, `<span class="ys-ct-ava${x.type === "group" ? " sq" : ""}">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : esc(Array.from(String(x.name || "?"))[0])}</span><span class="ys-ct-name">${esc(x.name || x.id)}</span><span class="ys-face-sub">${x.type === "group" ? "サークル" : "ユーザー"}</span>`, "ys-face")).join("")}</div>`
      : emptyBox("まだ何も見ていません。上の検索に ID や URL を入れるか、下のランキングから気になる人を開いてみてください。", "clock");
    return `<section class="ys-box ys-home"><h2 class="ys-box-title">${ic("clock")}最近見たページ${list.length ? `<button class="ys-home-more" type="button" data-clear-recent>履歴を消す</button>` : ""}</h2>${body}</section>`;
  }
  function landing() {
    setTimeout(() => loadHome(false), 0);
    return `${subnav("")}<section class="ys-box ys-hero">
      <form class="ys-search-row" data-user-search autocomplete="off"><input name="q" placeholder="ID・URL・キーワードで検索" spellcheck="false" enterkeyhint="go" aria-label="ユーザーID、プロフィールURL、投稿URL、またはキーワード"><button class="ys-btn ys-btn-primary" type="submit">${ic("search")}表示</button></form></section>
      ${recentBlock()}
      <div class="ys-home-grid">${homeBlock("calls")}${homeBlock("hima")}</div>
      <div class="ys-home-grid">${homeBlock("rank")}${homeBlock("groups")}</div>
      ${homeBlock("tl")}`;
  }
  function crumbs(items) {
    return `<nav class="ys-crumbs" aria-label="現在の場所">${rlink("", `${ICON.home} ユーザー情報`)}${items.map(([label, route]) => `<span class="ys-crumb-sep">${ic("chevron-right")}</span>${route != null ? rlink(route, esc(label)) : `<span>${esc(label)}</span>`}`).join("")}</nav>`;
  }
  function userCrumbs(u) {
    const name = u?.nickname || S.id;
    return crumbs(currentTab ? [[name, `user/${S.id}`], [TAB_LABEL[currentTab]]] : [[name]]);
  }
  function renderUser() {
    if (S.coreErr) {
      document.title = "Yay! ユーザー情報";
      app.innerHTML = `${userCrumbs(null)}<section class="ys-box ys-empty"><p>${esc(S.coreErr.message || S.coreErr)}</p><button class="ys-btn" type="button" data-retry>もう一度読み込む</button></section>`;
      app.querySelector("[data-retry]").onclick = () => { const id = S.id; S = blank(id); render(); };
      return;
    }
    if (!S.core) { app.innerHTML = `${userCrumbs(null)}<section class="ys-box ys-loading-card"><span class="ys-spinner"></span><p>読み込んでいます…</p></section>`; return; }
    const u = S.core.merged;
    document.title = `${u.nickname || u.id}${currentTab ? `の${TAB_LABEL[currentTab]}` : ""} - Yay! ユーザー情報`;
    remember({ type: "user", id: String(u.id), name: u.nickname, img: avatarOf(u) });
    if (!app.querySelector(`.ys-user[data-id="${S.id}"]`)) {
      app.innerHTML = `<div class="ys-crumbs-slot"></div><section class="ys-box ys-user" data-id="${esc(S.id)}">${header(u)}<nav class="ys-tabs" aria-label="表示する情報"></nav><div id="upTab"></div></section>`;
    }
    app.querySelector(".ys-crumbs-slot").innerHTML = userCrumbs(u);
    app.querySelector(".ys-tabs").innerHTML = TABS.map(([k, label, count]) => {
      const c = count(u), on = k === currentTab;
      return rlink(`user/${S.id}${k ? `/${k}` : ""}`, `<b>${ic(TAB_ICON[k])}${label}</b><small>${c === "" ? "&nbsp;" : num(c)}</small>`, `ys-tab${on ? " active" : ""}`, on ? ' aria-current="page"' : "");
    }).join("");
    const active = app.querySelector(".ys-tab.active");
    if (active) { const nav = active.parentElement; nav.scrollLeft = Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2); }
    renderTab();
  }
  /* Role badges next to a name, the way yay.space marks them:
   *   title "admin" → 運営, title "official" → 公式 (users and circles), circle owner → 管理人, circle moderator → 副管理人,
   *   VIP (unless hidden), and the warnings yay.space shows in chats: 注意ユーザー, recently penalised (recently_kenta). */
  let circleCtx = null; // { owner, mods:Set } while a circle page is shown
  const TITLE_JA = { admin: "運営", official: "公式" };
  function roleBadges(u, extra = []) {
    if (!u) return "";
    const b = [];
    if (TITLE_JA[u.title]) b.push([u.title, TITLE_JA[u.title], u.title === "admin" ? "Yay! の運営アカウント" : "公式アカウント"]);
    const c = view.kind === "group" ? circleCtx : null;
    if (c && String(c.owner) === String(u.id)) b.push(["owner", "管理人", "このサークルの管理人"]);
    else if (c && c.mods && c.mods.has(String(u.id))) b.push(["mod", "副管理人", "このサークルの副管理人"]);
    for (const e of extra) b.push(e);
    if (u.vip && !u.hide_vip) b.push(["vip", "VIP", "VIPメンバー"]);
    if (u.dangerous_user) b.push(["warn", "注意", "注意が必要なユーザー"]);
    if (u.recently_kenta) b.push(["warn", "ペナルティ", "このユーザーは近日ペナルティを受けています"]);
    return b.length ? `<span class="ys-ubs">${b.map(([c, t, tip]) => `<span class="ys-ub ys-ub-${c}" title="${esc(tip)}">${esc(t)}</span>`).join("")}</span>` : "";
  }
  function badges(u) {
    const b = [];
    if (S.core.call) b.push(["call", "通話中"]);
    if (u.is_private) b.push(["lock", "鍵アカウント"]);
    if (u.vip && !u.hide_vip) b.push(["vip", "VIP"]);
    if (u.age_verified) b.push(["ok", "年齢確認済み"]);
    if (u.mobile_verified) b.push(["", "電話番号認証済み"]);
    if (u.new_user) b.push(["new", "新規ユーザー"]);
    if (u.dangerous_user) b.push(["warn", "注意ユーザー"]);
    if (u.recently_kenta) b.push(["warn", "近日ペナルティを受けています"]);
    if (u.title && !TITLE_JA[u.title] && u.title !== "other") b.push(["pink", u.title]);
    return b.map(([c, t]) => `<span class="ys-badge${c ? ` ys-badge-${c}` : ""}">${esc(t)}</span>`).join("");
  }
  // long text starts folded with a 「もっと見る」 button
  function foldText(text) {
    const long = String(text).length > 260 || String(text).split(/\n/).length > 7;
    return `<p class="ys-bio${long ? " folded" : ""}">${linkify(text)}</p>${long ? `<button type="button" class="ys-more-btn" data-unfold>もっと見る</button>` : ""}`;
  }
  function header(u) {
    const cover = img(u.cover_image), ava = img(u.profile_icon), sp = span(u.created_at), online = u.online_status === "online" || u.is_online;
    const shareUrl = PATH_MODE ? `${BASE}?user/${u.id}` : `${location.href.split("#")[0]}#/user/${u.id}`;
    return `<div class="ys-cover">${cover ? `<img src="${esc(cover)}" alt=""><button class="ys-cover-btn" type="button" data-zoom="${esc(cover)}" aria-label="バナー画像を拡大"></button>` : ""}
        <a class="ys-menu" href="https://yay.space/user/${esc(u.id)}" target="_blank" rel="noopener" title="Yay! で開く" aria-label="Yay! で開く">${ic("external")}</a></div>
      <div class="ys-profile">
        <button class="ys-avatar" type="button" ${ava ? `data-zoom="${esc(ava)}"` : "disabled"} aria-label="プロフィール画像を拡大">${ava ? `<img src="${esc(ava)}" alt="">` : `<b>${initial(u)}</b>`}<i class="ys-online${online ? " on" : ""}" title="${online ? "オンライン" : "オフライン"}"></i></button>
        <h1 class="ys-name">${esc(u.nickname || "(名前なし)")}${roleBadges(u)}</h1>
        <div class="ys-sub">ID ${esc(u.id)}${u.username ? ` · @${esc(u.username)}` : ""} · 最終ログイン ${ago(u.last_loggedin_at)}</div>
        <div class="ys-badges">${badges(u)}</div>
        ${u.biography ? foldText(u.biography) : ""}
        <div class="ys-dl">
          ${rlink(`user/${S.id}/followers`, `<b>${num(u.followers_count)}</b><em>フォロワー</em>`)}
          <span title="フォロー中の一覧は Yay! にログインしないと取得できないため、人数のみ表示します"><b>${u.followings_count != null ? num(u.followings_count) : "—"}</b><em>フォロー中</em></span>
          ${sp ? `<span><b>${fmtDate(u.created_at, false)}</b><em>登録（${sp.text}）</em></span>` : ""}
        </div>
        <div class="ys-actions">
          <a class="ys-btn" href="https://yay.space/user/${esc(u.id)}" target="_blank" rel="noopener">${ic("external")}Yay! で開く</a>
          <button class="ys-btn" type="button" data-copy="${esc(shareUrl)}">${ic("copy")}URLをコピー</button>
        </div>
        <div class="ys-tools"><span class="ys-tools-label">このユーザーで使う</span>${[["interaction", "交流マップ", "users"], ["review", "レターマップ", "mail"], ["call", "通話マップ", "phone"], ["combined", "総合ランキング", "trophy"], ["post-ranking", "投稿ランキング", "list"], ["license", "ユーザー証", "image"]].map(([f, l, i]) => `<a class="ys-tool-chip" href="../${f}.html?user=${esc(u.id)}">${ic(i)}${l}</a>`).join("")}</div>
      </div>`;
  }

  function renderTab() {
    const box = $("upTab"); if (!box || !S.core || view.kind !== "user") return;
    const u = S.core.merged;
    const fns = { "": tabPosts, album: tabAlbum, reviews: tabReviews, groups: tabGroups, about: tabAbout, data: tabData };
    const f = document.activeElement, fk = f && box.contains(f) ? f.dataset.key : null, caret = fk ? f.selectionStart : null;
    box.innerHTML = fns[currentTab](u);
    if (fk) { const n = box.querySelector(`[data-key="${fk}"]`); if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(caret, caret); } catch { /* not a text box */ } } }
    const kind = { "": "posts", album: "album", reviews: "reviews", groups: "groups" }[currentTab];
    if (!kind) return;
    const L = S.lists[kind], id = S.id;
    if (!L.started && !L.done) { loadMore(L, kind, id); return; }
    watch(box, pageObserver, { [kind]: () => loadMore(L, kind, id) });
  }
  // bottom of a list: spinner while loading, retry after an error, a note at the end
  function more(name, L, unit) {
    if (L.error) return `<div class="ys-more"><div class="ys-error">${esc(L.error)}</div>${L.done ? "" : `<button class="ys-btn" type="button" data-retry-list>もう一度読み込む</button>`}</div>`;
    if (L.done) return L.items.length ? `<div class="ys-more">すべて表示しました（${num(L.items.length)}${unit}）</div>` : "";
    return `<div class="ys-more" data-list="${name}"><span class="ys-spinner"${L.loading ? "" : ' style="opacity:.3;animation:none"'}></span><span>${L.loading ? "読み込み中…" : `${num(L.items.length)}${unit} · 下までスクロールすると続きを読み込みます`}</span></div>`;
  }
  function toolbar(kind, sorts, extra = "") {
    const v = S.view[kind];
    return `<div class="ys-toolbar">
      <label class="ys-ctl">並び替え<select data-view="${kind}" data-prop="sort">${sorts.map(([k, l]) => `<option value="${k}"${v.sort === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      ${extra}
      ${"q" in v ? `<label class="ys-ctl ys-ctl-q"><input type="search" data-view="${kind}" data-prop="q" data-key="${kind}-q" value="${esc(v.q)}" placeholder="キーワードで絞り込み" aria-label="キーワードで絞り込み"></label>` : ""}
    </div>`;
  }
  const by = (f, dir = -1) => (a, b) => { const x = f(a), y = f(b); return x === y ? 0 : (x > y ? 1 : -1) * dir; };
  const emptyBox = (msg, icon = "info", extra = "") => `<div class="ys-empty"><span class="ys-empty-ic">${ic(icon)}</span><p>${msg}</p>${extra}</div>`;
  const emptyMsg = (L, msg, icon) => (L.loading || L.error || !L.done || L.items.length) ? "" : emptyBox(msg, icon);

  /* ---- posts ---- */
  const POST_TYPES = [["all", "すべて"], ["text", "テキスト"], ["image", "画像"], ["video", "動画"], ["call", "通話"], ["survey", "アンケート"], ["reply", "返信"], ["repost", "アゲ"], ["other", "その他"]];
  function postKind(p) {
    if (p.post_type === "repost" || p.repost || p.shareable?.type === "post") return "repost";
    if (p.in_reply_to) return "reply";
    if (["text", "image", "video", "call", "survey"].includes(p.post_type)) return p.post_type;
    return "other";
  }
  function tabPosts() {
    const L = S.lists.posts, v = S.view.posts;
    let items = L.items.slice();
    if (v.type !== "all") items = items.filter(p => postKind(p) === v.type);
    if (v.q) { const q = v.q.toLowerCase(); items = items.filter(p => String(p.text || "").toLowerCase().includes(q)); }
    const sorts = { new: by(p => Number(p.created_at)), old: by(p => Number(p.created_at), 1), likes: by(p => Number(p.likes_count || 0)), replies: by(p => Number(p.in_reply_to_post_count || 0)), reposts: by(p => Number(p.reposts_count || 0)), gifts: by(p => Number(p.total_gifts_count || 0)) };
    items.sort(sorts[v.sort] || sorts.new);
    const filtered = v.type !== "all" || v.q || v.sort !== "new";
    const pinned = filtered ? [] : (L.extra?.pinned || []);
    const typeSel = `<label class="ys-ctl">種類<select data-view="posts" data-prop="type">${POST_TYPES.map(([k, l]) => `<option value="${k}"${v.type === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    return `${toolbar("posts", [["new", "新しい順"], ["old", "古い順"], ["likes", "いいねが多い順"], ["replies", "返信が多い順"], ["reposts", "アゲが多い順"], ["gifts", "ギフトが多い順"]], typeSel)}
      ${summary(L.items)}
      ${pinned.map(p => postCard(p, { pinned: true })).join("")}
      ${items.map(p => postCard(p)).join("") || (L.items.length && filtered ? `<div class="ys-empty">条件に合う投稿はまだありません。${L.done ? "" : "下までスクロールすると続きを探します。"}</div>` : emptyMsg(L, "まだ投稿がありません。"))}
      ${more("posts", L, "件")}`;
  }
  function summary(ps) {
    if (!ps.length) return "";
    const likes = ps.reduce((a, p) => a + Number(p.likes_count || 0), 0);
    const replies = ps.reduce((a, p) => a + Number(p.in_reply_to_post_count || 0), 0);
    const top = ps.reduce((a, p) => Number(p.likes_count || 0) > Number(a.likes_count || 0) ? p : a, ps[0]);
    return `<div class="ys-stats"><span>読み込んだ投稿 <b>${num(ps.length)}</b></span><span>合計いいね <b>${num(likes)}</b></span><span>平均いいね <b>${(likes / ps.length).toFixed(1)}</b></span><span>合計返信 <b>${num(replies)}</b></span><span>最多いいね <b>${num(top.likes_count)}</b></span></div>`;
  }
  function mediaOf(p) {
    const out = [];
    for (let i = 1; i <= 9; i++) {
      const k = i === 1 ? "attachment" : `attachment_${i}`;
      if (p[k]) out.push({ type: "image", src: img(p[k]), thumb: img(p[`${k}_thumbnail`] || p[k]), post: p });
    }
    for (const v of p.videos || []) if (v.video_url) out.push({ type: "video", src: img(v.video_url), thumb: img(v.thumbnail_big_url || v.thumbnail_url), post: p });
    return out;
  }
  // post text with @mentions linked (message_tags give the offset/length in the text) and URLs linked
  function postText(p) {
    const text = String(p.text || ""), tags = (p.message_tags || []).filter(t => t.type === "user" && t.user_id != null).sort((a, b) => a.offset - b.offset);
    let out = "", at = 0;
    for (const t of tags) {
      if (t.offset < at || t.offset + t.length > text.length) continue;
      out += linkify(text.slice(at, t.offset)) + rlink(`user/${t.user_id}`, esc(text.substr(t.offset, t.length)), "ys-mention");
      at = t.offset + t.length;
    }
    return out + linkify(text.slice(at));
  }
  const textClass = p => { const c = Number(p.color || 0); return c >= 1 && c <= 7 ? ` c${c}` : c >= 1000 ? ` cbg cbg${c}` : ""; };
  // one post row like yay.space's PostList; opts: pinned, big (post page), replyTo (show "返信: name"), depth (thread indent)
  function postCard(p, opts = {}) {
    const media = mediaOf(p), call = p.conference_call, pu = p.user || S.core?.merged || {}, kind = postKind(p);
    const a = avatarOf(pu), n = media.length, replies = Number(p.in_reply_to_post_count || 0);
    const clickable = !opts.big;
    const showReplyTo = p.in_reply_to_post && !opts.inThread && !opts.big;
    return `<article class="ys-post${opts.pinned ? " pinned" : ""}${opts.big ? " big" : ""}${clickable ? " clickable" : ""}"${clickable ? ` data-open-post="${esc(p.id)}"` : ""}${opts.depth ? ` style="--depth:${Math.min(opts.depth, 4)}"` : ""}>
      ${rlink(`user/${pu.id}`, a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(pu), "ys-post-ava", ' aria-hidden="true" tabindex="-1"')}
      <div class="ys-post-body">
        <div class="ys-post-top"><span class="ys-post-who">${rlink(`user/${pu.id}`, esc(pu.nickname || pu.id), "ys-post-name")}${roleBadges(pu)}</span>${rlink(`post/${p.id}`, ago(p.created_at), "ys-post-time", ` title="${esc(fmtDate(p.created_at))}"`)}</div>
        ${opts.replyName ? `<div class="ys-reply-label">返信: ${opts.replyName}</div>` : ""}
        ${opts.pinned || kind === "repost" || p.edited_at || Number(p.reported_count) || (p.group_id && view.kind !== "group") ? `<div class="ys-post-meta">${[Number(p.reported_count) ? `<span class="ys-reported" title="この投稿は${num(p.reported_count)}回通報されています">${ic("alert")}通報 ${num(p.reported_count)}回</span>` : "", opts.pinned ? `<span class="ys-meta-ic">${ic("pin")}ピン留め</span>` : "", kind === "repost" ? "アゲ" : "", p.edited_at ? `編集済み（${ago(p.edited_at)}）` : "", p.group_id && view.kind !== "group" ? rlink(`group/${p.group_id}`, "サークルの投稿", "ys-group-chip") : ""].filter(Boolean).join(" · ")}</div>` : ""}
        ${showReplyTo ? replyLine(p.in_reply_to_post) : ""}
        ${p.text ? `<p class="ys-post-text${textClass(p)}">${postText(p)}</p>` : ""}
        ${p.shareable?.type === "post" && p.shareable.post ? sharedPost(p.shareable.post) : ""}
        ${p.survey ? surveyBox(p.survey) : ""}
        ${p.shared_url ? urlCard(p.shared_url) : ""}
        ${call ? callInfo(p, { big: opts.big }) : ""}
        ${n ? `<div class="ys-media ${n === 1 ? "n1" : n === 2 ? "n2" : n === 3 ? "n3" : n === 4 ? "n4" : "nmany"}">${media.map(m => `<button type="button" class="ys-thumb" data-media="${esc(m.src)}" data-type="${m.type}" data-post="${esc(p.id)}"><img src="${esc(m.thumb)}" alt="" loading="lazy">${m.type === "video" ? `<span class="ys-play"></span>` : ""}</button>`).join("")}</div>` : ""}
        <ul class="ys-post-actions">
          <li>${p.conversation_id && (replies || p.in_reply_to) ? rlink(`conversation/${p.conversation_id}`, `${ICON.reply}${replies ? num(replies) : ""}`, "ys-act", ' title="会話を見る"') : `<span class="ys-act" title="返信">${ICON.reply}${replies ? num(replies) : ""}</span>`}</li>
          <li>${rlink(`post/${p.id}`, `${ICON.heart}${Number(p.likes_count) ? num(p.likes_count) : ""}`, "ys-act", ' title="いいねした人を見る"')}</li>
          ${Number(p.reposts_count) ? `<li><span class="ys-act" title="アゲされた数">${ICON.repost}${num(p.reposts_count)}</span></li>` : ""}
          <li><span class="ys-act" title="ギフト">${ICON.gift}${Number(p.total_gifts_count) ? num(p.total_gifts_count) : ""}</span></li>
          ${p.conversation_id && (replies || p.in_reply_to) && !opts.inThread ? `<li class="ys-act-more">${rlink(`conversation/${p.conversation_id}`, "会話を見る", "ys-act-link")}</li>` : ""}
        </ul>
      </div>
    </article>`;
  }
  // the post this one replies to, as one small line: 返信先 + picture + name + the start of the text
  function replyLine(q) {
    const u = q.user || {}, a = avatarOf(u);
    return rlink(`post/${q.id}`, `<span class="ys-replyline-label">${ICON.reply}返信先</span>${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : ""}<b>${esc(u.nickname || "投稿")}</b><span class="ys-replyline-text">${esc(String(q.text || (q.post_type === "image" ? "画像" : q.post_type === "call" ? "通話" : "")).replace(/\s+/g, " "))}</span>`, "ys-replyline", ` title="${esc(String(q.text || "").slice(0, 200))}"`);
  }
  /* Call details on every call post: live or ended, how long, 枠主 (host) and サブ枠主 (moderators), who is in it,
     size, who may join, game/genre and lock. The API gives no end time, so a finished call's length is estimated
     from the post's last update. */
  const isVideo = c => c.call_type === "vdo" || c.call_type === "video";
  function durText(sec) {
    sec = Math.max(0, Math.floor(sec)); const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return `${d ? `${d}日` : ""}${h ? `${h}時間` : ""}${d || h ? (m ? `${m}分` : "") : `${m}分`}`;
  }
  // names for user IDs that only appear in role lists (people who held a role in a call that has ended)
  const userCache = new Map(); // id → user, or null while loading / when it failed
  let userFetchQueue = Promise.resolve();
  function wantUsers(ids) {
    const missing = ids.filter(id => !userCache.has(String(id))).slice(0, 40);
    if (!missing.length) return;
    missing.forEach(id => userCache.set(String(id), null));
    userFetchQueue = userFetchQueue.then(async () => {
      for (const id of missing) { try { userCache.set(String(id), (await getJson(`/v2/users/${id}`)).user || null); } catch { /* stays unknown */ } }
      if (view.kind === "post") renderPage();
    });
  }
  function callTile(u, role) {
    const a = avatarOf(u), online = u.online_status === "online" || u.is_online;
    return rlink(`user/${u.id}`, `<span class="ys-ct-ava">${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(u)}${online ? "<i></i>" : ""}</span><span class="ys-ct-name">${esc(u.nickname || u.id)}</span>${role === "host" ? `<span class="ys-ub ys-ub-owner">枠主</span>` : role === "moderator" ? `<span class="ys-ub ys-ub-mod">サブ枠主</span>` : ""}${roleBadges(u)}`, "ys-ct");
  }
  function callInfo(p, opts = {}) {
    const c = p.conference_call || {}, users = c.conference_call_users || [];
    const roles = new Map((c.conference_call_user_roles || []).map(r => [String(r.user_id), r.role]));
    const rank = id => roles.get(String(id)) === "host" ? 0 : roles.get(String(id)) === "moderator" ? 1 : 2;
    const present = users.slice().sort((a, b) => rank(a.id) - rank(b.id));
    const presentIds = new Set(users.map(u => String(u.id)));
    const roleIds = [...roles.keys()];
    const goneHosts = roleIds.filter(id => roles.get(id) === "host" && !presentIds.has(id));
    const goneSubs = roleIds.filter(id => roles.get(id) === "moderator" && !presentIds.has(id));
    const start = Number(p.created_at || 0), end = c.active ? Date.now() / 1000 : Number(p.updated_at || 0);
    const dur = start && end > start ? durText(end - start) : null;
    const join = { anyone: "全員", users: "全員", followers: "フォロワーのみ", mutual_follows: "相互フォローのみ", invite_only: "招待のみ" }[c.joinable_by] || c.joinable_by || "—";
    // people who held a role but are not in the call any more: names on the post page, a count elsewhere
    const gone = [...goneHosts, ...goneSubs];
    if (opts.big && gone.length) wantUsers(gone);
    const goneTiles = opts.big ? gone.map(id => { const u = userCache.get(String(id)) || (p.user && String(p.user.id) === id ? p.user : null); return u ? callTile(u, roles.get(id)) : ""; }).join("") : "";
    const goneLeft = gone.length - (opts.big ? gone.filter(id => userCache.get(String(id)) || (p.user && String(p.user.id) === id)).length : 0);
    return `<div class="ys-callinfo${c.active ? " live" : ""}">
      <div class="ys-callinfo-head"><span class="ys-callinfo-icon">${ICON.phone}</span><b>${c.active ? (isVideo(c) ? "ビデオ通話中" : "通話中") : "通話は終了しました"}</b>
        <span class="ys-callinfo-count">${num(c.conference_call_users_count)}${c.max_participants ? ` / ${num(c.max_participants)}` : ""}人</span></div>
      ${present.length || c.anonymous_call_users_count ? `<div class="ys-callppl-title">${c.active ? "参加中のユーザー" : "最後に参加していたユーザー"}（${num(present.length + Number(c.anonymous_call_users_count || 0))}人）</div>
      <div class="ys-callppl">${present.map(u => callTile(u, roles.get(String(u.id)))).join("")}${c.anonymous_call_users_count ? `<span class="ys-ct ys-ct-anon"><span class="ys-ct-ava">${ic("user")}</span><span class="ys-ct-name">匿名 ${num(c.anonymous_call_users_count)}人</span></span>` : ""}</div>` : ""}
      ${gone.length ? `<div class="ys-callppl-title">${c.active ? "退出した枠主・サブ枠主" : "枠主・サブ枠主だった人"}（${num(gone.length)}人）</div>
      <div class="ys-callppl">${goneTiles}${goneLeft ? `<span class="fl-tag">${opts.big ? "読み込み中・不明" : "ほか"} ${num(goneLeft)}人</span>` : ""}</div>` : ""}
      <dl class="ys-callinfo-dl">
        <dt>種類</dt><dd>${isVideo(c) ? "ビデオ通話" : "音声通話"}</dd>
        <dt>${c.active ? "経過時間" : "通話時間（目安）"}</dt><dd>${dur || "—"}</dd>
        <dt>開始</dt><dd>${start ? `${fmtDate(start)}（${ago(start)}）` : "—"}</dd>
        <dt>参加できる人</dt><dd>${esc(join)}${c.locked ? "・鍵付き" : ""}</dd>
        ${c.game ? `<dt>ゲーム</dt><dd>${esc(c.game.title || c.game.name || "")}</dd>` : ""}
        ${c.genre ? `<dt>ジャンル</dt><dd>${esc(c.genre.title || c.genre.name || "")}</dd>` : ""}
      </dl></div>`;
  }
  // アンケート: yay.space only shows the results after you vote; here they are always visible
  function surveyBox(sv) {
    const total = Number(sv.votes_count || 0), max = Math.max(1, ...(sv.choices || []).map(c => Number(c.votes_count || 0)));
    return `<div class="ys-survey"><div class="ys-survey-head">アンケート · ${num(total)}票</div>${(sv.choices || []).map(c => {
      const n = Number(c.votes_count || 0), pct = total ? Math.round(n / total * 100) : 0;
      return `<div class="ys-survey-row${n === max && n ? " top" : ""}"><i style="width:${pct}%"></i><span>${esc(c.label)}</span><b>${pct}%<small>${num(n)}票</small></b></div>`;
    }).join("")}</div>`;
  }
  // link preview (shared_url) like yay.space's URL card
  function urlCard(u) {
    if (!u.url) return "";
    let host = ""; try { host = new URL(u.url).hostname; } catch { /* keep empty */ }
    const inner = `${u.image_url ? `<img src="${esc(img(u.image_url))}" alt="" loading="lazy">` : ""}<span class="ys-url-copy"><b>${esc(u.title || u.url)}</b>${u.description ? `<small>${esc(String(u.description).slice(0, 120))}</small>` : ""}<em>${esc(host)}</em></span>`;
    const m = String(u.url).match(/^https?:\/\/yay\.space\/(user|post|group|conversation)\/(\d+)/);
    return m ? rlink(`${m[1]}/${m[2]}`, inner, "ys-url") : `<a class="ys-url" href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  // the post that an アゲ shares, shown as a quoted card like on yay.space
  function sharedPost(q, more = "アゲ元の投稿を見る") {
    const qu = q.user || {}, a = avatarOf(qu), m = mediaOf(q);
    return `<div class="ys-shared" data-open-post="${esc(q.id)}"><div class="ys-shared-top">${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : ""}${rlink(`user/${qu.id}`, esc(qu.nickname || qu.id), "ys-shared-name")}${roleBadges(qu)}<span class="ys-shared-time">${ago(q.created_at)}</span></div>
      ${q.text ? `<p class="ys-shared-text${textClass(q)}">${postText(q)}</p>` : ""}
      ${m.length ? `<div class="ys-shared-media">${m.slice(0, 4).map(x => `<img src="${esc(x.thumb)}" alt="" loading="lazy">`).join("")}</div>` : ""}
      <div class="ys-shared-foot">${rlink(`post/${q.id}`, `${more}${ic("chevron-right")}`)}</div></div>`;
  }
  function userChip(u, extra = "") {
    if (!u) return "";
    const a = avatarOf(u);
    return rlink(`user/${u.id}`, `${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : "<i></i>"}<span>${esc(u.nickname || u.id)}</span>${roleBadges(u)}${extra}`, "ys-chip");
  }

  /* ---- album ---- */
  let albumFlat = [];
  function tabAlbum() {
    const L = S.lists.album, v = S.view.album;
    const ps = L.items.slice().sort({ new: by(p => Number(p.created_at)), old: by(p => Number(p.created_at), 1), likes: by(p => Number(p.likes_count || 0)) }[v.sort]);
    albumFlat = ps.flatMap(mediaOf);
    return `${toolbar("album", [["new", "新しい順"], ["old", "古い順"], ["likes", "いいねが多い順"]])}
      ${albumFlat.length ? `<div class="ys-album">${albumFlat.map((m, i) => `<button type="button" class="ys-album-item" data-album="${i}"><img src="${esc(m.thumb)}" alt="" loading="lazy">${m.type === "video" ? `<span class="ys-play"></span>` : ""}<span class="ys-album-likes">${ic("heart")}${num(m.post.likes_count)}</span></button>`).join("")}</div>` : emptyMsg(L, "まだ画像や動画がありません。")}
      ${more("album", L, "件の投稿")}`;
  }

  /* ---- followers popup ---- */
  const FL_CHIPS = [["online", "オンラインのみ"], ["fresh", "新規のみ"], ["age", "年齢確認済みのみ"], ["hidePrivate", "非公開を隠す"]];
  function followerTags(x) {
    const t = [`<span class="fl-tag">最終 ${ago(x.last_loggedin_at)}</span>`, `<span class="fl-tag">フォロワー ${num(x.followers_count)}</span>`];
    if (x.online_status === "online") t.push(`<span class="fl-tag g">オンライン</span>`);
    if (x.age_verified) t.push(`<span class="fl-tag g">年齢確認</span>`);
    if (x.new_user) t.push(`<span class="fl-tag b">新規</span>`);
    if (x.is_private) t.push(`<span class="fl-tag o">鍵</span>`);
    if (x.vip && !x.hide_vip) t.push(`<span class="fl-tag y">VIP</span>`);
    return t.join("");
  }
  function renderFollowers() {
    const box = $("upModal");
    if (popup !== "followers" || view.kind !== "user" || !S.core) {
      if (!box.classList.contains("hidden")) { box.classList.add("hidden"); box.innerHTML = ""; document.body.classList.remove("up-noscroll"); }
      return;
    }
    const u = S.core.merged, L = S.lists.followers, v = S.view.followers;
    let items = L.items.slice();
    if (v.q) { const q = v.q.toLowerCase(); items = items.filter(x => `${x.nickname} ${x.biography} ${x.id}`.toLowerCase().includes(q)); }
    if (v.online) items = items.filter(x => x.online_status === "online");
    if (v.fresh) items = items.filter(x => x.new_user);
    if (v.age) items = items.filter(x => x.age_verified);
    if (v.hidePrivate) items = items.filter(x => !x.is_private);
    const sorts = { order: () => 0, login: by(x => Number(x.last_loggedin_at || 0)), followers: by(x => Number(x.followers_count || 0)), posts: by(x => Number(x.posts_count || 0)), letters: by(x => Number(x.reviews_count || 0)), name: (a, b) => String(a.nickname).localeCompare(String(b.nickname), "ja"), id: by(x => Number(x.id), 1) };
    items.sort(sorts[v.sort] || sorts.order);
    const now = Date.now() / 1000, all = L.items;
    const stats = [["表示中", items.length], ["オンライン", all.filter(x => x.online_status === "online").length], ["24時間以内にログイン", all.filter(x => now - Number(x.last_loggedin_at || 0) < 86400).length],
      ["新規", all.filter(x => x.new_user).length], ["年齢確認済", all.filter(x => x.age_verified).length], ["鍵", all.filter(x => x.is_private).length]];
    const first = box.classList.contains("hidden");
    const body = box.querySelector(".yay-modal-body"), keepScroll = body ? body.scrollTop : 0;
    const f = document.activeElement, fk = f && box.contains(f) ? f.dataset.key : null, caret = fk ? f.selectionStart : null;
    box.innerHTML = `<div class="yay-modal-card">
      <div class="yay-modal-head"><button class="yay-modal-close" type="button" data-close-popup aria-label="閉じる">${ICON.close}</button><h2 id="upModalTitle">フォロワー</h2></div>
      <div class="yay-modal-body">
        <div class="fl-search">${ICON.search}<input type="search" data-fl="q" data-key="fl-q" value="${esc(v.q)}" placeholder="フォロワーを検索" aria-label="フォロワーを検索"></div>
        <div class="fl-tools">
          <select data-fl="sort" aria-label="並び替え">${[["order", "標準の順"], ["login", "最近ログインした順"], ["followers", "フォロワーが多い順"], ["posts", "投稿が多い順"], ["letters", "レターが多い順"], ["name", "名前順"], ["id", "古いアカウント順"]].map(([k, l]) => `<option value="${k}"${v.sort === k ? " selected" : ""}>${l}</option>`).join("")}</select>
          ${FL_CHIPS.map(([k, l]) => `<button class="fl-chip" type="button" data-fl-chip="${k}" aria-pressed="${!!v[k]}">${l}</button>`).join("")}
          <span class="fl-count">表示 ${num(items.length)} / ${num(L.items.length)}${L.done ? "" : `（全${num(u.followers_count)}）`}</span>
        </div>
        ${L.items.length ? `<div class="fl-stats">${stats.map(([k, n]) => `<span>${k} ${num(n)}人</span>`).join("")}</div>` : ""}
        <ul class="fl-list">${items.map(x => {
          const a = avatarOf(x);
          return `<li class="fl-row">${rlink(`user/${x.id}`, `<span class="fl-ava">${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(x)}${x.online_status === "online" ? "<i></i>" : ""}</span><span class="fl-copy"><span class="fl-name">${esc(x.nickname || x.id)}${roleBadges(x)}</span>${x.biography ? `<span class="fl-bio">${esc(String(x.biography).replace(/\s+/g, " ").slice(0, 80))}</span>` : ""}<span class="fl-tags">${followerTags(x)}${extraUserTags(x)}</span></span>`, "fl-main")}
            <a class="fl-btn" href="https://yay.space/user/${esc(x.id)}" target="_blank" rel="noopener" aria-label="Yay! でフォロー">${ic("user-plus")}<span>フォロー</span></a></li>`;
        }).join("")}</ul>
        ${items.length || !L.items.length || !L.done ? "" : `<div class="ys-empty">条件に合うフォロワーはいません。</div>`}
        ${emptyMsg(L, "フォロワーはいません。")}
        ${more("followers", L, "人")}
        <p class="fl-note">「フォロー」は Yay! のプロフィールを開きます（このページではフォローできません）。</p>
      </div></div>`;
    if (first) { box.classList.remove("hidden"); document.body.classList.add("up-noscroll"); box.querySelector("[data-close-popup]").focus({ preventScroll: true }); }
    const nb = box.querySelector(".yay-modal-body"); nb.scrollTop = keepScroll;
    if (fk) { const n = box.querySelector(`[data-key="${fk}"]`); if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(caret, caret); } catch { /* */ } } }
    const id = S.id;
    if (!L.started && !L.done) { loadMore(L, "followers", id); return; }
    if (popupObserver) popupObserver.disconnect();
    popupObserver = "IntersectionObserver" in window ? new IntersectionObserver(onSeen, { root: nb, rootMargin: "0px 0px 60px 0px" }) : null;
    watch(nb, popupObserver, { followers: () => loadMore(L, "followers", id) });
    if (!popupObserver) nb.onscroll = () => { if (nb.scrollTop + nb.clientHeight >= nb.scrollHeight - 60) loadMore(L, "followers", id); };
  }
  function closePopup() { navDepth > 0 ? (navDepth--, history.back()) : go(`user/${S.id}`, true); }
  $("upModal").addEventListener("click", e => {
    if (e.target === e.currentTarget || e.target.closest("[data-close-popup]")) return closePopup();
    const chip = e.target.closest("[data-fl-chip]");
    if (chip) { const v = S.view.followers; v[chip.dataset.flChip] = !v[chip.dataset.flChip]; return renderFollowers(); }
    if (e.target.closest("[data-retry-list]")) { S.lists.followers.error = null; loadMore(S.lists.followers, "followers", S.id); }
  });
  $("upModal").addEventListener("compositionend", e => { const k = e.target.dataset.fl; if (!k) return; S.view.followers[k] = e.target.value; renderFollowers(); });
  $("upModal").addEventListener("input", e => {
    if (e.isComposing) return;
    const k = e.target.dataset.fl; if (!k) return;
    S.view.followers[k] = e.target.value; renderFollowers();
  });

  /* ---- floating call card (bottom left) ---- */
  let callMini = false;
  function renderCall() {
    const box = $("upCall"), post = view.kind === "user" && S.core?.call;
    if (!post) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    const c = post.conference_call || {}, users = c.conference_call_users || [];
    const roles = new Map((c.conference_call_user_roles || []).map(r => [String(r.user_id), r.role]));
    box.classList.remove("hidden");
    box.classList.toggle("open", callOpen && !callMini);
    box.classList.toggle("mini", callMini);
    box.innerHTML = `<button class="cf-mini-btn" type="button" data-cf="restore" aria-label="通話の表示を戻す">${ICON.phone}</button>
      <button class="cf-head" type="button" data-cf="toggle" aria-expanded="${callOpen}">
        <span class="cf-icon">${ICON.phone}</span>
        <span class="cf-copy"><small>${isVideo(c) ? "ビデオ通話中" : "通話中"} · ${ago(post.created_at)}に開始（${durText(Date.now() / 1000 - Number(post.created_at || 0))}経過）</small><b>${esc(post.text || "（タイトルなし）")}</b>
          <span class="cf-faces">${users.slice(0, 6).map(x => avatarOf(x) ? `<img src="${esc(avatarOf(x))}" alt="">` : "<i></i>").join("")}<span>${num(c.conference_call_users_count)}人${c.max_participants ? ` / ${num(c.max_participants)}` : ""}</span></span></span>
        <span class="cf-caret">${ic("chevron-up")}</span></button>
      <button class="cf-min" type="button" data-cf="mini" aria-label="小さくする">${ic("minus")}</button>
      <div class="cf-body">
        <div class="cf-meta"><span>種類 <b>${isVideo(c) ? "ビデオ" : "音声"}</b></span><span>参加できる人 <b>${esc({ anyone: "全員", users: "全員", followers: "フォロワー", mutual_follows: "相互フォロー" }[c.joinable_by] || c.joinable_by || "—")}</b></span>${c.anonymous_call_users_count ? `<span>匿名 <b>${num(c.anonymous_call_users_count)}</b></span>` : ""}${c.game ? `<span>ゲーム <b>${esc(c.game.title || c.game.name || "")}</b></span>` : ""}</div>
        <ul class="cf-people">${users.map(x => `<li>${rlink(`user/${x.id}`, `${avatarOf(x) ? `<img src="${esc(avatarOf(x))}" alt="" loading="lazy">` : "<i></i>"}<span>${esc(x.nickname || x.id)}</span>${roleBadges(x, roles.get(String(x.id)) === "host" ? [["host", "枠主", "この通話の枠主"]] : roles.get(String(x.id)) === "moderator" ? [["mod", "サブ枠主", "この通話のサブ枠主"]] : [])}`)}</li>`).join("")}</ul>
        <div class="cf-actions"><a class="ys-btn" href="https://yay.space/post/${esc(post.id)}" target="_blank" rel="noopener">${ic("external")}Yay! で開く</a><button class="ys-btn" type="button" data-cf="refresh">更新</button></div>
      </div>`;
  }
  $("upCall").addEventListener("click", async e => {
    const b = e.target.closest("[data-cf]"); if (!b) return;
    const a = b.dataset.cf;
    if (a === "toggle") callOpen = !callOpen;
    else if (a === "mini") { callMini = true; callOpen = false; }
    else if (a === "restore") callMini = false;
    else if (a === "refresh") {
      b.disabled = true; b.textContent = "確認中…";
      try { S.core.call = (await getJson(`/v1/posts/active_call?user_id=${S.id}`)).post; } catch { /* keep the old value */ }
      if (view.kind === "user") { app.innerHTML = ""; renderUser(); }
    }
    renderCall();
  });

  /* ---- letters (yay.space calls them reviews) ---- */
  function tabReviews(u) {
    const L = S.lists.reviews, v = S.view.reviews;
    let items = L.items.slice();
    if (v.q) { const q = v.q.toLowerCase(); items = items.filter(r => `${r.comment} ${r.reviewer?.nickname}`.toLowerCase().includes(q)); }
    const counts = new Map(); for (const r of L.items) if (r.reviewer) { const c = counts.get(r.reviewer.id) || { user: r.reviewer, n: 0 }; c.n++; counts.set(r.reviewer.id, c); }
    if (v.sort === "sender") items.sort((a, b) => (counts.get(b.reviewer?.id)?.n || 0) - (counts.get(a.reviewer?.id)?.n || 0) || Number(b.id) - Number(a.id));
    else items.sort(v.sort === "old" ? by(r => Number(r.created_at), 1) : by(r => Number(r.created_at)));
    const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    const pinned = v.q || v.sort !== "new" ? [] : (L.extra?.pinned || []);
    return `${toolbar("reviews", [["new", "新しい順"], ["old", "古い順"], ["sender", "送った数が多い人順"]])}
      <div class="ys-stats"><span>レター <b>${num(u.reviews_count)}</b>通中 <b>${num(L.items.length)}</b>通を表示</span>${top.length ? "<span>よく送ってくれる人（表示した分）:</span>" : ""}</div>
      ${top.length ? `<div class="ys-top">${top.map(t => userChip(t.user, `<b>${num(t.n)}</b>`)).join("")}</div>` : ""}
      ${pinned.map(r => letterCard(r, true)).join("")}${items.map(r => letterCard(r)).join("")}${emptyMsg(L, "まだレターがありません。")}${more("reviews", L, "通")}`;
  }
  function letterCard(r, pinned = false) {
    return `<article class="ys-letter${pinned ? " pinned" : ""}"><div class="ys-letter-top">${userChip(r.reviewer)}<span class="ys-letter-time" title="${esc(fmtDate(r.created_at))}">${pinned ? `<span class="ys-meta-ic">${ic("pin")}ピン留め</span> · ` : ""}${ago(r.created_at)}</span></div><p class="ys-letter-text">${linkify(r.comment || "")}</p></article>`;
  }

  /* ---- groups ---- */
  function tabGroups() {
    const L = S.lists.groups, v = S.view.groups;
    const items = L.items.slice().sort({ order: () => 0, members: by(g => Number(g.groups_users_count || 0)), posts: by(g => Number(g.posts_count || 0)), views: by(g => Number(g.views_count || 0)), updated: by(g => Number(g.updated_at || 0)), name: (a, b) => String(a.topic).localeCompare(String(b.topic), "ja") }[v.sort]);
    return `${toolbar("groups", [["order", "参加順"], ["members", "メンバーが多い順"], ["posts", "投稿が多い順"], ["views", "閲覧数が多い順"], ["updated", "最近更新された順"], ["name", "名前順"]])}
      ${items.map(groupCard).join("")}${emptyMsg(L, "参加しているサークルはありません（または非公開です）。")}${more("groups", L, "件")}`;
  }

  /* ---- about ---- */
  function tabAbout(u) {
    const sp = span(u.created_at), tlErr = S.core.timelineError;
    const perDay = sp && sp.days ? (Number(u.posts_count || 0) / Math.max(1, sp.days)).toFixed(2) : null;
    const rows = [
      ["ユーザーID", u.id], ["登録日時", u.created_at ? fmtDate(u.created_at) : (tlErr ? "投稿が非公開のため取得できません" : "—")],
      ["利用期間", sp ? `${sp.text}（${num(sp.days)}日）` : "—"],
      ["最終ログイン", u.last_loggedin_at ? `${fmtDate(u.last_loggedin_at)}（${ago(u.last_loggedin_at)}）` : "—"],
      ["オンライン状態", { online: "オンライン", offline: "オフライン", hidden: "非表示" }[u.online_status] || u.online_status || "—"],
      ["通話", S.core.call ? `通話中（${num(S.core.call.conference_call?.conference_call_users_count)}人）` : "通話していません"],
      ["連続ログイン", u.login_streak_count != null ? `${num(u.login_streak_count)}日` : "—"],
      ["フォロワー", `${num(u.followers_count)}人`], ["フォロー中", u.followings_count != null ? `${num(u.followings_count)}人（一覧はログインが必要なため表示できません）` : "—"],
      ["投稿", `${num(u.posts_count)}件${perDay != null ? `（1日あたり ${perDay}件）` : ""}`], ["メディア", `${num(u.media_count)}件`],
      ["レター", `${num(u.reviews_count)}通`], ["サークル", `${num(u.groups_users_count)}件`], ["受け取ったギフト", num(u.total_gifts_received_count)],
      ["性別", { "-1": "未設定", 0: "男性", 1: "女性" }[u.gender] || "—"], ["地域", u.prefecture || "—"], ["国", u.country_code || "—"],
      ["世代", u.generation != null ? `第${u.generation}世代` : "—"]
    ];
    return `<div class="ys-pad"><h2>${ic("user")}アカウント</h2><dl class="ys-about">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
      <div class="ys-pad"><h2>${ic("image")}画像</h2><div class="ys-images">${imgTile("プロフィール画像", u.profile_icon)}${imgTile("バナー", u.cover_image, true)}${u.frame ? imgTile("フレーム", u.frame) : ""}</div></div>`;
  }
  function imgTile(label, url, wide) {
    const u = img(url);
    return `<figure class="ys-img-tile${wide ? " wide" : ""}">${u ? `<button type="button" data-zoom="${esc(u)}"><img src="${esc(u)}" alt="${esc(label)}" loading="lazy"></button>` : `<div class="ys-img-none">なし</div>`}
      <figcaption>${esc(label)}${u ? ` · <a href="${esc(u)}" target="_blank" rel="noopener">原寸</a>` : ""}</figcaption></figure>`;
  }

  /* ---- all data ---- */
  const FIELDS = {
    id: ["基本", "ユーザーID"], nickname: ["基本", "ニックネーム"], username: ["基本", "ユーザー名"], biography: ["基本", "自己紹介"], title: ["基本", "称号"],
    gender: ["基本", "性別"], prefecture: ["基本", "地域"], country_code: ["基本", "国"], generation: ["基本", "世代"],
    followers_count: ["数値", "フォロワー数"], followings_count: ["数値", "フォロー数"], posts_count: ["数値", "投稿数"], media_count: ["数値", "メディア数"],
    reviews_count: ["数値", "レター数"], groups_users_count: ["数値", "参加サークル数"], total_gifts_received_count: ["数値", "受け取ったギフト数"], login_streak_count: ["数値", "連続ログイン日数"],
    created_at: ["日時", "登録日時"], last_loggedin_at: ["日時", "最終ログイン"],
    online_status: ["状態", "オンライン状態"], is_online: ["状態", "オンライン"], is_private: ["状態", "鍵アカウント"], age_verified: ["状態", "年齢確認"],
    mobile_verified: ["状態", "電話番号認証"], vip: ["状態", "VIP"], hide_vip: ["状態", "VIPを非表示"], new_user: ["状態", "新規ユーザー"],
    dangerous_user: ["状態", "注意ユーザー"], recently_kenta: ["状態", "最近の検閲 (recently_kenta)"], interests_selected: ["状態", "興味を選択済み"],
    profile_icon: ["画像", "プロフィール画像"], profile_icon_thumbnail: ["画像", "プロフィール画像（小）"], cover_image: ["画像", "バナー"],
    cover_image_thumbnail: ["画像", "バナー（小）"], frame: ["画像", "フレーム"], frame_thumbnail: ["画像", "フレーム（小）"],
    mutual_chat: ["チャット・レター設定", "相互チャット"], chat_request: ["チャット・レター設定", "チャットリクエスト"], chat_required_phone_verification: ["チャット・レター設定", "チャットに電話認証が必要"],
    age_restricted_on_review: ["チャット・レター設定", "レターの年齢制限"], following_restricted_on_review: ["チャット・レター設定", "レターのフォロー制限"], restricted_review_by: ["チャット・レター設定", "レターの制限"]
  };
  const CAT_ORDER = ["基本", "数値", "日時", "状態", "画像", "チャット・レター設定", "その他"];
  // API values that are English words, shown in Japanese (the original value stays visible in small text)
  const VALUE_JA = {
    post_type: { text: "テキスト", image: "画像", video: "動画", call: "通話", repost: "アゲ", survey: "アンケート", shareable_url: "URLの共有", share: "シェア" },
    call_type: { voice: "音声通話", video: "ビデオ通話", vdo: "ビデオ通話" },
    online_status: { online: "オンライン", offline: "オフライン", hidden: "非表示" },
    joinable_by: { anyone: "全員", users: "全員", followers: "フォロワー", mutual_follows: "相互フォロー", invite_only: "招待のみ" },
    allow_thread_creation_by: { member: "誰でもスレッド作成可能", moderator: "管理人と副管理人のみ", owner: "管理人のみ" },
    title: { admin: "運営", official: "公式", other: "その他" },
    role: { host: "枠主", moderator: "サブ枠主", member: "メンバー" },
    mode: { call: "通話", video: "ビデオ", game: "ゲーム" },
    language: { ja: "日本語", en: "英語", zh: "中国語", ko: "韓国語", es: "スペイン語", pt: "ポルトガル語", fr: "フランス語", th: "タイ語", id: "インドネシア語", und: "不明" },
    country_code: { JP: "日本", US: "アメリカ", KR: "韓国", CN: "中国", TW: "台湾", PE: "ペルー" },
    type: { user: "ユーザー", group: "サークル", hashtag: "ハッシュタグ", thread: "スレッド" }
  };
  function fieldValue(k, v) {
    if (v === null || v === undefined || v === "") return `<span class="up-muted">なし</span>`;
    if (/token/i.test(k)) return `<span class="up-muted">（安全のため表示しません）</span>`;
    if (typeof v === "string" && VALUE_JA[k]?.[v]) return `${esc(VALUE_JA[k][v])} <span class="up-muted">（${esc(v)}）</span>`;
    if (typeof v === "boolean") return v ? `<span class="up-yes">はい</span>` : `<span class="up-no">いいえ</span>`;
    if (/_at$/.test(k)) return `${esc(fmtDate(v))} <span class="up-muted">（${ago(v)}・${esc(v)}）</span>`;
    if (k === "gender") return esc({ "-1": "未設定", 0: "男性", 1: "女性" }[v] ?? v);
    if (typeof v === "string" && /^https?:\/\/.*\.(jpe?g|png|gif|webp)(\?|$)/i.test(v)) return `<button type="button" class="ys-data-img" data-zoom="${esc(v)}"><img src="${esc(v)}" alt="" loading="lazy"></button> <a href="${esc(v)}" target="_blank" rel="noopener">開く</a>`;
    if (typeof v === "number") return (k === "id" || /_id$/.test(k)) ? esc(v) : num(v);
    if (typeof v === "object") return `<code>${esc(JSON.stringify(v))}</code>`;
    return `<span class="ys-pre">${linkify(v)}</span>`;
  }
  function tabData(u) {
    const v = S.view.data;
    let rows = Object.keys(u).map(k => ({ k, cat: FIELDS[k]?.[0] || "その他", label: FIELDS[k]?.[1] || k, v: u[k] }));
    if (v.q) { const q = v.q.toLowerCase(); rows = rows.filter(r => `${r.k} ${r.label} ${typeof r.v === "object" ? JSON.stringify(r.v) : r.v}`.toLowerCase().includes(q)); }
    const order = Object.keys(FIELDS);
    const sorters = { cat: (a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || ((order.indexOf(a.k) + 1 || 999) - (order.indexOf(b.k) + 1 || 999)) || a.k.localeCompare(b.k), key: (a, b) => a.k.localeCompare(b.k), label: (a, b) => a.label.localeCompare(b.label, "ja") };
    rows.sort(sorters[v.sort] || sorters.cat);
    let body = "";
    if (v.sort === "cat") {
      for (const cat of CAT_ORDER) { const rs = rows.filter(r => r.cat === cat); if (rs.length) body += `<tr class="ys-cat"><th colspan="3">${cat}</th></tr>${rs.map(dataRow).join("")}`; }
    } else body = rows.map(dataRow).join("");
    const raw = JSON.parse(JSON.stringify({ profile: S.core.user, timeline_user: S.core.tlUser, active_call: S.core.call }, (k, v) => (/token/i.test(k) && v ? "（安全のため表示しません）" : v)));
    return `${toolbar("data", [["cat", "カテゴリ順"], ["key", "項目キー順（ABC順）"], ["label", "項目名順"]])}
      <div class="ys-stats"><span>取得できた <b>${num(Object.keys(u).length)}</b> 項目をすべて表示しています</span></div>
      <div class="ys-table-wrap"><table class="ys-table"><thead><tr><th>項目</th><th>キー</th><th>値</th></tr></thead><tbody>${body || `<tr><td colspan="3" class="up-muted">該当する項目はありません。</td></tr>`}</tbody></table></div>
      <details class="ys-raw"><summary>取得したJSONをそのまま見る</summary><div class="ys-raw-actions"><button class="ys-btn" type="button" data-copyjson>${ic("copy")}JSONをコピー</button></div><pre>${esc(JSON.stringify(raw, null, 2))}</pre></details>`;
  }
  const dataRow = r => `<tr><th>${esc(r.label)}</th><td><code>${esc(r.k)}</code></td><td>${fieldValue(r.k, r.v)}</td></tr>`;

  /* ---------------- post page & conversation page ---------------- */
  function backBar() {
    return `<div class="ys-back"><button type="button" data-back><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>もどる</button></div>`;
  }
  let pageMedia = [];
  function renderPage() {
    if (view.kind === "post") return renderPostPage(view.id);
    if (view.kind === "conversation") return renderConversation(view.id);
    if (view.kind === "group") return renderGroup(view.id, view.tab, view.extra);
    if (view.kind === "groups") return renderGroups(view.mode, view.val);
    if (view.kind === "timeline") return renderTimeline(view.sub, view.tag);
    if (view.kind === "search") return renderSearch(view.type, view.q);
    if (view.kind === "users") return renderUsers(view.sub, view.mode);
  }
  function renderPostPage(id) {
    let st = posts.get(id);
    if (!st) {
      st = { post: null, err: null, likers: list() };
      posts.set(id, st);
      getJson(`/v2/posts/${id}`).then(d => { st.post = d.post; }, e => { st.err = e; }).finally(() => { if (view.kind === "post" && view.id === id) renderPage(); });
    }
    const p = st.post;
    document.title = p ? `${p.user?.nickname || ""}の投稿 - Yay! ユーザー情報` : "投稿 - Yay! ユーザー情報";
    const crumb = crumbs(p?.user ? [[p.user.nickname, `user/${p.user.id}`], ["投稿"]] : [["投稿"]]);
    if (st.err) { app.innerHTML = `${crumb}<section class="ys-box">${backBar()}<div class="ys-empty">${st.err.notFound ? "この投稿は見つからないか、フォロワー限定のため表示できません。" : esc(st.err.message)}</div></section>`; return; }
    if (!p) { app.innerHTML = `${crumb}<section class="ys-box">${backBar()}<div class="ys-loading-card"><span class="ys-spinner"></span><p>読み込んでいます…</p></div></section>`; return; }
    pageMedia = mediaOf(p);
    if (!Number(p.likes_count)) st.likers.done = true;
    const L = st.likers, replies = Number(p.in_reply_to_post_count || 0);
    app.innerHTML = `${crumb}
      <section class="ys-box ys-page">${backBar()}${p.in_reply_to_post ? `<div class="ys-parent"><div class="ys-parent-label">${ICON.reply}返信先の投稿</div>${sharedPost(p.in_reply_to_post, "返信先の投稿を見る")}</div>` : ""}${postCard(p, { big: true })}
        <div class="ys-post-facts"><span>${fmtDate(p.created_at)}</span>${p.edited_at ? `<span>編集 ${fmtDate(p.edited_at)}</span>` : ""}<span>いいね <b>${num(p.likes_count)}</b></span><span>返信 <b>${num(replies)}</b></span>${Number(p.reposts_count) ? `<span>アゲ <b>${num(p.reposts_count)}</b></span>` : ""}${Number(p.total_gifts_count) ? `<span>ギフト <b>${num(p.total_gifts_count)}</b></span>` : ""}
          <span class="ys-facts-actions"><button class="ys-btn ys-btn-sm" type="button" data-copy="${esc(PATH_MODE ? `${BASE}?post/${p.id}` : `${location.href.split("#")[0]}#/post/${p.id}`)}">${ic("copy")}URLをコピー</button><a class="ys-btn ys-btn-sm" href="https://yay.space/post/${esc(p.id)}" target="_blank" rel="noopener">${ic("external")}Yay! で開く</a></span></div>
        ${p.conversation_id && (replies || p.in_reply_to) ? `<div class="ys-conv-link">${rlink(`conversation/${p.conversation_id}`, `${ICON.reply}<span>${replies ? `${num(replies)}件の返信を含む会話を見る` : "この投稿がある会話を見る"}</span><b>${ic("chevron-right")}</b>`)}</div>` : ""}
      </section>
      ${p.group_id ? `<section class="ys-box ys-conv-link">${rlink(`group/${p.group_id}`, `<span>この投稿があるサークルを見る</span><b>${ic("chevron-right")}</b>`)}</section>` : ""}
      <section class="ys-box ys-likers">
        <h2 class="ys-box-title">${ic("heart")}いいね！してくれた人たち <small>${num(p.likes_count)}</small></h2>
        <ul class="fl-list">${L.items.map(x => {
          const a = avatarOf(x);
          return `<li class="fl-row">${rlink(`user/${x.id}`, `<span class="fl-ava sm">${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(x)}</span><span class="fl-copy"><span class="fl-name">${esc(x.nickname || x.id)}${roleBadges(x)}</span><span class="fl-tags">${followerTags(x)}${extraUserTags(x)}</span></span>`, "fl-main")}<a class="fl-btn" href="https://yay.space/user/${esc(x.id)}" target="_blank" rel="noopener" aria-label="Yay! でフォロー">${ic("user-plus")}<span>フォロー</span></a></li>`;
        }).join("")}</ul>
        ${emptyMsg(L, "まだ誰もいいねしていません。")}${more("likers", L, "人")}
      </section>
      ${Number(p.reposts_count) ? `<section class="ys-box ys-likers"><h2 class="ys-box-title">${ic("repost")}アゲしてくれた人 <small>${num(p.reposts_count)}</small></h2>${feedBlock("reposts", feed(`reposts:${id}`), x => postCard(x), "件", "表示できるアゲはありません。")}</section>` : ""}
      <section class="ys-box">${allData(p, "この投稿のすべてのデータ")}</section>`;
    startFeeds([["likers", L, "likers", id], ...(Number(p.reposts_count) ? [["reposts", feed(`reposts:${id}`), "reposts", id]] : [])]);
  }
  function renderConversation(cid) {
    let L = convs.get(cid);
    if (!L) { L = list(); convs.set(cid, L); }
    const root = L.items[0];
    document.title = root ? `${root.user?.nickname || ""}の会話 - Yay! ユーザー情報` : "会話 - Yay! ユーザー情報";
    const crumb = crumbs(root?.user ? [[root.user.nickname, `user/${root.user.id}`], ["会話"]] : [["会話"]]);
    // build the reply tree: each post sits under the post it answers (depth = how many replies deep)
    const byId = new Map(L.items.map(p => [String(p.id), p])), kids = new Map(), tops = [];
    for (const p of L.items) {
      const parent = p.in_reply_to != null && byId.has(String(p.in_reply_to)) ? String(p.in_reply_to) : null;
      if (parent) { if (!kids.has(parent)) kids.set(parent, []); kids.get(parent).push(p); } else tops.push(p);
    }
    const ordered = [];
    const walk = (p, d) => { ordered.push([p, d]); for (const k of kids.get(String(p.id)) || []) walk(k, d + 1); };
    tops.forEach(p => walk(p, 0));
    pageMedia = L.items.flatMap(mediaOf);
    const first = ordered.length ? postCard(ordered[0][0], { inThread: true, big: true }) : "";
    const rest = ordered.slice(1).map(([p, d]) => {
      const parent = byId.get(String(p.in_reply_to));
      const name = parent?.user ? rlink(`user/${parent.user.id}`, esc(parent.user.nickname)) : (p.in_reply_to_post?.user ? esc(p.in_reply_to_post.user.nickname) : "");
      return postCard(p, { inThread: true, depth: Math.max(0, d - 1), replyName: name });
    }).join("");
    app.innerHTML = `${crumb}
      <section class="ys-box ys-page">${backBar()}${first || (L.error ? "" : L.done ? `<div class="ys-empty">この会話は見つからないか、非公開です。</div>` : `<div class="ys-loading-card"><span class="ys-spinner"></span><p>読み込んでいます…</p></div>`)}
        ${root ? `<div class="ys-post-facts"><span>${num(L.items.length)}件の投稿</span><a href="https://yay.space/conversation/${esc(cid)}" target="_blank" rel="noopener">${ic("external")}Yay! で開く</a></div>` : ""}
      </section>
      ${ordered.length > 1 || !L.done ? `<section class="ys-box ys-thread">${rest}${more("thread", L, "件")}</section>` : L.error ? `<section class="ys-box">${more("thread", L, "件")}</section>` : ""}`;
    if (!L.started && !L.done) { loadMore(L, "thread", cid); return; }
    watch(app, pageObserver, { thread: () => loadMore(L, "thread", cid) });
  }

  /* ================= more yay.space pages =================
   *   group/{id}[/album|members|related|search/{q}|info|data]   circle page (yay.space/group/{id})
   *   groups[/category/{id}|/search/{q}]                         circle list (yay.space/groups/all)
   *   timeline | timeline/calls | timeline/hashtag/{tag}         open timeline, live calls, hashtag
   *   search/{posts|users|groups}/{q}                            search (yay.space/search/…)
   *   users/{ranking|ranking_all|discover|hima}                  user lists
   * Every page also offers "すべてのデータ": every field the API returned, sorted, even the ones yay.space never shows. */
  const feeds = new Map();
  const feed = key => { if (!feeds.has(key)) feeds.set(key, list()); return feeds.get(key); };
  const groupsInfo = new Map(); // id → { info, err }
  let groupCats = null;
  const enc = encodeURIComponent;
  function nextFrom(L, d, ps, key = "next_page_value") {
    const seen = new Set(L.items.map(p => p.id)), fresh = ps.filter(p => p && !seen.has(p.id));
    L.items.push(...fresh);
    const next = d[key] != null ? String(d[key]) : (ps.length ? String(ps[ps.length - 1].id) : null);
    if (!fresh.length || !next || next === String(L.cursor)) L.done = true; else L.cursor = next;
  }
  Object.assign(PAGERS, {
    async groupPosts(L, gid) {
      const d = await getJson(`/v2/posts/group_timeline?group_id=${gid}&number=50${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      if (!L.extra) L.extra = { pinned: d.pinned_posts || (d.pinned_post ? [d.pinned_post] : []) };
      addPosts(L, d.posts || []);
    },
    async groupAlbum(L, gid) {
      const d = await getJson(`/v2/posts/group_timeline?group_id=${gid}&post_type=media&number=50${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      addPosts(L, d.posts || []);
    },
    async groupMembers(L, ctx) {
      const [gid, mode] = ctx.split("|");
      const d = await getJson(`/v2/groups/${gid}/members?number=50${mode ? `&mode=${mode}` : ""}${L.cursor ? `&from_id=${L.cursor}` : ""}`);
      const rows = (d.group_users || []).filter(g => g && g.user), seen = new Set(L.items.map(g => g.user.id));
      const fresh = rows.filter(g => !seen.has(g.user.id));
      L.items.push(...fresh);
      const last = rows[rows.length - 1]?.user?.id;
      if (!fresh.length || !last || String(last) === String(L.cursor)) L.done = true; else L.cursor = last;
    },
    async groupRelated(L, gid) {
      const d = await getJson(`/v1/groups/${gid}/related?number=50${L.cursor ? `&from=${enc(L.cursor)}` : ""}`);
      nextFrom(L, d, d.groups || []);
    },
    async groupSearch(L, ctx) {
      const i = ctx.indexOf("|"), gid = ctx.slice(0, i), q = ctx.slice(i + 1);
      const d = await getJson(`/v2/groups/${gid}/posts/search?keyword=${enc(q)}&number=50${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      nextFrom(L, d, d.posts || []);
    },
    async groupList(L, ctx) {
      const [kind, val] = [ctx.slice(0, ctx.indexOf("|")), ctx.slice(ctx.indexOf("|") + 1)];
      const param = kind === "cat" ? `&group_category_id=${enc(val)}` : kind === "q" ? `&keyword=${enc(val)}` : "";
      const d = await getJson(`/v2/groups?number=50${param}${L.cursor ? `&from_timestamp=${L.cursor}` : ""}`);
      const gs = d.groups || [], seen = new Set(L.items.map(g => g.id)), fresh = gs.filter(g => !seen.has(g.id));
      L.items.push(...fresh);
      const last = gs[gs.length - 1]?.updated_at;
      if (!fresh.length || !last || String(last) === String(L.cursor)) L.done = true; else L.cursor = last;
    },
    async publicTimeline(L) {
      const d = await getJson(`/v2/posts/timeline?number=50${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      nextFrom(L, d, d.posts || []);
    },
    async callTimeline(L) {
      const d = await getJson(`/v2/posts/call_timeline?number=50${L.cursor ? `&from_timestamp=${L.cursor}` : ""}`);
      const ps = d.posts || [], seen = new Set(L.items.map(p => p.id)), fresh = ps.filter(p => !seen.has(p.id));
      L.items.push(...fresh);
      const next = d.next_page_value != null ? String(d.next_page_value) : null;
      if (!fresh.length || !next || next === String(L.cursor)) L.done = true; else L.cursor = next;
    },
    async hashtag(L, tag) {
      const d = await getJson(`/v2/posts/tags/${enc(tag)}?number=50${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      nextFrom(L, d, d.posts || [], "_none");
    },
    async searchPosts(L, q) {
      const d = await getJson(`/v2/posts/search?keyword=${enc(q)}&number=50${searchOpts.media ? "&only_media=true" : ""}${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      const foundPosts = d.posts || [];

      // Check only the first page: show the phrase badge only when all 50 posts
      // returned for the initial search are reported.
      if (!L.items.length && !L.cursor) {
        L.searchAllReported = foundPosts.length === 50 &&
          foundPosts.every(p => Number(p?.reported_count) > 0);
      }

      nextFrom(L, d, foundPosts);
    },
    async searchUsers(L, q) {
      const d = await getJson(`/v1/web/users/search?${searchOpts.scope === "biography" ? "biography" : "nickname"}=${enc(q)}&number=100${searchOpts.noGomi ? "&not_recent_gomimushi=true" : ""}${L.cursor ? `&from_id=${L.cursor}` : ""}`);
      nextFrom(L, d, d.users || [], "_none");
    },
    async searchGroups(L, q) { return PAGERS.groupList(L, `q|${q}`); },
    async ranking(L, mode) {
      const d = await getJson(`/v1/web/users/ranking?mode=${enc(mode)}`);
      L.items = d.users || []; L.done = true;
    },
    async discover(L) {
      const d = await getJson(`/v1/web/users/discover?number=100`);
      L.items = d.users || []; L.done = true;
    },
    async hima(L) {
      const d = await getJson(`/v1/web/users/hima_users?number=50${L.cursor ? `&from_id=${L.cursor}` : ""}`);
      const rows = d.hima_users || [], seen = new Set(L.items.map(u => u.id));
      const fresh = rows.filter(r => r.user && !seen.has(r.user.id)).map(r => ({ ...r.user, _hima_id: r.id }));
      L.items.push(...fresh);
      const last = rows[rows.length - 1]?.id;
      if (!fresh.length || !last || String(last) === String(L.cursor)) L.done = true; else L.cursor = last;
    },
    async reposts(L, pid) {
      const d = await getJson(`/v2/posts/${pid}/reposts?number=50${L.cursor ? `&from_post_id=${L.cursor}` : ""}`);
      nextFrom(L, d, d.posts || [], "_none");
    }
  });
  // a page section that lists a feed and loads its next page at the bottom
  function feedBlock(name, L, rowFn, unit, empty) {
    return `${L.items.map(rowFn).join("")}${emptyMsg(L, empty)}${more(name, L, unit)}`;
  }
  function startFeeds(pairs) { // pairs: [name, L, pagerKind, ctx]
    const loaders = {};
    for (const [name, L, kind, ctx] of pairs) {
      if (!L.started && !L.done) { loadMore(L, kind, ctx); return; }
      loaders[name] = () => loadMore(L, kind, ctx);
    }
    watch(app, pageObserver, loaders);
  }

  /* ---- generic "every field" table ---- */
  const LABELS = Object.assign({}, ...Object.entries(FIELDS).map(([k, v]) => ({ [k]: v[1] })), {
    text: "本文", post_type: "投稿の種類", color: "文字色", font_size: "文字の大きさ", likes_count: "いいね数", reposts_count: "アゲされた数", shareable: "アゲ元", shareable_url: "共有URL",
    in_reply_to_post_count: "返信数", total_gifts_count: "ギフト数", reported_count: "通報された回数", updated_at: "更新日時", edited_at: "編集日時",
    repostable: "アゲできる", highlighted: "ハイライト", hidden: "非表示", thread_id: "スレッドID", group_id: "サークルID", conversation_id: "会話ID",
    in_reply_to: "返信先の投稿ID", language: "言語", message_tags: "メンション・タグ", mentions: "メンションされた人", attachment: "画像1", videos: "動画",
    shared_url: "共有URL", survey: "アンケート", tag: "タグ", gifts_count: "ギフトの内訳", conference_call: "通話",
    topic: "サークル名", description: "説明", guidelines: "ルール", user_id: "オーナーのユーザーID", groups_users_count: "メンバー数", threads_count: "スレッド数",
    highlighted_count: "ハイライト数", views_count: "閲覧数", related_count: "関連サークル数", place: "場所", secret: "シークレット",
    only_verified_age: "年齢確認済みの人だけ", only_mobile_verified: "電話番号認証済みの人だけ", generation_groups_limit: "世代制限",
    call_timeline_display: "通話タイムラインに表示", safe_mode: "セーフモード", allow_thread_creation_by: "スレッドを作れる人",
    allow_members_to_post_image_and_video: "メンバーの画像・動画投稿", allow_members_to_post_url: "メンバーのURL投稿", hide_reported_posts: "通報された投稿を隠す",
    hide_conference_call: "通話を隠す", allow_ownership_transfer: "オーナー譲渡を許可", hide_from_game_eight: "GameEightに載せない",
    group_category_id: "カテゴリID", sub_category_id: "サブカテゴリID", homepage: "ホームページ", pending_transfer_id: "オーナー譲渡待ち",
    pending_deputize_ids: "副管理人の任命待ち", group_icon: "サークルのアイコン", group_icon_thumbnail: "アイコン（小）", owner: "オーナー",
    is_moderator: "モデレーター", banned: "追放済み", pending_transfer: "譲渡待ち", pending_deputize: "任命待ち", is_related: "関連済み",
    active: "通話中", call_type: "通話の種類", conference_call_users_count: "参加人数", max_participants: "最大人数", anonymous_call_users_count: "匿名の参加者",
    joinable_by: "参加できる人", server: "通話サーバー", mode: "モード", agora_channel: "通話チャンネル", locked: "ロック", open: "公開", game: "ゲーム", genre: "ジャンル",
    agora_token: "通話トークン", agora_token_2: "通話トークン2", conference_call_user_roles: "参加者の役割", conference_call_users: "参加者", post_id: "投稿ID",
    icon_url: "アイコン", video_url: "動画", thumbnail_url: "サムネイル", thumbnail_big_url: "サムネイル（大）", views_count: "再生回数", width: "幅", height: "高さ",
    bitrate: "ビットレート", completed: "処理完了", role: "役割", name: "名前", icon: "アイコン", url: "URL", ranking: "順位", user: "ユーザー", group: "サークル",
    comment: "本文", reviewer: "送った人", mutual_review: "相互レター", reported_count_review: "通報された回数", is_online: "オンライン", login_streak_count: "連続ログイン日数",
    followings_count: "フォロー数", last_id: "次のページ", next_page_value: "次のページ", pinned_post: "ピン留めの投稿", pinned_posts: "ピン留めの投稿"
  });
  // attachment_2 → 画像2, attachment_2_thumbnail → 画像2（小）, anything with "token" is never printed
  function labelOf(k) {
    const m = String(k).match(/^attachment(?:_(\d+))?(_thumbnail)?$/);
    if (m) return `画像${m[1] || 1}${m[2] ? "（小）" : ""}`;
    return LABELS[k] || k;
  }
  function flatten(o, prefix = "", out = []) {
    for (const [k, v] of Object.entries(o || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v) && prefix.split(".").length < 3) flatten(v, key, out);
      else out.push([key, k, v]);
    }
    return out;
  }
  function allData(obj, title = "すべてのデータ") {
    obj = JSON.parse(JSON.stringify(obj ?? {}, (k, v) => (/token/i.test(k) && v ? "（安全のため表示しません）" : v)));
    const rows = flatten(obj).sort((a, b) => a[0].localeCompare(b[0]));
    return `<details class="ys-raw"><summary>${esc(title)}（${num(rows.length)}項目）</summary>
      <div class="ys-table-wrap"><table class="ys-table"><thead><tr><th>項目</th><th>キー</th><th>値</th></tr></thead><tbody>
      ${rows.map(([path, k, v]) => `<tr><th>${esc(labelOf(k))}${path.includes(".") ? `<small class="up-muted"> ${esc(path.split(".").slice(0, -1).join("."))}</small>` : ""}</th><td><code>${esc(path)}</code></td><td>${Array.isArray(v) ? (v.length ? `<span class="up-muted">${num(v.length)}件</span> <code>${esc(JSON.stringify(v).slice(0, 600))}</code>` : `<span class="up-muted">なし</span>`) : fieldValue(k, v)}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="ys-raw-actions"><button class="ys-btn" type="button" data-copytext="${esc(JSON.stringify(obj))}">${ic("copy")}JSONをコピー</button></div>
      <pre>${esc(JSON.stringify(obj, null, 2))}</pre></details>`;
  }

  /* ---- sub navigation shared by the explore pages ---- */
  const NAV_ICON = {
    "": `<path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/>`,
    timeline: `<path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z"/>`,
    "timeline/calls": `<path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/>`,
    groups: `<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 13c-2.7 0-6 1.3-6 3.5V19h12v-2.5C14 14.3 10.7 13 8 13zm8 0c-.4 0-.8 0-1.3.1 1.4.9 2.3 2 2.3 3.4V19h5v-2.5c0-2.2-3.3-3.5-6-3.5z"/>`,
    "users/ranking/new": `<path d="M17 4V2H7v2H3v3a4 4 0 0 0 4 4h.4A5 5 0 0 0 11 13.9V17H8v3h8v-3h-3v-3.1A5 5 0 0 0 16.6 11h.4a4 4 0 0 0 4-4V4zM5 7V6h2v3a2 2 0 0 1-2-2zm14 0a2 2 0 0 1-2 2V6h2z"/>`,
    "users/discover": `<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z"/>`,
    "users/hima": `<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.5 2.1-.8 1.3L11 13V6h2z"/>`,
    "search/posts/": `<path d="M10.5 3a7.5 7.5 0 0 1 6 12l5 5-1.5 1.5-5-5A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/>`
  };
  const NAV = [["", "ホーム"], ["timeline", "タイムライン"], ["timeline/calls", "通話中"], ["groups", "サークル"], ["users/ranking/new", "ランキング"], ["users/discover", "おすすめ"], ["users/hima", "今ひま"], ["search/posts/", "検索"]];
  // the explore bar: icon + label tabs with yay.space's pink underline on the current one
  function subnav(active) {
    return `<nav class="ys-subnav" aria-label="さがす">${NAV.map(([r, l]) => rlink(r, `<svg viewBox="0 0 24 24" aria-hidden="true">${NAV_ICON[r]}</svg><span>${l}</span>`, `ys-subnav-a${r === active ? " active" : ""}`, r === active ? ' aria-current="page"' : "")).join("")}</nav>`;
  }

  /* ---- circle (group) ---- */
  const GROUP_TABS = [["", "投稿"], ["album", "アルバム"], ["members", "メンバー"], ["related", "関連サークル"], ["search", "サークル内検索"], ["info", "詳細"], ["data", "データ"]];
  function groupCard(g) {
    const icon = img(g.group_icon_thumbnail || g.group_icon);
    const flags = [g.is_private ? ["lock", "非公開"] : null, g.secret ? ["lock", "シークレット"] : null, g.only_verified_age ? ["ok", "年齢確認必須"] : null,
      g.only_mobile_verified ? ["", "電話認証必須"] : null, Number(g.generation_groups_limit) ? ["", `世代制限 ${g.generation_groups_limit}`] : null].filter(Boolean);
    return `<article class="ys-group">
      ${rlink(`group/${g.id}`, icon ? `<img class="ys-group-icon" src="${esc(icon)}" alt="" loading="lazy">` : `<span class="ys-group-icon">${esc(Array.from(String(g.topic || "?"))[0])}</span>`, "", ' tabindex="-1" aria-hidden="true"')}
      <div class="ys-group-body">
        <div class="ys-group-title">${rlink(`group/${g.id}`, esc(g.topic))}${TITLE_JA[g.title] ? `<span class="ys-ub ys-ub-${g.title}">${TITLE_JA[g.title]}</span>` : ""}${flags.map(([c, t]) => `<span class="ys-badge${c ? ` ys-badge-${c}` : ""}">${t}</span>`).join("")}${String(g.owner?.id || g.user_id) === String(S.id) && view.kind === "user" ? `<span class="ys-badge ys-badge-pink">管理人</span>` : ""}</div>
        ${g.description ? `<p class="ys-group-snip">${esc(String(g.description).replace(/\s+/g, " ").slice(0, 120))}</p>` : ""}
        <div class="ys-group-meta"><span>メンバー ${num(g.groups_users_count)}</span><span>投稿 ${num(g.posts_count)}</span>${g.views_count != null ? `<span>閲覧 ${num(g.views_count)}</span>` : ""}${g.threads_count ? `<span>スレッド ${num(g.threads_count)}</span>` : ""}${g.updated_at ? `<span>更新 ${ago(g.updated_at)}</span>` : ""}${g.owner ? `<span>管理人 ${rlink(`user/${g.owner.id}`, esc(g.owner.nickname))}${roleBadges(g.owner)}</span>` : ""}</div>
      </div></article>`;
  }
  async function ensureCats() {
    if (groupCats) return;
    groupCats = [];
    try { groupCats = (await getJson("/v1/groups/categories?number=100")).group_categories || []; } catch { /* the list still works without names */ }
    if (["groups", "group", "search"].includes(view.kind)) renderPage();
  }
  const catName = id => groupCats?.find(c => String(c.id) === String(id))?.name;
  function renderGroup(id, tab, extra) {
    let st = groupsInfo.get(id);
    if (!st) {
      st = { info: null, err: null }; groupsInfo.set(id, st);
      getJson(`/v1/groups/${id}`).then(d => { st.info = d.group; }, e => { st.err = e; }).finally(() => { if (view.kind === "group" && view.id === id) renderPage(); });
    }
    ensureCats();
    const g = st.info, label = GROUP_TABS.find(t => t[0] === tab)?.[1];
    if (g) remember({ type: "group", id: String(g.id), name: g.topic, img: img(g.group_icon_thumbnail || g.group_icon) });
    document.title = `${g?.topic || "サークル"}${tab ? `の${label}` : ""} - Yay! ユーザー情報`;
    const crumb = crumbs([["サークル", "groups"], [g?.topic || id, tab ? `group/${id}` : null], ...(tab ? [[label]] : [])]);
    if (st.err) { app.innerHTML = `${crumb}<section class="ys-box ys-empty">${st.err.notFound ? "このサークルは見つかりませんでした。" : esc(st.err.message)}</section>`; return; }
    if (!g) { app.innerHTML = `${crumb}<section class="ys-box ys-loading-card"><span class="ys-spinner"></span><p>読み込んでいます…</p></section>`; return; }
    // load the moderator list once so posts and members can be marked 管理人 / 副管理人
    const modsL = feed(`g:${id}:members:moderator`);
    if (!modsL.started && !modsL.done) loadMore(modsL, "groupMembers", `${id}|moderator`);
    circleCtx = { owner: g.user_id, mods: new Set(modsL.items.map(m => String(m.user.id))) };
    const cover = img(g.cover_image), icon = img(g.group_icon);
    const flags = [TITLE_JA[g.title] ? [g.title, TITLE_JA[g.title]] : null, g.is_private ? ["lock", "非公開"] : null, g.secret ? ["lock", "シークレット"] : null, g.only_verified_age ? ["ok", "年齢確認済みの人だけ"] : null,
      g.only_mobile_verified ? ["", "電話番号認証済みの人だけ"] : null, Number(g.generation_groups_limit) ? ["", `世代制限 ${g.generation_groups_limit}`] : null,
      g.safe_mode ? ["new", "セーフモード"] : null, g.is_private === false && g.secret ? ["", "検索結果に非表示"] : null, catName(g.group_category_id) ? ["pink", catName(g.group_category_id)] : null].filter(Boolean);
    let body = "";
    const pairs = [];
    if (tab === "") {
      const L = feed(`g:${id}:posts`), pinned = L.extra?.pinned || [];
      body = `${pinned.map(p => postCard(p, { pinned: true })).join("")}${feedBlock("gposts", L, p => postCard(p), "件", "まだ投稿がありません。")}`;
      pairs.push(["gposts", L, "groupPosts", id]);
    } else if (tab === "album") {
      const L = feed(`g:${id}:album`);
      albumFlat = L.items.flatMap(mediaOf);
      body = `${albumFlat.length ? `<div class="ys-album">${albumFlat.map((m, i) => `<button type="button" class="ys-album-item" data-album="${i}"><img src="${esc(m.thumb)}" alt="" loading="lazy">${m.type === "video" ? `<span class="ys-play"></span>` : ""}<span class="ys-album-likes">${ic("heart")}${num(m.post.likes_count)}</span></button>`).join("")}</div>` : emptyMsg(L, "まだ画像や動画がありません。")}${more("galbum", L, "件の投稿")}`;
      pairs.push(["galbum", L, "groupAlbum", id]);
    } else if (tab === "members") {
      const mode = extra === "moderators" ? "moderator" : "";
      const L = feed(`g:${id}:members:${mode}`);
      body = `<div class="ys-toolbar">${rlink(`group/${id}/members`, "全員", `ys-chip-btn${mode ? "" : " on"}`)}${rlink(`group/${id}/members/moderators`, "管理人・副管理人", `ys-chip-btn${mode ? " on" : ""}`)}<span class="up-muted ys-toolbar-note">${num(L.items.length)} / ${num(g.groups_users_count)}人</span></div>
        <ul class="fl-list">${mode && g.owner ? personRow2(g.owner) : ""}${L.items.map(m => { if (m.is_moderator) circleCtx.mods.add(String(m.user.id)); return personRow2(m.user, [m.title ? `<span class="fl-tag">${esc(m.title)}</span>` : "", m.banned ? `<span class="fl-tag o">追放済み</span>` : "", m.pending_transfer ? `<span class="fl-tag">管理人の譲渡待ち</span>` : "", m.pending_deputize ? `<span class="fl-tag">副管理人の任命待ち</span>` : ""].join("")); }).join("")}</ul>
        ${emptyMsg(L, "メンバーはいません。")}${more("gmembers", L, "人")}`;
      pairs.push(["gmembers", L, "groupMembers", `${id}|${mode}`]);
    } else if (tab === "related") {
      const L = feed(`g:${id}:related`);
      body = feedBlock("grelated", L, groupCard, "件", "関連サークルはありません。");
      pairs.push(["grelated", L, "groupRelated", id]);
    } else if (tab === "search") {
      const q = extra || "";
      body = `<form class="ys-toolbar ys-inline-search" data-route-search="group/${id}/search/"><input name="q" value="${esc(q)}" placeholder="このサークルの投稿を検索" aria-label="このサークルの投稿を検索" enterkeyhint="search"><button class="ys-btn ys-btn-primary" type="submit">検索</button></form>`;
      if (q) { const L = feed(`g:${id}:search:${q}`); body += feedBlock("gsearch", L, p => postCard(p), "件", "見つかりませんでした。"); pairs.push(["gsearch", L, "groupSearch", `${id}|${q}`]); }
    } else if (tab === "info") {
      const yes = v => v ? "はい" : "いいえ";
      const rows = [["サークルID", g.id], ["カテゴリ", catName(g.group_category_id) || g.group_category_id || "—"], ["作成日時", g.created_at ? fmtDate(g.created_at) : "—"], ["最終更新", g.updated_at ? `${fmtDate(g.updated_at)}（${ago(g.updated_at)}）` : "—"],
        ["メンバー", `${num(g.groups_users_count)}人`], ["投稿", `${num(g.posts_count)}件`], ["スレッド", num(g.threads_count)], ["ハイライト", num(g.highlighted_count)], ["閲覧数", num(g.views_count)], ["関連サークル", num(g.related_count)],
        ["非公開", yes(g.is_private)], ["シークレット", yes(g.secret)], ["年齢確認済みの人だけ", yes(g.only_verified_age)], ["電話番号認証済みの人だけ", yes(g.only_mobile_verified)],
        ["世代制限", Number(g.generation_groups_limit) ? g.generation_groups_limit : "なし"], ["性別の制限", { "-1": "なし", 0: "男性のみ", 1: "女性のみ" }[g.gender] ?? g.gender], ["セーフモード", yes(g.safe_mode)],
        ["スレッドを作れる人", { member: "誰でもスレッド作成可能", moderator: "管理人と副管理人のみ", owner: "管理人のみ" }[g.allow_thread_creation_by] || g.allow_thread_creation_by || "—"],
        ["メンバーの画像・動画投稿", yes(g.allow_members_to_post_image_and_video)], ["メンバーのURL投稿", yes(g.allow_members_to_post_url)], ["通話タイムラインに表示", yes(g.call_timeline_display)],
        ["通報された投稿を隠す", yes(g.hide_reported_posts)], ["通話を隠す", yes(g.hide_conference_call)], ["管理人の権限を移すことを許可", yes(g.allow_ownership_transfer)], ["管理人の譲渡の手続き中", g.pending_transfer_id ? "はい" : "いいえ"],
        ["副管理人の任命待ち", (g.pending_deputize_ids || []).length ? `${g.pending_deputize_ids.length}人` : "なし"], ["ホームページ", g.homepage || "—"]].filter(r => r[1] !== undefined && r[1] !== "—");
      body = `<div class="ys-pad"><h2>${ic("settings")}サークルの設定</h2><dl class="ys-about">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
        ${g.guidelines ? `<div class="ys-pad"><h2>${ic("book")}ルール</h2><p class="ys-group-desc">${linkify(g.guidelines)}</p></div>` : ""}
        ${g.owner ? `<div class="ys-pad"><h2>${ic("crown")}管理人</h2><ul class="fl-list">${personRow2(g.owner)}</ul></div>` : ""}
        <div class="ys-pad"><h2>${ic("image")}画像</h2><div class="ys-images">${imgTile("アイコン", g.group_icon)}${imgTile("カバー", g.cover_image, true)}</div></div>`;
    } else if (tab === "data") {
      body = `<div class="ys-pad"><p class="up-muted">サークルAPIが返したすべての項目です。yay.space に表示されない設定も含みます。</p></div>${allData(g)}`.replace('<details class="ys-raw">', '<details class="ys-raw" open>');
    }
    app.innerHTML = `${crumb}<section class="ys-box ys-user ys-groupbox">
      <div class="ys-cover">${cover ? `<img src="${esc(cover)}" alt=""><button class="ys-cover-btn" type="button" data-zoom="${esc(cover)}" aria-label="カバー画像を拡大"></button>` : ""}<a class="ys-menu" href="https://yay.space/group/${esc(g.id)}" target="_blank" rel="noopener" title="Yay! で開く" aria-label="Yay! で開く">${ic("external")}</a></div>
      <div class="ys-profile">
        <button class="ys-avatar sq" type="button" ${icon ? `data-zoom="${esc(icon)}"` : "disabled"} aria-label="アイコンを拡大">${icon ? `<img src="${esc(icon)}" alt="">` : `<b>${esc(Array.from(String(g.topic || "?"))[0])}</b>`}</button>
        <h1 class="ys-name">${esc(g.topic)}${TITLE_JA[g.title] ? `<span class="ys-ubs"><span class="ys-ub ys-ub-${g.title}">${TITLE_JA[g.title]}</span></span>` : ""}</h1>
        <div class="ys-sub">サークルID ${esc(g.id)}${g.created_at ? ` · 作成 ${fmtDate(g.created_at, false)}` : ""} · 更新 ${ago(g.updated_at)}</div>
        <div class="ys-badges">${flags.map(([c, t]) => `<span class="ys-badge${c ? ` ys-badge-${c}` : ""}">${esc(t)}</span>`).join("")}</div>
        ${g.description ? foldText(g.description) : ""}
        <div class="ys-dl">${rlink(`group/${id}/members`, `<b>${num(g.groups_users_count)}</b><em>メンバー</em>`)}<span><b>${num(g.posts_count)}</b><em>投稿</em></span><span><b>${num(g.views_count)}</b><em>閲覧</em></span>${g.owner ? `<span><em>管理人</em> ${userChip(g.owner)}</span>` : ""}</div>
        <div class="ys-actions"><a class="ys-btn" href="https://yay.space/group/${esc(g.id)}" target="_blank" rel="noopener">${ic("external")}Yay! で開く</a></div>
      </div>
      <nav class="ys-tabs" aria-label="サークルの情報">${GROUP_TABS.map(([k, l]) => rlink(`group/${id}${k ? `/${k}` : ""}`, `<b>${ic(TAB_ICON[k])}${l}</b><small>${k === "" ? num(g.posts_count) : k === "members" ? num(g.groups_users_count) : k === "related" ? num(g.related_count) : "&nbsp;"}</small>`, `ys-tab${k === tab ? " active" : ""}`)).join("")}</nav>
      <div>${body}</div></section>`;
    startFeeds(pairs);
  }
  // fields some lists return but yay.space never shows (members include sign-up date, following count, generation, region, gender)
  function extraUserTags(x) {
    const t = [];
    if (x.followings_count != null) t.push(`フォロー中 ${num(x.followings_count)}`);
    if (x.posts_count != null) t.push(`投稿 ${num(x.posts_count)}`);
    if (x.reviews_count != null) t.push(`レター ${num(x.reviews_count)}`);
    if (x.groups_users_count != null) t.push(`サークル ${num(x.groups_users_count)}`);
    if (x.created_at) t.push(`登録 ${fmtDate(x.created_at, false)}`);
    if (x.generation != null) t.push(`第${x.generation}世代`);
    if (x.prefecture) t.push(x.prefecture);
    if (x.gender === 0 || x.gender === 1) t.push(x.gender ? "女性" : "男性");
    if (x.country_code && x.country_code !== "JP") t.push(x.country_code);
    if (x.title) t.push(x.title);
    return t.map(v => `<span class="fl-tag">${esc(v)}</span>`).join("");
  }
  // a user row with the yay.space style tags (used by members, search, rankings…)
  function personRow2(x, extraTags = "", lead = "") {
    if (!x) return "";
    const a = avatarOf(x);
    return `<li class="fl-row">${lead}${rlink(`user/${x.id}`, `<span class="fl-ava sm">${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(x)}${x.online_status === "online" ? "<i></i>" : ""}</span><span class="fl-copy"><span class="fl-name">${esc(x.nickname || x.id)}${roleBadges(x)}</span>${x.biography ? `<span class="fl-bio">${esc(String(x.biography).replace(/\s+/g, " ").slice(0, 80))}</span>` : ""}<span class="fl-tags">${extraTags}${followerTags(x)}${extraUserTags(x)}</span></span>`, "fl-main")}<a class="fl-btn" href="https://yay.space/user/${esc(x.id)}" target="_blank" rel="noopener" aria-label="Yay! でフォロー">${ic("user-plus")}<span>フォロー</span></a></li>`;
  }

  /* ---- circle list ---- */
  function renderGroups(mode, val) {
    ensureCats();
    document.title = "サークル - Yay! ユーザー情報";
    const ctx = mode === "category" ? `cat|${val}` : mode === "search" ? `q|${val}` : "all|";
    const L = feed(`groups:${ctx}`);
    app.innerHTML = `${crumbs([["サークル", mode ? "groups" : null], ...(mode === "category" ? [[catName(val) || "カテゴリ"]] : mode === "search" ? [[`「${val}」`]] : [])])}${subnav("groups")}
      <section class="ys-box">
        <h2 class="ys-box-title">${ic("search")}サークル検索</h2>
        <form class="ys-toolbar ys-inline-search" data-route-search="groups/search/"><input name="q" value="${esc(mode === "search" ? val : "")}" placeholder="サークル名" aria-label="サークル名" enterkeyhint="search"><button class="ys-btn ys-btn-primary" type="submit">検索</button></form>
        <div class="ys-cats">${rlink("groups", "全て", `ys-chip-btn${!mode ? " on" : ""}`)}${(groupCats || []).map(c => rlink(`groups/category/${c.id}`, esc(c.name), `ys-chip-btn${mode === "category" && String(val) === String(c.id) ? " on" : ""}`)).join("")}</div>
      </section>
      <section class="ys-box ys-list-box">${feedBlock("groups", L, groupCard, "件", "サークルが見つかりませんでした。")}</section>`;
    startFeeds([["groups", L, "groupList", ctx]]);
  }

  /* ---- timelines ---- */
  function callRow(p) {
    const c = p.conference_call || {}, pu = p.user || {};
    return `<article class="ys-callrow">
      <div class="ys-callrow-head">${rlink(`user/${pu.id}`, avatarOf(pu) ? `<img src="${esc(avatarOf(pu))}" alt="" loading="lazy">` : initial(pu), "ys-post-ava sm", ' tabindex="-1" aria-hidden="true"')}
        <div class="ys-callrow-copy"><b>${rlink(`post/${p.id}`, esc(p.text || "（タイトルなし）"))}</b><span class="up-muted">${rlink(`user/${pu.id}`, esc(pu.nickname || pu.id))}${p.group_id ? ` · ${rlink(`group/${p.group_id}`, "サークルの通話")}` : ""}</span></div></div>
      ${callInfo(p)}
      ${allData(p, "この通話のすべてのデータ")}
    </article>`;
  }
  function renderTimeline(kind, tag) {
    if (kind === "hashtag") {
      document.title = `#${tag} - Yay! ユーザー情報`;
      const L = feed(`tag:${tag}`);
      app.innerHTML = `${crumbs([["タイムライン", "timeline"], [`#${tag}`]])}${subnav("")}
        <section class="ys-box ys-list-box"><h2 class="ys-box-title">${ic("hash")}${esc(tag)} <small>${num(L.items.length)}件</small></h2>${summary(L.items)}${feedBlock("tag", L, p => postCard(p), "件", "この タグの投稿はありません。")}</section>`;
      return startFeeds([["tag", L, "hashtag", tag]]);
    }
    if (kind === "calls") {
      document.title = "通話中 - Yay! ユーザー情報";
      const L = feed("calls");
      const people = L.items.reduce((a, p) => a + Number(p.conference_call?.conference_call_users_count || 0), 0);
      app.innerHTML = `${crumbs([["タイムライン", "timeline"], ["通話中"]])}${subnav("timeline/calls")}
        <section class="ys-box ys-list-box"><h2 class="ys-box-title">${ic("phone")}いま公開されている通話 <small>${num(L.items.length)}件 · ${num(people)}人が参加中</small></h2>${feedBlock("calls", L, callRow, "件", "いま公開されている通話はありません。")}</section>`;
      return startFeeds([["calls", L, "callTimeline", ""]]);
    }
    document.title = "タイムライン - Yay! ユーザー情報";
    const L = feed("timeline");
    app.innerHTML = `${crumbs([["タイムライン"]])}${subnav("timeline")}
      <section class="ys-box ys-list-box"><h2 class="ys-box-title">${ic("list")}オープンタイムライン</h2>${summary(L.items)}${feedBlock("timeline", L, p => postCard(p), "件", "投稿がありません。")}</section>`;
    startFeeds([["timeline", L, "publicTimeline", ""]]);
  }

  /* ---- search ---- */
  const searchOpts = { media: false, scope: "nickname", noGomi: false };
  function renderSearch(type, q) {
    if (type === "hashtags") { if (q) { go(`timeline/hashtag/${encodeURIComponent(q.replace(/^[#＃]/, ""))}`, true); return; } }
    if (!["posts", "users", "groups", "hashtags"].includes(type)) type = "posts";
    document.title = `${q ? `「${q}」の` : ""}検索 - Yay! ユーザー情報`;
    const tabs = [["posts", "投稿"], ["users", "ユーザー"], ["groups", "サークル"], ["hashtags", "ハッシュタグ"]];
    const filters = type === "posts" ? `<div class="ys-toolbar"><button type="button" class="ys-chip-btn${searchOpts.media ? " on" : ""}" data-sopt="media" aria-pressed="${searchOpts.media}">画像・動画のみ</button></div>`
      : type === "users" ? `<div class="ys-toolbar"><button type="button" class="ys-chip-btn${searchOpts.scope === "nickname" ? " on" : ""}" data-sopt="scope:nickname">ユーザー名のみ</button><button type="button" class="ys-chip-btn${searchOpts.scope === "biography" ? " on" : ""}" data-sopt="scope:biography">自己紹介のみ</button><button type="button" class="ys-chip-btn${searchOpts.noGomi ? " on" : ""}" data-sopt="noGomi" aria-pressed="${searchOpts.noGomi}">最近ゴミ虫になった人を除く</button></div>` : "";
    if (q) writeList(SEARCH_KEY, [q, ...readList(SEARCH_KEY).filter(x => x !== q)].slice(0, 12));
    const recent = readList(SEARCH_KEY);
    let body = `<div class="ys-search-empty">${recent.length ? `<div class="ys-se-head">${ic("clock")}最近の検索<button type="button" class="ys-home-more" data-search-clear>履歴を消す</button></div><div class="ys-cats">${recent.map(w => rlink(`search/${type}/${encodeURIComponent(w)}`, esc(w), "ys-chip-btn")).join("")}</div>` : ""}
      <div class="ys-se-head">${ic("search")}たとえば</div><div class="ys-cats">${["雑談", "通話", "ゲーム", "イラスト", "#いいねでこちゃ", "#今日のだれ通"].map(w => w.startsWith("#") ? rlink(`timeline/hashtag/${encodeURIComponent(w.slice(1))}`, esc(w), "ys-chip-btn") : rlink(`search/${type === "hashtags" ? "posts" : type}/${encodeURIComponent(w)}`, esc(w), "ys-chip-btn")).join("")}</div></div>`, pairs = [];
    if (q) {
      const L = feed(`search:${type}:${q}:${type === "posts" ? searchOpts.media : type === "users" ? `${searchOpts.scope}:${searchOpts.noGomi}` : ""}`);
      const row = type === "posts" ? (p => postCard(p)) : type === "users" ? (u => `<ul class="fl-list">${personRow2(u)}</ul>`) : groupCard;
      const reportedPhraseBadge = type === "posts" && L.searchAllReported
        ? `<div class="ys-reported-phrase" role="status">${ic("alert")}<span>通報されたフレーズ</span></div>`
        : "";
      body = reportedPhraseBadge + feedBlock("search", L, row, type === "users" ? "人" : "件", "見つかりませんでした。");
      pairs = [["search", L, type === "posts" ? "searchPosts" : type === "users" ? "searchUsers" : "searchGroups", q]];
    }
    app.innerHTML = `${crumbs([["検索"], ...(q ? [[`「${q}」`]] : [])])}${subnav("search/posts/")}
      <section class="ys-box ys-list-box">
        <form class="ys-toolbar ys-inline-search" data-route-search="search/${type}/"><input name="q" value="${esc(q)}" placeholder="キーワード（#タグ も使えます）" aria-label="検索キーワード" enterkeyhint="search"><button class="ys-btn ys-btn-primary" type="submit">検索</button></form>
        <nav class="ys-tabs ys-tabs-flat">${tabs.map(([k, l]) => rlink(`search/${k}/${enc(q)}`, `<b>${l}</b>`, `ys-tab${k === type ? " active" : ""}`)).join("")}</nav>
        ${filters}${type === "hashtags" ? `<div class="ys-empty">ハッシュタグ名を入れて検索すると、そのタグの投稿を開きます。</div>` : body}</section>`;
    startFeeds(pairs);
  }

  /* ---- user lists ---- */
  // yay.space/users/ranking/{new|popular|all-time}: ルーキー = one_month, ミドル = six_months, 殿堂入り = all_time
  const RANKS = [["new", "ルーキー", "one_month"], ["popular", "ミドル", "six_months"], ["all-time", "殿堂入り", "all_time"]];
  function renderUsers(kind, mode) {
    if (kind === "ranking_all") { kind = "ranking"; mode = "all-time"; }
    if (kind === "ranking" && !RANKS.some(r => r[0] === mode)) mode = "new";
    const rank = RANKS.find(r => r[0] === mode);
    const defs = { ranking: [`ユーザーランキング（${rank?.[1]}）`, "ranking", rank?.[2]], discover: ["おすすめのユーザー", "discover", ""], hima: ["今ひまなユーザー", "hima", ""] };
    if (!defs[kind]) kind = "discover";
    const [title, pager, ctx] = defs[kind], L = feed(`users:${kind}:${mode || ""}`);
    document.title = `${title} - Yay! ユーザー情報`;
    const nav = kind === "ranking" ? `<nav class="ys-tabs ys-tabs-flat">${RANKS.map(([m, l]) => rlink(`users/ranking/${m}`, `<b>${l}</b>`, `ys-tab${m === mode ? " active" : ""}`)).join("")}</nav>` : "";
    app.innerHTML = `${crumbs(kind === "ranking" ? [["ユーザーランキング", "users/ranking/new"], [rank[1]]] : [[title]])}${subnav(kind === "ranking" ? "users/ranking/new" : `users/${kind}`)}
      <section class="ys-box ys-list-box"><h2 class="ys-box-title">${ic(kind === "ranking" ? "trophy" : kind === "hima" ? "clock" : "star")}${title} <small>${num(L.items.length)}人</small></h2>${nav}
        <ul class="fl-list">${L.items.map((u, i) => personRow2(u, "", kind === "ranking" ? `<span class="fl-rank r${Math.min(i + 1, 4)}" aria-label="${i + 1}位">${i + 1}</span>` : "")).join("")}</ul>${emptyMsg(L, "ユーザーがいません。")}${more("users", L, "人")}</section>`;
    startFeeds([["users", L, pager, ctx]]);
  }

  /* back-to-top button on long pages */
  const topBtn = document.createElement("button");
  topBtn.type = "button"; topBtn.className = "ys-totop"; topBtn.setAttribute("aria-label", "ページの上へ戻る");
  topBtn.innerHTML = ic("chevron-up"); topBtn.hidden = true;
  topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.body.append(topBtn);
  window.addEventListener("scroll", () => { topBtn.hidden = window.scrollY < 1400; }, { passive: true });

  /* ---------------- lightbox ---------------- */
  const box = $("upLightbox");
  let lbList = [], lbIndex = 0, lbReturn = null;
  function openLightbox(items, index) {
    lbList = items; lbIndex = index; lbReturn = document.activeElement;
    box.classList.remove("hidden"); document.body.classList.add("up-noscroll"); drawLightbox();
  }
  function drawLightbox() {
    const m = lbList[lbIndex]; if (!m) return closeLightbox();
    const multi = lbList.length > 1;
    box.innerHTML = `<div class="up-lb-bar"><span>${multi ? `${lbIndex + 1} / ${lbList.length}` : ""}</span>
        ${m.post ? rlink(`post/${m.post.id}`, "投稿を見る", "", " data-lb-close") : ""}<a href="${esc(m.src)}" target="_blank" rel="noopener">原寸</a>
        <button type="button" data-lb="close" aria-label="閉じる">${ic("close")}</button></div>
      <div class="up-lb-stage">${m.type === "video" ? `<video src="${esc(m.src)}" controls autoplay playsinline poster="${esc(m.thumb || "")}"></video>` : `<img src="${esc(m.src)}" alt="">`}</div>
      ${multi ? `<button type="button" class="up-lb-nav prev" data-lb="prev" aria-label="前へ">${ic("chevron-left")}</button><button type="button" class="up-lb-nav next" data-lb="next" aria-label="次へ">${ic("chevron-right")}</button>` : ""}
`;
    box.querySelector('[data-lb="close"]').focus({ preventScroll: true });
  }
  function closeLightbox() {
    box.classList.add("hidden"); box.innerHTML = "";
    if ($("upModal").classList.contains("hidden")) document.body.classList.remove("up-noscroll");
    if (lbReturn && document.contains(lbReturn)) lbReturn.focus({ preventScroll: true });
  }
  const step = d => { if (lbList.length > 1) { lbIndex = (lbIndex + d + lbList.length) % lbList.length; drawLightbox(); } };
  box.addEventListener("click", e => {
    if (e.target.closest("[data-lb-close]")) { closeLightbox(); return; }
    const b = e.target.closest("[data-lb]");
    if (b) { const a = b.dataset.lb; a === "close" ? closeLightbox() : step(a === "next" ? 1 : -1); return; }
    if (e.target === box || e.target.classList.contains("up-lb-stage")) closeLightbox();
  });
  document.addEventListener("keydown", e => {
    if (!box.classList.contains("hidden")) {
      if (e.key === "Escape") closeLightbox(); else if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1);
      return;
    }
    if (e.key === "Escape" && !$("upModal").classList.contains("hidden")) closePopup();
  });
  let touchX = null;
  box.addEventListener("touchstart", e => { touchX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", e => { if (touchX == null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }, { passive: true });

  /* ---------------- events ---------------- */
  app.addEventListener("click", async e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-back")) {
      if (navDepth > 0) { navDepth--; history.back(); }
      else { const uid = view.kind === "post" ? posts.get(view.id)?.post?.user?.id : convs.get(view.id)?.items[0]?.user?.id; go(uid ? `user/${uid}` : "", true); }
      return;
    }
    if (t.dataset.zoom) return openLightbox([{ type: "image", src: t.dataset.zoom }], 0);
    if (t.dataset.album != null) return openLightbox(albumFlat, Number(t.dataset.album));
    if (t.dataset.media) {
      const pool = view.kind === "user" ? [...S.lists.posts.items, ...(S.lists.posts.extra?.pinned || [])] : [...feeds.values()].flatMap(L => [...L.items, ...(L.extra?.pinned || [])]);
      const post = pool.find(p => String(p.id) === t.dataset.post);
      const items = post ? mediaOf(post) : pageMedia.filter(m => String(m.post.id) === t.dataset.post);
      const list2 = items.length ? items : [{ type: t.dataset.type, src: t.dataset.media }];
      return openLightbox(list2, Math.max(0, list2.findIndex(m => m.src === t.dataset.media)));
    }
    if (t.hasAttribute("data-retry-list")) {
      // clear the error of every list that can still load more, then draw again (which starts loading)
      for (const L of [...Object.values(S.lists), ...[...posts.values()].map(x => x.likers), ...convs.values()]) if (L.error && !L.done) L.error = null;
      if (view.kind === "user") renderTab(); else renderPage();
      return;
    }
    if (t.hasAttribute("data-unfold")) {
      const bio = t.previousElementSibling, open = bio.classList.toggle("folded");
      t.textContent = open ? "もっと見る" : "閉じる"; return;
    }
    if (t.dataset.homeRetry) { home[t.dataset.homeRetry] = null; return loadHome(false); }
    if (t.hasAttribute("data-clear-recent")) { writeList(RECENT_KEY, []); if (view.kind === "landing") app.innerHTML = landing(); return; }
    if (t.dataset.searchClear != null) { writeList(SEARCH_KEY, []); return renderPage(); }
    if (t.dataset.sopt) {
      const [k, v] = t.dataset.sopt.split(":");
      if (v) searchOpts[k] = v; else searchOpts[k] = !searchOpts[k];
      return renderPage();
    }
    if (t.dataset.copytext != null) {
      const old = t.innerHTML;
      try { await navigator.clipboard.writeText(t.dataset.copytext); t.textContent = "コピーしました"; } catch { t.textContent = "コピーできませんでした"; }
      setTimeout(() => { t.innerHTML = old; }, 1600); return;
    }
    if (t.dataset.copy != null || t.hasAttribute("data-copyjson")) {
      const text = t.hasAttribute("data-copyjson") ? JSON.stringify(JSON.parse(JSON.stringify({ profile: S.core.user, timeline_user: S.core.tlUser, active_call: S.core.call }, (k, v) => (/token/i.test(k) && v ? "（安全のため表示しません）" : v))), null, 2) : t.dataset.copy;
      const old = t.innerHTML;
      try { await navigator.clipboard.writeText(text); t.textContent = "コピーしました"; } catch { t.textContent = "コピーできませんでした"; }
      setTimeout(() => { t.innerHTML = old; }, 1600);
    }
  });
  // Redrawing replaces the text box, which breaks Japanese input (ちい → ｃｈいい). Wait until the IME
  // has finished composing; compositionend then delivers the final text.
  const viewInput = e => {
    const t = e.target; if (!t.dataset.view || e.isComposing) return;
    S.view[t.dataset.view][t.dataset.prop] = t.value;
    renderTab();
  };
  app.addEventListener("compositionend", viewInput);
  app.addEventListener("input", e => {
    if (e.isComposing) return;
    const t = e.target; if (!t.dataset.view) return;
    S.view[t.dataset.view][t.dataset.prop] = t.value;
    renderTab();
  });
  document.addEventListener("submit", e => {
    const form = e.target.closest("[data-route-search]"); if (!form) return;
    e.preventDefault();
    const q = form.querySelector("input").value.trim();
    if (/^[#＃]./.test(q) && !form.dataset.routeSearch.startsWith("group/")) { navDepth++; return go(`timeline/hashtag/${encodeURIComponent(q.slice(1))}`); }
    navDepth++; go(form.dataset.routeSearch + encodeURIComponent(q));
  });
  // every user search box on the page (header pill and the one on the start page)
  document.addEventListener("submit", async e => {
    const form = e.target.closest("[data-user-search]"); if (!form) return;
    e.preventDefault();
    const input = form.querySelector("input"), err = $("upError"), btn = form.querySelector("button");
    err.classList.add("hidden"); if (btn) btn.disabled = true;
    try {
      const route = await resolveInput(input.value);
      input.value = ""; input.blur();
      navDepth++; go(route); window.scrollTo({ top: 0 });
    } catch (x) { err.textContent = x.message || String(x); err.classList.remove("hidden"); window.scrollTo({ top: 0 }); }
    finally { if (btn) btn.disabled = false; }
  });

  // links from the other pages' header search (?q=…) and older links (?id=123 / ?user=123)
  const q = new URLSearchParams(location.search), legacy = q.get("id") || q.get("user"), query = q.get("q");
  if (legacy && /^\d+$/.test(legacy)) go(`user/${legacy}`, true);
  else if (query) resolveInput(query).then(r => go(r, true), x => { go("", true); $("upError").textContent = x.message; $("upError").classList.remove("hidden"); });
  else render();
})();

/* Yay! ユーザー情報 — styled after yay.space's own profile pages:
 * white header with the logo in the middle, light grey page, one white rounded card with the banner,
 * an avatar overlapping it, and tabs with a pink underline. Stand-alone (does not load ../style.css). */
:root{
  --pink:#e849be;--pink-soft:#fde8f6;--text:#212121;--text2:#2d2d2d;--gray:#757575;--light:#c6c6c6;--line:#eeeeee;
  --bg:#f6f6f6;--card:#fff;--shadow:0 1px 2px rgba(0,0,0,.16);
  --font:Roboto,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif;
  color-scheme:light;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
html,body{overflow-x:hidden}
@supports (overflow:clip){html,body{overflow-x:clip}}
/* the shared header scrolls away on phones so the profile tabs can stick to the top */
@media (max-width:720px){.topbar{position:relative!important}}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:400 15px/1.6 var(--font)}
img,video{max-width:100%}
a{color:inherit}
button{font:inherit;color:inherit;touch-action:manipulation}
.hidden{display:none!important}
.up-muted{color:var(--gray)}
