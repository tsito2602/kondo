/// <reference types="@cloudflare/workers-types" />

import { createRemoteJWKSet, jwtVerify } from 'jose';

import { candidateFingerprint, GmailImportCandidate, isCandidateNearTrip, parseGmailMessage } from './gmail-import';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_IDS: string;
  GOOGLE_GMAIL_CLIENT_ID?: string;
  GOOGLE_GMAIL_CLIENT_SECRET?: string;
  GOOGLE_GMAIL_REDIRECT_URI?: string;
  GMAIL_TOKEN_ENCRYPTION_KEY?: string;
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
  const headers = new Headers({ 'access-control-allow-headers': 'authorization, content-type, x-filename, x-file-size', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' });
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

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function gmailEncryptionKey(env: Env) {
  if (!env.GMAIL_TOKEN_ENCRYPTION_KEY) throw new Error('Gmail暗号化設定がありません');
  const raw = fromBase64Url(env.GMAIL_TOKEN_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error('Gmail暗号化キーは32 byte必要です');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptGmailToken(env: Env, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await gmailEncryptionKey(env), encoder.encode(token));
  return { encryptedToken: base64Url(new Uint8Array(encrypted)), iv: base64Url(iv) };
}

async function decryptGmailToken(env: Env, encryptedToken: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    await gmailEncryptionKey(env),
    fromBase64Url(encryptedToken),
  );
  return new TextDecoder().decode(decrypted);
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

function gmailConfigured(env: Env) {
  return Boolean(env.GOOGLE_GMAIL_CLIENT_ID && env.GOOGLE_GMAIL_CLIENT_SECRET && env.GOOGLE_GMAIL_REDIRECT_URI && env.GMAIL_TOKEN_ENCRYPTION_KEY);
}

function allowedGmailReturnUrl(value: string, env: Env) {
  try {
    const url = new URL(value);
    if (url.protocol === 'tabi:') return value;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const allowed = env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
    return allowed.includes(url.origin) ? value : null;
  } catch {
    return null;
  }
}

async function gmailStatus(env: Env, user: User) {
  const connection = await env.DB.prepare('SELECT email, updated_at AS updatedAt FROM gmail_connections WHERE user_id = ?')
    .bind(user.id)
    .first<{ email: string; updatedAt: number }>();
  return json({ configured: gmailConfigured(env), connected: Boolean(connection), email: connection?.email ?? null, updatedAt: connection?.updatedAt ?? null });
}

async function beginGmailAuthorization(request: Request, env: Env, user: User) {
  if (!gmailConfigured(env)) return json({ error: 'Gmail連携のサーバー設定が完了していません' }, 503);
  const body = await request.json().catch(() => null);
  const returnUrl = isObject(body) && typeof body.returnUrl === 'string' ? allowedGmailReturnUrl(body.returnUrl, env) : null;
  if (!returnUrl) return json({ error: 'Gmail連携後の戻り先が正しくありません' }, 400);
  const state = randomToken();
  await env.DB.prepare('INSERT INTO gmail_oauth_states (state_hash, user_id, return_url, expires_at) VALUES (?, ?, ?, unixepoch() + 600)')
    .bind(await hashToken(state), user.id, returnUrl)
    .run();
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.searchParams.set('client_id', env.GOOGLE_GMAIL_CLIENT_ID!);
  authorization.searchParams.set('redirect_uri', env.GOOGLE_GMAIL_REDIRECT_URI!);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
  authorization.searchParams.set('access_type', 'offline');
  authorization.searchParams.set('prompt', 'consent');
  authorization.searchParams.set('include_granted_scopes', 'true');
  authorization.searchParams.set('login_hint', user.email);
  authorization.searchParams.set('state', state);
  return json({ authorizationUrl: authorization.toString() });
}

function appendResult(returnUrl: string, result: 'connected' | 'denied' | 'failed') {
  const url = new URL(returnUrl);
  url.searchParams.set('gmail', result);
  return url.toString();
}

async function gmailCallback(request: Request, env: Env, url: URL) {
  try {
    const state = url.searchParams.get('state');
    if (!state) return json({ error: 'Gmail連携情報がありません' }, 400);
    const stateHash = await hashToken(state);
    const stored = await env.DB.prepare(`
      SELECT user_id AS userId, return_url AS returnUrl
      FROM gmail_oauth_states
      WHERE state_hash = ? AND expires_at > unixepoch()
    `).bind(stateHash).first<{ userId: string; returnUrl: string }>();
    if (!stored) return json({ error: 'Gmail連携の有効期限が切れました' }, 400);
    await env.DB.prepare('DELETE FROM gmail_oauth_states WHERE state_hash = ?').bind(stateHash).run();

    if (url.searchParams.get('error')) return Response.redirect(appendResult(stored.returnUrl, 'denied'), 302);
    const code = url.searchParams.get('code');
    if (!code || !gmailConfigured(env)) return Response.redirect(appendResult(stored.returnUrl, 'failed'), 302);

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_GMAIL_CLIENT_ID!,
          client_secret: env.GOOGLE_GMAIL_CLIENT_SECRET!,
          redirect_uri: env.GOOGLE_GMAIL_REDIRECT_URI!,
          grant_type: 'authorization_code',
        }),
      });
      const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
      if (!tokenResponse.ok || !token.access_token) throw new Error(token.error ?? 'token exchange failed');
      const existing = await env.DB.prepare('SELECT encrypted_refresh_token AS encryptedToken, token_iv AS iv FROM gmail_connections WHERE user_id = ?')
        .bind(stored.userId)
        .first<{ encryptedToken: string; iv: string }>();
      const encrypted = token.refresh_token
        ? await encryptGmailToken(env, token.refresh_token)
        : existing;
      if (!encrypted) throw new Error('refresh token missing');
      const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      const profile = await profileResponse.json() as { emailAddress?: string };
      await env.DB.prepare(`
        INSERT INTO gmail_connections (user_id, email, encrypted_refresh_token, token_iv, scope, updated_at)
        VALUES (?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(user_id) DO UPDATE SET
          email = excluded.email, encrypted_refresh_token = excluded.encrypted_refresh_token,
          token_iv = excluded.token_iv, scope = excluded.scope, updated_at = unixepoch()
      `).bind(stored.userId, profile.emailAddress ?? '', encrypted.encryptedToken, encrypted.iv, token.scope ?? '').run();
      return Response.redirect(appendResult(stored.returnUrl, 'connected'), 302);
    } catch {
      return Response.redirect(appendResult(stored.returnUrl, 'failed'), 302);
    }
  } catch {
    return json({ error: 'Gmail連携処理に失敗しました' }, 500);
  }
}

