/* Shared Yay! API transport, fallback and cache layer.
 * Provider failover is for transport/CORS outages only. An upstream 429 is global
 * and is never retried through another relay.
 */
(() => {
  "use strict";
  if (window.YayAPI) return;
  const STORAGE_KEY = "yay_api_cache_v1";
  const CACHE_LIMIT = 180;
  const DEFAULT_TTL = 90_000;
  const COOLDOWN_KEY = "yay_api_rate_limit_v1";
  const RETRY_WAIT_KEY = "yay_api_retry_wait_seconds_v2";
  const providers = [
    { id: "cors-dev", label: "CORS.dev", build: target => `https://proxy.cors.dev/${target}` },
    { id: "corsproxy-io", label: "CORSProxy.io", build: target => `https://corsproxy.io/?url=${encodeURIComponent(target)}` },
    { id: "allorigins", label: "AllOrigins", build: target => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` }
  ];
  const memory = new Map(), inflight = new Map(), health = new Map();
  let globalCooldownUntil = 0, activeIndex = 0, rateLimitCount = 0, retryWaitSeconds = 5, noticeTimer = null;
  try {
    const saved = JSON.parse(localStorage.getItem(COOLDOWN_KEY) || "null");
    if (saved && Number(saved.until) > Date.now()) globalCooldownUntil = Number(saved.until);
    const savedWait = Number(localStorage.getItem(RETRY_WAIT_KEY));
    retryWaitSeconds = Number.isFinite(savedWait) ? Math.max(5, savedWait) : 5;
  } catch {}
  function showRateLimitNotice(source) {
    let box = document.getElementById("yay-api-rate-limit-notice");
    if (!box) {
      box = document.createElement("div"); box.id = "yay-api-rate-limit-notice";
      box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
      Object.assign(box.style, { position:"fixed", zIndex:"99999", left:"12px", right:"12px", bottom:"12px", maxWidth:"720px", margin:"0 auto", padding:"14px 16px", borderRadius:"12px", background:"#202536", color:"#fff", boxShadow:"0 6px 28px #0006", fontSize:"14px", lineHeight:"1.6", border:"1px solid #66708a" });
      document.body.appendChild(box);
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((globalCooldownUntil - now()) / 1000));
      if (!left) { box.textContent = "待機が終わりました。データ取得を自動で再開しています。"; clearInterval(noticeTimer); noticeTimer = setTimeout(()=>box.remove(), 7000); return; }
      const mins = Math.floor(left / 60), secs = left % 60;
      const timer = mins ? `${mins}分${secs}秒` : `${secs}秒`;
      box.innerHTML = `<strong>Yay! のアクセス制限を検出しました。</strong><br>アクセスを止めて、すべての機能で共通の待機をしています。<br><strong>自動再開まで：${timer}</strong><br><small>次回の待機基準：${retryWaitSeconds}秒。正常に取得できると1秒短くなり、再び制限されると5秒長くなります。${source === "header" ? " Yay! が指定した待機時間が長い場合は、その時間を優先します。" : ""} ページを開き直しても設定は維持されます。</small>`;
    };
    tick(); clearInterval(noticeTimer); noticeTimer = setInterval(tick, 1000);
  }
  function setGlobalCooldown(ms, source) {
    globalCooldownUntil = Math.max(globalCooldownUntil, now() + ms);
    try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify({ until: globalCooldownUntil })); } catch {}
    showRateLimitNotice(source);
  }
  function clearExpiredCooldown() {
    if (globalCooldownUntil && globalCooldownUntil <= now()) {
      globalCooldownUntil = 0;
      try { localStorage.removeItem(COOLDOWN_KEY); } catch {}
    }
  }
  const now = () => Date.now();
  function targetOf(input) {
    const u = new URL(input, location.href);
    if (u.hostname === "proxy.cors.dev") return u.href.slice("https://proxy.cors.dev/".length);
    if (u.hostname === "corsproxy.io") return u.searchParams.get("url") || input;
    if (u.hostname === "api.allorigins.win") return u.searchParams.get("url") || input;
    return u.href;
  }
  function cacheTTL(url) {
    if (/\/posts\/user_timeline|\/timeline/i.test(url)) return 45_000;
    if (/\/likers/i.test(url)) return 30_000;
    if (/\/users\//i.test(url)) return 5 * 60_000;
    return DEFAULT_TTL;
  }
  function readCache(key) {
    const item = memory.get(key);
    if (item && item.expires > now()) return item.body;
    if (item) memory.delete(key);
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const saved = all[key];
      if (saved && saved.expires > now() && typeof saved.body === "string") {
        memory.set(key, saved); return saved.body;
      }
    } catch {}
    return null;
  }
  function writeCache(key, body, ttl) {
    const item = { body, expires: now() + ttl };
    memory.set(key, item);
    while (memory.size > CACHE_LIMIT) memory.delete(memory.keys().next().value);
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      all[key] = item;
      for (const [k,v] of Object.entries(all)) if (!v || v.expires <= now()) delete all[k];
      const keys = Object.keys(all); while (keys.length > CACHE_LIMIT) delete all[keys.shift()];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {}
  }
  function retryAfterMs(response) {
    // Retry-After is either seconds or an HTTP date. It may be hidden by CORS.
    const h = response.headers.get("Retry-After");
    if (!h) return null;
    const seconds = Number(h);
    if (Number.isFinite(seconds) && h.trim() !== "") return Math.max(1000, seconds * 1000);
    const date = Date.parse(h);
    return Number.isFinite(date) ? Math.max(1000, date - now()) : null;
  }
  function persistRetryWait() {
    try { localStorage.setItem(RETRY_WAIT_KEY, String(retryWaitSeconds)); } catch {}
  }
  function registerRateLimit(response) {
    rateLimitCount += 1;
    const adaptiveWait = retryWaitSeconds;
    retryWaitSeconds = Math.min(Number.MAX_SAFE_INTEGER, retryWaitSeconds + 5);
    persistRetryWait();
    const serverWait = response ? retryAfterMs(response) : null;
    // Never retry earlier than Yay!'s explicit Retry-After instruction.
    return { waitMs: Math.max(adaptiveWait * 1000, serverWait || 0), source: serverWait ? "header" : "adaptive" };
  }
  function registerSuccess() {
    retryWaitSeconds = Math.max(5, retryWaitSeconds - 1);
    persistRetryWait();
  }
  function markRateLimit(res, body) {
    let data = null; try { data = JSON.parse(body); } catch {}
    const msg = String(data?.message || data?.error || "");
    return res.status === 429 || Number(data?.error_code) === 429 || /rate.?limit|too many requests|アクセス制限/i.test(msg);
  }
  async function request(input, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const target = targetOf(input);
    if (method !== "GET") return fetch(providers[activeIndex].build(target), options);
    const key = `${method}:${target}`;
    const cached = readCache(key);
    if (cached !== null) return new Response(cached, { status: 200, headers: { "Content-Type": "application/json", "X-Yay-Cache": "HIT" } });
    if (inflight.has(key)) {
      try {
        const saved = await inflight.get(key);
        return new Response(saved.body, { status: saved.status, statusText: saved.statusText, headers: { ...saved.headers, "X-Yay-Cache": "DEDUPED" } });
      } catch (error) {
        // Concurrent callers must resume too; they must not surface the same 429.
        if (error.code === 429) {
          while (globalCooldownUntil > now()) {
            if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            await new Promise(resolve => setTimeout(resolve, Math.max(250, globalCooldownUntil - now() + 150)));
            clearExpiredCooldown();
          }
          return request(input, options);
        }
        throw error;
      }
    }
    const task = (async () => {
      clearExpiredCooldown();
      // If another request already triggered a global cooldown, wait here instead
      // of failing the feature. The request resumes automatically when it expires.
      while (globalCooldownUntil > now()) {
        showRateLimitNotice("stored");
        await new Promise(resolve => setTimeout(resolve, Math.max(250, globalCooldownUntil - now() + 150)));
        clearExpiredCooldown();
      }
      const errors = [];
      const start = activeIndex;
      for (let offset = 0; offset < providers.length; offset++) {
        const index = (start + offset) % providers.length, provider = providers[index];
        try {
          const response = await fetch(provider.build(target), { ...options, method, mode: "cors", credentials: "omit" });
          const body = await response.text();
          if (markRateLimit(response, body)) {
            const wait = registerRateLimit(response);
            setGlobalCooldown(wait.waitMs, wait.source);
            const err = new Error("Yay! のアクセス制限中です。待機後に自動で再開します。"); err.code = 429; throw err;
          }
          if (response.status >= 500 || response.status === 0) throw new Error(`${provider.label}: HTTP ${response.status}`);
          if (!response.ok) {
            // A real API 4xx is not a relay outage; preserve it rather than rotating.
            return { body, status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()) };
          }
          let parsed; try { parsed = JSON.parse(body); } catch { throw new Error(`${provider.label}: JSON以外の応答`); }
          if (Number(parsed?.error_code) === 429) { const wait = registerRateLimit(response); setGlobalCooldown(wait.waitMs, wait.source); const err = new Error("Yay! のアクセス制限中です。待機後に自動で再開します。"); err.code=429; throw err; }
          activeIndex = index; health.set(provider.id, { ok: true, at: now(), ms: 0 });
          registerSuccess();
          writeCache(key, body, cacheTTL(target));
          return { body, status: 200, statusText: "OK", headers: { "Content-Type": "application/json", "X-Yay-Provider": provider.id } };
        } catch (error) {
          if (error.code === 429 || options.signal?.aborted) throw error;
          health.set(provider.id, { ok: false, at: now(), error: String(error.message || error) });
          errors.push(`${provider.label}: ${error.message || error}`);
        }
      }
      throw new Error(`すべての通信プロバイダーに接続できませんでした。 ${errors.join(" / ")}`);
    })();
    inflight.set(key, task);
    try {
      const saved = await task;
      return new Response(saved.body, { status: saved.status, statusText: saved.statusText, headers: { ...saved.headers, "X-Yay-Cache": "MISS" } });
    } catch (error) {
      // A 429 is a temporary pause, not a terminal failure. Wait for the shared
      // cooldown and retry the same request. Other errors still reach the caller.
      inflight.delete(key);
      if (error.code === 429) {
        const wait = Math.max(0, globalCooldownUntil - now());
        if (wait > 0) {
          await new Promise((resolve, reject) => {
            if (options.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
            const timer = setTimeout(resolve, wait + 250);
            options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
          });
          clearExpiredCooldown();
          return request(input, options);
        }
      }
      throw error;
    } finally { inflight.delete(key); }
  }
  window.YayAPI = {
    fetch: request,
    clearCache() { memory.clear(); try { localStorage.removeItem(STORAGE_KEY); } catch {} },
    status() { clearExpiredCooldown(); return { activeProvider: providers[activeIndex].id, providers: providers.map(p => ({ id:p.id, label:p.label, ...(health.get(p.id)||{state:"unknown"}) })), cacheEntries: memory.size, cooldownUntil: globalCooldownUntil, rateLimitCount, retryWaitSeconds }; }
  };
})();
