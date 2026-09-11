import { findAirportByCode } from '@/data/airports';
import type { Booking } from '@/data/types';

const MIN_CONNECTION_MINUTES = 30;
const MAX_CONNECTION_MINUTES = 24 * 60;

type FlightConnectionInput = Pick<
  Booking,
  'id' | 'kind' | 'day' | 'time' | 'endDay' | 'endTime' | 'originCode' | 'destinationCode'
>;

export type FlightConnection = {
  arrivalBookingId: string;
  departureBookingId: string;
  airportCode: string;
  airportName: string;
  durationMinutes: number;
};

function localDateTimeToEpoch(day: string, time: string, timeZone?: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const wallClockAsUtc = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  // Both sides of a connection are at the same airport, so wall-clock time is
  // still enough to calculate the layover when an imported IATA code is not in
  // the bundled airport list yet.
  if (!timeZone) return wallClockAsUtc;
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  let epoch = wallClockAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch)).map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const nextEpoch = wallClockAsUtc - (renderedAsUtc - epoch);
    if (Math.abs(nextEpoch - epoch) < 1000) return nextEpoch;
    epoch = nextEpoch;
  }
  return epoch;
}

function endpointEpoch(booking: FlightConnectionInput, endpoint: 'arrival' | 'departure') {
  const code = endpoint === 'arrival' ? booking.destinationCode : booking.originCode;
  const airport = findAirportByCode(code);
  const day = endpoint === 'arrival' ? booking.endDay : booking.day;
  const time = endpoint === 'arrival' ? booking.endTime : booking.time;
  return localDateTimeToEpoch(day, time, airport?.timeZone);
}

export function findFlightConnections(bookings: readonly FlightConnectionInput[]) {
  const flights = bookings.filter((booking) => booking.kind === 'flight');
  const arrivals = flights.flatMap((booking) => {
    const airportCode = booking.destinationCode.trim().toUpperCase();
    const epoch = endpointEpoch(booking, 'arrival');
    return airportCode && epoch !== null ? [{ booking, airportCode, epoch }] : [];
  });
  const departures = flights.flatMap((booking) => {
    const airportCode = booking.originCode.trim().toUpperCase();
    const epoch = endpointEpoch(booking, 'departure');
    return airportCode && epoch !== null ? [{ booking, airportCode, epoch }] : [];
  }).sort((left, right) => left.epoch - right.epoch);

  const usedArrivals = new Set<string>();
  const connections: FlightConnection[] = [];

  for (const departure of departures) {
    const candidate = arrivals
      .filter((arrival) => arrival.booking.id !== departure.booking.id
        && !usedArrivals.has(arrival.booking.id)
        && arrival.airportCode === departure.airportCode)
      .map((arrival) => ({ arrival, durationMinutes: Math.round((departure.epoch - arrival.epoch) / 60000) }))
      .filter(({ durationMinutes }) => durationMinutes >= MIN_CONNECTION_MINUTES && durationMinutes <= MAX_CONNECTION_MINUTES)
      .sort((left, right) => left.durationMinutes - right.durationMinutes)[0];

    if (!candidate) continue;
    usedArrivals.add(candidate.arrival.booking.id);
    const airport = findAirportByCode(departure.airportCode);
    connections.push({
      arrivalBookingId: candidate.arrival.booking.id,
      departureBookingId: departure.booking.id,
      airportCode: departure.airportCode,
      airportName: airport?.city || airport?.name || departure.airportCode,
      durationMinutes: candidate.durationMinutes,
    });
  }

  return connections;
}

export function formatConnectionDuration(durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (!hours) return `${minutes}分`;
  return `${hours}時間${minutes ? `${minutes}分` : ''}`;
}
