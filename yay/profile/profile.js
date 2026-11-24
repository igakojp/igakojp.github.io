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

  /* ---------------- routing ---------------- */
  const routeHref = route => PATH_MODE ? BASE + route : `#/${route}`;
  const rlink = (route, inner, cls = "", extra = "") => `<a href="${esc(routeHref(route))}" data-route="${esc(route)}"${cls ? ` class="${cls}"` : ""}${extra}>${inner}</a>`;
  function currentRoute() {
    const params = new URLSearchParams(location.search);
    if (params.has("route")) {
      const r = String(params.get("route") || "").replace(/^\/+/, "");
      if (PATH_MODE) history.replaceState(null, "", BASE + r + location.hash);
      return r;
    }
    if (location.hash.startsWith("#/")) return decodeURIComponent(location.hash.slice(2));
    if (PATH_MODE) {
      const here = location.href.split(/[?#]/)[0];
      if (here.startsWith(BASE)) return decodeURIComponent(here.slice(BASE.length)).replace(/^index\.html$/, "");
    }
    return "";
  }
  function go(route, replace = false) {
    if (PATH_MODE) { history[replace ? "replaceState" : "pushState"]({ route }, "", BASE + route); render(); }
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
  function landing() {
    return `${subnav("")}<section class="ys-box ys-hero"><h1>アカウントの公開情報を、ぜんぶ見やすく。</h1>
      <p>ユーザーID・プロフィールURL・投稿URLのどれかを入れると、Yay! と同じ形で、アイコン・バナー・自己紹介・フォロワー・登録日・投稿・アルバム・レター・サークル・通話などの公開情報を表示します。</p>
      <form class="ys-search-row" data-user-search autocomplete="off"><input name="q" placeholder="例: 12290655 / https://yay.space/user/12290655" spellcheck="false" inputmode="url" enterkeyhint="go" aria-label="ユーザーID、プロフィールURL、または投稿URL"><button class="ys-btn ys-btn-primary" type="submit">表示</button></form>
      <ul><li><code>${esc(routeHref("user/12290655"))}</code> … 全ての投稿</li>
      <li><code>${esc(routeHref("user/12290655/album"))}</code> … アルバム ／ <code>…/reviews</code> … レター</li>
      <li><code>${esc(routeHref("post/616234769"))}</code> … 投稿 ／ <code>${esc(routeHref("conversation/41808198"))}</code> … 会話</li>
      <li><code>${esc(routeHref("group/325355"))}</code> … サークル ／ <code>…/timeline</code>・<code>…/timeline/calls</code>・<code>…/groups</code>・<code>…/users/ranking/new</code>・<code>…/search/posts/キーワード</code></li></ul></section>
      <section class="ys-box ys-explore">${[["timeline", "タイムライン", "いま投稿されている公開投稿"], ["timeline/calls", "通話中", "公開されている通話と参加者の一覧"], ["groups", "サークル", "カテゴリ別・名前で探す"], ["users/ranking/new", "ランキング", "ルーキー・ミドル・殿堂入り"], ["users/discover", "おすすめ", "おすすめのユーザー"], ["users/hima", "今ひまなユーザー", "いま暇なユーザー"]].map(([r, t, d]) => rlink(r, `<b>${t}</b><span>${d}</span>`, "ys-explore-a")).join("")}</section>`;
  }
  function crumbs(items) {
    return `<nav class="ys-crumbs" aria-label="現在の場所">${rlink("", `${ICON.home} ユーザー情報`)}${items.map(([label, route]) => ` <span>›</span> ${route != null ? rlink(route, esc(label)) : `<span>${esc(label)}</span>`}`).join("")}</nav>`;
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
    if (!app.querySelector(`.ys-user[data-id="${S.id}"]`)) {
      app.innerHTML = `<div class="ys-crumbs-slot"></div><section class="ys-box ys-user" data-id="${esc(S.id)}">${header(u)}<nav class="ys-tabs" aria-label="表示する情報"></nav><div id="upTab"></div></section>`;
    }
    app.querySelector(".ys-crumbs-slot").innerHTML = userCrumbs(u);
    app.querySelector(".ys-tabs").innerHTML = TABS.map(([k, label, count]) => {
      const c = count(u), on = k === currentTab;
      return rlink(`user/${S.id}${k ? `/${k}` : ""}`, `<b>${label}</b><small>${c === "" ? "&nbsp;" : num(c)}</small>`, `ys-tab${on ? " active" : ""}`, on ? ' aria-current="page"' : "");
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
    const shareUrl = PATH_MODE ? `${BASE}user/${u.id}` : `${location.href.split("#")[0]}#/user/${u.id}`;
    return `<div class="ys-cover">${cover ? `<img src="${esc(cover)}" alt=""><button class="ys-cover-btn" type="button" data-zoom="${esc(cover)}" aria-label="バナー画像を拡大"></button>` : ""}
        <a class="ys-menu" href="https://yay.space/user/${esc(u.id)}" target="_blank" rel="noopener" title="Yay! で開く" aria-label="Yay! で開く">↗</a></div>
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
          <a class="ys-btn" href="https://yay.space/user/${esc(u.id)}" target="_blank" rel="noopener">Yay! で開く</a>
          <button class="ys-btn" type="button" data-copy="${esc(shareUrl)}">URLをコピー</button>
        </div>
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
  const emptyMsg = (L, msg) => (L.loading || L.error || !L.done || L.items.length) ? "" : `<div class="ys-empty">${msg}</div>`;

  /* ---- posts ---- */
  const POST_TYPES = [["all", "すべて"], ["text", "テキスト"], ["image", "画像"], ["video", "動画"], ["call", "通話"], ["reply", "返信"], ["repost", "リポスト"], ["other", "その他"]];
  function postKind(p) {
    if (p.post_type === "repost" || p.repost) return "repost";
    if (p.in_reply_to) return "reply";
    if (["text", "image", "video", "call"].includes(p.post_type)) return p.post_type;
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
    return `${toolbar("posts", [["new", "新しい順"], ["old", "古い順"], ["likes", "いいねが多い順"], ["replies", "返信が多い順"], ["reposts", "(´∀｀∩)↑age↑が多い順"], ["gifts", "ギフトが多い順"]], typeSel)}
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
    const showReplyTo = p.in_reply_to_post && !opts.inThread;
    return `<article class="ys-post${opts.pinned ? " pinned" : ""}${opts.big ? " big" : ""}${clickable ? " clickable" : ""}"${clickable ? ` data-open-post="${esc(p.id)}"` : ""}${opts.depth ? ` style="--depth:${Math.min(opts.depth, 4)}"` : ""}>
      ${rlink(`user/${pu.id}`, a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(pu), "ys-post-ava", ' aria-hidden="true" tabindex="-1"')}
      <div class="ys-post-body">
        <div class="ys-post-top"><span class="ys-post-who">${rlink(`user/${pu.id}`, esc(pu.nickname || pu.id), "ys-post-name")}${roleBadges(pu)}</span>${rlink(`post/${p.id}`, ago(p.created_at), "ys-post-time", ` title="${esc(fmtDate(p.created_at))}"`)}</div>
        ${opts.replyName ? `<div class="ys-reply-label">返信: ${opts.replyName}</div>` : ""}
        ${opts.pinned || kind === "repost" || p.edited_at || (p.group_id && view.kind !== "group") ? `<div class="ys-post-meta">${[opts.pinned ? "📌 ピン留め" : "", kind === "repost" ? "リポスト" : "", p.edited_at ? "編集済み" : "", p.group_id && view.kind !== "group" ? rlink(`group/${p.group_id}`, "サークルの投稿", "ys-group-chip") : ""].filter(Boolean).join(" · ")}</div>` : ""}
        ${showReplyTo ? `<div class="ys-reply-to">返信先: ${p.in_reply_to_post.user ? rlink(`user/${p.in_reply_to_post.user.id}`, esc(p.in_reply_to_post.user.nickname)) : ""} ${rlink(`post/${p.in_reply_to_post.id}`, esc(String(p.in_reply_to_post.text || "（投稿）").slice(0, 120)), "ys-reply-text")}</div>` : ""}
        ${p.text ? `<p class="ys-post-text${textClass(p)}">${postText(p)}</p>` : ""}
        ${call ? `<div class="ys-post-call">${ICON.phone}<span>${call.active ? "通話中" : "通話"} · ${call.call_type === "video" ? "ビデオ" : "音声"} · ${num(call.conference_call_users_count)}人</span></div>` : ""}
        ${n ? `<div class="ys-media ${n === 1 ? "n1" : n === 2 ? "n2" : n === 3 ? "n3" : n === 4 ? "n4" : "nmany"}">${media.map(m => `<button type="button" class="ys-thumb" data-media="${esc(m.src)}" data-type="${m.type}" data-post="${esc(p.id)}"><img src="${esc(m.thumb)}" alt="" loading="lazy">${m.type === "video" ? `<span class="ys-play"></span>` : ""}</button>`).join("")}</div>` : ""}
        <ul class="ys-post-actions">
          <li>${p.conversation_id && (replies || p.in_reply_to) ? rlink(`conversation/${p.conversation_id}`, `${ICON.reply}${replies ? num(replies) : ""}`, "ys-act", ' title="会話を見る"') : `<span class="ys-act" title="返信">${ICON.reply}${replies ? num(replies) : ""}</span>`}</li>
          <li>${rlink(`post/${p.id}`, `${ICON.heart}${Number(p.likes_count) ? num(p.likes_count) : ""}`, "ys-act", ' title="いいねした人を見る"')}</li>
          ${Number(p.reposts_count) ? `<li><span class="ys-act" title="(´∀｀∩)↑age↑">${ICON.repost}${num(p.reposts_count)}</span></li>` : ""}
          <li><span class="ys-act" title="ギフト">${ICON.gift}${Number(p.total_gifts_count) ? num(p.total_gifts_count) : ""}</span></li>
          ${p.conversation_id && (replies || p.in_reply_to) && !opts.inThread ? `<li class="ys-act-more">${rlink(`conversation/${p.conversation_id}`, "会話を見る", "ys-act-link")}</li>` : ""}
        </ul>
      </div>
    </article>`;
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
      ${albumFlat.length ? `<div class="ys-album">${albumFlat.map((m, i) => `<button type="button" class="ys-album-item" data-album="${i}"><img src="${esc(m.thumb)}" alt="" loading="lazy">${m.type === "video" ? `<span class="ys-play"></span>` : ""}<span class="ys-album-likes">♥ ${num(m.post.likes_count)}</span></button>`).join("")}</div>` : emptyMsg(L, "まだ画像や動画がありません。")}
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
            <a class="fl-btn" href="https://yay.space/user/${esc(x.id)}" target="_blank" rel="noopener">＋ フォロー</a></li>`;
        }).join("")}</ul>
        ${items.length || !L.items.length || !L.done ? "" : `<div class="ys-empty">条件に合うフォロワーはいません。</div>`}
        ${emptyMsg(L, "フォロワーはいません。")}
        ${more("followers", L, "人")}
        <p class="fl-note">「＋ フォロー」は Yay! のプロフィールを開きます（このページではフォローできません）。</p>
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
  $("upModal").addEventListener("input", e => {
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
        <span class="cf-copy"><small>${c.call_type === "video" ? "ビデオ通話中" : "通話中"} · ${ago(post.created_at)}に開始</small><b>${esc(post.text || "（タイトルなし）")}</b>
          <span class="cf-faces">${users.slice(0, 6).map(x => avatarOf(x) ? `<img src="${esc(avatarOf(x))}" alt="">` : "<i></i>").join("")}<span>${num(c.conference_call_users_count)}人${c.max_participants ? ` / ${num(c.max_participants)}` : ""}</span></span></span>
        <span class="cf-caret">▲</span></button>
      <button class="cf-min" type="button" data-cf="mini" aria-label="小さくする">–</button>
      <div class="cf-body">
        <div class="cf-meta"><span>種類 <b>${c.call_type === "video" ? "ビデオ" : "音声"}</b></span><span>参加できる人 <b>${esc({ anyone: "全員", users: "全員", followers: "フォロワー", mutual_follows: "相互フォロー" }[c.joinable_by] || c.joinable_by || "—")}</b></span>${c.anonymous_call_users_count ? `<span>匿名 <b>${num(c.anonymous_call_users_count)}</b></span>` : ""}${c.game ? `<span>ゲーム <b>${esc(c.game.title || c.game.name || "")}</b></span>` : ""}</div>
        <ul class="cf-people">${users.map(x => `<li>${rlink(`user/${x.id}`, `${avatarOf(x) ? `<img src="${esc(avatarOf(x))}" alt="" loading="lazy">` : "<i></i>"}<span>${esc(x.nickname || x.id)}</span>${roleBadges(x, roles.get(String(x.id)) === "host" ? [["host", "ホスト", "通話のホスト"]] : roles.get(String(x.id)) === "moderator" ? [["mod", "モデレーター", "通話のモデレーター"]] : [])}`)}</li>`).join("")}</ul>
        <div class="cf-actions"><a class="ys-btn" href="https://yay.space/post/${esc(post.id)}" target="_blank" rel="noopener">Yay! で開く</a><button class="ys-btn" type="button" data-cf="refresh">更新</button></div>
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
    return `<article class="ys-letter${pinned ? " pinned" : ""}"><div class="ys-letter-top">${userChip(r.reviewer)}<span class="ys-letter-time" title="${esc(fmtDate(r.created_at))}">${pinned ? "📌 " : ""}${ago(r.created_at)}</span></div><p class="ys-letter-text">${linkify(r.comment || "")}</p></article>`;
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
    return `<div class="ys-pad"><h2>アカウント</h2><dl class="ys-about">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
      <div class="ys-pad"><h2>画像</h2><div class="ys-images">${imgTile("プロフィール画像", u.profile_icon)}${imgTile("バナー", u.cover_image, true)}${u.frame ? imgTile("フレーム", u.frame) : ""}</div></div>`;
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
    post_type: { text: "テキスト", image: "画像", video: "動画", call: "通話", repost: "(´∀｀∩)↑age↑", survey: "アンケート", shareable_url: "URLの共有", share: "シェア" },
    call_type: { voice: "音声通話", video: "ビデオ通話" },
    online_status: { online: "オンライン", offline: "オフライン", hidden: "非表示" },
    joinable_by: { anyone: "全員", users: "全員", followers: "フォロワー", mutual_follows: "相互フォロー", invite_only: "招待のみ" },
    allow_thread_creation_by: { member: "誰でもスレッド作成可能", moderator: "管理人と副管理人のみ", owner: "管理人のみ" },
    title: { admin: "運営", official: "公式", other: "その他" },
    role: { host: "ホスト", moderator: "モデレーター", member: "メンバー" },
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
    return `${toolbar("data", [["cat", "カテゴリ順"], ["key", "項目キー順 (A→Z)"], ["label", "項目名順"]])}
      <div class="ys-stats"><span>取得できた <b>${num(Object.keys(u).length)}</b> 項目をすべて表示しています</span></div>
      <div class="ys-table-wrap"><table class="ys-table"><thead><tr><th>項目</th><th>キー</th><th>値</th></tr></thead><tbody>${body || `<tr><td colspan="3" class="up-muted">該当する項目はありません。</td></tr>`}</tbody></table></div>
      <details class="ys-raw"><summary>取得したJSONをそのまま見る</summary><div class="ys-raw-actions"><button class="ys-btn" type="button" data-copyjson>JSONをコピー</button></div><pre>${esc(JSON.stringify(raw, null, 2))}</pre></details>`;
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
      <section class="ys-box ys-page">${backBar()}${postCard(p, { big: true })}
        <div class="ys-post-facts"><span>${fmtDate(p.created_at)}</span>${p.edited_at ? `<span>編集 ${fmtDate(p.edited_at)}</span>` : ""}<span>いいね <b>${num(p.likes_count)}</b></span><span>返信 <b>${num(replies)}</b></span>${Number(p.reposts_count) ? `<span>(´∀｀∩)↑age↑ <b>${num(p.reposts_count)}</b></span>` : ""}${Number(p.total_gifts_count) ? `<span>ギフト <b>${num(p.total_gifts_count)}</b></span>` : ""}
          <a href="https://yay.space/post/${esc(p.id)}" target="_blank" rel="noopener">Yay! で開く ↗</a></div>
        ${p.conversation_id && (replies || p.in_reply_to) ? `<div class="ys-conv-link">${rlink(`conversation/${p.conversation_id}`, `${ICON.reply}<span>${replies ? `${num(replies)}件の返信を含む会話を見る` : "この投稿がある会話を見る"}</span><b>›</b>`)}</div>` : ""}
      </section>
      ${p.group_id ? `<section class="ys-box ys-conv-link">${rlink(`group/${p.group_id}`, `<span>この投稿があるサークルを見る</span><b>›</b>`)}</section>` : ""}
      <section class="ys-box ys-likers">
        <h2 class="ys-box-title">いいね！してくれた人たち <small>${num(p.likes_count)}</small></h2>
        <ul class="fl-list">${L.items.map(x => {
          const a = avatarOf(x);
          return `<li class="fl-row">${rlink(`user/${x.id}`, `<span class="fl-ava sm">${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(x)}</span><span class="fl-copy"><span class="fl-name">${esc(x.nickname || x.id)}${roleBadges(x)}</span><span class="fl-tags">${followerTags(x)}${extraUserTags(x)}</span></span>`, "fl-main")}<a class="fl-btn" href="https://yay.space/user/${esc(x.id)}" target="_blank" rel="noopener">＋ フォロー</a></li>`;
        }).join("")}</ul>
        ${emptyMsg(L, "まだ誰もいいねしていません。")}${more("likers", L, "人")}
      </section>
      ${Number(p.reposts_count) ? `<section class="ys-box ys-likers"><h2 class="ys-box-title">(´∀｀∩)↑age↑した投稿 <small>${num(p.reposts_count)}</small></h2>${feedBlock("reposts", feed(`reposts:${id}`), x => postCard(x), "件", "表示できる↑age↑はありません。")}</section>` : ""}
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
        ${root ? `<div class="ys-post-facts"><span>${num(L.items.length)}件の投稿</span><a href="https://yay.space/conversation/${esc(cid)}" target="_blank" rel="noopener">Yay! で開く ↗</a></div>` : ""}
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
      nextFrom(L, d, d.posts || []);
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
    text: "本文", post_type: "投稿の種類", color: "文字色", font_size: "文字の大きさ", likes_count: "いいね数", reposts_count: "(´∀｀∩)↑age↑数",
    in_reply_to_post_count: "返信数", total_gifts_count: "ギフト数", reported_count: "通報された回数", updated_at: "更新日時", edited_at: "編集日時",
    repostable: "↑age↑できる", highlighted: "ハイライト", hidden: "非表示", thread_id: "スレッドID", group_id: "サークルID", conversation_id: "会話ID",
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
      <div class="ys-raw-actions"><button class="ys-btn" type="button" data-copytext="${esc(JSON.stringify(obj))}">JSONをコピー</button></div>
      <pre>${esc(JSON.stringify(obj, null, 2))}</pre></details>`;
  }

  /* ---- sub navigation shared by the explore pages ---- */
  function subnav(active) {
    const items = [["", "ホーム"], ["timeline", "タイムライン"], ["timeline/calls", "通話中"], ["groups", "サークル"], ["users/ranking/new", "ランキング"], ["users/discover", "おすすめ"], ["users/hima", "今ひま"], ["search/posts/", "検索"]];
    return `<nav class="ys-subnav" aria-label="さがす">${items.map(([r, l]) => rlink(r, l, `ys-subnav-a${r === active ? " active" : ""}`, r === active ? ' aria-current="page"' : "")).join("")}</nav>`;
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
      body = `${albumFlat.length ? `<div class="ys-album">${albumFlat.map((m, i) => `<button type="button" class="ys-album-item" data-album="${i}"><img src="${esc(m.thumb)}" alt="" loading="lazy">${m.type === "video" ? `<span class="ys-play"></span>` : ""}<span class="ys-album-likes">♥ ${num(m.post.likes_count)}</span></button>`).join("")}</div>` : emptyMsg(L, "まだ画像や動画がありません。")}${more("galbum", L, "件の投稿")}`;
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
        ["副管理人の任命待ち", (g.pending_deputize_ids || []).length ? `${g.pending_deputize_ids.length}人` : "なし"], ["ホームページ", g.homepage || "—"]].filter(r => r[1] !== undefined);
      body = `<div class="ys-pad"><h2>サークルの設定</h2><dl class="ys-about">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
        ${g.guidelines ? `<div class="ys-pad"><h2>ルール</h2><p class="ys-group-desc">${linkify(g.guidelines)}</p></div>` : ""}
        ${g.owner ? `<div class="ys-pad"><h2>管理人</h2><ul class="fl-list">${personRow2(g.owner)}</ul></div>` : ""}
        <div class="ys-pad"><h2>画像</h2><div class="ys-images">${imgTile("アイコン", g.group_icon)}${imgTile("カバー", g.cover_image, true)}</div></div>`;
    } else if (tab === "data") {
      body = `<div class="ys-pad"><p class="up-muted">サークルAPIが返したすべての項目です。yay.space に表示されない設定も含みます。</p></div>${allData(g)}`.replace('<details class="ys-raw">', '<details class="ys-raw" open>');
    }
    app.innerHTML = `${crumb}<section class="ys-box ys-user ys-groupbox">
      <div class="ys-cover">${cover ? `<img src="${esc(cover)}" alt=""><button class="ys-cover-btn" type="button" data-zoom="${esc(cover)}" aria-label="カバー画像を拡大"></button>` : ""}<a class="ys-menu" href="https://yay.space/group/${esc(g.id)}" target="_blank" rel="noopener" title="Yay! で開く" aria-label="Yay! で開く">↗</a></div>
      <div class="ys-profile">
        <button class="ys-avatar sq" type="button" ${icon ? `data-zoom="${esc(icon)}"` : "disabled"} aria-label="アイコンを拡大">${icon ? `<img src="${esc(icon)}" alt="">` : `<b>${esc(Array.from(String(g.topic || "?"))[0])}</b>`}</button>
        <h1 class="ys-name">${esc(g.topic)}${TITLE_JA[g.title] ? `<span class="ys-ubs"><span class="ys-ub ys-ub-${g.title}">${TITLE_JA[g.title]}</span></span>` : ""}</h1>
        <div class="ys-sub">サークルID ${esc(g.id)}${g.created_at ? ` · 作成 ${fmtDate(g.created_at, false)}` : ""} · 更新 ${ago(g.updated_at)}</div>
        <div class="ys-badges">${flags.map(([c, t]) => `<span class="ys-badge${c ? ` ys-badge-${c}` : ""}">${esc(t)}</span>`).join("")}</div>
        ${g.description ? foldText(g.description) : ""}
        <div class="ys-dl">${rlink(`group/${id}/members`, `<b>${num(g.groups_users_count)}</b><em>メンバー</em>`)}<span><b>${num(g.posts_count)}</b><em>投稿</em></span><span><b>${num(g.views_count)}</b><em>閲覧</em></span>${g.owner ? `<span><em>管理人</em> ${userChip(g.owner)}</span>` : ""}</div>
        <div class="ys-actions"><a class="ys-btn" href="https://yay.space/group/${esc(g.id)}" target="_blank" rel="noopener">Yay! で開く</a></div>
      </div>
      <nav class="ys-tabs" aria-label="サークルの情報">${GROUP_TABS.map(([k, l]) => rlink(`group/${id}${k ? `/${k}` : ""}`, `<b>${l}</b><small>${k === "" ? num(g.posts_count) : k === "members" ? num(g.groups_users_count) : k === "related" ? num(g.related_count) : "&nbsp;"}</small>`, `ys-tab${k === tab ? " active" : ""}`)).join("")}</nav>
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
  function personRow2(x, extraTags = "") {
    if (!x) return "";
    const a = avatarOf(x);
    return `<li class="fl-row">${rlink(`user/${x.id}`, `<span class="fl-ava sm">${a ? `<img src="${esc(a)}" alt="" loading="lazy">` : initial(x)}${x.online_status === "online" ? "<i></i>" : ""}</span><span class="fl-copy"><span class="fl-name">${esc(x.nickname || x.id)}${roleBadges(x)}</span>${x.biography ? `<span class="fl-bio">${esc(String(x.biography).replace(/\s+/g, " ").slice(0, 80))}</span>` : ""}<span class="fl-tags">${extraTags}${followerTags(x)}${extraUserTags(x)}</span></span>`, "fl-main")}<a class="fl-btn" href="https://yay.space/user/${esc(x.id)}" target="_blank" rel="noopener">＋ フォロー</a></li>`;
  }

  /* ---- circle list ---- */
  function renderGroups(mode, val) {
    ensureCats();
    document.title = "サークル - Yay! ユーザー情報";
    const ctx = mode === "category" ? `cat|${val}` : mode === "search" ? `q|${val}` : "all|";
    const L = feed(`groups:${ctx}`);
    app.innerHTML = `${crumbs([["サークル", mode ? "groups" : null], ...(mode === "category" ? [[catName(val) || "カテゴリ"]] : mode === "search" ? [[`「${val}」`]] : [])])}${subnav("groups")}
      <section class="ys-box">
        <h2 class="ys-box-title">サークル検索</h2>
        <form class="ys-toolbar ys-inline-search" data-route-search="groups/search/"><input name="q" value="${esc(mode === "search" ? val : "")}" placeholder="サークル名" aria-label="サークル名" enterkeyhint="search"><button class="ys-btn ys-btn-primary" type="submit">検索</button></form>
        <div class="ys-cats">${rlink("groups", "全て", `ys-chip-btn${!mode ? " on" : ""}`)}${(groupCats || []).map(c => rlink(`groups/category/${c.id}`, esc(c.name), `ys-chip-btn${mode === "category" && String(val) === String(c.id) ? " on" : ""}`)).join("")}</div>
      </section>
      <section class="ys-box ys-list-box">${feedBlock("groups", L, groupCard, "件", "サークルが見つかりませんでした。")}</section>`;
    startFeeds([["groups", L, "groupList", ctx]]);
  }

  /* ---- timelines ---- */
  function callRow(p) {
    const c = p.conference_call || {}, users = c.conference_call_users || [], pu = p.user || {};
    return `<article class="ys-callrow">
      <div class="ys-callrow-head">${rlink(`user/${pu.id}`, avatarOf(pu) ? `<img src="${esc(avatarOf(pu))}" alt="" loading="lazy">` : initial(pu), "ys-post-ava sm", ' tabindex="-1" aria-hidden="true"')}
        <div class="ys-callrow-copy"><span class="ys-callrow-live">${c.call_type === "video" ? "ビデオ通話中" : "通話中"} · ${ago(p.created_at)}に開始</span><b>${rlink(`post/${p.id}`, esc(p.text || "（タイトルなし）"))}</b><span class="up-muted">${rlink(`user/${pu.id}`, esc(pu.nickname || pu.id))}${p.group_id ? ` · ${rlink(`group/${p.group_id}`, "サークルの通話")}` : ""}</span></div>
        <span class="ys-callrow-count">${num(c.conference_call_users_count)}${c.max_participants ? `/${num(c.max_participants)}` : ""}人</span></div>
      <div class="ys-callrow-people">${users.map(x => userChip(x)).join("")}${c.anonymous_call_users_count ? `<span class="fl-tag">匿名 ${num(c.anonymous_call_users_count)}人</span>` : ""}</div>
      <div class="ys-callrow-meta"><span>参加できる人 ${esc({ anyone: "全員", users: "全員", followers: "フォロワー", mutual_follows: "相互フォロー" }[c.joinable_by] || c.joinable_by || "—")}</span>${c.game ? `<span>ゲーム ${esc(c.game.title || c.game.name || "")}</span>` : ""}${c.genre ? `<span>ジャンル ${esc(c.genre.title || c.genre.name || "")}</span>` : ""}${c.locked ? "<span>ロック中</span>" : ""}<span>いいね ${num(p.likes_count)}</span></div>
      ${allData(p, "この通話のすべてのデータ")}
    </article>`;
  }
  function renderTimeline(kind, tag) {
    if (kind === "hashtag") {
      document.title = `#${tag} - Yay! ユーザー情報`;
      const L = feed(`tag:${tag}`);
      app.innerHTML = `${crumbs([["タイムライン", "timeline"], [`#${tag}`]])}${subnav("")}
        <section class="ys-box ys-list-box"><h2 class="ys-box-title">#${esc(tag)} <small>${num(L.items.length)}件</small></h2>${summary(L.items)}${feedBlock("tag", L, p => postCard(p), "件", "この タグの投稿はありません。")}</section>`;
      return startFeeds([["tag", L, "hashtag", tag]]);
    }
    if (kind === "calls") {
      document.title = "通話中 - Yay! ユーザー情報";
      const L = feed("calls");
      const people = L.items.reduce((a, p) => a + Number(p.conference_call?.conference_call_users_count || 0), 0);
      app.innerHTML = `${crumbs([["タイムライン", "timeline"], ["通話中"]])}${subnav("timeline/calls")}
        <section class="ys-box ys-list-box"><h2 class="ys-box-title">いま公開されている通話 <small>${num(L.items.length)}件 · ${num(people)}人が参加中</small></h2>${feedBlock("calls", L, callRow, "件", "いま公開されている通話はありません。")}</section>`;
      return startFeeds([["calls", L, "callTimeline", ""]]);
    }
    document.title = "タイムライン - Yay! ユーザー情報";
    const L = feed("timeline");
    app.innerHTML = `${crumbs([["タイムライン"]])}${subnav("timeline")}
      <section class="ys-box ys-list-box"><h2 class="ys-box-title">オープンタイムライン</h2>${summary(L.items)}${feedBlock("timeline", L, p => postCard(p), "件", "投稿がありません。")}</section>`;
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
    let body = `<div class="ys-empty">キーワードを入れて検索してください。#から始めるとハッシュタグを開きます。</div>`, pairs = [];
    if (q) {
      const L = feed(`search:${type}:${q}:${type === "posts" ? searchOpts.media : type === "users" ? `${searchOpts.scope}:${searchOpts.noGomi}` : ""}`);
      const row = type === "posts" ? (p => postCard(p)) : type === "users" ? (u => `<ul class="fl-list">${personRow2(u)}</ul>`) : groupCard;
      body = feedBlock("search", L, row, type === "users" ? "人" : "件", "見つかりませんでした。");
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
      <section class="ys-box ys-list-box"><h2 class="ys-box-title">${title} <small>${num(L.items.length)}人</small></h2>${nav}
        <ul class="fl-list">${L.items.map((u, i) => personRow2(u, kind === "ranking" ? `<span class="fl-tag p">${i + 1}位</span>` : "")).join("")}</ul>${emptyMsg(L, "ユーザーがいません。")}${more("users", L, "人")}</section>`;
    startFeeds([["users", L, pager, ctx]]);
  }

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
        <button type="button" data-lb="close" aria-label="閉じる">✕</button></div>
      <div class="up-lb-stage">${m.type === "video" ? `<video src="${esc(m.src)}" controls autoplay playsinline poster="${esc(m.thumb || "")}"></video>` : `<img src="${esc(m.src)}" alt="">`}</div>
      ${multi ? `<button type="button" class="up-lb-nav prev" data-lb="prev" aria-label="前へ">‹</button><button type="button" class="up-lb-nav next" data-lb="next" aria-label="次へ">›</button>` : ""}
      ${m.post?.text ? `<p class="up-lb-caption">${esc(String(m.post.text).slice(0, 200))}</p>` : ""}`;
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
    if (t.dataset.sopt) {
      const [k, v] = t.dataset.sopt.split(":");
      if (v) searchOpts[k] = v; else searchOpts[k] = !searchOpts[k];
      return renderPage();
    }
    if (t.dataset.copytext != null) {
      const old = t.textContent;
      try { await navigator.clipboard.writeText(t.dataset.copytext); t.textContent = "コピーしました"; } catch { t.textContent = "コピーできませんでした"; }
      setTimeout(() => { t.textContent = old; }, 1600); return;
    }
    if (t.dataset.copy != null || t.hasAttribute("data-copyjson")) {
      const text = t.hasAttribute("data-copyjson") ? JSON.stringify(JSON.parse(JSON.stringify({ profile: S.core.user, timeline_user: S.core.tlUser, active_call: S.core.call }, (k, v) => (/token/i.test(k) && v ? "（安全のため表示しません）" : v))), null, 2) : t.dataset.copy;
      const old = t.textContent;
      try { await navigator.clipboard.writeText(text); t.textContent = "コピーしました"; } catch { t.textContent = "コピーできませんでした"; }
      setTimeout(() => { t.textContent = old; }, 1600);
    }
  });
  app.addEventListener("input", e => {
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
