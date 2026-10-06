import { addDays } from '../utils/dates';
import { streamLines } from './stream-lines';
import type { Booking, BookingKind } from './types';

// What the import reads from one booking confirmation. The Worker validates the
// model's rows into this shape, and the demo simulates the same rows.
export type ImportedBooking = {
  kind: BookingKind;
  title: string;
  detail: string;
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  day: string;
  time: string;
  endDay: string;
  endTime: string;
  confirmationCode: string;
  /** Seats, room or party size, as printed. Saved into the booking's memo. */
  party: string;
  /** Index of the file the booking was read from; that file becomes its document. */
  source: number;
  review: ImportReview;
};

export const importReviews = ['none', 'missing_date', 'missing_people', 'unclear'] as const;
export type ImportReview = (typeof importReviews)[number];
export const importReviewText: Record<Exclude<ImportReview, 'none'>, string> = {
  missing_date: '日付が読み取れません',
  missing_people: '人数が書かれていません',
  unclear: '内容をはっきり読み取れません',
};
export const importKinds: readonly BookingKind[] = ['flight', 'hotel', 'train', 'car', 'restaurant', 'ticket', 'other'];
export const importFileTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
export const IMPORT_MAX_FILES = 10;
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isDay = (value: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Validate one row from the model. Unreadable dates are left for the review step, never guessed. */
export function normalizeImportedBooking(raw: unknown, fileCount: number): ImportedBooking | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const kind = importKinds.includes(row.kind as BookingKind) ? (row.kind as BookingKind) : 'other';
  const day = text(row.day, 10);
  const time = text(row.time, 5);
  const endDay = text(row.end_day ?? row.endDay, 10);
  const endTime = text(row.end_time ?? row.endTime, 5);
  const source = Number(row.source_file ?? row.source);
  const reported = importReviews.includes(row.review_reason as ImportReview) ? (row.review_reason as ImportReview) : importReviews.includes(row.review as ImportReview) ? (row.review as ImportReview) : 'none';
  const title = text(row.title, 160);
  const result: ImportedBooking = {
    kind,
    title,
    detail: text(row.detail, 500),
    origin: text(row.origin, 160),
    originCode: text(row.origin_code ?? row.originCode, 8).toUpperCase(),
    destination: text(row.destination, 160),
    destinationCode: text(row.destination_code ?? row.destinationCode, 8).toUpperCase(),
    day: isDay(day) ? day : '',
    time: isTime(time) ? time : '',
    endDay: isDay(endDay) ? endDay : '',
    endTime: isTime(endTime) ? endTime : '',
    confirmationCode: text(row.confirmation_code ?? row.confirmationCode, 120),
    party: text(row.party, 120),
    source: Number.isInteger(source) && source >= 0 && source < fileCount ? source : 0,
    review: reported,
  };
  if (!result.day) result.review = 'missing_date';
  else if (!result.title && !result.originCode && !result.origin) result.review = 'unclear';
  return result;
}

export function importTitle(row: Pick<ImportedBooking, 'kind' | 'title' | 'origin' | 'originCode' | 'destination' | 'destinationCode'>) {
  const route = [row.originCode || row.origin, row.destinationCode || row.destination].filter(Boolean).join(' → ');
  if (row.kind === 'flight') return [row.title, route].filter(Boolean).join(' ') || 'フライト';
  return row.title || route || '予約';
}

const squash = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
/** The same booking read again: same kind and day, and the same name, time or (for non-shared) number. */
export function findDuplicateBooking(row: ImportedBooking, bookings: readonly Booking[]) {
  return bookings.find((booking) => {
    if (booking.kind !== row.kind || !row.day || booking.day !== row.day) return false;
    const sameTitle = Boolean(row.title) && squash(booking.title) === squash(row.title);
    const sameTime = Boolean(row.time) && booking.time === row.time;
    const sameRoute = Boolean(row.originCode) && booking.originCode === row.originCode && booking.destinationCode === row.destinationCode;
    return sameTitle || (sameTime && (sameRoute || squash(booking.title) === squash(importTitle(row))));
  });
}

export function importedBookingInput(row: ImportedBooking) {
  const range = ['flight', 'train', 'car', 'hotel'].includes(row.kind);
  return {
    kind: row.kind,
    title: importTitle(row).slice(0, 160),
    detail: row.detail,
    origin: row.origin,
    originCode: row.originCode,
    destination: row.destination,
    destinationCode: row.destinationCode,
    day: row.day,
    time: row.time,
    endDay: range ? row.endDay || row.day : row.day,
    endTime: range ? row.endTime : row.time,
    confirmationCode: row.confirmationCode,
    note: row.party ? `人数・座席：${row.party}` : '',
    durationMinutes: null,
  };
}

export type ImportEvent =
  | { type: 'status'; phase: 'reading' }
  | { type: 'booking'; booking: ImportedBooking }
  | { type: 'complete'; count: number }
  | { type: 'error'; error: string }
  | { type: 'heartbeat' };

/** Read the Worker's NDJSON stream. Each booking arrives as soon as the model finishes it. */
export async function receiveBookingImport(response: Response, onBooking: (row: ImportedBooking) => void, signal: AbortSignal, fileCount: number) {
  if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('取り込み結果の形式を確認できませんでした');
  for await (const line of streamLines(response.body, signal)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as ImportEvent;
    if (event.type === 'booking') {
      const row = normalizeImportedBooking(event.booking, fileCount);
      if (row) onBooking(row);
    } else if (event.type === 'error') throw new Error(event.error || '予約を読み取れませんでした');
    else if (event.type === 'complete') return;
  }
  throw new Error('受信が途中で切れました。もう一度取り込んでください');
}

/** Sample results for demo mode, placed on the sample trip's days. */
export function demoImportRows(startsOn: string): ImportedBooking[] {
  const base = { detail: '', origin: '', originCode: '', destination: '', destinationCode: '', time: '', endDay: '', endTime: '', confirmationCode: '', party: '', review: 'none' as ImportReview };
  return [
    { ...base, kind: 'ticket', title: 'シェーンブルン宮殿', detail: 'インペリアル・ツアー', day: addDays(startsOn, 3), time: '09:00', confirmationCode: 'SBG-204718', party: '大人2名', source: 0 },
    { ...base, kind: 'flight', title: 'サンプル航空 101', detail: 'サンプル航空', origin: '成田国際空港', originCode: 'NRT', destination: 'ドバイ国際空港', destinationCode: 'DXB', day: startsOn, time: '22:20', endDay: addDays(startsOn, 1), endTime: '05:30', confirmationCode: 'SAMPLE', source: 1 },
    { ...base, kind: 'flight', title: 'サンプル航空 203', detail: 'サンプル航空', origin: 'ドバイ国際空港', originCode: 'DXB', destination: '成田国際空港', destinationCode: 'NRT', day: addDays(startsOn, 4), time: '02:50', endDay: addDays(startsOn, 4), endTime: '17:35', confirmationCode: 'SAMPLE', party: '38A・38B', source: 1 },
    { ...base, kind: 'restaurant', title: 'マイヤー・アム・プファールプラッツ', detail: 'ホイリゲ（グリンツィング）', day: addDays(startsOn, 2), time: '12:00', confirmationCode: 'MP-3302', review: 'missing_people', source: 2 },
  ];
}
