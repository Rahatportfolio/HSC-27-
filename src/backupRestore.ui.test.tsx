// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshData, shiftPlanStart, STORAGE_KEY } from './planner';
import type { AppData } from './planner';
import { freshTimerState, TIMER_KEY } from './hooks';
const media = vi.hoisted(() => ({ inspect: vi.fn(), stage: vi.fn(), rollback: vi.fn(async () => {}) }));
vi.mock('./mediaBackup', async importOriginal => ({
  ...await importOriginal<typeof import('./mediaBackup')>(),
  inspectMediaBackup: media.inspect, stageMediaRestore: media.stage,
}));
import App from './App';
import { beginExam } from './examSim';
import { STARTER_QUESTIONS } from './quiz-data';

let original: AppData, restored: AppData;
const clockKey = 'hsc27-exam-clock-v1';
const stored = (): AppData => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); window.location.hash = '#settings';
  original = freshData();
  original.settings = { ...original.settings, name: 'Current profile', language: 'en', boostEnabled: false, adaptiveEnabled: false };
  original.notes['2026-11-20'] = 'Keep my original note';
  restored = freshData();
  restored.settings = { ...shiftPlanStart(restored.settings, '2026-11-26'), name: 'Restored profile', language: 'en', boostEnabled: false, adaptiveEnabled: false };
  restored.notes['2026-11-21'] = 'A backed-up note';
  const paper = { mode: 'chapter' as const, title: 'Previous live paper', questions: [STARTER_QUESTIONS[0]] };
  original = beginExam(original, paper); restored = beginExam(restored, { ...paper, title: 'Backup live paper' });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
  localStorage.setItem(clockKey, 'old-exam-clock');
  localStorage.setItem(TIMER_KEY, JSON.stringify({ ...freshTimerState(), mode: 'countdown', phase: 'none', durationMin: 30, accumulatedMs: 60_000, taskId: 'old-task' }));
  media.inspect.mockResolvedValue({ data: restored, files: [], scans: [], warnings: [] });
  media.stage.mockResolvedValue({ data: restored, rollback: media.rollback });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function open() { render(<App />); await screen.findByRole('heading', { name: 'Your study, your rhythm.' }); }
async function jsonImport() {
  const file = new File(['backup'], 'saved.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(restored) });
  fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } });
  const dialog = await screen.findByRole('dialog', { name: 'ব্যাকআপ ফিরিয়ে আনবে?' });
  return () => fireEvent.click(within(dialog).getByRole('button', { name: 'ব্যাকআপ ইমপোর্ট করো' }));
}
async function fullImport() {
  fireEvent.change(screen.getByLabelText('Full backup file'), { target: { files: [new File(['archive'], 'saved.prostuti')] } });
  const dialog = await screen.findByRole('dialog', { name: 'Restore full backup?' });
  return () => fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
}