async function disconnectGmail(env: Env, user: User) {
  const connection = await env.DB.prepare('DELETE FROM gmail_connections WHERE user_id = ? RETURNING encrypted_refresh_token AS encryptedToken, token_iv AS iv')
    .bind(user.id)
    .first<{ encryptedToken: string; iv: string }>();
  if (connection && gmailConfigured(env)) {
    try {
      const refreshToken = await decryptGmailToken(env, connection.encryptedToken, connection.iv);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      // The local connection is already removed; a failed remote revoke is harmless.
    }
  }
  return new Response(null, { status: 204 });
}

async function gmailAccessToken(env: Env, user: User) {
  if (!gmailConfigured(env)) throw new Error('Gmail連携のサーバー設定が完了していません');
  const connection = await env.DB.prepare('SELECT encrypted_refresh_token AS encryptedToken, token_iv AS iv FROM gmail_connections WHERE user_id = ?')
    .bind(user.id)
    .first<{ encryptedToken: string; iv: string }>();
  if (!connection) throw new Error('Gmailを連携してください');
  const refreshToken = await decryptGmailToken(env, connection.encryptedToken, connection.iv);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_GMAIL_CLIENT_ID!,
      client_secret: env.GOOGLE_GMAIL_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const result = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error === 'invalid_grant' ? 'Gmailをもう一度連携してください' : 'Gmailへ接続できませんでした');
  return result.access_token;
}

async function gmailJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? 'Gmailの読み込みに失敗しました');
  return result;
}

type ParsedGmailMessage = Parameters<typeof parseGmailMessage>[0];

