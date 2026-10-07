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
// Short Google Maps links are followed once by the Worker; never reach the network in tests.
const shortLinkRequests = [];
// An iPhone share link lands on ?q=…&ftid=… (no coordinates): the Maps page's
// static map gives the pin, or else OpenStreetMap finds the address.
const pageRequests = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === 'maps.google.com') {
    pageRequests.push(url.href);
    const cid = url.searchParams.get('cid');
    if (cid) return new Response(`<title>${cid === '4242' ? 'Café Central · Herrengasse 14, 1010 Wien' : 'Café Sacher · Philharmoniker Str. 4, 1010 Wien'} - Google マップ</title>${cid === '4242' ? '<script>window.APP_INITIALIZATION_STATE=[[[1500.2,16.3654,48.2105],[0,0,0]]]</script>' : ''}`, { status: 200 });
    const html = url.searchParams.get('q')?.startsWith('Porsche') ? '<meta content="https://maps.google.com/maps/api/staticmap?center=48.8341%2C9.1522&amp;zoom=15&amp;markers=48.83411%2C9.15224&amp;size=256x256" itemprop="image">' : '<html></html>';
    return new Response(html, { status: 200 });
  }
  // A Google Maps place page: a phone gets Maps lite (no pin), a desktop the full page.
  if (url.hostname === 'www.google.com' && url.pathname.startsWith('/maps/place/')) {
    pageRequests.push(url.href);
    const desktop = !/iPhone/.test(new Headers(init?.headers).get('user-agent') ?? '');
    const name = decodeURIComponent(url.pathname);
    if (name.includes('シュロスプラッツ') && desktop) return new Response('<script>window.APP_INITIALIZATION_STATE=[[[1200.5,9.1793,48.7784],[0,0,0]]]</script>', { status: 200 });
    return new Response('<html><script>mapslite = {}</script></html>', { status: 200 });
  }
  if (url.hostname === 'nominatim.openstreetmap.org') {
    pageRequests.push(url.href);
    const q = url.searchParams.get('q') ?? '';
    if (q === 'Königstraße 1, 70173 Stuttgart') return Response.json([{ lat: '48.7830', lon: '9.1810' }]);
    return Response.json(q.startsWith('Weihnachtsmarkt') ? [{ lat: '48.7758', lon: '9.1829' }] : q.startsWith('Café Sacher') ? [{ lat: '48.2039', lon: '16.3695' }] : []);
  }
  if (url.hostname !== 'maps.app.goo.gl') throw new Error(`unexpected fetch ${url}`);
  // An Android share link (「?g_st=ac」) may answer with a page that moves on by meta refresh to a place id.
  if (url.pathname === '/android' || url.pathname === '/android2')
    return new Response(`<meta http-equiv="refresh" content="0;url=https://maps.google.com/?cid=${url.pathname === '/android' ? '4242' : '99'}&amp;g_st=ac">`, { status: 200 });
  if (url.pathname === '/schlossplatz' || url.pathname === '/koenig') {
    const place = url.pathname === '/schlossplatz' ? 'シュロスプラッツ・シュトゥットガルト+Schloßpl.,+70173+Stuttgart,+ドイツ' : 'ケーニッヒ通り+Königstraße+1,+70173+Stuttgart,+ドイツ';
    return new Response(null, { status: 302, headers: { location: `https://www.google.com/maps/place/${encodeURIComponent(place).replace(/%2B/g, '+')}/data=!4m2!3m1!1s0x4799db35a609056f:0x816f73494c40723a!18m1!1e1?entry=gps&g_st=ac` } });
  }
  if (url.pathname === '/iphone' || url.pathname === '/market') {
    const q = url.pathname === '/iphone' ? 'Porsche Museum, Porscheplatz 1, 70435 Stuttgart' : 'Weihnachtsmarkt, Schillerplatz, Stuttgart';
    return new Response(null, { status: 302, headers: { location: `https://maps.google.com/?q=${encodeURIComponent(q)}&ftid=0x1:0x2&entry=gps&g_st=ic` } });
  }
  shortLinkRequests.push({ url: url.href, redirect: init?.redirect });
  const location = url.pathname === '/stephansdom' ? 'https://www.google.com/maps/place/Stephansdom/@48.2,16.37,17z/data=!3m1!4b1!4m6!3m5!8m2!3d48.20849!4d16.37314' : 'https://www.google.com/maps?q=Vienna';
  return new Response(null, { status: 302, headers: { location } });
};
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
test('titled rich notes round-trip, preserve legacy text and enforce schema, roles and trip isolation', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/notes`, id = randomUUID();
    const read = async () => (await (await call(base)).json()).notes.find(note => note.id === id);
    const legacy = { id, body: '旅のメモ\n- [ ] お土産', pinned: true };
    assert.equal((await call(base, 'POST', legacy)).status, 201);
    assert.equal((await read()).body, legacy.body);
    assert.equal((await read()).pinned, true);
    assert.equal((await read()).updatedBy, 'owner');
    assert.equal((await read()).placeId, null);
    const content = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '買い物' }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'チョコ', marks: [{ type: 'bold' }, { type: 'underline' }] }] },
      ] }] },
    ] };
    const rich = { id, title: 'ウィーンのお土産', body: '買い物\n- [x] チョコ', content };
    assert.equal((await call(base, 'POST', rich, 'editor')).status, 201);
    assert.deepEqual((await read()).content, content);
    assert.equal((await read()).body, rich.body);
    // A save that omits the pin keeps it; the last writer is reported.
    assert.equal((await read()).pinned, true);
    assert.equal((await read()).updatedBy, 'editor');
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await read()).title, rich.title);
    assert.deepEqual((await read()).content, content);
    for (const patch of [
      { title: 'x'.repeat(121) }, { body: 'x'.repeat(50001) },
      { content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }] } },
      { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } },
      { content: { type: 'doc', content: [{ type: 'listItem' }] } },
      { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(50001) }] }] } },
    ]) assert.equal((await call(base, 'POST', { ...rich, ...patch })).status, 400);
    assert.equal((await call(base, 'POST', rich, 'outsider')).status, 403);
    assert.equal((await call(base, 'GET', undefined, 'outsider')).status, 403);
    await call(`/trips/${trip.id}/members/editor`, 'PATCH', { role: 'viewer' });
    assert.equal((await call(base, 'GET', undefined, 'editor')).status, 200);
    assert.equal((await call(base, 'POST', rich, 'editor')).status, 403);
    assert.equal((await call(`${base}/${id}`, 'DELETE', undefined, 'editor')).status, 403);
    const other = { ...trip, id: randomUUID() };
    await call('/trips', 'POST', other);
    assert.equal((await call(`/trips/${other.id}/notes`, 'POST', { ...rich, title: '別の旅行' })).status, 409);
    assert.equal((await read()).title, rich.title);
    // Older offline edits preserve the explicit title; their changed plain text wins over stale formatting.
    assert.equal((await call(base, 'POST', { ...legacy, body: '旧端末で追記' })).status, 201);
    assert.equal((await read()).title, rich.title);
    assert.equal((await read()).body, '旧端末で追記');
    assert.equal((await read()).content, null);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM note_details').get().n, 0);
  } finally { db.close(); }
});
test('packing assignment and shared status survive old clients, membership changes and schema reruns', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/packing`, id = randomUUID();
    const legacy = { id, name: '充電器', category: '電子機器', quantity: 1, packed: false };
    const read = async () => (await (await call(base)).json()).items.find((item) => item.id === id);
    assert.equal((await call(base, 'POST', legacy)).status, 201);
    assert.equal((await read()).assignee, '');
    assert.equal((await read()).shared, false);
    const assigned = { ...legacy, assignee: 'member:editor', shared: true };
    assert.equal((await call(`${base}/${id}`, 'PATCH', assigned)).status, 200);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, packed: true }, 'editor')).status, 200);
    assert.equal((await read()).packed, true);
    assert.equal((await read()).assignee, assigned.assignee);
    assert.equal((await read()).shared, true);
    assert.equal((await call(base, 'POST', legacy)).status, 201);
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await read()).assignee, assigned.assignee);
    assert.equal((await read()).shared, true);
    for (const patch of [{ assignee: 'member:outsider' }, { assignee: null }, { shared: 'yes' }, { shared: null }]) {
      assert.equal((await call(`${base}/${id}`, 'PATCH', { ...assigned, ...patch })).status, 400);
    }
    assert.equal((await call(`${base}/${id}`, 'PATCH', assigned, 'outsider')).status, 403);
    const other = { ...trip, id: randomUUID() };
    assert.equal((await call('/trips', 'POST', other)).status, 201);
    assert.equal((await call(`/trips/${other.id}/packing`, 'POST', { ...legacy, shared: false, assignee: '' })).status, 409);
    assert.equal((await read()).shared, true);
    db.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = 'editor'").run(trip.id);
    assert.equal((await call(`${base}/${id}`, 'PATCH', assigned)).status, 200, 'retain an existing departed member');
    assert.equal((await call(base, 'POST', { ...assigned, id: randomUUID() })).status, 400, 'cannot newly assign a departed member');
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...assigned, assignee: '', shared: false })).status, 200);
    assert.equal((await read()).assignee, '');
    assert.equal((await read()).shared, false);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM packing_details WHERE item_id = ?').get(id).n, 0);
  } finally { db.close(); }
});
test('packing kinds: legacy rows read as 1つでいい, みんな各自 ticks per member, 自分だけ stays private on the server', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/packing`;
    const list = async (user = 'owner') => (await (await call(base, 'GET', undefined, user)).json()).items;
    const find = async (id, user) => (await list(user)).find((item) => item.id === id);
    const legacy = { id: randomUUID(), name: '変換プラグ', category: '電子機器', quantity: 1, packed: false, assignee: 'member:editor', shared: false };
    assert.equal((await call(base, 'POST', legacy)).status, 201);
    assert.equal((await find(legacy.id)).kind, 'one', 'items without a kind are 1つでいい with their old carrier');
    assert.deepEqual((await find(legacy.id)).packedBy, []);
    // Only the carrier ticks a 1つでいい item; others' ticks are ignored, not rejected.
    assert.equal((await call(`${base}/${legacy.id}`, 'PATCH', { ...legacy, packed: true })).status, 200);
    assert.equal((await find(legacy.id)).packed, false);
    assert.equal((await call(`${base}/${legacy.id}`, 'PATCH', { ...legacy, packed: true }, 'editor')).status, 200);
    assert.equal((await find(legacy.id)).packed, true);

    const each = { id: randomUUID(), name: 'パスポート', category: '書類', quantity: 1, packed: false, assignee: '', shared: false, kind: 'each' };
    assert.equal((await call(base, 'POST', each)).status, 201);
    const ticked = await call(`${base}/${each.id}`, 'PATCH', { ...each, packed: true }, 'editor');
    assert.deepEqual((await ticked.json()).item.packedBy, ['editor']);
    assert.equal((await find(each.id, 'editor')).packed, true, 'packed is the reader’s own tick');
    assert.equal((await find(each.id, 'owner')).packed, false);
    assert.deepEqual((await find(each.id, 'owner')).packedBy, ['editor']);
    // An older client omits the kind and sends the reader's own tick back.
    const { kind: _kind, ...old } = each;
    assert.equal((await call(`${base}/${each.id}`, 'PATCH', { ...old, packed: true }, 'owner')).status, 200);
    assert.equal((await find(each.id)).kind, 'each');
    assert.deepEqual((await find(each.id)).packedBy, ['editor', 'owner']);
    db.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = 'editor'").run(trip.id);
    assert.deepEqual((await find(each.id)).packedBy, ['owner'], 'a departed member no longer shows as packed');
    db.prepare("INSERT INTO trip_members (trip_id,user_id,role) VALUES (?, 'editor', 'editor')").run(trip.id);

    const mine = { id: randomUUID(), name: 'コンタクトレンズ', category: 'その他', quantity: 1, packed: false, assignee: '', shared: false, kind: 'mine' };
    assert.equal((await call(base, 'POST', mine, 'editor')).status, 201);
    assert.equal((await find(mine.id, 'editor')).kind, 'mine');
    assert.equal(await find(mine.id, 'owner'), undefined, 'another member never receives a private item');
    assert.equal((await call(`${base}/${mine.id}`, 'PATCH', { ...mine, name: '覗き見' }, 'owner')).status, 404);
    assert.equal((await call(base, 'POST', { ...mine, name: '上書き' }, 'owner')).status, 409);
    assert.equal((await call(`${base}/${mine.id}`, 'DELETE', undefined, 'owner')).status, 404);
    assert.equal((await find(mine.id, 'editor')).name, 'コンタクトレンズ');
    // Sharing it again is the owner's choice.
    assert.equal((await call(`${base}/${mine.id}`, 'PATCH', { ...mine, kind: 'each' }, 'editor')).status, 200);
    assert.equal((await find(mine.id, 'owner')).kind, 'each');
    assert.equal((await call(`${base}/${mine.id}`, 'PATCH', { ...mine, kind: 'secret' }, 'editor')).status, 400);
    // A 自分だけ item whose owner's account is gone goes to the trip's owner, who can delete it.
    const orphan = { ...mine, id: randomUUID(), name: '持ち主のいない物' };
    assert.equal((await call(base, 'POST', orphan, 'editor')).status, 201);
    db.prepare('UPDATE packing_kinds SET owner_id = NULL WHERE item_id = ?').run(orphan.id);
    assert.equal((await find(orphan.id, 'owner')).name, orphan.name);
    assert.equal(await find(orphan.id, 'editor'), undefined);
    assert.equal((await call(`${base}/${orphan.id}`, 'DELETE', undefined, 'editor')).status, 404);
    assert.equal((await call(`${base}/${orphan.id}`, 'DELETE', undefined, 'owner')).status, 204);
    // A 1つでいい item whose carrier left the trip is anyone's to tick or take.
    db.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = 'editor'").run(trip.id);
    assert.equal((await call(`${base}/${legacy.id}`, 'PATCH', { ...legacy, packed: false })).status, 200);
    assert.equal((await find(legacy.id)).packed, false);
    assert.equal((await call(`${base}/${legacy.id}`, 'PATCH', { ...legacy, packed: true, assignee: 'member:owner' })).status, 200);
    assert.equal((await find(legacy.id)).packed, true, 'claiming keeps the tick');
    db.prepare("INSERT INTO trip_members (trip_id,user_id,role) VALUES (?, 'editor', 'editor')").run(trip.id);
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await find(each.id)).kind, 'each', 'kinds survive schema reruns');
    assert.equal((await call(`${base}/${each.id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM packing_marks WHERE item_id = ?').get(each.id).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM packing_kinds WHERE item_id = ?').get(each.id).n, 0);
  } finally { db.close(); }
});
test('task kinds: old tasks read as 1人がやる, 全員がやる is one row ticked per member', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/tasks`;
    const find = async (id, user = 'owner') => (await (await call(base, 'GET', undefined, user)).json()).tasks.find((task) => task.id === id);
    const old = { id: randomUUID(), title: 'ホテルを予約', dueOn: '', assignee: 'member:editor', done: true };
    assert.equal((await call(base, 'POST', old)).status, 201);
    assert.equal((await find(old.id)).kind, 'one', 'tasks without a kind are 1人がやる');
    assert.equal((await find(old.id)).done, true);
    const each = { id: randomUUID(), title: '保険に入る', dueOn: '', assignee: '', done: false, kind: 'each' };
    assert.equal((await call(base, 'POST', each)).status, 201);
    const ticked = await call(`${base}/${each.id}`, 'PATCH', { ...each, done: true }, 'editor');
    assert.deepEqual((await ticked.json()).task.doneBy, ['editor']);
    assert.equal((await find(each.id, 'editor')).done, true, 'done is the reader’s own tick');
    assert.equal((await find(each.id, 'owner')).done, false);
    // An older client omits the kind; the stored kind stays.
    const { kind: _kind, ...older } = each;
    assert.equal((await call(`${base}/${each.id}`, 'PATCH', { ...older, done: true }, 'owner')).status, 200);
    assert.equal((await find(each.id)).kind, 'each');
    assert.deepEqual((await find(each.id)).doneBy, ['editor', 'owner']);
    assert.equal((await call(`${base}/${each.id}`, 'PATCH', { ...each, kind: 'many' })).status, 400);
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await find(each.id)).kind, 'each', 'kinds survive schema reruns');
    assert.equal((await call(`${base}/${each.id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_marks WHERE task_id = ?').get(each.id).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_kinds WHERE task_id = ?').get(each.id).n, 0);
  } finally { db.close(); }
});
test('multiple place links and unavailable reservations round-trip without losing legacy data', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/places`, id = randomUUID();
    const read = async () => (await (await call(base)).json()).places.find((item) => item.id === id);
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    assert.deepEqual((await read()).referenceLinks, []);
    const referenceLinks = [{ label: '公式サイト', url: 'https://museum.example/' }, { label: '', url: 'https://museum.example/exhibitions?a=1&b=2' }];
    const input = { ...place, reservationStatus: 'unavailable', referenceLinks };
    assert.equal((await call(`${base}/${id}`, 'PATCH', input, 'editor')).status, 200);
    assert.deepEqual((await read()).referenceLinks, referenceLinks);
    assert.equal((await read()).reservationStatus, 'unavailable');
    // Older queued clients omit links; both PATCH and replayed POST retain them.
    assert.equal((await call(`${base}/${id}`, 'PATCH', place)).status, 200);
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    assert.deepEqual((await read()).referenceLinks, referenceLinks);
    assert.equal((await read()).reservationStatus, 'needed');
    for (const links of [[{ label: '', url: 'javascript:alert(1)' }], [{ label: '', url: 'https://' }], [{ label: '', url: 'museum.example' }], [{ label: '', url: 'https://user:pass@museum.example' }], [{ label: '', url: 'https://museum.example/' + 'a'.repeat(2000) }], Array(21).fill(referenceLinks[0]), null]) {
      assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, referenceLinks: links })).status, 400);
    }
    assert.equal((await call(`${base}/${id}`, 'PATCH', input, 'outsider')).status, 403);
    assert.deepEqual((await read()).referenceLinks, referenceLinks);
    const other = { ...trip, id: randomUUID() };
    assert.equal((await call('/trips', 'POST', other)).status, 201);
    assert.equal((await call(`/trips/${other.id}/places`, 'POST', { id, ...input })).status, 409);
    assert.deepEqual((await read()).referenceLinks, referenceLinks);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...input, referenceLinks: [referenceLinks[1]] })).status, 200);
    assert.deepEqual((await read()).referenceLinks, [referenceLinks[1]]);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...input, referenceLinks: [] })).status, 200);
    assert.deepEqual((await read()).referenceLinks, []);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM place_details WHERE place_id = ?').get(id).n, 0);
  } finally { db.close(); }
});
test('place coordinates come from Google Maps links, follow one short-link redirect and survive unchanged edits', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/places`, id = randomUUID();
    const read = async () => (await (await call(base)).json()).places.find((item) => item.id === id);
    const long = 'https://www.google.com/maps/place/Belvedere/@48.19,16.38,17z/data=!4m6!3m5!8m2!3d48.19149!4d16.38085';
    const created = await call(base, 'POST', { id, ...place, location: long });
    assert.equal(created.status, 201);
    assert.deepEqual([(await created.json()).place.lat, (await read()).lng], [48.19149, 16.38085]);
    // A short link is resolved through its redirect without following it further.
    shortLinkRequests.length = 0;
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, location: 'https://maps.app.goo.gl/stephansdom' })).status, 200);
    assert.deepEqual(shortLinkRequests, [{ url: 'https://maps.app.goo.gl/stephansdom', redirect: 'manual' }]);
    assert.deepEqual([(await read()).lat, (await read()).lng], [48.20849, 16.37314]);
    // An unchanged link keeps its pin without asking Google again; lat/lng sent by clients are ignored.
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, location: 'https://maps.app.goo.gl/stephansdom', title: '大聖堂', lat: 1, lng: 2 })).status, 200);
    assert.equal(shortLinkRequests.length, 1);
    assert.deepEqual([(await read()).lat, (await read()).lng], [48.20849, 16.37314]);
    // A link without a position, or an address, clears the old pin.
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, location: 'https://maps.app.goo.gl/somewhere' })).status, 200);
    assert.deepEqual([(await read()).lat, (await read()).lng], [null, null]);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, location: long })).status, 200);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, location: 'Prinz-Eugen-Straße 27, Wien' })).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM place_coordinates').get().n, 0);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, location: long })).status, 200);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM place_coordinates').get().n, 0, 'coordinates go with the place');
    // iPhone share links: the page's pin, else the address on OpenStreetMap.
    const iphone = randomUUID(), market = randomUUID(), nowhere = randomUUID();
    await call(base, 'POST', { id: iphone, ...place, location: 'https://maps.app.goo.gl/iphone?g_st=ic' });
    await call(base, 'POST', { id: market, ...place, location: 'https://maps.app.goo.gl/market?g_st=ic' });
    const pins = Object.fromEntries((await (await call(base)).json()).places.map((entry) => [entry.id, [entry.lat, entry.lng]]));
    assert.deepEqual(pins[iphone], [48.83411, 9.15224]);
    assert.deepEqual(pins[market], [48.7758, 9.1829]);
    const resolved = await (await call(`/maps/resolve?url=${encodeURIComponent('https://maps.app.goo.gl/iphone?g_st=ic')}`)).json();
    assert.deepEqual([resolved.name, resolved.lat], ['Porsche Museum', 48.83411]);
    const android = await (await call(`/maps/resolve?url=${encodeURIComponent('https://maps.app.goo.gl/android?g_st=ac')}`)).json();
    assert.deepEqual([android.name, android.lat, android.lng], ['Café Central', 48.2105, 16.3654], 'the page camera gives the pin');
    const titled = await (await call(`/maps/resolve?url=${encodeURIComponent('https://maps.app.goo.gl/android2?g_st=ac')}`)).json();
    assert.deepEqual([titled.name, titled.lat], ['Café Sacher', 48.2039], 'else the page title is looked up');
    const lite = await (await call(`/maps/resolve?url=${encodeURIComponent('https://maps.app.goo.gl/schlossplatz?g_st=ac')}`)).json();
    assert.deepEqual([lite.lat, lite.lng], [48.7784, 9.1793], 'the place page is read as a desktop browser, not Maps lite');
    const street = await (await call(`/maps/resolve?url=${encodeURIComponent('https://maps.app.goo.gl/koenig?g_st=ac')}`)).json();
    assert.deepEqual([street.lat, street.lng], [48.783, 9.181], 'the address is looked up without its Japanese name');
    // A link that gives nothing is not asked again on the next list read.
    db.prepare('INSERT INTO places (id, trip_id, title, location, updated_by) VALUES (?,?,?,?,?)').run(nowhere, trip.id, 'どこか', 'https://maps.app.goo.gl/somewhere', 'owner');
    await call(base);
    const asked = shortLinkRequests.length;
    await call(base);
    assert.equal(shortLinkRequests.length, asked, 'a miss is skipped for a day');
  } finally { db.close(); }
});
test('place itinerary links survive title edits and old clients, but clear after plan deletion', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/places`, id = randomUUID(), itemId = randomUUID();
    const plan = { id: itemId, day: trip.startsOn, time: '', kind: '予定', title: place.title, note: place.note + '\n' + place.location };
    const read = async () => (await (await call(base)).json()).places.find((entry) => entry.id === id);
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    assert.equal((await call(`/trips/${trip.id}/items`, 'POST', plan)).status, 201);
    // An old client still sends 訪問ステータス; it is ignored.
    for (const status of ['want', 'planned', 'visited', 'skipped']) {
      assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, title: '改名', status, itineraryItemId: itemId })).status, 200);
      assert.equal((await read()).status, undefined);
      assert.equal((await read()).itineraryItemId, itemId);
    }
    assert.equal((await call(`${base}/${id}`, 'PATCH', place)).status, 200);
    assert.equal((await read()).itineraryItemId, itemId);
    const other = { ...trip, id: randomUUID() }, otherItem = randomUUID();
    await call('/trips', 'POST', other);
    await call(`/trips/${other.id}/items`, 'POST', { ...plan, id: otherItem });
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, itineraryItemId: otherItem })).status, 400);
    assert.equal((await read()).itineraryItemId, itemId);
    assert.equal((await call(`/trips/${trip.id}/items/${itemId}`, 'DELETE')).status, 204);
    assert.equal((await read()).itineraryItemId, null);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, itineraryItemId: itemId })).status, 200);
    const replacement = randomUUID();
    await call(`/trips/${trip.id}/items`, 'POST', { ...plan, id: replacement });
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await read()).itineraryItemId, null, 'migration does not relink a deleted plan');
    await call(`${base}/${id}`, 'PATCH', { ...place, itineraryItemId: replacement });
    assert.equal((await read()).itineraryItemId, replacement);
  } finally { db.close(); }
});
test('legacy additions are recovered once only when both place and plan are unambiguous', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/places`, id = randomUUID(), itemId = randomUUID();
    await call(base, 'POST', { id, ...place, status: 'planned' });
    await call(`/trips/${trip.id}/items`, 'POST', { id: itemId, day: trip.startsOn, time: '', kind: '予定', title: place.title, note: place.note + '\n' + place.location });
    db.prepare('DELETE FROM place_itinerary_links WHERE place_id = ?').run(id);
    const schema = await readFile('worker/schema.sql', 'utf8');
    db.exec(schema); db.exec(schema);
    assert.equal(db.prepare('SELECT item_id FROM place_itinerary_links WHERE place_id = ?').get(id).item_id, itemId);
    await call(base, 'POST', { id: randomUUID(), ...place });
    db.exec('DELETE FROM place_itinerary_links');
    db.exec(schema);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM place_itinerary_links WHERE item_id IS NOT NULL').get().n, 0);
  } finally { db.close(); }
});
test('places CRUD is shared, validated, scoped and replay-safe', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/places`, id = randomUUID();
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    assert.equal((await call(base, 'POST', { id, ...place })).status, 201);
    const items = (await (await call(base, 'GET', undefined, 'editor')).json()).places;
    assert.equal(items.length, 1); assert.equal(items[0].openingHours, place.openingHours);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...place, reservationStatus: 'confirmed' }, 'editor')).status, 200);
    assert.equal((await call(base, 'POST', { ...place, reservationStatus: 'invalid' })).status, 400);
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

test('members are scoped and only owners can change roles or remove people', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/members`;
    assert.equal((await call(base, 'GET', undefined, 'outsider')).status, 403);
    assert.equal((await (await call(base, 'GET', undefined, 'editor')).json()).members.length, 2);
    for (const actor of ['editor', 'outsider']) {
      assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'viewer' }, actor)).status, 403);
      assert.equal((await call(`${base}/editor`, 'DELETE', undefined, actor)).status, 403);
      assert.equal((await call(`/trips/${trip.id}/invites`, 'POST', undefined, actor)).status, 403);
      assert.equal((await call(`/trips/${trip.id}/invites`, 'DELETE', undefined, actor)).status, 403);
    }
    assert.equal((await call(`${base}/owner`, 'DELETE')).status, 409);
    assert.equal((await call(`${base}/owner`, 'PATCH', { role: 'viewer' })).status, 409);
    assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'owner' })).status, 400);
    assert.equal((await call(`${base}/outsider`, 'PATCH', { role: 'viewer' })).status, 404);
    assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'viewer' })).status, 200);
    assert.equal((await (await call('/trips', 'GET', undefined, 'editor')).json()).trips[0].role, 'viewer');
    assert.equal((await call(`${base}/editor`, 'PATCH', { role: 'editor' })).status, 200);
    assert.equal((await (await call('/trips', 'GET', undefined, 'editor')).json()).trips[0].role, 'editor');
    assert.equal((await call(`${base}/editor`, 'DELETE')).status, 204);
    assert.equal((await call(`/trips/${trip.id}/places`, 'GET', undefined, 'editor')).status, 403);
    assert.equal((await (await call('/trips', 'GET', undefined, 'editor')).json()).trips.length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM trip_member_permissions').get().n, 0);
  } finally { db.close(); }
});

