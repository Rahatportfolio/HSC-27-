// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshData, STORAGE_KEY } from './planner';
import { RECOVERY_KEY } from './storage';

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
    fireEvent.click(await screen.findByRole('button', { name: /গাঢ়/ }));
    await act(async () => finish({ payload, updatedAt: '2026-11-15T12:00:00.000Z' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings.theme).toBe('dark'));
    expect(localStorage.getItem(RECOVERY_KEY)).toBe(payload);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings.name).not.toBe('Database copy');
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('keeps an invalid snapshot for recovery instead of replacing the mirror', async () => {
    mocks.restore.mockResolvedValue({ payload: '{invalid', updatedAt: '2026-11-15T12:00:00.000Z' });
    render(<App />);
    await waitFor(() => expect(localStorage.getItem(RECOVERY_KEY)).toBe('{invalid'));
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