async function gmailMessageBatch(messageIds: string[], accessToken: string): Promise<ParsedGmailMessage[]> {
  if (!messageIds.length) return [];
  const boundary = `tabi_batch_${crypto.randomUUID().replaceAll('-', '')}`;
  const body = messageIds.map((messageId, index) => [
    `--${boundary}`,
    'Content-Type: application/http',
    `Content-ID: <message-${index}>`,
    '',
    `GET /gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full HTTP/1.1`,
    '',
  ].join('\r\n')).join('\r\n') + `\r\n--${boundary}--\r\n`;

  const response = await fetch('https://gmail.googleapis.com/batch/gmail/v1', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error('Gmailの一括読み込みに失敗しました');
  const responseBoundary = /boundary="?([^";]+)"?/i.exec(response.headers.get('content-type') ?? '')?.[1];
  if (!responseBoundary) throw new Error('Gmailの一括応答を読み取れませんでした');

  const messages: ParsedGmailMessage[] = [];
  for (const rawPart of responseText.split(`--${responseBoundary}`)) {
    const part = rawPart.replaceAll('\r\n', '\n');
    const httpStart = part.search(/HTTP\/1\.[01]\s+\d{3}/);
    if (httpStart < 0) continue;
    const status = Number.parseInt(/HTTP\/1\.[01]\s+(\d{3})/.exec(part.slice(httpStart))?.[1] ?? '500', 10);
    const bodyStart = part.indexOf('\n\n', httpStart);
    if (bodyStart < 0) throw new Error('Gmailの一括応答を読み取れませんでした');
    const jsonText = part.slice(bodyStart + 2).trim();
    const result = JSON.parse(jsonText) as ParsedGmailMessage & { error?: { message?: string } };
    if (status < 200 || status >= 300) throw new Error(result.error?.message ?? 'Gmailの読み込みに失敗しました');
    messages.push(result);
  }
  return messages;
}

type ExistingBooking = {
  id: string;
  kind: string;
  title: string;
  day: string;
  time: string;
  confirmationCode: string;
  originCode: string;
  destinationCode: string;
};

