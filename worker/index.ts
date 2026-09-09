/// <reference types="@cloudflare/workers-types" />

import { createRemoteJWKSet, jwtVerify } from 'jose';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_IDS: string;
  ALLOWED_ORIGINS?: string;
};

type User = { id: string; email: string; name: string | null };
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const encoder = new TextEncoder();

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function cors(request: Request, env: Env) {
  const origin = request.headers.get('origin');
  const allowed = env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()) ?? [];
  const headers = new Headers({ 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
  if (origin && allowed.includes(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const tokenHash = await hashToken(authorization.slice(7));
  return env.DB.prepare(`SELECT u.id, u.email, u.display_name AS name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > unixepoch()`)
    .bind(tokenHash)
    .first<User>();
}

async function googleLogin(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as { idToken?: string } | null;
  if (!body?.idToken) return json({ error: 'IDトークンが必要です' }, 400);
  const audiences = env.GOOGLE_CLIENT_IDS.split(',').map((value) => value.trim()).filter(Boolean);
  if (!audiences.length) return json({ error: 'OAuth設定が完了していません' }, 503);
  try {
    const { payload } = await jwtVerify(body.idToken, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: audiences,
    });
    if (!payload.sub || !payload.email || payload.email_verified !== true) return json({ error: '確認済みGoogleアカウントが必要です' }, 401);
    const user: User = { id: payload.sub, email: String(payload.email).toLowerCase(), name: typeof payload.name === 'string' ? payload.name : null };
    await env.DB.prepare(`INSERT INTO users (id, email, display_name, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = unixepoch()`)
      .bind(user.id, user.email, user.name)
      .run();
    const token = randomToken();
    await env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, unixepoch() + 2592000, unixepoch())`)
      .bind(await hashToken(token), user.id)
      .run();
    return json({ token, user });
  } catch {
    return json({ error: 'Googleログインを確認できませんでした' }, 401);
  }
}

async function api(request: Request, env: Env, url: URL) {
  if (request.method === 'POST' && url.pathname === '/v1/auth/google') return googleLogin(request, env);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'ログインが必要です' }, 401);
  if (request.method === 'GET' && url.pathname === '/v1/me') return json({ user });
  if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
    const token = request.headers.get('authorization')?.slice(7);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

const worker = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const corsHeaders = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (url.pathname.startsWith('/v1/')) {
      const response = await api(request, env, url);
      corsHeaders.forEach((value, key) => response.headers.set(key, value));
      return response;
    }
    return env.ASSETS.fetch(request);
  },
};

export default worker;
