import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const template = await readFile('scripts/service-worker.js', 'utf8');
async function fixture() {
  const listeners = {}, stores = new Map(); let activated = false, claimed = false, online = true;
  const network = [], deleted = [];
  const caches = {
    async open(key) {
      if (!stores.has(key)) stores.set(key, new Map()); const store = stores.get(key);
      return { async addAll(urls) { if (!online) throw new Error('offline'); for (const url of urls) store.set(url, new Response(url === '/index.html' ? 'APP SHELL' : 'asset')); }, async match(url) { return store.get(typeof url === 'string' ? url : new URL(url.url).pathname)?.clone(); } };
    },
    async match(request) { for (const key of stores.keys()) { const match = await (await caches.open(key)).match(request); if (match) return match; } },
    async keys() { return [...stores.keys()]; }, async delete(key) { deleted.push(key); return stores.delete(key); },
  };
  vm.runInNewContext(template.replace('__VERSION__', 'test').replace('__PRECACHE__', JSON.stringify(['/index.html', '/app.js'])), {
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: () => { activated = true; }, clients: { claim: async () => { claimed = true; } }, location: { origin: 'https://tabi.test' } },
    caches, URL, fetch: async (request) => { network.push(request.url); if (!online) throw new Error('offline'); return new Response('network'); },
  });
  const lifecycle = async (name) => { let pending; listeners[name]({ waitUntil: (promise) => { pending = promise; } }); await pending; };
  const fetch = (path, options = {}) => { let response; listeners.fetch({ request: { method: 'GET', url: `https://tabi.test${path}`, mode: 'cors', ...options }, respondWith: (value) => { response = Promise.resolve(value); } }); return response; };
  return { lifecycle, fetch, listeners, stores, network, deleted, offline: () => { online = false; }, activated: () => activated, claimed: () => claimed };
}
test('installed shell and bundles support deep-link offline reload without caching account APIs', async () => {
  const f = await fixture(); await f.lifecycle('install'); f.offline();
  assert.equal(await (await f.fetch('/trips/abc/places', { mode: 'navigate' })).text(), 'APP SHELL');
  assert.equal(await (await f.fetch('/app.js')).text(), 'asset');
  assert.equal(f.fetch('/v1/trips'), undefined);
  assert.equal(f.fetch('/v1/trips/a/places', { method: 'POST' }), undefined);
  assert.equal(f.fetch('/sw.js'), undefined);
  assert.equal(f.network.length, 0);
});
test('updates wait for consent and keep one previous shell for active tabs', async () => {
  const f = await fixture();
  f.stores.set('tabi-shell-old1', new Map()); f.stores.set('tabi-shell-old2', new Map()); f.stores.set('other-app-cache', new Map());
  await f.lifecycle('install'); assert.equal(f.activated(), false);
  f.listeners.message({ data: { type: 'ACTIVATE_UPDATE' } }); assert.equal(f.activated(), true);
  await f.lifecycle('activate'); assert.equal(f.claimed(), true);
  assert.deepEqual(f.deleted, ['tabi-shell-old1']); assert.ok(f.stores.has('other-app-cache'));
});