function normalized(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function matchingBooking(candidate: GmailImportCandidate, bookings: ExistingBooking[]) {
  return bookings.find((booking) => {
    if (booking.kind !== candidate.kind || booking.day !== candidate.day) return false;
    if (candidate.confirmationCode && normalized(booking.confirmationCode) === normalized(candidate.confirmationCode)) return true;
    if (booking.time !== candidate.time) return false;
    if (candidate.kind === 'hotel') return normalized(booking.title) === normalized(candidate.title);
    return Boolean(candidate.originCode && candidate.destinationCode
      && booking.originCode === candidate.originCode && booking.destinationCode === candidate.destinationCode);
  });
}

async function gmailCandidates(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const trip = await env.DB.prepare('SELECT starts_on AS startsOn, ends_on AS endsOn FROM trips WHERE id = ?')
    .bind(tripId).first<{ startsOn: string; endsOn: string }>();
  if (!trip) return json({ error: '旅行が見つかりません' }, 404);
  try {
    const accessToken = await gmailAccessToken(env, user);
    const query = encodeURIComponent('{予約 reservation booking itinerary e-ticket boarding hotel check-in train rail 新幹線 搭乗 宿泊}');
    const listed = await gmailJson<{ messages?: { id: string }[] }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&q=${query}`,
      accessToken,
    );
    const messages = listed.messages ?? [];
    const fetched: ParsedGmailMessage[] = [];
    for (let index = 0; index < messages.length; index += 50) {
      fetched.push(...await gmailMessageBatch(messages.slice(index, index + 50).map(({ id }) => id), accessToken));
    }
    const candidates = fetched.flatMap((message) => parseGmailMessage(message))
      .filter((candidate) => isCandidateNearTrip(candidate, trip.startsOn, trip.endsOn));
    const [bookingsResult, importsResult] = await Promise.all([
      env.DB.prepare(`
        SELECT b.id, b.kind, b.title, b.day, b.time, b.confirmation_code AS confirmationCode,
               COALESCE(d.origin_code, '') AS originCode, COALESCE(d.destination_code, '') AS destinationCode
        FROM bookings b LEFT JOIN booking_details d ON d.booking_id = b.id WHERE b.trip_id = ?
      `).bind(tripId).all<ExistingBooking>(),
      env.DB.prepare("SELECT external_id AS externalId, booking_id AS bookingId FROM booking_imports WHERE trip_id = ? AND provider = 'gmail'")
        .bind(tripId).all<{ externalId: string; bookingId: string }>(),
    ]);
    const imports = new Map(importsResult.results.map((entry) => [entry.externalId, entry.bookingId]));
    return json({
      candidates: candidates.map((candidate) => {
        const importedBookingId = imports.get(candidate.sourceMessageId);
        const duplicate = matchingBooking(candidate, bookingsResult.results);
        return {
          ...candidate,
          ...(importedBookingId || duplicate ? { duplicateBookingId: importedBookingId ?? duplicate?.id } : {}),
          alreadyImported: Boolean(importedBookingId),
        };
      }),
    });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'Gmailを読み込めませんでした' }, 502);
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

const bookingKinds = new Set(['flight', 'hotel', 'train', 'car', 'restaurant', 'ticket', 'other']);

function bookingFields(body: Record<string, unknown>) {
  const kind = textField(body.kind, 24, true);
  const title = textField(body.title, 160, true);
  const detail = textField(body.detail, 500);
  const origin = textField(body.origin, 160);
  const originCode = textField(body.originCode, 8);
  const destination = textField(body.destination, 160);
  const destinationCode = textField(body.destinationCode, 8);
  const day = dateField(body.day);
  const time = textField(body.time, 5);
  const endDay = body.endDay ? dateField(body.endDay) : day;
  const endTime = textField(body.endTime, 5);
  const confirmationCode = textField(body.confirmationCode, 120);
  const note = textField(body.note, 4000);
  if (!kind || !bookingKinds.has(kind) || !title || detail === null || origin === null || originCode === null || destination === null || destinationCode === null || !day || !endDay || endDay < day || time === null || endTime === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time) || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(endTime) || confirmationCode === null || note === null) return null;
  return { kind, title, detail, origin, originCode: originCode.toUpperCase(), destination, destinationCode: destinationCode.toUpperCase(), day, time, endDay, endTime, confirmationCode, note };
}

async function listBookings(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`
    SELECT b.id, b.kind, b.title, b.detail, b.day, b.time,
           COALESCE(d.origin, '') AS origin, COALESCE(d.origin_code, '') AS originCode,
           COALESCE(d.destination, '') AS destination, COALESCE(d.destination_code, '') AS destinationCode,
           COALESCE(NULLIF(d.end_day, ''), b.day) AS endDay, COALESCE(d.end_time, '') AS endTime,
           b.confirmation_code AS confirmationCode, b.note, b.updated_by AS updatedBy, b.updated_at AS updatedAt
    FROM bookings b LEFT JOIN booking_details d ON d.booking_id = b.id
    WHERE b.trip_id = ? ORDER BY b.day, b.time, b.id
  `)
    .bind(tripId)
    .all();
  return json({ bookings: result.results });
}

async function createBooking(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? bookingFields(body) : null;
  if (!fields) return json({ error: '正しい予約情報を入力してください' }, 400);
  const id = idField(body?.id) ?? crypto.randomUUID();
  const [bookingResult] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO bookings (id, trip_id, kind, title, detail, day, time, confirmation_code, note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind, title = excluded.title, detail = excluded.detail,
        day = excluded.day, time = excluded.time, confirmation_code = excluded.confirmation_code,
        note = excluded.note, updated_by = excluded.updated_by, updated_at = unixepoch()
      WHERE bookings.trip_id = excluded.trip_id
    `).bind(id, tripId, fields.kind, fields.title, fields.detail, fields.day, fields.time, fields.confirmationCode, fields.note, user.id),
    env.DB.prepare(`
      INSERT INTO booking_details (booking_id, origin, origin_code, destination, destination_code, end_day, end_time)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET
        origin = excluded.origin, origin_code = excluded.origin_code,
        destination = excluded.destination, destination_code = excluded.destination_code,
        end_day = excluded.end_day, end_time = excluded.end_time
    `).bind(id, fields.origin, fields.originCode, fields.destination, fields.destinationCode, fields.endDay, fields.endTime, id, tripId),
  ]);
  if (!bookingResult.meta.changes) return json({ error: '予約IDが競合しました' }, 409);
  return json({ booking: { id, ...fields, updatedBy: user.id } }, 201);
}

