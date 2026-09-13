function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tabi-sample-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('このブラウザでは書類を保存できません'));
  });
}

export async function saveDemoDocument(id: string, bytes: ArrayBuffer) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(bytes, id);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error('書類を保存できませんでした。空き容量を確認してください'));
    });
  } finally { db.close(); }
}

export async function loadDemoDocument(id: string): Promise<ArrayBuffer> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get(id);
      request.onsuccess = () => request.result instanceof ArrayBuffer ? resolve(request.result) : reject(new Error('書類が見つかりません。もう一度追加してください'));
      request.onerror = () => reject(new Error('書類を読み込めませんでした'));
    });
  } finally { db.close(); }
}
