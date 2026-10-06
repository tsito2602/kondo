import type { Booking, ItineraryItem, Place } from './types';

/**
 * When a place is on the schedule: its plan in the しおり, else the earliest
 * non-hotel booking linked to it (the concert at the opera house, the table
 * at the restaurant). Hotels keep their house pin and are never numbered.
 */
export type PlaceVisit = { day: string; time: string; key: string; item?: ItineraryItem; booking?: Booking };

const visitOrder = (visit: PlaceVisit) => `${visit.day} ${visit.time || '99:99'} ${visit.key}`;

export function placeVisits(places: Place[], items: ItineraryItem[], bookings: readonly Booking[] = []): Map<string, PlaceVisit> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const placeIds = new Set(places.map((place) => place.id));
  const booked = new Map<string, PlaceVisit>();
  for (const booking of bookings) {
    if (booking.kind === 'hotel' || !booking.placeId || !placeIds.has(booking.placeId)) continue;
    const visit = { day: booking.day, time: booking.time, key: booking.id, booking };
    const current = booked.get(booking.placeId);
    if (!current || visitOrder(visit).localeCompare(visitOrder(current)) < 0) booked.set(booking.placeId, visit);
  }
  const visits = new Map<string, PlaceVisit>();
  for (const place of places) {
    const item = place.itineraryItemId ? byId.get(place.itineraryItemId) : undefined;
    const visit = item ? { day: item.day, time: item.time, key: item.id, item } : booked.get(place.id);
    if (visit) visits.set(place.id, visit);
  }
  return visits;
}

/**
 * Stable place numbers shared by しおり, 場所 and メモ: scheduled places (a plan
 * or a linked booking) come first in date and time order, then candidates.
 * Candidates keep their id order so editing a title or status never renumbers them.
 */
export function placeNumbers(places: Place[], items: ItineraryItem[], bookings: readonly Booking[] = []): Map<string, number> {
  const visits = placeVisits(places, items, bookings);
  const scheduled = places
    .filter((place) => visits.has(place.id))
    .sort((a, b) => visitOrder(visits.get(a.id)!).localeCompare(visitOrder(visits.get(b.id)!)));
  const candidates = places.filter((place) => !visits.has(place.id)).sort((a, b) => a.id.localeCompare(b.id));
  return new Map([...scheduled, ...candidates].map((place, index) => [place.id, index + 1]));
}