test('viewers can read every collection but cannot mutate trips, plans, documents or membership', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}`;
    await call(`${base}/members/editor`, 'PATCH', { role: 'viewer' });
    for (const collection of ['items', 'bookings', 'packing', 'tasks', 'places', 'booking-documents', 'members']) {
      assert.equal((await call(`${base}/${collection}`, 'GET', undefined, 'editor')).status, 200, collection);
    }
    for (const [path, method] of [
      ['', 'PATCH'], ['', 'DELETE'], ['/items', 'POST'], ['/items/id', 'PATCH'], ['/items/id', 'DELETE'],
      ['/bookings', 'POST'], ['/bookings/id', 'PATCH'], ['/bookings/id', 'DELETE'], ['/bookings/id/connection', 'PATCH'],
      ['/bookings/id/documents', 'POST'], ['/bookings/id/documents/doc', 'DELETE'],
      ['/packing', 'POST'], ['/packing/id', 'PATCH'], ['/packing/id', 'DELETE'],
      ['/tasks', 'POST'], ['/tasks/id', 'PATCH'], ['/tasks/id', 'DELETE'],
      ['/places', 'POST'], ['/places/id', 'PATCH'], ['/places/id', 'DELETE'],
      ['/invites', 'POST'], ['/invites', 'DELETE'], ['/members/owner', 'PATCH'], ['/members/owner', 'DELETE'],
    ]) assert.equal((await call(base + path, method, { role: 'editor' }, 'editor')).status, 403, `${method} ${path}`);
    await call(`${base}/members/editor`, 'PATCH', { role: 'editor' });
    assert.equal((await call(`${base}/places`, 'POST', place, 'editor')).status, 201);
  } finally { db.close(); }
});

test('revoked links cannot be used and removing a member also revokes outstanding invites', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}`;
    const token = async () => new URL((await (await call(`${base}/invites`, 'POST')).json()).invite.url).searchParams.get('invite');
    const first = await token();
    await call(`${base}/invites`, 'DELETE');
    assert.equal((await call(`/invites/${first}/accept`, 'POST', undefined, 'outsider')).status, 404);
    const second = await token();
    await call(`${base}/members/editor`, 'DELETE');
    assert.equal((await call(`/invites/${second}/accept`, 'POST', undefined, 'editor')).status, 404);
    const third = await token();
    assert.equal((await call(`/invites/${third}/accept`, 'POST', undefined, 'outsider')).status, 200);
    assert.equal((await call(`/invites/${third}/accept`, 'POST', undefined, 'editor')).status, 404);
    assert.equal((await (await call('/trips', 'GET', undefined, 'outsider')).json()).trips[0].role, 'editor');
  } finally { db.close(); }
});

