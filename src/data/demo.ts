import { addDays, localDate } from '@/utils/dates';
import { demoItinerary } from './demo-itinerary';
import { demoPlaces, VIENNA } from './demo-places';
import { Booking, emptyTravelCache, PackingItem, TravelCache, TravelTask, Trip, TripMember } from './types';

// Demo photos are drawn, so the sample needs no image files: kondo-home.html's stand-in,
// a dusk sky over a skyline. The sky fills the card and the skyline is stretched across
// its lower 58 %, whatever the card's shape (the root has no viewBox, so no aspect ratio).
const SKYLINE = 'M0 120V78h22V60h10v18h16V52l9-14 9 14v26h20V66h14v12h18V30l6-14 6 14v48h22V58h12v20h20V48h8V36h4v12h8v30h24V64h18v14h20V40l10-8 10 8v38h22V70h16v8h22V56h12v22h20v42z';
const sceneCover = (sky: string[], ground: string) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">${sky.map((color, i) => `<stop offset="${[0, 0.48, 0.8, 1][i]}" stop-color="${color}"/>`).join('')}</linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/><svg y="42%" width="100%" height="58%" viewBox="0 0 390 120" preserveAspectRatio="none"><path fill="${ground}" d="${SKYLINE}"/></svg></svg>`,
);
// Stand-in profile icons: companions who set one get a picture, others show their initial.
const face = (background: string, skin: string) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><rect width="30" height="30" fill="${background}"/><circle cx="15" cy="34" r="12" fill="#3a322c"/><circle cx="15" cy="14" r="7.5" fill="${skin}"/><circle cx="12.4" cy="13.6" r="1" fill="#2a2420"/><circle cx="17.6" cy="13.6" r="1" fill="#2a2420"/><path d="M12.6 16.6q2.4 2 4.8 0" fill="none" stroke="#2a2420" stroke-width="1.1" stroke-linecap="round"/></svg>`,
);
const DEMO_PEOPLE: Record<string, TripMember> = {
  self: { id: 'demo-self', name: 'あなた', email: '', role: 'owner', avatarUrl: face('#E9B872', '#F6D7B0') },
  misaki: { id: 'demo-companion', name: 'みさき', email: '', role: 'editor', avatarUrl: face('#8FB3A9', '#F1D2BC') },
  kento: { id: 'demo-friend', name: 'けんと', email: '', role: 'editor' },
  sakura: { id: 'demo-sakura', name: 'さくら', email: '', role: 'editor', avatarUrl: face('#B9A3C9', '#E8C4A6') },
  yui: { id: 'demo-yui', name: 'ゆい', email: '', role: 'viewer' },
  akira: { id: 'demo-akira', name: 'あきら', email: '', role: 'viewer' },
};
const people = (...keys: string[]) => keys.map((key) => DEMO_PEOPLE[key]);

/** The Vienna trip's two travellers; the provider lists them as members. */
export const demoMembers = people('self', 'misaki');

/** Bump when the sample content changes, so devices drop an older saved sample. */
export const DEMO_REVISION = '2026-10-06-vienna';

/**
 * Demo mode's data: one five-day trip to Vienna starting 13 days from today
 * (night flight from Narita via Dubai, two nights in the old town), plus the
 * next trip and the past ones that fill the home shelf and the passport stamps.
 */
export function createDemoCache(): TravelCache {
  const today = localDate();
  const start = addDays(today, 13);
  const day = (offset: number) => addDays(start, offset);
  const tripId = 'sample-vienna';
  const self = 'member:demo-self', misaki = 'member:demo-companion';
  const task = (id: string, title: string, due: number | null, assignee: string, done = false): TravelTask => ({ id, title, dueOn: due === null ? '' : addDays(today, due), assignee, done });
  const tasks = [
    task('sample-task-flight', '航空券を取る（エミレーツ、ドバイ経由）', -58, self, true),
    task('sample-task-hotel', 'ホテルを予約する', -52, self, true),
    task('sample-task-opera', '国立歌劇場の「魔笛」の席を取る', -30, misaki, true),
    task('sample-task-concert', '楽友協会のコンサートを予約する', -21, self, true),
    task('sample-task-passport', 'パスポートの有効期限を確かめる', -14, misaki, true),
    task('sample-task-belvedere', 'ベルヴェデーレの時間指定券を取る', -3, misaki, true),
    task('sample-task-insurance', '海外旅行保険に入る', 3, misaki),
    task('sample-task-schoenbrunn', 'シェーンブルン宮殿の入場券を予約する', 5, self),
    task('sample-task-card', 'クレジットカードの海外利用を確認する', 7, self),
    task('sample-task-esim', 'ヨーロッパで使えるeSIMを買う', 10, self),
    task('sample-task-checkin', 'エミレーツのオンラインチェックイン', 12, self),
    task('sample-task-weather', '天気予報を見て上着を決める', 11, misaki),
  ];
  const pack = (id: string, name: string, category: string, rest: Partial<PackingItem>): PackingItem => ({ id, name, category, quantity: 1, packed: false, assignee: '', shared: false, ...rest });
  const packing = [
    pack('sample-pack-1', 'パスポート', '書類', { kind: 'each', packedBy: ['demo-companion'] }),
    pack('sample-pack-card', 'クレジットカード', '書類', { kind: 'each', packedBy: ['demo-self', 'demo-companion'], packed: true }),
    pack('sample-pack-2', 'モバイルバッテリー', '電子機器', { kind: 'each', packedBy: ['demo-self'] }),
    pack('sample-pack-brush', '歯ブラシ', '洗面用具', { kind: 'each', packedBy: [] }),
    pack('sample-pack-3', '着替え4日分', '衣類', { kind: 'each', packed: true, packedBy: ['demo-companion', 'demo-self'] }),
    pack('sample-pack-jacket', '上着（朝晩は10℃を下回る）', '衣類', { kind: 'each', packedBy: [] }),
    pack('sample-pack-shoes', '歩きやすい靴', '衣類', { kind: 'each', packedBy: ['demo-companion'] }),
    pack('sample-pack-plug', '変換プラグ（Cタイプ）', '電子機器', { kind: 'one', shared: true, assignee: self, packed: true }),
    pack('sample-pack-medicine', '常備薬', '薬', { kind: 'one', shared: true, assignee: misaki }),
    pack('sample-pack-umbrella', '折りたたみ傘', 'その他', { kind: 'one', shared: true, assignee: misaki }),
    pack('sample-pack-camera', 'カメラ', '電子機器', { kind: 'one', shared: true }),
    pack('sample-pack-coins', '小銭入れ', 'その他', { kind: 'one', shared: true }),
    pack('sample-pack-dress', 'オペラに着ていく服', '衣類', { kind: 'mine' }),
    pack('sample-pack-lens', 'コンタクトレンズ', 'その他', { kind: 'mine' }),
    pack('sample-pack-book', '機内で読む本', 'その他', { kind: 'mine', packed: true }),
  ];
  // The next trip and past ones, so the list shows the next countdown, a trip
  // without a photo, and the shelf of past trips (the passport's entry stamps).
  const extraMembers: Record<string, TripMember[]> = {
    'sample-kyoto': people('self', 'misaki', 'kento', 'sakura'),
    'sample-osaka': people('self', 'kento'),
    'sample-taipei': people('self', 'misaki'),
    'sample-seoul': people('self', 'misaki', 'sakura'),
    'sample-hokkaido': people('self', 'misaki', 'kento'),
    'sample-okinawa': people('self', 'misaki', 'kento', 'sakura', 'yui', 'akira'),
  };
  const trip = (id: string, name: string, destination: string, startsOn: string, days: number, coverImage?: string): Trip => ({
    id, name, destination, startsOn, endsOn: addDays(startsOn, days - 1), role: 'owner', memberCount: extraMembers[id].length, ...(coverImage ? { coverImage } : {}),
  });
  const extraTrips = [
    trip('sample-kyoto', '京都で紅葉を見る', '京都', addDays(today, 46), 3),
    trip('sample-osaka', '大阪の週末', '大阪', addDays(today, -150), 3),
    trip('sample-taipei', '台湾の夜市めぐり', '台北', addDays(today, -283), 4, sceneCover(['#2b3550', '#7b5b6d', '#e2a074', '#f3c98f'], '#1b1820')),
    trip('sample-seoul', 'ソウルの冬', 'ソウル', addDays(today, -300), 4),
    trip('sample-hokkaido', '北海道ドライブ', '札幌、富良野', addDays(today, -422), 5),
    trip('sample-okinawa', '沖縄でのんびり', '沖縄', addDays(today, -825), 4),
  ];
  const ago = (days: number) => Math.floor(Date.now() / 1000) - days * 86400;
  const none = { location: '', origin: '', originCode: '', destination: '', destinationCode: '', note: '', confirmationCode: '' };
  const booking = (entry: Partial<Booking> & Pick<Booking, 'id' | 'kind' | 'title' | 'detail' | 'day' | 'time'>): Booking => ({ ...none, endDay: entry.day, endTime: '', ...entry });
  const pnr = 'K7Q2PX';
  const flight = (id: string, number: string, from: [string, string], to: [string, string], dep: [number, string], arr: [number, string], seats: string) =>
    booking({ id, kind: 'flight', title: `EK ${number}`, detail: 'エミレーツ航空', origin: from[1], originCode: from[0], destination: to[1], destinationCode: to[0], day: day(dep[0]), time: dep[1], endDay: day(arr[0]), endTime: arr[1], confirmationCode: pnr, note: `座席 ${seats}` });
  const NRT: [string, string] = ['NRT', '成田国際空港'], DXB: [string, string] = ['DXB', 'ドバイ国際空港'], VIE: [string, string] = ['VIE', 'ウィーン国際空港'];
  const bookings: Booking[] = [
    flight('sample-flight-1', '319', NRT, DXB, [0, '22:20'], [1, '05:30'], '34A・34B'),
    flight('sample-flight-2', '127', DXB, VIE, [1, '08:55'], [1, '12:25'], '41D・41E'),
    booking({ id: 'sample-train', kind: 'train', title: 'シティ・エアポート・トレイン', detail: 'CAT · 往復券 2名', origin: 'ウィーン空港', destination: 'ウィーン・ミッテ駅', day: day(1), time: '13:06', endTime: '13:22', confirmationCode: '48102756', note: '帰りも同じ券で乗れる。' }),
    booking({ id: 'sample-hotel', kind: 'hotel', title: 'ホテル・ザッハー・ウィーン', detail: 'ウィーン旧市街', location: VIENNA.sacher, day: day(1), time: '15:00', endDay: day(3), endTime: '12:00', confirmationCode: '40921776', note: 'ダブルルーム · 朝食付き · 2泊' }),
    booking({ id: 'sample-dinner', kind: 'restaurant', title: 'フィグルミュラー', detail: 'ヴォルツァイレ通り', location: VIENNA.figl, day: day(1), time: '17:30', endTime: '19:00', note: '2名 · 予約名はみさき', placeId: 'sample-place-figl' }),
    booking({ id: 'sample-concert', kind: 'ticket', title: '楽友協会 モーツァルト・コンサート', detail: 'ウィーン・モーツァルト・オーケストラ', location: VIENNA.musikverein, day: day(1), time: '20:15', endTime: '21:45', confirmationCode: '30418827', note: '黄金のホール · バルコン 2列 12・13番', placeId: 'sample-place-musikverein' }),
    booking({ id: 'sample-opera', kind: 'ticket', title: '魔笛', detail: 'ウィーン国立歌劇場', location: VIENNA.oper, day: day(2), time: '19:00', endTime: '21:45', confirmationCode: '26107781', note: 'パルケット 12列 8・9番 · 開演の30分前に着く', placeId: 'sample-place-oper' }),
    booking({ id: 'sample-belvedere', kind: 'ticket', title: 'ベルヴェデーレ宮殿 上宮', detail: '時間指定券', location: VIENNA.belvedere, day: day(3), time: '09:00', confirmationCode: '55120438', note: '大人2名', placeId: 'sample-place-belvedere' }),
    flight('sample-flight-3', '128', VIE, DXB, [3, '14:40'], [3, '22:05'], '40A・40B'),
    flight('sample-flight-4', '318', DXB, NRT, [4, '02:50'], [4, '17:35'], '38A・38B'),
  ];
  return {
    ...emptyTravelCache(),
    selectedTripId: tripId,
    trips: [
      { id: tripId, name: 'ウィーンの街を歩く', destination: 'ウィーン', startsOn: start, endsOn: day(4), memberCount: demoMembers.length, role: 'owner', coverImage: sceneCover(['#2b3550', '#7b5b6d', '#e2a074', '#f3c98f'], '#1b1820') },
      ...extraTrips,
    ],
    membersByTrip: {
      [tripId]: [...demoMembers],
      ...Object.fromEntries(extraTrips.map((entry) => [entry.id, extraMembers[entry.id]])),
    },
    bookingsByTrip: { [tripId]: bookings },
    itemsByTrip: { [tripId]: demoItinerary(start) },
    tasksByTrip: { [tripId]: tasks },
    placesByTrip: { [tripId]: demoPlaces() },
    notesByTrip: { [tripId]: [
      { id: 'sample-note-address', title: 'タクシーに見せる住所', body: 'Hotel Sacher Wien\nPhilharmoniker Str. 4\n1010 Wien', pinned: true, updatedBy: 'demo-companion', updatedAt: ago(2) },
      { id: 'sample-note-transfer', title: 'ドバイの乗り継ぎ', body: '## 行き\n05:30着 → 08:55発（3時間25分）\n## 帰り\n22:05着 → 翌02:50発（4時間45分）\nどちらもターミナル3の中で乗り継ぎ。', updatedBy: 'demo-self', updatedAt: ago(1) },
      { id: 'sample-note-gifts', title: 'お土産リスト', body: '- [x] ザッハトルテ（ホテルのショップで買う）\n- [ ] マンナーのウエハース\n- [ ] ユリウス・マインルのコーヒー豆\n- [x] モーツァルトクーゲル\n- [ ] 会社に配るお菓子', updatedBy: 'demo-self', updatedAt: ago(1) },
      { id: 'sample-note-belvedere', title: 'ベルヴェデーレで見たいもの', body: '- [ ] クリムト「接吻」\n- [ ] ダヴィッド「サン・ベルナール峠を越えるボナパルト」\n- [ ] 庭園の端から街を見る', placeId: 'sample-place-belvedere', updatedBy: 'demo-companion', updatedAt: ago(3) },
      { id: 'sample-note-german', title: 'ドイツ語のひとこと', body: 'Grüß Gott ― こんにちは\nDanke schön ― ありがとう\nZahlen, bitte. ― お会計お願いします\nEine Melange, bitte. ― メランジェをください', updatedBy: 'demo-companion', updatedAt: ago(4) },
      { id: 'sample-note-money', title: '両替と支払い', body: '## お金\nカードはほぼどこでも使える\nチップは端数を切り上げて5〜10%\n## 小銭\n駅や公園のトイレ用に50セント硬貨を何枚か', updatedBy: 'demo-self', updatedAt: ago(8) },
    ] },
    packingByTrip: { [tripId]: packing },
  };
}
