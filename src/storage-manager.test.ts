import { describe, expect, it } from 'vitest';
import { localStorageSizeBytes, findDuplicates, canStore, clearTempCache } from './storage-manager';

describe('storage manager', () => {
  it('measures localStorage size', () => {
    if (typeof localStorage === 'undefined') {
      expect(localStorageSizeBytes()).toBe(0);
      return;
    }
    const before = localStorageSizeBytes();
    localStorage.setItem('prostuti-test-measure', 'x'.repeat(1000));
    expect(localStorageSizeBytes()).toBeGreaterThanOrEqual(before + 1000);
    localStorage.removeItem('prostuti-test-measure');
  });

  it('finds duplicate URLs across videos and PDFs', async () => {
    const dupes = await findDuplicates(
      [
        { id: 'v1', title: 'এক', url: 'https://youtube.com/watch?v=aaa', subject: 'physics' },
        { id: 'v2', title: 'দুই', url: 'https://youtube.com/watch?v=aaa', subject: 'physics' },
        { id: 'v3', title: 'তিন', url: 'https://youtube.com/watch?v=bbb', subject: 'chemistry' },
      ],
      [{ id: 'p1', title: 'পিডিএফ', url: 'https://youtube.com/watch?v=bbb', subject: 'chemistry' }],
    );
    expect(dupes.map(d => d.id).sort()).toEqual(['p1', 'v1', 'v2', 'v3']);
    const byUrl = new Map<string, number>();
    for (const d of dupes) byUrl.set(d.url, (byUrl.get(d.url) || 0) + 1);
    expect([...byUrl.values()].every(count => count > 1)).toBe(true);
  });

  it('returns no duplicates when all URLs are unique', async () => {
    const dupes = await findDuplicates(
      [{ id: 'v1', title: 'এক', url: 'https://youtube.com/watch?v=aaa', subject: 'physics' }],
      [{ id: 'p1', title: 'পিডিএফ', url: 'https://example.com/x.pdf', subject: 'chemistry' }],
    );
    expect(dupes).toEqual([]);
  });

  it('canStore degrades gracefully without quota API', async () => {
    expect(await canStore(1024)).toBe(true);
    expect(await canStore(1e12)).toBe(true);
  });

  it('clearTempCache resolves without IndexedDB', async () => {
    expect(await clearTempCache(7)).toBeNull();
  });
});
