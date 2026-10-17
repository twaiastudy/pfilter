import { COOKIE, json, sessionCookie } from '../_lib.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0, COOKIE) });
}