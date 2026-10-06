// The time picker's arithmetic (option C of kondo-time-pickers.html): one plan as
// a block on its day's timeline, moved or resized in 5-minute steps, plus the
// numeric time field's parsing. Kept free of the DOM so it can be tested alone.

/** Minutes since the plan's own midnight; past 24:00 means the next day (翌). */
export type Span = { start: number; end: number };

export const STEP = 5;
export const MIN_LENGTH = 15;
/** The whole day: 00:00 to 翌02:00, so a late dinner can run past midnight. */
export const DAY_START = 0;
export const DAY_END = 26 * 60;
/** The latest a plan may start on its own day. */
export const LAST_START = 24 * 60 - STEP;

export const snap = (minutes: number, step = STEP) => Math.round(minutes / step) * step;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Moves both ends together; the length is kept and the block stays on the day. */
export function moveSpan(span: Span, start: number, step = STEP): Span {
  const length = span.end - span.start;
  const next = clamp(snap(start, step), DAY_START, Math.min(LAST_START, DAY_END - length));
  return { start: next, end: next + length };
}
/** Drags the top edge: never closer than MIN_LENGTH to the end. */
export function resizeStart(span: Span, start: number): Span {
  return { start: clamp(snap(start), DAY_START, Math.min(LAST_START, span.end - MIN_LENGTH)), end: span.end };
}
/** Drags the bottom edge: never closer than MIN_LENGTH to the start. */
export function resizeEnd(span: Span, end: number): Span {
  return { start: span.start, end: clamp(snap(end), span.start + MIN_LENGTH, DAY_END) };
}

/** A typed start (exact minutes): the plan keeps its length, shortened only where the day ends. */
export function typedStart(span: Span, start: number): Span {
  const at = clamp(start, DAY_START, 24 * 60 - 1);
  return { start: at, end: Math.max(at + MIN_LENGTH, Math.min(DAY_END, at + span.end - span.start)) };
}
/** A typed end: earlier than the start means after midnight; null when too short or past the day. */
export function typedEnd(span: Span, end: number): Span | null {
  const at = end <= span.start ? end + 24 * 60 : end;
  return at - span.start < MIN_LENGTH || at > DAY_END ? null : { start: span.start, end: at };
}

/**
 * Keyboard: ↑/↓ move the plan 5 minutes (15 with Shift); with Alt/Option they
 * stretch or shorten the end instead. PageUp/PageDown move an hour.
 */
export function keySpan(span: Span, key: string, { shift = false, alt = false } = {}): Span | null {
  const step = shift ? 15 : STEP;
  const delta = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : key === 'PageUp' ? -60 : key === 'PageDown' ? 60 : 0;
  if (!delta) return null;
  return alt ? resizeEnd(span, span.end + delta) : moveSpan(span, span.start + delta);
}

/** "08:30" for 510, "01:00" for 25:00 (shown with 翌 by the caller). */
export const clockOf = (minutes: number) => {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
};
export const minutesOf = (time: string) => (/^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null);
/** 「1時間30分」 */
export function lengthLabel(minutes: number) {
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}時間` : ''}${minutes % 60 ? `${minutes % 60}分` : ''}`;
}

export type Block = { key: string; title: string; start: number; end: number | null; walk: number | null };
export type WalkFlag = { minutes: number; late: number; at: number };

/** The plan's other blocks around the edited one: the last that ends by its start, the first that starts after its end. */
export function neighbours(span: Span, blocks: readonly Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const prev = sorted.filter((block) => (block.end ?? block.start) <= span.start + 1).pop();
  const next = sorted.find((block) => block.start >= span.end - 1);
  return { prev, next };
}

/**
 * The walks to and from the neighbours (the しおり's lateness rule: leave at the
 * end, walk, compare with the next start). A neighbour without an end time has
 * no lateness, as in the しおり.
 */
export function walkFlags(span: Span, blocks: readonly Block[]) {
  const { prev, next } = neighbours(span, blocks);
  const before: WalkFlag | null =
    prev && prev.walk !== null ? { minutes: prev.walk, late: prev.end === null ? 0 : Math.max(0, prev.end + prev.walk - span.start), at: prev.end ?? prev.start } : null;
  const after: WalkFlag | null = next && next.walk !== null ? { minutes: next.walk, late: Math.max(0, span.end + next.walk - next.start), at: span.end } : null;
  return { before, after };
}

/**
 * The numeric time field, while typing: only digits count (up to four) and the
 * colon appears by itself — 「2220」 shows 22:20, 「930」 9:30.
 */
export function typedClock(text: string) {
  const digits = text
    .normalize('NFKC')
    .replace(/\D/g, '')
    .slice(0, 4);
  if (digits.length < 3) return digits;
  if (digits.length === 3) return Number(digits.slice(0, 2)) > 23 ? `${digits[0]}:${digits.slice(1)}` : `${digits.slice(0, 2)}:${digits[2]}`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * What the numeric field commits: "HH:MM", "" for an empty field, or null when
 * it is not a time of day (00:00–23:59). 「2220」 → 22:20, 「930」 → 09:30,
 * 「9」 → 09:00, 「22:20」 and full-width digits read the same.
 */
export function parseClock(text: string): string | null {
  const value = text.normalize('NFKC').trim();
  if (!value) return '';
  const colon = value.match(/^(\d{1,2})[:：.](\d{2})$/);
  const digits = colon ? null : value.replace(/\s/g, '');
  if (!colon && !/^\d{1,4}$/.test(digits!)) return null;
  const [hours, minutes] = colon
    ? [Number(colon[1]), Number(colon[2])]
    : digits!.length <= 2
      ? [Number(digits), 0]
      : [Number(digits!.slice(0, digits!.length - 2)), Number(digits!.slice(-2))];
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Where a plan without a time starts: the first free hour from 09:00 (else 09:00). */
export function freeStart(blocks: readonly Block[], length = 60, from = 9 * 60) {
  let start = from;
  for (const block of [...blocks].sort((a, b) => a.start - b.start)) {
    const end = block.end ?? block.start + 30;
    if (block.start < start + length && end > start) start = Math.ceil(end / STEP) * STEP;
  }
  return start + length <= 23 * 60 ? start : from;
}
