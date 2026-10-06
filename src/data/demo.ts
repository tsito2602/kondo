import { addDays, localDate } from '@/utils/dates';
import { Booking, emptyTravelCache, TravelCache } from './types';

export function createDemoCache(): TravelCache {
  const start = addDays(localDate(), 14);
  const next = addDays(start, 1);
  const last = addDays(start, 3);
  const tripId = 'sample-vienna';
  const ago = (days: number) => Math.floor(Date.now() / 1000) - days * 86400;
  const flight: Booking = { id: 'sample-flight-1', kind: 'flight', title: 'サンプル航空 101', detail: '', origin: '成田国際空港', originCode: 'NRT', destination: 'ドバイ国際空港', destinationCode: 'DXB', day: start, time: '22:20', endDay: next, endTime: '05:30', confirmationCode: 'SAMPLE', note: 'サンプルの予約です。実際の搭乗には使えません。' };
  return {
    ...emptyTravelCache(),
    selectedTripId: tripId,
    trips: [{ id: tripId, name: 'ウィーンの街を歩く', destination: 'Vienna, Austria', startsOn: start, endsOn: last, memberCount: 2, role: 'owner' }],
    bookingsByTrip: { [tripId]: [flight, { ...flight, id: 'sample-flight-2', title: 'サンプル航空 202', origin: 'ドバイ国際空港', originCode: 'DXB', destination: 'ウィーン国際空港', destinationCode: 'VIE', day: next, time: '08:55', endDay: next, endTime: '12:25' }, { ...flight, id: 'sample-hotel', kind: 'hotel', title: '旧市街のホテル', origin: '', originCode: '', destination: '', destinationCode: '', detail: 'ウィーン旧市街', day: next, time: '15:00', endDay: last, endTime: '11:00' }] },
    itemsByTrip: { [tripId]: [{ id: 'sample-walk', day: next, time: '16:00', kind: '予定', title: '旧市街を散歩', note: '気になった通りへ、ゆっくり歩く。' }, { id: 'sample-cafe', day: addDays(start, 2), time: '10:00', kind: '予定', title: 'カフェで朝ごはん', note: '' }, { id: 'sample-museum', day: addDays(start, 2), time: '14:00', kind: '予定', title: '美術史美術館', note: '', details: { category: 'sightseeing', location: '', endDay: '', endTime: '' } }] },
    tasksByTrip: { [tripId]: [{ id: 'sample-task-1', title: 'eSIMを用意する', dueOn: addDays(start, -2), assignee: '', done: false }, { id: 'sample-task-2', title: '休暇を申請する', dueOn: '', assignee: '', done: true }] },
    placesByTrip: { [tripId]: [
      { id: 'sample-place-cafe', title: '旧市街でカフェ巡り', note: '窓際の席で、コーヒーとケーキ。', openingHours: '訪問前に確認', reservationStatus: 'not_needed', location: 'https://www.google.com/maps/search/?api=1&query=Vienna+cafe', status: 'want' },
      { id: 'sample-place-museum', title: '美術史美術館', note: '気になる展示をゆっくり見る。', openingHours: '', reservationStatus: 'needed', location: 'https://www.google.com/maps/search/?api=1&query=Kunsthistorisches+Museum', status: 'planned', itineraryItemId: 'sample-museum' },
    ] },
    notesByTrip: { [tripId]: [
      { id: 'sample-note-address', title: 'タクシーに見せる住所', body: 'Hotel Sacher Wien\nPhilharmoniker Str. 4\n1010 Wien', pinned: true, updatedBy: 'demo-companion', updatedAt: ago(5) },
      { id: 'sample-note-gifts', title: 'お土産リスト', body: '- [x] ザッハトルテ（空港で買う）\n- [ ] マンナーのウエハース\n- [ ] ユリウス・マインルのコーヒー豆\n- [x] モーツァルトクーゲル\n- [ ] 会社に配るお菓子\n- [ ] ポストカード', updatedBy: 'demo-self', updatedAt: ago(1) },
      { id: 'sample-note-museum', title: '美術史美術館で見たいもの', body: '- [ ] ブリューゲル「バベルの塔」\n- [ ] フェルメール「絵画芸術」\n- [ ] 丸天井のカフェで休憩', placeId: 'sample-place-museum', updatedBy: 'demo-companion', updatedAt: ago(7) },
      { id: 'sample-note-german', title: 'ドイツ語のひとこと', body: 'Danke schön ― ありがとう\nDie Rechnung, bitte. ― お会計お願いします\nEine Melange, bitte. ― メランジェをください', updatedBy: 'demo-companion', updatedAt: ago(8) },
      { id: 'sample-note-money', title: '両替と支払い', body: '## お金\nカードはほぼどこでも使える\nチップは端数を切り上げて5〜10%\n## 小銭\nトイレ用に50セント硬貨を何枚か', updatedBy: 'demo-self', updatedAt: ago(13) },
    ] },
    packingByTrip: { [tripId]: [{ id: 'sample-pack-1', name: 'パスポート', category: '書類', quantity: 1, packed: false }, { id: 'sample-pack-2', name: '充電器', category: '電子機器', quantity: 1, packed: false }, { id: 'sample-pack-3', name: '着替え', category: '衣類', quantity: 3, packed: true }] },
  };
}
