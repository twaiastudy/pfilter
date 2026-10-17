import { readBearerToken, safeEqual } from '../_lib.js';

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), ...headers }
  });
}

export function unauthorized(message = 'Unauthorized') {
  return json({ ok: false, error: message }, 401);
}

// 未設定的 token 一律不接受(避免 `Bearer undefined` 繞過驗證)
function hasToken(request, ...secrets) {
  const token = readBearerToken(request);
  return Boolean(token) && secrets.some((s) => typeof s === 'string' && s.length >= 16 && safeEqual(token, s));
}

export function isAdmin(request, env) {
  return hasToken(request, env.ADMIN_TOKEN);
}

export function isIngest(request, env) {
  return hasToken(request, env.INGEST_TOKEN, env.ADMIN_TOKEN);
}

export function normalizeRecord(record) {
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  return {
    id: String(record.id || crypto.randomUUID()),
    ts: Number(record.ts) || Date.now(),
    kind: record.kind === 'file' ? 'file' : 'prompt',
    site: ['chatgpt', 'claude', 'gemini', 'notebook'].includes(record.site) ? record.site : 'chatgpt',
    displayName: String(record.displayName || '').slice(0, 200),
    pageUrl: String(record.pageUrl || '').slice(0, 2000),
    endpoint: String(record.endpoint || '').slice(0, 500),
    model: String(record.model || '').slice(0, 200),
    text: String(record.text || '').slice(0, 5000000),
    attachmentsJson: JSON.stringify(attachments).slice(0, 5000000),
    raw: String(record.raw || '').slice(0, 2000000),
    name: String(record.name || '').slice(0, 500),
    mimeType: String(record.type || record.mimeType || '').slice(0, 200),
    size: Number(record.size) || 0,
    hash: String(record.hash || '').slice(0, 200),
    skipped: record.skipped ? 1 : 0
  };
}

export function rowToRecord(row) {
  return {
    id: row.id,
    ts: row.ts,
    kind: row.kind,
    site: row.site,
    displayName: row.display_name || '',
    pageUrl: row.page_url || '',
    endpoint: row.endpoint || '',
    model: row.model || '',
    text: row.text || '',
    attachments: row.attachments_json ? JSON.parse(row.attachments_json) : [],
    raw: row.raw || '',
    name: row.name || '',
    type: row.mime_type || '',
    size: row.size || 0,
    hash: row.hash || '',
    skipped: Boolean(row.skipped),
    createdAt: row.created_at || 0
  };
}