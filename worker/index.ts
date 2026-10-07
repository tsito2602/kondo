/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { validDate } from '../src/utils/dates';
import { itineraryCategories, transportModes, itineraryDetailsError } from '../src/data/itinerary';
import type { ItineraryDetails } from '../src/data/types';
import { isShortMapsLink, mapCoordinates, mapUrl, referenceUrl, registeredGoogleMapsUrl, type Coordinates } from '../src/data/places';
import { placeNameFromLink } from '../src/data/geo';
import { validNoteContent, notePlainText, NOTE_TITLE_LIMIT, NOTE_BODY_LIMIT } from '../src/data/notes';

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { connectionBetween, createsFlightConnectionCycle, type FlightConnectionInput } from '../src/data/flight-connections';
import { startBookingImport, type AIBinding } from './booking-import';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_IDS: string;
  ALLOWED_ORIGINS?: string;
  /** Workers AI binding and AI Gateway id for reading booking documents. Import is off without either. */
  AI?: AIBinding;
  AI_GATEWAY_ID?: string;
};

type User = { id: string; email: string; name: string | null; avatarUrl: string | null };
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
  const row = await env.DB.prepare(`SELECT CASE WHEN tm.role = 'owner' THEN 'owner' WHEN p.read_only = 1 THEN 'viewer' ELSE tm.role END AS role FROM trip_members tm LEFT JOIN trip_member_permissions p ON p.trip_id = tm.trip_id AND p.user_id = tm.user_id WHERE tm.trip_id = ? AND tm.user_id = ?`)
    .bind(tripId, userId)
    .first<{ role: 'owner' | 'editor' | 'viewer' }>();
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
  return env.DB.prepare(`SELECT u.id, u.email, u.display_name AS name, p.avatar_url AS avatarUrl FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN user_profiles p ON p.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > unixepoch()`)
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
    const user: User = { id: payload.sub, email: String(payload.email).toLowerCase(), name: typeof payload.name === 'string' ? payload.name : null, avatarUrl: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture : null };
    await env.DB.prepare(`INSERT INTO users (id, email, display_name, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = COALESCE(users.display_name, excluded.display_name), updated_at = unixepoch()`)
      .bind(user.id, user.email, user.name)
      .run();
    await env.DB.prepare(`INSERT INTO user_profiles (user_id, avatar_url) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET avatar_url = excluded.avatar_url`).bind(user.id, user.avatarUrl).run();
    const saved = await env.DB.prepare('SELECT display_name AS name FROM users WHERE id = ?').bind(user.id).first<{ name: string | null }>();
    user.name = saved?.name ?? user.name;
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
           t.updated_at AS updatedAt, CASE WHEN tm.role = 'owner' THEN 'owner' WHEN mp.read_only = 1 THEN 'viewer' ELSE tm.role END AS role, COALESCE(tc.image, '') AS coverImage,
           (SELECT COUNT(*) FROM trip_members members WHERE members.trip_id = t.id) AS memberCount
    FROM trips t
    LEFT JOIN trip_covers tc ON tc.trip_id = t.id
    JOIN trip_members tm ON tm.trip_id = t.id
    LEFT JOIN trip_member_permissions mp ON mp.trip_id = tm.trip_id AND mp.user_id = tm.user_id
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
  const coverImage = body.coverImage === undefined ? undefined : textField(body.coverImage, 550000);
  if (coverImage === null || (coverImage && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(coverImage))) return json({ error: 'トップ画像を選び直してください' }, 400);
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
  if (coverImage !== undefined) await env.DB.prepare('INSERT INTO trip_covers (trip_id, image) VALUES (?, ?) ON CONFLICT(trip_id) DO UPDATE SET image = excluded.image').bind(id, coverImage).run();
  return json({ trip: { id, name, destination, startsOn, endsOn, coverImage, role: 'owner', memberCount: 1 } }, 201);
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
  const coverImage = body.coverImage === undefined ? undefined : textField(body.coverImage, 550000);
  if (coverImage === null || (coverImage && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(coverImage))) return json({ error: 'トップ画像を選び直してください' }, 400);
  if (!name || destination === null || !startsOn || !endsOn || startsOn > endsOn) {
    return json({ error: '旅行名と正しい日付を入力してください' }, 400);
  }
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE trips SET name = ?, destination = ?, starts_on = ?, ends_on = ?, updated_at = unixepoch() WHERE id = ?`).bind(name, destination, startsOn, endsOn, tripId),
    ...(coverImage === undefined ? [] : [env.DB.prepare('INSERT INTO trip_covers (trip_id, image) VALUES (?, ?) ON CONFLICT(trip_id) DO UPDATE SET image = excluded.image').bind(tripId, coverImage)]),
  ]);
  return results[0].meta.changes ? json({ trip: { id: tripId, name, destination, startsOn, endsOn, coverImage } }) : json({ error: '旅行が見つかりません' }, 404);
}

async function deleteTrip(env: Env, user: User, tripId: string) {
  const role = await memberRole(env, tripId, user.id);
  if (!role) {
    const exists = await env.DB.prepare('SELECT id FROM trips WHERE id = ?').bind(tripId).first();
    return exists ? json({ error: '旅行を削除する権限がありません' }, 403) : new Response(null, { status: 204 });
  }
  if (role !== 'owner') return json({ error: '旅行を削除できるのは作成者だけです' }, 403);
  const objects = await env.DB.prepare('SELECT object_key FROM booking_documents WHERE trip_id = ? UNION SELECT object_key FROM attachments WHERE trip_id = ?').bind(tripId, tripId).all<{ object_key: string }>();
  // Keep the database records if object cleanup fails; a retry can safely finish.
  for (let i = 0; i < objects.results.length; i += 1000) await env.BUCKET.delete(objects.results.slice(i, i + 1000).map((entry) => entry.object_key));
  await env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(tripId).run();
  return new Response(null, { status: 204 });
}

function placeFields(body: Record<string, unknown>) {
  const title = textField(body.title, 160, true);
  const note = textField(body.note, 4000);
  const openingHours = textField(body.openingHours, 500);
  const location = textField(body.location, 2000);
  let referenceLinks: { label: string; url: string }[] | undefined;
  if (body.referenceLinks !== undefined) {
    if (!Array.isArray(body.referenceLinks) || body.referenceLinks.length > 20) return null;
    referenceLinks = [];
    for (const link of body.referenceLinks) {
      if (!isObject(link)) return null;
      const label = textField(link.label, 120);
      const url = textField(link.url, 2000, true);
      if (label === null || !url || !referenceUrl(url)) return null;
      referenceLinks.push({ label, url });
    }
  }
  const itineraryItemId = body.itineraryItemId == null ? body.itineraryItemId : idField(body.itineraryItemId);
  if (body.itineraryItemId != null && !itineraryItemId) return null;
  const reservationStatus = textField(body.reservationStatus, 20);
  if (!title || note === null || openingHours === null || location === null || !['not_needed','unavailable','needed','requested','confirmed'].includes(reservationStatus ?? '')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(location) && !/^https?:\/\//i.test(location)) return null;
  return { title, note, openingHours, location, reservationStatus, ...(referenceLinks === undefined ? {} : { referenceLinks }), ...(itineraryItemId === undefined ? {} : { itineraryItemId }) };
}
/**
 * A Google Maps link → where it really points and its pin. Short share links
 * are followed (a few hops, Google Maps hosts only). An iPhone share link
 * (「?g_st=ic」) lands on 「?q=name, address&ftid=…」 with no coordinates; then
 * the Maps page itself is read for its pin, and as a last resort the
 * address is looked up on OpenStreetMap (Tsubasa 2026-10-07: 全部位置なし).
 */
const PAGE_PIN: [RegExp, 'latLng' | 'lngLat'][] = [
  [/[?&;]markers=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/, 'latLng'],
  [/[?&;]center=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/, 'latLng'],
  [/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/, 'latLng'],
  [/\[null,null,(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\]/, 'latLng'],
  // The page's opening camera, which a place page centres on the place: [[[zoom, lng, lat]
  [/APP_INITIALIZATION_STATE=\[\[\[-?[\d.]+,(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\]/, 'lngLat'],
];
function pinInPage(html: string): Coordinates | null {
  for (const [pattern, order] of PAGE_PIN) {
    const match = html.match(pattern);
    if (!match) continue;
    const [lat, lng] = order === 'latLng' ? [match[1], match[2]] : [match[2], match[1]];
    const point = { lat: Number(lat), lng: Number(lng) };
    if (Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && (point.lat || point.lng)) return point;
  }
  return null;
}
const BROWSER = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'accept-language': 'ja,en;q=0.8' };
async function followMapLink(link: string, trace?: string[]): Promise<string> {
  let target = link;
  for (let hop = 0; hop < 4 && !mapCoordinates(target); hop++) {
    const response = await fetch(target, { redirect: 'manual', headers: BROWSER, signal: AbortSignal.timeout(4000) });
    let next = response.headers.get('location');
    trace?.push(`hop ${response.status} ${target} -> ${next ?? ''}`);
    // Some share links answer with a page that sends the browser on by script
    // or meta refresh instead of a redirect: take the first Maps link in it.
    if (!next && response.ok && isShortMapsLink(target)) {
      const page = (await response.text()).slice(0, 500_000);
      next = mapsLinkInPage(page);
      trace?.push(`short page ${page.length} ${page.slice(0, 1500)}`);
    }
    else await response.body?.cancel();
    if (!next) break;
    const href = new URL(next, target).href;
    if (!registeredGoogleMapsUrl(href)) break;
    target = href;
  }
  return target;
}
function mapsLinkInPage(html: string): string | null {
  const text = html.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  for (const match of text.matchAll(/https:\/\/(?:www\.google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)[^"'<>\s\\]*/g))
    if (registeredGoogleMapsUrl(match[0]) && !/\/maps\/api\//.test(match[0])) return match[0];
  return null;
}
/** A Maps page's own name for the place: 「Café Central · Herrengasse 14 - Google マップ」. */
function titleInPage(html: string): string {
  const raw = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)?.[1] ?? html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
  const title = raw.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s*[-–]\s*Google\s*(?:マップ|Maps)\s*$/i, '').trim();
  return /^Google\s*(?:マップ|Maps)$/i.test(title) ? '' : title.replace(/\s*·\s*/g, ', ');
}
async function geocode(query: string): Promise<Coordinates | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  const response = await fetch(url.href, { headers: { 'user-agent': 'kondo/2.0 (https://kondo.tsito-apps.workers.dev)', 'accept-language': 'ja,en' }, signal: AbortSignal.timeout(4000) });
  if (!response.ok) return null;
  const [first] = (await response.json()) as { lat?: string; lon?: string }[];
  const point = { lat: Number(first?.lat), lng: Number(first?.lon) };
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && (point.lat || point.lng) ? point : null;
}
async function locateMapLink(link: string, trace?: string[]): Promise<{ target: string; pin: Coordinates | null; title?: string }> {
  let target = link;
  try {
    if (isShortMapsLink(link)) target = await followMapLink(link, trace);
  } catch (error) { trace?.push(`follow error ${error}`); }
  let pin = mapCoordinates(target);
  if (pin) return { target, pin };
  let title = '';
  try {
    const response = await fetch(target, { headers: BROWSER, signal: AbortSignal.timeout(5000) });
    trace?.push(`page ${response.status} ${response.url}`);
    if (response.ok) {
      const html = (await response.text()).slice(0, 2_000_000);
      pin = pinInPage(html);
      title = titleInPage(html);
      trace?.push(`page ${html.length} pin=${JSON.stringify(pin)} title=${title} camera=${html.match(/APP_INITIALIZATION_STATE=.{0,120}/)?.[0] ?? ''} og=${html.match(/og:image"[^>]{0,300}/)?.[0] ?? ''} head=${html.slice(0, 800)}`);
    } else await response.body?.cancel();
  } catch (error) { trace?.push(`page error ${error}`); }
  if (pin) return { target, pin, title };
  const url = new URL(target);
  // A link to a place id only (「?cid=…」) carries no words; the page's title does.
  const query = url.searchParams.get('q') ?? url.searchParams.get('query') ?? (decodeURIComponent(url.pathname.match(/\/place\/([^/@]+)/)?.[1] ?? '').replace(/\+/g, ' ') || title);
  try {
    if (query.trim()) pin = await geocode(query.trim());
    trace?.push(`geocode ${query} -> ${JSON.stringify(pin)}`);
  } catch (error) { trace?.push(`geocode error ${query} ${error}`); }
  return { target, pin, title };
}
/** Coordinates from a pasted Google Maps link (see locateMapLink). */
async function placeCoordinates(location: string): Promise<Coordinates | null> {
  const direct = mapCoordinates(location);
  if (direct) return direct;
  const link = registeredGoogleMapsUrl(location.trim());
  return link ? (await locateMapLink(link)).pin : null;
}
/** A pasted Google Maps link → the place's name and pin. */
async function resolveMapLink(env: Env, text: string) {
  const link = registeredGoogleMapsUrl(text.trim());
  if (!link) return json({ error: 'Googleマップのリンクを入力してください' }, 400);
  // TEMPORARY (2026-10-07): staging keeps a trace of how a link was read, to see what Google answers the Worker.
  const trace = env.ALLOWED_ORIGINS?.includes('staging') ? [] as string[] : undefined;
  const { target, pin, title } = await locateMapLink(link, trace);
  if (trace) {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS link_traces (at INTEGER NOT NULL DEFAULT (unixepoch()), link TEXT, trace TEXT)').run();
    await env.DB.prepare('INSERT INTO link_traces (link, trace) VALUES (?, ?)').bind(link, trace.join('\n\n')).run();
  }
  const name = placeNameFromLink(target) ?? (title ? title.split(/[,、]/)[0].trim() || null : null);
  return json({ link, name, lat: pin?.lat ?? null, lng: pin?.lng ?? null });
}
/**
 * Places saved without a pin (short share links, iPhone links, older rows)
 * are resolved a few at a time while the list is read: one after another
 * (OpenStreetMap asks for one request a second) and within a few seconds,
 * so the list never waits long. A link that gave nothing is skipped for a
 * day. Never fails the list.
 */