describe('replacing a profile is durable and clears unrelated transient state', () => {
  it('explains that JSON and legacy full backups do not include handwritten image bytes', async () => {
    await open();
    expect(screen.getByRole('note', { name: 'Scan backup limitations' }).textContent).toContain('JSON and legacy full backups contain scan metadata, not images');
    const json = screen.getByRole('heading', { name: 'JSON backup' }).parentElement!;
    expect(json.textContent).toContain('Scanned images and offline PDF/video bytes are not included');
  });
  it('reports a failed JSON backup download without recording a successful backup', async () => {
    await open();
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => { throw new Error('download blocked'); });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Keep a backup' }));
      expect(document.querySelector('.toast.error')?.textContent).toContain('Backup could not be downloaded');
      expect(localStorage.getItem('hsc27-backup-at')).toBeNull();
      expect(stored().notes).toEqual(original.notes);
    } finally { URL.createObjectURL = originalCreate; }
  }, 30000);
  it('does not report JSON restore success, reset clocks or replace data if storage rejects the backup', async () => {
    await open();
    const confirm = await jsonImport();
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === STORAGE_KEY) throw new DOMException('Storage full', 'QuotaExceededError');
      set.call(this, key, value);
    });
    act(confirm);
    await waitFor(() => expect(screen.queryByText('Backup restored.')).toBeNull());
    expect((screen.getByLabelText(/^Your name/) as HTMLInputElement).value).toBe('Current profile');
    expect(stored().notes).toEqual(original.notes);
    expect(localStorage.getItem(clockKey)).toBe('old-exam-clock');
    expect(stored().activeExam).toEqual(original.activeExam);
    expect(JSON.parse(localStorage.getItem(TIMER_KEY)!).accumulatedMs).toBe(60_000);
  }, 30000);
  it('persists a successful JSON restore and clears the previous exam clock', async () => {
    await open(); const confirm = await jsonImport(); act(confirm);
    await waitFor(() => expect(stored().settings.name).toBe('Restored profile'));
    expect(localStorage.getItem(clockKey)).toBeNull();
    expect(stored().activeExam).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(TIMER_KEY)!).accumulatedMs).toBe(0);
    expect(stored().notes).toEqual(restored.notes);
  }, 30000);
  it('replaces a dirty JSON Settings draft and its start-date anchor together', async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: 'Unsaved JSON draft' } });
    const confirm = await jsonImport(); act(confirm);
    await waitFor(() => expect((screen.getByLabelText(/^Your name/) as HTMLInputElement).value).toBe('Restored profile'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stored().settings.startDate).toBe('2026-11-26');
    expect(stored().settings.name).toBe('Restored profile');
  });
  it('clears the previous exam clock after a successful full-media restore too', async () => {
    await open(); const confirm = await fullImport(); act(confirm);
    await waitFor(() => expect(stored().settings.name).toBe('Restored profile'));
    expect(localStorage.getItem(clockKey)).toBeNull();
    expect(stored().activeExam).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(TIMER_KEY)!).accumulatedMs).toBe(0);
  }, 30000);
  it('replaces a dirty Settings draft and selects the restored routine rather than saving old form values over it', async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: 'Unsaved old name' } });
    const confirm = await fullImport(); act(confirm);
    await waitFor(() => expect(stored().settings.name).toBe('Restored profile'));
    await waitFor(() => expect((screen.getByLabelText(/^Your name/) as HTMLInputElement).value).toBe('Restored profile'));
    expect((screen.getByLabelText(/^Routine start date/) as HTMLInputElement).value).toBe('2026-11-26');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stored().settings.name).toBe('Restored profile');
    act(() => { window.location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect((await screen.findByLabelText('Pick study date') as HTMLInputElement).value).toBe('2026-11-26');
  }, 30000);
  it('keeps clocks/profile and rolls staged media back if full-restore metadata cannot be saved', async () => {
    await open(); const confirm = await fullImport();
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === STORAGE_KEY) throw new DOMException('Storage full', 'QuotaExceededError');
      set.call(this, key, value);
    });
    act(confirm);
    await waitFor(() => expect(media.rollback).toHaveBeenCalled());
    expect(stored().settings.name).toBe('Current profile');
    expect(localStorage.getItem(clockKey)).toBe('old-exam-clock');
    expect(stored().activeExam).toEqual(original.activeExam);
    expect(JSON.parse(localStorage.getItem(TIMER_KEY)!).accumulatedMs).toBe(60_000);
  }, 30000);
  it('makes absent scanned images in an old full backup visible instead of claiming every file was restored', async () => {
    media.inspect.mockResolvedValue({ data: restored, files: [], warnings: ['Scanned image pages were not included in legacy full backups.'] });
    await open(); const confirm = await fullImport(); act(confirm);
    await waitFor(() => expect(stored().settings.name).toBe('Restored profile'));
    expect(document.querySelector('.toast.info')?.textContent).toContain('Scanned image pages were not included');
  }, 30000);
});
