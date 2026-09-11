import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'tabi-gmail-test-'));
const require = createRequire(import.meta.url);
for (const [name, entry] of [['client', 'src/data/gmail-search.ts'], ['gmail', 'worker/gmail-search.ts'], ['worker', 'worker/index.ts']]) {
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: join(dir, `${name}.cjs`), logLevel: 'silent' });
}
const { GmailSearch } = require(join(dir, 'client.cjs'));
const { parseGmailBatch, gmailSearchQuery, GmailReadError } = require(join(dir, 'gmail.cjs'));
const worker = require(join(dir, 'worker.cjs')).default;
process.on('exit', () => { void rm(dir, { recursive: true, force: true }); });
const page = (extra = {}) => ({ candidates: [], reviewMessages: [], nextPageToken: null, pendingIds: [], scanned: 0, retryAfterSeconds: 0, nextRequestAfterMs: 0, ...extra });
const candidate = (id) => ({ sourceMessageId: id, fingerprint: id });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const part = (index, status, body, retry = '') => `--reply\r\nContent-Type: application/http\r\nContent-ID: <response-message-${index}>\r\n\r\nHTTP/1.1 ${status} Result\r\nContent-Type: application/json\r\n${retry}\r\n${JSON.stringify(body)}\r\n`;
const batch = (parts) => parts.join('') + '--reply--\r\n';

test('one start scans more than 300 messages, keeps early candidates and deduplicates', async () => {
  let calls = 0;
  const search = new GmailSearch(async ({ pageToken }) => {
    assert.equal(pageToken, calls ? String(calls) : null); calls++;
    return page({ candidates: [candidate('same')], scanned: 20, nextPageToken: calls < 17 ? String(calls) : null });
  });
  await search.start();
  assert.equal(calls, 17); assert.equal(search.state.scanned, 340); assert.equal(search.state.candidates.length, 1);
  assert.equal(search.state.status, 'complete'); await search.start(); assert.equal(calls, 17);
});

test('partial quota response retries only unfinished IDs, honoring Retry-After automatically', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const inputs = [];
  const search = new GmailSearch(async (input) => {
    inputs.push(input);
    return inputs.length === 1 ? page({ candidates: [candidate('ok')], scanned: 1, pendingIds: ['retry'], retryAfterSeconds: 10 })
      : page({ candidates: [candidate('retry')], scanned: 1 });
  });
  const run = search.start(); await tick();
  assert.equal(search.state.status, 'waiting'); assert.equal(search.state.candidates.length, 1);
  t.mock.timers.tick(9999); await tick(); assert.equal(inputs.length, 1);
  t.mock.timers.tick(1); await run;
  assert.deepEqual(inputs[1].pendingIds, ['retry']); assert.equal(search.state.scanned, 2); assert.equal(search.state.status, 'complete');
});

test('pause during a request saves the arriving page; resume does not read it again', async () => {
  let deliver; const inputs = [];
  const search = new GmailSearch((input) => { inputs.push(input); return inputs.length === 1
    ? new Promise((resolve) => { deliver = resolve; }) : Promise.resolve(page({ scanned: 20 })); });
  const run = search.start(); search.pause();
  assert.equal(search.state.status, 'stopping');
  deliver(page({ candidates: [candidate('first')], scanned: 20, nextPageToken: 'next' })); await run;
  assert.equal(search.state.status, 'paused'); assert.equal(search.state.candidates.length, 1);
  await search.start(); assert.equal(inputs[1].pageToken, 'next'); assert.equal(search.state.scanned, 40);
});

test('query changes and disposed scopes discard late results', async () => {
  let old; const search = new GmailSearch(({ query }) => query === 'old' ? new Promise((resolve) => { old = resolve; })
    : Promise.resolve(page({ candidates: [candidate('new')], scanned: 1 })));
  const first = search.start('old'); await search.start('from:airline.example', true);
  old(page({ candidates: [candidate('old')], scanned: 20 })); await first;
  assert.deepEqual(search.state.candidates.map((entry) => entry.sourceMessageId), ['new']); assert.equal(search.state.scanned, 1);
  let disposed; const other = new GmailSearch(() => new Promise((resolve) => { disposed = resolve; }));
  const pending = other.start(); other.dispose(); disposed(page({ scanned: 10 })); await pending; assert.equal(other.state.scanned, 0);
});