/** When link reading last got better: misses from before it are tried again (Android links, 2026-10-07). */
const RESOLVER_SINCE = 1791367986;
async function fillMissingCoordinates(env: Env, tripId: string, rows: Record<string, unknown>[]) {
  const misses = new Set(((await env.DB.prepare(`SELECT m.place_id FROM place_coordinate_misses m JOIN places p ON p.id = m.place_id
    WHERE p.trip_id = ? AND m.location = p.location AND m.tried_at > MAX(unixepoch() - 86400, ?)`).bind(tripId, RESOLVER_SINCE).all()).results).map((row) => row.place_id));
  const missing = rows
    .filter((row) => row.lat == null && typeof row.location === 'string' && registeredGoogleMapsUrl(row.location) && !misses.has(row.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  const deadline = Date.now() + 6000;
  for (const row of missing) {
    if (Date.now() > deadline) break;
    try {
      const location = row.location as string;
      const coordinates = await placeCoordinates(location);
      if (!coordinates) {
        await env.DB.prepare(`INSERT INTO place_coordinate_misses (place_id, location) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ?)
          ON CONFLICT(place_id) DO UPDATE SET location = excluded.location, tried_at = unixepoch()`).bind(row.id, location, row.id, tripId).run();
        continue;
      }
      // Only while the place still has this link; a newer save keeps its own pin.
      await env.DB.prepare(`INSERT INTO place_coordinates (place_id, lat, lng)
        SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ? AND location = ?)
        ON CONFLICT(place_id) DO NOTHING`).bind(row.id, coordinates.lat, coordinates.lng, row.id, tripId, location).run();
      row.lat = coordinates.lat;
      row.lng = coordinates.lng;
    } catch { /* leave it without a pin; the next request tries again */ }
  }
}
async function placesRoute(request: Request, env: Env, user: User, tripId: string, placeId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  if (!placeId && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT p.id, p.title, p.note, p.opening_hours AS openingHours, COALESCE(d.reservation_status, p.reservation_status) AS reservationStatus, p.location, p.updated_at AS updatedAt, COALESCE(d.reference_links, '[]') AS referenceLinks, l.item_id AS itineraryItemId, c.lat, c.lng FROM places p LEFT JOIN place_itinerary_links l ON l.place_id = p.id LEFT JOIN place_details d ON d.place_id = p.id LEFT JOIN place_coordinates c ON c.place_id = p.id WHERE p.trip_id = ? ORDER BY p.updated_at DESC, p.id`).bind(tripId).all();
    await fillMissingCoordinates(env, tripId, rows.results);
    return json({ places: rows.results.map((row) => ({ ...row, referenceLinks: JSON.parse(row.referenceLinks as string) })) });
  }
  if (placeId && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM places WHERE trip_id = ? AND id = ?').bind(tripId, placeId).run();
    return new Response(null, { status: 204 });
  }
  if ((!placeId && request.method === 'POST') || (placeId && request.method === 'PATCH')) {
    const body = await request.json().catch(() => null);
    const fields = isObject(body) ? placeFields(body) : null;
    if (!fields) return json({ error: '場所の名前と入力内容を確認してください' }, 400);
    const { title, note, openingHours, reservationStatus, location, referenceLinks } = fields;
    if (fields.itineraryItemId) {
      const item = await env.DB.prepare('SELECT trip_id FROM itinerary_items WHERE id = ?').bind(fields.itineraryItemId).first<{ trip_id: string }>();
      if (item && item.trip_id !== tripId) return json({ error: 'この旅行の予定を選択してください' }, 400);
      // A queued place edit may refer to a plan deleted on another device.
      if (!item) fields.itineraryItemId = null;
    }
    const legacyReservationStatus = reservationStatus === 'unavailable' ? 'not_needed' : reservationStatus;
    const id = placeId ?? idField(isObject(body) ? body.id : undefined) ?? crypto.randomUUID();
    const statement = placeId
      ? await env.DB.prepare('UPDATE places SET title=?, note=?, opening_hours=?, reservation_status=?, location=?, updated_by=?, updated_at=unixepoch() WHERE id=? AND trip_id=?').bind(title, note, openingHours, legacyReservationStatus, location, user.id, id, tripId)
      : await env.DB.prepare(`INSERT INTO places (id, trip_id, title, note, opening_hours, reservation_status, location, updated_by) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, note=excluded.note, opening_hours=excluded.opening_hours, reservation_status=excluded.reservation_status, location=excluded.location, updated_by=excluded.updated_by, updated_at=unixepoch() WHERE places.trip_id=excluded.trip_id`).bind(id, tripId, title, note, openingHours, legacyReservationStatus, location, user.id);
    const itemLink = env.DB.prepare(`INSERT INTO place_itinerary_links (place_id, item_id)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ?)
      ON CONFLICT(place_id) DO UPDATE SET item_id = CASE WHEN ? THEN excluded.item_id ELSE place_itinerary_links.item_id END
    `).bind(id, fields.itineraryItemId ?? null, id, tripId, fields.itineraryItemId !== undefined ? 1 : 0);
    const linksJson = referenceLinks === undefined ? null : JSON.stringify(referenceLinks);
    // Re-read coordinates only when the link changed, so a failed redirect never drops a known pin.
    const previous = await env.DB.prepare('SELECT p.location, c.lat, c.lng FROM places p LEFT JOIN place_coordinates c ON c.place_id = p.id WHERE p.id = ? AND p.trip_id = ?').bind(id, tripId).first<{ location: string; lat: number | null; lng: number | null }>();
    const coordinates = previous && previous.location === location && previous.lat != null && previous.lng != null
      ? { lat: previous.lat, lng: previous.lng }
      : await placeCoordinates(location);
    const coordinateStatement = coordinates
      ? env.DB.prepare(`INSERT INTO place_coordinates (place_id, lat, lng)
          SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ?)
          ON CONFLICT(place_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng`).bind(id, coordinates.lat, coordinates.lng, id, tripId)
      : env.DB.prepare('DELETE FROM place_coordinates WHERE place_id = ? AND EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ?)').bind(id, id, tripId);
    const [result] = await env.DB.batch([
      statement,
      itemLink,
      coordinateStatement,
      env.DB.prepare(`INSERT INTO place_details (place_id, reference_links, reservation_status)
        SELECT ?, COALESCE(?, '[]'), ? WHERE EXISTS (SELECT 1 FROM places WHERE id = ? AND trip_id = ?)
        ON CONFLICT(place_id) DO UPDATE SET reference_links = COALESCE(?, place_details.reference_links), reservation_status = excluded.reservation_status
      `).bind(id, linksJson, reservationStatus === 'unavailable' ? reservationStatus : null, id, tripId, linksJson),
    ]);
    if (!result.meta.changes) return json({ error: '場所が見つからないか、IDが競合しました' }, placeId ? 404 : 409);
    return json({ place: { id, ...fields, lat: coordinates?.lat ?? null, lng: coordinates?.lng ?? null } }, placeId ? 200 : 201);
  }
  return json({ error: 'Not found' }, 404);
}

async function notesRoute(request: Request, env: Env, user: User, tripId: string, noteId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  if (request.method === 'GET' && !noteId) {
    const rows = await env.DB.prepare(`SELECT n.id, n.body, n.pinned, n.updated_by AS updatedBy, n.updated_at AS updatedAt, COALESCE(d.title, '') AS title, d.content, l.place_id AS placeId
      FROM travel_notes n LEFT JOIN note_details d ON d.note_id=n.id LEFT JOIN note_places l ON l.note_id=n.id WHERE n.trip_id=? ORDER BY n.updated_at DESC, n.id`).bind(tripId).all();
    return json({ notes: rows.results.map(({ content, pinned, ...row }) => ({ ...row, pinned: pinned === 1, content: content ? JSON.parse(String(content)) : null })) });
  }
  if (request.method === 'DELETE' && noteId) {
    await env.DB.prepare('DELETE FROM travel_notes WHERE id=? AND trip_id=?').bind(noteId, tripId).run();
    return new Response(null, { status: 204 });
  }
  if (request.method === 'POST' && !noteId) {
    const body = await request.json().catch(() => null);
    if (!isObject(body) || !idField(body.id) || typeof body.body !== 'string' || body.body.length > NOTE_BODY_LIMIT) return json({ error: 'メモは50,000文字以内で入力してください' }, 400);
    if (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > NOTE_TITLE_LIMIT)) return json({ error: 'タイトルは120文字以内で入力してください' }, 400);
    if (body.content != null && !validNoteContent(body.content)) return json({ error: 'メモの書式を確認してください' }, 400);
    // Older clients omit pinned/placeId; omission keeps what is stored.
    if (body.pinned !== undefined && typeof body.pinned !== 'boolean') return json({ error: 'ピン留めの値を確認してください' }, 400);
    if (body.placeId != null && !idField(body.placeId)) return json({ error: '場所を確認してください' }, 400);
    const pinned = body.pinned === undefined ? null : body.pinned ? 1 : 0;
    const placeId = body.placeId === undefined ? undefined : body.placeId === null ? null : (await env.DB.prepare('SELECT id FROM places WHERE id=? AND trip_id=?').bind(body.placeId, tripId).first<{ id: string }>())?.id ?? null;
    const plain = body.content == null ? body.body : notePlainText(body.content);
    if (plain.length > NOTE_BODY_LIMIT) return json({ error: 'メモは50,000文字以内で入力してください' }, 400);
    const content = body.content == null ? null : JSON.stringify(body.content);
    const [result] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO travel_notes (id,trip_id,body,pinned,updated_by) VALUES (?,?,?,COALESCE(?,0),?)
        ON CONFLICT(id) DO UPDATE SET body=excluded.body,pinned=COALESCE(?,travel_notes.pinned),updated_by=excluded.updated_by,updated_at=unixepoch()
        WHERE travel_notes.trip_id=excluded.trip_id`).bind(body.id, tripId, plain, pinned, user.id, pinned),
      env.DB.prepare(`INSERT INTO note_details (note_id,title,content)
        SELECT ?,COALESCE(?,''),? WHERE EXISTS (SELECT 1 FROM travel_notes WHERE id=? AND trip_id=?)
        ON CONFLICT(note_id) DO UPDATE SET title=COALESCE(?,note_details.title),content=excluded.content
      `).bind(body.id, body.title ?? null, content, body.id, tripId, body.title ?? null),
      ...(placeId === undefined ? [] : [env.DB.prepare(`INSERT INTO note_places (note_id,place_id)
        SELECT ?,? WHERE EXISTS (SELECT 1 FROM travel_notes WHERE id=? AND trip_id=?)
        ON CONFLICT(note_id) DO UPDATE SET place_id=excluded.place_id`).bind(body.id, placeId, body.id, tripId)]),
    ]);
    if (!result.meta.changes) return json({ error: 'メモのIDが競合しました' }, 409);
    return json({ id: body.id }, 201);
  }
  return json({ error: 'Not found' }, 404);
}

