/* Yay! user card ("ユーザー証"): a licence-style card made from a user's public profile.
 * It is an unofficial, for-fun card and says so on the card itself. */
(() => {
  "use strict";
  const ROOT = "https://proxy.cors.dev/https://api.yay.space", API = `${ROOT}/v2`;
  const W = 1200, H = 860;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const showErr = m => { $("lcError").textContent = m; $("lcError").classList.toggle("hidden", !m); };
  const SANS = "system-ui,'Noto Sans JP','Yu Gothic UI',Meiryo,sans-serif";
  const SERIF = "'Noto Serif JP','Yu Mincho','Hiragino Mincho ProN',serif";
  const MONO = "ui-monospace,'SF Mono',Consolas,monospace";
  const THEMES = {
    blue:  { bg1: "#f1f7fd", bg2: "#cfe3f4", line: "#8fbbe0", accent: "#1d6fc4", head: "#e9cfc6" },
    green: { bg1: "#f2faf0", bg2: "#cfe8cb", line: "#8cc588", accent: "#1f8a43", head: "#e6d6bd" },
    gold:  { bg1: "#fdf6df", bg2: "#f0dfa8", line: "#d2b45c", accent: "#9a6200", head: "#ecc9b5" },
    pink:  { bg1: "#fff3f7", bg2: "#f6d3e2", line: "#e49cbc", accent: "#c2336f", head: "#efd0c8" }
  };
  const S = { user: null, hd: null, av: null, logo: null, creator: null, stats: null };

  /* ---------- network (same approach as the other pages) ---------- */
  async function getJson(url) {
    const res = await window.YayAPI.fetch(url, { headers: { Accept: "application/json" } });
    let d = null; try { d = await res.json(); } catch { /* handled below */ }
    if (res.status === 429 || Number(d?.error_code) === 429) { const e = new Error("アクセス制限を検出したため、処理を停止しました。時間をおいて再実行してください。"); e.stop = true; throw e; }
    if (res.status === 404) { const e = new Error("not found"); e.notFound = true; throw e; }
    if (!res.ok || !d || (d.result && d.result !== "success")) throw new Error(d?.message || `通信エラー (HTTP ${res.status})`);
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
      } catch { /* try the next route */ }
    }
    return null;
  }

  /* ---------- dates ---------- */
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  function eraOf(d) {
    if (d >= new Date(2019, 4, 1)) return { n: "令和", y: d.getFullYear() - 2018 };
    if (d >= new Date(1989, 0, 8)) return { n: "平成", y: d.getFullYear() - 1988 };
    return { n: "昭和", y: d.getFullYear() - 1925 };
  }
  // pieces of a date, so the digits can be drawn big and the kanji small, like on a licence
  function eraParts(d) { const e = eraOf(d); return [[e.n, 0], [pad(e.y), 1], ["年", 0], [pad(d.getMonth() + 1), 1], ["月", 0], [pad(d.getDate()), 1], ["日", 0]]; }
  function span(from, to) {
    let y = to.getFullYear() - from.getFullYear(), m = to.getMonth() - from.getMonth(), d = to.getDate() - from.getDate();
    if (d < 0) { m--; d += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    return { y: Math.max(0, y), m, d, days: Math.max(1, Math.floor((to - from) / 864e5)) };
  }
  function ago(sec) {
    const t = Number(sec); if (!t) return "—"; const d = Math.max(0, Date.now() / 1000 - t);
    if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}分前`; if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
    if (d < 86400 * 365) return `${Math.floor(d / 86400)}日前`; return `${Math.floor(d / 86400 / 365)}年前`;
  }
  // numbers from the latest posts of the timeline (the user's own posts only; reposts are left out of the averages)
  function activity(posts, id) {
    const mine = (posts || []).filter(p => p.user && String(p.user.id) === String(id)); if (!mine.length) return null;
    const orig = mine.filter(p => p.post_type !== "repost"), base = orig.length ? orig : mine, n = base.length;
    return { n, likes: base.reduce((a, p) => a + Number(p.likes_count || 0), 0) / n, reply: base.filter(p => p.in_reply_to).length / n, latest: Math.max(...mine.map(p => Number(p.created_at || 0))) };
  }
  const num = v => (v == null || v === "" || isNaN(Number(v))) ? "—" : Number(v).toLocaleString("ja-JP");

  /* ---------- drawing ---------- */
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  function cover(c, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return;
    const k = Math.max(w / iw, h / ih); c.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
  }
  function fitSize(c, str, maxW, size, weight, font, min = 14) {
    for (let s = size; s >= min; s -= 2) { c.font = `${weight} ${s}px ${font}`; if (c.measureText(str).width <= maxW) return s; }
    return min;
  }
  function ellipsize(c, str, maxW) {
    const a = Array.from(str); if (c.measureText(str).width <= maxW) return str;
    while (a.length > 1 && c.measureText(a.join("") + "…").width > maxW) a.pop(); return a.join("") + "…";
  }
  // draws [text, big?] pieces on one baseline; returns the total width
  function mixed(c, parts, x, cy, big, small, font, align) {
    const ws = parts.map(([t, b]) => { c.font = `${b ? 700 : 500} ${b ? big : small}px ${font}`; return c.measureText(t).width + (b ? 4 : 2); });
    const total = ws.reduce((a, b) => a + b, 0); let px = align === "center" ? x - total / 2 : x;
    c.textBaseline = "alphabetic"; c.textAlign = "left";
    parts.forEach(([t, b], i) => { c.font = `${b ? 700 : 500} ${b ? big : small}px ${font}`; c.fillText(t, px, cy + big * .36); px += ws[i]; });
    return total;
  }
  function label(c, text, x, y, w, h, ink) {
    c.save(); c.fillStyle = "rgba(255,255,255,.55)"; c.strokeStyle = ink; c.lineWidth = 2; rr(c, x, y, w, h, 8); c.fill(); c.stroke();
    c.fillStyle = ink; c.font = `600 ${Math.min(22, h * .55)}px ${SANS}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, x + w / 2, y + h / 2 + 1); c.restore();
  }
  function field(c, x, y, w, h, ink) { c.save(); c.fillStyle = "rgba(255,255,255,.72)"; c.strokeStyle = ink; c.lineWidth = 2.4; rr(c, x, y, w, h, 12); c.fill(); c.stroke(); c.restore(); }

  function render(c) {
    const u = S.user, T = THEMES[$("lcTheme").value] || THEMES.blue, ink = "#1c1c22", now = new Date();
    const made = u.created_at ? new Date(Number(u.created_at) * 1000) : null, ok = made && !isNaN(made);
    c.clearRect(0, 0, W, H); c.save(); rr(c, 0, 0, W, H, 36); c.clip();
    // paper
    let g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, T.bg1); g.addColorStop(1, T.bg2); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // fine wavy security lines
    c.save(); c.strokeStyle = T.line; c.globalAlpha = .38; c.lineWidth = 1.2;
    for (let k = 0; k < 18; k++) { c.beginPath(); for (let x = 0; x <= W; x += 12) { const y = 230 + k * 36 + Math.sin(x / 90 + k * .7) * 16 + Math.sin(x / 33 + k) * 4; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    c.restore();
    // banner
    const bh = 188;
    if (S.hd) { c.save(); c.beginPath(); c.rect(0, 0, W, bh); c.clip(); cover(c, S.hd, 0, 0, W, bh); c.restore(); } else { g = c.createLinearGradient(0, 0, W, bh); g.addColorStop(0, T.accent); g.addColorStop(1, "#1b2a55"); c.fillStyle = g; c.fillRect(0, 0, W, bh); }
    g = c.createLinearGradient(0, 0, 0, bh); g.addColorStop(0, "rgba(0,0,0,.38)"); g.addColorStop(.55, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.18)"); c.fillStyle = g; c.fillRect(0, 0, W, bh);
    c.fillStyle = ink; c.fillRect(0, bh, W, 4);
    c.fillStyle = "rgba(10,12,24,.55)"; rr(c, 28, 22, 330, 44, 22); c.fill();
    c.fillStyle = "#fff"; c.font = `700 24px ${SANS}`; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText("Yay! ユーザー証", 48, 45);
    c.fillStyle = "rgba(10,12,24,.55)"; rr(c, W - 28 - 190, 22, 190, 44, 22); c.fill();
    c.fillStyle = "#fff"; c.font = `600 20px ${SANS}`; c.textAlign = "center"; c.fillText("非公式", W - 28 - 95, 45);

    // 氏名 + 登録日
    label(c, "氏名", 36, 236, 76, 44, ink); field(c, 122, 214, 640, 88, ink);
    const name = String(u.nickname || `User ${u.id}`), ns = fitSize(c, name, 580, 58, 700, SERIF, 24);
    c.font = `700 ${ns}px ${SERIF}`; c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "middle";
    const letters = Array.from(name);
    if (letters.length <= 7) { const wsum = letters.reduce((a, ch) => a + c.measureText(ch).width, 0), gap = Math.min(ns * .8, (580 - wsum) / Math.max(1, letters.length - 1)); let px = 122 + 320 - (wsum + gap * (letters.length - 1)) / 2; c.textAlign = "left"; letters.forEach(ch => { c.fillText(ch, px, 259); px += c.measureText(ch).width + gap; }); }
    else c.fillText(ellipsize(c, name, 580), 122 + 320, 259);
    field(c, 776, 214, 388, 88, ink); c.fillStyle = ink;
    if (ok) { mixed(c, [...eraParts(made), ["登録", 0]], 776 + 194, 258, 38, 22, SERIF, "center"); } else { c.font = `600 26px ${SANS}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("登録日 不明", 776 + 194, 258); }

    // 所在 (profile address)
    label(c, "所在", 36, 324, 76, 44, ink); field(c, 122, 318, 658, 56, ink);

    const regions = {
        "北海道地方": ["北海道"],

        "東北地方": [
            "青森県", "岩手県", "宮城県",
            "秋田県", "山形県", "福島県"
        ],

        "関東地方": [
            "茨城県", "栃木県", "群馬県",
            "埼玉県", "千葉県", "東京都", "神奈川県"
        ],

        "中部地方": [
            "新潟県", "富山県", "石川県",
            "福井県", "山梨県", "長野県",
            "岐阜県", "静岡県", "愛知県"
        ],

        "近畿地方": [
            "三重県", "滋賀県", "京都府",
            "大阪府", "兵庫県", "奈良県", "和歌山県"
        ],

        "中国地方": [
            "鳥取県", "島根県", "岡山県",
            "広島県", "山口県"
        ],

        "四国地方": [
            "徳島県", "香川県", "愛媛県", "高知県"
        ],

        "九州地方": [
            "福岡県", "佐賀県", "長崎県",
            "熊本県", "大分県", "宮崎県",
            "鹿児島県", "沖縄県"
        ],

        "海外": [
            "海外"
        ]
    };

    function findRegion(input) {
        const name = input.trim().replace(/\s/g, "");

        for (const [region, prefectures] of Object.entries(regions)) {
            for (const prefecture of prefectures) {
                const shortName = prefecture.replace(/[都道府県]/g, "");

                if (name === prefecture || name === shortName) {
                    return region;
                }
            }
        }

        return "不明";
    }

    const addr = `${u.prefecture ? findRegion(u.prefecture) : "yay.space/user/" + u.id}`;
    c.fillStyle = ink; c.font = `600 ${fitSize(c, addr, 620, 30, 600, SERIF, 16)}px ${SERIF}`; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(addr, 144, 347);

    // 交付 + 条件等
    label(c, "交付", 36, 392, 76, 38, ink); c.fillStyle = ink;
    mixed(c, eraParts(now), 126, 412, 30, 18, SERIF, "left");
    label(c, "条件等", 440, 392, 84, 38, ink);
    const avg = ok ? (Number(u.posts_count || 0) / span(made, now).days) : null;
    c.fillStyle = ink; c.font = `700 24px ${SANS}`; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(avg == null ? "—" : `1日平均 ${avg.toFixed(avg < 10 ? 1 : 0)} 投稿`, 540, 412);

    // account age bar (the tan "valid until" bar of a licence)
    c.save(); c.fillStyle = "#c8a56e"; c.strokeStyle = ink; c.lineWidth = 2; rr(c, 36, 446, 744, 60, 6); c.fill(); c.stroke();
    let bar = "登録日がわからないため、利用期間は表示できません";
    if (ok) { const sp = span(made, now), e = eraOf(made); bar = `${made.getFullYear()}年(${e.n}${pad(e.y)}年)${pad(made.getMonth() + 1)}月${pad(made.getDate())}日から ${sp.y}年${sp.m}か月${sp.d}日 利用中`; }
    c.fillStyle = "#1d1206"; c.font = `700 ${fitSize(c, bar, 716, 32, 700, SANS, 16)}px ${SANS}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(bar, 36 + 372, 477); c.restore();

    // 番号 (user id)
    c.save(); c.fillStyle = "rgba(255,255,255,.55)"; c.strokeStyle = ink; c.lineWidth = 2; rr(c, 36, 530, 62, 76, 8); c.fill(); c.stroke();
    c.fillStyle = ink; c.font = `600 22px ${SANS}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("番", 67, 556); c.fillText("号", 67, 582);
    c.font = `500 36px ${SERIF}`; c.textAlign = "left"; c.fillText("第", 114, 570);
    const id = String(u.id), step = Math.min(46, 520 / id.length); c.font = `700 ${Math.round(step * 1.2)}px ${MONO}`; c.textAlign = "center";
    for (let i = 0; i < id.length; i++) c.fillText(id[i], 190 + step * i + step / 2, 570);
    c.font = `500 36px ${SERIF}`; c.textAlign = "left"; c.fillText("号", 190 + step * id.length + 18, 570); c.restore();

    // numbers table
    const cols = [["フォロワー", u.followers_count], ["フォロー中", u.followings_count ?? u.following_count], ["投稿", u.posts_count], ["レター", u.reviews_count]], cw = 744 / 4;
    c.save(); c.strokeStyle = ink; c.lineWidth = 2;
    cols.forEach(([lab, val], i) => {
      const x = 36 + cw * i;
      c.fillStyle = T.head; c.fillRect(x, 626, cw, 38); c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(x, 664, cw, 52); c.strokeRect(x, 626, cw, 38); c.strokeRect(x, 664, cw, 52);
      c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "middle"; c.font = `600 21px ${SANS}`; c.fillText(lab, x + cw / 2, 646);
      const t = num(val); c.font = `700 ${fitSize(c, t, cw - 16, 34, 700, SERIF, 18)}px ${SERIF}`; c.fillText(t, x + cw / 2, 691);
    });
    c.restore();

    // recent activity (login streak, circles, and numbers from the latest posts)
    const st = S.stats, cols2 = [["連続ログイン", u.login_streak_count != null ? `${num(u.login_streak_count)}日` : "—"], ["サークル", num(u.groups_users_count)],
      ["直近の平均いいね", st ? st.likes.toFixed(1) : "—"], ["返信の割合", st ? `${Math.round(st.reply * 100)}%` : "—"], ["最終ログイン", ago(u.last_loggedin_at)], ["最新の投稿", st ? ago(st.latest) : "—"]], cw2 = (W - 72) / 6;
    c.save(); c.strokeStyle = ink; c.lineWidth = 2;
    cols2.forEach(([lab, val], i) => {
      const x = 36 + cw2 * i;
      c.fillStyle = T.head; c.fillRect(x, 732, cw2, 34); c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(x, 766, cw2, 46); c.strokeRect(x, 732, cw2, 34); c.strokeRect(x, 766, cw2, 46);
      c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "middle"; c.font = `600 ${fitSize(c, lab, cw2 - 12, 18, 600, SANS, 12)}px ${SANS}`; c.fillText(lab, x + cw2 / 2, 749);
      c.font = `700 ${fitSize(c, val, cw2 - 16, 30, 700, SERIF, 16)}px ${SERIF}`; c.fillText(val, x + cw2 / 2, 790);
    });
    c.restore();
    // badges from public flags
    const chips = []; if (u.mobile_verified) chips.push("電話認証"); if (u.age_verified) chips.push("年齢確認"); if (u.vip && !u.hide_vip) chips.push("VIP"); if (u.title) chips.push(String(u.title).slice(0, 10));
    c.save(); c.font = `700 16px ${SANS}`; c.textBaseline = "middle"; c.textAlign = "center"; let bx = 852;
    chips.forEach(t => { const w = c.measureText(t).width + 22; if (bx + w > 1164) return; c.fillStyle = T.head; c.strokeStyle = ink; c.lineWidth = 1.8; rr(c, bx, 696, w, 28, 14); c.fill(); c.stroke(); c.fillStyle = ink; c.fillText(t, bx + w / 2, 710.5); bx += w + 8; });
    c.restore();

    // vertical title
    c.fillStyle = T.accent; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `800 26px ${SANS}`; c.fillText("Yay!", 815, 338);
    c.font = `800 58px ${SANS}`; ["会", "員", "証"].forEach((ch, i) => c.fillText(ch, 815, 400 + i * 74));

    // photo (profile picture)
    const px = 852, py = 318, pw = 312, ph = 330;
    c.save(); c.fillStyle = "#fff"; rr(c, px - 4, py - 4, pw + 8, ph + 8, 8); c.fill(); rr(c, px, py, pw, ph, 5); c.clip();
    if (S.av) cover(c, S.av, px, py, pw, ph); else { c.fillStyle = T.line; c.fillRect(px, py, pw, ph); }
    c.restore(); c.strokeStyle = ink; c.lineWidth = 2.5; rr(c, px - 4, py - 4, pw + 8, ph + 8, 8); c.stroke();
    c.fillStyle = ink; c.font = `600 20px ${SANS}`; c.textAlign = "center"; c.textBaseline = "middle";
    if (u.gender === 0) {
      c.fillText("男性", px + pw / 2, 676);
    } else {
      c.fillText("女性", px + pw / 2, 676);
    }
    // red seal
    c.save(); c.translate(1112, 632); c.rotate(-.2); c.strokeStyle = "rgba(205,40,50,.88)"; c.fillStyle = "rgba(205,40,50,.88)"; c.lineWidth = 3.5;
    c.beginPath(); c.arc(0, 0, 36, 0, 7); c.stroke(); c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.stroke();
    c.font = `800 21px ${SANS}`;
    c.textAlign = "center";
    c.textBaseline = "middle"; 
    if (u.login_streak_count != undefined) {
      c.fillText("公開", 0, 1); c.restore();
    } else {
      c.fillText("非公開", 0, 1); c.restore();
    }

    // footer strip: credit (always) and logo (optional)
    c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(0, H - 44, W, 44);
    const cr = S.creator; c.fillStyle = "#fff"; c.font = `600 20px ${SANS}`; c.textAlign = "left"; c.textBaseline = "middle";
    c.fillText(`制作: ${cr?.nickname ? Array.from(cr.nickname).slice(0, 18).join("") : "Yay! ID 11044343"}`, 30, H - 22);
    if (S.logo && $("lcLogo").checked) {
      const w0 = S.logo.naturalWidth || 130, h0 = S.logo.naturalHeight || 34, k = Math.min(120 / w0, 28 / h0), lw = Math.round(w0 * k), lh = Math.round(h0 * k);
      const t = document.createElement("canvas"); t.width = lw; t.height = lh; const tg = t.getContext("2d"); tg.drawImage(S.logo, 0, 0, lw, lh); tg.globalCompositeOperation = "source-in"; tg.fillStyle = "#fff"; tg.fillRect(0, 0, lw, lh);
      c.drawImage(t, W - 30 - lw, H - 22 - lh / 2);
    }
    c.restore();
    c.save(); c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 3; rr(c, 1.5, 1.5, W - 3, H - 3, 35); c.stroke(); c.restore();
  }
  const cv = $("lcCanvas"), cx = cv.getContext("2d");
  const draw = () => { if (S.user) render(cx); };

  /* ---------- flow ---------- */
  async function findUser() {
    showErr(""); $("lcUser").classList.add("hidden"); $("lcResult").classList.add("hidden");
    if (!$("lcOwn").checked) return showErr("カードは自分のアカウントでのみ作れます。「自分のアカウントです」にチェックを入れてください。");
    const btn = $("lcFind"); btn.disabled = true;
    try {
      const u = await resolveUser($("lcInput").value); S.user = u;
      $("lcUser").innerHTML = `<img class="pc-ava" src="${esc(u.profile_icon_thumbnail || u.profile_icon || "")}" alt="" referrerpolicy="no-referrer"><div><b>${esc(u.nickname)}</b><small>@${esc(u.id)}</small><p class="subtle">このアカウントでユーザー証を作ります。</p></div><button id="lcStart" class="primary-btn" type="button"><span>ユーザー証を作る</span></button>`;
      $("lcUser").classList.remove("hidden"); $("lcStart").onclick = build;
    } catch (e) { showErr(e.message); } finally { btn.disabled = false; }
  }
  async function build() {
    const u = S.user, btn = $("lcStart"); btn.disabled = true; showErr("");
    try {
      const [hd, av, logo] = await Promise.all([loadImg(u.cover_image || u.cover_image_thumbnail), loadImg(u.profile_icon || u.profile_icon_thumbnail), loadImg("https://yay.space/images/logotype.svg")]);
      S.hd = hd; S.av = av; S.logo = logo; S.stats = null;
      // the latest posts give extra numbers, and their embedded user fills in fields the profile response may leave out
      try {
        const posts = (await get(`/posts/user_timeline?number=50&user_id=${u.id}`)).posts || [];
        const own = posts.map(p => p.user).find(x => x && String(x.id) === String(u.id));
        if (own) for (const k of Object.keys(own)) if (u[k] == null) u[k] = own[k];
        S.stats = activity(posts, u.id);
      } catch { /* the card still works without the timeline */ }
      if (!S.creator) { S.creator = window.__yayCreator || null; if (!S.creator) { try { const d = await get("/users/11044343"); if (d.user?.nickname) S.creator = { nickname: d.user.nickname }; } catch { /* the ID is shown instead */ } } }
      $("lcResult").classList.remove("hidden"); draw(); $("lcResult").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { showErr(`カードを作れませんでした: ${e.message}`); } finally { btn.disabled = false; }
  }
  $("lcFind").onclick = findUser;
  $("lcInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) findUser(); });
  $("lcTheme").addEventListener("change", draw); $("lcLogo").addEventListener("change", draw);
  $("lcLikers").onclick = () => {
    if (!window.YayLikers) return showErr("いいねした人の一覧を読み込めませんでした。ページを再読み込みしてください。");
    window.YayLikers.open(u => { $("lcInput").value = String(u.id); showErr(""); $("lcUser").classList.add("hidden"); $("lcInput").focus(); });
  };
  $("lcSave").onclick = async () => {
    if (!S.user) return; const btn = $("lcSave"); btn.disabled = true; showErr("");
    try {
      const c = document.createElement("canvas"); c.width = W; c.height = H; render(c.getContext("2d"));
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      await window.yaySavePng(blob, `yay-user-card-${S.user.id}.png`);
    } catch (e) { showErr(`画像を生成できませんでした: ${e.message}`); } finally { btn.disabled = false; }
  };
})();
