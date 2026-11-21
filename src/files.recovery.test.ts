import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('offline file storage recovery', () => {
  it('retries after a temporary IndexedDB failure', async () => {
    const factory = new IDBFactory();
    let blocked = true;
    vi.stubGlobal('indexedDB', { open: (...args: Parameters<IDBFactory['open']>) => {
      if (blocked) throw new DOMException('blocked', 'SecurityError');
      return factory.open(...args);
    } });
    const { filesAvailable, putFile, getFile } = await import('./files');
    expect(await filesAvailable()).toBe(false);
    blocked = false;
    expect(await filesAvailable()).toBe(true);
    expect(await putFile({ id: 'pdf', name: 'pdf', blob: new Blob(['file']), size: 4, createdAt: new Date().toISOString() })).toBe(true);
    expect((await getFile('pdf'))?.size).toBe(4);
  });
  it('does not claim reset erased local media if IndexedDB cannot be opened', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('blocked', 'SecurityError'); } });
    const { clearFiles } = await import('./files');
    await expect(clearFiles()).rejects.toThrow();
  });
});
