import { airportName, findAirportByCode } from './airports';
import { findFlightConnections, formatConnectionDuration, localDateTimeToEpoch } from './flight-connections';
import { itemCategory, itemDetails, transportLabel } from './itinerary';
import { buildTimeline, laterDayMark, nightsOf, timelineEntries, zoneResolver, type DayEntry } from './plan-timeline';
import type { Booking, ItineraryItem, Place, Trip } from './types';

/**
 * しおりを渡す (Tsubasa 2026-11-11, mock A・1): the trip rebuilt for parents.
 * A first sheet with where we are each night, the flights, the hotels and the
 * time difference; then one sheet per day with local time large and Japan
 * time beside it. Booking numbers, memos, packing and tasks are left out.
 */

export const JAPAN_ZONE = 'Asia/Tokyo';

export type SheetGlyph = 'sight' | 'meal' | 'move' | 'shop' | 'other' | 'up' | 'down' | 'in' | 'out' | 'bed' | 'ticket';
export type SheetKind = 'sightseeing' | 'meal' | 'transport' | 'stay' | 'ticket' | 'shopping' | 'other';
export type SheetRow = {
  key: string;
  time: string;
  /** Japan's clock at that moment ('' when the place already keeps Japan time). */
  japan: string;
  /** 翌 / 前日 when Japan is already on another date. */
  japanMark: string;
  glyph: SheetGlyph;
  kind: SheetKind;
  title: string;
  sub: string;
};
export type SheetDay = {
  day: string;
  number: number;
  date: string;
  short: string;
  route: string;
  /** Where the night is spent, or the way home on the last day. */
  night: { glyph: SheetGlyph; lead: string; text: string } | null;
  /** Every row keeps Japan time: the 日本 column is left out. */
  japanOnly: boolean;
  rows: SheetRow[];
};
export type SheetFlight = { date: string; number: string; route: string; times: string; japan: string };
export type SheetHotel = { name: string; address: string; span: string };
export type SheetOffset = { city: string; hours: string };
export type ParentSheet = {
  name: string;
  span: string;
  asOf: string;
  days: SheetDay[];
  flights: SheetFlight[];
  hotels: SheetHotel[];
  offsets: SheetOffset[];
};

const WEEK = '日月火水木金土';
const at = (day: string) => new Date(`${day}T12:00:00Z`);
const weekday = (day: string) => WEEK[at(day).getUTCDay()];
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${weekday(day)})`;
const longDate = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日(${weekday(day)})`;
const addDay = (day: string, count: number) => {
  const date = at(day);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
const isLink = (text: string) => /^https?:\/\//i.test(text.trim());

/** 成田国際空港 → 成田: the word a parent says, else the city, else the code. */
export function airportShort(code: string, saved = '') {
  const name = airportName(code, saved).replace(/(国際)?空港$/, '').trim();
  return name || findAirportByCode(code)?.city || code || saved;
}
/** A city for 毎日の居場所; airports at home keep their own name (成田, 羽田), the one parents drive to. */
const cityOf = (code: string, saved = '') => {
  const airport = findAirportByCode(code);
  return airport?.timeZone === JAPAN_ZONE ? airportShort(code, saved) : airport?.city || airportShort(code, saved);
};

/** Japan's wall clock for a local moment; the mark (翌 / 前日) is against `from`, the local date by default. */
export function japanTime(day: string, time: string, zone: string | undefined, from = day) {
  if (!time || !zone) return null;
  let date = day;
  let clock = time;
  if (zone !== JAPAN_ZONE) {
    const epoch = localDateTimeToEpoch(day, time, zone);
    if (epoch === null) return null;
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', { timeZone: JAPAN_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(epoch))
        .map((part) => [part.type, part.value]),
    );
    date = `${parts.year}-${parts.month}-${parts.day}`;
    clock = `${parts.hour}:${parts.minute}`;
  }
  const mark = date > from ? laterDayMark(from, date) : date < from ? '前日' : '';
  return { time: `${Number(clock.slice(0, 2))}:${clock.slice(3)}`, mark, japan: zone === JAPAN_ZONE };
}

