import { readStored, writeStored } from './browser-store';
import { emptyTravelCache, normalizeTravelCache, TravelCache } from './types';

const CACHE_KEY = 'tabi.travel-cache.v1';
export async function loadTravelCache(scope?: string): Promise<TravelCache> {
  const key = scope ? `${CACHE_KEY}.${scope}` : CACHE_KEY;
  const saved = await readStored<TravelCache>(key);
  if (saved?.version === 1) return normalizeTravelCache(saved);
  // Only migrate the old shared cache for the session that already owned it.
  const legacyKey = scope && localStorage.getItem('tabi.legacy-cache-owner') === scope ? CACHE_KEY : key;
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return emptyTravelCache();
  try {
    const value = JSON.parse(raw) as TravelCache;
    if (value.version !== 1) return emptyTravelCache();
    const normalized = normalizeTravelCache(value);
    await writeStored(key, normalized);
    localStorage.removeItem(legacyKey);
    return normalized;
  } catch { return emptyTravelCache(); }
}
export async function saveTravelCache(value: TravelCache, scope?: string) {
  await writeStored(scope ? `${CACHE_KEY}.${scope}` : CACHE_KEY, value);
}