test('profile edits are validated, account-scoped and visible to trip members', async () => {
  const { db, call, trip } = await fixture();
  try {
    db.prepare('INSERT INTO user_profiles(user_id, avatar_url) VALUES (?, ?)').run('owner', 'https://lh3.googleusercontent.com/example');
    assert.equal((await call('/me', 'PATCH', { name: '   ' })).status, 400);
    assert.equal((await call('/me', 'PATCH', { name: 'a'.repeat(101) })).status, 400);
    assert.equal((await call('/me', 'PATCH', { name: '  翼  ', id: 'editor', avatarUrl: 'https://untrusted.test/image' })).status, 200);
    const { user } = await (await call('/me')).json();
    assert.equal(user.name, '翼');
    assert.equal(user.avatarUrl, 'https://lh3.googleusercontent.com/example');
    assert.equal((await (await call('/me', 'GET', undefined, 'editor')).json()).user.name, null);
    const { members } = await (await call(`/trips/${trip.id}/members`, 'GET', undefined, 'editor')).json();
    assert.equal(members.find((member) => member.id === 'owner').name, '翼');
    assert.equal(members.find((member) => member.id === 'owner').avatarUrl, user.avatarUrl);
  } finally { db.close(); }
});

test('task assignments use current trip members and preserve existing legacy assignments', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/tasks`;
    const task = { id: randomUUID(), title: '準備', dueOn: '', assignee: 'member:editor', done: false };
    assert.equal((await call(base, 'POST', task)).status, 201);
    assert.equal((await call(base, 'POST', task)).status, 201);
    await call('/me', 'PATCH', { name: '同行者の新しい名前' }, 'editor');
    assert.equal((await (await call(base)).json()).tasks[0].assignee, 'member:editor');
    assert.equal((await call(base, 'POST', { ...task, id: randomUUID(), assignee: 'member:outsider' })).status, 400);
    assert.equal((await call(base, 'POST', { ...task, id: randomUUID(), assignee: '手入力' })).status, 400);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', task, 'outsider')).status, 403);
    db.prepare('UPDATE travel_tasks SET assignee = ? WHERE id = ?').run('既存の名前', task.id);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', { ...task, assignee: '既存の名前', done: true })).status, 200);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', { ...task, assignee: '' })).status, 200);
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', task)).status, 200);
    db.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?').run(trip.id, 'editor');
    assert.equal((await call(`${base}/${task.id}`, 'PATCH', { ...task, done: true })).status, 200);
    assert.equal((await call(base, 'POST', { ...task, id: randomUUID() })).status, 400);
  } finally { db.close(); }
});

test('booking map locations preserve legacy addresses and round-trip URLs safely', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/bookings`;
    const input = { id: randomUUID(), kind: 'hotel', title: 'Hotel Astoria', detail: 'Kärntner Straße 32, Wien', day: '2026-11-22', endDay: '2026-11-24', time: '15:00', endTime: '11:00' };
    assert.equal((await call(base, 'POST', input)).status, 201);
    const read = async () => (await (await call(base)).json()).bookings.find((booking) => booking.id === input.id);
    assert.equal((await read()).location, input.detail);
    const location = `https://www.google.com/maps/place/${'a'.repeat(700)}`;
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, detail: location, location })).status, 200);
    assert.equal((await read()).location, location);
    // A queued write from an older client must not clear the newly saved URL.
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', input)).status, 200);
    assert.equal((await read()).location, location);
    for (const location of ['javascript:alert(1)', 'https://', 'a'.repeat(2001)]) {
      assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, location })).status, 400);
    }
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, location: 'Tokyo' }, 'outsider')).status, 403);
    assert.equal((await read()).location, location);
    assert.equal((await call(`${base}/${input.id}`, 'PATCH', { ...input, location: '' })).status, 200);
    assert.equal((await read()).location, '');
    const restaurant = { ...input, id: randomUUID(), kind: 'restaurant', detail: '2名・テーブル席', location: 'https://maps.app.goo.gl/example' };
    assert.equal((await call(base, 'POST', restaurant)).status, 201);
    assert.equal((await call(base, 'POST', restaurant)).status, 201);
    const dining = (await (await call(base)).json()).bookings.find((booking) => booking.id === restaurant.id);
    assert.equal(dining.location, restaurant.location);
    assert.equal(dining.detail, restaurant.detail);
    assert.equal((await call(`${base}/${input.id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_locations WHERE booking_id = ?').get(input.id).n, 0);
  } finally { db.close(); }
});


test('travel notes preserve text, replay safely and enforce trip permissions', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/notes`, id = randomUUID();
    const note = { id, body: '旅のメモ\n\n☐ 買い物\n  空白も残す  \n', pinned: true };
    for (let replay = 0; replay < 2; replay++) assert.equal((await call(base, 'POST', note, 'editor')).status, 201);
    const read = async () => (await (await call(base)).json()).notes;
    assert.equal((await read()).length, 1);
    assert.equal((await read())[0].body, note.body);
    assert.equal((await read())[0].pinned, true);
    assert.equal((await call(base, 'POST', { ...note, pinned: false })).status, 201);
    assert.equal((await read())[0].pinned, false);
    assert.equal((await call(base, 'POST', { ...note, pinned: 'yes' })).status, 400);
    assert.equal((await call(base, 'POST', { ...note, body: 'a'.repeat(50001) })).status, 400);
    assert.equal((await call(base, 'GET', undefined, 'outsider')).status, 403);
    assert.equal((await call(base, 'POST', note, 'outsider')).status, 403);
    db.prepare("INSERT INTO trip_member_permissions(trip_id,user_id,read_only) VALUES (?, 'editor', 1)").run(trip.id);
    assert.equal((await call(base, 'GET', undefined, 'editor')).status, 200);
    assert.equal((await call(base, 'POST', note, 'editor')).status, 403);
    assert.equal((await call(`${base}/${id}`, 'DELETE', undefined, 'editor')).status, 403);
    const other = { ...trip, id: randomUUID() };
    await call('/trips', 'POST', other);
    assert.equal((await call(`/trips/${other.id}/notes`, 'POST', note)).status, 409);
    await call(`/trips/${other.id}/notes/${id}`, 'DELETE');
    assert.equal((await read()).length, 1);
    await call(`${base}/${id}`, 'DELETE');
    assert.equal((await read()).length, 0);
    await call(base, 'POST', note);
    await call(`/trips/${trip.id}`, 'DELETE');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM travel_notes').get().n, 0);
  } finally { db.close(); }
});

