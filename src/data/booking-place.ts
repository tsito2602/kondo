import { distanceMeters, placeNameFromLink } from './geo';
import { placeCoordinates, registeredGoogleMapsUrl } from './places';
import type { Booking, Place, PlaceInput } from './types';

type BookingVenue = Pick<Booking, 'kind' | 'title' | 'detail'> & { location?: string; placeId?: string | null };

/** Pins this close together are the same venue (a share link and a place link differ slightly). */
const SAME_PIN_METERS = 25;
const sameName = (left: string, right: string) => {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
};

/** The trip's place a Google Maps link points at: the same link, else the same pin. */
export function placeForLink(link: string, places: readonly Place[]): Place | undefined {
  const href = registeredGoogleMapsUrl(link.trim());
  if (!href) return undefined;
  const same = places.find((place) => registeredGoogleMapsUrl(place.location) === href);
  if (same) return same;
  const point = placeCoordinates({ location: href });
  if (!point) return undefined;
  return places.find((place) => {
    const other = placeCoordinates(place);
    return other && distanceMeters(point, other) <= SAME_PIN_METERS;
  });
}

/**
 * The existing place a new booking is for: its map link or pin, else a place
 * named exactly like the venue (the 場所 text, the booking's name or its detail).
 * Hotels keep their own house pin and are never linked.
 */
export function matchBookingPlace(booking: BookingVenue, places: readonly Place[]): Place | undefined {
  if (booking.kind === 'hotel' || !places.length) return undefined;
  const location = (booking.location ?? '').trim();
  const byLink = location ? placeForLink(location, places) : undefined;
  if (byLink) return byLink;
  const names = [registeredGoogleMapsUrl(location) ? (placeNameFromLink(location) ?? '') : location, booking.title, booking.detail];
  for (const name of names) {
    const found = places.find((place) => sameName(place.title, name));
    if (found) return found;
  }
  return undefined;
}

/** A pasted map link that matches no place becomes one of the trip's places. */
export function newBookingPlace(booking: BookingVenue, link: string): PlaceInput {
  return {
    title: (placeNameFromLink(link) ?? booking.title).trim().slice(0, 160) || booking.title,
    note: '',
    openingHours: '',
    reservationStatus: 'confirmed',
    location: link,
    referenceLinks: [],
    itineraryItemId: null,
  };
}

type PlaceStore = { places: readonly Place[]; createPlace: (input: PlaceInput) => string };

/**
 * The 場所 field of a booking form: the name of one of the trip's places links
 * it (and keeps its map link); a Google Maps link links the place it points at
 * or creates one; anything else is an address and links by venue name.
 */
export function linkBookingPlace<T extends BookingVenue>(travel: PlaceStore, input: T): T & { placeId: string | null; location: string } {
  const text = (input.location ?? '').trim();
  if (input.kind === 'hotel') return { ...input, location: text, placeId: null };
  const picked = text ? travel.places.find((place) => sameName(place.title, text)) : undefined;
  if (picked) return { ...input, location: registeredGoogleMapsUrl(picked.location) ?? '', placeId: picked.id };
  const link = registeredGoogleMapsUrl(text);
  const matched = matchBookingPlace({ ...input, location: text }, travel.places);
  if (matched) return { ...input, location: text, placeId: matched.id };
  if (link) return { ...input, location: text, placeId: travel.createPlace(newBookingPlace(input, link)) };
  return { ...input, location: text, placeId: null };
}
