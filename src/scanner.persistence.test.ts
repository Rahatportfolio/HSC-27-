import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const pages = vi.hoisted(() => new Map<string, unknown>());
const failure = vi.hoisted(() => ({ writes: Infinity }));
vi.mock('./storage-manager', () => ({
  idbGet: vi.fn(async (key: string) => pages.get(key)),
  idbSet: vi.fn(async (key: string, value: unknown) => {
    if (--failure.writes < 0) return null;
    pages.set(key, value);
    return new TextEncoder().encode(String(value)).length;
  }),
  idbDelete: vi.fn(async (key: string) => pages.delete(key)),
  idbKeys: vi.fn(async () => [...pages.keys()]),
}));
import { loadPagesFromDb, savePagesToDb, scannedNotesSizeBytes } from './scanner';
const image = 'data:image/png;base64,aGVsbG8=';
beforeEach(() => { pages.clear(); failure.writes = Infinity; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('scanner page persistence is complete or fails visibly', () => {
  it.each([undefined, {}])('still saves exact scan pages when randomUUID is unavailable (%s)', async cryptoValue => {
    vi.stubGlobal('crypto', cryptoValue);
    const keys = await savePagesToDb(Array.from({ length: 3 }, () => ({ dataUrl: image, width: 1, height: 1 })));
    expect(keys).toHaveLength(3); expect(new Set(keys).size).toBe(3);
    expect(await loadPagesFromDb(keys)).toEqual([image, image, image]);
    expect(keys.every(key => key.startsWith('scan:'))).toBe(true);
  });
  it('does not claim a scan was saved when image storage is unavailable', async () => {
    failure.writes = 0;
    await expect(savePagesToDb([{ dataUrl: image, width: 1, height: 1 }])).rejects.toThrow(/stor|save|পৃষ্ঠা/i);
    expect(pages.size).toBe(0);
  });
  it('cleans earlier pages if a later image write fails', async () => {
    pages.set('scan:existing', image);
    failure.writes = 1;
    await expect(savePagesToDb(Array.from({ length: 2 }, () => ({ dataUrl: image, width: 1, height: 1 })))).rejects.toThrow();
    expect([...pages.keys()]).toEqual(['scan:existing']);
  });
  it('refuses a partial PDF source instead of silently dropping a missing page', async () => {
    pages.set('scan:first', image);
    expect(await loadPagesFromDb(['scan:first', 'scan:missing'])).toEqual([]);
    expect(await loadPagesFromDb(['scan:first'])).toEqual([image]);
    pages.set('scan:invalid', 'unrelated cache string');
    expect(await loadPagesFromDb(['scan:invalid'])).toEqual([]);
  });
  it('counts the stored image strings rather than reading a nonexistent size field', async () => {
    pages.set('scan:first', image);
    pages.set('unrelated', 'not a scan');
    expect(await scannedNotesSizeBytes()).toBe(new TextEncoder().encode(image).length);
  });
});