test('notes link to a place of the same trip, survive old clients and schema reruns, and unlink when the place goes', async () => {
  const { db, call, trip } = await fixture();
  try {
    const placeId = randomUUID(), otherPlace = randomUUID(), id = randomUUID();
    assert.equal((await call(`/trips/${trip.id}/places`, 'POST', { id: placeId, ...place })).status, 201);
    const other = { ...trip, id: randomUUID() };
    await call('/trips', 'POST', other);
    assert.equal((await call(`/trips/${other.id}/places`, 'POST', { id: otherPlace, ...place })).status, 201);
    const base = `/trips/${trip.id}/notes`;
    const read = async () => (await (await call(base)).json()).notes.find((note) => note.id === id);
    const note = { id, title: '美術館で見たいもの', body: '- [ ] 展示', pinned: false, placeId };
    assert.equal((await call(base, 'POST', note)).status, 201);
    assert.equal((await read()).placeId, placeId);
    // Old clients send only text: the link stays.
    assert.equal((await call(base, 'POST', { id, title: note.title, body: '- [x] 展示' }, 'editor')).status, 201);
    assert.equal((await read()).placeId, placeId);
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await read()).placeId, placeId);
    // Another trip's place is never linked.
    assert.equal((await call(base, 'POST', { ...note, placeId: otherPlace })).status, 201);
    assert.equal((await read()).placeId, null);
    assert.equal((await call(base, 'POST', { ...note, placeId: 'not-an-id' })).status, 400);
    assert.equal((await call(base, 'POST', note)).status, 201);
    assert.equal((await call(`/trips/${trip.id}/places/${placeId}`, 'DELETE')).status, 204);
    assert.equal((await read()).placeId, null);
    assert.equal((await read()).body, note.body);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM note_places').get().n, 0);
  } finally { db.close(); }
});

