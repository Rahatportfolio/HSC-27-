// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  localStorage.clear(); window.location.hash = '#today';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(personalDataFixture()));
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  window.scrollTo = vi.fn(); mocks.persist.mockReset().mockResolvedValue(true); mocks.restore.mockReset().mockResolvedValue(null);
});
afterEach(cleanup);

describe('Android durable save status', () => {
  it('starts the mirror immediately and does not report an edited note saved until its own write resolves', async () => {
    render(<App />);
    const input = await screen.findByRole('textbox', { name: 'Day note' });
    await waitFor(() => expect(screen.getByText('auto-saved')).toBeTruthy());
    let finish!: (ok: boolean) => void;
    mocks.persist.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.change(input, { target: { value: 'A new saved note' } });
    await waitFor(() => expect(mocks.persist.mock.calls.some(([payload]) => payload.includes('A new saved note'))).toBe(true));
    expect(screen.getByText('saving…')).toBeTruthy();
    expect(screen.queryByText('auto-saved')).toBeNull();
    await act(async () => finish(true));
    await waitFor(() => expect(screen.getByText('auto-saved')).toBeTruthy());
  });
  it('warns when the current snapshot fails to persist', async () => {
    render(<App />);
    const input = await screen.findByRole('textbox', { name: 'Day note' });
    await waitFor(() => expect(screen.getByText('auto-saved')).toBeTruthy());
    mocks.persist.mockResolvedValueOnce(false);
    fireEvent.change(input, { target: { value: 'Do not lose me' } });
    await waitFor(() => expect(screen.getByText('save not confirmed')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('Device save was not confirmed');
  });
  it('never lets an earlier write confirm a newer edit', async () => {
    render(<App />);
    const input = await screen.findByRole('textbox', { name: 'Day note' });
    await waitFor(() => expect(screen.getByText('auto-saved')).toBeTruthy());
    let old!: (ok: boolean) => void, current!: (ok: boolean) => void;
    mocks.persist.mockImplementationOnce(() => new Promise(resolve => { old = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { current = resolve; }));
    fireEvent.change(input, { target: { value: 'first' } });
    await waitFor(() => expect(old).toBeTypeOf('function'));
    fireEvent.change(input, { target: { value: 'second' } });
    await waitFor(() => expect(current).toBeTypeOf('function'));
    await act(async () => old(true));
    expect(screen.getByText('saving…')).toBeTruthy();
    await act(async () => current(true));
    await waitFor(() => expect(screen.getByText('auto-saved')).toBeTruthy());
  });
});