async function listItems(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`SELECT i.id, i.day, i.time, i.kind, i.title, i.note, i.updated_by AS updatedBy, i.updated_at AS updatedAt, d.details FROM itinerary_items i LEFT JOIN itinerary_details d ON d.item_id = i.id WHERE i.trip_id = ? ORDER BY i.day, i.time, i.id`)
    .bind(tripId)
    .all();
  return json({ items: result.results.map(({ details, ...item }) => ({ ...item, ...(details ? { details: JSON.parse(String(details)) } : {}) })) });
}

function parseItineraryDetails(value: unknown, day: string, time: string): ItineraryDetails | null | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value) || typeof value.location !== 'string' || typeof value.endDay !== 'string' || typeof value.endTime !== 'string' || !itineraryCategories.some((category) => category.value === value.category)) return null;
  const location = textField(value.location, 160);
  const endDay = value.endDay === '' ? '' : dateField(value.endDay);
  const endTime = textField(value.endTime, 5);
  if (location === null || (endDay && !validDate(endDay)) || endDay === null || endTime === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(endTime) || Boolean(endDay) !== Boolean(endTime)) return null;
  const details: ItineraryDetails = { category: value.category as ItineraryDetails['category'], location, endDay, endTime };
  if (value.category === 'transport') {
    const transport = value.transport;
    if (!isObject(transport) || typeof transport.origin !== 'string' || typeof transport.destination !== 'string' || !transportModes.some((mode) => mode.value === transport.mode)) return null;
    const origin = textField(transport.origin, 160), destination = textField(transport.destination, 160);
    const duration = transport.durationMinutes;
    const afterKey = transport.afterKey;
    if (afterKey !== undefined && (typeof afterKey !== 'string' || afterKey.length > 100 || !/^(item|booking)-[a-zA-Z0-9-]+$/.test(afterKey))) return null;
    if (origin === null || destination === null || (duration !== undefined && (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 10080))) return null;
    details.transport = { mode: transport.mode as NonNullable<ItineraryDetails['transport']>['mode'], origin, destination, ...(duration === undefined ? {} : { durationMinutes: duration as number }), ...(afterKey === undefined ? {} : { afterKey: afterKey as string }) };
  } else if (value.transport !== undefined) return null;
  // Optional and additive: rows without these keep parsing as before.
  const stay = value.stay;
  if (stay !== undefined) {
    if (!isObject(stay) || typeof stay.bookingId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(stay.bookingId) || (stay.endpoint !== 'start' && stay.endpoint !== 'end')) return null;
    details.stay = { bookingId: stay.bookingId, endpoint: stay.endpoint };
  }
  if (value.ownPlace !== undefined) {
    if (typeof value.ownPlace !== 'boolean') return null;
    if (value.ownPlace) details.ownPlace = true;
  }
  return itineraryDetailsError(day, time, details) ? null : details;
}

