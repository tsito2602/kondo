import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tabi-pwa-'));
await build({ entryPoints: ['worker/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: join(dir, 'worker.cjs'), logLevel: 'silent' });
const worker = createRequire(import.meta.url)(join(dir, 'worker.cjs')).default;
after(() => rm(dir, { recursive: true, force: true }));
async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const schema = await readFile('worker/schema.sql', 'utf8'); db.exec(schema); db.exec(schema);
  for (const user of ['owner', 'editor', 'outsider']) {
    db.prepare('INSERT INTO users (id,email) VALUES (?,?)').run(user, `${user}@example.test`);
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,unixepoch()+1000,unixepoch())').run(createHash('sha256').update(user).digest('hex'), user);
  }
  const DB = { prepare(sql) { return { args: [], bind(...args) { this.args = args; return this; }, async first() { return db.prepare(sql).get(...this.args) ?? null; }, async all() { return { results: db.prepare(sql).all(...this.args) }; }, async run() { return { meta: { changes: db.prepare(sql).run(...this.args).changes } }; } }; }, async batch(statements) { db.exec('BEGIN'); try { const results = await Promise.all(statements.map((statement) => statement.run())); db.exec('COMMIT'); return results; } catch (cause) { db.exec('ROLLBACK'); throw cause; } } };
  const removed = [];
  const env = { DB, BUCKET: { delete: async (keys) => removed.push(...keys) } };
  const call = (path, method = 'GET', body, user = 'owner') => worker.fetch(new Request(`https://example.test/v1${path}`, { method, headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  const trip = { id: randomUUID(), name: '旅', destination: 'Vienna', startsOn: '2026-11-21', endsOn: '2026-11-28', coverImage: 'data:image/jpeg;base64,/9j/AA==' };
  assert.equal((await call('/trips', 'POST', trip)).status, 201);
  db.prepare("INSERT INTO trip_members (trip_id,user_id,role) VALUES (?, 'editor', 'editor')").run(trip.id);
  return { db, call, trip, removed };
}
const place = { title: '美術館', note: '展示', openingHours: '10:00–18:00', reservationStatus: 'needed', location: 'https://maps.app.goo.gl/abc', status: 'want' };
test('places CRUD is shared, validated, scoped and replay-safe', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/places`, id = randomUUID();
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    const items = (await (await call(base, 'GET', undefined, 'editor')).json()).places;
    assert.equal(items.length, 1); assert.equal(items[0].openingHours, place.openingHours);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, status: 'visited', reservationStatus: 'confirmed' }, 'editor')).status, 200);
    assert.equal((await call(base, 'POST', { ...place, status: 'invalid' })).status, 400);
    assert.equal((await call(base, 'POST', { ...place, location: 'javascript:alert(1)' })).status, 400);
    assert.equal((await call(base, 'POST', { ...place, title: ' ' })).status, 400);
    assert.equal((await call(base, 'GET', undefined, 'outsider')).status, 403);
    assert.equal((await call(`${base}/${id}`, 'DELETE', undefined, 'outsider')).status, 403);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal((await (await call(base)).json()).places.length, 0);
  } finally { db.close(); }
});
test('cover images survive older client updates and can be removed', async () => {
  const { db, call, trip } = await fixture();
  try {
    assert.equal((await (await call('/trips')).json()).trips[0].coverImage, trip.coverImage);
    const { coverImage, ...oldClient } = trip;
    assert.equal((await call(`/trips/${trip.id}`, 'PATCH', { ...oldClient, name: '更新' })).status, 200);
    assert.equal((await (await call('/trips')).json()).trips[0].coverImage, coverImage);
    assert.equal((await call(`/trips/${trip.id}`, 'PATCH', { ...trip, coverImage: 'https://untrusted.test/image' })).status, 400);
    assert.equal((await call(`/trips/${trip.id}`, 'PATCH', { ...trip, coverImage: '' })).status, 200);
    assert.equal((await (await call('/trips')).json()).trips[0].coverImage, '');
  } finally { db.close(); }
});
test('only owners delete trips and cascades remove children and R2 objects', async () => {
  const { db, call, trip, removed } = await fixture();
  try {
    await call(`/trips/${trip.id}/places`, 'POST', { ...place });
    const bookingId = randomUUID();
    db.prepare("INSERT INTO bookings (id,trip_id,kind,title,day,updated_by) VALUES (?,?,'ticket','Ticket','2026-11-21','owner')").run(bookingId, trip.id);
    db.prepare("INSERT INTO booking_documents (id,trip_id,booking_id,object_key,filename,content_type,size,uploaded_by) VALUES ('doc',?,?,?,'file.pdf','application/pdf',12,'owner')").run(trip.id, bookingId, `${trip.id}/file.pdf`);
    assert.equal((await call(`/trips/${trip.id}`, 'DELETE', undefined, 'editor')).status, 403);
    assert.equal(removed.length, 0);
    assert.equal((await call(`/trips/${trip.id}`, 'DELETE')).status, 204);
    assert.deepEqual(removed, [`${trip.id}/file.pdf`]);
    for (const table of ['trips','places','trip_covers','bookings','booking_documents','trip_members']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    assert.equal((await call(`/trips/${trip.id}`, 'DELETE')).status, 204);
  } finally { db.close(); }
});