/** Hours ahead of (+) or behind (−) Japan on a day, e.g. −8 or −3.5. */
export function hoursFromJapan(zone: string, day: string) {
  const local = localDateTimeToEpoch(day, '12:00', zone);
  const japan = localDateTimeToEpoch(day, '12:00', JAPAN_ZONE);
  if (local === null || japan === null) return null;
  return (japan - local) / 3600000;
}
const signed = (hours: number) => `${hours > 0 ? '+' : hours < 0 ? '−' : '±'}${Math.abs(hours)}`;

const kindOfBooking = (kind: Booking['kind']): SheetKind =>
  kind === 'flight' || kind === 'train' || kind === 'car' ? 'transport' : kind === 'hotel' ? 'stay' : kind === 'restaurant' ? 'meal' : kind === 'ticket' ? 'ticket' : 'other';
const categoryGlyph: Record<string, SheetGlyph> = { sightseeing: 'sight', meal: 'meal', transport: 'move', shopping: 'shop', other: 'other' };

/** The days the しおり shows: the trip's own, plus any day a plan or a hotel night falls on. */
export function sheetDays(trip: Pick<Trip, 'startsOn' | 'endsOn'>, items: ItineraryItem[], bookings: Booking[], places: Place[]) {
  const values = new Set(timelineEntries(items, bookings, places).map((entry) => entry.day));
  for (const booking of bookings) {
    if (booking.kind !== 'hotel') continue;
    for (let day = booking.day, count = 0; day <= booking.endDay && count < 1096; day = addDay(day, 1), count++) values.add(day);
  }
  for (let day = trip.startsOn, count = 0; day && day <= trip.endsOn && count < 1096; day = addDay(day, 1), count++) values.add(day);
  return [...values].filter(Boolean).sort();
}

function entryRow(entry: DayEntry, zoneAt: (day: string, time: string) => string, places: readonly Place[]): SheetRow {
  const found = japanTime(entry.day, entry.time, zoneAt(entry.day, entry.time));
  const japan = found && !found.japan ? found : null;
  const base = { key: entry.key, time: entry.time, japan: japan?.time ?? '', japanMark: japan?.mark ?? '' };
  if (entry.item) {
    const item = entry.item;
    const details = itemDetails(item);
    const category = itemCategory(item).value;
    let sub = '';
    if (category === 'transport') {
      const { origin = '', destination = '' } = details.transport ?? {};
      sub = [transportLabel(details), origin || destination ? `${origin || '出発地'} → ${destination || '目的地'}` : ''].filter(Boolean).join('　');
    } else {
      const place = places.find((candidate) => candidate.itineraryItemId === item.id)?.title ?? (isLink(details.location) ? '' : details.location.trim());
      if (place && !item.title.includes(place)) sub = place;
    }
    return { ...base, glyph: categoryGlyph[category] ?? 'other', kind: category, title: item.title, sub };
  }
  const booking = entry.booking!;
  const kind = kindOfBooking(booking.kind);
  if (booking.kind === 'flight' || booking.kind === 'train') {
    const flight = booking.kind === 'flight';
    const from = flight ? airportShort(booking.originCode, booking.origin) : booking.origin;
    const to = flight ? airportShort(booking.destinationCode, booking.destination) : booking.destination;
    if (entry.endpoint === 'end')
      return { ...base, glyph: flight ? 'down' : 'move', kind, title: `${to || booking.title}に到着`, sub: booking.title };
    const arrivalZone = flight ? findAirportByCode(booking.destinationCode)?.timeZone : zoneAt(booking.endDay || booking.day, booking.endTime);
    const arrivalJapan = japanTime(booking.endDay || booking.day, booking.endTime, arrivalZone, booking.day);
    const arrival =
      entry.joinedArrival && booking.endTime
        ? `${laterDayMark(booking.day, booking.endDay)}${booking.endTime}着${arrivalJapan && !arrivalJapan.japan ? `（日本 ${arrivalJapan.mark}${arrivalJapan.time}）` : ''}`
        : '';
    const route = from || to ? `${from || '出発地'} → ${to || '到着地'}` : '';
    const title = flight ? `飛行機 ${booking.title}`.trim() : booking.title || '電車';
    return { ...base, glyph: flight ? 'up' : 'move', kind, title, sub: [route, arrival].filter(Boolean).join('\n') };
  }
  if (booking.kind === 'hotel')
    return { ...base, glyph: entry.endpoint === 'end' ? 'out' : 'in', kind, title: entry.endpoint === 'end' ? 'チェックアウト' : 'チェックイン', sub: booking.title };
  if (booking.kind === 'car') return { ...base, glyph: 'move', kind, title: `レンタカーを${entry.endpoint === 'end' ? '返す' : '借りる'}`, sub: booking.title };
  const venue = booking.placeId ? places.find((place) => place.id === booking.placeId)?.title ?? '' : isLink(booking.location ?? '') ? '' : (booking.location ?? '').trim();
  return {
    ...base,
    glyph: booking.kind === 'restaurant' ? 'meal' : booking.kind === 'ticket' ? 'ticket' : 'other',
    kind,
    title: booking.title,
    sub: venue && !booking.title.includes(venue) ? venue : '',
  };
}

