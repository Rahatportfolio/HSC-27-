import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('IndexedDB recovery', () => {
  it('retries after a temporary security error instead of permanently disabling scanner storage', async () => {
    const factory = new IDBFactory();
    let denied = true;
    const indexedDB = { open: (...args: Parameters<IDBFactory['open']>) => {
      if (denied) throw new DOMException('blocked', 'SecurityError');
      return factory.open(...args);
    } };
    vi.stubGlobal('indexedDB', indexedDB);
    const { idbSet, idbGet } = await import('./storage-manager');
    expect(await idbSet('scan:page', 'image')).toBeNull();
    denied = false;
    expect(await idbSet('scan:page', 'image')).not.toBeNull();
    expect(await idbGet('scan:page')).toBe('image');
  });

  it('reports an unavailable cache rather than claiming it is clean', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('blocked', 'SecurityError'); } });
    const { clearTempCache } = await import('./storage-manager');
    expect(await clearTempCache()).toBeNull();
  });

  it('does not report unsuccessful deletion as cleared', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    const store = await import('./storage-manager');
    await store.idbSet('temporary', 'value', 'temp');
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 86400000);
    // The stored record exists, but a denied delete must not count as success.
    const request = factory.open('prostuti-hsc27', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    // Both connections use the same prototype.
    const proto = Object.getPrototypeOf(db) as IDBDatabase;
    const original = proto.transaction;
    vi.spyOn(proto, 'transaction').mockImplementation(function(this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      if (args[1] === 'readwrite') throw new DOMException('blocked', 'SecurityError');
      return original.apply(this, args);
    });
    try { expect(await store.clearTempCache()).toBeNull(); }
    finally { vi.restoreAllMocks(); vi.useRealTimers(); db.close(); }
  });
});

it('removes all scanner images, including orphaned pages, while preserving other cached data', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const store = await import('./storage-manager');
  await store.idbSet('scan:orphan', 'image', 'image');
  await store.idbSet('scan:page', 'image', 'image');
  await store.idbSet('other', 'keep');
  expect(await store.clearScanImages()).toBe(true);
  expect(await store.idbGet('scan:orphan')).toBeUndefined();
  expect(await store.idbGet('scan:page')).toBeUndefined();
  expect(await store.idbGet('other')).toBe('keep');
});

it('reports when scanner image cleanup cannot be performed', async () => {
  vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('blocked', 'SecurityError'); } });
  const store = await import('./storage-manager');
  expect(await store.clearScanImages()).toBe(false);
});
