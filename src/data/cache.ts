import { File, Paths } from 'expo-file-system';

import { emptyTravelCache, TravelCache } from './types';

const cacheFile = new File(Paths.document, 'tabi-travel-cache.json');

export async function loadTravelCache(): Promise<TravelCache> {
  if (!cacheFile.exists) return emptyTravelCache();
  try {
    const value = JSON.parse(await cacheFile.text()) as TravelCache;
    return value.version === 1 ? value : emptyTravelCache();
  } catch {
    return emptyTravelCache();
  }
}

export async function saveTravelCache(value: TravelCache) {
  if (!cacheFile.exists) cacheFile.create({ intermediates: true, overwrite: true });
  cacheFile.write(JSON.stringify(value));
}