export function buildParentSheet({
  trip,
  items,
  bookings,
  places,
  now = new Date(),
}: {
  trip: Pick<Trip, 'name' | 'destination' | 'startsOn' | 'endsOn' | 'memberCount'>;
  items: ItineraryItem[];
  bookings: Booking[];
  places: Place[];
  now?: Date;
}): ParentSheet {
  const days = sheetDays(trip, items, bookings, places);
  const timeline = buildTimeline({ days, items, bookings, places, now: null });
  const zoneAt = zoneResolver(bookings);
  const connections = findFlightConnections(bookings);
  const flights = bookings.filter((booking) => booking.kind === 'flight' && booking.day).sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`));
  const hotels = bookings.filter((booking) => booking.kind === 'hotel' && booking.day).sort((a, b) => a.day.localeCompare(b.day));
  const last = days.at(-1);

  const sheetDaysOut: SheetDay[] = timeline.map(({ day, rows }, index) => {
    const out: SheetRow[] = [];
    for (const row of rows) {
      if (row.type === 'entry') out.push(entryRow(row.entry, zoneAt, places));
      else if (row.type === 'connection' && out.length) {
        const previous = out[out.length - 1];
        const wait = `乗り継ぎ ${formatConnectionDuration(row.connection.durationMinutes)}`;
        previous.sub = [previous.sub, wait].filter(Boolean).join('\n');
      }
    }
    // Where we are: the cities this day's flights join, else the trip's destination.
    const leaving = flights.filter((flight) => flight.day === day);
    const landing = flights.filter((flight) => (flight.endDay || flight.day) === day);
    const cities: string[] = [];
    for (const flight of leaving) {
      for (const city of [cityOf(flight.originCode, flight.origin), cityOf(flight.destinationCode, flight.destination)])
        if (city && cities.at(-1) !== city) cities.push(city);
    }
    if (!cities.length && landing.length) cities.push(cityOf(landing.at(-1)!.destinationCode, landing.at(-1)!.destination));
    // A day without flights: where the last flight landed (Tsubasa 2026-11-11: the
    // trip's own 行き先 listed every city, as if we were in all of them at once).
    if (!cities.length) {
      const landed = flights.filter((flight) => (flight.endDay || flight.day) < day).at(-1);
      if (landed) cities.push(cityOf(landed.destinationCode, landed.destination));
    }
    const route = cities.length ? cities.join(' → ') : trip.destination.trim();
    // Where the night is spent.
    const hotel = hotels.find((booking) => booking.day <= day && day < (booking.endDay || booking.day));
    const overnight = leaving.find((flight) => (flight.endDay || flight.day) > day);
    const layover = connections.find((connection) => {
      const arrival = bookings.find((booking) => booking.id === connection.arrivalBookingId);
      const departure = bookings.find((booking) => booking.id === connection.departureBookingId);
      return arrival && departure && (arrival.endDay || arrival.day) === day && departure.day > day;
    });
    let night: SheetDay['night'] = null;
    if (hotel) night = { glyph: 'bed', lead: 'この日の夜', text: hotel.title };
    else if (overnight) night = { glyph: 'up', lead: 'この日の夜', text: '機内' };
    else if (layover) night = { glyph: 'up', lead: 'この日の夜', text: `${airportShort(layover.airportCode, layover.airportName)}で乗り継ぎ` };
    else if (day === last) {
      const home = landing.find((flight) => findAirportByCode(flight.destinationCode)?.timeZone === JAPAN_ZONE);
      if (home) night = { glyph: 'down', lead: 'この日', text: `${home.endTime ? `${home.endTime} ` : ''}${airportShort(home.destinationCode, home.destination)}に帰ってきます` };
    }
    const japanOnly = out.every((row) => !row.japan);
    return { day, number: index + 1, date: longDate(day), short: md(day), route, night, japanOnly, rows: out };
  });

  const flightRows: SheetFlight[] = flights.map((flight) => {
    const depZone = findAirportByCode(flight.originCode)?.timeZone;
    const arrZone = findAirportByCode(flight.destinationCode)?.timeZone;
    const arrivalDay = flight.endDay || flight.day;
    const times = [flight.time, flight.endTime ? `${laterDayMark(flight.day, arrivalDay)}${flight.endTime}` : ''].filter(Boolean).join(' → ');
    const japanAt = (day: string, time: string, zone?: string) => {
      const japan = japanTime(day, time, zone, flight.day);
      return japan ? `${japan.mark}${japan.time}` : '';
    };
    const both = depZone === JAPAN_ZONE && arrZone === JAPAN_ZONE;
    const japan = both || (!depZone && !arrZone) ? '' : [japanAt(flight.day, flight.time, depZone), japanAt(arrivalDay, flight.endTime, arrZone)].filter(Boolean).join(' → ');
    return {
      date: md(flight.day),
      number: flight.title,
      route: `${airportShort(flight.originCode, flight.origin)} → ${airportShort(flight.destinationCode, flight.destination)}`,
      times,
      japan: japan ? `日本 ${japan}` : '',
    };
  });

  const hotelRows: SheetHotel[] = hotels.map((hotel) => {
    const nights = nightsOf(hotel);
    const location = (hotel.location ?? '').trim();
    return { name: hotel.title, address: isLink(location) ? '' : location, span: `${md(hotel.day)} 〜 ${md(hotel.endDay || hotel.day)}${nights ? ` · ${nights}泊` : ''}` };
  });

  const offsets: SheetOffset[] = [];
  const seen = new Set<string>();
  for (const flight of flights)
    for (const [code, saved] of [[flight.originCode, flight.origin], [flight.destinationCode, flight.destination]]) {
      const zone = findAirportByCode(code)?.timeZone;
      if (!zone || zone === JAPAN_ZONE || seen.has(zone)) continue;
      seen.add(zone);
      const hours = hoursFromJapan(zone, flight.day);
      if (hours !== null && hours !== 0) offsets.push({ city: cityOf(code, saved), hours: signed(hours) });
    }

  const span = trip.startsOn && trip.endsOn ? `${longDate(trip.startsOn)}〜${longDate(trip.endsOn)} · ${days.length}日間${trip.memberCount ? ` · ${trip.memberCount}人` : ''}` : '';
  return {
    name: trip.name,
    span,
    asOf: `${now.getMonth() + 1}月${now.getDate()}日 時点の予定`,
    days: sheetDaysOut,
    flights: flightRows,
    hotels: hotelRows,
    offsets,
  };
}