test('failed request preserves the previous cursor and candidates for resume', async () => {
  let calls = 0;
  const search = new GmailSearch(async ({ pageToken }) => {
    calls++; if (calls === 1) return page({ candidates: [candidate('saved')], scanned: 20, nextPageToken: 'next' });
    assert.equal(pageToken, 'next'); if (calls === 2) throw new Error('offline'); return page({ scanned: 20 });
  });
  await search.start(); assert.equal(search.state.status, 'error'); assert.equal(search.state.scanned, 20);
  await search.start(); assert.equal(search.state.scanned, 40); assert.equal(search.state.candidates.length, 1);
});

test('batch maps out-of-order parts, retains successes, and skips deleted messages', () => {
  const result = parseGmailBatch(batch([
    part(2, 404, {}), part(1, 429, { error: { message: 'userRateLimitExceeded' } }, 'Retry-After: 35\r\n'), part(0, 200, { id: 'a' }),
  ]), 'multipart/mixed; boundary="reply"', ['a', 'b', 'c']);
  assert.deepEqual(result.messages, [{ id: 'a' }]); assert.deepEqual(result.pendingIds, ['b']); assert.equal(result.scanned, 2); assert.equal(result.retryAfterSeconds, 35);
  const missing = parseGmailBatch(batch([part(0, 200, { id: 'a' })]), 'multipart/mixed; boundary=reply', ['a', 'b']);
  assert.deepEqual(missing.pendingIds, ['b']); assert.ok(missing.error);
  assert.throws(() => parseGmailBatch(batch([part(0, 200, { id: 'wrong' })]), 'multipart/mixed; boundary=reply', ['a']));
});

test('explicit keywords use Gmail index without received-date or reservation-term restrictions', () => {
  assert.equal(gmailSearchQuery(' from:emirates.com ABC123 '), 'from:emirates.com ABC123');
  assert.equal(gmailSearchQuery('2026/11'), '2026/11'); assert.ok(!/newer_than|after:|before:/.test(gmailSearchQuery('')));
  assert.ok(new GmailReadError('User-rate limit exceeded', 403).retryAfterSeconds > 0);
  assert.equal(new GmailReadError('Invalid credentials', 401).retryAfterSeconds, 0);
});

