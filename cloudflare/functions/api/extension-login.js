import { hashPassword, json, readJson, signSession, verifyPassword } from '../_lib.js';

const TOKEN_AGE = 7 * 24 * 3600;

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ ok: false, error: 'db_missing' }, 500);
    if (!env.SESSION_SECRET) return json({ ok: false, error: 'session_secret_missing' }, 500);

  const body = await readJson(request);
  const userId = String(body?.userId || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!userId || !password) return json({ ok: false, error: 'bad_request' }, 400);

  const row = await env.DB.prepare('SELECT id, password_hash, token_version, active FROM users WHERE id = ?').bind(userId).first();
  if (!row || !row.active) return json({ ok: false, error: 'invalid_credentials' }, 401);
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return json({ ok: false, error: 'invalid_credentials' }, 401);

  const now = Math.floor(Date.now() / 1000);
  const token = await signSession({ uid: row.id, ver: Number(row.token_version || 0), scope: 'ingest', exp: now + TOKEN_AGE }, env.SESSION_SECRET);
  await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(Date.now(), Date.now(), row.id).run();

  return json({ ok: true, token, userId: row.id, expiresIn: TOKEN_AGE });
  } catch (error) {
    console.error('extension-login failed', error);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}