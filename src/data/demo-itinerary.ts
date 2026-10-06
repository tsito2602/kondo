import { addDays } from '@/utils/dates';
import type { ItineraryDetails, ItineraryItem } from './types';

/**
 * The しおり's own plans for the sample trip. Flights, the airport train, the
 * hotel, the concert, the opera, the dinner and Belvedere are bookings (demo.ts),
 * so the plans fill the hours between them.
 */
export function demoItinerary(start: string): ItineraryItem[] {
  const day = (offset: number) => addDays(start, offset);
  const plan = (id: string, offset: number, time: string, endTime: string, category: ItineraryDetails['category'], kind: string, title: string, note: string, extra: Partial<ItineraryDetails> = {}): ItineraryItem => ({
    id, day: day(offset), time, kind, title, note, details: { category, location: '', endDay: endTime ? day(offset) : '', endTime, ...extra },
  });
  return [
    plan('sample-narita', 0, '20:00', '', 'other', 'その他', '成田空港 第2ターミナルで待ち合わせ', 'エミレーツのカウンター前。オンラインチェックインは済ませておく。'),
    plan('sample-hotel-in', 1, '15:00', '', 'other', 'その他', 'チェックイン', '', { stay: { bookingId: 'sample-hotel', endpoint: 'start' } }),
    plan('sample-stephan', 1, '15:45', '16:45', 'sightseeing', '観光', 'シュテファン大聖堂', 'ホテルから歩いて8分。南塔に登ってから、グラーベン通りを散歩。'),
    plan('sample-cafe', 2, '08:30', '09:30', 'meal', '食事', 'カフェ・ツェントラルで朝ごはん', 'メランジェとアプフェルシュトゥルーデル。'),
    plan('sample-museum', 2, '10:00', '12:30', 'sightseeing', '観光', '美術史美術館', 'ブリューゲルの部屋から回る。'),
    plan('sample-schoenbrunn', 2, '14:00', '17:00', 'sightseeing', '観光', 'シェーンブルン宮殿', 'U4でシェーンブルン駅まで。オペラの前にホテルで着替える。'),
    plan('sample-souvenir', 2, '', '', 'shopping', '買い物', 'お土産のチョコを買う', 'シュテファン広場のマンナーで。'),
    plan('sample-hotel-out', 3, '10:45', '', 'other', 'その他', 'チェックアウト', 'ベルヴェデーレからはトラムDで戻る。', { stay: { bookingId: 'sample-hotel', endpoint: 'end' } }),
    plan('sample-airport', 3, '12:08', '12:24', 'transport', '移動', '空港へ', '行きに買ったCATの往復券で。', { transport: { mode: 'train', origin: 'ウィーン・ミッテ駅', destination: 'ウィーン空港', durationMinutes: 16 } }),
  ];
}
