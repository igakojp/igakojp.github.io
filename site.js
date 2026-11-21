/* White-out helper for the Yay! logo. Canvas ctx.filter is unsupported on Safari, so tint via an offscreen canvas. */
window.yayWhiteImage = function(img, w, h) {
  const k = 2, c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  return c;
};


/* Shared PNG footer: creator at bottom-left, Yay! logo centered. */
window.drawYayCreatorFooter = async function(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height, scale = W / 1200;
  const creatorId = "11044343";
  const load = async (url) => {
    if (!url) return null;
    for (const candidate of [url, `https://proxy.cors.dev/${url}`]) {
      try {
        const response = await fetch(candidate, {mode:"cors", credentials:"omit"});
        if (!response.ok) continue;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) continue;
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image(); img.src = objectUrl;
        await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
        return {img, objectUrl};
      } catch {}
    }
    return null;
  };
  let creator = window.__yayCreator || null;
  if (!creator) {
    try {
      const response = await window.YayAPI.fetch(`https://proxy.cors.dev/https://api.yay.space/v2/users/${creatorId}`, {headers:{Accept:"application/json"}});
      if (response.ok) {
        const data = await response.json(), user = data.user || data.profile;
        if (data.result === "success" && String(user?.id) === creatorId) {
          const avatar = user.profile_icon || user.profile_icon_thumbnail || user.profile_icon_url || "";
          creator = {id:creatorId,nickname:user.nickname,avatar:typeof avatar === "string" ? (avatar.startsWith("//") ? `https:${avatar}` : avatar.startsWith("/") ? `https://yay.space${avatar}` : avatar) : ""};
        }
      }
    } catch {}
  }
  const [creatorAsset, logoAsset] = await Promise.all([
    load(creator?.avatar || ""),
    load("https://yay.space/images/logotype.svg")
  ]);
  const y = H - 42 * scale;
  ctx.save();
  if (creator?.nickname) {
    const x = 22 * scale, cardW = 280 * scale, cardH = 56 * scale;
    ctx.fillStyle = "rgba(4,18,38,.82)";
    ctx.beginPath(); ctx.roundRect(x, y-cardH/2, cardW, cardH, 14*scale); ctx.fill();
    const r = 19*scale, ax=x+29*scale, ay=y;
    ctx.save();ctx.beginPath();ctx.arc(ax,ay,r,0,Math.PI*2);ctx.clip();
    if (creatorAsset) {
      const im=creatorAsset.img, factor=Math.max(2*r/im.width,2*r/im.height);
      ctx.drawImage(im,ax-im.width*factor/2,ay-im.height*factor/2,im.width*factor,im.height*factor);
    } else {
      ctx.fillStyle="#426c9b";ctx.fillRect(ax-r,ay-r,2*r,2*r);
      ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`bold ${18*scale}px sans-serif`;ctx.fillText(String(creator.nickname).slice(0,1),ax,ay);
    }
    ctx.restore();
    ctx.textAlign="left";ctx.textBaseline="middle";
    ctx.fillStyle="#a9c7e4";ctx.font=`${10*scale}px system-ui, 'Noto Sans JP',sans-serif`;
    ctx.fillText("このプロジェクトの制作者",x+58*scale,y-9*scale);
    ctx.fillStyle="#fff";ctx.font=`bold ${15*scale}px system-ui, 'Noto Sans JP',sans-serif`;
    ctx.fillText(String(creator.nickname).slice(0,22),x+58*scale,y+11*scale);
  }
  if (logoAsset?.img) {
    const im=logoAsset.img, maxW=125*scale, maxH=32*scale;
    const ratio=Math.min(maxW/im.width,maxH/im.height), w=im.width*ratio,h=im.height*ratio;
    ctx.globalAlpha=.96;
    ctx.drawImage(window.yayWhiteImage(im,w,h),(W-w)/2,y-h/2,w,h);
  }
  ctx.restore();
  [creatorAsset,logoAsset].forEach(asset=>{if(asset?.objectUrl)URL.revokeObjectURL(asset.objectUrl);});
};

