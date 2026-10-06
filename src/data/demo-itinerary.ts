import { addDays } from '@/utils/dates';
import type { Booking, ItineraryItem, Place, TravelCache } from './types';

const put = <T extends { id: string }>(list: T[] = [], entries: T[]) => [...list.filter((entry) => !entries.some((next) => next.id === entry.id)), ...entries];
const maps = (name: string, lat: number, lng: number) => `https://www.google.com/maps/place/${encodeURIComponent(name).replace(/%20/g, '+')}/@${lat},${lng},17z`;

/**
 * The しおり's sample days (kondo-itinerary mock): plans with numbered places, a
 * train, a concert ticket, the hotel with our own in/out times, and the flights home.
 * Entries are merged by id, so other screens' sample rows stay as they are.
 */
export function withItineraryDemo(cache: TravelCache): TravelCache {
  const tripId = 'sample-vienna';
  const trip = cache.trips.find((entry) => entry.id === tripId);
  if (!trip) return cache;
  const day = (offset: number) => addDays(trip.startsOn, offset);
  const existing = cache.bookingsByTrip[tripId] ?? [];
  const base = existing.find((booking) => booking.id === 'sample-flight-1');
  if (!base) return cache;
  const booking = (entry: Partial<Booking> & Pick<Booking, 'id' | 'kind' | 'title' | 'day' | 'time'>): Booking => ({ ...base, detail: '', location: '', origin: '', originCode: '', destination: '', destinationCode: '', endDay: entry.day, endTime: '', note: '', ...entry });
  const added: Booking[] = [
    booking({ id: 'sample-train', kind: 'train', title: 'シティ・エアポート・トレイン', origin: 'ウィーン空港', destination: 'ミッテ駅', day: day(1), time: '13:10', endTime: '13:26', confirmationCode: 'CAT-8812' }),
    booking({ id: 'sample-concert', kind: 'ticket', title: '楽友協会のコンサート', location: maps('Musikverein Wien', 48.20052, 16.37256), day: day(2), time: '19:30', endTime: '21:45', confirmationCode: 'WM-2047' }),
    booking({ id: 'sample-flight-3', kind: 'flight', title: 'サンプル航空 303', origin: 'ウィーン国際空港', originCode: 'VIE', destination: 'ドバイ国際空港', destinationCode: 'DXB', day: day(3), time: '13:40', endTime: '21:15', confirmationCode: base.confirmationCode }),
    booking({ id: 'sample-flight-4', kind: 'flight', title: 'サンプル航空 404', origin: 'ドバイ国際空港', originCode: 'DXB', destination: '成田国際空港', destinationCode: 'NRT', day: day(4), time: '02:50', endTime: '17:35', confirmationCode: base.confirmationCode }),
  ].filter((entry) => !existing.some((current) => current.id === entry.id));
  const bookings = [...existing, ...added].map((entry) => (entry.id === 'sample-hotel' && !entry.location ? { ...entry, location: maps('Graben, 1010 Wien', 48.2087, 16.3697), confirmationCode: '4417-2290' } : entry));
  const plan = (id: string, offset: number, time: string, endTime: string, category: NonNullable<ItineraryItem['details']>['category'], kind: string, title: string, note: string, extra: Partial<NonNullable<ItineraryItem['details']>> = {}): ItineraryItem => ({ id, day: day(offset), time, kind, title, note, details: { category, location: '', endDay: endTime ? day(offset) : '', endTime, ...extra } });
  const items = [
    plan('sample-hotel-in', 1, '15:30', '', 'other', 'その他', 'チェックイン', '', { stay: { bookingId: 'sample-hotel', endpoint: 'start' } }),
    plan('sample-walk', 1, '16:00', '17:30', 'sightseeing', '観光', '旧市街を散歩', '南塔に登る（343段）。気になった通りへ、ゆっくり歩く。', { ownPlace: true }),
    plan('sample-dinner', 1, '18:30', '20:00', 'meal', '食事', 'シュニッツェルの夕食', '予約済み · 2人。お皿からはみ出す大きさらしい。', { ownPlace: true }),
    plan('sample-cafe', 2, '10:00', '11:00', 'meal', '食事', 'カフェで朝ごはん', 'メランジェとアプフェルシュトゥルーデル。', { ownPlace: true }),
    plan('sample-museum', 2, '13:30', '15:30', 'sightseeing', '観光', '美術史美術館', 'ブリューゲルの部屋から回る。カフェのドームも見る。'),
    plan('sample-souvenir', 2, '', '', 'shopping', '買い物', 'お土産のチョコを買う', 'マンナーのウエハース。'),
    plan('sample-klimt', 3, '09:15', '10:00', 'sightseeing', '観光', 'クリムトの「接吻」を見る', '上宮。開館すぐが空いている。', { ownPlace: true }),
    plan('sample-hotel-out', 3, '10:30', '', 'other', 'その他', 'チェックアウト', '', { stay: { bookingId: 'sample-hotel', endpoint: 'end' } }),
    plan('sample-airport', 3, '11:30', '', 'transport', '移動', '空港へ', '', { transport: { mode: 'train', origin: 'ウィーン・ミッテ駅', destination: 'ウィーン空港', durationMinutes: 16 } }),
  ];
  const place = (id: string, title: string, lat: number, lng: number, itineraryItemId: string, extra: Partial<Place> = {}): Place => ({ id, title, note: '', openingHours: '', reservationStatus: 'not_needed', location: maps(title, lat, lng), status: 'planned', itineraryItemId, ...extra });
  const places = [
    place('sample-place-stephan', 'シュテファン大聖堂', 48.20849, 16.37314, 'sample-walk'),
    place('sample-place-figl', 'フィグルミュラー', 48.20925, 16.37524, 'sample-dinner'),
    place('sample-place-central', 'カフェ・ツェントラル', 48.21043, 16.36547, 'sample-cafe'),
    // Scheduled from the places list, so it keeps the 場所の詳細 screen (P1).
    place('sample-place-museum', '美術史美術館', 48.20379, 16.36166, 'sample-museum', { note: '気になる展示をゆっくり見る。', openingHours: '10:00〜18:00（木曜は21:00まで）', reservationStatus: 'needed' }),
    place('sample-place-belvedere', 'ベルヴェデーレ宮殿', 48.19149, 16.38085, 'sample-klimt'),
  ];
  return {
    ...cache,
    trips: cache.trips.map((entry) => (entry.id === tripId && entry.endsOn < day(4) ? { ...entry, endsOn: day(4) } : entry)),
    bookingsByTrip: { ...cache.bookingsByTrip, [tripId]: bookings },
    itemsByTrip: { ...cache.itemsByTrip, [tripId]: put(cache.itemsByTrip[tripId], items) },
    placesByTrip: { ...cache.placesByTrip, [tripId]: put(cache.placesByTrip[tripId], places) },
  };
}