test('bookings link to a place of the same trip, survive old clients and schema reruns, and unlink when the place goes', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/bookings`;
    const placeId = randomUUID(), id = randomUUID(), legacy = randomUUID();
    assert.equal((await call(`/trips/${trip.id}/places`, 'POST', { id: placeId, ...place, location: 'https://www.google.com/maps/@48.2,16.37,17z' })).status, 201);
    const other = { ...trip, id: randomUUID() };
    assert.equal((await call('/trips', 'POST', other)).status, 201);
    const otherPlace = randomUUID();
    assert.equal((await call(`/trips/${other.id}/places`, 'POST', { id: otherPlace, ...place, location: '' })).status, 201);
    const read = async (bookingId) => (await (await call(base)).json()).bookings.find((entry) => entry.id === bookingId);
    const booking = { kind: 'ticket', title: '魔笛', detail: 'ウィーン国立歌劇場', day: '2026-11-23', time: '19:00', confirmationCode: '', note: '' };
    // Old rows and old clients: no link, read back as null.
    assert.equal((await call(base, 'POST', { id: legacy, ...booking })).status, 201);
    assert.equal((await read(legacy)).placeId, null);
    const created = await call(base, 'POST', { id, ...booking, placeId });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).booking.placeId, placeId);
    assert.equal((await read(id)).placeId, placeId);
    // An old client's edit omits placeId and keeps the link; a rerun schema keeps it too.
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...booking, title: '魔笛（再演）' })).status, 200);
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await read(id)).placeId, placeId);
    // Another trip's place links nothing; a malformed id is rejected; null unlinks.
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...booking, placeId: otherPlace })).status, 200);
    assert.equal((await read(id)).placeId, null);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...booking, placeId: 'not an id' })).status, 400);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...booking, placeId })).status, 200);
    assert.equal((await read(id)).placeId, placeId);
    assert.equal((await call(`/trips/${trip.id}/places/${placeId}`, 'DELETE')).status, 204);
    assert.equal((await read(id)).placeId, null);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_places').get().n, 0);
  } finally { db.close(); }
});

test('plan categories and transport metadata survive sync, old clients and schema reruns', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/items`, id = randomUUID();
    const legacy = { id, day: '2026-11-21', time: '23:40', kind: '予定', title: '夜行バス', note: '2番乗り場' };
    const read = async () => (await (await call(base)).json()).items.find((item) => item.id === id);
    assert.equal((await call(base, 'POST', legacy)).status, 201);
    assert.equal((await read()).details, undefined);
    const details = { category: 'transport', location: '', endDay: '2026-11-22', endTime: '06:10', transport: { mode: 'bus', origin: '駅前', destination: '中央駅', durationMinutes: 390 } };
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, details })).status, 200);
    assert.deepEqual((await read()).details, details);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, note: '変更' }, 'editor')).status, 200);
    assert.equal((await call(base, 'POST', legacy)).status, 201);
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.deepEqual((await read()).details, details);
    for (const invalid of [null, { ...details, category: 'unknown' }, { ...details, endDay: '2026-11-21' }, { ...details, endTime: '25:00' }, { ...details, transport: { ...details.transport, mode: 'teleport' } }, { ...details, transport: { ...details.transport, durationMinutes: -1 } }, { ...details, transport: { ...details.transport, durationMinutes: 1.5 } }]) {
      assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, details: invalid })).status, 400);
    }
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, details }, 'outsider')).status, 403);
    const other = { ...trip, id: randomUUID() };
    assert.equal((await call('/trips', 'POST', other)).status, 201);
    assert.equal((await call(`/trips/${other.id}/items`, 'POST', { ...legacy, details: { category: 'meal', location: 'カフェ', endDay: '', endTime: '' } })).status, 409);
    assert.deepEqual((await read()).details, details);
    assert.equal((await call(`/trips/${other.id}/items/${id}`, 'PATCH', { ...legacy, details })).status, 404);
    const meal = { category: 'meal', location: 'カフェ', endDay: '', endTime: '' };
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, time: '', details: meal })).status, 200);
    assert.deepEqual((await read()).details, meal);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM itinerary_details WHERE item_id = ?').get(id).n, 0);
  } finally { db.close(); }
});

