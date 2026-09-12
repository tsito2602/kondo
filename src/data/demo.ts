import { addDays, localDate } from '@/utils/dates';
import { Booking, emptyTravelCache, TravelCache } from './types';

export function createDemoCache(): TravelCache {
  const start = addDays(localDate(), 14);
  const next = addDays(start, 1);
  const last = addDays(start, 3);
  const tripId = 'sample-vienna';
  const flight: Booking = { id: 'sample-flight-1', kind: 'flight', title: 'サンプル航空 101', detail: '', origin: '成田国際空港', originCode: 'NRT', destination: 'ドバイ国際空港', destinationCode: 'DXB', day: start, time: '22:20', endDay: next, endTime: '05:30', confirmationCode: 'SAMPLE', note: 'サンプルの予約です。実際の搭乗には使えません。' };
  return {
    ...emptyTravelCache(),
    selectedTripId: tripId,
    trips: [{ id: tripId, name: 'ウィーンの街を歩く', destination: 'Vienna, Austria', startsOn: start, endsOn: last, memberCount: 2, role: 'owner' }],
    bookingsByTrip: { [tripId]: [flight, { ...flight, id: 'sample-flight-2', title: 'サンプル航空 202', origin: 'ドバイ国際空港', originCode: 'DXB', destination: 'ウィーン国際空港', destinationCode: 'VIE', day: next, time: '08:55', endDay: next, endTime: '12:25' }, { ...flight, id: 'sample-hotel', kind: 'hotel', title: '旧市街のホテル', origin: '', originCode: '', destination: '', destinationCode: '', detail: 'ウィーン旧市街', day: next, time: '15:00', endDay: last, endTime: '11:00' }] },
    itemsByTrip: { [tripId]: [{ id: 'sample-walk', day: next, time: '16:00', kind: '予定', title: '旧市街を散歩', note: '気になった通りへ、ゆっくり歩く。' }, { id: 'sample-cafe', day: addDays(start, 2), time: '10:00', kind: '予定', title: 'カフェで朝ごはん', note: '' }] },
    tasksByTrip: { [tripId]: [{ id: 'sample-task-1', title: 'eSIMを用意する', dueOn: addDays(start, -2), assignee: '', done: false }, { id: 'sample-task-2', title: '休暇を申請する', dueOn: '', assignee: '', done: true }] },
    placesByTrip: { [tripId]: [
      { id: 'sample-place-cafe', title: '旧市街でカフェ巡り', note: '窓際の席で、コーヒーとケーキ。', openingHours: '訪問前に確認', reservationStatus: 'not_needed', location: 'https://www.google.com/maps/search/?api=1&query=Vienna+cafe', status: 'want' },
      { id: 'sample-place-museum', title: '美術史美術館', note: '気になる展示をゆっくり見る。', openingHours: '', reservationStatus: 'needed', location: 'https://www.google.com/maps/search/?api=1&query=Kunsthistorisches+Museum', status: 'want' },
    ] },
    packingByTrip: { [tripId]: [{ id: 'sample-pack-1', name: 'パスポート', category: '書類', quantity: 1, packed: false }, { id: 'sample-pack-2', name: '充電器', category: '電子機器', quantity: 1, packed: false }, { id: 'sample-pack-3', name: '着替え', category: '衣類', quantity: 3, packed: true }] },
  };
}