async function importGmailBooking(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? bookingFields(body) : null;
  const sourceMessageId = isObject(body) ? textField(body.sourceMessageId, 200, true) : null;
  if (!fields || !sourceMessageId || !['flight', 'hotel', 'train'].includes(fields.kind)) {
    return json({ error: '正しいGmail予約候補が必要です' }, 400);
  }
  const imported = await env.DB.prepare("SELECT booking_id AS bookingId FROM booking_imports WHERE trip_id = ? AND provider = 'gmail' AND external_id = ?")
    .bind(tripId, sourceMessageId).first<{ bookingId: string }>();
  if (imported) return json({ error: 'このメールはすでに取り込み済みです', bookingId: imported.bookingId }, 409);
  const existing = await env.DB.prepare(`
    SELECT b.id, b.kind, b.title, b.day, b.time, b.confirmation_code AS confirmationCode,
           COALESCE(d.origin_code, '') AS originCode, COALESCE(d.destination_code, '') AS destinationCode
    FROM bookings b LEFT JOIN booking_details d ON d.booking_id = b.id WHERE b.trip_id = ?
  `).bind(tripId).all<ExistingBooking>();
  const candidate: GmailImportCandidate = {
    ...fields,
    kind: fields.kind as GmailImportCandidate['kind'],
    sourceMessageId,
    confidence: 'high' as const,
    sender: '',
    subject: '',
    fingerprint: '',
  };
  const duplicate = matchingBooking(candidate, existing.results);
  if (duplicate) return json({ error: '同じ内容の予約がすでにあります', bookingId: duplicate.id }, 409);

  const id = idField(isObject(body) ? body.id : null) ?? crypto.randomUUID();
  const fingerprint = candidateFingerprint(candidate);
  const [bookingResult] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO bookings (id, trip_id, kind, title, detail, day, time, confirmation_code, note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, tripId, fields.kind, fields.title, fields.detail, fields.day, fields.time, fields.confirmationCode, fields.note, user.id),
    env.DB.prepare(`
      INSERT INTO booking_details (booking_id, origin, origin_code, destination, destination_code, end_day, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, fields.origin, fields.originCode, fields.destination, fields.destinationCode, fields.endDay, fields.endTime),
    env.DB.prepare(`
      INSERT INTO booking_imports (booking_id, trip_id, imported_by, provider, external_id, fingerprint)
      VALUES (?, ?, ?, 'gmail', ?, ?)
    `).bind(id, tripId, user.id, sourceMessageId, fingerprint),
  ]);
  if (!bookingResult.meta.changes) return json({ error: '予約を追加できませんでした' }, 409);
  return json({ booking: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updateBooking(request: Request, env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? bookingFields(body) : null;
  if (!fields) return json({ error: '正しい予約情報を入力してください' }, 400);
  const [bookingResult] = await env.DB.batch([
    env.DB.prepare(`UPDATE bookings SET kind = ?, title = ?, detail = ?, day = ?, time = ?, confirmation_code = ?, note = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ? AND trip_id = ?`)
      .bind(fields.kind, fields.title, fields.detail, fields.day, fields.time, fields.confirmationCode, fields.note, user.id, bookingId, tripId),
    env.DB.prepare(`
      INSERT INTO booking_details (booking_id, origin, origin_code, destination, destination_code, end_day, end_time)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET
        origin = excluded.origin, origin_code = excluded.origin_code,
        destination = excluded.destination, destination_code = excluded.destination_code,
        end_day = excluded.end_day, end_time = excluded.end_time
    `).bind(bookingId, fields.origin, fields.originCode, fields.destination, fields.destinationCode, fields.endDay, fields.endTime, bookingId, tripId),
  ]);
  return bookingResult.meta.changes ? json({ booking: { id: bookingId, ...fields, updatedBy: user.id } }) : json({ error: '予約が見つかりません' }, 404);
}

async function deleteBooking(env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const documents = await env.DB.prepare('SELECT object_key AS objectKey FROM booking_documents WHERE booking_id = ? AND trip_id = ?')
    .bind(bookingId, tripId)
    .all<{ objectKey: string }>();
  const result = await env.DB.prepare('DELETE FROM bookings WHERE id = ? AND trip_id = ?').bind(bookingId, tripId).run();
  if (result.meta.changes && documents.results.length) await env.BUCKET.delete(documents.results.map((document) => document.objectKey));
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: '予約が見つかりません' }, 404);
}

type BookingDocumentRow = {
  id: string;
  bookingId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  createdAt: number;
  objectKey?: string;
};

const bookingDocumentTypes = new Set([
  'application/pdf',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

async function listBookingDocuments(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`
    SELECT id, booking_id AS bookingId, filename, content_type AS contentType, size,
           uploaded_by AS uploadedBy, created_at AS createdAt
    FROM booking_documents WHERE trip_id = ? ORDER BY created_at, id
  `).bind(tripId).all<BookingDocumentRow>();
  return json({ documents: result.results });
}

async function uploadBookingDocument(request: Request, env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const booking = await env.DB.prepare('SELECT id FROM bookings WHERE id = ? AND trip_id = ?').bind(bookingId, tripId).first();
  if (!booking) return json({ error: '予約が見つかりません' }, 404);

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!bookingDocumentTypes.has(contentType)) return json({ error: 'JPEG、PNG、WebP、HEIC、GIF、PDFのいずれかを選択してください' }, 400);
  const declaredSize = Number(request.headers.get('x-file-size') ?? 0);
  if (!Number.isFinite(declaredSize) || declaredSize < 1 || declaredSize > 20 * 1024 * 1024) return json({ error: 'ファイルは20MB以下にしてください' }, 400);

  let decodedFilename = '';
  try {
    decodedFilename = decodeURIComponent(request.headers.get('x-filename') ?? '');
  } catch {
    return json({ error: 'ファイル名を確認してください' }, 400);
  }
  const filename = textField(decodedFilename, 180, true);
  if (!filename) return json({ error: 'ファイル名を確認してください' }, 400);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > 20 * 1024 * 1024 || bytes.byteLength !== declaredSize) return json({ error: 'ファイルサイズを確認してください' }, 400);

  const id = crypto.randomUUID();
  const objectKey = `trips/${tripId}/bookings/${bookingId}/${id}`;
  await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare(`
      INSERT INTO booking_documents (id, trip_id, booking_id, object_key, filename, content_type, size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, tripId, bookingId, objectKey, filename, contentType, bytes.byteLength, user.id).run();
  } catch (cause) {
    await env.BUCKET.delete(objectKey);
    throw cause;
  }
  return json({ document: { id, bookingId, filename, contentType, size: bytes.byteLength, uploadedBy: user.id, createdAt: Math.floor(Date.now() / 1000) } }, 201);
}

