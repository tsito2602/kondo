import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

/**
 * Passkey (WebAuthn) sign-in. Accounts made with a passkey have no email:
 * users.email keeps its NOT NULL UNIQUE shape with a placeholder that has no
 * '@', and every query that hands email to the client blanks such values.
 */
type Env = { DB: D1Database; ALLOWED_ORIGINS?: string };
type User = { id: string; email: string; name: string | null; avatarUrl: string | null };
type Session = (userId: string) => Promise<string>;

const RP_NAME = 'kondo';
const CHALLENGE_SECONDS = 300;
export const passkeyEmail = (userId: string) => `passkey:${userId}`;

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const fromBase64Url = (text: string) => {
  const raw = atob(text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

/** The page that asked: the request's own origin, or an allowed dev origin. */
function relyingParty(request: Request, env: Env) {
  const self = new URL(request.url).origin;
  const origin = request.headers.get('origin') ?? self;
  const allowed = env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()) ?? [];
  if (origin !== self && !allowed.includes(origin)) return null;
  return { origin, rpID: new URL(origin).hostname };
}

async function saveChallenge(env: Env, challenge: string, userId: string | null, name: string | null) {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at < unixepoch()'),
    env.DB.prepare('INSERT INTO auth_challenges (id, challenge, user_id, name, expires_at) VALUES (?, ?, ?, ?, unixepoch() + ?)')
      .bind(id, challenge, userId, name, CHALLENGE_SECONDS),
  ]);
  return id;
}

/** One use only: the row is gone whether verification then passes or not. */
async function takeChallenge(env: Env, id: unknown) {
  if (typeof id !== 'string') return null;
  return env.DB.prepare('DELETE FROM auth_challenges WHERE id = ? AND expires_at >= unixepoch() RETURNING challenge, user_id AS userId, name')
    .bind(id)
    .first<{ challenge: string; userId: string | null; name: string | null }>();
}

async function storeCredential(env: Env, userId: string, info: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] }, device: string) {
  return env.DB.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, device, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())')
    .bind(info.id, userId, toBase64Url(info.publicKey), info.counter, JSON.stringify(info.transports ?? []), device);
}

/** A short label for the list in settings: 「iPhone」「Mac」… from the user agent. */
export function deviceLabel(userAgent: string | null) {
  const ua = userAgent ?? '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

async function registrationOptions(request: Request, env: Env, user: { id: string; name: string }, exclude: string[]) {
  const rp = relyingParty(request, env);
  if (!rp) return { error: json({ error: 'このページからは登録できません' }, 403) };
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.name,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: exclude.map((id) => ({ id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  return { options };
}

async function verifyRegistration(request: Request, env: Env, challenge: string, response: unknown) {
  const rp = relyingParty(request, env);
  if (!rp || typeof response !== 'object' || response === null) return null;
  try {
    const result = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: false,
    });
    return result.verified ? result.registrationInfo.credential : null;
  } catch {
    return null;
  }
}

/** Sign-up, step 1: a name is all a new account needs. */
export async function signupOptions(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) return json({ error: '名前は1〜100文字で入力してください' }, 400);
  const userId = crypto.randomUUID();
  const { options, error } = await registrationOptions(request, env, { id: userId, name }, []);
  if (error) return error;
  return json({ challengeId: await saveChallenge(env, options.challenge, userId, name), options });
}

/** Sign-up, step 2: the new passkey makes the account and signs it in. */
export async function signupVerify(request: Request, env: Env, session: Session) {
  const body = (await request.json().catch(() => null)) as { challengeId?: unknown; response?: unknown } | null;
  const pending = await takeChallenge(env, body?.challengeId);
  if (!pending?.userId || !pending.name) return json({ error: 'もう一度お試しください' }, 400);
  const credential = await verifyRegistration(request, env, pending.challenge, body?.response);
  if (!credential) return json({ error: 'パスキーを確認できませんでした' }, 401);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, email, display_name, updated_at) VALUES (?, ?, ?, unixepoch())').bind(pending.userId, passkeyEmail(pending.userId), pending.name),
    await storeCredential(env, pending.userId, credential, deviceLabel(request.headers.get('user-agent'))),
  ]);
  const user: User = { id: pending.userId, email: '', name: pending.name, avatarUrl: null };
  return json({ token: await session(user.id), user });
}

