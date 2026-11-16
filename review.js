(() => {
  "use strict";
  const API = "https://proxy.cors.dev/https://api.yay.space";
  const $ = id => document.getElementById(id);
  const state = {
    profile:null, userId:null, scores:new Map(), reviews:[], pages:0, checked:0,
    total:0, cursor:null, seen:new Set(), paused:false, stopped:false,
    running:false, controller:null, complete:false, exhausted:false, topLimit:50, mapCentered:false
  };
  const fmt = n => Number(n||0).toLocaleString();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  let cooldownUntil=0;
  const setHidden=(id,yes)=>$(id).classList.toggle("hidden",yes);
  function showError(message){$("errorBox").textContent=message;setHidden("errorBox",false);}
  const RATE_LIMIT_MESSAGE="Yay! APIのアクセス制限を検出したため、処理を完全に停止しました。これ以上取得できません。時間をおいてから、もう一度最初から実行してください。";
  function stopForRateLimit(){
    state.stopped=true;state.paused=false;
    if($("scanStatus"))$("scanStatus").textContent="API制限により停止";
    if($("scanTitle"))$("scanTitle").textContent="これ以上取得できません";
    if($("coverageNote"))$("coverageNote").textContent=RATE_LIMIT_MESSAGE;
    showError(RATE_LIMIT_MESSAGE);
    const error=new Error(RATE_LIMIT_MESSAGE);error.code=429;return error;
  }
  function clearError(){$("errorBox").textContent="";setHidden("errorBox",true);}
  function parseInput(value){
    const s=String(value||"").trim();
    const post=s.match(/(?:^|\/)post\/(\d+)(?:[/?#]|$)/i);
    if(post)return {type:"post",id:post[1]};
    if(/^\d+$/.test(s))return {type:"user",id:s};
    const user=s.match(/(?:users?|profile|u)\/(\d+)(?:[/?#]|$)/i);
    if(user)return {type:"user",id:user[1]};
    return null;
  }
  function retryDelay(res,attempt){
    const h=res?.headers?.get("Retry-After");const sec=Number(h);
    return Math.max(h?(Number.isFinite(sec)?sec*1000:Math.max(0,Date.parse(h)-Date.now())):0,Math.min(30000,1000*2**attempt))+Math.floor(Math.random()*300);
  }
  async function apiGet(url,signal){
    let networkAttempt=0;
    while(true){
      if(signal?.aborted)throw new DOMException("停止","AbortError");
      while(Date.now()<cooldownUntil){
        if(signal?.aborted)throw new DOMException("停止","AbortError");
        await sleep(Math.min(500,cooldownUntil-Date.now()));
      }
      try{
        const res=await fetch(url,{method:"GET",mode:"cors",credentials:"omit",cache:"default",headers:{Accept:"application/json"},signal});
        if(res.status===429)throw stopForRateLimit();
        if(res.status>=500){
          if(networkAttempt++<2){cooldownUntil=Math.max(cooldownUntil,Date.now()+Math.min(15000,1000*2**networkAttempt));continue;}
          throw new Error(`Yay! API エラー (HTTP ${res.status})`);
        }
        const body=await res.text(),ct=(res.headers.get("content-type")||"").toLowerCase(),trim=body.trimStart();
        if(!res.ok)throw new Error(`Yay! API エラー (HTTP ${res.status})`);
        if(!ct.includes("json")||!(trim.startsWith("{")||trim.startsWith("["))){
          throw new Error(`JSON以外の応答を受信しました (HTTP ${res.status}, ${ct||"Content-Type不明"})。CORS中継サービスまたはAPIの応答を確認してください。`);
        }
        let data;try{data=JSON.parse(body);}catch{throw new Error("API応答をJSONとして解析できませんでした。");}
        const apiMessage=String(data?.message||"");
        const rateLimited=Number(data?.error_code)===429||(data?.result!=="success"&&/429|rate.?limit|too many requests|アクセス制限/i.test(apiMessage));
        if(rateLimited)throw stopForRateLimit();
        if(data?.result&&data.result!=="success")throw new Error(apiMessage||"Yay! APIから正常な応答がありませんでした。");
        return data;
      }catch(e){
        if(e.name==="AbortError"||e.code===429)throw e;
        if(/HTTP \d+|JSON以外|JSONとして解析|正常な応答/.test(e.message||""))throw e;
        if(networkAttempt++<2){cooldownUntil=Math.max(cooldownUntil,Date.now()+Math.min(15000,750*2**networkAttempt));continue;}
        if(e instanceof TypeError)throw new Error("Yay! APIまたはCORS中継サービスに接続できませんでした。");
        throw e;
      }
    }
  }

  function avatarOf(u){
    const v=u?.profile_icon||u?.profile_icon_thumbnail||u?.profile_icon_url||u?.profile_image_url||u?.profile_image||u?.avatar_url||"";
    if(typeof v==="string")return v.startsWith("//")?`https:${v}`:v.startsWith("/")?`https://yay.space${v}`:v;
    return v?.url||v?.uri||v?.image_url||"";
  }
  function initials(name){return String(name||"?").trim().slice(0,1).toUpperCase()||"?";}
  function updateProfile(p){
    state.profile=p;
    $("avatar").src=avatarOf(p);$("avatar").onerror=()=>{$("avatar").src="";};
    $("nickname").textContent=p.nickname||`User ${p.id}`;$("profileId").textContent=`Yay! ID ${p.id}`;
    $("followers").textContent=fmt(p.followers_count);$("lifetimePosts").textContent=fmt(p.reviews_count);
    $("cover").style.backgroundImage=p.cover_image?`url("${p.cover_image}")`:"";
    // Re-label the shared profile stat without relying on timeline fields.
    $("lifetimePosts").nextElementSibling.textContent="総レター数";
    setHidden("profileSection",false);
  }
  function reset(){
    state.scores=new Map();state.reviews=[];state.pages=0;state.checked=0;
    state.total=Number(state.profile?.reviews_count||0);state.cursor=null;state.seen=new Set();
    state.paused=false;state.stopped=false;state.running=false;state.complete=false;state.exhausted=false;state.mapCentered=false;
    $("interactionMap").innerHTML='<div class="empty-state">最初のレターを読み込んでいます…</div>';
    $("detailPanel").classList.add("hidden");updateProgress();updateLiveStats();
  }
  function updateProgress(){
    const pct=state.total?Math.min(100,state.checked/state.total*100):0;
    $("progressFill").style.width=`${pct}%`;$("progressPercent").textContent=`${pct.toFixed(1)}%`;
    $("progressLabel").textContent=`${fmt(state.checked)} / ${fmt(state.total)} 件を確認`;
    $("checkedCount").textContent=fmt(state.checked);$("pageCount").textContent=fmt(state.pages);
  }
  function addReview(review){
    const sender=review?.reviewer;
    if(!review?.id||!sender?.id)return;
    const id=Number(sender.id);if(!id||id===state.userId)return;
    let entry=state.scores.get(id);
    if(!entry){entry={id,nickname:sender.nickname||`User ${id}`,avatar:avatarOf(sender),points:0,evidence:[]};state.scores.set(id,entry);}
    else{entry.avatar=entry.avatar||avatarOf(sender);if(entry.nickname===`User ${id}`&&sender.nickname)entry.nickname=sender.nickname;}
    const reviewId=Number(review.id);
    if(!entry.evidence.some(e=>e.reviewId===reviewId)){
      entry.points++;entry.evidence.push({reviewId,comment:review.comment||"",createdAt:Number(review.created_at||0),mutual:!!review.mutual_review,url:`https://yay.space/user/${state.userId}`});
    }
  }
  function sortedScores(){return [...state.scores.values()].sort((a,b)=>b.points-a.points||a.nickname.localeCompare(b.nickname));}
  function updateLiveStats(){
    const people=state.scores.size,points=[...state.scores.values()].reduce((a,x)=>a+x.points,0);
    $("interactionCount").textContent=fmt(points);$("discoveredCount").textContent=fmt(people);
    $("totalInteractions").textContent=fmt(points);$("totalPeople").textContent=fmt(people);
    $("totalScanned").textContent=fmt(state.checked);
    $("coverageText").textContent=`総レター数に対して ${state.total?Math.min(100,state.checked/state.total*100).toFixed(1):0}%`;
    renderMap();
  }
  function mapPositions(rows){
    const width=2400,height=2400,cx=1200,cy=1200,n=rows.length;let groups=[];
    if(n<=10)groups=[{items:rows,radius:400,ring:0}];
    else if(n<=30)groups=[{items:rows.slice(0,10),radius:400,ring:0},{items:rows.slice(10),radius:720,ring:1}];
    else groups=[{items:rows.slice(0,10),radius:400,ring:0},{items:rows.slice(10,30),radius:720,ring:1},{items:rows.slice(30),radius:900,ring:2}];
    const points=[];groups.forEach(g=>g.items.forEach((u,i)=>{const a=i/g.items.length*Math.PI*2-Math.PI/2+g.ring*.11;points.push({u,x:cx+Math.cos(a)*g.radius,y:cy+Math.sin(a)*g.radius,rank:rows.findIndex(x=>x.id===u.id)+1});}));
    return {width,height,cx,cy,points};
  }
  function centerMapOnFirstRender(){
    if(state.mapCentered) return;
    const viewport=$("interactionMap"),canvas=viewport?.querySelector(".map-canvas");
    if(!viewport || !canvas) return;
    // Center the selected account's node once; subsequent data refreshes keep
    // the user's current pan/scroll position unchanged.
    viewport.scrollLeft=Math.max(0,(viewport.scrollWidth-viewport.clientWidth)/2);
    viewport.scrollTop=Math.max(0,(viewport.scrollHeight-viewport.clientHeight)/2);
    state.mapCentered=true;
  }
  function renderMap(){
    const all=sortedScores(),limit=Number($("topLimit")?.value||50),filter=($("userFilter")?.value||"").trim().toLowerCase();
    const rows=all.slice(0,limit).filter(u=>String(u.id).includes(filter)||u.nickname.toLowerCase().includes(filter));
    $("mapUserCount").textContent=`Top ${limit} · ${fmt(rows.length)} / ${fmt(all.length)} 人`;
    if(!rows.length){$("interactionMap").innerHTML=`<div class="empty-state">${all.length?"検索条件に一致するユーザーはいません。":"レターを受け取ると、送信者がここに表示されます。"}</div>`;return;}
    const {width,height,cx,cy,points}=mapPositions(rows);
    const lines=points.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="map-link"/>`).join("");
    const nodes=points.map(p=>{
      const av=esc(p.u.avatar||"");
      return `<button class="map-node" style="left:${p.x/width*100}%;top:${p.y/height*100}%" data-user="${p.u.id}" title="${esc(p.u.nickname)} · ${p.u.points} 件"><span class="node-avatar-wrap"><span class="avatar-fallback">${esc(initials(p.u.nickname))}</span>${av?`<img src="${av}" alt="${esc(p.u.nickname)}" loading="eager" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:""}<span class="node-rank rank-${p.rank<=3?p.rank:"other"}">${p.rank}</span></span><span class="node-name">${esc(p.u.nickname)}</span><span class="node-count">${fmt(p.u.points)} 通</span></button>`;
    }).join("");
    const avatar=avatarOf(state.profile),status=state.running?"● スキャン中・随時更新":state.complete?"✓ 完了":"取得済みデータ";
    $("interactionMap").innerHTML=`<div class="map-canvas" data-map-width="${width}" data-map-height="${height}"><div class="map-live-status">${status} · ${fmt(all.length)} 人</div><svg class="map-lines" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><circle class="map-orbit" cx="${cx}" cy="${cy}" r="400"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="720"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="900"/>${lines}</svg><div class="map-center" style="left:50%;top:50%"><span class="center-fallback">${esc(initials(state.profile?.nickname))}</span>${avatar?`<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:""}<b>${esc(state.profile?.nickname||`User ${state.userId}`)}</b><span>@${state.userId} · ${fmt(state.total)} 通</span></div>${nodes}</div>`;
    centerMapOnFirstRender();
    document.querySelectorAll(".map-node").forEach(el=>el.addEventListener("click",()=>showDetails(Number(el.dataset.user))));
  }
  function showDetails(id){
    const u=state.scores.get(id);if(!u)return;
    $("detailTitle").textContent=`${u.nickname} · ${fmt(u.points)} 通のレター`;
    $("detailContent").innerHTML=`<p class="profile-link-row"><a href="https://yay.space/user/${u.id}" target="_blank" rel="noopener">${esc(u.nickname)} のプロフィールを開く ↗</a></p>`+
      u.evidence.slice().sort((a,b)=>b.createdAt-a.createdAt).map(e=>`<div class="evidence-item"><div class="evidence-meta"><span>${e.createdAt?new Date(e.createdAt*1000).toLocaleString():"日時不明"}</span><span>#${e.reviewId}</span></div><p>${esc(e.comment||"(本文なし)")}</p><span class="subtle">${e.mutual?"相互レビュー":"相互レビューではない"}</span></div>`).join("");
    setHidden("detailPanel",false);$("detailPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function setStatus(text){$("scanStatus").textContent=text;$("scanTitle").textContent=text==="完了"?"分析完了":text==="一時停止"?"一時停止中":text==="停止"?"分析を停止しました":"レターを確認中";}
  function toggleControls(){
    $("pauseBtn").classList.toggle("hidden",!state.running||state.paused);
    $("stopBtn").classList.toggle("hidden",!state.running);
    $("resumeBtn").classList.toggle("hidden",!state.paused||state.stopped);
  }
  async function waitPaused(){while(state.paused&&!state.stopped)await sleep(200);if(state.stopped)throw new DOMException("停止","AbortError");}
  async function scan(){
    if(state.running)return;
    state.running=true;state.paused=false;state.stopped=false;toggleControls();setStatus("分析中");
    const controller=new AbortController();state.controller=controller;
    try{
      while(!state.stopped){
        await waitPaused();
        const url=state.cursor
          ?`${API}/v1/users/reviews/${state.userId}?from_id=${encodeURIComponent(state.cursor)}&number=50`
          :`${API}/v1/users/reviews/${state.userId}?number=50`;
        const data=await apiGet(url,controller.signal);
        const rows=Array.isArray(data.reviews)?data.reviews:[];
        const pinned=state.pages===0&&Array.isArray(data.pinned_reviews)?data.pinned_reviews:[];
        state.pages++;
        if(!rows.length&&!pinned.length){state.exhausted=true;break;}
        const pageIds=rows.map(r=>Number(r?.id)).filter(Boolean);
        const oldest=pageIds.length?String(Math.min(...pageIds)):null;
        // Pinned letters are returned separately by Yay!. Include them too;
        // the review ID set prevents double-counting if pagination returns them again.
        for(const review of [...pinned,...rows]){
          const rid=Number(review?.id);if(!rid)continue;
          if(state.seen.has(rid))continue;
          state.seen.add(rid);state.reviews.push(review);state.checked++;addReview(review);
        }
        const previous=state.cursor;
        state.cursor=oldest!==null?oldest:null;
        updateProgress();updateLiveStats();
        if(!state.cursor||state.cursor===previous||rows.length<50){state.exhausted=true;break;}
      }
      if(state.stopped){setStatus("停止");$("coverageNote").textContent="分析を停止しました。ここまで取得したレターの結果を表示しています。";}
      else if(state.exhausted&&state.checked<state.total){
        $("scanStatus").textContent="取得可能なレターは以上です";setStatus("完了");
        $("coverageNote").textContent=`APIから取得できるレターは ${fmt(state.checked)} 件で終了しました。Fresh User API の reviews_count は ${fmt(state.total)} 件です。取得できないレビューがある可能性があります。`;
      }else{state.complete=true;setStatus("完了");$("coverageNote").textContent="レビューAPIから取得できるレターの確認が完了しました。";}
      finish();
    }catch(e){
      if(e.code===429){setStatus("停止");$("scanStatus").textContent="API制限により停止";$("scanTitle").textContent="これ以上取得できません";finish();}
      else if(e.name==="AbortError"){if(state.stopped){setStatus("停止");finish();}}
      else{setStatus("エラー");showError(e.message);$("coverageNote").textContent="分析を続行できませんでした。取得済みの結果は表示されています。";finish();}
    }finally{state.running=false;state.controller=null;toggleControls();renderMap();}
  }
  function finish(){setHidden("resultsSection",false);updateLiveStats();}
  async function startAnalysis(){
    clearError();const input=parseInput($("userInput").value);
    if(!input){showError("Yay! の投稿URL、プロフィールURL、またはユーザーIDを入力してください。");return;}
    $("analyzeBtn").disabled=true;
    try{
      let userId=input.id;
      // A post URL is used only to resolve the author's user ID. No timeline is requested.
      if(input.type==="post"){
        $("analyzeBtn").querySelector("span").textContent="投稿URLからユーザーを確認中…";
        let postData;
        try{
          postData=await apiGet(`${API}/v2/posts/${encodeURIComponent(input.id)}`);
        }catch(error){
          if(/not found|404/i.test(error.message||"")){
            throw new Error("この投稿はフォロワーにのみ公開されているため、投稿URLからは分析できません。レターマップではレビュー自体を確認できますが、投稿を確認できないため、対象ユーザーのプロフィールURLまたはユーザーIDを入力してください。なお、プロフィールURLまたはユーザーIDからなら分析できます。");
          }
          throw error;
        }
        const post=postData.post||postData.data?.post||postData;
        if(!post?.user?.id)throw new Error("投稿情報から投稿者の user.id を取得できませんでした。プロフィールURLまたはユーザーIDを入力してください。");
        userId=String(post.user.id);
      }
      $("analyzeBtn").querySelector("span").textContent="プロフィールを取得中…";
      const data=await apiGet(`${API}/v2/users/fresh/${encodeURIComponent(userId)}`);
      const p=data.user||data.profile||data;
      if(!p?.id)throw new Error("プロフィール情報を取得できませんでした。");
      state.userId=Number(p.id);updateProfile(p);reset();
      setHidden("scanSection",false);setHidden("resultsSection",false);updateLiveStats();
      $("coverageNote").textContent="レビューAPIに接続中…";
      await scan();
    }catch(e){showError(e.message);}
    finally{$("analyzeBtn").disabled=false;$("analyzeBtn").querySelector("span").textContent="分析を開始";}
  }
  function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
  function exportJSON(){download(`yay-review-map-${state.userId}.json`,JSON.stringify({profile:{id:state.userId,nickname:state.profile?.nickname,reviews_count:state.total},scan:{checked:state.checked,pages:state.pages,complete:state.complete,exhausted:state.exhausted},senders:sortedScores()},null,2),"application/json");}
  function exportCSV(){
    const rows=[["rank","user_id","nickname","letters","review_count"],...sortedScores().map((u,i)=>[i+1,u.id,u.nickname,u.points,u.evidence.length])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    download(`yay-review-map-${state.userId}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8");
  }
  $("analyzeBtn").addEventListener("click",startAnalysis);
  $("userFilter").addEventListener("input",renderMap);$("topLimit").addEventListener("change",renderMap);
  $("userInput").addEventListener("keydown",e=>{if(e.key==="Enter")startAnalysis();});
  $("pauseBtn").addEventListener("click",()=>{state.paused=true;setStatus("一時停止");toggleControls();});
  $("resumeBtn").addEventListener("click",()=>{if(state.running){state.paused=false;toggleControls();}else scan();});
  $("stopBtn").addEventListener("click",()=>{state.stopped=true;state.paused=false;state.controller?.abort();});
  async function exportMapImage(){
    if(!state.userId||!state.profile){showError("先にアカウントを分析してください。");return;}
    const btn=$("imageBtn");btn.disabled=true;btn.textContent="画像を生成中…";
    try{
      const users=sortedScores().slice(0,Number($("topLimit").value||50));
      if(!users.length)throw new Error("画像に表示する送信者がまだいません。");
      const W=2400,H=2400,cx=1200,cy=1200;
      const {points}=mapPositions(users);
      const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=1200;
      const ctx=canvas.getContext("2d");ctx.scale(.5,.5);
      const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#173e6c");bg.addColorStop(1,"#071a35");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      const glow=ctx.createRadialGradient(cx,cy,80,cx,cy,1100);glow.addColorStop(0,"rgba(65,190,255,.24)");glow.addColorStop(1,"rgba(5,16,44,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#fff";ctx.font="800 58px system-ui, 'Noto Sans JP',sans-serif";ctx.fillText("レターを送ってくれた人",cx,72);
      ctx.fillStyle="#c8eaff";ctx.font="28px system-ui";ctx.fillText(`${state.profile.nickname||`Yay! User ${state.userId}`} · ${fmt(state.total)} 通 · ${new Date().toLocaleDateString("ja-JP")}`,cx,125);
      [400,720,900].forEach(r=>{ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle="rgba(164,225,255,.16)";ctx.lineWidth=3;ctx.stroke();});
      points.forEach(p=>{ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle="rgba(168,226,255,.27)";ctx.lineWidth=3;ctx.stroke();});
      async function loadImage(url){
        if(!url)return null;
        for(const candidate of [url,`https://proxy.cors.dev/${url}`]){
          try{const r=await fetch(candidate,{mode:"cors",credentials:"omit"});if(!r.ok)continue;const b=await r.blob();if(!b.type.startsWith("image/"))continue;const obj=URL.createObjectURL(b),img=new Image();img.src=obj;await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;});return {img,obj};}catch{}
        }return null;
      }
      let creator=window.__yayCreator||null;
      if(!creator){try{const r=await fetch("https://proxy.cors.dev/https://api.yay.space/v2/users/11044343",{headers:{Accept:"application/json"},mode:"cors",credentials:"omit"});if(r.ok){const d=await r.json();if(d?.result==="success"&&String(d.user?.id)==="11044343")creator={id:"11044343",nickname:d.user.nickname,avatar:avatarOf(d.user)};}}catch{}}
      const [centerLoaded,logoLoaded,creatorLoaded,...avatarLoaded]=await Promise.all([loadImage(avatarOf(state.profile)),loadImage("https://yay.space/images/logotype.svg"),loadImage(creator?.avatar||""),...points.map(p=>loadImage(p.u.avatar))]);
      const loaded=[centerLoaded,...avatarLoaded];
      function avatar(item,x,y,r,name){
        ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
        if(item){const im=item.img,s=Math.max(r*2/im.width,r*2/im.height);ctx.drawImage(im,x-im.width*s/2,y-im.height*s/2,im.width*s,im.height*s);}
        else{const g=ctx.createLinearGradient(x-r,y-r,x+r,y+r);g.addColorStop(0,"#5fdcff");g.addColorStop(1,"#5368b7");ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.fillStyle="#fff";ctx.font=`800 ${r}px system-ui`;ctx.fillText(initials(name),x,y);}
        ctx.restore();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle="#effaff";ctx.lineWidth=10;ctx.stroke();
      }
      avatar(loaded[0],cx,cy,145,state.profile.nickname);
      ctx.fillStyle="#fff";ctx.font="bold 34px system-ui, 'Noto Sans JP',sans-serif";ctx.fillText(state.profile.nickname||`User ${state.userId}`,cx,cy+185);
      ctx.fillStyle="#c8eaff";ctx.font="26px system-ui";ctx.fillText(`@${state.userId}`,cx,cy+228);
      points.forEach((p,i)=>{
        avatar(loaded[i+1],p.x,p.y,58,p.u.nickname);
        const medal=p.rank===1?"#f5c542":p.rank===2?"#c7d0da":p.rank===3?"#c9824b":"#35baff";
        ctx.beginPath();ctx.arc(p.x+42,p.y-42,20,0,Math.PI*2);ctx.fillStyle=medal;ctx.fill();ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=3;ctx.stroke();ctx.fillStyle="#06213a";ctx.font="800 19px system-ui";ctx.fillText(String(p.rank),p.x+42,p.y-41);
        ctx.fillStyle="#fff";ctx.font="bold 24px system-ui, 'Noto Sans JP',sans-serif";
        const label=p.u.nickname.length>14?p.u.nickname.slice(0,13)+"…":p.u.nickname;ctx.fillText(label,p.x,p.y+86);
        ctx.fillStyle="#bceaff";ctx.font="22px system-ui";ctx.fillText(`${fmt(p.u.points)} 通`,p.x,p.y+113);
      });
      if(creator?.nickname){
        const creditY=2290;ctx.save();ctx.textAlign="left";ctx.fillStyle="rgba(4,18,38,.78)";ctx.beginPath();ctx.roundRect(42,creditY-58,560,112,28);ctx.fill();
        avatar(creatorLoaded,98,creditY,38,creator.nickname);
        ctx.fillStyle="#a9c7e4";ctx.font="20px system-ui, 'Noto Sans JP',sans-serif";ctx.fillText("このプロジェクトの制作者",158,creditY-17);
        ctx.fillStyle="#fff";ctx.font="bold 29px system-ui, 'Noto Sans JP',sans-serif";ctx.fillText(creator.nickname,158,creditY+20);ctx.restore();
      }
      if(logoLoaded?.img){const im=logoLoaded.img,maxW=250,maxH=64,ratio=Math.min(maxW/(im.naturalWidth||im.width),maxH/(im.naturalHeight||im.height)),w=(im.naturalWidth||im.width)*ratio,h=(im.naturalHeight||im.height)*ratio;ctx.save();ctx.filter="brightness(0) invert(1)";ctx.globalAlpha=.95;ctx.drawImage(im,cx-w/2,2290-h/2,w,h);ctx.restore();}
      [centerLoaded,logoLoaded,creatorLoaded,...avatarLoaded].forEach(x=>{if(x?.obj)URL.revokeObjectURL(x.obj);});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("PNG画像を作成できませんでした。");
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`yay-letter-map-${state.userId}-top${$("topLimit").value}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){showError(`画像を生成できませんでした: ${e.message}`);}
    finally{btn.disabled=false;btn.textContent="画像をダウンロード";}
  }
  $("imageBtn").addEventListener("click",exportMapImage);
  $("jsonBtn").addEventListener("click",exportJSON);$("csvBtn").addEventListener("click",exportCSV);
  $("closeDetail").addEventListener("click",()=>setHidden("detailPanel",true));
})();