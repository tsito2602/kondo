import { addDays, localDate } from '@/utils/dates';
import { Booking, emptyTravelCache, PackingItem, TravelCache, TravelTask, Trip, TripMember } from './types';

// Demo photos are drawn, so the sample needs no image files: a dusk sky over a skyline.
const SKYLINE = 'M0 120V78h22V60h10v18h16V52l9-14 9 14v26h20V66h14v12h18V30l6-14 6 14v48h22V58h12v20h20V48h8V36h4v12h8v30h24V64h18v14h20V40l10-8 10 8v38h22V70h16v8h22V56h12v22h20v42z';
const sceneCover = (sky: string[], ground: string) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">${sky.map((color, i) => `<stop offset="${[0, 0.48, 0.8, 1][i]}" stop-color="${color}"/>`).join('')}</linearGradient></defs><rect width="390" height="200" fill="url(#s)"/><path transform="translate(0 84)" fill="${ground}" d="${SKYLINE}"/></svg>`,
);
// Stand-in profile icons: companions who set one get a picture, others show their initial.
const face = (background: string, skin: string) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><rect width="30" height="30" fill="${background}"/><circle cx="15" cy="34" r="12" fill="#3a322c"/><circle cx="15" cy="14" r="7.5" fill="${skin}"/><circle cx="12.4" cy="13.6" r="1" fill="#2a2420"/><circle cx="17.6" cy="13.6" r="1" fill="#2a2420"/><path d="M12.6 16.6q2.4 2 4.8 0" fill="none" stroke="#2a2420" stroke-width="1.1" stroke-linecap="round"/></svg>`,
);
const DEMO_PEOPLE: Record<string, TripMember> = {
  self: { id: 'demo-self', name: 'あなた', email: '', role: 'owner', avatarUrl: face('#E9B872', '#F6D7B0') },
  companion: { id: 'demo-companion', name: 'みさき', email: '', role: 'editor', avatarUrl: face('#8FB3A9', '#F1D2BC') },
  friend: { id: 'demo-friend', name: 'けんと', email: '', role: 'editor' },
  ken: { id: 'demo-ken', name: 'けんた', email: '', role: 'editor' },
  sakura: { id: 'demo-sakura', name: 'さくら', email: '', role: 'editor', avatarUrl: face('#B9A3C9', '#E8C4A6') },
  yui: { id: 'demo-yui', name: 'ゆい', email: '', role: 'viewer' },
  akira: { id: 'demo-akira', name: 'あきら', email: '', role: 'viewer' },
};
const people = (...keys: string[]) => keys.map((key) => DEMO_PEOPLE[key]);

/** The demo trip's three travellers; the provider lists them as members. */
export const demoMembers = people('self', 'companion', 'friend');

export function createDemoCache(): TravelCache {
  const start = addDays(localDate(), 14);
  const next = addDays(start, 1);
  const last = addDays(start, 3);
  const today = localDate();
  const tripId = 'sample-vienna';
  const self = 'member:demo-self', misaki = 'member:demo-companion', kento = 'member:demo-friend';
  const task = (id: string, title: string, due: number | null, assignee: string, done = false): TravelTask => ({ id, title, dueOn: due === null ? '' : addDays(today, due), assignee, done });
  const tasks = [
    task('sample-task-hotel', 'ホテルを予約する', -16, self, true),
    task('sample-task-opera', 'オペラの席を取る', -5, self, true),
    task('sample-task-passport', 'パスポートの期限を確かめる', -3, kento),
    task('sample-task-insurance', '海外旅行保険に入る', 4, misaki),
    task('sample-task-belvedere', 'ベルヴェデーレを予約する', 4, misaki),
    task('sample-task-museum', '美術館の時間指定券を取る', 6, self),
    task('sample-task-euro', 'ユーロに両替する', 10, misaki),
    task('sample-task-1', 'eSIMを用意する', 11, self),
    task('sample-task-train', '空港までの電車を調べる', 12, kento, true),
    task('sample-task-2', '休暇を申請する', null, self, true),
  ];
  const pack = (id: string, name: string, category: string, rest: Partial<PackingItem>): PackingItem => ({ id, name, category, quantity: 1, packed: false, assignee: '', shared: false, ...rest });
  const packing = [
    pack('sample-pack-1', 'パスポート', '書類', { kind: 'each', packedBy: ['demo-companion'] }),
    pack('sample-pack-2', 'モバイルバッテリー', '電子機器', { kind: 'each', packedBy: ['demo-friend'] }),
    pack('sample-pack-brush', '歯ブラシ', '洗面用具', { kind: 'each', packedBy: ['demo-companion'] }),
    pack('sample-pack-3', '着替え5日分', '衣類', { kind: 'each', packed: true, packedBy: ['demo-companion', 'demo-self'] }),
    pack('sample-pack-jacket', '上着', '衣類', { kind: 'each', packedBy: [] }),
    pack('sample-pack-plug', '変換プラグ', '電子機器', { kind: 'one', shared: true, assignee: kento, packed: true }),
    pack('sample-pack-medicine', '常備薬', '薬', { kind: 'one', shared: true, assignee: self }),
    pack('sample-pack-camera', 'カメラ', '電子機器', { kind: 'one', shared: true }),
    pack('sample-pack-coins', '小銭入れ', 'その他', { kind: 'one', shared: true }),
    pack('sample-pack-lens', 'コンタクトレンズ', 'その他', { kind: 'mine' }),
    pack('sample-pack-book', '読みかけの本', 'その他', { kind: 'mine', packed: true }),
  ];
  // More trips around the sample one, so the list shows the next trip's countdown,
  // a trip without a photo, and the shelf of past trips.
  const extraMembers: Record<string, TripMember[]> = {
    'sample-south-germany': people('self', 'companion', 'ken', 'sakura'),
    'sample-taipei': people('self', 'companion'),
    'sample-hokkaido': people('self', 'companion', 'ken'),
    'sample-okinawa': people('self', 'companion', 'ken', 'sakura', 'yui', 'akira'),
    'sample-osaka': people('self'),
    'sample-seoul': people('self', 'companion', 'ken'),
  };
  const trip = (id: string, name: string, destination: string, startsOn: string, days: number, coverImage?: string): Trip => ({
    id, name, destination, startsOn, endsOn: addDays(startsOn, days - 1), role: 'owner', memberCount: extraMembers[id].length, ...(coverImage ? { coverImage } : {}),
  });
  const extraTrips = [
    trip('sample-south-germany', '南ドイツからウィーンへ', 'シュトゥットガルト、ウィーン', addDays(today, 46), 3),
    trip('sample-taipei', '台湾の夜市めぐり', '台北', addDays(today, -283), 4, sceneCover(['#1d2442', '#5a3d6b', '#c4566a', '#f0a35e'], '#16121c')),
    trip('sample-hokkaido', '北海道ドライブ', '北海道', addDays(today, -422), 5),
    trip('sample-okinawa', '沖縄でのんびり', '沖縄', addDays(today, -825), 4),
    // Past trips also fill the passport's entry stamps in 設定.
    trip('sample-osaka', '大阪の週末', 'Osaka, Japan', addDays(today, -150), 3),
    trip('sample-seoul', 'ソウルの冬', 'Seoul, Korea', addDays(today, -300), 5),
  ];
  const flight: Booking = { id: 'sample-flight-1', kind: 'flight', title: 'サンプル航空 101', detail: '', origin: '成田国際空港', originCode: 'NRT', destination: 'ドバイ国際空港', destinationCode: 'DXB', day: start, time: '22:20', endDay: next, endTime: '05:30', confirmationCode: 'SAMPLE', note: 'サンプルの予約です。実際の搭乗には使えません。' };
  return {
    ...emptyTravelCache(),
    selectedTripId: tripId,
    trips: [
      { id: tripId, name: 'ウィーンの街を歩く', destination: 'Vienna, Austria', startsOn: start, endsOn: last, memberCount: demoMembers.length, role: 'owner', coverImage: sceneCover(['#2b3550', '#7b5b6d', '#e2a074', '#f3c98f'], '#1b1820') },
      ...extraTrips,
    ],
    membersByTrip: {
      [tripId]: [...demoMembers],
      ...Object.fromEntries(extraTrips.map((trip) => [trip.id, extraMembers[trip.id]])),
    },
    bookingsByTrip: { [tripId]: [flight, { ...flight, id: 'sample-flight-2', title: 'サンプル航空 202', origin: 'ドバイ国際空港', originCode: 'DXB', destination: 'ウィーン国際空港', destinationCode: 'VIE', day: next, time: '08:55', endDay: next, endTime: '12:25' }, { ...flight, id: 'sample-hotel', kind: 'hotel', title: '旧市街のホテル', origin: '', originCode: '', destination: '', destinationCode: '', detail: 'ウィーン旧市街', day: next, time: '15:00', endDay: last, endTime: '11:00' }] },
    itemsByTrip: { [tripId]: [{ id: 'sample-walk', day: next, time: '16:00', kind: '予定', title: '旧市街を散歩', note: '気になった通りへ、ゆっくり歩く。' }, { id: 'sample-cafe', day: addDays(start, 2), time: '10:00', kind: '予定', title: 'カフェで朝ごはん', note: '' }] },
    tasksByTrip: { [tripId]: tasks },
    placesByTrip: { [tripId]: [
      { id: 'sample-place-cafe', title: '旧市街でカフェ巡り', note: '窓際の席で、コーヒーとケーキ。', openingHours: '訪問前に確認', reservationStatus: 'not_needed', location: 'https://www.google.com/maps/search/?api=1&query=Vienna+cafe', status: 'want' },
      { id: 'sample-place-museum', title: '美術史美術館', note: '気になる展示をゆっくり見る。', openingHours: '', reservationStatus: 'needed', location: 'https://www.google.com/maps/search/?api=1&query=Kunsthistorisches+Museum', status: 'want' },
    ] },
    packingByTrip: { [tripId]: packing },
  };
}