async function getBookingDocument(env: Env, user: User, tripId: string, bookingId: string, documentId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const document = await env.DB.prepare(`
    SELECT object_key AS objectKey, filename, content_type AS contentType
    FROM booking_documents WHERE id = ? AND booking_id = ? AND trip_id = ?
  `).bind(documentId, bookingId, tripId).first<BookingDocumentRow>();
  if (!document?.objectKey) return json({ error: '書類が見つかりません' }, 404);
  const object = await env.BUCKET.get(document.objectKey);
  if (!object) return json({ error: '書類の原本が見つかりません' }, 404);
  return new Response(object.body, { headers: {
    'content-type': document.contentType,
    'content-length': String(object.size),
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    'cache-control': 'private, no-store',
  } });
}

async function deleteBookingDocument(env: Env, user: User, tripId: string, bookingId: string, documentId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const document = await env.DB.prepare(`
    DELETE FROM booking_documents WHERE id = ? AND booking_id = ? AND trip_id = ?
    RETURNING object_key AS objectKey
  `).bind(documentId, bookingId, tripId).first<{ objectKey: string }>();
  if (!document) return json({ error: '書類が見つかりません' }, 404);
  await env.BUCKET.delete(document.objectKey);
  return new Response(null, { status: 204 });
}

type PackingRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  packed: number;
  updatedBy: string;
  updatedAt: number;
};

function packingFields(body: Record<string, unknown>) {
  const name = textField(body.name, 120, true);
  const category = textField(body.category, 40) || 'その他';
  const quantity = typeof body.quantity === 'number' && Number.isInteger(body.quantity) ? body.quantity : 1;
  const packed = typeof body.packed === 'boolean' ? body.packed : false;
  if (!name || !category || quantity < 1 || quantity > 99) return null;
  return { name, category, quantity, packed };
}

async function listPacking(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`
    SELECT id, name, category, quantity, packed, updated_by AS updatedBy, updated_at AS updatedAt
    FROM packing_items WHERE trip_id = ? ORDER BY packed, category, name, id
  `).bind(tripId).all<PackingRow>();
  return json({ items: result.results.map((item) => ({ ...item, packed: Boolean(item.packed) })) });
}

