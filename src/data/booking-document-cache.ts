import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

function safeFilename(value: string) {
  const result = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  return result || 'document';
}

function cachedFile(id: string, filename: string) {
  return new File(new Directory(Paths.document, 'booking-documents'), `${id}-${safeFilename(filename)}`);
}

export function getCachedDocumentUri(id: string, filename: string) {
  if (Platform.OS === 'web') return null;
  const file = cachedFile(id, filename);
  return file.exists ? file.uri : null;
}

export function cacheBookingDocument(id: string, filename: string, bytes: ArrayBuffer) {
  if (Platform.OS === 'web') return null;
  const documentDirectory = new Directory(Paths.document, 'booking-documents');
  if (!documentDirectory.exists) documentDirectory.create({ intermediates: true, idempotent: true });
  const file = cachedFile(id, filename);
  if (!file.exists) file.create({ intermediates: true, overwrite: true });
  file.write(new Uint8Array(bytes));
  return file.uri;
}

export function removeCachedBookingDocument(id: string, filename: string) {
  if (Platform.OS === 'web') return;
  const file = cachedFile(id, filename);
  if (file.exists) file.delete();
}