function itineraryDetailsStatement(env: Env, itemId: string, tripId: string, details?: ItineraryDetails) {
  return env.DB.prepare(`INSERT INTO itinerary_details (item_id, details)
    SELECT ?, ? WHERE EXISTS (SELECT 1 FROM itinerary_items WHERE id = ? AND trip_id = ?)
    ON CONFLICT(item_id) DO UPDATE SET details = COALESCE(excluded.details, itinerary_details.details)`)
    .bind(itemId, details === undefined ? null : JSON.stringify(details), itemId, tripId);
}

function itineraryFields(body: Record<string, unknown>) {
  const day = dateField(body.day);
  const time = textField(body.time, 5);
  const kind = textField(body.kind, 32) || '予定';
  const title = textField(body.title, 160, true);
  const note = textField(body.note, 4000);
  if (!day || time === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time) || !kind || !title || note === null) return null;
  const details = parseItineraryDetails(body.details, day, time);
  if (details === null) return null;
  return { day, time, kind, title, note, ...(details === undefined ? {} : { details }) };
}

async function createItem(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? itineraryFields(body) : null;
  if (!fields) return json({ error: '正しい旅程を入力してください' }, 400);
  const id = idField(isObject(body) ? body.id : undefined) ?? crypto.randomUUID();
  const statement = env.DB.prepare(`
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
    .bind(id, tripId, fields.day, fields.time, fields.kind, fields.title, fields.note, user.id);
  const [result] = await env.DB.batch([statement, itineraryDetailsStatement(env, id, tripId, fields.details)]);
  if (!result.meta.changes) return json({ error: '旅程IDが競合しました' }, 409);
  return json({ item: { id, ...fields, updatedBy: user.id } }, 201);
}

async function updateItem(request: Request, env: Env, user: User, tripId: string, itemId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? itineraryFields(body) : null;
  if (!fields) return json({ error: '正しい旅程を入力してください' }, 400);
  const statement = env.DB.prepare(`UPDATE itinerary_items SET day = ?, time = ?, kind = ?, title = ?, note = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ? AND trip_id = ?`)
    .bind(fields.day, fields.time, fields.kind, fields.title, fields.note, user.id, itemId, tripId);
  const [result] = await env.DB.batch([statement, itineraryDetailsStatement(env, itemId, tripId, fields.details)]);
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
  const detail = textField(body.detail, kind === 'hotel' ? 2000 : 500);
  const location = body.location === undefined ? undefined : textField(body.location, 2000);
  if (location === null || (location && !mapUrl(location))) return null;
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
  const durationMinutes = body.durationMinutes;
  if (durationMinutes != null && (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080)) return null;
  if (body.placeId != null && !idField(body.placeId)) return null;
  if (!kind || !bookingKinds.has(kind) || !title || detail === null || origin === null || originCode === null || destination === null || destinationCode === null || !day || !endDay || (kind !== 'flight' && endDay < day) || time === null || endTime === null || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time) || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(endTime) || confirmationCode === null || note === null) return null;
  return { kind, title, detail, ...(location !== undefined ? { location } : {}), origin, originCode: originCode.toUpperCase(), destination, destinationCode: destinationCode.toUpperCase(), day, time, endDay, endTime, confirmationCode, note, ...(durationMinutes === undefined ? {} : { durationMinutes: durationMinutes as number | null }) };
}

/** Older clients omit placeId and keep the stored link; a place of another trip links nothing. */
async function bookingPlace(env: Env, tripId: string, body: Record<string, unknown>): Promise<string | null | undefined> {
  if (body.placeId === undefined) return undefined;
  if (body.placeId === null) return null;
  return (await env.DB.prepare('SELECT id FROM places WHERE id = ? AND trip_id = ?').bind(body.placeId, tripId).first<{ id: string }>())?.id ?? null;
}

async function listBookings(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  return json({ bookings: await readBookings(env, tripId) });
}

async function readBookings(env: Env, tripId: string) {
  const result = await env.DB.prepare(`
    SELECT b.id, b.kind, b.title, b.detail, b.day, b.time,
           COALESCE(l.location, CASE WHEN b.kind = 'hotel' THEN b.detail ELSE '' END) AS location,
           COALESCE(d.origin, '') AS origin, COALESCE(d.origin_code, '') AS originCode,
           COALESCE(d.destination, '') AS destination, COALESCE(d.destination_code, '') AS destinationCode,
           COALESCE(NULLIF(d.end_day, ''), b.day) AS endDay, COALESCE(d.end_time, '') AS endTime,
           b.confirmation_code AS confirmationCode, b.note, b.updated_by AS updatedBy, b.updated_at AS updatedAt,
           t.duration_minutes AS durationMinutes, COALESCE(c.mode, 'auto') AS connectionMode, c.departure_booking_id AS nextFlightId,
           p.place_id AS placeId
    FROM bookings b LEFT JOIN booking_details d ON d.booking_id = b.id
    LEFT JOIN booking_locations l ON l.booking_id = b.id
    LEFT JOIN booking_places p ON p.booking_id = b.id
    LEFT JOIN booking_durations t ON t.booking_id = b.id
    LEFT JOIN flight_connection_preferences c ON c.arrival_booking_id = b.id
    WHERE b.trip_id = ? ORDER BY b.day, b.time, b.id
  `)
    .bind(tripId)
    .all<FlightConnectionInput>();
  return result.results;
}

async function updateFlightConnection(request: Request, env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  if (!isObject(body) || !['auto', 'manual', 'none'].includes(String(body.mode))) return json({ error: '乗り継ぎの設定を確認してください' }, 400);
  const bookings = await readBookings(env, tripId);
  const arrival = bookings.find((booking) => booking.id === bookingId && booking.kind === 'flight');
  if (!arrival) return json({ error: '航空便が見つかりません' }, 404);
  const mode = body.mode as 'auto' | 'manual' | 'none';
  const nextFlightId = mode === 'manual' ? idField(body.nextFlightId) : null;
  if (mode === 'manual') {
    const departure = bookings.find((booking) => booking.id === nextFlightId);
    if (!departure || !connectionBetween(arrival, departure)) return json({ error: '同じ空港から到着後に出発する便を選んでください' }, 400);
    if (bookings.some((booking) => booking.id !== bookingId && booking.connectionMode === 'manual' && booking.nextFlightId === nextFlightId)) {
      return json({ error: 'この便は別の便の乗り継ぎ先です。先にそちらの紐づけを変更してください' }, 409);
    }
    if (createsFlightConnectionCycle(bookings, bookingId, departure.id)) {
      return json({ error: '便が循環するため紐づけできません。日時を確認してください' }, 400);
    }
  }
  if (mode === 'auto') {
    await env.DB.prepare('DELETE FROM flight_connection_preferences WHERE arrival_booking_id = ?').bind(bookingId).run();
  } else {
    try {
      await env.DB.prepare(`
        INSERT INTO flight_connection_preferences (arrival_booking_id, departure_booking_id, mode, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(arrival_booking_id) DO UPDATE SET departure_booking_id = excluded.departure_booking_id,
          mode = excluded.mode, updated_by = excluded.updated_by, updated_at = unixepoch()
      `).bind(bookingId, nextFlightId, mode, user.id).run();
    } catch (cause) {
      if (cause instanceof Error && /UNIQUE|FOREIGN KEY/.test(cause.message)) return json({ error: '便の情報が変更されました。もう一度選び直してください' }, 409);
      throw cause;
    }
  }
  return json({ connectionMode: mode, nextFlightId });
}

async function createBooking(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? bookingFields(body) : null;
  if (!fields) return json({ error: '正しい予約情報を入力してください' }, 400);
  const placeId = await bookingPlace(env, tripId, body as Record<string, unknown>);
  const id = idField(isObject(body) ? body.id : undefined) ?? crypto.randomUUID();
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
    ...(fields.location === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_locations (booking_id, location)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET location = excluded.location
    `).bind(id, fields.location, id, tripId)]),
    ...(fields.durationMinutes === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_durations (booking_id, duration_minutes)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET duration_minutes = excluded.duration_minutes
    `).bind(id, fields.durationMinutes, id, tripId)]),    ...(placeId === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_places (booking_id, place_id)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET place_id = excluded.place_id
    `).bind(id, placeId, id, tripId)]),
  ]);
  if (!bookingResult.meta.changes) return json({ error: '予約IDが競合しました' }, 409);
  return json({ booking: { id, ...fields, ...(placeId === undefined ? {} : { placeId }), updatedBy: user.id } }, 201);
}

