import type { PlaceStatus, ReservationStatus } from './types';
export const placeStatuses: { value: PlaceStatus; label: string }[] = [
  { value: 'want', label: '行きたい' }, { value: 'planned', label: '行く予定' },
  { value: 'visited', label: '行った' }, { value: 'skipped', label: '見送り' },
];
export const reservationStatuses: { value: ReservationStatus; label: string }[] = [
  { value: 'not_needed', label: '予約不要' }, { value: 'needed', label: '要予約' },
  { value: 'requested', label: '予約待ち' }, { value: 'confirmed', label: '予約済み' },
  { value: 'unavailable', label: '予約不可' },
];
export function referenceUrl(value: string): string | null {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function mapUrl(location: string, title = ''): string | null {
  const text = location.trim();
  if (/^https?:\/\//i.test(text)) {
    try { return new URL(text).href; } catch { return null; }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return null;
  const query = text || title.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/** Only a saved Google Maps link enables the card's direct map action. */
export function registeredGoogleMapsUrl(location: string): string | null {
  const href = referenceUrl(location);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  const googleDomain = 'google\\.(?:com|[a-z]{2}|com\\.[a-z]{2}|co\\.[a-z]{2})';
  const isMaps = host === 'maps.app.goo.gl' ||
    (host === 'goo.gl' && /^\/maps(?:\/|$)/.test(url.pathname)) ||
    new RegExp(`^maps\\.${googleDomain}$`).test(host) ||
    (new RegExp(`^(?:www\\.)?${googleDomain}$`).test(host) && /^\/maps(?:\/|$)/.test(url.pathname));
  return isMaps ? href : null;
}

export type Coordinates = { lat: number; lng: number };
const coordinate = (lat: string, lng: string): Coordinates | null => {
  const point = { lat: Number(lat), lng: Number(lng) };
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && (point.lat || point.lng) ? point : null;
};

/**
 * Reads coordinates from a pasted Google Maps link. The place's own pin
 * (`!3d…!4d…`) wins over the camera (`@lat,lng`); `q`/`query`/`ll` cover
 * search and share links. Short links (maps.app.goo.gl) carry none; the
 * Worker follows their redirect once (see `isShortMapsLink`).
 */
export function mapCoordinates(location: string | null | undefined): Coordinates | null {
  const href = registeredGoogleMapsUrl(location ?? '');
  if (!href) return null;
  let text = href;
  try { text = decodeURIComponent(href); } catch { /* keep the raw link */ }
  const number = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const pins = [...text.matchAll(new RegExp(`!3d${number}!4d${number}`, 'g'))];
  const pin = pins.at(-1);
  if (pin) return coordinate(pin[1], pin[2]);
  const url = new URL(href);
  for (const key of ['q', 'query', 'll', 'destination', 'center']) {
    const match = url.searchParams.get(key)?.trim().match(new RegExp(`^(?:loc:)?${number}\\s*,\\s*${number}$`));
    if (match) return coordinate(match[1], match[2]);
  }
  const camera = text.match(new RegExp(`@${number},${number}`));
  return camera ? coordinate(camera[1], camera[2]) : null;
}

/** Share links that hide their coordinates behind one redirect. */
export function isShortMapsLink(location: string): boolean {
  const href = registeredGoogleMapsUrl(location);
  if (!href) return false;
  const url = new URL(href);
  return url.hostname.toLowerCase() === 'maps.app.goo.gl' || url.hostname.toLowerCase() === 'goo.gl';
}

/** Stored coordinates first; a long link still places a pin offline before sync. */
export function placeCoordinates(place: { lat?: number | null; lng?: number | null; location?: string }): Coordinates | null {
  return place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : mapCoordinates(place.location);
}
