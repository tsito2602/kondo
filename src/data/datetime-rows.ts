// The arithmetic behind the Google Calendar-style date and time rows of the
// plan form: a start and an end as day + "HH:MM", moved together like
// Google Calendar does (changing the start keeps the length). DOM-free.

export type When = { day: string; time: string; endDay: string; endTime: string };

const DAY = 24 * 60;
const dayNumber = (day: string) =>
  Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const dayFromNumber = (value: number) =>
  new Date(value * 86_400_000).toISOString().slice(0, 10);
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const clock = (value: number) => {
  const inDay = ((value % DAY) + DAY) % DAY;
  return `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
};
/** Minutes from the epoch's midnight, so ends past midnight compare simply. */
const at = (day: string, time: string) => dayNumber(day) * DAY + minutes(time);
const split = (value: number) => ({
  day: dayFromNumber(Math.floor(value / DAY)),
  time: clock(value),
});

/** The default length of a new timed plan, as in Google Calendar. */
export const DEFAULT_LENGTH = 60;

/** Untimed plans have no end; a timed plan always has one. */
export function withTime(when: When, time: string): When {
  const start = at(when.day, time);
  const length =
    when.time && when.endTime
      ? Math.max(15, at(when.endDay || when.day, when.endTime) - at(when.day, when.time))
      : DEFAULT_LENGTH;
  const end = split(start + length);
  return { day: when.day, time, endDay: end.day, endTime: end.time };
}

export function untimed(when: When): When {
  return { day: when.day, time: "", endDay: "", endTime: "" };
}

/** A new start day moves the end with it (same length). */
export function withDay(when: When, day: string): When {
  if (!when.time) return { ...when, day };
  return withTime({ ...when, day, endDay: when.endDay ? shiftDay(when.endDay, dayNumber(day) - dayNumber(when.day)) : "" }, when.time);
}

/** A picked end day; an end that would fall before the start snaps to start + 1h. */
export function withEndDay(when: When, endDay: string): When {
  const next = { ...when, endDay };
  if (!when.time) return next;
  if (at(endDay, when.endTime || when.time) <= at(when.day, when.time))
    return withTime({ ...when, endTime: "" }, when.time);
  return next;
}

export function withEnd(when: When, endDay: string, endTime: string): When {
  return { ...when, endDay, endTime };
}

export function shiftDay(day: string, by: number) {
  return dayFromNumber(dayNumber(day) + by);
}

export type EndOption = { day: string; time: string; length?: number };

/**
 * The end-time list. On the start's day or the next one it runs from the
 * start for 24 hours in 15-minute steps with the length beside each time
 * (Google Calendar's "(1時間)"); on a later day it is that day's plain clock.
 */
export function endOptions(when: When, step = 15): EndOption[] {
  const endDay = when.endDay || when.day;
  const start = at(when.day, when.time);
  const options: EndOption[] = [];
  if (dayNumber(endDay) - dayNumber(when.day) <= 1) {
    const first = Math.floor(start / step) * step + step;
    for (let value = first; value <= start + DAY; value += step)
      options.push({ ...split(value), length: value - start });
  } else {
    for (let value = 0; value < DAY; value += step)
      options.push({ day: endDay, time: clock(value) });
  }
  const current = when.endTime && { day: endDay, time: when.endTime };
  if (current && !options.some((o) => o.day === current.day && o.time === current.time)) {
    const value = at(current.day, current.time);
    options.push({ ...current, length: value > start && value - start <= DAY ? value - start : undefined });
    options.sort((a, b) => at(a.day, a.time) - at(b.day, b.time));
  }
  return options;
}

/** Every start time in 15-minute steps, plus an off-grid current value. */
export function startOptions(current: string, step = 15): string[] {
  const list = Array.from({ length: DAY / step }, (_, index) => clock(index * step));
  if (current && !list.includes(current)) list.push(current), list.sort();
  return list;
}

/** "30分" / "1時間" / "1時間30分", as Google Calendar labels lengths. */
export function lengthLabel(value: number) {
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest}分`;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}
