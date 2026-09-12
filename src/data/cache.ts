import { File, Paths } from 'expo-file-system';

import { emptyTravelCache, normalizeTravelCache, TravelCache } from './types';

const fileFor = (scope?: string) => new File(Paths.document, scope ? `tabi-travel-cache-${scope}.json` : 'tabi-travel-cache.json');

export async function loadTravelCache(scope?: string): Promise<TravelCache> {
  const cacheFile = fileFor(scope);
  if (!cacheFile.exists) return emptyTravelCache();
  try {
    const value = JSON.parse(await cacheFile.text()) as TravelCache;
    return value.version === 1 ? normalizeTravelCache(value) : emptyTravelCache();
  } catch {
    return emptyTravelCache();
  }
}

export async function saveTravelCache(value: TravelCache, scope?: string) {
  const cacheFile = fileFor(scope);
  if (!cacheFile.exists) cacheFile.create({ intermediates: true, overwrite: true });
  cacheFile.write(JSON.stringify(value));
}
