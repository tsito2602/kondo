import type { Place } from './types';

/** A Google Maps place link as pasted from the app's share sheet. */
export const pin = (name: string, lat: number, lng: number) =>
  `https://www.google.com/maps/place/${encodeURIComponent(name)}/@${lat},${lng},17z/data=!4m6!3m5!8m2!3d${lat}!4d${lng}`;

/** The sample trip's spots in Vienna, with their Google Maps coordinates. */
export const VIENNA = {
  sacher: pin('ホテル・ザッハー・ウィーン', 48.20393, 16.3695),
  stephan: pin('シュテファン大聖堂', 48.20849, 16.37314),
  figl: pin('フィグルミュラー', 48.20925, 16.37524),
  musikverein: pin('楽友協会', 48.20052, 16.37256),
  central: pin('カフェ・ツェントラル', 48.21043, 16.36547),
  khm: pin('美術史美術館', 48.20379, 16.36166),
  schoenbrunn: pin('シェーンブルン宮殿', 48.18486, 16.31224),
  oper: pin('ウィーン国立歌劇場', 48.20278, 16.36885),
  belvedere: pin('ベルヴェデーレ宮殿 上宮', 48.19149, 16.38085),
  naschmarkt: pin('ナッシュマルクト', 48.19838, 16.36277),
  prater: pin('プラーター大観覧車', 48.21665, 16.39585),
};

/**
 * The places map: the しおり's plans and the venues linked to the trip's
 * bookings are numbered together by place-numbers.ts in day and time order,
 * then come the spots we may still fit in.
 */
export function demoPlaces(): Place[] {
  const place = (id: string, title: string, location: string, note: string, itineraryItemId: string | null, extra: Partial<Place> = {}): Place => ({
    id, title, note, openingHours: '', reservationStatus: 'not_needed', location, itineraryItemId, ...extra,
  });
  return [
    // Plans in the しおり.
    place('sample-place-stephan', 'シュテファン大聖堂', VIENNA.stephan, '南塔に登る（343段）。', 'sample-stephan'),
    place('sample-place-central', 'カフェ・ツェントラル', VIENNA.central, 'メランジェとアプフェルシュトゥルーデル。朝は並ばずに入れる。', 'sample-cafe'),
    place('sample-place-museum', '美術史美術館', VIENNA.khm, 'ブリューゲルの部屋から回る。2階のカフェのドームも見る。', 'sample-museum', { openingHours: '10:00〜18:00（木曜は21:00まで）', reservationStatus: 'needed' }),
    place('sample-place-schoenbrunn', 'シェーンブルン宮殿', VIENNA.schoenbrunn, '宮殿の中を見たあと、グロリエッテまで丘を登る。U4で約20分。', 'sample-schoenbrunn', { reservationStatus: 'needed' }),
    // Venues of the bookings (linked by placeId; their times come from 予約).
    place('sample-place-belvedere', 'ベルヴェデーレ宮殿 上宮', VIENNA.belvedere, '時間指定券（9:00）は予約済み。クリムト「接吻」を見る。', null, { openingHours: '9:00〜18:00', reservationStatus: 'confirmed' }),
    place('sample-place-figl', 'フィグルミュラー', VIENNA.figl, '着いた日の夕食、17:30に予約済み。シュニッツェルはお皿からはみ出す大きさ。', null, { reservationStatus: 'confirmed' }),
    place('sample-place-musikverein', '楽友協会', VIENNA.musikverein, '着いた日の夜、黄金のホールでモーツァルト。チケットは予約済み。', null, { reservationStatus: 'confirmed' }),
    place('sample-place-oper', 'ウィーン国立歌劇場', VIENNA.oper, '3日目の夜に「魔笛」。ホテルから歩いて2分。', null, { reservationStatus: 'confirmed' }),
    // Still candidates.
    place('sample-place-naschmarkt', 'ナッシュマルクト', VIENNA.naschmarkt, '美術史美術館から歩いて10分。お昼をここで食べるかも。', null, { openingHours: '日曜休み' }),
    place('sample-place-prater', 'プラーター大観覧車', VIENNA.prater, '時間が余ったら。夕方がきれいらしい。', null),
  ];
}
