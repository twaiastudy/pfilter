"use strict";

const msg = document.getElementById('msg');

function setMsg(text) {
  msg.textContent = text;
}

async function onCredential(resp) {
  setMsg('驗證中…');
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ credential: resp.credential }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) { location.href = '/admin/'; return; }
  if (d.error === 'not_allowed') { setMsg('此帳號不是管理者。'); return; }
  if (d.error === 'not_configured') { setMsg('登入功能尚未設定完成。'); return; }
  setMsg('登入失敗，請再試一次。');
}

fetch('/api/config').then((r) => r.json()).then(({ clientId }) => {
  if (!clientId) { setMsg('登入功能尚未設定完成。'); return; }
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = () => {
    google.accounts.id.initialize({ client_id: clientId, callback: onCredential, ux_mode: 'popup' });
    google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'zh-TW' });
  };
  s.onerror = () => setMsg('無法載入 Google 登入元件。');
  document.head.appendChild(s);
}).catch(() => setMsg('無法取得登入設定。'));