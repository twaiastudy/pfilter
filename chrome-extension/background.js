importScripts('db.js', 'pii.js');

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const str = (v, max = 5000000) => (typeof v === 'string' ? v.slice(0, max) : '');
const ONBOARDING_URL = chrome.runtime.getURL('onboarding.html');
const DEBUG_PREFIX = '[Prompt Filter]';

function log(...args) {
  console.info(DEBUG_PREFIX, ...args);
}

async function injectMainWorld(tabId) {
  try {
    log('inject request', { tabId });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['inject.js'],
      world: 'MAIN'
    });
    log('inject ok', { tabId });
  } catch (e) {
    console.error(DEBUG_PREFIX, 'inject failed', e);
  }
}

async function openOnboarding() {
  await chrome.tabs.create({ url: ONBOARDING_URL });
}

async function updateBadge() {
  const n = await PVDB.count();
  chrome.action.setBadgeText({ text: n > 999 ? '999+' : String(n || '') });
  chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
}

async function syncRecordToCloudflare(rec) {
  const { cloudSyncEnabled = false, cloudSyncEndpoint = '', cloudSyncToken = '' } = await chrome.storage.local.get([
    'cloudSyncEnabled',
    'cloudSyncEndpoint',
    'cloudSyncToken'
  ]);
  if (!cloudSyncEnabled || !cloudSyncEndpoint || !cloudSyncToken) return;

  let endpoint;
  try {
    endpoint = `${new URL(cloudSyncEndpoint).origin}/api/ingest`;
  } catch (_) {
    return;
  }

  // 含個資的紀錄:上傳遮蔽版本,並丟棄可能含編碼原文的 raw
  const payload = rec.sensitive
    ? {
        ...rec,
        text: PVPII.maskTwIds(rec.text || ''),
        name: PVPII.maskTwIds(rec.name || ''),
        attachments: JSON.parse(PVPII.maskTwIds(JSON.stringify(rec.attachments || []))),
        raw: ''
      }
    : rec;

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cloudSyncToken}`
    },
    body: JSON.stringify(payload)
  }).then((res) => {
    log('sync response', { ok: res.ok, status: res.status, site: rec.site, kind: rec.kind, endpoint: rec.endpoint });
  }).catch((e) => {
    console.error(DEBUG_PREFIX, 'sync failed', { site: rec.site, kind: rec.kind, endpoint: rec.endpoint, error: String(e) });
  });
}

// 只有在同意頁按下同意(會寫入 onboardedAt)才算數
async function hasConsent() {
  const { consentAccepted = false, onboardedAt } = await chrome.storage.local.get(['consentAccepted', 'onboardedAt']);
  if (consentAccepted && onboardedAt) return true;
  if (consentAccepted) await chrome.storage.local.set({ consentAccepted: false, enabled: false });
  return false;
}

function detectSensitive(rec) {
  const twId = PVPII.findTwIds(rec.text || '').length
    + PVPII.findTwIds(rec.name || '').length
    + PVPII.findTwIds(JSON.stringify(rec.attachments || [])).length;
  return twId ? { twId } : null;
}

function alertTab(tabId, sensitive) {
  chrome.tabs.sendMessage(tabId, { type: 'pv-alert', sensitive }, { frameId: 0 }).catch(() => {});
}

async function handleRecord(raw, tabId) {
  const { enabled = false, consentAccepted = false, displayName = '', cloudSyncUserId = '' } = await chrome.storage.local.get(['enabled', 'consentAccepted', 'displayName', 'cloudSyncUserId']);
  if (!enabled || !consentAccepted || !raw) {
    log('drop record', { enabled, consentAccepted, hasRaw: Boolean(raw), site: raw && raw.site, kind: raw && raw.kind });
    return;
  }
  const effectiveDisplayName = str(displayName || cloudSyncUserId, 200);

  const rec = {
    id: crypto.randomUUID(),
    ts: Number(raw.ts) || Date.now(),
    kind: raw.kind,
    site: ['chatgpt', 'claude', 'gemini', 'notebook'].includes(raw.site) ? raw.site : 'chatgpt',
    displayName: effectiveDisplayName,
    pageUrl: str(raw.pageUrl, 2000),
    endpoint: str(raw.endpoint, 500)
  };

  if (raw.kind === 'prompt') {
    rec.model = str(raw.model, 200);
    rec.text = str(raw.text);
    rec.attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
    rec.raw = str(raw.raw, 2000000);
  } else if (raw.kind === 'file') {
    rec.name = str(raw.name, 500) || 'unnamed';
    rec.type = str(raw.type, 200);
    rec.size = Number(raw.size) || 0;
    if (raw.skipped) {
      rec.skipped = true;
    } else if (typeof raw.dataUrl === 'string') {
      const blob = await (await fetch(raw.dataUrl)).blob();
      const hash = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
      await PVDB.putBlob({ hash, blob, type: rec.type, size: rec.size });
      rec.hash = hash;
    }
  } else return;

  const sensitive = detectSensitive(rec);
  if (sensitive) {
    rec.sensitive = sensitive;
    if (typeof tabId === 'number') alertTab(tabId, sensitive);
  }

  log('record received', {
    site: rec.site,
    kind: rec.kind,
    endpoint: rec.endpoint,
    textLen: rec.text ? rec.text.length : 0,
    name: rec.name || '',
    size: rec.size || 0,
    pageUrl: rec.pageUrl
  });
  await PVDB.putRecord(rec);
  syncRecordToCloudflare(rec).catch(() => {});
  updateBadge();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'pv-inject-main-world' && sender.tab && typeof sender.tab.id === 'number') {
    log('inject trigger message', { tabId: sender.tab.id, frameId: sender.frameId, url: sender.url });
    injectMainWorld(sender.tab.id).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg && msg.type === 'pv-record' && sender.tab) {
    log('pv-record message', { tabId: sender.tab.id, frameId: sender.frameId, url: sender.url, site: msg.record && msg.record.site, kind: msg.record && msg.record.kind });
    handleRecord(msg.record, sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});

chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  log('onInstalled', { reason });
  await updateBadge();
  if ((reason === 'install' || reason === 'update') && !(await hasConsent())) await openOnboarding();
});