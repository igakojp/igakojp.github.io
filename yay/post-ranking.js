(() => {
  "use strict";
  const API = "https://proxy.cors.dev/https://api.yay.space/v2";
  const $ = id => document.getElementById(id);
  const MAX_PAGES = 10000;
  const state = { userId:null, profile:null, posts:[], seen:new Set(), cursor:null, pages:0, running:false, stopped:false, kind:"likes", complete:false };
  const fmt = n => Number(n || 0).toLocaleString("ja-JP");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function error(message) { $("errorBox").textContent = message; $("errorBox").classList.remove("hidden"); }
  function clearError() { $("errorBox").textContent = ""; $("errorBox").classList.add("hidden"); }
  function parseInput(value) {
    const s = String(value || "").trim();
    const post = s.match(/(?:^|\/)post\/(\d+)(?:[/?#]|$)/i);
    if (post) return { type:"post", id:post[1] };
    if (/^\d+$/.test(s)) return { type:"user", id:s };
    const user = s.match(/(?:users?|profile|u)\/(\d+)(?:[/?#]|$)/i);
    return user ? { type:"user", id:user[1] } : null;
  }

  async function apiGet(url) {
    const res = await window.YayAPI.fetch(url, { method:"GET", headers:{Accept:"application/json"} });
    const body = await res.text(); let data;
    try { data = JSON.parse(body); } catch { throw new Error(`APIからJSON以外の応答が返されました (HTTP ${res.status})。CORS中継サービスを確認してください。`); }
    if (res.status === 429 || Number(data?.error_code) === 429) throw new Error("Yay! APIのアクセス制限により停止しました。時間をおいてから再試行してください。");
    if (!res.ok || (data?.result && data.result !== "success")) throw new Error(data?.message || `Yay! API エラー (HTTP ${res.status})`);
    return data;
  }
  function pickNumber(objects, keys) {
    for (const obj of objects) for (const key of keys) {
      const value = obj?.[key];
      if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.max(0, Number(value));
    }
    return null;
  }
  function metric(post, kind) {
    const stats = [post, post?.counts, post?.statistics, post?.stats, post?.reaction_counts, post?.reactions];
    if (kind === "likes") return pickNumber(stats, ["likes_count","like_count","likes","favorite_count","favorites_count"]);
    if (kind === "replies") return pickNumber(stats, ["in_reply_to_post_count","replies_count","reply_count","comments_count","comment_count","replies","comments"]);
    // Yay! API の reposts_count を age 反応数として扱う。
    return pickNumber(stats, ["reposts_count"]);
  }
  function postText(post) {
    return post?.text || post?.content || post?.body || post?.message || post?.caption || "（本文なし）";
  }
  function postDate(post) {
    const raw = post?.created_at || post?.createdAt || post?.posted_at;
    if (!raw) return "日時不明";
    const d = new Date(typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : raw);
    return Number.isNaN(d.getTime()) ? "日時不明" : d.toLocaleString("ja-JP");
  }
  function postUrl(post) { return `https://yay.space/post/${encodeURIComponent(post.id)}`; }
  function currentRows() {
    return state.posts.map(post => ({ post, count:metric(post,state.kind) })).filter(row => row.count != null).sort((a,b) => b.count-a.count || Number(b.post.id)-Number(a.post.id));
  }
  function render() {
    const labels = { likes:["♥ いいねランキング","いいね数が多い順"], replies:["💬 返信ランキング","返信数が多い順"], age:["アゲ（(´∀｀∩)↑age↑）ランキング","アゲ数が多い順"] };
    $("rankingTitle").textContent = labels[state.kind][0]; $("metricNote").textContent = labels[state.kind][1];
    const limit = Number($("topLimit").value || 10), rows = currentRows().slice(0,limit);
    $("rankedCount").textContent = fmt(currentRows().length);
    if (!rows.length) {
      $("rankingList").innerHTML = `<div class="empty-state">この種類の反応数を取得できる投稿がありません。APIが反応数を返していない可能性があります。</div>`;
      return;
    }
    $("rankingList").innerHTML = rows.map(({post,count},i) => {
      const user = post.user || post.author || {};
      const nickname = user.nickname || user.name || state.profile?.nickname || `投稿者 ${state.userId}`;
      const avatar = user.profile_icon_thumbnail || user.profile_icon || user.profile_icon_url || "";
      const image = avatar ? `<img src="${esc(avatar.startsWith("//") ? `https:${avatar}` : avatar.startsWith("/") ? `https://yay.space${avatar}` : avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<b>${esc(nickname.slice(0,1))}</b>`;
      return `<article class="pr-item"><div class="pr-rank">${i+1}</div><div class="pr-avatar">${image}</div><div class="pr-content"><div class="pr-meta"><strong>${esc(nickname)}</strong><span>${esc(postDate(post))}</span></div><p>${esc(postText(post))}</p><a href="${postUrl(post)}" target="_blank" rel="noopener">投稿を開く ↗</a></div><div class="pr-count"><b>${fmt(count)}</b><span>${state.kind === "likes" ? "いいね" : state.kind === "replies" ? "返信" : "age"}</span></div></article>`;
    }).join("");
  }
  function updateProgress() {
    $("checkedCount").textContent = fmt(state.posts.length); $("pageCount").textContent = fmt(state.pages);
    $("progressLabel").textContent = `${fmt(state.posts.length)} 件の投稿を確認`;
    $("progressPercent").textContent = state.pages >= MAX_PAGES ? "上限" : "取得中";
    $("progressFill").style.width = state.pages >= MAX_PAGES ? "100%" : `${Math.min(96,state.pages / 30 * 100)}%`;
    $("scanTitle").textContent = state.running ? "投稿を取得中" : state.complete ? "分析完了" : "分析を停止";
    $("scanStatus").textContent = state.running ? "分析中" : state.complete ? "完了" : "停止";
    render();
  }
  async function start() {
    if (state.running) return;
    clearError();
    const input = parseInput($("userInput").value);
    if (!input) { error("Yay! の投稿URL、プロフィールURL、または数字のユーザーIDを入力してください。"); return; }
    let id = input.id;
    Object.assign(state,{userId:id,profile:null,posts:[],seen:new Set(),cursor:null,pages:0,running:true,stopped:false,complete:false});
    $("profilePanel").classList.add("hidden"); $("resultsPanel").classList.add("hidden"); $("scanPanel").classList.remove("hidden"); $("stopBtn").disabled=false; $("startBtn").disabled=true; $("coverageNote").textContent="公開タイムラインを最初から取得しています…"; updateProgress();
    try {
      if (input.type === "post") {
        const postData = await apiGet(`${API}/posts/${encodeURIComponent(input.id)}`);
        const sourcePost = postData.post || postData.data?.post || postData;
        if (!sourcePost?.user?.id) throw new Error("投稿者のユーザーIDを取得できませんでした。公開投稿URLを確認してください。");
        id = String(sourcePost.user.id); state.userId = id;
      }
      const profileData = await apiGet(`${API}/users/fresh/${encodeURIComponent(id)}`);
      state.profile = profileData.user || profileData.profile || profileData;
      const p = state.profile; $("nickname").textContent = p.nickname || `ユーザー ${id}`; $("profileId").textContent = `Yay! ID ${id}`; $("postCount").textContent = fmt(p.posts_count || 0);
      const av = p.profile_icon_thumbnail || p.profile_icon || p.profile_icon_url || ""; if (av) { $("avatar").src = av.startsWith("//") ? `https:${av}` : av.startsWith("/") ? `https://yay.space${av}` : av; } else $("avatar").removeAttribute("src");
      $("profilePanel").classList.remove("hidden");
      while (state.running && state.pages < MAX_PAGES) {
        const params = new URLSearchParams({number:"50",user_id:id});
        if (state.cursor) { params.set("from_post_id",state.cursor); params.set("page_value",state.cursor); }
        const data = await apiGet(`${API}/posts/user_timeline?${params}`);
        const posts = Array.isArray(data.posts) ? data.posts : Array.isArray(data.timeline?.posts) ? data.timeline.posts : [];
        state.pages++;
        if (!posts.length) { state.complete=true; break; }
        let oldest = null, added = 0;
        for (const post of posts) {
          if (!post?.id || state.seen.has(String(post.id))) continue;
          state.seen.add(String(post.id)); state.posts.push(post); added++;
          if (oldest == null || Number(post.id) < Number(oldest)) oldest = post.id;
        }
        const supplied = data.next_page_value || data.next_cursor || data.next_from_post_id || data.pagination?.next_cursor || data.meta?.next_cursor;
        const next = supplied && String(supplied) !== String(state.cursor) ? String(supplied) : oldest && String(oldest) !== String(state.cursor) ? String(oldest) : null;
        state.cursor = next; updateProgress();
        if (!next || !added) { state.complete=true; break; }
        await sleep(350);
      }
      if (state.pages >= MAX_PAGES && state.running) $("coverageNote").textContent = `安全上限の ${MAX_PAGES} ページに到達しました。取得できた ${fmt(state.posts.length)} 件の範囲でランキングしています。`;
      else $("coverageNote").textContent = state.complete ? `タイムラインの取得が終了しました。確認した投稿: ${fmt(state.posts.length)} 件。` : `取得を停止しました。確認した投稿: ${fmt(state.posts.length)} 件。`;
    } catch (e) { error(e.message || "投稿を取得できませんでした。"); $("coverageNote").textContent = `取得済み ${fmt(state.posts.length)} 件。エラーにより処理を終了しました。`; }
    finally {
      state.running=false; $("startBtn").disabled=false; $("stopBtn").disabled=true; $("resultsPanel").classList.remove("hidden"); $("resultSummary").textContent = `${fmt(state.posts.length)} 件の投稿を確認。取得できた反応数のみでランキングしています。`; updateProgress();
    }
  }
  function stop() { state.running=false; state.stopped=true; $("coverageNote").textContent="停止しました。ここまでに取得した投稿でランキングを表示します。"; }

  function canvasRoundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function canvasFit(ctx,text,maxW){let s=Array.from(String(text||''));while(s.length>1&&ctx.measureText(s.join('')+'…').width>maxW)s.pop();return s.join('')+(s.length<Array.from(String(text||'')).length?'…':'');}
  function canvasLines(ctx,text,maxW,maxLines){const words=Array.from(String(text||''));const lines=[];let line='';for(const ch of words){if(ctx.measureText(line+ch).width>maxW&&line){lines.push(line);line=ch;if(lines.length===maxLines-1)break;}else line+=ch;}if(line&&lines.length<maxLines)lines.push(line);const used=lines.join('').length;if(used<String(text||'').length)lines[lines.length-1]=canvasFit(ctx,lines[lines.length-1]+String(text||'').slice(used),maxW);return lines;}
  async function exportImage(){
    const btn=$('imageBtn'),rows=currentRows().slice(0,Number($('topLimit').value||10));
    if(!rows.length){error('画像に表示する投稿がありません。先に分析を実行してください。');return;}
    btn.disabled=true;btn.textContent='画像を生成中…';
    try{
      const W=1400,HEAD=300,ROW=210,GAP=22,FOOT=130,H=HEAD+rows.length*(ROW+GAP)+FOOT;
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
      const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#171a2b');bg.addColorStop(.55,'#28213c');bg.addColorStop(1,'#172d3b');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      ctx.fillStyle='rgba(255,255,255,.045)';ctx.beginPath();ctx.arc(1280,70,280,0,Math.PI*2);ctx.fill();
      const title={likes:'♥ いいねランキング',replies:'💬 返信ランキング',age:'アゲ（(´∀｀∩)↑age↑）ランキング'}[state.kind];
      ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font="800 64px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(title,70,100);
      ctx.fillStyle='#c6c5da';ctx.font="26px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(`${state.profile?.nickname||'Yay! ユーザー'}  (@${state.userId})`,74,170);
      ctx.fillText(`${fmt(state.posts.length)} 件を確認 · TOP ${rows.length} · ${new Date().toLocaleDateString('ja-JP')}`,74,220);
      rows.forEach(({post,count},i)=>{
        const y=HEAD+i*(ROW+GAP);ctx.save();ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=22;ctx.shadowOffsetY=8;ctx.fillStyle='rgba(255,255,255,.96)';canvasRoundRect(ctx,60,y,W-120,ROW,28);ctx.fill();ctx.restore();
        const colors=['#f4b942','#aebbd0','#ce8c62','#8c83d8'];const grad=ctx.createLinearGradient(90,y+30,180,y+110);grad.addColorStop(0,colors[Math.min(i,3)]);grad.addColorStop(1,'#7668b8');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(130,y+70,42,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='800 38px system-ui';ctx.fillText(String(i+1),130,y+72);
        const user=post.user||post.author||{},name=user.nickname||user.name||state.profile?.nickname||`投稿者 ${state.userId}`;
        ctx.textAlign='left';ctx.fillStyle='#302b45';ctx.font="700 27px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(canvasFit(ctx,name,760),205,y+42);
        ctx.fillStyle='#89849c';ctx.font="20px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(`投稿日: ${postDate(post)}  ·  ID: ${post.id}`,205,y+78);
        ctx.fillStyle='#454052';ctx.font="23px system-ui, 'Noto Sans JP', sans-serif";const lines=canvasLines(ctx,postText(post),W-430,3);lines.forEach((line,j)=>ctx.fillText(line,205,y+120+j*30));
        ctx.textAlign='right';ctx.fillStyle='#5943a5';ctx.font="800 42px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(fmt(count),W-105,y+78);ctx.fillStyle='#9289aa';ctx.font="20px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(state.kind==='likes'?'いいね':state.kind==='replies'?'返信':'age',W-105,y+112);
      });
      // Footer branding: creator mark on the left and white Yay! logo on the right.
      let creator=window.__yayCreator||null;
      if(!creator){
        try{const d=await apiGet(`${API}/users/11044343`);if(d?.user?.id)creator={id:String(d.user.id),nickname:d.user.nickname,avatar:d.user.profile_icon_thumbnail||d.user.profile_icon||d.user.profile_icon_url||''};}catch{/* Branding is optional; image export must still work. */}
      }
      async function loadBrandImage(url){
        if(!url)return null;
        try{const response=await fetch(url,{mode:'cors',credentials:'omit'});if(!response.ok)return null;const blob=await response.blob();if(!blob.type.startsWith('image/'))return null;const objectUrl=URL.createObjectURL(blob);const img=new Image();img.src=objectUrl;await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});return {img,objectUrl};}catch{return null;}
      }
      const [creatorAsset,logoAsset]=await Promise.all([loadBrandImage(creator?.avatar||''),loadBrandImage('https://yay.space/images/logotype.svg')]);
      const fy=H-66;
      if(creator?.nickname){
        ctx.save();ctx.fillStyle='rgba(255,255,255,.12)';canvasRoundRect(ctx,62,fy-42,590,84,42);ctx.fill();ctx.restore();
        if(creatorAsset?.img){ctx.save();ctx.beginPath();ctx.arc(105,fy,27,0,Math.PI*2);ctx.clip();ctx.drawImage(creatorAsset.img,78,fy-27,54,54);ctx.restore();}
        else{ctx.beginPath();ctx.arc(105,fy,27,0,Math.PI*2);ctx.fillStyle='#c6b8ff';ctx.fill();}
        ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='rgba(255,255,255,.65)';ctx.font="16px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText('このプロジェクトの制作者',150,fy-13);
        ctx.fillStyle='#fff';ctx.font="bold 23px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(canvasFit(ctx,creator.nickname,450),150,fy+17);
      }
      if(logoAsset?.img){
        const img=logoAsset.img,iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,k=Math.min(190/iw,48/ih),lw=iw*k,lh=ih*k;
        ctx.save();ctx.fillStyle='rgba(255,255,255,.12)';canvasRoundRect(ctx,W-62-lw-48,fy-38,lw+48,76,38);ctx.fill();ctx.drawImage(window.yayWhiteImage(img,lw,lh),W-62-lw-24,fy-lh/2,lw,lh);ctx.restore();
      }else{ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.font="bold 30px system-ui, sans-serif";ctx.fillText('Yay!',W-72,fy);}
      if(creatorAsset?.objectUrl)URL.revokeObjectURL(creatorAsset.objectUrl);if(logoAsset?.objectUrl)URL.revokeObjectURL(logoAsset.objectUrl);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG画像を作成できませんでした。');
      await window.yaySavePng(blob,`yay-post-ranking-${state.kind}-top${rows.length}.png`);
    }catch(e){error(`画像を生成できませんでした: ${e.message}`);}finally{btn.disabled=false;btn.textContent='画像をダウンロード';}
  }

  function exportCsv() {
    const rows = currentRows(); const header = ["rank","post_id","count","kind","created_at","text","url"];
    const lines = [header,...rows.map((r,i)=>[i+1,r.post.id,r.count,state.kind,postDate(r.post),postText(r.post),postUrl(r.post)])].map(row=>row.map(v=>`"${String(v ?? "").replace(/"/g,'""')}"`).join(","));
    const blob = new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`yay-post-ranking-${state.kind}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  $("imageBtn").addEventListener("click",exportImage); $("startBtn").addEventListener("click",start); $("userInput").addEventListener("keydown",e=>{if(e.key==="Enter")start();}); $("stopBtn").addEventListener("click",stop); $("topLimit").addEventListener("change",render); $("csvBtn").addEventListener("click",exportCsv);
  document.querySelectorAll(".pr-tab").forEach(btn=>btn.addEventListener("click",()=>{state.kind=btn.dataset.kind;document.querySelectorAll(".pr-tab").forEach(b=>b.classList.toggle("active",b===btn));render();}));
})();
