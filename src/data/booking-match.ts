import type { Booking, BookingKind, ItineraryItem } from './types';

type BookingMatchInput = Pick<Booking, 'kind' | 'title' | 'detail' | 'origin' | 'originCode' | 'destination' | 'destinationCode' | 'day' | 'time'>;

export type BookingMatch = {
  item: ItineraryItem;
  confidence: 'high' | 'medium';
  reason: string;
  score: number;
};

const KIND_WORDS: Record<BookingKind, string[]> = {
  flight: ['空港', '飛行機', 'フライト', '搭乗', '出発', '到着'],
  hotel: ['ホテル', '宿', '宿泊', 'チェックイン', 'チェックアウト'],
  train: ['鉄道', '電車', '列車', '新幹線', '駅', '乗車'],
  car: ['車', 'レンタカー', '受取', '返却'],
  restaurant: ['食事', '飲食', 'レストラン', '予約', 'ランチ', 'ディナー'],
  ticket: ['入場', 'チケット', '観光', '美術館', '博物館'],
  other: ['予約'],
};

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function identifiers(value: string) {
  return new Set(value.normalize('NFKC').toLocaleLowerCase().match(/[a-z]{1,4}\s*\d{1,4}|[a-z]{3}|\d{2,4}/g)?.map((part) => part.replace(/\s/g, '')) ?? []);
}

function sharedIdentifier(left: string, right: string) {
  const rightIdentifiers = identifiers(right);
  return [...identifiers(left)].some((value) => rightIdentifiers.has(value));
}

function contentScore(item: ItineraryItem, booking: BookingMatchInput) {
  const itemText = `${item.title} ${item.note}`;
  const bookingText = [booking.title, booking.detail, booking.origin, booking.originCode, booking.destination, booking.destinationCode].join(' ');
  const normalizedItem = normalize(itemText);
  const normalizedBooking = normalize(bookingText);
  let score = 0;

  if (normalizedItem.length >= 3 && normalizedBooking.length >= 3 && (normalizedItem.includes(normalizedBooking) || normalizedBooking.includes(normalizedItem))) score += 30;
  if (sharedIdentifier(itemText, bookingText)) score += 25;
  if ([booking.origin, booking.destination, booking.originCode, booking.destinationCode].some((place) => {
    const normalizedPlace = normalize(place);
    return normalizedPlace.length >= 2 && normalizedItem.includes(normalizedPlace);
  })) score += 25;
  if (KIND_WORDS[booking.kind].some((word) => normalizedItem.includes(normalize(word)) && normalizedBooking.includes(normalize(word)))) score += 15;
  return score;
}

export function findMatchingItineraryItem(items: ItineraryItem[], booking: BookingMatchInput): BookingMatch | null {
  const bookingMinutes = minutes(booking.time);
  if (!booking.day || bookingMinutes === null) return null;

  const matches = items.flatMap((item) => {
    if (item.day !== booking.day) return [];
    const itemMinutes = minutes(item.time);
    if (itemMinutes === null) return [];
    const difference = Math.abs(itemMinutes - bookingMinutes);
    const timeScore = difference === 0 ? 50 : difference <= 30 ? 35 : difference <= 90 ? 20 : 0;
    if (!timeScore) return [];
    const score = timeScore + contentScore(item, booking);
    if (score < 50) return [];
    return [{
      item,
      score,
      confidence: score >= 75 ? 'high' as const : 'medium' as const,
      reason: score >= 75 ? '日時と内容が近い予定' : difference === 0 ? '日時が一致する予定' : '近い時間の予定',
    }];
  });

  return matches.sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))[0] ?? null;
}
