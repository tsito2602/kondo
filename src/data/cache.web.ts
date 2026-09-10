import { emptyTravelCache, normalizeTravelCache, TravelCache } from './types';

const CACHE_KEY = 'tabi.travel-cache.v1';

export async function loadTravelCache(): Promise<TravelCache> {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return emptyTravelCache();
    const value = JSON.parse(raw) as TravelCache;
    return value.version === 1 ? normalizeTravelCache(value) : emptyTravelCache();
  } catch {
    return emptyTravelCache();
  }
}

export async function saveTravelCache(value: TravelCache) {
  globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(value));
}
