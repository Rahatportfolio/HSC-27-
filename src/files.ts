import { hasNativeFiles, NativeFiles, nativeFileUrl } from "./nativeFiles";
/**
 * Device-local file store for permitted PDFs the student downloads or imports.
 * Uses IndexedDB directly (no dependency), with graceful degradation: when IndexedDB
 * is unavailable (private mode, old WebView, unit tests) the app stays usable with
 * URL-only PDFs and reports that offline file storage is unavailable.
 */

const DB_NAME = "prostuti-files";
const STORE = "blobs";
const DB_VERSION = 1;
const activeDownloads = new Set<string>();
const downloadControllers = new Map<string, AbortController>();
let storageEpoch = 0;

export interface StoredFile {
  id: string;
  blob: Blob;
  name: string;
  size: number;
  createdAt: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    let attempt: Promise<IDBDatabase | null>;
    attempt = new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      try { request = indexedDB.open(DB_NAME, DB_VERSION); }
      catch { resolve(null); return; }
      let settled = false;
      const unavailable = () => { settled = true; resolve(null); };
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onerror = unavailable;
      request.onblocked = unavailable;
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        db.onversionchange = () => { db.close(); if (dbPromise === attempt) dbPromise = null; };
        resolve(db);
      };
    });
    dbPromise = attempt;
  }
  const attempt = dbPromise;
  const db = await attempt;
  if (!db && dbPromise === attempt) dbPromise = null;
  return db;
}

export async function filesAvailable(): Promise<boolean> {
  if (hasNativeFiles()) {
    try {
      await NativeFiles.estimate();
      return true;
    } catch {
      return false;
    }
  }
  return (await openDb()) !== null;
}

