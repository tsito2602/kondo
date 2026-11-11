import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// しおりを渡す: the parent sheet built from the demo trip (Japan time, nights, flights).
const { outputFiles } = await build({
  stdin: { contents: `export * from './src/data/parent-sheet'; export { createDemoCache } from './src/data/demo';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
});
const mod = { exports: {} };
new Function('module', 'exports', outputFiles[0].text)(mod, mod.exports);
const { buildParentSheet, japanTime, createDemoCache } = mod.exports;

const cache = createDemoCache();
const trip = cache.trips.find((entry) => entry.id === cache.selectedTripId);
const sheet = buildParentSheet({ trip, items: cache.itemsByTrip[trip.id], bookings: cache.bookingsByTrip[trip.id], places: cache.placesByTrip[trip.id], now: new Date(2026, 10, 11) });

test('Japan time sits beside local time, with 翌 when Japan is a day ahead', () => {
  assert.deepEqual(japanTime('2026-11-25', '17:30', 'Europe/Vienna'), { time: '1:30', mark: '翌', japan: false });
  assert.equal(japanTime('2026-11-25', '17:30', 'Asia/Tokyo').japan, true);
  const vienna = sheet.days[2];
  assert.equal(vienna.japanOnly, false);
  assert.ok(vienna.rows.every((row) => !row.time || row.japan));
  // The departure day keeps Japan time already: no 日本 column.
  assert.equal(sheet.days[0].japanOnly, true);
});

test('each day says where the night is spent and where we are', () => {
  assert.deepEqual(sheet.days.map((day) => day.route).slice(0, 2), ['成田 → ドバイ', 'ドバイ → ウィーン']);
  assert.equal(sheet.days[0].night.text, '機内');
  assert.equal(sheet.days[1].night.glyph, 'bed');
  assert.match(sheet.days.at(-1).night.text, /成田に帰ってきます/);
});

test('the first sheet lists flights, hotels and the time difference, nothing private', () => {
  assert.equal(sheet.flights.length, 4);
  assert.equal(sheet.flights[0].times, '22:20 → 翌05:30');
  assert.equal(sheet.flights[0].japan, '日本 22:20 → 翌10:30');
  assert.equal(sheet.hotels[0].span, '11/25(水) 〜 11/27(金) · 2泊');
  assert.deepEqual(sheet.offsets.map((offset) => offset.hours).sort(), ['−5', '−8']);
  assert.equal(sheet.asOf, '11月11日 時点の予定');
  const words = JSON.stringify(sheet);
  for (const secret of ['K7Q2PX', '40921776', '座席']) assert.ok(!words.includes(secret), secret);
});

test('a day without flights is where the last flight landed, not every city of the trip', () => {
  const flight = (id, from, to, day, time, endDay, endTime) => ({ id, kind: 'flight', title: id, detail: '', location: '', origin: '', originCode: from, destination: '', destinationCode: to, day, time, endDay, endTime, confirmationCode: '', note: '' });
  const bookings = [
    flight('CA422', 'HND', 'PEK', '2026-11-21', '21:00', '2026-11-22', '00:20'),
    flight('CA841', 'PEK', 'VIE', '2026-11-22', '03:00', '2026-11-22', '06:20'),
    flight('EW2759', 'VIE', 'STR', '2026-11-24', '19:35', '2026-11-24', '20:50'),
  ];
  const trip = { name: '新婚旅行', destination: 'ウィーン・シュトゥットガルト', startsOn: '2026-11-21', endsOn: '2026-11-26', memberCount: 2 };
  const { days } = buildParentSheet({ trip, items: [], bookings, places: [] });
  const route = Object.fromEntries(days.map((day) => [day.day, day.route]));
  assert.equal(route['2026-11-23'], 'ウィーン');
  assert.equal(route['2026-11-25'], 'シュトゥットガルト');
  // No flights at all: the trip's destination is all there is.
  assert.equal(buildParentSheet({ trip, items: [], bookings: [], places: [] }).days[0].route, 'ウィーン・シュトゥットガルト');
});
