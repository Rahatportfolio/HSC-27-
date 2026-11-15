// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_AT_KEY, shareBackup, hasStudyData } from './backup';
import { freshData } from './planner';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('backup safeguards', () => {
  it('does not claim a cancelled share was saved or fall back to a download', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    expect(await shareBackup(freshData())).toBe('cancelled');
    expect(localStorage.getItem(BACKUP_AT_KEY)).toBeNull();
    expect(share).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });
  it('reminds users whose only data is custom content or routine', () => {
    const data = freshData();
    data.routineBlocks.push({ id: 't', weekday: 1, startMinute: 600, minutes: 30, subject: 'physics', title: 'Study', createdAt: '2026-11-01T00:00:00.000Z' });
    expect(hasStudyData(data)).toBe(true);
  });
});

it('keeps snapshot timestamps ordered when the device clock moves backwards', async () => {
  const { saveData, SAVED_AT_KEY } = await import('./storage');
  const data = freshData();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-15T00:00:00.000Z'));
  expect(saveData(data)).toBe(true);
  const first = localStorage.getItem(SAVED_AT_KEY)!;
  vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-14T00:00:00.000Z'));
  data.settings.name = 'new change';
  expect(saveData(data)).toBe(true);
  expect(localStorage.getItem(SAVED_AT_KEY)! > first).toBe(true);
  const second = localStorage.getItem(SAVED_AT_KEY)!;
  expect(saveData(data, true)).toBe(true);
  expect(localStorage.getItem(SAVED_AT_KEY)! > second).toBe(true);
});
