/**
 * Device-local file store for permitted PDFs the student downloads or imports.
 * Uses IndexedDB directly (no dependency), with graceful degradation: when IndexedDB
 * is unavailable (private mode, old WebView, unit tests) the app stays usable with
 * URL-only PDFs and reports that offline file storage is unavailable.
 */

const DB_NAME = 'prostuti-files';
const STORE = 'blobs';
const DB_VERSION = 1;

export interface StoredFile { id: string; blob: Blob; name: string; size: number; createdAt: string }

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

export async function filesAvailable(): Promise<boolean> {
  return (await openDb()) !== null;
}

interface TxResult<T> { ok: boolean; value?: T }

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<TxResult<T>> {
  return openDb().then(db => new Promise<TxResult<T>>(resolve => {
    if (!db) { resolve({ ok: false }); return; }
    try {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve({ ok: true, value: request.result });
      request.onerror = () => resolve({ ok: false });
      transaction.onabort = () => resolve({ ok: false });
    } catch { resolve({ ok: false }); }
  }));
}

export async function putFile(file: StoredFile): Promise<boolean> {
  return (await tx<IDBValidKey>('readwrite', store => store.put(file))).ok;
}

export async function getFile(id: string): Promise<StoredFile | null> {
  const result = await tx<StoredFile>('readonly', store => store.get(id));
  return result.ok ? result.value ?? null : null;
}

export async function deleteFile(id: string): Promise<boolean> {
  return (await tx<undefined>('readwrite', store => store.delete(id))).ok;
}

export async function allFileIds(): Promise<string[]> {
  const result = await tx<IDBValidKey[]>('readonly', store => store.getAllKeys());
  return result.ok && Array.isArray(result.value) ? result.value.map(String) : [];
}

/** Browser storage quota/usage when the API is available (used by the storage card). */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    if (estimate.usage === undefined || estimate.quota === undefined) return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch { return null; }
}

/** Fetch a permitted remote PDF into the device store with byte-level progress. */
export async function downloadToFile(
  url: string,
  id: string,
  name: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: boolean; size?: number; error?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const total = Number(response.headers.get('content-length')) || 0;
    let blob: Blob;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          onProgress?.(loaded, total || loaded);
        }
      }
      blob = new Blob(chunks as BlobPart[], { type: 'application/pdf' });
    } else {
      blob = await response.blob();
    }
    const stored = await putFile({ id, blob, name, size: blob.size, createdAt: new Date().toISOString() });
    if (!stored) return { ok: false, error: 'storage' };
    return { ok: true, size: blob.size };
  } catch (error) {
    return { ok: false, error: (error as Error)?.message || 'network' };
  }
}

/** Clears the device file store (used by Settings → reset). Returns files removed. */
export async function clearFiles(): Promise<number> {
  const ids = await allFileIds();
  for (const id of ids) await deleteFile(id);
  return ids.length;
}