async function createPackingItem(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? packingFields(body) : null;
  if (!fields) return json({ error: '正しい持ち物情報を入力してください' }, 400);
  const id = idField(body?.id) ?? crypto.randomUUID();
  const result = await env.DB.prepare(`
    INSERT INTO packing_items (id, trip_id, name, category, quantity, packed, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, category = excluded.category, quantity = excluded.quantity,
      packed = excluded.packed, updated_by = excluded.updated_by, updated_at = unixepoch()
    WHERE packing_items.trip_id = excluded.trip_id
  `).bind(id, tripId, fields.name, fields.category, fields.quantity, fields.packed ? 1 : 0, user.id).run();
  if (!result.meta.changes) return json({ error: '持ち物IDが競合しました' }, 409);
  return json({ item: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updatePackingItem(request: Request, env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? packingFields(body) : null;
  if (!fields) return json({ error: '正しい持ち物情報を入力してください' }, 400);
  const result = await env.DB.prepare(`
    UPDATE packing_items SET name = ?, category = ?, quantity = ?, packed = ?, updated_by = ?, updated_at = unixepoch()
    WHERE id = ? AND trip_id = ?
  `).bind(fields.name, fields.category, fields.quantity, fields.packed ? 1 : 0, user.id, itemId, tripId).run();
  return result.meta.changes
    ? json({ item: { id: itemId, ...fields, updatedBy: user.id } })
    : json({ error: '持ち物が見つかりません' }, 404);
}

async function deletePackingItem(env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare('DELETE FROM packing_items WHERE id = ? AND trip_id = ?').bind(itemId, tripId).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: '持ち物が見つかりません' }, 404);
}

type TaskRow = {
  id: string;
  title: string;
  dueOn: string;
  assignee: string;
  done: number;
  updatedBy: string;
  updatedAt: number;
};

function taskFields(body: Record<string, unknown>) {
  const title = textField(body.title, 160, true);
  const dueOn = body.dueOn === '' ? '' : dateField(body.dueOn);
  const assignee = textField(body.assignee, 80);
  const done = typeof body.done === 'boolean' ? body.done : false;
  if (!title || dueOn === null || assignee === null) return null;
  return { title, dueOn, assignee, done };
}

async function listTasks(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`
    SELECT id, title, due_on AS dueOn, assignee, done, updated_by AS updatedBy, updated_at AS updatedAt
    FROM travel_tasks WHERE trip_id = ? ORDER BY done, CASE WHEN due_on = '' THEN 1 ELSE 0 END, due_on, title, id
  `).bind(tripId).all<TaskRow>();
  return json({ tasks: result.results.map((task) => ({ ...task, done: Boolean(task.done) })) });
}

