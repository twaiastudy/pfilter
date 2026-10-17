import { hashPassword, isAdminEmail, json, readJson, readCookie, sessionCookie, verifySession } from '../_lib.js';
import { unauthorized } from './_shared.js';

async function requireAdmin(request, env) {
  const session = await verifySession(readCookie(request), env.SESSION_SECRET);
  if (!session || !isAdminEmail(env, session.email)) return null;
  return session;
}

export async function onRequestGet({ request, env }) {
  const session = await requireAdmin(request, env);
  if (!session) return unauthorized('unauthorized');

  const rows = await env.DB.prepare('SELECT id, active, token_version, created_at, updated_at, last_login_at FROM users ORDER BY updated_at DESC, id ASC').all();
  return json({ ok: true, items: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const session = await requireAdmin(request, env);
  if (!session) return unauthorized('unauthorized');

  const body = await readJson(request);
  const action = String(body?.action || 'upsert');
  const userId = String(body?.id || '').trim().toLowerCase();

  if (action === 'upsert') {
    const password = String(body?.password || '');
    const active = body?.active !== false;
    if (!userId || !password) return json({ ok: false, error: 'bad_request' }, 400);
    const passwordHash = await hashPassword(password);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO users (id, password_hash, active, token_version, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         password_hash = excluded.password_hash,
         active = excluded.active,
         token_version = users.token_version + 1,
         updated_at = excluded.updated_at`
    ).bind(userId, passwordHash, active ? 1 : 0, now, now).run();
    return json({ ok: true });
  }

  if (!userId) return json({ ok: false, error: 'bad_request' }, 400);
  if (action === 'toggle') {
    const row = await env.DB.prepare('SELECT active, token_version FROM users WHERE id = ?').bind(userId).first();
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    const next = row.active ? 0 : 1;
    await env.DB.prepare('UPDATE users SET active = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?').bind(next, Date.now(), userId).run();
    return json({ ok: true });
  }

  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: 'bad_request' }, 400);
}