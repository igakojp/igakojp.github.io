(() => {
  "use strict";
  const API = "https://proxy.cors.dev/https://api.yay.space/v2";
  const ROOT = "https://proxy.cors.dev/https://api.yay.space";
  const DEFAULT_AVATAR = "https://cdn.yay.space/img/default-profile-icon-thumb.png";
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = { userId:null, profile:null, users:new Map(), seenPosts:new Set(), seenReviews:new Set(), seenCalls:new Set(), timelineCount:0, reviewCount:0, pages:0, stopped:false, running:false, totalEvents:0, mapCentered:false };
  let controller = null;
  function avatarOf(u) {
    const raw = u?.profile_icon_thumbnail || u?.profile_icon || u?.profile_icon_url || u?.profile_image_url || u?.profile_image || u?.avatar_url || "";
    let url = typeof raw === "string" ? (raw.startsWith("//") ? `https:${raw}` : raw.startsWith("/") ? `https://yay.space${raw}` : raw) : (raw?.url || raw?.uri || raw?.image_url || "");
    return url || DEFAULT_AVATAR;
  }
  function parseInput(value) {
    const s = String(value || "").trim();
    if (/^\d+$/.test(s)) return s;
    const user = s.match(/(?:users?|profile|u)\/(\d+)(?:[/?#]|$)/i);
    if (user) return user[1];
    const post = s.match(/(?:^|\/)post\/(\d+)(?:[/?#]|$)/i);
    if (post) return { postId: post[1] };
    return null;
  }
  async function apiGet(url) {
    if (state.stopped) throw new DOMException("停止", "AbortError");
    const res = await window.YayAPI.fetch(url, { method:"GET", headers:{Accept:"application/json"}, signal:controller?.signal });
    const body = await res.text();
    let data; try { data = JSON.parse(body); } catch { throw new Error("APIからJSON以外の応答が返されました。"); }
    if (res.status === 429 || Number(data?.error_code) === 429 || /rate.?limit|too many requests|アクセス制限/i.test(String(data?.message || ""))) {
      state.stopped = true; throw new Error("Yay! APIのアクセス制限により処理を停止しました。時間をおいてから再度お試しください。");
    }
    if (Number(data?.error_code) === -363) { const e = new Error("対象アカウントの公開タイムラインを閲覧できません（非公開または閲覧制限）。"); e.code = -363; throw e; }
    if (!res.ok || (data?.result && data.result !== "success")) throw new Error(data?.message || `Yay! API エラー (HTTP ${res.status})`);
    return data;
  }
  function getPosts(data) {
    if (Array.isArray(data?.posts)) return data.posts;
    if (Array.isArray(data?.data?.posts)) return data.data.posts;
    if (Array.isArray(data?.timeline)) return data.timeline;
    if (Array.isArray(data?.data?.timeline)) return data.data.timeline;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }
  function getUser(id, raw) {
    if (!id || Number(id) === state.userId) return null;
    const key = String(id);
    let u = state.users.get(key);
    if (!u) { u = { id:key, nickname:raw?.nickname || raw?.username || `User ${key}`, avatar:avatarOf(raw), interaction:0, letters:0, calls:0, evidence:[] }; state.users.set(key, u); }
    else { if ((!u.nickname || u.nickname === `User ${key}`) && (raw?.nickname || raw?.username)) u.nickname = raw.nickname || raw.username; if (!u.avatar || u.avatar === DEFAULT_AVATAR) u.avatar = avatarOf(raw); }
    return u;
  }
  function addInteraction(post) {
    if (!post || Number(post.user?.id) !== state.userId) return;
    const perPost = new Map();
    for (const m of (Array.isArray(post.mentions) ? post.mentions : [])) {
      if (!m?.id || Number(m.id) === state.userId) continue;
      const id = String(m.id); if (!perPost.has(id)) perPost.set(id, { user:m, reasons:new Set() });
      perPost.get(id).reasons.add("メンション");
    }
    const reply = post.in_reply_to_post?.user;
    if (reply?.id && Number(reply.id) !== state.userId) {
      const id = String(reply.id); if (!perPost.has(id)) perPost.set(id, { user:reply, reasons:new Set() });
      perPost.get(id).reasons.add("返信");
    }
    for (const [id, item] of perPost) {
      const u = getUser(id, item.user); if (!u) continue;
      const key = `post:${post.id}`;
      if (u.evidence.some(e => e.key === key)) continue;
      u.interaction++; u.evidence.push({key, source:"交流", detail:[...item.reasons].join("・"), date:Number(post.created_at || 0), url:`https://yay.space/post/${post.id}`});
    }
  }
  function addCall(post) {
    const call = post?.conference_call;
    if (!call || String(post?.post_type || "").toLowerCase() !== "call") return;
    const callId = String(call.id ?? post.id ?? ""); if (!callId || state.seenCalls.has(callId)) return;
    state.seenCalls.add(callId);
    const participants = Array.isArray(call.conference_call_users) ? call.conference_call_users : [];
    const local = new Set();
    for (const raw of participants) {
      const person = raw?.user || raw?.participant || raw;
      const id = person?.id ?? raw?.user_id; if (!id || Number(id) === state.userId || local.has(String(id))) continue;
      local.add(String(id)); const u = getUser(id, person); if (!u) continue;
      u.calls++; u.evidence.push({key:`call:${callId}`, source:"通話", detail:[call.genre, call.game].filter(Boolean).join("・") || "通話参加", date:Number(post.created_at || call.created_at || 0), url:`https://yay.space/post/${post.id || callId}`});
    }
  }
  async function scanTimeline() {
    let cursor = null; const maxPages = 10000;
    for (let page=0; page<maxPages && !state.stopped; page++) {
      const url = cursor ? `${API}/posts/user_timeline?from_post_id=${encodeURIComponent(cursor)}&number=50&user_id=${state.userId}` : `${API}/posts/user_timeline?number=50&user_id=${state.userId}`;
      const data = await apiGet(url); const posts = getPosts(data); state.pages++;
      if (!posts.length) break;
      let oldest = null;
      for (const post of posts) {
        const id = Number(post?.id); if (!id) continue;
        if (!oldest || id < oldest) oldest = id;
        if (state.seenPosts.has(String(id))) continue;
        state.seenPosts.add(String(id)); state.timelineCount++;
        addInteraction(post); addCall(post);
      }
      updateProgress("公開タイムライン", page+1);
      if (!oldest || String(oldest) === String(cursor)) break;
      cursor = String(oldest);
      // Continue by the oldest post ID even when the API returns fewer than 50 rows.
      await sleep(180);
    }
  }
  async function scanReviews() {
    let cursor = null; const maxPages = 10000;
    for (let page=0; page<maxPages && !state.stopped; page++) {
      const url = cursor ? `${ROOT}/v1/users/reviews/${state.userId}?from_id=${encodeURIComponent(cursor)}&number=50` : `${ROOT}/v1/users/reviews/${state.userId}?number=50`;
      const data = await apiGet(url); const rows = Array.isArray(data.reviews) ? data.reviews : [];
      const pinned = page === 0 && Array.isArray(data.pinned_reviews) ? data.pinned_reviews : [];
      if (!rows.length && !pinned.length) break;
      let oldest = null;
      for (const review of [...pinned, ...rows]) {
        const rid = String(review?.id || ""); if (!rid || state.seenReviews.has(rid)) continue;
        state.seenReviews.add(rid); state.reviewCount++;
        const sender = review.reviewer; const u = getUser(sender?.id, sender); if (!u) continue;
        u.letters++; u.evidence.push({key:`review:${rid}`, source:"レター", detail:review.comment || "レター", date:Number(review.created_at || 0), url:`https://yay.space/user/${state.userId}`});
      }
      const ids = rows.map(r => Number(r?.id)).filter(Boolean); if (ids.length) oldest = Math.min(...ids);
      updateProgress("レター", page+1);
      if (!oldest || String(oldest) === String(cursor) ) break;
      cursor = String(oldest); await sleep(180);
    }
  }
  function sortedUsers() { return [...state.users.values()].map(u => ({...u, total:u.interaction+u.letters+u.calls, points:u.interaction+u.letters+u.calls})).sort((a,b) => b.total-a.total || b.interaction-a.interaction || b.letters-a.letters || b.calls-a.calls || a.nickname.localeCompare(b.nickname,"ja")); }
  function updateProgress(stage, page) {
    $("scanStatus").textContent = state.stopped ? "停止" : stage;
    $("scanTitle").textContent = `${stage}を確認中`;
    $("progressLabel").textContent = `タイムライン ${fmt(state.timelineCount)} 件 · レター ${fmt(state.reviewCount)} 件`;
    $("progressPercent").textContent = `ページ ${fmt(state.pages)}`;
    $("progressFill").style.width = `${Math.min(100, (state.pages % 100) || 2)}%`;
    $("timelineCount").textContent = fmt(state.timelineCount); $("reviewCount").textContent = fmt(state.reviewCount);
    $("callCount").textContent = fmt(state.seenCalls.size); $("peopleCount").textContent = fmt(state.users.size);
    render();
  }
  function initials(name) { return String(name || "?").trim().slice(0,1).toUpperCase() || "?"; }
  function mapPositions(rows) {
    const width=2400,height=2400,cx=1200,cy=1200,n=rows.length; let groups=[];
    if(n<=10) groups=[{items:rows,radius:400,ring:0}];
    else if(n<=30) groups=[{items:rows.slice(0,10),radius:400,ring:0},{items:rows.slice(10),radius:720,ring:1}];
    else groups=[{items:rows.slice(0,10),radius:400,ring:0},{items:rows.slice(10,30),radius:720,ring:1},{items:rows.slice(30),radius:900,ring:2}];
    const points=[]; groups.forEach(g=>g.items.forEach((u,i)=>{const a=i/g.items.length*Math.PI*2-Math.PI/2+g.ring*.11;points.push({u,x:cx+Math.cos(a)*g.radius,y:cy+Math.sin(a)*g.radius,rank:rows.findIndex(x=>x.id===u.id)+1});}));
    return {width,height,cx,cy,points};
  }
  function centerMapOnFirstRender() {
    if(state.mapCentered || $("resultsSection").classList.contains("hidden"))return; const v=$("interactionMap"),c=v?.querySelector(".map-canvas"); if(!v||!c)return;
    v.scrollLeft=Math.max(0,(v.scrollWidth-v.clientWidth)/2);v.scrollTop=Math.max(0,(v.scrollHeight-v.clientHeight)/2);state.mapCentered=true;
  }
  function render() {
    const all=sortedUsers(),limit=Number($("topLimit")?.value||50),filter=($("userFilter")?.value||"").trim().toLowerCase();
    const ranked=all.slice(0,limit),rows=ranked.filter(u=>String(u.id).includes(filter)||u.nickname.toLowerCase().includes(filter));
    const showNames=$("showUsernames")?.checked!==false;
    $("mapUserCount").textContent=`Top ${limit} · ${fmt(rows.length)} / ${fmt(all.length)} 人`;
    if(!rows.length){$("interactionMap").innerHTML=`<div class="empty-state">${all.length?"検索条件に一致するユーザーはいません。":"ユーザーを発見すると、ここに総合交流マップが表示されます。"}</div>`;}
    else {
      const {width,height,cx,cy,points}=mapPositions(rows);
      const lines=points.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="map-link"/>`).join("");
      const nodes=points.map(p=>`<button class="map-node" style="left:${p.x/width*100}%;top:${p.y/height*100}%" data-user="${esc(p.u.id)}" title="${esc(p.u.nickname)} · ${fmt(p.u.total)} 件"><span class="node-avatar-wrap"><span class="avatar-fallback">${esc(initials(p.u.nickname))}</span><img src="${esc(p.u.avatar||DEFAULT_AVATAR)}" alt="${esc(p.u.nickname)}" loading="eager" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'"><span class="node-rank rank-${p.rank<=3?p.rank:"other"}">${p.rank}</span></span>${showNames?`<span class="node-name">${esc(p.u.nickname)}</span>`:""}<span class="node-count">${fmt(p.u.total)} 件</span></button>`).join("");
      const avatar=avatarOf(state.profile),status=state.running?"● スキャン中・随時更新":state.stopped?"■ 停止":"✓ 完了";
      $("interactionMap").innerHTML=`<div class="map-canvas" data-map-width="${width}" data-map-height="${height}"><div class="map-live-status">${status} · ${fmt(all.length)} 人を発見</div><svg class="map-lines" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><circle class="map-orbit" cx="${cx}" cy="${cy}" r="400"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="720"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="900"/>${lines}</svg><div class="map-center" style="left:50%;top:50%"><span class="center-fallback">${esc(initials(state.profile?.nickname))}</span><img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">${showNames?`<b>${esc(state.profile?.nickname||`User ${state.userId}`)}</b>`:""}<span>@${state.userId}</span></div>${nodes}</div>`;
      centerMapOnFirstRender();document.querySelectorAll(".map-node").forEach(el=>el.addEventListener("click",()=>showDetails(el.dataset.user)));
    }
    const total=all.reduce((n,u)=>n+u.total,0);$("totalEvents").textContent=fmt(total);$("totalPeople").textContent=fmt(all.length);$("totalScanned").textContent=fmt(state.timelineCount+state.reviewCount);$("coverageText").textContent=`投稿 ${fmt(state.timelineCount)} 件 · レター ${fmt(state.reviewCount)} 件 · 通話 ${fmt(state.seenCalls.size)} 件`;
  }
  function showDetails(id) {
    const u=state.users.get(String(id));if(!u)return;
    $("detailTitle").textContent=`${u.nickname} · ${fmt(u.total)} 件の交流`;
    const evidence=u.evidence.slice().sort((a,b)=>(b.date||0)-(a.date||0));
    $("detailContent").innerHTML=`<div class="profile-link-row"><a href="https://yay.space/user/${encodeURIComponent(u.id)}" target="_blank" rel="noopener">${esc(u.nickname)} のプロフィールを開く ↗</a></div><div class="overview-grid"><article class="metric panel"><span>合計</span><b>${fmt(u.total)}</b></article><article class="metric panel"><span>交流</span><b>${fmt(u.interaction)}</b></article><article class="metric panel"><span>レター / 通話</span><b>${fmt(u.letters)} / ${fmt(u.calls)}</b></article></div>`+evidence.map(e=>`<div class="evidence-item"><div class="evidence-meta"><span>${esc(e.source)} · ${e.date?new Date(e.date*1000).toLocaleString("ja-JP"):"日時不明"}</span><span>${esc(e.detail||"")}</span></div><p>${esc(e.detail||e.source)}</p>${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">関連ページを開く ↗</a>`:""}</div>`).join("");
    $("detailPanel").classList.remove("hidden");$("detailPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function updateProfile(p) {
    state.profile = p; $("avatar").src = avatarOf(p); $("avatar").onerror = function(){this.onerror=null;this.src=DEFAULT_AVATAR;};
    $("nickname").textContent = p.nickname || `User ${p.id}`; $("profileId").textContent = `Yay! ID ${p.id}`;
    $("followers").textContent = fmt(p.followers_count); $("postCount").textContent = fmt(p.posts_count);
    $("cover").style.backgroundImage = p.cover_image ? `url("${p.cover_image}")` : ""; $("profileSection").classList.remove("hidden");
  }
  async function start() {
    if (state.running) return;
    const parsed = parseInput($("userInput").value);
    if (!parsed) { $("errorBox").textContent = "Yay! のプロフィールURLまたはユーザーIDを入力してください。"; $("errorBox").classList.remove("hidden"); return; }
    $("errorBox").classList.add("hidden"); $("analyzeBtn").disabled = true; state.running = true; state.stopped = false; state.users.clear(); state.seenPosts.clear(); state.seenReviews.clear(); state.seenCalls.clear(); state.timelineCount=0; state.reviewCount=0; state.pages=0; state.mapCentered=false; state.timelinePrivate=false; state.timelinePrivate=false;
    controller = new AbortController(); $("scanSection").classList.remove("hidden"); $("resultsSection").classList.add("hidden"); $("scanStatus").textContent="準備中"; $("scanTitle").textContent="プロフィールを取得中"; $("stopBtn").disabled=false;
    try {
      let id = typeof parsed === "string" ? parsed : null;
      if (parsed?.postId) { const d = await apiGet(`${API}/posts/${parsed.postId}`); id = String((d.post || d.data?.post || d).user?.id || ""); if (!id) throw new Error("投稿からユーザーIDを取得できませんでした。"); }
      state.userId = Number(id);
      const profileData = await apiGet(`${API}/users/fresh/${encodeURIComponent(id)}`); const profile = profileData.user || profileData.data?.user || profileData;
      if (!profile?.id) throw new Error("プロフィール情報を取得できませんでした。");
      updateProfile(profile); $("scanStatus").textContent="分析中";
      try { await scanTimeline(); }
      catch (e) { if (e.code !== -363) throw e; state.timelinePrivate = true; }   // private timeline: letters are still readable
      if (!state.stopped) await scanReviews();
      $("scanStatus").textContent = state.stopped ? "停止" : "完了";
      $("scanTitle").textContent = state.stopped ? "途中までの結果" : "すべての取得が完了しました";
      if (!state.stopped) {
        // The total number of pages is unknown while scanning. Once both sources
        // finish successfully, explicitly mark the progress as complete.
        $("progressFill").style.width = "100%";
        $("progressPercent").textContent = "100%";
      }
      $("coverageNote").textContent = state.stopped ? "停止するまでに取得できたデータを表示しています。" : state.timelinePrivate ? "このアカウントのタイムラインは非公開のため、投稿・通話は集計できません。レターのみを集計しました。" : "公開タイムラインとレターAPIから取得できたデータを集計しました。APIで取得できない非公開データは含まれません。";
      $("resultsSection").classList.remove("hidden"); render();
    } catch (e) {
      if (e.name !== "AbortError") {
        $("errorBox").textContent = e.message || "分析中にエラーが発生しました。";
        $("errorBox").classList.remove("hidden");
        $("scanStatus").textContent = "エラー";
        $("scanTitle").textContent = "取得中にエラーが発生しました";
        $("progressPercent").textContent = "エラー";
      }
      $("resultsSection").classList.remove("hidden"); render();
    } finally { state.running=false; controller=null; $("analyzeBtn").disabled=false; $("stopBtn").disabled=true; }
  }
  function stop() { state.stopped=true; if (controller) controller.abort(); $("scanStatus").textContent="停止中"; }
  function download(name, content, type) { const blob = new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500); }
  function exportJSON() { download(`yay-combined-ranking-${state.userId}.json`,JSON.stringify({profile:state.profile,scan:{timeline_posts:state.timelineCount,reviews:state.reviewCount,calls:state.seenCalls.size,complete:!state.stopped},users:sortedUsers()},null,2),"application/json"); }
  function exportCSV() { const rows=[["rank","user_id","nickname","total","interaction","letters","calls"],...sortedUsers().slice(0,50).map((u,i)=>[i+1,u.id,u.nickname,u.total,u.interaction,u.letters,u.calls])]; const csv=rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n"); download(`yay-combined-ranking-${state.userId}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8"); }
  async function exportMapImage() {
    const users=sortedUsers().slice(0,Number($("topLimit").value||50)); if(!users.length)return;
    const btn=$("imageBtn");btn.disabled=true;btn.textContent="画像を生成中…";
    try {
      const {points}=mapPositions(users),cx=600,cy=600;
      const lines=points.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p.x/2}" y2="${p.y/2}" stroke="#9bdcff" stroke-opacity=".28" stroke-width="2"/>`).join("");
      const nodes=points.map(p=>`<g><circle cx="${p.x/2}" cy="${p.y/2}" r="27" fill="#173e6c" stroke="#d8f3ff" stroke-width="3"/><text x="${p.x/2}" y="${p.y/2+6}" text-anchor="middle" fill="white" font-size="18">${esc(initials(p.u.nickname))}</text><circle cx="${p.x/2+20}" cy="${p.y/2-20}" r="11" fill="#35baff"/><text x="${p.x/2+20}" y="${p.y/2-16}" text-anchor="middle" fill="#06213a" font-size="10">${p.rank}</text><text x="${p.x/2}" y="${p.y/2+45}" text-anchor="middle" fill="white" font-size="12">${esc(p.u.nickname.slice(0,15))}</text><text x="${p.x/2}" y="${p.y/2+61}" text-anchor="middle" fill="#bceaff" font-size="11">${fmt(p.u.total)} 件</text></g>`).join("");
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" font-family="system-ui, 'Noto Sans JP', sans-serif"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#173e6c"/><stop offset="1" stop-color="#071a35"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#bg)"/><text x="600" y="48" text-anchor="middle" fill="white" font-size="30" font-weight="bold">総合交流マップ · Top ${users.length}</text><text x="600" y="78" text-anchor="middle" fill="#c8eaff" font-size="16">${esc(state.profile?.nickname||`Yay! User ${state.userId}`)} · ${new Date().toLocaleDateString("ja-JP")}</text><circle cx="600" cy="600" r="200" fill="none" stroke="#9bdcff" stroke-opacity=".15"/><circle cx="600" cy="600" r="360" fill="none" stroke="#9bdcff" stroke-opacity=".15"/><circle cx="600" cy="600" r="450" fill="none" stroke="#9bdcff" stroke-opacity=".15"/>${lines}<circle cx="600" cy="600" r="58" fill="#245b86" stroke="#e5f7ff" stroke-width="4"/><text x="600" y="608" text-anchor="middle" fill="white" font-size="22">${esc(initials(state.profile?.nickname))}</text>${nodes}</svg>`;
      const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=1200;
      const img=new Image(),svgUrl=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
      try { img.src=svgUrl; await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;}); }
      finally { URL.revokeObjectURL(svgUrl); }
      const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
      await window.drawYayCreatorFooter(canvas);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!blob)throw new Error("PNG画像を作成できませんでした。");
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`yay-combined-map-${state.userId}-top${users.length}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    } catch(e) { { $("errorBox").textContent=`画像を生成できませんでした: ${e.message}`; $("errorBox").classList.remove("hidden"); } }
    finally {btn.disabled=false;btn.textContent="マップ画像をダウンロード";}
  }
  $("analyzeBtn").addEventListener("click",start); $("userInput").addEventListener("keydown",e=>{if(e.key==="Enter")start();}); $("stopBtn").addEventListener("click",stop); $("jsonBtn").addEventListener("click",exportJSON); $("csvBtn").addEventListener("click",exportCSV); $("imageBtn").addEventListener("click",exportMapImage);
  $("userFilter").addEventListener("input",render); $("topLimit").addEventListener("change",render); $("showUsernames").addEventListener("change",render); $("closeDetail").addEventListener("click",()=>$("detailPanel").classList.add("hidden"));
})();
