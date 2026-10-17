const $ = (sel) => document.querySelector(sel);
const DEFAULT_SYNC_ORIGIN = 'https://pfilter.pages.dev';

async function loadState() {
  const { consentAccepted = false, cloudSyncUserId = '' } = await chrome.storage.local.get([
    'consentAccepted', 'cloudSyncUserId'
  ]);
  $('#cloudSyncUserId').value = cloudSyncUserId || '';
  $('#cloudSyncShowPassword').checked = false;
  $('#cloudSyncPassword').type = 'password';
  if (consentAccepted) {
    $('#status').textContent = '你已完成設定，可以直接回到 extension 使用。';
  }
}

async function loginCloudflare() {
  const userId = $('#cloudSyncUserId').value.trim();
  const password = $('#cloudSyncPassword').value;
  const status = $('#cloudSyncStatus');

  if (!userId || !password) {
    status.textContent = '請輸入使用者 ID 與密碼。';
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
  $('#cloudSyncPassword').value = '';
  status.textContent = '已登入並啟用上傳。';
}

async function startAll() {
  await chrome.storage.local.set({
    consentAccepted: true,
    enabled: true,
    onboardedAt: Date.now()
  });
  if ($('#cloudSyncUserId').value.trim() && $('#cloudSyncPassword').value) {
    await loginCloudflare();
    return;
  }
  $('#status').textContent = '已同意，現在可以開始使用。';
}

$('#start').onclick = startAll;
$('#cloudSyncShowPassword').onchange = () => {
  const input = $('#cloudSyncPassword');
  input.type = $('#cloudSyncShowPassword').checked ? 'text' : 'password';
};
loadState();