import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// Bookings linked to map places: numbering, しおり walks, auto-linking and the demo.
const { outputFiles } = await build({
  stdin: {
    contents: `export * from './src/data/place-numbers'; export * from './src/data/booking-place'; export * from './src/data/plan-timeline'; export { createDemoCache } from './src/data/demo';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
});
const mod = { exports: {} };
new Function('module', 'exports', outputFiles[0].text)(mod, mod.exports);
const { placeNumbers, placeVisits, matchBookingPlace, linkBookingPlace, buildTimeline, createDemoCache } = mod.exports;

const pin = (name, lat, lng) => `https://www.google.com/maps/place/${encodeURIComponent(name)}/@${lat},${lng},17z/data=!4m6!3m5!8m2!3d${lat}!4d${lng}`;
const place = (id, extra = {}) => ({ id, title: id, note: '', openingHours: '', reservationStatus: 'not_needed', location: '', itineraryItemId: null, ...extra });
const booking = (id, extra = {}) => ({ id, kind: 'ticket', title: id, detail: '', location: '', origin: '', originCode: '', destination: '', destinationCode: '', day: '2026-11-22', time: '', endDay: '2026-11-22', endTime: '', confirmationCode: '', note: '', ...extra });

test('a place linked to a non-hotel booking is scheduled at the booking time, ordered with plans', () => {
  const items = [{ id: 'plan', day: '2026-11-22', time: '12:00', kind: '', title: '', note: '' }];
  const places = [place('cand'), place('opera'), place('lunch', { itineraryItemId: 'plan' }), place('hotel'), place('orphan')];
  const bookings = [
    booking('magic-flute', { day: '2026-11-22', time: '19:00', placeId: 'opera' }),
    booking('opera-matinee', { day: '2026-11-22', time: '10:00', kind: 'ticket', placeId: 'opera', endDay: '2026-11-23' }),
    booking('sacher', { kind: 'hotel', day: '2026-11-21', time: '15:00', placeId: 'hotel' }),
    booking('gone', { placeId: 'deleted-place' }),
    booking('old-client'), // no placeId at all
  ];
  // The earliest linked booking wins; hotels stay unnumbered candidates of their own.
  assert.deepEqual(Object.fromEntries(placeNumbers(places, items, bookings)), { opera: 1, lunch: 2, cand: 3, hotel: 4, orphan: 5 });
  assert.equal(placeVisits(places, items, bookings).get('opera').booking.id, 'opera-matinee');
  assert.equal(placeVisits(places, items, bookings).has('hotel'), false);
  // Without bookings (older callers) nothing changes.
  assert.deepEqual(Object.fromEntries(placeNumbers(places, items)), { lunch: 1, cand: 2, hotel: 3, opera: 4, orphan: 5 });
  // A plan beats a linked booking for the same place.
  const both = placeVisits([place('lunch', { itineraryItemId: 'plan' })], items, [booking('b', { time: '08:00', placeId: 'lunch' })]);
  assert.equal(both.get('lunch').item.id, 'plan');
});

test('the しおり walks to a booking from its linked place', () => {
  const stephan = place('stephan', { location: pin('Stephansdom', 48.20849, 16.37314), itineraryItemId: 'visit' });
  const figl = place('figl', { location: pin('Figlmüller', 48.20925, 16.37524) });
  const items = [{ id: 'visit', day: '2026-11-22', time: '16:00', kind: '', title: 'Dom', note: '', details: { category: 'sightseeing', location: '', endDay: '', endTime: '17:00' } }];
  const timeline = buildTimeline({ days: ['2026-11-22'], items, bookings: [booking('dinner', { kind: 'restaurant', time: '17:30', placeId: 'figl' })], places: [stephan, figl] });
  const walk = timeline[0].rows.find((row) => row.type === 'walk');
  assert.ok(walk && walk.walk.meters > 100 && walk.walk.meters < 250, JSON.stringify(walk));
});

test('new bookings auto-link by map link, pin or exact venue name; hotels never link', () => {
  const places = [
    place('oper', { title: 'ウィーン国立歌劇場', location: pin('Staatsoper', 48.20278, 16.36885) }),
    place('figl', { title: 'フィグルミュラー', lat: 48.20925, lng: 16.37524, location: 'https://maps.app.goo.gl/figl' }),
  ];
  assert.equal(matchBookingPlace(booking('a', { location: pin('Staatsoper', 48.20278, 16.36885) }), places)?.id, 'oper');
  // A share link a few metres off still points at the same venue.
  assert.equal(matchBookingPlace(booking('b', { location: 'https://www.google.com/maps/@48.20926,16.37525,17z' }), places)?.id, 'figl');
  assert.equal(matchBookingPlace(booking('c', { title: '魔笛', detail: 'ウィーン国立歌劇場' }), places)?.id, 'oper');
  assert.equal(matchBookingPlace(booking('d', { title: 'フィグルミュラー ', kind: 'restaurant' }), places)?.id, 'figl');
  assert.equal(matchBookingPlace(booking('e', { title: '国立歌劇場' }), places), undefined, 'names must match exactly');
  assert.equal(matchBookingPlace(booking('f', { kind: 'hotel', location: pin('Staatsoper', 48.20278, 16.36885) }), places), undefined);

  const created = [];
  const travel = { places, createPlace: (input) => { created.push(input); return 'new-place'; } };
  // Picking a place by name links it and keeps its map link.
  assert.deepEqual(
    (({ placeId, location }) => ({ placeId, location }))(linkBookingPlace(travel, booking('g', { location: 'ウィーン国立歌劇場' }))),
    { placeId: 'oper', location: places[0].location },
  );
  // An unknown map link becomes a new place of the trip.
  const link = pin('Belvedere', 48.19149, 16.38085);
  assert.equal(linkBookingPlace(travel, booking('h', { location: link })).placeId, 'new-place');
  assert.equal(created[0].title, 'Belvedere');
  assert.equal(created[0].location, link);
  assert.equal(linkBookingPlace(travel, booking('i', { location: 'Wien 1010' })).placeId, null);
  assert.equal(linkBookingPlace(travel, booking('j', { kind: 'hotel', location: link })).placeId, null);
  assert.equal(created.length, 1);
});

test('the demo links its venues: nothing booked sits under 候補', () => {
  const cache = createDemoCache();
  const tripId = cache.selectedTripId;
  const places = cache.placesByTrip[tripId];
  const bookings = cache.bookingsByTrip[tripId];
  const visits = placeVisits(places, cache.itemsByTrip[tripId], bookings);
  for (const id of ['sample-place-oper', 'sample-place-musikverein', 'sample-place-belvedere', 'sample-place-figl']) {
    assert.ok(visits.get(id)?.booking, `${id} is scheduled by its booking`);
  }
  const candidates = places.filter((entry) => !visits.has(entry.id)).map((entry) => entry.id).sort();
  assert.deepEqual(candidates, ['sample-place-naschmarkt', 'sample-place-prater']);
});