interface TxResult<T> {
  ok: boolean;
  value?: T;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<TxResult<T>> {
  return openDb().then(
    (db) =>
      new Promise<TxResult<T>>((resolve) => {
        if (!db) {
          resolve({ ok: false });
          return;
        }
        try {
          const transaction = db.transaction(STORE, mode);
          const request = run(transaction.objectStore(STORE));
          transaction.oncomplete = () =>
            resolve({ ok: true, value: request.result });
          transaction.onerror = () => resolve({ ok: false });
          request.onerror = () => resolve({ ok: false });
          transaction.onabort = () => resolve({ ok: false });
        } catch {
          db.close();
          dbPromise = null;
          resolve({ ok: false });
        }
      }),
  );
}

export async function putFile(file: StoredFile): Promise<boolean> {
  const epoch = storageEpoch;
  if (hasNativeFiles()) {
    let begun = false;
    try {
      await NativeFiles.begin({
        id: file.id,
        name: file.name,
        type: file.blob.type,
        createdAt: file.createdAt,
      });
      begun = true;
      for (let offset = 0; offset < file.blob.size; offset += 256 * 1024) {
        const bytes = new Uint8Array(
          await file.blob.slice(offset, offset + 256 * 1024).arrayBuffer(),
        );
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        if (epoch !== storageEpoch) throw new Error("Storage reset");
        await NativeFiles.append({ id: file.id, data: btoa(binary) });
      }
      if (epoch !== storageEpoch) throw new Error("Storage reset");
      await NativeFiles.commit({ id: file.id });
      if (epoch !== storageEpoch) {
        await deleteFile(file.id);
        return false;
      }
      return true;
    } catch {
      if (begun) await NativeFiles.abort({ id: file.id }).catch(() => {});
      return false;
    }
  }
  const result = await tx<IDBValidKey>("readwrite", (store) => store.put(file));
  if (epoch !== storageEpoch) {
    await deleteFile(file.id);
    return false;
  }
  return result.ok;
}

export async function getFile(id: string): Promise<StoredFile | null> {
  if (hasNativeFiles()) {
    try {
      const f = await NativeFiles.info({ id });
      const response = await fetch(nativeFileUrl(f.uri));
      if (!response.ok) return null;
      return {
        ...f,
        blob: new Blob([await response.blob()], {
          type: f.type || "application/octet-stream",
        }),
      };
    } catch {
      /* legacy IndexedDB files remain readable below */
    }
  }
  const result = await tx<StoredFile>("readonly", (store) => store.get(id));
  return result.ok ? (result.value ?? null) : null;
}

export async function deleteFile(id: string): Promise<boolean> {
  if (hasNativeFiles())
    try {
      await NativeFiles.remove({ id });
      await tx<undefined>("readwrite", (store) => store.delete(id));
      return true;
    } catch {
      return false;
    }
  return (await tx<undefined>("readwrite", (store) => store.delete(id))).ok;
}

export async function allFileIds(): Promise<string[]> {
  let native: string[] = [];
  if (hasNativeFiles())
    native = (await NativeFiles.list()).files.map((f) => f.id);
  const result = await tx<IDBValidKey[]>("readonly", (store) =>
    store.getAllKeys(),
  );
  return [
    ...new Set([
      ...native,
      ...(result.ok && Array.isArray(result.value)
        ? result.value.map(String)
        : []),
    ]),
  ];
}

/** Browser storage quota/usage when the API is available (used by the storage card). */
export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  try {
    if (hasNativeFiles()) return await NativeFiles.estimate();
    if (typeof navigator === "undefined" || !navigator.storage?.estimate)
      return null;
    const estimate = await navigator.storage.estimate();
    if (estimate.usage === undefined || estimate.quota === undefined)
      return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}

/** Fetch a permitted remote PDF into the device store with byte-level progress. */
export async function downloadToFile(
  url: string,
  id: string,
  name: string,
  onProgress?: (loaded: number, total: number) => void,
  kind: "pdf" | "video" = "pdf",
): Promise<{ ok: boolean; size?: number; error?: string }> {
  if (activeDownloads.has(id))
    return { ok: false, error: "This file is already downloading" };
  activeDownloads.add(id);
  const epoch = storageEpoch;
  const controller = new AbortController();
  downloadControllers.set(id, controller);
  const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000);
  try {
    if (hasNativeFiles()) {
      const listener = await NativeFiles.addListener(
        "downloadProgress",
        (e) => {
          if (e.id === id) onProgress?.(e.loaded, e.total);
        },
      );
      try {
        const result = await NativeFiles.download({ id, url, name, kind });
        if (epoch !== storageEpoch) {
          await deleteFile(id);
          return { ok: false, error: "Download cancelled by storage reset" };
        }
        return { ok: true, size: result.size };
      } finally {
        await listener.remove();
      }
    }
    const quota = await storageEstimate();
    const maxBytes = Math.min(
      kind === "video" ? 1_000_000_000 : 100 * 1024 * 1024,
      quota
        ? Math.max(0, quota.quota - quota.usage - 5 * 1024 * 1024)
        : Infinity,
    );
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const total = Number(response.headers.get("content-length")) || 0;
    if (total > maxBytes) {
      await response.body?.cancel();
      return {
        ok: false,
        error: "Storage limit: not enough free space / file too large",
      };
    }
    const mime = response.headers.get("content-type")?.split(";")[0] || "";
    if (
      kind === "video" &&
      !mime.startsWith("video/") &&
      mime !== "application/octet-stream"
    ) {
      await response.body?.cancel();
      return { ok: false, error: "Not a downloadable video file" };
    }
    let blob: Blob;
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          loaded += value.length;
          if (loaded > maxBytes) {
            await reader.cancel();
            return { ok: false, error: "Storage limit exceeded" };
          }
          chunks.push(value);
          onProgress?.(loaded, total);
        }
      }
      blob = new Blob(chunks as BlobPart[], {
        type: kind === "pdf" ? "application/pdf" : mime || "video/mp4",
      });
    } else {
      blob = await response.blob();
    }
    if (blob.size > maxBytes)
      return { ok: false, error: "Storage limit exceeded" };
    if (kind === "pdf" && !(await blob.slice(0, 5).text()).startsWith("%PDF-"))
      return { ok: false, error: "URL did not return a PDF file" };
    if (epoch !== storageEpoch)
      return { ok: false, error: "Download cancelled by storage reset" };
    const stored = await putFile({
      id,
      blob,
      name,
      size: blob.size,
      createdAt: new Date().toISOString(),
    });
    if (!stored) return { ok: false, error: "storage" };
    return { ok: true, size: blob.size };
  } catch (error) {
    return { ok: false, error: (error as Error)?.message || "network" };
  } finally {
    clearTimeout(timeout);
    downloadControllers.delete(id);
    activeDownloads.delete(id);
  }
}

/** Clears the device file store (used by Settings → reset). Returns files removed. */
export async function clearFiles(): Promise<number> {
  storageEpoch++;
  for (const controller of downloadControllers.values()) controller.abort();
  let removed = 0;
  if (hasNativeFiles()) removed = (await NativeFiles.clear()).removed;
  const db = await openDb();
  if (!db && (typeof indexedDB !== "undefined" || !hasNativeFiles()))
    throw new Error("Could not open local media storage for cleanup");
  if (db) {
    const ids = await tx<IDBValidKey[]>("readonly", (store) =>
      store.getAllKeys(),
    );
    const result = await tx<undefined>("readwrite", (store) => store.clear());
    if (!result.ok) throw new Error("Could not clear local media storage");
    removed += ids.value?.length || 0;
  }
  return removed;
}

/** A native video URL is served by Capacitor without copying its bytes into JS memory. */
export async function playableFile(
  id: string,
): Promise<{ url: string; revoke: () => void } | null> {
  if (hasNativeFiles())
    try {
      const f = await NativeFiles.info({ id });
      return { url: nativeFileUrl(f.uri), revoke: () => {} };
    } catch {
      /* old IndexedDB fallback */
    }
  const f = await getFile(id);
  if (!f) return null;
  const url = URL.createObjectURL(f.blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
