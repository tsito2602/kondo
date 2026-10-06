import { findAirportByCode } from './airports';
import { findFlightConnections, type FlightConnection } from './flight-connections';
import { coordsFromLink, distanceMeters, walkMinutes, type LatLng } from './geo';
import { itemDetails, orderItineraryEntries } from './itinerary';
import type { Booking, ItineraryItem, Place } from './types';

export type Entry = {
  key: string;
  day: string;
  time: string;
  title: string;
  item?: ItineraryItem;
  booking?: Booking;
  stage?: string;
  endpoint?: 'start' | 'end';
  /** Hotel endpoints: the travellers' own check-in/out plan, when they set one. */
  plan?: ItineraryItem;
};
export type DayEntry = Entry & { joinedArrival?: boolean };

const stages = {
  flight: ['出発', '到着'],
  hotel: ['チェックイン', 'チェックアウト'],
  train: ['乗車', '到着'],
  car: ['受取', '返却'],
  restaurant: ['予約', '終了'],
  ticket: ['利用', '終了'],
  other: ['予約', '終了'],
} as const;
/** Only these bookings have a far end worth its own place in the day. */
const twoEnded = new Set<Booking['kind']>(['flight', 'train', 'hotel', 'car']);

export const isJourney = (booking?: Booking) => booking?.kind === 'flight' || booking?.kind === 'train';

/** A plan that is really the travellers' own check-in/out time of a hotel booking. */
export function stayPlanOf(item: ItineraryItem, bookings: readonly Booking[]) {
  const stay = item.details?.stay;
  const booking = stay && bookings.find((entry) => entry.id === stay.bookingId && entry.kind === 'hotel');
  return booking && stay ? { booking, endpoint: stay.endpoint } : null;
}

export function timelineEntries(items: ItineraryItem[], bookings: Booking[]): Entry[] {
  const stayPlans = new Map<string, ItineraryItem>();
  const plans: ItineraryItem[] = [];
  for (const item of items) {
    const stay = stayPlanOf(item, bookings);
    if (stay) stayPlans.set(`${stay.booking.id}-${stay.endpoint}`, item);
    // A plan pointing at a deleted hotel booking has nothing left to say.
    else if (!item.details?.stay) plans.push(item);
  }
  return orderItineraryEntries([
    ...plans.map((item) => ({ key: `item-${item.id}`, day: item.day, time: item.time, title: item.title, item })),
    ...bookings.flatMap((booking) => {
      const start = stayPlans.get(`${booking.id}-start`);
      const entries: Entry[] = [
        {
          key: `booking-${booking.id}-start`,
          day: booking.day,
          time: start?.time ?? booking.time,
          title: booking.title,
          booking,
          stage: stages[booking.kind][0],
          endpoint: 'start',
          ...(start ? { plan: start } : {}),
        },
      ];
      if (twoEnded.has(booking.kind) && (booking.endDay || booking.endTime) && ((booking.endDay && booking.endDay !== booking.day) || (booking.endTime && booking.endTime !== booking.time))) {
        const end = stayPlans.get(`${booking.id}-end`);
        entries.push({
          key: `booking-${booking.id}-end`,
          day: booking.endDay || booking.day,
          time: end?.time ?? booking.endTime,
          title: booking.title,
          booking,
          stage: stages[booking.kind][1],
          endpoint: 'end',
          ...(end ? { plan: end } : {}),
        });
      }
      return entries;
    }),
  ]);
}

/** One day's entries; a journey that lands the same day is a single entry. */
export function dayTimeline(entries: Entry[], day: string): DayEntry[] {
  const timed = entries.filter((entry) => entry.day === day);
  return timed.flatMap((entry, index) => {
    const previous = timed[index - 1];
    if (isJourney(entry.booking) && entry.endpoint === 'end' && previous?.booking?.id === entry.booking?.id && previous.endpoint === 'start') return [];
    const next = timed[index + 1];
    return [{ ...entry, joinedArrival: Boolean(isJourney(entry.booking) && entry.endpoint === 'start' && next?.booking?.id === entry.booking?.id && next.endpoint === 'end') }];
  });
}

export function staysOnDay(bookings: Booking[], day: string) {
  return bookings
    .filter((booking) => booking.kind === 'hotel' && booking.day <= day && day <= (booking.endDay || booking.day))
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
}

const dayCount = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
export const nightsOf = (booking: Booking) => Math.max(0, dayCount(booking.day, booking.endDay || booking.day));
/** 翌 / 翌々 for an arrival on a later day, as Japanese timetables say it. */
export function laterDayMark(from: string, to: string) {
  const days = to && from ? dayCount(from, to) : 0;
  return days === 1 ? '翌' : days === 2 ? '翌々' : days > 2 ? `${days}日後` : '';
}
export const toMinutes = (time: string) => (/^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null);
export const fromMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Where a plan is on the map: its numbered place, else a link of its own. */
export function planPlace(item: ItineraryItem, places: readonly Place[]) {
  return places.find((place) => place.itineraryItemId === item.id);
}
export function entryCoords(entry: Entry, places: readonly Place[]): LatLng | null {
  if (entry.item) {
    const details = itemDetails(entry.item);
    if (details.category === 'transport') return null;
    const place = planPlace(entry.item, places);
    return (place && (coordsFromLink(place.location) ?? place.referenceLinks?.map((link) => coordsFromLink(link.url)).find(Boolean))) || coordsFromLink(details.location);
  }
  if (entry.booking && !isJourney(entry.booking)) return coordsFromLink(entry.booking.location) ?? coordsFromLink(entry.booking.detail);
  return null;
}