async function updateBooking(request: Request, env: Env, user: User, tripId: string, bookingId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? bookingFields(body) : null;
  if (!fields) return json({ error: '正しい予約情報を入力してください' }, 400);
  const placeId = await bookingPlace(env, tripId, body as Record<string, unknown>);
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
    ...(fields.location === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_locations (booking_id, location)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET location = excluded.location
    `).bind(bookingId, fields.location, bookingId, tripId)]),
    ...(fields.durationMinutes === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_durations (booking_id, duration_minutes)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET duration_minutes = excluded.duration_minutes
    `).bind(bookingId, fields.durationMinutes, bookingId, tripId)]),    ...(placeId === undefined ? [] : [env.DB.prepare(`
      INSERT INTO booking_places (booking_id, place_id)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND trip_id = ?)
      ON CONFLICT(booking_id) DO UPDATE SET place_id = excluded.place_id
    `).bind(bookingId, placeId, bookingId, tripId)]),
  ]);
  return bookingResult.meta.changes ? json({ booking: { id: bookingId, ...fields, ...(placeId === undefined ? {} : { placeId }), updatedBy: user.id } }) : json({ error: '予約が見つかりません' }, 404);
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

async function importBookings(request: Request, env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const trip = await env.DB.prepare('SELECT starts_on AS startsOn, ends_on AS endsOn FROM trips WHERE id = ?').bind(tripId).first<{ startsOn: string; endsOn: string }>();
  if (!trip) return json({ error: '旅行が見つかりません' }, 404);
  return startBookingImport(request, env, trip);
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

type PackingKind = 'each' | 'one' | 'mine';
const packingKinds = new Set<PackingKind>(['each', 'one', 'mine']);

type PackingRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  packed: number;
  assignee: string;
  shared: number;
  kind: PackingKind;
  marks: string | null;
  updatedBy: string;
  updatedAt: number;
};

function packingFields(body: Record<string, unknown>) {
  const name = textField(body.name, 120, true);
  const category = textField(body.category, 40) || 'その他';
  const quantity = typeof body.quantity === 'number' && Number.isInteger(body.quantity) ? body.quantity : 1;
  const packed = typeof body.packed === 'boolean' ? body.packed : false;
  if (!name || !category || quantity < 1 || quantity > 99) return null;
  const assignee = body.assignee === undefined ? undefined : typeof body.assignee === 'string' ? textField(body.assignee, 80) : null;
  const shared = body.shared;
  if (assignee === null || (shared !== undefined && typeof shared !== 'boolean')) return null;
  // Older clients omit the kind; the stored kind (or legacy 'one') is kept.
  const kind = body.kind === undefined ? undefined : packingKinds.has(body.kind as PackingKind) ? body.kind as PackingKind : null;
  if (kind === null) return null;
  return { name, category, quantity, packed, assignee, shared, kind };
}

/** Each member sees their own tick as `packed`; みんな各自 also lists who has packed. */
function packingView(row: PackingRow, userId: string) {
  const { marks, ...item } = row;
  const packedBy = row.kind === 'each' ? (marks ?? '').split('\n').filter(Boolean).sort() : [];
  return { ...item, packed: row.kind === 'each' ? packedBy.includes(userId) : Boolean(row.packed), shared: Boolean(row.shared), packedBy };
}

