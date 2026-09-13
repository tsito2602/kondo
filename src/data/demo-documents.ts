import { Directory, File, Paths } from 'expo-file-system';

function file(id: string) { return new File(new Directory(Paths.document, 'sample-documents'), id); }

export async function saveDemoDocument(id: string, bytes: ArrayBuffer) {
  const directory = new Directory(Paths.document, 'sample-documents');
  directory.create({ intermediates: true, idempotent: true });
  const document = file(id);
  document.create({ overwrite: true });
  document.write(new Uint8Array(bytes));
}

export async function loadDemoDocument(id: string) {
  const document = file(id);
  if (!document.exists) throw new Error('書類が見つかりません。もう一度追加してください');
  return document.arrayBuffer();
}