async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(await readFile('worker/schema.sql', 'utf8'));
  const keyBytes = randomBytes(32); const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12); const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from('test-refresh'));
  for (const user of ['user1', 'user2']) {
    db.prepare('INSERT INTO users (id,email) VALUES (?,?)').run(user, user+'@example.test');
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,unixepoch()+1000,unixepoch())')
      .run(createHash('sha256').update(user).digest('hex'), user);
    db.prepare('INSERT INTO gmail_connections (user_id,email,encrypted_refresh_token,token_iv,scope) VALUES (?,?,?,?,?)')
      .run(user, user+'@example.test', Buffer.from(encrypted).toString('base64url'), iv.toString('base64url'), 'readonly');
  }
  db.exec("INSERT INTO trips (id,name,starts_on,ends_on,created_by) VALUES ('trip1','Test','2026-11-21','2026-11-28','user1'),('trip2','Test2','2027-01-21','2027-01-28','user1'); INSERT INTO trip_members (trip_id,user_id,role) VALUES ('trip1','user1','owner'),('trip2','user1','owner'),('trip1','user2','editor');");
  const DB = { prepare(sql) { return { args: [], bind(...args) { this.args = args; return this; }, async first() { return db.prepare(sql).get(...this.args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...this.args) }; }, async run() { const result = db.prepare(sql).run(...this.args); return { meta: { changes: result.changes } }; } }; },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); } };
  const env = { DB, GMAIL_TOKEN_ENCRYPTION_KEY: keyBytes.toString('base64url'), GOOGLE_GMAIL_CLIENT_ID: 'test', GOOGLE_GMAIL_CLIENT_SECRET: 'test', GOOGLE_GMAIL_REDIRECT_URI: 'https://example.test/callback' };
  const call = async (body = {}, user = 'user1', trip = 'trip1') => worker.fetch(new Request(`https://example.test/v1/trips/${trip}/gmail/candidates`, { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
  const release = () => db.exec('UPDATE gmail_scan_limits SET next_allowed_at = 0');
  return { db, call, release };
}

test('actual endpoint: encrypted cache, account isolation, quota lease, trip filtering, partial continuation and input validation', async (t) => {
  const { db, call, release } = await fixture(); t.after(() => db.close());
  let bodyCalls = 0; const queries = [];
  const message = (id) => ({ id, payload: { headers: [{ name: 'Subject', value: 'Flight confirmation '+id }, { name: 'From', value: 'airline@example.test' }], mimeType: 'text/plain', body: { data: Buffer.from('Flight booking ABC123 NRT -> DXB 2026-11-21 22:20 2026-11-22 05:30').toString('base64url') } } });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test' });
    if (String(url).includes('/messages?')) { queries.push(new URL(url).searchParams.get('q')); return Response.json({ messages: [{ id: 'a' }, { id: 'b' }] }); }
    bodyCalls++;
    const ids = [...init.body.matchAll(/\/messages\/([^?]+)\?/g)].map((match) => match[1]);
    return new Response(batch(ids.map((id, index) => bodyCalls === 1 && id === 'b'
      ? part(index, 429, { error: { message: 'quota exceeded' } }) : part(index, 200, message(id)))), { headers: { 'content-type': 'multipart/mixed; boundary=reply' } });
  });
  const first = await (await call({ query: 'ABC123' })).json();
  assert.equal(first.scanned, 1); assert.equal(first.candidates.length, 1); assert.deepEqual(first.pendingIds, ['b']); assert.ok(first.retryAfterSeconds);
  const waiting = await (await call({ pendingIds: first.pendingIds })).json(); assert.equal(waiting.scanned, 0); assert.ok(waiting.retryAfterSeconds); assert.equal(bodyCalls, 1);
  release(); const second = await (await call({ query: 'ABC123', pendingIds: first.pendingIds })).json(); assert.equal(second.scanned, 1); assert.equal(second.candidates.length, 1);
  release(); const cached = await (await call({ query: 'ABC123' })).json(); assert.equal(cached.candidates.length, 2); assert.equal(bodyCalls, 2); assert.ok(cached.nextRequestAfterMs <= 250);
  const row = db.prepare('SELECT encrypted_result FROM gmail_message_cache LIMIT 1').get(); assert.ok(!row.encrypted_result.includes('Flight')); assert.ok(!row.encrypted_result.includes('NRT'));
  release(); const otherTrip = await (await call({}, 'user1', 'trip2')).json(); assert.equal(otherTrip.candidates.length, 0); assert.equal(otherTrip.reviewMessages[0].reason, 'outside-trip'); assert.equal(bodyCalls, 2);
  await call({}, 'user2'); assert.equal(bodyCalls, 3); // Same message IDs in another Gmail account must be fetched.
  release(); db.prepare("UPDATE gmail_connections SET email='different@example.test' WHERE user_id='user1'").run(); await call(); assert.equal(bodyCalls, 4);
  assert.equal((await call({}, 'user2', 'trip2')).status, 403);
  assert.equal((await call({ pendingIds: ['../profile'] })).status, 400); assert.equal((await call({ query: 'x'.repeat(501) })).status, 400);
  assert.equal(queries[0], 'ABC123');
});

test('unparseable mail stays visible and negative parsing results are cached', async (t) => {
  const { db, call, release } = await fixture(); t.after(() => db.close()); let bodyCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test' });
    if (String(url).includes('/messages?')) return Response.json({ messages: [{ id: 'unparsed' }] });
    bodyCalls++;
    return new Response(batch([part(0, 200, { id: 'unparsed', payload: { headers: [{ name: 'Subject', value: 'Hotel reservation' }], mimeType: 'text/plain', body: { data: Buffer.from('See attached itinerary').toString('base64url') } } })]), { headers: { 'content-type': 'multipart/mixed; boundary=reply' } });
  });
  const first = await (await call()).json(); assert.equal(first.candidates.length, 0); assert.equal(first.reviewMessages[0].reason, 'unparsed');
  assert.equal(first.reviewMessages[0].subject, 'Hotel reservation'); release();
  const second = await (await call()).json(); assert.equal(second.reviewMessages.length, 1); assert.equal(bodyCalls, 1);
});
