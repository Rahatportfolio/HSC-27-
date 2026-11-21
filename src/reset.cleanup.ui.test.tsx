// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { freshData, STORAGE_KEY } from './planner';
const mocks = vi.hoisted(() => ({ clearFiles: vi.fn(), clearDatabase: vi.fn(), stop: vi.fn(), cancel: vi.fn() }));
vi.mock('./files', async importOriginal => ({ ...await importOriginal<typeof import('./files')>(), clearFiles: mocks.clearFiles }));
vi.mock('./db', async importOriginal => ({ ...await importOriginal<typeof import('./db')>(), clearDatabase: mocks.clearDatabase }));
vi.mock('./native', async importOriginal => ({ ...await importOriginal<typeof import('./native')>(), stopStudyTimerService: mocks.stop, cancelTimerAlarm: mocks.cancel }));
import { idbGet, idbSet } from './storage-manager';
import App from './App';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); window.location.hash = '#settings';
  vi.stubGlobal('indexedDB', new IDBFactory());
  const data = freshData(); data.settings = { ...data.settings, language: 'en' }; data.notes['2026-11-20'] = 'private note';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem('hsc27-exam-clock-v1', 'old-clock');
  mocks.clearFiles.mockRejectedValue(new Error('media blocked'));
  mocks.clearDatabase.mockResolvedValue(true);
  mocks.stop.mockResolvedValue(true); mocks.cancel.mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('cleans scanner images and timers even if another media store fails, and warns the user', async () => {
  await idbSet('scan:orphan', 'private image', 'image');
  render(<App />);
  await screen.findByRole('button', { name: 'Reset' }, { timeout: 10000 });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  const dialog = await screen.findByRole('dialog', { name: 'সব তথ্য মুছে নতুন শুরু করবে?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'সব মুছে নতুন শুরু' }));
  await waitFor(() => expect(document.querySelector('.toast.error')?.textContent).toMatch(/Progress was reset|অগ্রগতি রিসেট/));
  expect(await idbGet('scan:orphan')).toBeUndefined();
  expect(mocks.clearDatabase).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalled(); expect(mocks.cancel).toHaveBeenCalled();
  expect(localStorage.getItem('hsc27-exam-clock-v1')).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes).toEqual({});
}, 30000);
