// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlannerContext } from './context';
import type { PlannerContextValue } from './context';
import { freshData } from './planner';
import { setLanguage } from './i18n';
import * as storage from './storage-manager';
import StorageView from './views/Storage';

beforeEach(() => { setLanguage('en'); localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
function setup() {
  const notify = vi.fn();
  const data = freshData();
  render(<PlannerContext.Provider value={{ data, notify } as unknown as PlannerContextValue}><StorageView /></PlannerContext.Provider>);
  return { notify };
}

describe('storage truthful states', () => {
  it('does not report unavailable storage before checking; shows empty duplicate results', async () => {
    setup();
    expect(screen.queryByText('Storage info unavailable')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Find duplicates' }));
    expect(await screen.findByText('No duplicate links found.')).toBeTruthy();
  });
  it('reports a cleanup failure rather than claiming the cache was already clean', async () => {
    vi.spyOn(storage, 'clearTempCache').mockResolvedValue(null);
    const { notify } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Clear old cache' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Could not check or clear the cache. Check storage access.', 'error'));
  });
  it('never claims a safe backup merely because there is no data or a snoozed reminder', async () => {
    vi.spyOn(storage, 'getStorageUsage').mockResolvedValue({ localStorageBytes: 1, indexedDBBytes: 0, indexedDBAvailable: false, totalBytes: 1, estimate: null });
    const { } = setup();
    localStorage.setItem('hsc27-backup-snooze', '2099-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/No backup record was found/)).toBeTruthy();
    expect(screen.queryByText('A safe backup exists.')).toBeNull();
  });
});