const packingSelect = `
  SELECT p.id, p.name, p.category, p.quantity, p.packed, p.updated_by AS updatedBy, p.updated_at AS updatedAt,
    COALESCE(d.assignee, '') AS assignee, COALESCE(d.shared, 0) AS shared, COALESCE(k.kind, 'one') AS kind,
    (SELECT group_concat(m.user_id, char(10)) FROM packing_marks m
      JOIN trip_members tm ON tm.trip_id = p.trip_id AND tm.user_id = m.user_id WHERE m.item_id = p.id) AS marks
  FROM packing_items p LEFT JOIN packing_details d ON d.item_id = p.id LEFT JOIN packing_kinds k ON k.item_id = p.id`;
// 自分だけ items stay on the server for their owner only, never for the rest of the trip.
// One whose owner's account is gone (owner_id NULL) goes to the trip's owner so it can be deleted.
const packingVisible = `(COALESCE(k.kind, 'one') <> 'mine' OR k.owner_id = ?
  OR (k.owner_id IS NULL AND EXISTS (SELECT 1 FROM trip_members o WHERE o.trip_id = p.trip_id AND o.user_id = ? AND o.role = 'owner')))`;

async function listPacking(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`${packingSelect}
    WHERE p.trip_id = ? AND ${packingVisible} ORDER BY p.rowid
  `).bind(tripId, user.id, user.id).all<PackingRow>();
  return json({ items: result.results.map((item) => packingView(item, user.id)) });
}

async function validatePackingAssignee(env: Env, tripId: string, assignee: string | undefined, itemId: string) {
  if (!assignee) return null;
  if (assignee.startsWith('member:') && await memberRole(env, tripId, assignee.slice(7))) return null;
  const existing = await env.DB.prepare(`SELECT d.assignee FROM packing_details d JOIN packing_items p ON p.id = d.item_id WHERE p.id = ? AND p.trip_id = ?`).bind(itemId, tripId).first<{ assignee: string }>();
  if (existing?.assignee === assignee) return null;
  return json({ error: 'この旅行のメンバーから担当を選んでください' }, 400);
}

async function writePackingItem(request: Request, env: Env, user: User, tripId: string, itemId?: string) {
  const role = await memberRole(env, tripId, user.id);
  if (!role) return json({ error: 'この旅行を編集する権限がありません' }, 403);
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? packingFields(body) : null;
  if (!fields) return json({ error: '正しい持ち物情報を入力してください' }, 400);
  const id = itemId ?? idField(isObject(body) ? body.id : undefined) ?? crypto.randomUUID();
  const existing = await env.DB.prepare(`SELECT p.packed, COALESCE(d.assignee, '') AS assignee, COALESCE(k.kind, 'one') AS kind, k.owner_id AS ownerId
    FROM packing_items p LEFT JOIN packing_details d ON d.item_id = p.id LEFT JOIN packing_kinds k ON k.item_id = p.id WHERE p.id = ?`)
    .bind(id).first<{ packed: number; assignee: string; kind: PackingKind; ownerId: string | null }>();
  // Someone else's private item does not exist for this user.
  // An owner-less one (its owner's account was deleted) belongs to the trip's owner.
  if (existing?.kind === 'mine' && existing.ownerId !== user.id && !(existing.ownerId === null && role === 'owner')) return json({ error: '持ち物が見つからないか、IDが競合しました' }, itemId ? 404 : 409);
  const invalidAssignee = await validatePackingAssignee(env, tripId, fields.assignee, id);
  if (invalidAssignee) return invalidAssignee;
  const kind = fields.kind ?? existing?.kind ?? 'one';
  const carrier = fields.assignee ?? existing?.assignee ?? '';
  // 1つでいい: only the member who took it ticks it. A stale or foreign tick is
  // ignored rather than rejected so an offline queue is never blocked by it.
  // A carrier who has left the trip holds nothing: anyone ticks it then.
  const held = kind === 'one' && existing && carrier.startsWith('member:') && carrier !== `member:${user.id}`
    && Boolean(await memberRole(env, tripId, carrier.slice(7)));
  const packed = held
    ? Boolean(existing.packed)
    : fields.packed;
  const statement = itemId
    ? env.DB.prepare(`UPDATE packing_items SET name = ?, category = ?, quantity = ?, packed = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ? AND trip_id = ?`)
      .bind(fields.name, fields.category, fields.quantity, packed ? 1 : 0, user.id, id, tripId)
    : env.DB.prepare(`INSERT INTO packing_items (id, trip_id, name, category, quantity, packed, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, quantity = excluded.quantity,
        packed = excluded.packed, updated_by = excluded.updated_by, updated_at = unixepoch()
      WHERE packing_items.trip_id = excluded.trip_id`)
      .bind(id, tripId, fields.name, fields.category, fields.quantity, packed ? 1 : 0, user.id);
  // Omitted fields from older/offline clients must not clear the assignment.
  const assignee = fields.assignee ?? null;
  const shared = fields.shared === undefined ? null : fields.shared ? 1 : 0;
  const inTrip = 'EXISTS (SELECT 1 FROM packing_items WHERE id = ? AND trip_id = ?)';
  const statements = [
    statement,
    env.DB.prepare(`INSERT INTO packing_details (item_id, assignee, shared)
      SELECT ?, COALESCE(?, ''), COALESCE(?, 0) WHERE ${inTrip}
      ON CONFLICT(item_id) DO UPDATE SET assignee = COALESCE(?, packing_details.assignee), shared = COALESCE(?, packing_details.shared)`)
      .bind(id, assignee, shared, id, tripId, assignee, shared),
  ];
  if (fields.kind)
    statements.push(env.DB.prepare(`INSERT INTO packing_kinds (item_id, kind, owner_id) SELECT ?, ?, ? WHERE ${inTrip}
      ON CONFLICT(item_id) DO UPDATE SET kind = excluded.kind, owner_id = excluded.owner_id`)
      .bind(id, fields.kind, fields.kind === 'mine' ? user.id : null, id, tripId));
  // みんな各自: `packed` is the caller's own tick.
  if (kind === 'each')
    statements.push(packed
      ? env.DB.prepare(`INSERT INTO packing_marks (item_id, user_id) SELECT ?, ? WHERE ${inTrip} ON CONFLICT DO NOTHING`).bind(id, user.id, id, tripId)
      : env.DB.prepare('DELETE FROM packing_marks WHERE item_id = ? AND user_id = ? AND ' + inTrip).bind(id, user.id, id, tripId));
  const [result] = await env.DB.batch(statements);
  if (!result.meta.changes) return json({ error: '持ち物が見つからないか、IDが競合しました' }, itemId ? 404 : 409);
  const saved = await env.DB.prepare(`${packingSelect} WHERE p.id = ? AND p.trip_id = ?`).bind(id, tripId).first<PackingRow>();
  return json({ item: { ...(saved ? packingView(saved, user.id) : { id, ...fields, kind }), updatedBy: user.id } }, itemId ? 200 : 201);
}

const createPackingItem = (request: Request, env: Env, user: User, tripId: string) => writePackingItem(request, env, user, tripId);
const updatePackingItem = (request: Request, env: Env, user: User, tripId: string, itemId: string) => writePackingItem(request, env, user, tripId, itemId);

async function deletePackingItem(env: Env, user: User, tripId: string, itemId: string) {
  const role = await memberRole(env, tripId, user.id);
  if (!role) return json({ error: 'この旅行を編集する権限がありません' }, 403);
  const result = await env.DB.prepare(`DELETE FROM packing_items WHERE id = ? AND trip_id = ?
    AND NOT EXISTS (SELECT 1 FROM packing_kinds k WHERE k.item_id = packing_items.id AND k.kind = 'mine' AND k.owner_id IS NOT ?
      AND NOT (k.owner_id IS NULL AND ? = 'owner'))`)
    .bind(itemId, tripId, user.id, role).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: '持ち物が見つかりません' }, 404);
}

type TaskKind = 'each' | 'one';
const taskKinds = new Set<TaskKind>(['each', 'one']);