/** The end of an entry on its own day, when it has one. */
function sameDayEnd(entry: Entry) {
  if (entry.item) {
    const details = itemDetails(entry.item);
    return details.endTime && (!details.endDay || details.endDay === entry.day) ? details.endTime : '';
  }
  if (entry.booking && entry.endpoint === 'start' && !twoEnded.has(entry.booking.kind)) return entry.booking.endTime && (entry.booking.endDay || entry.booking.day) === entry.day ? entry.booking.endTime : '';
  return '';
}

export type Walk = { meters: number; minutes: number; late: number };
/** The walk between two consecutive plans with places, and how late it makes the next. */
export function walkBetween(from: Entry, to: Entry, places: readonly Place[]): Walk | null {
  const a = entryCoords(from, places);
  const b = entryCoords(to, places);
  if (!a || !b) return null;
  const meters = distanceMeters(a, b);
  const minutes = walkMinutes(meters);
  const leave = toMinutes(sameDayEnd(from));
  const start = toMinutes(to.time);
  const late = leave !== null && start !== null && from.day === to.day ? leave + minutes - start : 0;
  return { meters, minutes, late: Math.max(0, late) };
}

// ===== time zones: compare each plan in its own place's clock =====
const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};
export function wallClock(zone: string, now: Date) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(now)
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  } catch {
    return wallClock(deviceZone(), now);
  }
}
/** The zone you are in at a wall-clock moment: before the first flight its origin, after each landing its destination. */
export function zoneResolver(bookings: readonly Booking[]) {
  const flights = bookings
    .filter((booking) => booking.kind === 'flight' && booking.time)
    .map((booking) => ({ from: findAirportByCode(booking.originCode)?.timeZone, to: findAirportByCode(booking.destinationCode)?.timeZone, landed: `${booking.endDay || booking.day} ${booking.endTime || '23:59'}` }))
    .sort((a, b) => a.landed.localeCompare(b.landed));
  return (day: string, time: string) => {
    let zone = flights[0]?.from ?? deviceZone();
    for (const flight of flights) if (flight.landed <= `${day} ${time || '23:59'}` && flight.to) zone = flight.to;
    return zone;
  };
}

export type Row =
  | { type: 'entry'; key: string; entry: DayEntry; past: boolean }
  | { type: 'stay'; key: string; booking: Booking; night: number; past: boolean }
  | { type: 'walk'; key: string; walk: Walk; past: boolean }
  | { type: 'connection'; key: string; booking: Booking; connection: FlightConnection; past: boolean }
  | { type: 'now'; key: string; time: string };
export type TimelineDay = { day: string; rows: Row[]; today: boolean };

/**
 * The しおり, one timeline per day. With `now` inside the trip, past entries are
 * marked and a いま row sits where the current time falls.
 */
export function buildTimeline({ days, items, bookings, places, now }: { days: string[]; items: ItineraryItem[]; bookings: Booking[]; places: Place[]; now?: Date | null }): TimelineDay[] {
  const entries = timelineEntries(items, bookings);
  const connections = findFlightConnections(bookings);
  const zoneAt = zoneResolver(bookings);
  const clock = (day: string, time: string) => (now ? wallClock(zoneAt(day, time), now) : '');
  const live = Boolean(now && days.length && days[0] <= clock(days[0], '').slice(0, 10) && clock(days.at(-1)!, '23:59').slice(0, 10) <= days.at(-1)!);
  const isPast = (day: string, time: string) => {
    if (!live) return false;
    const current = clock(day, time);
    return time ? `${day} ${time}` <= current : day < current.slice(0, 10);
  };
  return days.map((day) => {
    const today = live && clock(day, '12:00').slice(0, 10) === day;
    const rows: Row[] = [];
    let previous: Entry | null = null;
    let nowPlaced = !today;
    const placeNow = () => {
      if (nowPlaced) return;
      nowPlaced = true;
      rows.push({ type: 'now', key: `now-${day}`, time: clock(day, '12:00').slice(11) });
      previous = null;
    };
    const ongoing = staysOnDay(bookings, day).filter((booking) => booking.day < day && day < (booking.endDay || booking.day));
    const dayEntries = dayTimeline(entries, day);
    for (const booking of ongoing) {
      rows.push({ type: 'stay', key: `stay-${booking.id}-${day}`, booking, night: dayCount(booking.day, day) + 1, past: isPast(day, '') });
      previous = { key: `stay-${booking.id}`, day, time: '', title: booking.title, booking };
    }
    for (const entry of dayEntries) {
      const past = isPast(entry.day, entry.time);
      if (!past && entry.time) placeNow();
      if (previous) {
        const walk = walkBetween(previous, entry, places);
        if (walk) rows.push({ type: 'walk', key: `walk-${entry.key}`, walk, past });
      }
      rows.push({ type: 'entry', key: entry.key, entry, past });
      const journey = isJourney(entry.booking);
      if (journey && (entry.joinedArrival || entry.endpoint === 'end')) {
        const connection = connections.find((candidate) => candidate.arrivalBookingId === entry.booking!.id);
        if (connection) rows.push({ type: 'connection', key: `connection-${entry.booking!.id}`, booking: entry.booking!, connection, past });
      }
      previous = journey ? null : entry;
    }
    placeNow();
    return { day, rows, today };
  });
}