test('ticket journey times round-trip, survive old clients, reset to automatic, and stay trip-scoped', async () => {
  const { db, call, trip } = await fixture();
  try {
    const base = `/trips/${trip.id}/bookings`, id = randomUUID();
    const legacy = { id, kind: 'train', title: '国際列車', detail: '', origin: 'パリ', destination: 'ロンドン', originCode: '', destinationCode: '', day: '2026-11-21', time: '11:00', endDay: '2026-11-21', endTime: '12:20', confirmationCode: '', note: '' };
    const read = async () => (await (await call(base)).json()).bookings.find((booking) => booking.id === id);
    assert.equal((await call(base, 'POST', { ...legacy, durationMinutes: 140 })).status, 201);
    assert.equal((await read()).durationMinutes, 140);
    assert.equal((await call(`${base}/${id}`, 'PATCH', legacy)).status, 200);
    assert.equal((await call(base, 'POST', legacy)).status, 201);
    db.exec(await readFile('worker/schema.sql', 'utf8'));
    assert.equal((await read()).durationMinutes, 140);
    for (const durationMinutes of [0, -1, 1.5, 10081, '140']) assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, durationMinutes })).status, 400);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, durationMinutes: 100 }, 'outsider')).status, 403);
    const other = { ...trip, id: randomUUID() };
    assert.equal((await call('/trips', 'POST', other)).status, 201);
    assert.equal((await call(`/trips/${other.id}/bookings`, 'POST', { ...legacy, durationMinutes: 100 })).status, 409);
    assert.equal((await call(`/trips/${other.id}/bookings/${id}`, 'PATCH', { ...legacy, durationMinutes: 100 })).status, 404);
    assert.equal((await read()).durationMinutes, 140);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, durationMinutes: null })).status, 200);
    assert.equal((await read()).durationMinutes, null);
    assert.equal((await call(`${base}/${id}`, 'PATCH', { ...legacy, kind: 'flight', originCode: 'NRT', destinationCode: 'LAX', day: '2026-11-22', time: '00:30', endDay: '2026-11-21', endTime: '17:30' })).status, 200);
    assert.equal((await call(`${base}/${id}`, 'DELETE')).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_durations WHERE booking_id = ?').get(id).n, 0);
  } finally { db.close(); }
});
