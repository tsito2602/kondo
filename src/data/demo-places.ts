import { addDays } from '@/utils/dates';
import type { ItineraryItem, Place, TravelCache } from './types';

/** A Google Maps place link as pasted from the app's share sheet. */
const pin = (name: string, lat: number, lng: number) =>
  `https://www.google.com/maps/place/${encodeURIComponent(name)}/@${lat},${lng},17z/data=!4m6!3m5!8m2!3d${lat}!4d${lng}`;

/**
 * Places for the sample trip, with real Vienna coordinates, so demo mode
 * shows the places map: three days of plans around the hotel plus candidates.
 * Kept apart from demo.ts and applied by id, so other demo edits merge cleanly.
 */
export function withDemoPlaces(cache: TravelCache, tripId: string, start: string): TravelCache {
  const day2 = addDays(start, 1);
  const day3 = addDays(start, 2);
  const day4 = addDays(start, 3);
  const items = cache.itemsByTrip[tripId] ?? [];
  const places = cache.placesByTrip[tripId] ?? [];
  const sight = (location: string) => ({ category: 'sightseeing' as const, location, endDay: '', endTime: '' });
  const meal = (location: string) => ({ category: 'meal' as const, location, endDay: '', endTime: '' });
  const extraItems: ItineraryItem[] = [
    { id: 'sample-stephan', day: day2, time: '16:00', kind: '予定', title: 'シュテファン大聖堂', note: '', details: sight('') },
    { id: 'sample-figl', day: day2, time: '18:30', kind: '予定', title: 'フィグルミュラーで夕食', note: '', details: meal('') },
    { id: 'sample-museum', day: day3, time: '14:00', kind: '予定', title: '美術史美術館', note: '', details: sight('') },
    { id: 'sample-concert', day: day3, time: '19:30', kind: '予定', title: '楽友協会でコンサート', note: '', details: sight('') },
    { id: 'sample-belvedere', day: day4, time: '09:15', kind: '予定', title: 'ベルヴェデーレ宮殿', note: '', details: sight('') },
  ];
  const known: Record<string, Partial<Place>> = {
    'sample-place-cafe': { title: 'カフェ・ツェントラル', note: 'メランジェとアプフェルシュトゥルーデル', location: pin('Café Central', 48.21043, 16.36547), status: 'planned', itineraryItemId: 'sample-cafe' },
    'sample-place-museum': { note: 'ブリューゲルの部屋から回る', location: pin('Kunsthistorisches Museum', 48.20379, 16.36166), status: 'planned', itineraryItemId: 'sample-museum' },
  };
  const place = (id: string, title: string, note: string, lat: number, lng: number, itineraryItemId?: string): Place => ({
    id, title, note, openingHours: '', reservationStatus: 'not_needed', location: pin(title, lat, lng), status: itineraryItemId ? 'planned' : 'want', itineraryItemId,
  });
  const extraPlaces = [
    place('sample-place-stephan', 'シュテファン大聖堂', '南塔に登る（343段）', 48.20849, 16.37314, 'sample-stephan'),
    { ...place('sample-place-figl', 'フィグルミュラー', 'シュニッツェル。予約済み', 48.20925, 16.37524, 'sample-figl'), reservationStatus: 'confirmed' as const },
    { ...place('sample-place-concert', '楽友協会', '予約番号 WM-2047 · 2階 R12・13', 48.20052, 16.37256, 'sample-concert'), reservationStatus: 'confirmed' as const },
    place('sample-place-belvedere', 'ベルヴェデーレ宮殿', '上宮のクリムト「接吻」', 48.19149, 16.38085, 'sample-belvedere'),
    place('sample-place-naschmarkt', 'ナッシュマルクト', '土曜は蚤の市も', 48.1984, 16.363),
    place('sample-place-prater', 'プラーター大観覧車', '夕方がきれいらしい', 48.21665, 16.39585),
    place('sample-place-schoenbrunn', 'シェーンブルン宮殿', '行けたら。U4で約20分', 48.18486, 16.31224),
  ];
  // The しおり's sample (demo-itinerary) may already plan some of these places:
  // a place, plan or booking that exists by id is kept, and nothing is added twice.
  const bookings = cache.bookingsByTrip[tripId] ?? [];
  const linked = new Set(places.map((entry) => entry.itineraryItemId).filter(Boolean));
  const taken = (itemId?: string | null) =>
    !!itemId && (linked.has(itemId) || bookings.some((booking) => booking.id === itemId) || items.some((item) => item.id === itemId));
  const addedPlaces = extraPlaces.filter((entry) => !places.some((existing) => existing.id === entry.id) && !taken(entry.itineraryItemId));
  const addedItems = extraItems.filter((item) => addedPlaces.some((entry) => entry.itineraryItemId === item.id));
  const update = (entry: Place): Place => {
    const change = known[entry.id];
    // Leave a place alone when it is already planned, or its plan already has a place.
    if (!change || entry.itineraryItemId || (change.itineraryItemId && linked.has(change.itineraryItemId))) return entry;
    return { ...entry, ...change };
  };
  return {
    ...cache,
    bookingsByTrip: {
      ...cache.bookingsByTrip,
      [tripId]: (cache.bookingsByTrip[tripId] ?? []).map((booking) =>
        booking.id === 'sample-hotel' && !booking.location ? { ...booking, location: pin('旧市街のホテル', 48.2087, 16.3697) } : booking,
      ),
    },
    itemsByTrip: { ...cache.itemsByTrip, [tripId]: [...items, ...addedItems] },
    placesByTrip: {
      ...cache.placesByTrip,
      [tripId]: [...places.map(update), ...addedPlaces],
    },
  };
}
