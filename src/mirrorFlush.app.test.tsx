// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from './planner';
import { personalDataFixture } from './test/personalRoutineFixture';

const mocks = vi.hoisted(() => ({ restore: vi.fn(), persist: vi.fn() }));
vi.mock('./db', () => ({ restoreFromDatabase: mocks.restore, persistToDatabase: mocks.persist, clearDatabase: vi.fn() }));
vi.mock('./native', async importOriginal => ({
  ...(await importOriginal<typeof import('./native')>()),
  isNativeApp: () => true,
  prepareNativeNotifications: vi.fn().mockResolvedValue(true),
  setSystemBarsTheme: vi.fn().mockResolvedValue(true),
  stopStudyTimerService: vi.fn().mockResolvedValue(true),
  cancelTimerAlarm: vi.fn().mockResolvedValue(true),
  syncNativeReminders: vi.fn().mockResolvedValue({ scheduled: 0, permission: 'granted' }),
}));
import App from './App';

function hideDocument() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#today';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(personalDataFixture()));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  window.scrollTo = vi.fn();
  mocks.persist.mockReset().mockResolvedValue(true);
  mocks.restore.mockReset().mockResolvedValue(null);
});
afterEach(() => { cleanup(); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });

describe('native SQLite mirror durability at WebView teardown', () => {
  it('writes the pending snapshot when Android hides the WebView before the debounce elapses', async () => {
    render(<App />);
    // The mount snapshot is queued for the 900 ms debounce; nothing is written yet.
    await vi.waitFor(() => expect(mocks.restore).toHaveBeenCalled());
    // Let the post-restore commit run its effects so a mirror write is pending.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(mocks.persist).not.toHaveBeenCalled();
    act(() => hideDocument());
    // Flush must happen at teardown, not later when the 900 ms debounce fires.
    await vi.waitFor(() => expect(mocks.persist).toHaveBeenCalledTimes(1), { timeout: 400 });
    expect(mocks.persist.mock.calls[0][0]).toContain('"personalRoutine"');
    const [payload, updatedAt] = mocks.persist.mock.calls[0] as [string, string];
    expect(JSON.parse(payload).personalRoutine.chapterIds.length).toBe(2);
    expect(Number.isFinite(Date.parse(updatedAt))).toBe(true);
  });
  it('writes the pending snapshot when the page is discarded by Activity recreation', async () => {
    render(<App />);
    await vi.waitFor(() => expect(mocks.restore).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(mocks.persist).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    // Comfortably below the 900 ms debounce: only the teardown flush can explain this write.
    await vi.waitFor(() => expect(mocks.persist).toHaveBeenCalledTimes(1), { timeout: 400 });
    // A repeated teardown signal must not duplicate the same write.
    act(() => { window.dispatchEvent(new Event('pagehide')); hideDocument(); });
    expect(mocks.persist).toHaveBeenCalledTimes(1);
  });
  it('flushes on React teardown as well as on a browser teardown signal', async () => {
    render(<App />);
    await vi.waitFor(() => expect(mocks.restore).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(mocks.persist).not.toHaveBeenCalled();
    act(() => { cleanup(); });
    await vi.waitFor(() => expect(mocks.persist).toHaveBeenCalledTimes(1), { timeout: 400 });
  });
});
