(() => {
  "use strict";
  const API = "https://proxy.cors.dev/https://api.yay.space";
  const $ = id => document.getElementById(id);
  const state = {
    profile:null,userId:null,scores:new Map(),posts:[],pages:0,checked:0,total:0,
    cursor:null,seenPosts:new Set(),seenCalls:new Set(),paused:false,stopped:false,
    running:false,controller:null,complete:false,exhausted:false,topLimit:50,mapCentered:false
  };
  const fmt=n=>Number(n||0).toLocaleString("ja-JP");
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const setHidden=(id,yes)=>$(id).classList.toggle("hidden",yes);
  let cooldownUntil=0;
  function showError(message){$("errorBox").textContent=message;setHidden("errorBox",false);}
  function clearError(){$("errorBox").textContent="";setHidden("errorBox",true);}
  const RATE_LIMIT_MESSAGE="Yay! APIのアクセス制限を検出したため、処理を停止しました。時間をおいてから、もう一度実行してください。";
  function stopForRateLimit(){
    state.stopped=true;state.paused=false;
    $("scanStatus").textContent="API制限により停止";$("scanTitle").textContent="これ以上取得できません";
    $("coverageNote").textContent=RATE_LIMIT_MESSAGE;showError(RATE_LIMIT_MESSAGE);
    const e=new Error(RATE_LIMIT_MESSAGE);e.code=429;return e;
  }
  function parseInput(v){
    const s=String(v||"").trim();
    if(/^\d+$/.test(s))return s;
    const m=s.match(/(?:users?|profile|u)\/(\d+)(?:[/?#]|$)/i);
    return m?m[1]:null;
  }
  async function apiGet(url,signal){
    let attempts=0;
    while(true){
      if(signal?.aborted)throw new DOMException("停止","AbortError");
      while(Date.now()<cooldownUntil){if(signal?.aborted)throw new DOMException("停止","AbortError");await sleep(Math.min(500,cooldownUntil-Date.now()));}
      try{
        const res=await window.YayAPI.fetch(url,{method:"GET",headers:{Accept:"application/json"},signal});
        if(res.status===429)throw stopForRateLimit();
        if(res.status>=500){if(attempts++<2){cooldownUntil=Math.max(cooldownUntil,Date.now()+Math.min(15000,1000*2**attempts));continue;}throw new Error(`Yay! API エラー (HTTP ${res.status})`);}
        const body=await res.text(),ct=(res.headers.get("content-type")||"").toLowerCase(),trim=body.trimStart();
        if(!res.ok){
          let d={};try{d=JSON.parse(body);}catch{}
          const e=new Error(`Yay! API エラー (HTTP ${res.status})${d.message?`: ${d.message}`:""}`);e.code=Number(d.error_code)||res.status;throw e;
        }
        if(!ct.includes("json")||!(trim.startsWith("{")||trim.startsWith("[")))throw new Error(`JSON以外の応答を受信しました (HTTP ${res.status})。APIまたはCORS中継サービスを確認してください。`);
        let data;try{data=JSON.parse(body);}catch{throw new Error("API応答をJSONとして解析できませんでした。");}
        const msg=String(data?.message||"");
        if(Number(data?.error_code)===429||(data?.result!=="success"&&/429|rate.?limit|too many requests|アクセス制限/i.test(msg)))throw stopForRateLimit();
        if(Number(data?.error_code)===-363||msg.toLowerCase().includes("unable to view private user timeline")){
          const e=new Error("このユーザーのタイムラインは非公開のため閲覧できません。");e.code=-363;throw e;
        }
        if(data?.result&&data.result!=="success")throw new Error(msg||"Yay! APIから正常な応答がありませんでした。");
        return data;
      }catch(e){
        if(e.name==="AbortError"||e.code===429||e.code===-363)throw e;
        if(/HTTP \d+|JSON以外|JSONとして解析|正常な応答/.test(e.message||""))throw e;
        if(attempts++<2){cooldownUntil=Math.max(cooldownUntil,Date.now()+Math.min(15000,750*2**attempts));continue;}
        if(e instanceof TypeError)throw new Error("Yay! APIまたはCORS中継サービスに接続できませんでした。");
        throw e;
      }
    }
  }
  const DEFAULT_AVATAR="https://cdn.yay.space/img/default-profile-icon-thumb.png";
  function avatarOf(u){
    const v=u?.profile_icon||u?.profile_icon_thumbnail||u?.profile_icon_url||u?.profile_image_url||u?.profile_image||u?.avatar_url||"";
    let url=typeof v==="string"?v.startsWith("//")?`https:${v}`:v.startsWith("/")?`https://yay.space${v}`:v:(v?.url||v?.uri||v?.image_url||"");
    return url||DEFAULT_AVATAR;
  }
  const initials=n=>String(n||"?").trim().slice(0,1).toUpperCase()||"?";
  function updateProfile(p){
    state.profile=p;$("avatar").src=avatarOf(p);$("avatar").onerror=()=>{const img=$("avatar");img.onerror=null;img.src=DEFAULT_AVATAR;};
    $("nickname").textContent=p.nickname||`User ${p.id}`;$("profileId").textContent=`Yay! ID ${p.id}`;
    $("followers").textContent=fmt(p.followers_count);$("lifetimePosts").textContent=fmt(p.posts_count);
    $("cover").style.backgroundImage=p.cover_image?`url("${p.cover_image}")`:"";
    $("lifetimePosts").nextElementSibling.textContent="総投稿数";setHidden("profileSection",false);
  }
  function reset(){
    state.scores=new Map();state.posts=[];state.pages=0;state.checked=0;state.total=Number(state.profile?.posts_count||0);
    state.cursor=null;state.seenPosts=new Set();state.seenCalls=new Set();state.paused=false;state.stopped=false;
    state.running=false;state.complete=false;state.exhausted=false;state.mapCentered=false;
    $("interactionMap").innerHTML='<div class="empty-state">最初の投稿を読み込んでいます…</div>';
    setHidden("detailPanel",true);updateProgress();updateLiveStats();
  }
  function updateProgress(){
    const pct=state.total?Math.min(100,state.checked/state.total*100):0;
    $("progressFill").style.width=`${pct}%`;$("progressPercent").textContent=`${pct.toFixed(1)}%`;
    $("progressLabel").textContent=`${fmt(state.checked)} / ${fmt(state.total)} 件を確認`;
    $("checkedCount").textContent=fmt(state.checked);$("pageCount").textContent=fmt(state.pages);
  }
  function getPosts(data){
    if(Array.isArray(data?.posts))return data.posts;
    if(Array.isArray(data?.data?.posts))return data.data.posts;
    if(Array.isArray(data?.timeline))return data.timeline;
    if(Array.isArray(data?.data?.timeline))return data.data.timeline;
    if(Array.isArray(data?.items))return data.items;
    return [];
  }
  function normalizeParticipant(raw){
    const u=raw?.user||raw?.participant||raw;
    const id=Number(u?.id??raw?.user_id);
    if(!id||id===state.userId)return null;
    return {id,nickname:u?.nickname||u?.username||raw?.nickname||`User ${id}`,avatar:avatarOf(u)};
  }
  function addCall(post){
    const call=post?.conference_call;
    if(!call||String(post?.post_type||"").toLowerCase()!=="call")return;
    const callId=String(call.id??post.id??"");
    if(!callId||state.seenCalls.has(callId))return;
    state.seenCalls.add(callId);
    const participants=Array.isArray(call.conference_call_users)?call.conference_call_users:[];
    const roleRows=Array.isArray(call.conference_call_user_roles)?call.conference_call_user_roles:[];
    const roles=new Map(roleRows.map(r=>[Number(r.user_id??r.id),r.role||""]));
    const localSeen=new Set();
    for(const raw of participants){
      const person=normalizeParticipant(raw);if(!person||localSeen.has(person.id))continue;localSeen.add(person.id);
      let entry=state.scores.get(person.id);
      if(!entry){entry={...person,points:0,evidence:[]};state.scores.set(person.id,entry);}
      else{entry.avatar=entry.avatar||person.avatar;if(entry.nickname===`User ${person.id}`&&person.nickname)entry.nickname=person.nickname;}
      entry.points++;
      entry.evidence.push({
        callId,postId:Number(post.id)||null,createdAt:Number(post.created_at||call.created_at||0),
        duration:Number(call.duration||0),genre:call.genre||"",game:call.game||"",
        callType:call.call_type||"",mode:call.mode||"",role:roles.get(person.id)||"",
        participantCount:participants.length,reportedCount:Number(call.conference_call_users_count||participants.length)
      });
    }
  }
  function sortedScores(){return [...state.scores.values()].sort((a,b)=>b.points-a.points||a.nickname.localeCompare(b.nickname));}
  function updateLiveStats(){
    const people=state.scores.size,points=[...state.scores.values()].reduce((a,x)=>a+x.points,0);
    $("interactionCount").textContent=fmt(points);$("discoveredCount").textContent=fmt(people);
    $("totalInteractions").textContent=fmt(points);$("totalPeople").textContent=fmt(people);
    $("totalScanned").textContent=fmt(state.checked);
    $("coverageText").textContent=`総投稿数に対して ${state.total?Math.min(100,state.checked/state.total*100).toFixed(1):0}%`;
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
    if(state.mapCentered)return;const v=$("interactionMap"),c=v?.querySelector(".map-canvas");if(!v||!c)return;
    v.scrollLeft=Math.max(0,(v.scrollWidth-v.clientWidth)/2);v.scrollTop=Math.max(0,(v.scrollHeight-v.clientHeight)/2);state.mapCentered=true;
  }
  function renderMap(){
    const all=sortedScores(),limit=Number($("topLimit")?.value||50),filter=($("userFilter")?.value||"").trim().toLowerCase();
    const rows=all.slice(0,limit).filter(u=>String(u.id).includes(filter)||u.nickname.toLowerCase().includes(filter));
    $("mapUserCount").textContent=`上位${limit}人 · ${fmt(rows.length)} / ${fmt(all.length)} 人`;
    if(!rows.length){$("interactionMap").innerHTML=`<div class="empty-state">${all.length?"検索条件に一致するユーザーはいません。":"通話投稿が見つかると、参加ユーザーがここに表示されます。"}</div>`;return;}
    const {width,height,cx,cy,points}=mapPositions(rows);
    const lines=points.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="map-link"/>`).join("");
    const nodes=points.map(p=>{
      const av=esc(p.u.avatar||"");
      return `<button class="map-node" style="left:${p.x/width*100}%;top:${p.y/height*100}%" data-user="${p.u.id}" title="${esc(p.u.nickname)} · ${p.u.points} 回"><span class="node-avatar-wrap"><span class="avatar-fallback">${esc(initials(p.u.nickname))}</span>${av?`<img src="${av}" alt="${esc(p.u.nickname)}" loading="eager" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://cdn.yay.space/img/default-profile-icon-thumb.png'">`:""}<span class="node-rank rank-${p.rank<=3?p.rank:"other"}">${p.rank}</span></span><span class="node-name" style="${$("showUsernames").checked?"":"display:none"}">${esc(p.u.nickname)}</span><span class="node-count">${fmt(p.u.points)} 回</span></button>`;
    }).join("");
    const avatar=avatarOf(state.profile),status=state.running?"● スキャン中・随時更新":state.complete?"✓ 完了":"取得済みデータ";
    $("interactionMap").innerHTML=`<div class="map-canvas" data-map-width="${width}" data-map-height="${height}"><div class="map-live-status">${status} · ${fmt(all.length)} 人</div><svg class="map-lines" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><circle class="map-orbit" cx="${cx}" cy="${cy}" r="400"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="720"/><circle class="map-orbit" cx="${cx}" cy="${cy}" r="900"/>${lines}</svg><div class="map-center" style="left:50%;top:50%"><span class="center-fallback">${esc(initials(state.profile?.nickname))}</span>${avatar?`<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://cdn.yay.space/img/default-profile-icon-thumb.png'">`:""}<b>${esc(state.profile?.nickname||`User ${state.userId}`)}</b><span>@${state.userId} · ${fmt(state.seenCalls.size)} 通話</span></div>${nodes}</div>`;
    centerMapOnFirstRender();document.querySelectorAll(".map-node").forEach(el=>el.addEventListener("click",()=>showDetails(Number(el.dataset.user))));
  }
  function durationText(seconds){
    const n=Math.max(0,Number(seconds)||0),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=Math.floor(n%60);
    return h?`${h}時間${m}分`:m?`${m}分${s}秒`:`${s}秒`;
  }
  function showDetails(id){
    const u=state.scores.get(id);if(!u)return;
    $("detailTitle").textContent=`${u.nickname} · ${fmt(u.points)} 回の通話`;
    $("detailContent").innerHTML=`<p class="profile-link-row"><a href="https://yay.space/user/${u.id}" target="_blank" rel="noopener">${esc(u.nickname)} のプロフィールを開く ↗</a></p>`+
      u.evidence.slice().sort((a,b)=>b.createdAt-a.createdAt).map(e=>`<div class="evidence-item"><div class="evidence-meta"><span>${e.createdAt?new Date(e.createdAt*1000).toLocaleString("ja-JP"):"日時不明"}</span><span>通話 #${esc(e.callId)}</span></div><p>${esc([e.genre,e.game].filter(Boolean).join(" · ")||"通話")}</p><span class="subtle">${durationText(e.duration)} · ${esc(e.role||"役割情報なし")} · 参加者 ${fmt(e.participantCount)} 人</span></div>`).join("");
    setHidden("detailPanel",false);$("detailPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function setStatus(t){$("scanStatus").textContent=t;$("scanTitle").textContent=t==="完了"?"分析完了":t==="一時停止"?"一時停止中":t==="停止"?"分析を停止しました":"通話投稿を確認中";}
  function toggleControls(){
    $("pauseBtn").classList.toggle("hidden",!state.running||state.paused);$("stopBtn").classList.toggle("hidden",!state.running);
    $("resumeBtn").classList.toggle("hidden",!state.paused||state.stopped);
  }
  async function waitPaused(){while(state.paused&&!state.stopped)await sleep(200);if(state.stopped)throw new DOMException("停止","AbortError");}
  async function scan(){
    if(state.running)return;state.running=true;state.paused=false;state.stopped=false;toggleControls();setStatus("分析中");
    const controller=new AbortController();state.controller=controller;
    try{
      while(!state.stopped){
        await waitPaused();
        const url=state.cursor
          ?`${API}/v2/posts/user_timeline?from_post_id=${encodeURIComponent(state.cursor)}&number=50&user_id=${state.userId}`
          :`${API}/v2/posts/user_timeline?number=50&user_id=${state.userId}`;
        const data=await apiGet(url,controller.signal),rows=getPosts(data);state.pages++;
        if(!rows.length){state.exhausted=true;break;}
        const pageIds=rows.map(p=>Number(p?.id)).filter(Boolean),oldest=pageIds.length?String(Math.min(...pageIds)):null;
        for(const post of rows){
          const id=Number(post?.id);if(!id||state.seenPosts.has(id))continue;
          state.seenPosts.add(id);state.posts.push(post);state.checked++;addCall(post);
        }
        const previous=state.cursor;state.cursor=oldest;
        updateProgress();updateLiveStats();
        if(!state.cursor||state.cursor===previous){state.exhausted=true;break;}
      }
      if(state.stopped){setStatus("停止");$("coverageNote").textContent="分析を停止しました。ここまで取得した投稿の結果を表示しています。";}
      else if(state.exhausted){state.complete=true;setStatus("完了");$("coverageNote").textContent=`公開タイムラインを ${fmt(state.checked)} 件確認しました。通話投稿 ${fmt(state.seenCalls.size)} 件から参加ユーザーを集計しました。`;}
      finish();
    }catch(e){
      if(e.code===429){setStatus("停止");finish();}
      else if(e.code===-363){setStatus("エラー");showError(e.message);$("coverageNote").textContent=e.message;finish();}
      else if(e.name==="AbortError"){if(state.stopped){setStatus("停止");finish();}}
      else{setStatus("エラー");showError(e.message);$("coverageNote").textContent="分析を続行できませんでした。取得済みの結果は表示されています。";finish();}
    }finally{state.running=false;state.controller=null;toggleControls();renderMap();}
  }
  function finish(){setHidden("resultsSection",false);updateLiveStats();}
  async function startAnalysis(){
    clearError();const userId=parseInput($("userInput").value);
    if(!userId){showError("Yay! のプロフィールURLまたはユーザーIDを入力してください。");return;}
    $("analyzeBtn").disabled=true;
    try{
      $("analyzeBtn").querySelector("span").textContent="プロフィールを取得中…";
      const data=await apiGet(`${API}/v2/users/fresh/${encodeURIComponent(userId)}`);
      const p=data.user||data.profile||data;if(!p?.id)throw new Error("プロフィール情報を取得できませんでした。");
      state.userId=Number(p.id);updateProfile(p);reset();setHidden("scanSection",false);setHidden("resultsSection",false);updateLiveStats();
      $("coverageNote").textContent="公開タイムラインに接続中…";await scan();
    }catch(e){showError(e.message);}
    finally{$("analyzeBtn").disabled=false;$("analyzeBtn").querySelector("span").textContent="分析を開始";}
  }
  function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportJSON(){download(`yay-call-map-${state.userId}.json`,JSON.stringify({profile:{id:state.userId,nickname:state.profile?.nickname},scan:{checked:state.checked,pages:state.pages,callCount:state.seenCalls.size,complete:state.complete,exhausted:state.exhausted},participants:sortedScores()},null,2),"application/json");}
  function exportCSV(){
    const rows=[["rank","user_id","nickname","call_appearances"],...sortedScores().map((u,i)=>[i+1,u.id,u.nickname,u.points])];
    download(`yay-call-map-${state.userId}.csv`,"\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n"),"text/csv;charset=utf-8");
  }
  async function exportMapImage(){
    if(!state.profile||!state.userId){showError("先にアカウントを分析してください。");return;}
    const btn=$("imageBtn");btn.disabled=true;btn.textContent="画像を生成中…";
    try{
      const users=sortedScores().slice(0,Number($("topLimit").value||50));if(!users.length)throw new Error("画像に表示する参加者がいません。");
      const W=2400,H=2400,cx=1200,cy=1200,{points}=mapPositions(users),canvas=document.createElement("canvas");canvas.width=1200;canvas.height=1200;
      const ctx=canvas.getContext("2d");ctx.scale(.5,.5);const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#173e6c");bg.addColorStop(1,"#071a35");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      const glow=ctx.createRadialGradient(cx,cy,80,cx,cy,1100);glow.addColorStop(0,"rgba(65,190,255,.24)");glow.addColorStop(1,"rgba(5,16,44,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#fff";ctx.font="800 58px system-ui, sans-serif";ctx.fillText("通話に参加したユーザー",cx,72);
      ctx.fillStyle="#c8eaff";ctx.font="28px system-ui";ctx.fillText(`${state.profile.nickname||`Yay! ユーザー ${state.userId}`} · ${fmt(state.seenCalls.size)} 通話 · ${new Date().toLocaleDateString("ja-JP")}`,cx,125);
      [400,720,900].forEach(r=>{ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle="rgba(164,225,255,.16)";ctx.lineWidth=3;ctx.stroke();});
      points.forEach(p=>{ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle="rgba(168,226,255,.27)";ctx.lineWidth=3;ctx.stroke();});
      async function loadImage(url){if(!url)return null;for(const src of [url,`https://proxy.cors.dev/${url}`])try{const r=await fetch(src,{mode:"cors",credentials:"omit"});if(!r.ok)continue;const b=await r.blob();if(!b.type.startsWith("image/"))continue;const obj=URL.createObjectURL(b),img=new Image();img.src=obj;await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;});return {img,obj};}catch{}return null;}
      const [center,...avatars]=await Promise.all([loadImage(avatarOf(state.profile)),...points.map(p=>loadImage(p.u.avatar))]);
      function drawAvatar(item,x,y,r,name){ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();if(item){const im=item.img,s=Math.max(r*2/im.width,r*2/im.height);ctx.drawImage(im,x-im.width*s/2,y-im.height*s/2,im.width*s,im.height*s);}else{ctx.fillStyle="#367eb2";ctx.fillRect(x-r,y-r,r*2,r*2);ctx.fillStyle="#fff";ctx.font=`800 ${r}px system-ui`;ctx.fillText(initials(name),x,y);}ctx.restore();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle="#effaff";ctx.lineWidth=10;ctx.stroke();}
      drawAvatar(center,cx,cy,145,state.profile.nickname);ctx.fillStyle="#fff";ctx.font="bold 34px system-ui";ctx.fillText(state.profile.nickname||`User ${state.userId}`,cx,cy+185);ctx.fillStyle="#c8eaff";ctx.font="26px system-ui";ctx.fillText(`@${state.userId}`,cx,cy+228);
      points.forEach((p,i)=>{drawAvatar(avatars[i],p.x,p.y,58,p.u.nickname);const medal=p.rank===1?"#f5c542":p.rank===2?"#c7d0da":p.rank===3?"#c9824b":"#35baff";ctx.beginPath();ctx.arc(p.x+42,p.y-42,20,0,Math.PI*2);ctx.fillStyle=medal;ctx.fill();ctx.fillStyle="#06213a";ctx.font="800 19px system-ui";ctx.fillText(String(p.rank),p.x+42,p.y-41);ctx.fillStyle="#fff";ctx.font="bold 24px system-ui";ctx.fillText(p.u.nickname.length>14?p.u.nickname.slice(0,13)+"…":p.u.nickname,p.x,p.y+86);ctx.fillStyle="#bceaff";ctx.font="22px system-ui";ctx.fillText(`${fmt(p.u.points)} 回`,p.x,p.y+113);});
      [center,...avatars].forEach(x=>{if(x?.obj)URL.revokeObjectURL(x.obj);});
      await window.drawYayCreatorFooter(canvas);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("PNG画像を作成できませんでした。");
      await window.yaySavePng(blob,`yay-call-map-${state.userId}-top${$("topLimit").value}.png`);
    }catch(e){showError(`画像を生成できませんでした: ${e.message}`);}
    finally{btn.disabled=false;btn.textContent="画像をダウンロード";}
  }
  $("analyzeBtn").addEventListener("click",startAnalysis);
  $("userFilter").addEventListener("input",renderMap);$("topLimit").addEventListener("change",renderMap);$("showUsernames").addEventListener("change",renderMap);
  $("userInput").addEventListener("keydown",e=>{if(e.key==="Enter")startAnalysis();});
  $("pauseBtn").addEventListener("click",()=>{state.paused=true;setStatus("一時停止");toggleControls();});
  $("resumeBtn").addEventListener("click",()=>{if(state.running){state.paused=false;toggleControls();}else scan();});
  $("stopBtn").addEventListener("click",()=>{state.stopped=true;state.paused=false;state.controller?.abort();});
  $("imageBtn").addEventListener("click",exportMapImage);$("jsonBtn").addEventListener("click",exportJSON);$("csvBtn").addEventListener("click",exportCSV);
  $("closeDetail").addEventListener("click",()=>setHidden("detailPanel",true));
})();