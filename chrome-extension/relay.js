// 隔離環境:把頁面送來的訊息轉交給 background service worker
(() => {
  if (window.__pvRelayRequested) return;
  window.__pvRelayRequested = true;
  console.info('[Prompt Filter][relay]', 'loaded', { href: location.href, top: window.top === window });
  console.info('[Prompt Filter][relay]', 'request inject');
  chrome.runtime.sendMessage({ type: 'pv-inject-main-world' }).catch(() => {});
})();

// 偵測到個資時,在頁面右下角顯示提醒(以 Shadow DOM 隔離網站樣式)
function showPiiAlert(sensitive) {
  if (window.top !== window || !document.body) return;
  const old = document.getElementById('pv-pii-alert');
  if (old) old.remove();
  const host = document.createElement('div');
  host.id = 'pv-pii-alert';
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .box { max-width: 360px; background: #fff7ed; color: #7c2d12; border: 1px solid #fb923c; border-radius: 12px;
      padding: 12px 36px 12px 14px; font: 14px/1.5 system-ui, "Noto Sans TC", sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.18); position: relative; }
    strong { display: block; margin-bottom: 4px; }
    button { position: absolute; top: 6px; right: 8px; border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }`;
  const box = document.createElement('div');
  box.className = 'box';
  const title = document.createElement('strong');
  title.textContent = 'Prompt Filter 個資提醒';
  const msg = document.createElement('div');
  msg.textContent = `剛送出的內容含有 ${Number(sensitive && sensitive.twId) || 0} 筆身分證字號。請避免將個人資料提供給 AI 服務。`;
  const close = document.createElement('button');
  close.textContent = '×';
  close.setAttribute('aria-label', '關閉');
  close.onclick = () => host.remove();
  box.append(title, msg, close);
  root.append(style, box);
  document.body.append(host);
  setTimeout(() => host.remove(), 10000);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'pv-alert') showPiiAlert(msg.sensitive);
});

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.__pv !== true) return;
  try {
    console.info('[Prompt Filter][relay]', 'relay record', { site: e.data.msg && e.data.msg.site, kind: e.data.msg && e.data.msg.kind, endpoint: e.data.msg && e.data.msg.endpoint });
    chrome.runtime.sendMessage({ type: 'pv-record', record: e.data.msg }).catch(() => {});
  } catch (_) {}
});