/* Shared "pick someone who liked the post" dialog (https://yay.space/post/615116972).
   Anyone who likes that post appears here, so they can be found by name quickly. */
(() => {
  "use strict";
  const ROOT = "https://proxy.cors.dev/https://api.yay.space", POST_ID = "615116972", POST_URL = `https://yay.space/post/${POST_ID}`;
  const MAX_PAGES = 40;
  const st = { users: [], seen: new Set(), from: null, done: false, loading: false, error: false, pages: 0 };
  let modal, listEl, moreEl, inputEl, onPick = null, query = "", tok = 0;
  const norm = s => String(s || "").normalize("NFKC").toLowerCase();
  const matches = n => { const t = norm(n); return norm(query).split(/\s+/).filter(Boolean).every(x => t.includes(x)); };
  const isOpen = () => modal && !modal.classList.contains("hidden");
  function el(tag, props = {}, ...kids) { const n = document.createElement(tag); Object.assign(n, props); kids.forEach(k => n.append(k)); return n; }

  function build() {
    if (modal) return;
    inputEl = el("input", { className: "pc-in", placeholder: "名前で探す", autocomplete: "off", spellcheck: false });
    listEl = el("div", { className: "pc-picklist", tabIndex: 0 }); moreEl = el("p", { className: "subtle" });
    const close = el("button", { type: "button", className: "secondary-btn", textContent: "閉じる" });
    const link = el("a", { href: POST_URL, target: "_blank", rel: "noopener", textContent: "この投稿を開く", className: "lk-link" });
    link.dataset.yayExternal = "1"; // opened to like the post on yay.space, so it stays there
    modal = el("div", { className: "pc-modal lk hidden", role: "dialog" },
      el("div", { className: "pc-modal-card panel" },
        el("div", { className: "pc-modal-head" }, el("b", { textContent: "いいねした人から探す" }), close),
        el("p", { className: "subtle", textContent: "この投稿に「いいね」すると、あなたもここに出てきます。" }), link,
        el("label", { className: "pc-field" }, "名前で探す", inputEl), listEl, moreEl));
    document.body.append(modal);
    close.onclick = closeModal; modal.addEventListener("pointerdown", e => { if (e.target === modal) closeModal(); });
    inputEl.addEventListener("input", () => { query = inputEl.value; filter(); search(); });
    listEl.addEventListener("scroll", () => { if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 60) load(); });
    document.addEventListener("keydown", e => { if (isOpen() && e.key === "Escape") { e.stopPropagation(); closeModal(); } }, true);
  }
  function filter() {
    const q = query.trim(); let shown = 0;
    [...listEl.children].forEach(b => { const ok = !q || matches(b.dataset.n); b.hidden = !ok; if (ok) shown++; });
    return { q, shown };
  }
  function text() {
    const { q, shown } = filter();
    if (q) return shown ? `「${q}」に合う人: ${shown}人${st.done ? "" : `（${st.users.length}人を確認済み。続きを探しています…）`}` : st.done ? `「${q}」に合う人は見つかりませんでした。` : `探しています…（${st.users.length}人を確認済み）`;
    return st.done ? (st.users.length ? "これで全員です。" : "まだ誰もいいねしていません。") : "一番下までスクロールすると、続きを読み込みます。";
  }
  async function load() {
    if (st.loading || st.done) return; st.loading = true; st.error = false; moreEl.textContent = "読み込み中…";
    try {
      const res = await window.YayAPI.fetch(`${ROOT}/v1/posts/${POST_ID}/likers${st.from ? `?from_id=${encodeURIComponent(st.from)}` : ""}`, { headers: { Accept: "application/json" } });
      let d = null; try { d = await res.json(); } catch { /* below */ }
      if (res.status === 429 || Number(d?.error_code) === 429) { st.done = true; throw new Error("APIのアクセス制限を検出したため、処理を停止しました。時間をおいて開き直してください。"); }
      if (!res.ok || !d || (d.result && d.result !== "success")) throw new Error(d?.message || `読み込めませんでした (HTTP ${res.status})`);
      const fresh = (Array.isArray(d.users) ? d.users : []).filter(u => u && u.id != null && !st.seen.has(String(u.id)));
      fresh.forEach(u => {
        st.seen.add(String(u.id)); st.users.push(u);
        const b = el("button", { type: "button", className: "pc-pick-item" }, el("img", { src: u.profile_icon_thumbnail || u.profile_icon || "", alt: "", loading: "lazy", referrerPolicy: "no-referrer" }), el("span", { textContent: u.nickname || `@${u.id}` }));
        b.dataset.n = u.nickname || ""; b.onclick = () => pick(u); listEl.append(b);
      });
      st.pages++; const next = d.last_id != null ? String(d.last_id) : null;
      if (!fresh.length || !next || next === st.from || st.pages >= MAX_PAGES) st.done = true; else st.from = next;
      moreEl.textContent = text();
    } catch (e) { st.error = true; moreEl.textContent = e.message; }
    finally { st.loading = false; }
    if (!st.done && !st.error && isOpen() && listEl.scrollHeight <= listEl.clientHeight + 4) load();
  }
  async function search() {
    const t = ++tok; moreEl.textContent = text();
    while (t === tok && !st.done && !st.error && isOpen()) {
      const { q, shown } = filter(); if (!q || shown >= 8) break;
      if (st.loading) { await new Promise(r => setTimeout(r, 200)); continue; }
      await load();
    }
    if (t === tok && !st.error) moreEl.textContent = text();
  }
  function pick(u) { const cb = onPick; closeModal(); if (cb) cb(u); }
  function closeModal() { if (modal) modal.classList.add("hidden"); document.body.classList.remove("pc-modal-open"); onPick = null; tok++; }
  function open(cb) {
    build(); onPick = cb; query = ""; inputEl.value = ""; tok++;
    Object.assign(st, { users: [], seen: new Set(), from: null, done: false, loading: false, error: false, pages: 0 }); listEl.innerHTML = "";   // reload so new likes show up
    modal.classList.remove("hidden"); document.body.classList.add("pc-modal-open"); load();
  }
  window.YayLikers = { open };

  // letter map: "いいねした人から探す" fills the account box with the chosen user's ID
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("likersBtn"), input = document.getElementById("userInput"); if (!btn || !input) return;
    btn.addEventListener("click", () => open(u => { input.value = String(u.id); input.dispatchEvent(new Event("input", { bubbles: true })); const go = document.getElementById("analyzeBtn"); if (go) { go.scrollIntoView({ block: "center", behavior: "smooth" }); go.focus({ preventScroll: true }); } }));
  });
})();
