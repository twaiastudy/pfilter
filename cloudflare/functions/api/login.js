import { COOKIE, MAX_AGE, isAdminEmail, json, readJson, sessionCookie, signSession, verifyGoogleToken } from '../_lib.js';

export async function onRequestPost({ request, env }, fetcher = fetch) {
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) return json({ error: 'not_configured' }, 503);
  const body = await readJson(request);
  if (typeof body?.credential !== 'string') return json({ error: 'bad_request' }, 400);

  const verified = await verifyGoogleToken(body.credential, env.GOOGLE_CLIENT_ID, fetcher);
  if (verified.error) return json({ error: verified.error }, 401);
  if (!isAdminEmail(env, verified.email)) return json({ error: 'not_allowed', email: verified.email, name: verified.name }, 403);

  const token = await signSession({ email: verified.email, exp: Math.floor(Date.now() / 1000) + MAX_AGE }, env.SESSION_SECRET);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, MAX_AGE, COOKIE) });
}