type TaskRow = {
  id: string;
  title: string;
  dueOn: string;
  assignee: string;
  done: number;
  kind: TaskKind;
  marks: string | null;
  updatedBy: string;
  updatedAt: number;
};

function taskFields(body: Record<string, unknown>) {
  const title = textField(body.title, 160, true);
  const dueOn = body.dueOn === '' ? '' : dateField(body.dueOn);
  const assignee = textField(body.assignee, 80);
  const done = typeof body.done === 'boolean' ? body.done : false;
  if (!title || dueOn === null || assignee === null) return null;
  // Older clients omit the kind; the stored kind (or 'one') is kept.
  const kind = body.kind === undefined ? undefined : taskKinds.has(body.kind as TaskKind) ? body.kind as TaskKind : null;
  if (kind === null) return null;
  return { title, dueOn, assignee, done, kind };
}

/** Each member sees their own tick as `done`; 全員がやる also lists who has done it. */
function taskView(row: TaskRow, userId: string) {
  const { marks, ...task } = row;
  const doneBy = row.kind === 'each' ? (marks ?? '').split('\n').filter(Boolean).sort() : [];
  return { ...task, done: row.kind === 'each' ? doneBy.includes(userId) : Boolean(row.done), doneBy };
}

const taskSelect = `
  SELECT t.id, t.title, t.due_on AS dueOn, t.assignee, t.done, t.updated_by AS updatedBy, t.updated_at AS updatedAt,
    COALESCE(k.kind, 'one') AS kind,
    (SELECT group_concat(m.user_id, char(10)) FROM task_marks m
      JOIN trip_members tm ON tm.trip_id = t.trip_id AND tm.user_id = m.user_id WHERE m.task_id = t.id) AS marks
  FROM travel_tasks t LEFT JOIN task_kinds k ON k.task_id = t.id`;

async function listTasks(env: Env, user: User, tripId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare(`${taskSelect}
    WHERE t.trip_id = ? ORDER BY t.done, CASE WHEN t.due_on = '' THEN 1 ELSE 0 END, t.due_on, t.title, t.id
  `).bind(tripId).all<TaskRow>();
  return json({ tasks: result.results.map((task) => taskView(task, user.id)) });
}

async function validateAssignee(env: Env, tripId: string, assignee: string, taskId: string | null) {
  if (!assignee) return null;
  if (assignee.startsWith('member:') && await memberRole(env, tripId, assignee.slice(7))) return null;
  const existing = taskId ? await env.DB.prepare('SELECT assignee FROM travel_tasks WHERE id = ? AND trip_id = ?').bind(taskId, tripId).first<{ assignee: string }>() : null;
  if (existing?.assignee === assignee) return null;
  return json({ error: 'この旅行のメンバーから担当を選んでください' }, 400);
}

async function writeTask(request: Request, env: Env, user: User, tripId: string, taskId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const fields = isObject(body) ? taskFields(body) : null;
  if (!fields) return json({ error: '正しいタスク情報を入力してください' }, 400);
  const id = taskId ?? idField(isObject(body) ? body.id : undefined) ?? crypto.randomUUID();
  const invalidAssignee = await validateAssignee(env, tripId, fields.assignee, taskId ?? id);
  if (invalidAssignee) return invalidAssignee;
  const stored = await env.DB.prepare('SELECT kind FROM task_kinds WHERE task_id = ?').bind(id).first<{ kind: TaskKind }>();
  const kind = fields.kind ?? stored?.kind ?? 'one';
  // 全員がやる: `done` is the caller's own tick; the shared column stays 0.
  const done = kind === 'each' ? 0 : fields.done ? 1 : 0;
  const statement = taskId
    ? env.DB.prepare(`UPDATE travel_tasks SET title = ?, due_on = ?, assignee = ?, done = ?, updated_by = ?, updated_at = unixepoch()
      WHERE id = ? AND trip_id = ?`).bind(fields.title, fields.dueOn, fields.assignee, done, user.id, id, tripId)
    : env.DB.prepare(`INSERT INTO travel_tasks (id, trip_id, title, due_on, assignee, done, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, due_on = excluded.due_on, assignee = excluded.assignee,
        done = excluded.done, updated_by = excluded.updated_by, updated_at = unixepoch()
      WHERE travel_tasks.trip_id = excluded.trip_id`).bind(id, tripId, fields.title, fields.dueOn, fields.assignee, done, user.id);
  const inTrip = 'EXISTS (SELECT 1 FROM travel_tasks WHERE id = ? AND trip_id = ?)';
  const statements = [statement];
  if (fields.kind)
    statements.push(env.DB.prepare(`INSERT INTO task_kinds (task_id, kind) SELECT ?, ? WHERE ${inTrip}
      ON CONFLICT(task_id) DO UPDATE SET kind = excluded.kind`).bind(id, fields.kind, id, tripId));
  if (kind === 'each')
    statements.push(fields.done
      ? env.DB.prepare(`INSERT INTO task_marks (task_id, user_id) SELECT ?, ? WHERE ${inTrip} ON CONFLICT DO NOTHING`).bind(id, user.id, id, tripId)
      : env.DB.prepare('DELETE FROM task_marks WHERE task_id = ? AND user_id = ? AND ' + inTrip).bind(id, user.id, id, tripId));
  const [result] = await env.DB.batch(statements);
  if (!result.meta.changes) return taskId ? json({ error: 'タスクが見つかりません' }, 404) : json({ error: 'タスクIDが競合しました' }, 409);
  const saved = await env.DB.prepare(`${taskSelect} WHERE t.id = ? AND t.trip_id = ?`).bind(id, tripId).first<TaskRow>();
  return json({ task: { ...(saved ? taskView(saved, user.id) : { id, ...fields, kind }), updatedBy: user.id } }, taskId ? 200 : 201);
}

const createTask = (request: Request, env: Env, user: User, tripId: string) => writeTask(request, env, user, tripId);
const updateTask = (request: Request, env: Env, user: User, tripId: string, taskId: string) => writeTask(request, env, user, tripId, taskId);

async function deleteTask(env: Env, user: User, tripId: string, taskId: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  const result = await env.DB.prepare('DELETE FROM travel_tasks WHERE id = ? AND trip_id = ?').bind(taskId, tripId).run();
  return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: 'タスクが見つかりません' }, 404);
}

async function requireOwner(env: Env, tripId: string, userId: string) {
  return await memberRole(env, tripId, userId) === 'owner' ? null : json({ error: 'メンバーを管理できるのは管理者だけです' }, 403);
}

async function membersRoute(request: Request, env: Env, user: User, tripId: string, memberId?: string) {
  const forbidden = await requireMember(env, tripId, user.id);
  if (forbidden) return forbidden;
  if (request.method === 'GET' && !memberId) {
    const members = await env.DB.prepare(`SELECT u.id, u.display_name AS name, u.email, up.avatar_url AS avatarUrl,
      CASE WHEN tm.role = 'owner' THEN 'owner' WHEN mp.read_only = 1 THEN 'viewer' ELSE tm.role END AS role
      FROM trip_members tm JOIN users u ON u.id = tm.user_id LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN trip_member_permissions mp ON mp.trip_id = tm.trip_id AND mp.user_id = tm.user_id
      WHERE tm.trip_id = ? ORDER BY tm.role = 'owner' DESC, tm.joined_at, u.id`).bind(tripId).all();
    return json({ members: members.results });
  }
  const notOwner = await requireOwner(env, tripId, user.id);
  if (notOwner) return notOwner;
  if (!memberId || !['PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Not found' }, 404);
  const target = await memberRole(env, tripId, memberId);
  if (!target) return json({ error: 'メンバーが見つかりません' }, 404);
  if (target === 'owner') return json({ error: '管理者の削除・権限変更はできません' }, 409);
  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as { role?: unknown } | null;
    if (body?.role !== 'editor' && body?.role !== 'viewer') return json({ error: '編集可または閲覧のみを選択してください' }, 400);
    await env.DB.prepare(`INSERT INTO trip_member_permissions (trip_id, user_id, read_only)
      SELECT trip_id, user_id, ? FROM trip_members WHERE trip_id = ? AND user_id = ? AND role != 'owner'
      ON CONFLICT(trip_id, user_id) DO UPDATE SET read_only = excluded.read_only`)
      .bind(body.role === 'viewer' ? 1 : 0, tripId, memberId).run();
    return json({ role: body.role });
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invites WHERE trip_id = ? AND consumed_at IS NULL').bind(tripId),
    env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = ? AND role != 'owner'").bind(tripId, memberId),
  ]);
  return new Response(null, { status: 204 });
}

