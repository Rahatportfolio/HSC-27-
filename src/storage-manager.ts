/**
 * Secondary on-device store for large or temporary structured content:
 * offline cached data, search indexes, temporary processing data.
 *
 * IndexedDB is used only when available (Android WebView / modern browsers).
 * When unavailable — e.g. in restricted WebViews or tests — every method
 * degrades gracefully so the app keeps working on localStorage + SQLite.
 */

const DB_NAME = 'prostuti-hsc27';
const STORE_NAME = 'cache';
const VERSION = 1;

type Stored = {
  key: string;
  value: unknown;
  sizeBytes: number;
  type: string;
  createdAt: string;
  expiresAt?: string;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function indexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

async function openDb(): Promise<IDBDatabase | null> {
  if (!indexedDBAvailable()) return null;
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>(resolve => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
      request.onupgradeneeded = event => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => T): Promise<T | null> {
  const database = await openDb();
  if (!database) return null;
  return new Promise<T | null>(resolve => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    try {
      const result = work(store);
      transaction.oncomplete = () => resolve(result as T);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Read one cached entry by key. */
export async function idbGet(key: string): Promise<unknown> {
  const row = await withStore('readonly', store => {
    const request = store.get(key);
    return { request };
  });
  const value = row?.request.result as Stored | undefined;
  if (!value) return undefined;
  if (value.expiresAt && new Date(value.expiresAt) < new Date()) {
    void idbDelete(key);
    return undefined;
  }
  return value.value;
}

/** Write one cached entry. Returns stored size in bytes, or null when unavailable. */
export async function idbSet(key: string, value: unknown, type = 'json', ttlDays?: number): Promise<number | null> {
  const serialized = JSON.stringify(value);
  const sizeBytes = new TextEncoder().encode(serialized).byteLength;
  const row: Stored = { key, value, sizeBytes, type, createdAt: new Date().toISOString(), ...(ttlDays ? { expiresAt: new Date(Date.now() + ttlDays * 86400000).toISOString() } : {}) };
  const ok = await withStore('readwrite', store => {
    store.put(row);
    return true;
  });
  return ok ? sizeBytes : null;
}

/** Delete one cached entry. */
export async function idbDelete(key: string): Promise<boolean> {
  return Boolean(await withStore('readwrite', store => { store.delete(key); return true; }));
}

/** List every key currently stored. */
export async function idbKeys(): Promise<string[]> {
  const rows = await withStore('readonly', store => {
    const request = store.getAll();
    return { request };
  });
  const value = rows?.request.result as Stored[] | undefined;
  return value ? value.map(row => row.key) : [];
}

/** Total bytes occupied by this IndexedDB store. */
export async function idbSizeBytes(): Promise<number> {
  const rows = await withStore('readonly', store => {
    const request = store.getAll();
    return { request };
  });
  const value = rows?.request.result as Stored[] | undefined;
  return value ? value.reduce((sum, row) => sum + row.sizeBytes, 0) : 0;
}

/** Remove expired and temporary entries. */
export async function clearTempCache(olderThanDays = 7): Promise<number> {
  const keys = await idbKeys();
  const cutoff = new Date(Date.now() - olderThanDays * 86400000);
  let removed = 0;
  for (const key of keys) {
    const row = (await withStore('readonly', store => ({ request: store.get(key) })))?.request.result as Stored | undefined;
    const expired = row?.expiresAt && new Date(row.expiresAt) < new Date();
    const stale = row && row.type === 'temp' && new Date(row.createdAt) < cutoff;
    if (expired || stale) { await idbDelete(key); removed += 1; }
  }
  return removed;
}

/** Quota estimate for the origin (IndexedDB + CacheStorage + localStorage roughly). */
export async function storageEstimate(): Promise<{ quota: number; usage: number; usagePercent: number } | null> {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  return { quota, usage, usagePercent: quota ? Math.round((usage / quota) * 100) : 0 };
}

/** Approximate localStorage byte size for this origin. */
export function localStorageSizeBytes(): number {
  if (typeof localStorage === 'undefined') return 0;
  let size = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      size += key.length + localStorage.getItem(key)!.length;
    }
  }
  return size;
}

/** Full on-device usage breakdown. */
export async function getStorageUsage(): Promise<{
  localStorageBytes: number;
  indexedDBBytes: number;
  indexedDBAvailable: boolean;
  totalBytes: number;
  estimate: { quota: number; usage: number; usagePercent: number } | null;
}> {
  const [indexedDBBytes, estimate] = await Promise.all([idbSizeBytes(), storageEstimate()]);
  const localStorageBytes = localStorageSizeBytes();
  return {
    localStorageBytes,
    indexedDBBytes,
    indexedDBAvailable: indexedDBAvailable(),
    totalBytes: localStorageBytes + indexedDBBytes,
    estimate,
  };
}

/**
 * Duplicate detection: compare media/resource URLs already recorded in the app
 * (videos + PDFs). Same sourceUrl appearing twice = duplicate candidate.
 */
export interface DuplicateCandidate {
  kind: 'video' | 'pdf';
  id: string;
  title: string;
  url: string;
  subject?: string;
}

export async function findDuplicates(
  videos: { id: string; title: string; url?: string; subject?: string }[],
  pdfs: { id: string; title: string; url?: string; subject?: string }[],
): Promise<DuplicateCandidate[]> {
  const byUrl = new Map<string, DuplicateCandidate[]>();
  const register = (kind: DuplicateCandidate['kind'], item: { id: string; title: string; url?: string; subject?: string }) => {
    if (!item.url) return;
    const list = byUrl.get(item.url) || [];
    list.push({ kind, id: item.id, title: item.title, url: item.url, subject: item.subject });
    byUrl.set(item.url, list);
  };
  for (const video of videos) register('video', video);
  for (const pdf of pdfs) register('pdf', pdf);
  const duplicates: DuplicateCandidate[] = [];
  for (const list of byUrl.values()) {
    if (list.length > 1) duplicates.push(...list);
  }
  return duplicates.sort((a, b) => a.url.localeCompare(b.url));
}

/** Can we store `bytes` more on this device right now? Best-effort. */
export async function canStore(bytes: number): Promise<boolean> {
  const estimate = await storageEstimate();
  if (!estimate) return true;
  return estimate.usage + bytes <= estimate.quota;
}
