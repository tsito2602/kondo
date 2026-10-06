import type { Coordinates } from './places';

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS = 6371008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Walking estimate: straight line × 1.3 for detours, at 4.8 km/h (80 m/min). */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round((meters * 1.3) / 80));
}

export function formatMeters(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10}m` : `${(meters / 1000).toFixed(1)}km`;
}

/** Web Mercator in radians; y grows northwards. */
export function mercator(point: Coordinates): { x: number; y: number } {
  return { x: rad(point.lng), y: Math.log(Math.tan(Math.PI / 4 + rad(point.lat) / 2)) };
}

/** Metres per Mercator unit at a latitude. */
export function metersPerUnit(lat: number): number {
  return EARTH_RADIUS * Math.cos(rad(lat));
}