async function revokeInvites(env: Env, user: User, tripId: string) {
  const forbidden = await requireOwner(env, tripId, user.id);
  if (forbidden) return forbidden;
  await env.DB.prepare('DELETE FROM invites WHERE trip_id = ? AND consumed_at IS NULL').bind(tripId).run();
  return new Response(null, { status: 204 });
}

async function createInvite(env: Env, user: User, tripId: string, url: URL) {
  const forbidden = await requireOwner(env, tripId, user.id);
  if (forbidden) return forbidden;
  const token = randomToken();
  await env.DB.prepare('INSERT INTO invites (token_hash, trip_id, created_by, expires_at) VALUES (?, ?, ?, unixepoch() + 604800)')
    .bind(await hashToken(token), tripId, user.id).run();
  return json({ invite: { url: `${url.origin}/?invite=${encodeURIComponent(token)}`, expiresIn: 604800 } }, 201);
}

async function acceptInvite(env: Env, user: User, token: string) {
  const tokenHash = await hashToken(token);
  const invite = await env.DB.prepare(`
    UPDATE invites
    SET consumed_by = ?, consumed_at = unixepoch()
    WHERE token_hash = ? AND expires_at > unixepoch() AND consumed_at IS NULL
      AND EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = invites.trip_id AND tm.user_id = invites.created_by AND tm.role = 'owner')
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

const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();
app.use('/v1/*', async (c, next) => {
  const headers = cors(c.req.raw, c.env);
  headers.forEach((value, key) => c.header(key, value));
  c.header('Cache-Control', 'no-store');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});
app.post('/v1/auth/google', (c) => googleLogin(c.req.raw, c.env));
app.use('/v1/*', async (c, next) => {
  const user = await currentUser(c.req.raw, c.env);
  if (!user) return json({ error: 'ログインが必要です' }, 401);
  c.set('user', user);
  const scope = c.req.path.match(/^\/v1\/trips\/([^/]+)(?:\/|$)/);
  if (scope && c.req.method !== 'GET' && await memberRole(c.env, scope[1], user.id) === 'viewer') {
    return json({ error: 'この旅行は閲覧のみです' }, 403);
  }
  await next();
});
app.get('/v1/me', (c) => json({ user: c.get('user') }));
app.patch('/v1/me', async (c) => {
  const body = await c.req.json().catch(() => null);
  const name = isObject(body) ? textField(body.name, 100, true) : null;
  if (!name) return json({ error: '表示名は1〜100文字で入力してください' }, 400);
  const user = c.get('user');
  await c.env.DB.prepare('UPDATE users SET display_name = ?, updated_at = unixepoch() WHERE id = ?').bind(name, user.id).run();
  return json({ user: { ...user, name } });
});
app.post('/v1/auth/logout', async (c) => {
  const token = c.req.header('authorization')?.slice(7);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  return json({ ok: true });
});
app.get('/v1/trips', (c) => listTrips(c.env, c.get('user')));
app.post('/v1/trips', (c) => createTrip(c.req.raw, c.env, c.get('user')));
app.patch('/v1/trips/:tripId', (c) => updateTrip(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.delete('/v1/trips/:tripId', (c) => deleteTrip(c.env, c.get('user'), c.req.param('tripId')));
app.get('/v1/trips/:tripId/items', (c) => listItems(c.env, c.get('user'), c.req.param('tripId')));
app.post('/v1/trips/:tripId/items', (c) => createItem(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.patch('/v1/trips/:tripId/items/:itemId', (c) => updateItem(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('itemId')));
app.delete('/v1/trips/:tripId/items/:itemId', (c) => deleteItem(c.env, c.get('user'), c.req.param('tripId'), c.req.param('itemId')));
app.get('/v1/trips/:tripId/bookings', (c) => listBookings(c.env, c.get('user'), c.req.param('tripId')));
app.post('/v1/trips/:tripId/bookings', (c) => createBooking(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.patch('/v1/trips/:tripId/bookings/:bookingId', (c) => updateBooking(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('bookingId')));
app.delete('/v1/trips/:tripId/bookings/:bookingId', (c) => deleteBooking(c.env, c.get('user'), c.req.param('tripId'), c.req.param('bookingId')));
app.patch('/v1/trips/:tripId/bookings/:bookingId/connection', (c) => updateFlightConnection(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('bookingId')));
app.post('/v1/trips/:tripId/booking-import', (c) => importBookings(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.get('/v1/trips/:tripId/booking-documents', (c) => listBookingDocuments(c.env, c.get('user'), c.req.param('tripId')));
app.post('/v1/trips/:tripId/bookings/:bookingId/documents', (c) => uploadBookingDocument(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('bookingId')));
app.get('/v1/trips/:tripId/bookings/:bookingId/documents/:documentId', (c) => getBookingDocument(c.env, c.get('user'), c.req.param('tripId'), c.req.param('bookingId'), c.req.param('documentId')));
app.delete('/v1/trips/:tripId/bookings/:bookingId/documents/:documentId', (c) => deleteBookingDocument(c.env, c.get('user'), c.req.param('tripId'), c.req.param('bookingId'), c.req.param('documentId')));
app.get('/v1/trips/:tripId/packing', (c) => listPacking(c.env, c.get('user'), c.req.param('tripId')));
app.post('/v1/trips/:tripId/packing', (c) => createPackingItem(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.patch('/v1/trips/:tripId/packing/:itemId', (c) => updatePackingItem(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('itemId')));
app.delete('/v1/trips/:tripId/packing/:itemId', (c) => deletePackingItem(c.env, c.get('user'), c.req.param('tripId'), c.req.param('itemId')));
app.get('/v1/trips/:tripId/tasks', (c) => listTasks(c.env, c.get('user'), c.req.param('tripId')));
app.post('/v1/trips/:tripId/tasks', (c) => createTask(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.patch('/v1/trips/:tripId/tasks/:taskId', (c) => updateTask(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('taskId')));
app.delete('/v1/trips/:tripId/tasks/:taskId', (c) => deleteTask(c.env, c.get('user'), c.req.param('tripId'), c.req.param('taskId')));
app.delete('/v1/trips/:tripId/invites', (c) => revokeInvites(c.env, c.get('user'), c.req.param('tripId')));
app.post('/v1/invites/:token/accept', (c) => acceptInvite(c.env, c.get('user'), c.req.param('token')));
app.all('/v1/trips/:tripId/members', (c) => membersRoute(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.all('/v1/trips/:tripId/members/:id', (c) => membersRoute(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('id')));
app.get('/v1/maps/resolve', (c) => resolveMapLink(c.env, c.req.query('url') ?? ''));
app.all('/v1/trips/:tripId/places', (c) => placesRoute(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.all('/v1/trips/:tripId/places/:id', (c) => placesRoute(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('id')));
app.all('/v1/trips/:tripId/notes', (c) => notesRoute(c.req.raw, c.env, c.get('user'), c.req.param('tripId')));
app.all('/v1/trips/:tripId/notes/:id', (c) => notesRoute(c.req.raw, c.env, c.get('user'), c.req.param('tripId'), c.req.param('id')));
app.post('/v1/trips/:tripId/invites', (c) => createInvite(c.env, c.get('user'), c.req.param('tripId'), new URL(c.req.url)));
app.all('/v1/*', () => json({ error: 'Not found' }, 404));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error) => {
  console.error('API request failed', error);
  return json({ error: '処理に失敗しました。時間をおいて再試行してください' }, 500);
});
export default app;
