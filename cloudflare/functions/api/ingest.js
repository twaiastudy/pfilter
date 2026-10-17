import { json, isIngest, normalizeRecord, unauthorized } from './_shared.js';
import { readBearerToken, verifySession } from '../_lib.js';

async function isUserToken(request, env) {
  const token = readBearerToken(request);
  if (!token || !env.SESSION_SECRET) return false;
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload || payload.scope !== 'ingest' || !payload.uid) return false;
  const row = await env.DB.prepare('SELECT id, token_version, active FROM users WHERE id = ?').bind(payload.uid).first();
  if (!row || !row.active || Number(row.token_version || 0) !== Number(payload.ver || 0)) return false;
  return true;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
}

export async function onRequestPost({ request, env }) {
  if (!(isIngest(request, env) || await isUserToken(request, env))) return unauthorized();

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const rec = normalizeRecord(payload);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO records
     (id, ts, kind, site, display_name, page_url, endpoint, model, text, attachments_json, raw, name, mime_type, size, hash, skipped)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    rec.id,
    rec.ts,
    rec.kind,
    rec.site,
    rec.displayName,
    rec.pageUrl,
    rec.endpoint,
    rec.model,
    rec.text,
    rec.attachmentsJson,
    rec.raw,
    rec.name,
    rec.mimeType,
    rec.size,
    rec.hash,
    rec.skipped
  ).run();

  return json({ ok: true, id: rec.id });
}