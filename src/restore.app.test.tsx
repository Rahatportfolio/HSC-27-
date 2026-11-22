// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshData, STORAGE_KEY } from './planner';
import { RECOVERY_KEY } from './storage';
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

beforeEach(() => {
  localStorage.clear(); window.location.hash = '#settings';
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  window.scrollTo = vi.fn(); mocks.persist.mockReset().mockResolvedValue(true); mocks.restore.mockReset();
});
afterEach(() => cleanup());

describe('database restoration while editing', () => {
  it('preserves an edit and keeps the database snapshot as recovery data', async () => {
    let finish!: (value: { payload: string; updatedAt: string }) => void;
    mocks.restore.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const old = freshData(); old.settings.name = 'Database copy';
    const payload = JSON.stringify(old);
    render(<App />);
    // Wait for the intentionally lazy Settings editor, not just its shell.
    fireEvent.click(await screen.findByRole('button', { name: /গাঢ়/ }, { timeout: 8000 }));
    await act(async () => finish({ payload, updatedAt: '2026-11-15T12:00:00.000Z' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings.theme).toBe('dark'));
    expect(localStorage.getItem(RECOVERY_KEY)).toBe(payload);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings.name).not.toBe('Database copy');
    expect(mocks.persist).not.toHaveBeenCalled();
  }, 15000);
  it('waits for a delayed native snapshot before offering new-student availability setup', async () => {
    window.location.hash = '#today';
    let finish!: (value: { payload: string; updatedAt: string }) => void;
    mocks.restore.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<App />);
    expect(screen.queryByRole('heading', { name: 'আগে বলো, কখন পড়তে পারবে?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'এই সময় প্রতিদিন' })).toBeNull();
    await act(async () => finish({ payload: JSON.stringify(freshData()), updatedAt: '2026-11-15T12:00:00.000Z' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').routineSetupRequired).not.toBe(true));
    expect(screen.queryByRole('heading', { name: 'আগে বলো, কখন পড়তে পারবে?' })).toBeNull();
  });
  it('does not show or edit a potentially stale personal home before the native mirror resolves', async () => {
    window.location.hash = '#today';
    const saved = personalDataFixture(); saved.notes[saved.settings.startDate] = 'Newer mirror note';
    let finish!: (value: { payload: string; updatedAt: string }) => void;
    mocks.restore.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(personalDataFixture()));
    render(<App />);
    expect(screen.getByRole('status').textContent).toContain('Restoring saved device data');
    expect(document.querySelector('.personal-home')).toBeNull();
    await act(async () => finish({ payload: JSON.stringify(saved), updatedAt: '2026-11-20T12:00:00Z' }));
    await waitFor(() => expect(document.querySelector('.personal-home')).not.toBeNull());
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes[saved.settings.startDate]).toBe('Newer mirror note'));
  });
  it('keeps an existing personal view usable but waits before offering an editor during native restoration', async () => {
    const existing = personalDataFixture(); localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    let finish!: (value: null) => void;
    mocks.restore.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Set availability, S list & class durations' })).toBeNull();
    await act(async () => finish(null));
    expect(await screen.findByRole('button', { name: 'Set availability, S list & class durations' })).toBeTruthy();
  });
  it('keeps an invalid snapshot for recovery instead of replacing the mirror', async () => {
    mocks.restore.mockResolvedValue({ payload: '{invalid', updatedAt: '2026-11-15T12:00:00.000Z' });
    render(<App />);
    // The mirror is written first and the profile is saved from an effect afterwards,
    // so both writes need waiting for. Reading STORAGE_KEY straight after the recovery
    // key raced the effect and passed locally while failing on a slower CI runner.
    await waitFor(() => expect(localStorage.getItem(RECOVERY_KEY)).toBe('{invalid'));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').version).toBe(2);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('restores a valid database copy if there was no intervening edit', async () => {
    const old = freshData(); old.settings.name = 'Recovered';
    mocks.restore.mockResolvedValue({ payload: JSON.stringify(old), updatedAt: '2026-11-15T12:00:00.000Z' });
    render(<App />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings.name).toBe('Recovered'));
  });
});
