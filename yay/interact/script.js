(() => {
  "use strict";
  // Public CORS relay: anonymous GET/HEAD access; no account or API key required.
  const API = "https://proxy.cors.dev/https://api.yay.space/v2";
  const $ = id => document.getElementById(id);
  const state = {
    profile:null, userId:null, posts:[], scores:new Map(), feed:[], pages:0,
    checked:0, total:0, cursor:null, seen:new Set(), paused:false, stopped:false,
    running:false, controller:null, startedAt:null, complete:false,
    timelineExhausted:false, retryCount:0, lastPageOldest:null, topLimit:50, profileQueue:[], profileInFlight:0, profileQueued:new Set()
  };
  const fmt = n => Number(n||0).toLocaleString();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sleep = ms => new Promise(r => setTimeout(r,ms));
  let apiCooldownUntil = 0;
  const profileCache = new Map();
  async function waitForApiWindow(signal){
    while(Date.now() < apiCooldownUntil){
      if(signal?.aborted) throw new DOMException("停止", "AbortError");
      await sleep(Math.min(500, apiCooldownUntil-Date.now()));
    }
  }
  function retryDelay(response, attempt){
    const header=response?.headers?.get("Retry-After");
    let serverDelay=0;
    if(header){
      const seconds=Number(header);
      serverDelay=Number.isFinite(seconds) ? seconds*1000 : Math.max(0, Date.parse(header)-Date.now());
    }
    return Math.max(serverDelay, Math.min(30000, 1000*(2**attempt))) + Math.floor(Math.random()*350);
  }
  const setHidden = (id, yes) => $(id).classList.toggle("hidden", yes);
  function showError(message){ $("errorBox").textContent=message; setHidden("errorBox",false); }
  function clearError(){ $("errorBox").textContent=""; setHidden("errorBox",true); }
  function parseInput(value){
    const s=String(value||"").trim();

    // A post URL is resolved through /posts/{post_id}; its author's ID
    // is taken from the returned post.user.id.
    const postMatch=s.match(/(?:^|\/)post\/(\d+)(?:[/?#]|$)/i);
    if(postMatch) return {type:"post",id:postMatch[1]};

    // Keep support for entering a user ID or profile URL directly.
    if(/^\d+$/.test(s)) return {type:"user",id:s};
    const userMatch=s.match(/(?:users?|profile|u)\/(\d+)(?:[/?#]|$)/i);
    if(userMatch) return {type:"user",id:userMatch[1]};

    return null;
  }
  async function apiGet(url, signal){
    let lastError;
    for(let attempt=0;attempt<3;attempt++){
      try{
        await waitForApiWindow(signal);
        const res=await fetch(url,{method:"GET",mode:"cors",credentials:"omit",cache:"default",headers:{"Accept":"application/json"},signal});
        if(res.status===429){
          const delay=retryDelay(res,attempt);
          apiCooldownUntil=Math.max(apiCooldownUntil,Date.now()+delay);
          if(attempt===2) throw new Error(`Yay! APIのアクセス制限 (429) に達しました。${Math.ceil(delay/1000)}秒ほど待ってから再試行してください。`);
          continue;
        }
        if(res.status>=500 && attempt<2){
          const delay=retryDelay(res,attempt);
          apiCooldownUntil=Math.max(apiCooldownUntil,Date.now()+delay);
          await sleep(delay);
          continue;
        }
        const contentType=(res.headers.get("content-type")||"").toLowerCase();
        const body=await res.text();
        const trimmed=body.trimStart();
        if(!res.ok){
          const detail=trimmed.startsWith("{") ? (()=>{try{return JSON.parse(body).message||"";}catch{return "";}})() : "";
          throw new Error(`Yay! API エラー (HTTP ${res.status})${detail?`: ${detail}`:""}`);
        }
        if(!contentType.includes("json") || !(trimmed.startsWith("{") || trimmed.startsWith("["))){
          const source=url.includes("proxy.cors.dev")?"CORS中継サービス":"Yay! API";
          const hint=res.status===200?"APIではなくHTMLページが返されました。API URL・中継サービスの応答、または一時的なアクセス制限を確認してください。":"HTMLエラーページが返されました。";
          throw new Error(`${source}からJSON以外の応答を受信しました (HTTP ${res.status}, ${contentType||"Content-Type不明"})。${hint}`);
        }
        let data;
        try{data=JSON.parse(body);}catch{throw new Error("APIの応答をJSONとして解析できませんでした。応答形式が壊れている可能性があります。");}
        if(Number(data?.error_code)===-363 || String(data?.message||"").toLowerCase().includes("unable to view private user timeline")){
          const error=new Error("このユーザーのタイムラインは非公開のため閲覧できません。");
          error.code=-363;
          throw error;
        }
        if(data?.result && data.result!=="success") throw new Error(data.message||"Yay! APIから正常な応答がありませんでした。");
        return data;
      }catch(e){
        if(e.name==="AbortError" || e.code===-363) throw e;
        lastError=e;
        // Do not repeatedly request on deterministic HTTP/format errors.
        if(/HTTP \d+|JSON以外|JSONとして解析|正常な応答/.test(e.message||"")) throw e;
        if(attempt<2){
          const delay=Math.min(15000,750*(2**attempt))+Math.floor(Math.random()*300);
          apiCooldownUntil=Math.max(apiCooldownUntil,Date.now()+delay);
          await sleep(delay);
        }
      }
    }
    if(lastError instanceof TypeError) throw new Error("Yay! APIまたはCORS中継サービスに接続できませんでした。中継サービスが停止中の可能性があります。");
    throw lastError || new Error("Request failed.");
  }
  function avatarOf(raw){
    const value=raw?.profile_icon_thumbnail || raw?.profile_icon || raw?.profile_icon_url ||
      raw?.profile_image_url || raw?.profile_image || raw?.avatar_url || raw?.icon_url || raw?.icon || "";
    if(typeof value==="string"){
      if(value.startsWith("//")) return `https:${value}`;
      if(value.startsWith("/")) return `https://yay.space${value}`;
      return value;
    }
    if(value && typeof value==="object") return value.url || value.uri || value.image_url || value.thumbnail_url || "";
    return "";
  }
  function normalizeUser(raw){
    if(!raw) return null;
    return {id:Number(raw.id),nickname:raw.nickname||raw.username||`User ${raw.id}`,avatar:avatarOf(raw)};
  }
  function updateProfile(p){
    state.profile=p;
    $("avatar").src=avatarOf(p);
    $("avatar").onerror=()=>{$("avatar").src="";};
    $("nickname").textContent=p.nickname||`User ${p.id}`;
    $("profileId").textContent=`Yay! ID ${p.id}`;
    $("followers").textContent=fmt(p.followers_count);
    $("lifetimePosts").textContent=fmt(p.posts_count);
    $("cover").style.backgroundImage=p.cover_image?`url("${p.cover_image}")`:"";
    setHidden("profileSection",false);
  }
  function resetScan(){
    state.posts=[];state.scores=new Map();state.feed=[];state.pages=0;state.checked=0;
    state.total=Number(state.profile?.posts_count||0);state.cursor=null;state.seen=new Set();
    state.paused=false;state.stopped=false;state.running=false;state.complete=false;
    state.timelineExhausted=false;state.startedAt=new Date().toISOString();state.retryCount=0;
    state.lastPageOldest=null;state.profileQueue=[];state.profileInFlight=0;state.profileQueued=new Set();
    $("rankingList").innerHTML="";$("interactionMap").innerHTML='<div class="empty-state">最初の投稿を読み込んでいます…</div>';
    $("detailPanel").classList.add("hidden");
    updateProgress();updateLiveStats();
  }
  function updateProgress(){
    const pct=state.total>0?Math.min(100,state.checked/state.total*100):0;
    $("progressFill").style.width=`${pct}%`;
    $("progressPercent").textContent=`${pct.toFixed(1)}%`;
    $("progressLabel").textContent=`${fmt(state.checked)} / ${fmt(state.total)} 件を確認`;
    $("checkedCount").textContent=fmt(state.checked);
    $("pageCount").textContent=fmt(state.pages);
  }
  function queueProfileHydration(entry){
    if(!entry || state.profileQueued.has(entry.id)) return;
    state.profileQueued.add(entry.id);
    state.profileQueue.push(entry);
    pumpProfileQueue();
  }
  function pumpProfileQueue(){
    while(state.profileInFlight < 3 && state.profileQueue.length){
      const entry=state.profileQueue.shift();
      state.profileInFlight++;
      (async()=>{
        try{
          let profile=profileCache.get(entry.id);
          if(!profile){
            const data=await apiGet(`${API}/users/fresh/${entry.id}`);
            profile=data.user || data.profile || data;
            if(profile) profileCache.set(entry.id,profile);
          }
          const current=state.scores.get(entry.id);
          if(current && profile){
            current.nickname=profile.nickname||profile.username||current.nickname;
            current.avatar=avatarOf(profile)||current.avatar;
            current.profileLoaded=true;
            renderRanking();
          }
        }catch{}
        finally{state.profileInFlight--;pumpProfileQueue();}
      })();
    }
  }
  function addScore(user, post, reason){
    if(!user || !user.id || Number(user.id)===state.userId) return;
    const id=Number(user.id);
    let entry=state.scores.get(id);
    if(!entry){
      const avatar=avatarOf(user);
      entry={id,nickname:user.nickname||user.username||`User ${id}`,avatar,points:0,evidence:[]};
      state.scores.set(id,entry);
      queueProfileHydration(entry);
    }else{
      entry.avatar=entry.avatar||avatarOf(user);
      if(entry.nickname===`User ${id}`) entry.nickname=user.nickname||user.username||entry.nickname;
      if(!entry.profileLoaded) queueProfileHydration(entry);
    }
    const eventKey=`${post.id}:${reason}`;
    if(!entry.evidence.some(x=>x.eventKey===eventKey)) {
      entry.points++;
      entry.evidence.push({eventKey,postId:post.id,text:post.text||"",createdAt:post.created_at||0,reason,url:`https://yay.space/conversation/${post.id}`});
    }
    renderRanking();
  }
  function processPost(post){
    if(!post || Number(post.user?.id)!==state.userId) return;
    const perPost=new Map();
    for(const m of (Array.isArray(post.mentions)?post.mentions:[])){
      if(m?.id && Number(m.id)!==state.userId) perPost.set(`${Number(m.id)}:Mention`,{user:m,reason:"Mention"});
    }
    const replyUser=post.in_reply_to_post?.user;
    if(replyUser?.id && Number(replyUser.id)!==state.userId){
      perPost.set(`${Number(replyUser.id)}:Reply`,{user:replyUser,reason:"Reply"});
    }
    for(const {user,reason} of perPost.values()) addScore(user,post,reason);
  }
  function sortedScores(){return [...state.scores.values()].sort((a,b)=>b.points-a.points||a.nickname.localeCompare(b.nickname));}
  function updateLiveStats(){
    const people=state.scores.size, points=[...state.scores.values()].reduce((a,x)=>a+x.points,0);
    $("interactionCount").textContent=fmt(points);$("discoveredCount").textContent=fmt(people);
    $("totalInteractions").textContent=fmt(points);$("totalPeople").textContent=fmt(people);
    $("totalScanned").textContent=fmt(state.checked);
    $("coverageText").textContent=`総投稿数に対して ${state.total?Math.min(100,state.checked/state.total*100).toFixed(1):0}%`;
    renderRanking();
  }
  function mapPositions(rows){
    const width=2400,height=2400,cx=1200,cy=1200;
    const n=rows.length;
    let groups=[];
    if(n<=10) groups=[{items:rows,radius:400,ring:0}];
    else if(n<=30){
      groups=[{items:rows.slice(0,10),radius:400,ring:0},{items:rows.slice(10),radius:800,ring:1}];
    }else{
      groups=[
        {items:rows.slice(0,10),radius:400,ring:0},
        {items:rows.slice(10,30),radius:800,ring:1},
        {items:rows.slice(30),radius:1050,ring:2}
      ];
    }
    const result=[];
    groups.forEach(g=>g.items.forEach((u,i)=>{
      const angle=(i/g.items.length)*Math.PI*2-Math.PI/2+g.ring*.11;
      result.push({u,x:cx+Math.cos(angle)*g.radius,y:cy+Math.sin(angle)*g.radius,rank:sortedRank(u)});
    }));
    return {width,height,cx,cy,points:result};
  }
  function sortedRank(user){return sortedScores().findIndex(x=>x.id===user.id)+1;}
  function initials(name){return String(name||"?").trim().slice(0,1).toUpperCase()||"?";}
  function renderRanking(){
    const all=sortedScores();
    const filter=(($("userFilter")?.value)||"").trim().toLowerCase();
    const limit=Number($("topLimit")?.value||state.topLimit||50);
    state.topLimit=limit;
    const ranked=all.slice(0,limit);
    const showNames=$("showUsernames")?.checked!==false;
    const rows=ranked.filter(u=>String(u.id).includes(filter)||u.nickname.toLowerCase().includes(filter));
    $("mapUserCount").textContent=`Top ${limit} · ${fmt(rows.length)} / ${fmt(all.length)} 人`;
    if(!rows.length){$("interactionMap").innerHTML=`<div class="empty-state">${all.length?"検索条件に一致するユーザーはいません。":"ユーザーを発見すると、ここにリアルタイムで表示されます。"}</div>`;return;}
    const {width,height,cx,cy,points}=mapPositions(rows);
    const lines=points.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="map-link"/>`).join("");
    const nodes=points.map(p=>{
      const avatar=esc(p.u.avatar||"");
      return `<button class="map-node" style="left:${p.x/width*100}%;top:${p.y/height*100}%" data-user="${p.u.id}" title="${esc(p.u.nickname)} · ${p.u.points} 件"><span class="node-avatar-wrap"><span class="avatar-fallback">${esc(initials(p.u.nickname))}</span>${avatar?`<img src="${avatar}" alt="${esc(p.u.nickname)}" loading="eager" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:""}<span class="node-rank">${p.rank}</span></span>${showNames?`<span class="node-name">${esc(p.u.nickname)}</span>`:""}<span class="node-count">${fmt(p.u.points)} 件</span></button>`;
    }).join("");
    const avatar=state.profile?avatarOf(state.profile):"";
    const status=state.running?"● スキャン中・随時更新":state.complete?"✓ 完了":"取得済みデータ";
    $("interactionMap").innerHTML=`<div class="map-canvas" data-map-width="${width}" data-map-height="${height}"><div class="map-live-status">${status} · ${fmt(all.length)} 人を発見</div><svg class="map-lines" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><circle class="map-orbit" cx="${cx}" cy="${cy}" r="400"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="800"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="1050"/>${lines}</svg><div class="map-center" style="left:50%;top:50%"><span class="center-fallback">${esc(initials(state.profile?.nickname))}</span>${avatar?`<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:""}${showNames?`<b>${esc(state.profile?.nickname||`User ${state.userId}`)}</b>`:""}<span>@${state.userId}</span></div>${nodes}</div>`;
    document.querySelectorAll(".map-node").forEach(el=>el.addEventListener("click",()=>showDetails(Number(el.dataset.user))));
  }
  function showDetails(id){
    const u=state.scores.get(id);if(!u)return;
    $("detailTitle").textContent=`${u.nickname} · ${fmt(u.points)} 件の交流`;
    const profileUrl=`https://yay.space/user/${u.id}`;
    $("detailContent").innerHTML=`<p class="profile-link-row"><a href="${profileUrl}" target="_blank" rel="noopener">${esc(u.nickname)} のプロフィールを開く ↗</a></p>`+u.evidence.slice().sort((a,b)=>b.createdAt-a.createdAt).map(e=>`<div class="evidence-item"><div class="evidence-meta"><span>${esc(e.reason)} · ${new Date(e.createdAt*1000).toLocaleString()}</span><span>#${e.postId}</span></div><p>${esc(e.text||"(本文なし)")}</p><a href="${e.url}" target="_blank" rel="noopener">元の投稿を開く ↗</a></div>`).join("");
    setHidden("detailPanel",false);$("detailPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function setStatus(text){$("scanStatus").textContent=text;$("scanTitle").textContent=text==="完了"?"分析完了":text==="一時停止"?"一時停止中":text==="停止"?"分析を停止しました":text==="非公開アカウント"?"非公開アカウント":"投稿を確認中";}
  function toggleControls(){
    $("pauseBtn").classList.toggle("hidden",!state.running||state.paused);
    $("stopBtn").classList.toggle("hidden",!state.running);
    $("resumeBtn").classList.toggle("hidden",!state.paused||state.stopped);
  }
  async function waitWhilePaused(){
    while(state.paused&&!state.stopped) await sleep(200);
    if(state.stopped) throw new DOMException("停止","AbortError");
  }
  async function runScan(){
    if(state.running)return;
    state.running=true;state.paused=false;state.stopped=false;toggleControls();setStatus("分析中");
    const controller=new AbortController();state.controller=controller;
    try{
      while(!state.stopped){
        await waitWhilePaused();
        const url=state.cursor
          ?`${API}/posts/user_timeline?from_post_id=${encodeURIComponent(state.cursor)}&page_value=${encodeURIComponent(state.cursor)}&number=50&user_id=${state.userId}`
          :`${API}/posts/user_timeline?number=50&user_id=${state.userId}`;
        const data=await apiGet(url,controller.signal);
        const posts=Array.isArray(data.posts)?data.posts:(Array.isArray(data.timeline?.posts)?data.timeline.posts:[]);
        const suppliedCursor=data.next_page_value||data.next_cursor||data.next_from_post_id||data.pagination?.next_cursor||data.meta?.next_cursor||null;
        state.pages++;
        if(!posts.length){state.timelineExhausted=true;break;}
        let newCount=0, oldest=null;
        for(const post of posts){
          if(!post?.id)continue;
          if(!oldest || Number(post.id)<Number(oldest)) oldest=post.id;
          if(state.seen.has(Number(post.id)))continue;
          state.seen.add(Number(post.id));state.posts.push(post);state.checked++;newCount++;
          processPost(post);
        }
        const previousCursor=state.cursor;
        state.cursor=suppliedCursor?String(suppliedCursor):(oldest?String(oldest):null);
        updateProgress();updateLiveStats();
        if(!state.cursor || state.cursor===previousCursor || (!suppliedCursor && posts.length<50)){
          state.timelineExhausted=true;break;
        }
      }
      if(state.stopped){setStatus("停止");$("coverageNote").textContent="分析を停止しました。ここまでに取得した結果は表示されています。";}
      else if(state.timelineExhausted && state.checked<state.total){
        setStatus("一部完了");$("scanStatus").textContent="取得可能な投稿は以上です";
        $("coverageNote").textContent=`取得可能なタイムラインは ${fmt(state.checked)} 件で終了しました。プロフィールの総投稿数は ${fmt(state.total)} 件のため、取得率は ${(state.checked/Math.max(1,state.total)*100).toFixed(1)}% です。`;
      } else {
        state.complete=true;setStatus("完了");
        $("coverageNote").textContent="タイムラインから取得できる投稿の確認が完了しました。取得率はプロフィールの総投稿数を基準にしています。";
      }
      finishResults();
    }catch(e){
      if(e.name==="AbortError"){if(state.stopped){setStatus("停止");finishResults();}}
      else if(e.code===-363){
        state.privateTimeline=true;
        setStatus("非公開アカウント");
        $("privacyNotice").textContent="タイムラインAPIが非公開を示したため、投稿の取得を停止しました。";
        setHidden("privacyNotice",false);
        $("coverageNote").textContent="タイムラインAPIから error_code -363 が返されました。非公開タイムラインの内容は取得していません。";
        finishResults();
      } else {setStatus("エラー");showError(e.message);$("coverageNote").textContent="分析を続行できませんでした。取得済みの結果は表示されています。";finishResults();}
    }finally{
      state.running=false;state.controller=null;toggleControls();
    }
  }
  function finishResults(){
    setHidden("resultsSection",false);updateLiveStats();
    const coverage=state.total?Math.min(100,state.checked/state.total*100):0;
  }
  async function startAnalysis(){
    clearError();
    const input=parseInput($("userInput").value);
    if(!input){
      showError("Yay! の投稿URL（https://yay.space/conversation/投稿ID）、プロフィールURL、またはユーザーIDを入力してください。");
      return;
    }
    $("analyzeBtn").disabled=true;
    try{
      let userId=input.id;

      if(input.type==="post"){
        $("analyzeBtn").querySelector("span").textContent="投稿を確認中…";
        const postData=await apiGet(`${API}/posts/${encodeURIComponent(input.id)}`);
        const post=postData.post || postData.data?.post || postData;
        if(postData.result && postData.result!=="success"){
          throw new Error(postData.message || "投稿情報を取得できませんでした。");
        }
        if(!post?.user?.id){
          throw new Error("投稿は取得できましたが、投稿者のユーザーID (post.user.id) が応答にありませんでした。");
        }
        userId=String(post.user.id);
      }

      $("analyzeBtn").querySelector("span").textContent="プロフィールを取得中…";
      const data=await apiGet(`${API}/users/fresh/${encodeURIComponent(userId)}`);
      const p=data.user || data.profile || data;
      if(!p?.id)throw new Error("プロフィール情報を取得できませんでした。");
      state.userId=Number(p.id);updateProfile(p);resetScan();
      setHidden("scanSection",false);setHidden("resultsSection",false);updateLiveStats();
      setHidden("privacyNotice",true);
      $("coverageNote").textContent="公開タイムラインに接続中…";
      await runScan();
    }catch(e){showError(e.message);}
    finally{
      $("analyzeBtn").disabled=false;
      $("analyzeBtn").querySelector("span").textContent="分析を開始";
    }
  }
  function download(name,content,type){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
  }
  function exportJSON(){
    const obj={profile:{id:state.userId,nickname:state.profile?.nickname,posts_count:state.total},scan:{checked:state.checked,coverage:state.total?state.checked/state.total:0,complete:state.complete,timelineExhausted:state.timelineExhausted},users:sortedScores()};
    download(`yay-analysis-${state.userId}.json`,JSON.stringify(obj,null,2),"application/json");
  }
  function exportCSV(){
    const rows=[["rank","user_id","nickname","points","evidence_count"],...sortedScores().map((u,i)=>[i+1,u.id,u.nickname,u.points,u.evidence.length])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    download(`yay-analysis-${state.userId}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8");
  }
  async function exportMapImage(){
    if(!state.userId || !state.profile){showError("先にアカウントを分析してください。");return;}
    const btn=$("imageBtn");btn.disabled=true;btn.textContent="画像を生成中…";
    try{
      const users=sortedScores().slice(0,Number($("topLimit").value||50));
      if(!users.length) throw new Error("画像に表示するユーザーがまだいません。");
      // Draw using the existing 3000x3000 layout coordinates, but export
      // at 1000x1000 pixels to keep the PNG compact.
      const W=3000,H=3000,cx=1500,cy=1400;
      const EXPORT_SCALE=1/3;
      const showNames=$("showUsernames")?.checked!==false;
      const canvas=document.createElement("canvas");
      canvas.width=1000;canvas.height=1000;
      const ctx=canvas.getContext("2d");
      ctx.scale(EXPORT_SCALE,EXPORT_SCALE);
      const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#4d91cf");bg.addColorStop(.42,"#1b548e");bg.addColorStop(1,"#071a42");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      const glow=ctx.createRadialGradient(cx,cy,80,cx,cy,1150);glow.addColorStop(0,"rgba(82,190,255,.25)");glow.addColorStop(1,"rgba(5,16,44,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
      let seed=93073;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<260;i++){const x=rand()*W,y=rand()*H,r=1+rand()*5;ctx.fillStyle=`rgba(230,246,255,${.12+rand()*.42})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,.35)";ctx.shadowBlur=18;ctx.font="800 76px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText("交流したユーザー一覧",cx,90);
      ctx.shadowBlur=0;ctx.fillStyle="rgba(236,247,255,.86)";ctx.font="34px system-ui, sans-serif";ctx.fillText(`${state.profile.nickname||`Yay! User ${state.userId}`}  ·  Top ${$("topLimit").value}  ·  ${new Date().toLocaleDateString("ja-JP")}`,cx,160);
      const n=users.length;let groups=[];
      if(n<=10) groups=[{items:users,radius:360,ring:0}];
      else if(n<=30) groups=[{items:users.slice(0,10),radius:360,ring:0},{items:users.slice(10),radius:700,ring:1}];
      else groups=[
        {items:users.slice(0,10),radius:360,ring:0},
        {items:users.slice(10,30),radius:700,ring:1},
        {items:users.slice(30),radius:1000,ring:2}
      ];
      const points=[];groups.forEach(g=>g.items.forEach((u,i)=>{const angle=i/g.items.length*Math.PI*2-Math.PI/2+g.ring*.17;points.push({u,x:cx+Math.cos(angle)*g.radius,y:cy+Math.sin(angle)*g.radius,rank:users.findIndex(x=>x.id===u.id)+1});}));
      ctx.save();ctx.strokeStyle="rgba(164,225,255,.18)";ctx.lineWidth=3;[360,700,1000].forEach(r=>{ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();});ctx.restore();
      points.forEach(p=>{ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle="rgba(168,226,255,.26)";ctx.lineWidth=3;ctx.stroke();});
      const avatarObjectUrls=[];
      async function loadAvatar(url){
        if(!url)return null;
        const candidates=[url,`https://proxy.cors.dev/${url}`];
        for(const candidate of candidates){
          try{
            const response=await fetch(candidate,{mode:"cors",credentials:"omit",cache:"force-cache"});
            if(!response.ok)continue;
            const blob=await response.blob();
            if(!blob.type.startsWith("image/"))continue;
            const objectUrl=URL.createObjectURL(blob);avatarObjectUrls.push(objectUrl);
            const img=new Image();img.src=objectUrl;
            await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
            return img;
          }catch{}
        }
        return null;
      }
      const [centerImg,logoImg,...avatarImgs]=await Promise.all([
        loadAvatar(avatarOf(state.profile)),
        loadAvatar("https://yay.space/images/logotype.svg"),
        ...points.map(p=>loadAvatar(p.u.avatar))
      ]);
      function drawAvatar(img,x,y,r,name){
        ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
        if(img){const scale=Math.max(r*2/img.width,r*2/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,x-w/2,y-h/2,w,h);}
        else{const g=ctx.createLinearGradient(x-r,y-r,x+r,y+r);g.addColorStop(0,"#6ccfff");g.addColorStop(1,"#4759a8");ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.fillStyle="#fff";ctx.font=`800 ${Math.round(r*.9)}px system-ui`;ctx.fillText(initials(name),x,y+4);}
        ctx.restore();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle="#f0f8ff";ctx.lineWidth=12;ctx.stroke();ctx.beginPath();ctx.arc(x,y,r+9,0,Math.PI*2);ctx.strokeStyle="rgba(89,210,255,.28)";ctx.lineWidth=7;ctx.stroke();
      }
      drawAvatar(centerImg,cx,cy,160,state.profile.nickname);
      if(showNames){ctx.fillStyle="#fff";ctx.font="bold 38px system-ui, 'Noto Sans JP', sans-serif";ctx.fillText(state.profile.nickname||`User ${state.userId}`,cx,cy+220);}
      ctx.fillStyle="#c4eaff";ctx.font="28px system-ui";ctx.fillText(`@${state.userId}`,cx,cy+268);
      for(let i=0;i<points.length;i++){
        const p=points[i],r=88;drawAvatar(avatarImgs[i],p.x,p.y,r,p.u.nickname);
        const badgeColors=p.rank===1?["#ffe27a","#9b6500"]:p.rank===2?["#e7edf5","#42536b"]:p.rank===3?["#f2b37e","#75411d"]:["#25baff","#062846"];
        ctx.beginPath();ctx.arc(p.x+r*.72,p.y-r*.72,36,0,Math.PI*2);ctx.fillStyle=badgeColors[0];ctx.fill();ctx.lineWidth=5;ctx.strokeStyle="rgba(255,255,255,.9)";ctx.stroke();ctx.fillStyle=badgeColors[1];ctx.font="800 34px system-ui";ctx.fillText(String(p.rank),p.x+r*.72,p.y-r*.72+2);
        const label=p.u.nickname.length>15?p.u.nickname.slice(0,14)+"…":p.u.nickname;
        const labelY=p.y+124;
        if(showNames){
          ctx.font="700 22px system-ui, 'Noto Sans JP', sans-serif";const labelW=Math.min(210,Math.max(132,ctx.measureText(label).width+34));
          ctx.fillStyle="#061a35";roundRect(ctx,p.x-labelW/2,labelY-27,labelW,54,27);ctx.fill();ctx.strokeStyle="rgba(151,218,255,.22)";ctx.lineWidth=2;ctx.stroke();
          ctx.fillStyle="#fff";ctx.fillText(label,p.x,labelY);
        }
        ctx.fillStyle="#c8edff";ctx.font="22px system-ui";ctx.fillText(`${fmt(p.u.points)} 件`,p.x,showNames?labelY+40:p.y+128);
      }
      // Keep the footer intentionally minimal: the official Yay! logo only.
      // The graph is constrained above y=2650, leaving a clear logo-only strip.
      if(logoImg){
        const logoW=250,logoH=64;
        ctx.save();
        ctx.filter="brightness(0) invert(1)";
        ctx.globalAlpha=.96;
        ctx.drawImage(logoImg,cx-logoW/2,2790,logoW,logoH);
        ctx.restore();
      }else{
        ctx.fillStyle="rgba(235,247,255,.95)";
        ctx.font="900 58px system-ui, sans-serif";
        ctx.fillText("Yay!",cx,2822);
      }
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("PNG画像を作成できませんでした。");
      avatarObjectUrls.forEach(u=>URL.revokeObjectURL(u));
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`yay-interaction-map-${state.userId}-top${$("topLimit").value}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){showError(`画像を生成できませんでした: ${e.message}`);}
    finally{btn.disabled=false;btn.textContent="画像をダウンロード";}
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  $("analyzeBtn").addEventListener("click",startAnalysis);
  $("userFilter").addEventListener("input",renderRanking);
  $("topLimit").addEventListener("change",renderRanking);
  $("showUsernames").addEventListener("change",renderRanking);
  $("imageBtn").addEventListener("click",exportMapImage);
  $("userInput").addEventListener("keydown",e=>{if(e.key==="Enter")startAnalysis();});
  $("pauseBtn").addEventListener("click",()=>{state.paused=true;setStatus("一時停止");toggleControls();});
  $("resumeBtn").addEventListener("click",()=>{if(state.running){state.paused=false;toggleControls();return;}runScan();});
  $("stopBtn").addEventListener("click",()=>{state.stopped=true;state.paused=false;state.controller?.abort();});
  $("jsonBtn").addEventListener("click",exportJSON);$("csvBtn").addEventListener("click",exportCSV);
  $("closeDetail").addEventListener("click",()=>setHidden("detailPanel",true));
})();
