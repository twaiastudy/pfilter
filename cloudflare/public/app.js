const $ = (s) => document.querySelector(s);
const state = { items: [], users: [] };

function fmtTime(ts) {
  return new Date(ts).toLocaleString('zh-TW', { hour12: false });
}

function siteLabel(site) {
  if (site === 'claude') return 'Claude';
  if (site === 'gemini') return 'Gemini';
  if (site === 'notebook') return 'Notebook';
  return 'ChatGPT';
}

function span(text, className = '') {
  return Object.assign(document.createElement('span'), { className, textContent: String(text) });
}

function fmtDate(ts) {
  return ts ? new Date(ts).toLocaleString('zh-TW', { hour12: false }) : '未設定';
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(text || res.statusText);
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText);
  return data;
}

function render() {
  const list = $('#list');
  const meta = $('#meta');
  list.replaceChildren();

  meta.textContent = `${state.items.length} 筆紀錄`;
  if (!state.items.length) {
    list.append(Object.assign(document.createElement('div'), { className: 'empty', textContent: '沒有符合條件的資料。' }));
    return;
  }

  for (const item of state.items) {
    const card = document.createElement('article');
    card.className = 'card';

    const head = document.createElement('div');
    head.className = 'card-head';
    head.append(span(siteLabel(item.site), `badge ${item.site}`));
    if (item.kind === 'file') head.append(span('檔案', 'badge file'));
    if (item.sensitive && item.sensitive.twId) head.append(span(`身分證 ×${item.sensitive.twId}`, 'badge pii'));
    head.append(span(fmtTime(item.ts)), span(item.displayName || '(未命名)'));
    if (item.model) head.append(span(item.model));
    head.append(span('', 'spacer'), span(item.id));
    card.append(head);

    if (item.kind === 'prompt') {
      const body = document.createElement('div');
      body.className = 'body';
      body.textContent = item.text || '(無文字)';
      card.append(body);
      if (item.attachments && item.attachments.length) {
        const details = document.createElement('details');
        details.innerHTML = `<summary>附件資訊 (${item.attachments.length})</summary>`;
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(item.attachments, null, 2);
        details.append(pre);
        card.append(details);
      }
      if (item.raw) {
        const details = document.createElement('details');
        details.innerHTML = '<summary>原始資料</summary>';
        const pre = document.createElement('pre');
        pre.textContent = item.raw;
        details.append(pre);
        card.append(details);
      }
    } else {
      const body = document.createElement('div');
      body.className = 'body';
      body.textContent = `${item.name || 'unnamed'} · ${item.type || '未知類型'} · ${item.size || 0} bytes${item.skipped ? ' · 已略過內容' : ''}`;
      card.append(body);
      if (item.hash) {
        const details = document.createElement('details');
        details.innerHTML = '<summary>檔案雜湊</summary>';
        const pre = document.createElement('pre');
        pre.textContent = item.hash;
        details.append(pre);
        card.append(details);
      }
    }

    if (item.pageUrl) {
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.append('來源頁面：');
      const isHttp = /^https?:\/\//i.test(item.pageUrl);
      const link = document.createElement(isHttp ? 'a' : 'span');
      if (isHttp) Object.assign(link, { href: item.pageUrl, target: '_blank', rel: 'noreferrer noopener' });
      link.textContent = item.pageUrl;
      sub.append(link);
      card.append(sub);
    }

    list.append(card);
  }
}

function renderUsers() {
  const list = $('#userList');
  const meta = $('#userMeta');
  list.replaceChildren();
  meta.textContent = `${state.users.length} 位使用者`;

  if (!state.users.length) {
    list.append(Object.assign(document.createElement('div'), { className: 'empty', textContent: '目前沒有使用者。' }));
    return;
  }

  for (const user of state.users) {
    const card = document.createElement('div');
    card.className = 'user-card';

    const row = document.createElement('div');
    row.className = 'user-row';
    row.append(
      Object.assign(document.createElement('strong'), { textContent: user.id }),
      span(user.active ? '啟用' : '停用', 'badge soft'),
      span(`token v${Number(user.token_version) || 0}`, 'badge soft'),
      span(`建立 ${fmtDate(user.created_at)}`, 'badge soft'),
      span(`更新 ${fmtDate(user.updated_at)}`, 'badge soft'),
      span(`登入 ${fmtDate(user.last_login_at)}`, 'badge soft')
    );
    card.append(row);

    const actions = document.createElement('div');
    actions.className = 'user-row';

    const toggle = document.createElement('button');
    toggle.className = 'ghost';
    toggle.textContent = user.active ? '停用' : '啟用';
    toggle.onclick = async () => {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ action: 'toggle', id: user.id }) });
      await loadUsers();
    };

    const del = document.createElement('button');
    del.className = 'ghost';
    del.textContent = '刪除';
    del.onclick = async () => {
      if (!confirm(`確定刪除 ${user.id}？`)) return;
      await api('/api/users', { method: 'POST', body: JSON.stringify({ action: 'delete', id: user.id }) });
      await loadUsers();
    };

    actions.append(toggle, del);
    card.append(actions);
    list.append(card);
  }
}

async function load() {
  try {
    const q = $('#q').value.trim();
    const site = $('#site').value;
    const kind = $('#kind').value;
    const params = new URLSearchParams({ limit: '200' });
    if (q) params.set('q', q);
    if (site) params.set('site', site);
    if (kind) params.set('kind', kind);
    const data = await api(`/api/records?${params.toString()}`);
    state.items = data.items || [];
    $('#meta').textContent = `${data.total || 0} 筆紀錄，顯示 ${state.items.length} 筆`;
    render();
  } catch (err) {
    if (String(err.message || err).includes('401') || String(err.message || err).includes('unauthorized')) {
      location.href = '/admin/';
      return;
    }
    $('#meta').textContent = String(err.message || err);
    state.items = [];
    render();
  }
}

async function loadUsers() {
  try {
    const data = await api('/api/users');
    state.users = data.items || [];
    renderUsers();
  } catch (err) {
    $('#userMeta').textContent = String(err.message || err);
    state.users = [];
    renderUsers();
  }
}

$('#logout').onclick = () => {
  fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
    .finally(() => { location.href = '/'; });
};

$('#reload').onclick = load;
$('#q').oninput = load;
$('#site').onchange = load;
$('#kind').onchange = load;
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prompt-vault-cloud.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

$('#saveUser').onclick = async () => {
  const id = $('#userId').value.trim();
  const password = $('#userPassword').value;
  const status = $('#userStatus');
  if (!id || !password) {
    status.textContent = '請輸入使用者 ID 與密碼。';
    return;
  }
  try {
    await api('/api/users', { method: 'POST', body: JSON.stringify({ action: 'upsert', id, password }) });
    $('#userPassword').value = '';
    status.textContent = `已儲存 ${id}。`;
    await loadUsers();
  } catch (err) {
    status.textContent = String(err.message || err);
  }
};

render();
load();
loadUsers();