(async () => {
  const DEFAULT_SYNC_ORIGIN = 'https://pfilter.pages.dev';
  const { enabled = false, consentAccepted = false, cloudSyncToken = '', cloudSyncUserId = '' } = await chrome.storage.local.get([
    'enabled', 'consentAccepted', 'cloudSyncToken', 'cloudSyncUserId'
  ]);
  const cb = document.getElementById('enabled');
  cb.checked = enabled;
  cb.disabled = !consentAccepted;
  cb.onchange = () => chrome.storage.local.set({ enabled: cb.checked });
  document.getElementById('count').textContent = await PVDB.count();
  document.getElementById('open').onclick = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  document.getElementById('setup').onclick = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  document.getElementById('cloudSyncUserId').value = cloudSyncUserId;
  document.getElementById('cloudSyncPassword').value = '';
  document.getElementById('cloudSyncShowPassword').checked = false;
  document.getElementById('cloudSyncShowPassword').onchange = () => {
    const input = document.getElementById('cloudSyncPassword');
    input.type = document.getElementById('cloudSyncShowPassword').checked ? 'text' : 'password';
  };
  document.getElementById('loginCloudflare').onclick = async () => {
    const userId = document.getElementById('cloudSyncUserId').value.trim();
    const password = document.getElementById('cloudSyncPassword').value;
    const status = document.getElementById('cloudSyncStatus');
    if (!userId || !password) {
      status.textContent = '請輸入使用者 ID 和密碼。';
      return;
    }
    const origin = DEFAULT_SYNC_ORIGIN;
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      status.textContent = '尚未授權管理者指定 server。';
      return;
    }
    const res = await fetch(`${origin}/api/extension-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      status.textContent = data.error === 'invalid_credentials' ? 'ID 或密碼錯誤。' : `登入失敗：${data.error || res.status}`;
      return;
    }
    await chrome.storage.local.set({
      cloudSyncEnabled: true,
      cloudSyncEndpoint: origin,
      cloudSyncToken: data.token,
      cloudSyncUserId: data.userId || userId,
      displayName: data.userId || userId
    });
    document.getElementById('cloudSyncPassword').value = '';
    status.textContent = '已登入並啟用上傳。';
  };
  document.getElementById('logoutCloudflare').onclick = async () => {
    await chrome.storage.local.set({ cloudSyncEnabled: false, cloudSyncToken: '', cloudSyncUserId: '' });
    document.getElementById('cloudSyncPassword').value = '';
    document.getElementById('cloudSyncUserId').value = '';
    document.getElementById('cloudSyncStatus').textContent = '已清除登入資訊。';
  };
  document.getElementById('status').textContent = consentAccepted
    ? '已同意，記錄功能已可使用。'
    : '尚未同意，記錄功能尚未啟用。';
  document.getElementById('consentBanner').hidden = consentAccepted;
})();