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
        const response = await fetch(API_URL, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } });
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