async function createTask(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? taskFields(body) : null;
  if (!fields) return json({ error: '正しいタスク情報を入力してください' }, 400);
  const id = idField(body?.id) ?? crypto.randomUUID();
  const result = await env.DB.prepare(`
    INSERT INTO travel_tasks (id, trip_id, title, due_on, assignee, done, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, due_on = excluded.due_on, assignee = excluded.assignee,
      done = excluded.done, updated_by = excluded.updated_by, updated_at = unixepoch()
    WHERE travel_tasks.trip_id = excluded.trip_id
  `).bind(id, tripId, fields.title, fields.dueOn, fields.assignee, fields.done ? 1 : 0, user.id).run();
  if (!result.meta.changes) return json({ error: 'タスクIDが競合しました' }, 409);
  return json({ task: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updateTask(request: Request, env: Env, user: User, tripId: string, taskId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? taskFields(body) : null;
  if (!fields) return json({ error: '正しいタスク情報を入力してください' }, 400);
  const result = await env.DB.prepare(`
    UPDATE travel_tasks SET title = ?, due_on = ?, assignee = ?, done = ?, updated_by = ?, updated_at = unixepoch()
    WHERE id = ? AND trip_id = ?
  `).bind(fields.title, fields.dueOn, fields.assignee, fields.done ? 1 : 0, user.id, taskId, tripId).run();
  return result.meta.changes
    ? json({ task: { id: taskId, ...fields, updatedBy: user.id } })
    : json({ error: 'タスクが見つかりません' }, 404);
}

async function deleteTask(env: Env, user: User, tripId: string, taskId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare('DELETE FROM travel_tasks WHERE id = ? AND trip_id = ?').bind(taskId, tripId).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: 'タスクが見つかりません' }, 404);
}

async function createInvite(env: Env, user: User, tripId: string, url: URL) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const token = randomToken();
  await env.DB.prepare('INSERT INTO invites (token_hash, trip_id, created_by, expires_at) VALUES (?, ?, ?, unixepoch() + 604800)')
    .bind(await hashToken(token), tripId, user.id)
    .run();
  return json({ invite: { url: `${url.origin}/?invite=${encodeURIComponent(token)}`, expiresIn: 604800 } }, 201);
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
  if (request.method === 'GET' && url.pathname === '/v1/integrations/gmail/callback') return gmailCallback(request, env, url);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'ログインが必要です' }, 401);
  if (request.method === 'GET' && url.pathname === '/v1/me') return json({ user });
  if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
    const token = request.headers.get('authorization')?.slice(7);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
    return json({ ok: true });
  }
  if (request.method === 'GET' && url.pathname === '/v1/integrations/gmail') return gmailStatus(env, user);
  if (request.method === 'POST' && url.pathname === '/v1/integrations/gmail/authorization') return beginGmailAuthorization(request, env, user);
  if (request.method === 'DELETE' && url.pathname === '/v1/integrations/gmail') return disconnectGmail(env, user);
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

  const bookingsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings$/);
  if (bookingsMatch && request.method === 'GET') return listBookings(env, user, bookingsMatch[1]);
  if (bookingsMatch && request.method === 'POST') return createBooking(request, env, user, bookingsMatch[1]);

  const gmailCandidatesMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/gmail\/candidates$/);
  if (gmailCandidatesMatch && request.method === 'POST') return gmailCandidates(env, user, gmailCandidatesMatch[1]);

  const gmailImportsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/gmail\/imports$/);
  if (gmailImportsMatch && request.method === 'POST') return importGmailBooking(request, env, user, gmailImportsMatch[1]);

  const bookingMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings\/([^/]+)$/);
  if (bookingMatch && request.method === 'PATCH') return updateBooking(request, env, user, bookingMatch[1], bookingMatch[2]);
  if (bookingMatch && request.method === 'DELETE') return deleteBooking(env, user, bookingMatch[1], bookingMatch[2]);

  const bookingDocumentsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/booking-documents$/);
  if (bookingDocumentsMatch && request.method === 'GET') return listBookingDocuments(env, user, bookingDocumentsMatch[1]);

  const bookingDocumentCollectionMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings\/([^/]+)\/documents$/);
  if (bookingDocumentCollectionMatch && request.method === 'POST') return uploadBookingDocument(request, env, user, bookingDocumentCollectionMatch[1], bookingDocumentCollectionMatch[2]);

  const bookingDocumentMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/bookings\/([^/]+)\/documents\/([^/]+)$/);
  if (bookingDocumentMatch && request.method === 'GET') return getBookingDocument(env, user, bookingDocumentMatch[1], bookingDocumentMatch[2], bookingDocumentMatch[3]);
  if (bookingDocumentMatch && request.method === 'DELETE') return deleteBookingDocument(env, user, bookingDocumentMatch[1], bookingDocumentMatch[2], bookingDocumentMatch[3]);

  const packingItemsMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/packing$/);
  if (packingItemsMatch && request.method === 'GET') return listPacking(env, user, packingItemsMatch[1]);
  if (packingItemsMatch && request.method === 'POST') return createPackingItem(request, env, user, packingItemsMatch[1]);

  const packingItemMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/packing\/([^/]+)$/);
  if (packingItemMatch && request.method === 'PATCH') return updatePackingItem(request, env, user, packingItemMatch[1], packingItemMatch[2]);
  if (packingItemMatch && request.method === 'DELETE') return deletePackingItem(env, user, packingItemMatch[1], packingItemMatch[2]);

  const tasksMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/tasks$/);
  if (tasksMatch && request.method === 'GET') return listTasks(env, user, tasksMatch[1]);
  if (tasksMatch && request.method === 'POST') return createTask(request, env, user, tasksMatch[1]);

  const taskMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === 'PATCH') return updateTask(request, env, user, taskMatch[1], taskMatch[2]);
  if (taskMatch && request.method === 'DELETE') return deleteTask(env, user, taskMatch[1], taskMatch[2]);

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
