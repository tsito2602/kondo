import { addDays, localDate } from '@/utils/dates';
import { Booking, emptyTravelCache, PackingItem, TravelCache, TravelTask } from './types';

/** The demo trip's three travellers; the provider lists them as members. */
export const demoMembers = [
  { id: 'demo-self', name: 'あなた', email: '', role: 'owner' },
  { id: 'demo-companion', name: 'みさき', email: '', role: 'editor' },
  { id: 'demo-friend', name: 'けんと', email: '', role: 'editor' },
] as const;

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
  const flight: Booking = { id: 'sample-flight-1', kind: 'flight', title: 'サンプル航空 101', detail: '', origin: '成田国際空港', originCode: 'NRT', destination: 'ドバイ国際空港', destinationCode: 'DXB', day: start, time: '22:20', endDay: next, endTime: '05:30', confirmationCode: 'SAMPLE', note: 'サンプルの予約です。実際の搭乗には使えません。' };
  return {
    ...emptyTravelCache(),
    selectedTripId: tripId,
    trips: [{ id: tripId, name: 'ウィーンの街を歩く', destination: 'Vienna, Austria', startsOn: start, endsOn: last, memberCount: demoMembers.length, role: 'owner' }],
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
