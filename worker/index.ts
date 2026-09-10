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
  const headers = new Headers({ 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' });
  if (origin && allowed.includes(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, maxLength: number, required = false) {
  if (typeof value !== 'string') return required ? null : '';
  const result = value.trim();
  if ((required && !result) || result.length > maxLength) return null;
  return result;
}

function dateField(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function idField(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

async function memberRole(env: Env, tripId: string, userId: string) {
  const row = await env.DB.prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, userId)
    .first<{ role: 'owner' | 'editor' }>();
  return row?.role ?? null;
}

async function requireMember(env: Env, tripId: string, userId: string) {
  return (await memberRole(env, tripId, userId)) ? null : json({ error: 'この旅行を編集する権限がありません' }, 403);
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

async function listTrips(env: Env, user: User) {
  const result = await env.DB.prepare(`
    SELECT t.id, t.name, t.destination, t.starts_on AS startsOn, t.ends_on AS endsOn,
           t.updated_at AS updatedAt, tm.role,
           (SELECT COUNT(*) FROM trip_members members WHERE members.trip_id = t.id) AS memberCount
    FROM trips t
    JOIN trip_members tm ON tm.trip_id = t.id
    WHERE tm.user_id = ?
    ORDER BY t.starts_on, t.id
  `).bind(user.id).all();
  return json({ trips: result.results });
}

async function createTrip(request: Request, env: Env, user: User) {
  const body = await request.json().catch(() => null);
  if (!isObject(body)) return json({ error: '旅行データが必要です' }, 400);
  const name = textField(body.name, 120, true);
  const destination = textField(body.destination, 160);
  const startsOn = dateField(body.startsOn);
  const endsOn = dateField(body.endsOn);
  if (!name || destination === null || !startsOn || !endsOn || startsOn > endsOn) {
    return json({ error: '旅行名と正しい日付を入力してください' }, 400);
  }
  const id = idField(body.id) ?? crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO trips (id, name, destination, starts_on, ends_on, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        destination = excluded.destination,
        starts_on = excluded.starts_on,
        ends_on = excluded.ends_on,
        updated_at = unixepoch()
      WHERE trips.created_by = excluded.created_by
    `)
      .bind(id, name, destination, startsOn, endsOn, user.id),
    env.DB.prepare("INSERT INTO trip_members (trip_id, user_id, role) SELECT id, ?, 'owner' FROM trips WHERE id = ? AND created_by = ? ON CONFLICT(trip_id, user_id) DO NOTHING")
      .bind(user.id, id, user.id),
  ]);
  if (!(await memberRole(env, id, user.id))) return json({ error: '旅行IDが競合しました' }, 409);
  return json({ trip: { id, name, destination, startsOn, endsOn, role: 'owner', memberCount: 1 } }, 201);
}

async function updateTrip(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  if (!isObject(body)) return json({ error: '旅行データが必要です' }, 400);
  const name = textField(body.name, 120, true);
  const destination = textField(body.destination, 160);
  const startsOn = dateField(body.startsOn);
  const endsOn = dateField(body.endsOn);
  if (!name || destination === null || !startsOn || !endsOn || startsOn > endsOn) {
    return json({ error: '旅行名と正しい日付を入力してください' }, 400);
  }
  const result = await env.DB.prepare(`UPDATE trips SET name = ?, destination = ?, starts_on = ?, ends_on = ?, updated_at = unixepoch() WHERE id = ?`)
    .bind(name, destination, startsOn, endsOn, tripId)
    .run();
  return result.meta.changes ? json({ trip: { id: tripId, name, destination, startsOn, endsOn } }) : json({ error: '旅行が見つかりません' }, 404);
}

async function listItems(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`SELECT id, day, time, kind, title, note, updated_by AS updatedBy, updated_at AS updatedAt FROM itinerary_items WHERE trip_id = ? ORDER BY day, time, id`)
    .bind(tripId)
    .all();
  return json({ items: result.results });
}

function itineraryFields(body: Record<string, unknown>) {
  const day = dateField(body.day);
  const time = textField(body.time, 5);
  const kind = textField(body.kind, 32) || '予定';
  const title = textField(body.title, 160, true);
  const note = textField(body.note, 4000);
  if (!day || time === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time) || !kind || !title || note === null) return null;
  return { day, time, kind, title, note };
}

async function createItem(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? itineraryFields(body) : null;
  if (!fields) return json({ error: '正しい旅程を入力してください' }, 400);
  const id = idField(body?.id) ?? crypto.randomUUID();
  const result = await env.DB.prepare(`
    INSERT INTO itinerary_items (id, trip_id, day, time, kind, title, note, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      day = excluded.day,
      time = excluded.time,
      kind = excluded.kind,
      title = excluded.title,
      note = excluded.note,
      updated_by = excluded.updated_by,
      updated_at = unixepoch()
    WHERE itinerary_items.trip_id = excluded.trip_id
  `)
    .bind(id, tripId, fields.day, fields.time, fields.kind, fields.title, fields.note, user.id)
    .run();
  if (!result.meta.changes) return json({ error: '旅程IDが競合しました' }, 409);
  return json({ item: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updateItem(request: Request, env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? itineraryFields(body) : null;
  if (!fields) return json({ error: '正しい旅程を入力してください' }, 400);
  const result = await env.DB.prepare(`UPDATE itinerary_items SET day = ?, time = ?, kind = ?, title = ?, note = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ? AND trip_id = ?`)
    .bind(fields.day, fields.time, fields.kind, fields.title, fields.note, user.id, itemId, tripId)
    .run();
  return result.meta.changes ? json({ item: { id: itemId, ...fields, updatedBy: user.id } }) : json({ error: '旅程が見つかりません' }, 404);
}

async function deleteItem(env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare('DELETE FROM itinerary_items WHERE id = ? AND trip_id = ?').bind(itemId, tripId).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: '旅程が見つかりません' }, 404);
}

async function createInvite(env: Env, user: User, tripId: string, url: URL) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const token = randomToken();
  await env.DB.prepare('INSERT INTO invites (token_hash, trip_id, created_by, expires_at) VALUES (?, ?, ?, unixepoch() + 604800)')
    .bind(await hashToken(token), tripId, user.id)
    .run();
  return json({ invite: { url: `${url.origin}/invite/${token}`, expiresIn: 604800 } }, 201);
}

async function acceptInvite(env: Env, user: User, token: string) {
  const tokenHash = await hashToken(token);
  const invite = await env.DB.prepare(`
    UPDATE invites
    SET consumed_by = ?, consumed_at = unixepoch()
    WHERE token_hash = ? AND expires_at > unixepoch() AND consumed_at IS NULL
    RETURNING trip_id AS tripId
  `)
    .bind(user.id, tokenHash)
    .first<{ tripId: string }>();
  if (!invite) return json({ error: '招待リンクが無効か期限切れです' }, 404);
  await env.DB.prepare("INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor') ON CONFLICT(trip_id, user_id) DO NOTHING")
    .bind(invite.tripId, user.id)
    .run();
  return json({ tripId: invite.tripId });
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
  if (request.method === 'GET' && url.pathname === '/v1/trips') return listTrips(env, user);
  if (request.method === 'POST' && url.pathname === '/v1/trips') return createTrip(request, env, user);

  const tripMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)$/);
  if (tripMatch && request.method === 'PATCH') return updateTrip(request, env, user, tripMatch[1]);

  const itemsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/items$/);
  if (itemsMatch && request.method === 'GET') return listItems(env, user, itemsMatch[1]);
  if (itemsMatch && request.method === 'POST') return createItem(request, env, user, itemsMatch[1]);

  const itemMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/items\/([^/]+)$/);
  if (itemMatch && request.method === 'PATCH') return updateItem(request, env, user, itemMatch[1], itemMatch[2]);
  if (itemMatch && request.method === 'DELETE') return deleteItem(env, user, itemMatch[1], itemMatch[2]);

  const inviteMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/invites$/);
  if (inviteMatch && request.method === 'POST') return createInvite(env, user, inviteMatch[1], url);
  const acceptMatch = url.pathname.match(/^\/v1\/invites\/([^/]+)\/accept$/);
  if (acceptMatch && request.method === 'POST') return acceptInvite(env, user, acceptMatch[1]);
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
