const $ = (s) => document.querySelector(s);
let all = [];

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else e[k] = v;
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const fmtTime = (t) => new Date(t).toLocaleString('zh-TW', { hour12: false });
const siteName = (s) => ({
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  notebook: 'Notebook'
}[s] || 'ChatGPT');

async function load() {
  all = (await PVDB.allRecords()).sort((a, b) => b.ts - a.ts);
  render();
}

function haystack(r) {
  return [r.text, r.name, r.pageUrl, JSON.stringify(r.attachments || [])].join(' ').toLowerCase();
}

async function downloadFile(r) {
  const b = await PVDB.getBlob(r.hash);
  if (!b) return alert('找不到檔案內容');
  const url = URL.createObjectURL(b.blob);
  el('a', { href: url, download: r.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function header(r, extra) {
  return el('div', { class: 'meta' },
    el('span', { class: 'badge ' + r.site }, siteName(r.site)),
    r.kind === 'file' ? el('span', { class: 'badge file' }, '檔案') : null,
    r.sensitive && r.sensitive.twId ? el('span', { class: 'badge pii' }, `身分證 ×${r.sensitive.twId}`) : null,
    el('span', {}, fmtTime(r.ts)),
    r.model ? el('span', {}, r.model) : null,
    el('span', { class: 'spacer' }),
    extra,
    el('button', {
      class: 'small danger', textContent: '刪除',
      onclick: async () => { if (confirm('刪除這筆紀錄?')) { await PVDB.deleteRecord(r.id, r.hash); load(); } }
    })
  );
}

function card(r) {
  const c = el('div', { class: 'card' });
  if (r.kind === 'prompt') {
    c.append(header(r, el('button', {
      class: 'small', textContent: '複製',
      onclick: (e) => { navigator.clipboard.writeText(r.text); e.target.textContent = '已複製'; }
    })));
    c.append(el('div', { class: 'text' }, r.text || '(無文字)'));
    if (r.attachments && r.attachments.length) {
      c.append(el('details', {}, el('summary', {}, `附件資訊 (${r.attachments.length})`),
        el('pre', {}, JSON.stringify(r.attachments, null, 2))));
    }
    c.append(el('details', {}, el('summary', {}, '原始請求內容'), el('pre', {}, r.raw || '')));
  } else {
    c.append(header(r, r.hash ? el('button', { class: 'small primary', textContent: '下載', onclick: () => downloadFile(r) }) : null));
    c.append(el('div', {}, el('strong', {}, r.name), `  ·  ${r.type || '未知類型'}  ·  ${fmtSize(r.size)}`,
      r.skipped ? '  ·  (檔案過大,僅記錄 metadata)' : ''));
    if (r.hash && r.type.startsWith('image/')) {
      PVDB.getBlob(r.hash).then((b) => {
        if (b) c.append(el('img', { class: 'thumb', src: URL.createObjectURL(b.blob) }));
      });
    }
  }
  if (r.pageUrl) c.append(el('details', {}, el('summary', {}, '來源頁面'), el('a', { href: r.pageUrl, target: '_blank', rel: 'noreferrer', textContent: r.pageUrl })));
  return c;
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const site = $('#site').value, kind = $('#kind').value;
  const kindOk = (r) => !kind || (kind === 'pii' ? Boolean(r.sensitive) : r.kind === kind);
  const rows = all.filter((r) => (!site || r.site === site) && kindOk(r) && (!q || haystack(r).includes(q)));
  $('#count').textContent = `${rows.length} / ${all.length} 筆`;
  const list = $('#list');
  list.replaceChildren();
  if (!rows.length) { list.append(el('div', { class: 'empty' }, '還沒有紀錄。去 ChatGPT、Claude、Gemini 或 Notebook 送出一則訊息試試。')); return; }
  rows.forEach((r) => list.append(card(r)));
}

const blobToB64 = (blob) => new Promise((res, rej) => {
  const f = new FileReader();
  f.onload = () => res(String(f.result).split(',')[1]);
  f.onerror = () => rej(f.error);
  f.readAsDataURL(blob);
});

async function exportJSON(withFiles) {
  const out = [];
  for (const r of all) {
    const o = { ...r };
    if (withFiles && r.hash) {
      const b = await PVDB.getBlob(r.hash);
      if (b) o.dataBase64 = await blobToB64(b.blob);
    }
    out.push(o);
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date().toISOString().slice(0, 10);
  el('a', { href: url, download: `prompt-vault-${d}${withFiles ? '-with-files' : ''}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('#q').oninput = render;
$('#site').onchange = render;
$('#kind').onchange = render;
$('#exp1').onclick = () => exportJSON(false);
$('#exp2').onclick = () => exportJSON(true);
$('#clear').onclick = async () => {
  if (confirm('確定清空所有紀錄與檔案?此動作無法復原。')) { await PVDB.clear(); chrome.action.setBadgeText({ text: '' }); load(); }
};

load();