/** Sign-in, step 1: no account named; the device offers its own passkeys. */
export async function loginOptions(request: Request, env: Env) {
  const rp = relyingParty(request, env);
  if (!rp) return json({ error: 'このページからはログインできません' }, 403);
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'preferred' });
  return json({ challengeId: await saveChallenge(env, options.challenge, null, null), options });
}

/** Sign-in, step 2. */
export async function loginVerify(request: Request, env: Env, session: Session, findUser: (id: string) => Promise<User | null>) {
  const body = (await request.json().catch(() => null)) as { challengeId?: unknown; response?: AuthenticationResponseJSON } | null;
  const pending = await takeChallenge(env, body?.challengeId);
  const rp = relyingParty(request, env);
  const response = body?.response;
  if (!pending || pending.userId || !rp || typeof response?.id !== 'string') return json({ error: 'もう一度お試しください' }, 400);
  const saved = await env.DB.prepare('SELECT id, user_id AS userId, public_key AS publicKey, counter, transports FROM passkeys WHERE id = ?')
    .bind(response.id)
    .first<{ id: string; userId: string; publicKey: string; counter: number; transports: string }>();
  if (!saved) return json({ error: 'このパスキーは登録されていません' }, 401);
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: { id: saved.id, publicKey: fromBase64Url(saved.publicKey), counter: saved.counter, transports: JSON.parse(saved.transports || '[]') },
      requireUserVerification: false,
    });
    if (!result.verified) throw new Error('unverified');
    await env.DB.prepare('UPDATE passkeys SET counter = ?, last_used_at = unixepoch() WHERE id = ?').bind(result.authenticationInfo.newCounter, saved.id).run();
  } catch {
    return json({ error: 'パスキーを確認できませんでした' }, 401);
  }
  const user = await findUser(saved.userId);
  if (!user) return json({ error: 'アカウントが見つかりません' }, 401);
  return json({ token: await session(user.id), user });
}

/** Signed in: the passkeys on this account, newest first. */
export async function listPasskeys(env: Env, user: User) {
  const rows = await env.DB.prepare('SELECT id, device, created_at AS createdAt, last_used_at AS lastUsedAt FROM passkeys WHERE user_id = ? ORDER BY created_at DESC')
    .bind(user.id)
    .all();
  return json({ passkeys: rows.results });
}

/** Signed in, step 1 of adding another passkey (another device, or a Google account moving over). */
export async function addOptions(request: Request, env: Env, user: User) {
  const existing = await env.DB.prepare('SELECT id FROM passkeys WHERE user_id = ?').bind(user.id).all<{ id: string }>();
  const { options, error } = await registrationOptions(request, env, { id: user.id, name: user.name || user.email || 'kondo' }, existing.results.map((row) => row.id));
  if (error) return error;
  return json({ challengeId: await saveChallenge(env, options.challenge, user.id, null), options });
}

export async function addVerify(request: Request, env: Env, user: User) {
  const body = (await request.json().catch(() => null)) as { challengeId?: unknown; response?: unknown } | null;
  const pending = await takeChallenge(env, body?.challengeId);
  if (!pending || pending.userId !== user.id) return json({ error: 'もう一度お試しください' }, 400);
  const credential = await verifyRegistration(request, env, pending.challenge, body?.response);
  if (!credential) return json({ error: 'パスキーを確認できませんでした' }, 401);
  await (await storeCredential(env, user.id, credential, deviceLabel(request.headers.get('user-agent')))).run();
  return listPasskeys(env, user);
}

/** The last passkey stays: without it the account could never sign in again. */
export async function removePasskey(env: Env, user: User, id: string) {
  const count = await env.DB.prepare('SELECT count(*) AS n FROM passkeys WHERE user_id = ?').bind(user.id).first<{ n: number }>();
  if ((count?.n ?? 0) <= 1) return json({ error: '最後のパスキーは削除できません' }, 409);
  await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return listPasskeys(env, user);
}

/**
 * Google sign-in only stays while some account still has no passkey, so
 * nobody who signed up with Google is locked out before moving over.
 */
export async function googleStillNeeded(env: Env) {
  const row = await env.DB.prepare('SELECT EXISTS (SELECT 1 FROM users u WHERE NOT EXISTS (SELECT 1 FROM passkeys p WHERE p.user_id = u.id)) AS needed').first<{ needed: number }>();
  return row?.needed === 1;
}
