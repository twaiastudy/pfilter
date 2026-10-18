import { isAdminEmail, json, readCookie, verifySession, COOKIE } from '../_lib.js';
import { rowToRecord } from './_shared.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
}

export async function onRequestGet({ request, env }) {
  const session = await verifySession(readCookie(request, COOKIE), env.SESSION_SECRET);
  if (!session || !isAdminEmail(env, session.email)) return json({ ok: false, error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const site = (url.searchParams.get('site') || '').trim();
  const kind = (url.searchParams.get('kind') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const where = [];
  const binds = [];
  if (site) {
    where.push('site = ?');
    binds.push(site);
  }
  if (kind === 'pii') {
    where.push("COALESCE(sensitive_json, '') <> ''");
  } else if (kind) {
    where.push('kind = ?');
    binds.push(kind);
  }
  if (q) {
    where.push(`(
      LOWER(COALESCE(display_name, '')) LIKE ? OR
      LOWER(COALESCE(page_url, '')) LIKE ? OR
      LOWER(COALESCE(endpoint, '')) LIKE ? OR
      LOWER(COALESCE(model, '')) LIKE ? OR
      LOWER(COALESCE(text, '')) LIKE ? OR
      LOWER(COALESCE(raw, '')) LIKE ? OR
      LOWER(COALESCE(name, '')) LIKE ?
    )`);
    const like = `%${q}%`;
    binds.push(like, like, like, like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM records ${clause}`).bind(...binds).first();
  const rows = await env.DB.prepare(`SELECT * FROM records ${clause} ORDER BY ts DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset).all();

  return json({
    ok: true,
    total: totalRow?.count || 0,
    items: (rows.results || []).map(rowToRecord)
  });
}