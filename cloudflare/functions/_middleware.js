import { COOKIE, isAdminEmail, readCookie, sessionCookie, verifySession } from './_lib.js';

const PUBLIC = new Set([
  '/',
  '/index.html',
  '/login.js',
  '/styles.css',
  '/robots.txt',
  '/api/login',
  '/api/logout',
  '/api/config',
  '/api/ingest',
  '/api/extension-login',
  '/api/extension/login'
]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const { pathname } = url;

  if (PUBLIC.has(pathname)) return context.next();

  // 登入頁不對外公開，只透過 /admin 顯示
  if (pathname === '/login' || pathname === '/login.html') {
    return new Response(null, { status: 302, headers: { Location: `${url.origin}/admin/` } });
  }

  const token = readCookie(context.request, COOKIE);
  const session = await verifySession(token, context.env.SESSION_SECRET);
  const allowed = session && isAdminEmail(context.env, session.email);

  if (allowed) {
    context.data.user = session;
    return context.next();
  }

  const clear = token ? { 'Set-Cookie': sessionCookie('', 0, COOKIE) } : {};

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const page = await context.env.ASSETS.fetch(new Request(new URL('/login', url.origin)));
    return new Response(page.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        ...clear
      }
    });
  }

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...clear }
    });
  }

  return context.next();
}