/* Canvas roundRect polyfill for older Safari */
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    let rr = Array.isArray(r) ? r[0] : r; rr = Math.max(0, Math.min(rr || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + rr, y); this.arcTo(x + w, y, x + w, y + h, rr); this.arcTo(x + w, y + h, x, y + h, rr); this.arcTo(x, y + h, x, y, rr); this.arcTo(x, y, x + w, y, rr); this.closePath();
  };
}
(() => {
  "use strict";
  const CREATOR_ID = "11044343";
  const API_URL = `https://proxy.cors.dev/https://api.yay.space/v2/users/${CREATOR_ID}`;
  const slot = document.getElementById("creatorCredit");
  if (!slot) return;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function avatarOf(user) {
    const value = user?.profile_icon || user?.profile_icon_thumbnail || "";
    if (typeof value !== "string") return "";
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("/")) return `https://yay.space${value}`;
    return value;
  }
  async function loadCreator() {
    let networkRetries = 0;
    while (true) {
      try {
        const response = await window.YayAPI.fetch(API_URL, { method: "GET", headers: { Accept: "application/json" } });
        if (response.status === 429) {
          slot.textContent = "APIアクセス制限を検出したため、制作者情報の取得を停止しました。これ以上取得できません。時間をおいて再実行してください。";
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Number(data?.error_code) === 429 || (data?.result !== "success" && /429|rate.?limit|too many requests|アクセス制限/i.test(String(data?.message || "")))) {
          slot.textContent = "APIアクセス制限を検出したため、制作者情報の取得を停止しました。これ以上取得できません。時間をおいて再実行してください。";
          return;
        }
        const user = data?.user;
        if (data?.result !== "success" || String(user?.id) !== CREATOR_ID || !user?.nickname) throw new Error("制作者プロフィールを取得できませんでした。");
        const avatar = avatarOf(user);
        window.__yayCreator = { id: CREATOR_ID, nickname: user.nickname, avatar, url: `https://yay.space/user/${CREATOR_ID}` };
        slot.innerHTML = `<span class="creator-label">このプロジェクトの制作者</span><a class="creator-profile" href="https://yay.space/user/${CREATOR_ID}" target="_blank" rel="noopener">${avatar ? `<img src="${esc(avatar)}" alt="">` : ""}<span>${esc(user.nickname)}</span><small>Yay! ID ${CREATOR_ID}</small></a>`;
        return;
      } catch (error) {
        if (networkRetries++ < 2) {
          await new Promise(resolve => setTimeout(resolve, Math.min(15000, 1000 * 2 ** networkRetries)));
          continue;
        }
        slot.textContent = "制作者プロフィールを読み込めませんでした。";
        console.warn("Creator profile could not be loaded:", error);
        return;
      }
    }
  }

  const footer = slot.closest("footer");
  if (footer && !footer.querySelector(".footer-yay-logo")) {
    const logo = document.createElement("img");
    logo.className = "footer-yay-logo";
    logo.src = "https://yay.space/images/logotype.svg";
    logo.alt = "Yay!";
    footer.appendChild(logo);
  }
  loadCreator();
})();

/* Save a PNG: on phones/tablets open the share sheet (so it can go to Photos), otherwise download it. */
window.yaySavePng = async function(blob, name) {
  try {
    const file = new File([blob], name, { type: "image/png" });
    if (matchMedia("(pointer:coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] }); return;
    }
  } catch (e) { if (e && e.name === "AbortError") return; /* cancelled by the user; any other error falls back to a download */ }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/* Top navigation: keep the current tab in view and show a fade where more tabs are hidden. */
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".section-nav"); if (!nav) return;
  const cur = nav.querySelector(".active"), upd = () => {
    nav.classList.toggle("fade-l", nav.scrollLeft > 4);
    nav.classList.toggle("fade-r", nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
  };
  if (cur) nav.scrollLeft = Math.max(0, cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2);
  nav.addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); upd();
});
