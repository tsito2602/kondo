import { registeredGoogleMapsUrl } from './places';

export type LatLng = { lat: number; lng: number };

const valid = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;
const pair = (text: string | null) => {
  const match = text?.trim().match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  return match ? valid(Number(match[1]), Number(match[2])) : null;
};
const decode = (text: string) => {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
};

/**
 * Coordinates written into a Google Maps link. The place's own pin (`!3d…!4d…`)
 * wins over the camera position (`@lat,lng`). Short links (maps.app.goo.gl) carry
 * none; resolving them needs the Worker to follow the redirect.
 */
export function coordsFromLink(text?: string | null): LatLng | null {
  const href = text && registeredGoogleMapsUrl(text);
  if (!href) return null;
  const url = new URL(href);
  const path = decode(url.pathname);
  const pin = path.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ?? href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) return valid(Number(pin[1]), Number(pin[2]));
  for (const key of ['query', 'q', 'll', 'center', 'destination']) {
    const found = pair(url.searchParams.get(key));
    if (found) return found;
  }
  const camera = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return camera ? valid(Number(camera[1]), Number(camera[2])) : null;
}

/** The place name a full Google Maps link spells out (`/place/<name>/` or a text query). */
export function placeNameFromLink(text?: string | null): string | null {
  const href = text && registeredGoogleMapsUrl(text);
  if (!href) return null;
  const url = new URL(href);
  const place = url.pathname.match(/\/place\/([^/@]+)/);
  if (place) return decode(place[1]).trim() || null;
  for (const key of ['query', 'q']) {
    const value = url.searchParams.get(key)?.trim();
    if (value && !pair(value)) return value;
  }
  return null;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** The map's estimate: straight line × 1.3 at 80 m/min. */
export const WALK_LIMIT_METERS = 1600;
export const walkMinutes = (meters: number) => Math.max(1, Math.round((meters * 1.3) / 80));
export const distanceLabel = (meters: number) => (meters < 1000 ? `${Math.round(meters / 10) * 10}m` : `${(meters / 1000).toFixed(1)}km`);
