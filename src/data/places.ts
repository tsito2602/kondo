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
