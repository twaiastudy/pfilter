// 隔離環境:把頁面送來的訊息轉交給 background service worker
(() => {
  if (window.__pvRelayRequested) return;
  window.__pvRelayRequested = true;
  console.info('[Prompt Filter][relay]', 'loaded', { href: location.href, top: window.top === window });
  console.info('[Prompt Filter][relay]', 'request inject');
  chrome.runtime.sendMessage({ type: 'pv-inject-main-world' }).catch(() => {});
})();

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.__pv !== true) return;
  try {
    console.info('[Prompt Filter][relay]', 'relay record', { site: e.data.msg && e.data.msg.site, kind: e.data.msg && e.data.msg.kind, endpoint: e.data.msg && e.data.msg.endpoint });
    chrome.runtime.sendMessage({ type: 'pv-record', record: e.data.msg }).catch(() => {});
  } catch (_) {}
});