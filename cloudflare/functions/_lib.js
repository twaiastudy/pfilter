const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;

export const COOKIE = 'pv_session';
export const MAX_AGE = 7 * 24 * 3600;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), ...headers } });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function readCookie(request, name = COOKIE) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : '';
}

export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function readBearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function randomBytes(size = 16) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function pbkdf2(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password, salt = randomBytes(), iterations = PBKDF2_ITERATIONS) {
  const digest = await pbkdf2(String(password), salt, iterations);
  return `pbkdf2_sha256$${iterations}$${b64url(salt)}$${b64url(digest)}`;
}

export async function verifyPassword(password, encoded) {
  if (!password || !encoded) return false;
  const parts = String(encoded).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromB64url(parts[2]);
  const expected = parts[3];
  const digest = await pbkdf2(String(password), salt, iterations);
  return safeEqual(b64url(digest), expected);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token, secret, now = Date.now() / 1000) {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

export function sessionCookie(value, maxAge = MAX_AGE, name = COOKIE) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function adminEmails(env) {
  const list = String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

export function isAdminEmail(env, email) {
  return adminEmails(env).includes(String(email || '').toLowerCase());
}

export async function verifyGoogleToken(credential, clientId, fetcher = fetch) {
  const response = await fetcher(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) return { error: 'invalid_token' };
  const token = await response.json();
  if (token.aud !== clientId) return { error: 'wrong_audience' };
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(token.iss)) return { error: 'wrong_issuer' };
  if (String(token.email_verified) !== 'true') return { error: 'email_not_verified' };
  if (Number(token.exp) < Date.now() / 1000) return { error: 'expired' };
  return { email: String(token.email || '').toLowerCase(), name: String(token.name || token.email || '') };
}