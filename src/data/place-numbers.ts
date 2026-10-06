import type { ItineraryItem, Place } from './types';

/**
 * Stable place numbers shared with the map: places on the itinerary come first
 * in date and time order, then candidates. Candidates keep their id order so
 * editing a title or status never renumbers them.
 */
export function placeNumbers(places: Place[], items: ItineraryItem[]): Map<string, number> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const scheduled = places
    .filter((place) => place.itineraryItemId && byId.has(place.itineraryItemId))
    .map((place) => ({ place, item: byId.get(place.itineraryItemId!)! }))
    .sort((a, b) => `${a.item.day} ${a.item.time || '99:99'} ${a.item.id}`.localeCompare(`${b.item.day} ${b.item.time || '99:99'} ${b.item.id}`))
    .map(({ place }) => place);
  const scheduledIds = new Set(scheduled.map((place) => place.id));
  const candidates = places.filter((place) => !scheduledIds.has(place.id)).sort((a, b) => a.id.localeCompare(b.id));
  return new Map([...scheduled, ...candidates].map((place, index) => [place.id, index + 1]));
}
