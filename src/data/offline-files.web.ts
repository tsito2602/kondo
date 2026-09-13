import { readStored, writeStored } from './browser-store';
export const readOfflineFile = (scope: string, id: string) => readStored<ArrayBuffer>(`document:${scope}:${id}`);
export const saveOfflineFile = (scope: string, id: string, bytes: ArrayBuffer) => writeStored(`document:${scope}:${id}`, bytes);
