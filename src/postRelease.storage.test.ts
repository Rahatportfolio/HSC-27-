// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { freshData, STORAGE_KEY } from './planner';
import { parseBackup, SAVED_AT_KEY, saveData } from './storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('does not replace progress if the snapshot timestamp cannot be written', () => {
  const original = freshData();
  original.settings.name = 'Original profile';
  original.completed['physics-1-2:part-1'] = '2026-11-20T08:00:00Z';
  const payload = JSON.stringify(original), stamp = '2026-11-20T09:00:00.000Z';
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(SAVED_AT_KEY, stamp);
  const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === SAVED_AT_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    set.call(this, key, value);
  });
  expect(saveData(freshData(), true)).toBe(false);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(payload);
  expect(localStorage.getItem(SAVED_AT_KEY)).toBe(stamp);
});

it('restores the old timestamp if writing the replacement payload fails', () => {
  const original = freshData();
  original.settings.name = 'Original';
  const payload = JSON.stringify(original), stamp = '2026-11-20T09:00:00.000Z';
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(SAVED_AT_KEY, stamp);
  const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === STORAGE_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    set.call(this, key, value);
  });
  expect(saveData(freshData(), true)).toBe(false);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(payload);
  expect(localStorage.getItem(SAVED_AT_KEY)).toBe(stamp);
});

it('removes a newly written timestamp when the first payload cannot be stored', () => {
  const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === STORAGE_KEY) throw new DOMException('Storage full', 'QuotaExceededError');
    set.call(this, key, value);
  });
  expect(saveData(freshData(), true)).toBe(false);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(SAVED_AT_KEY)).toBeNull();
});

it.each([[null], [23], ['unrelated-cache-entry']])('rejects unsafe scanner page references in imported metadata: %j', (pageKey) => {
  const raw = { ...freshData(), scannedNotes: [{
    id: 'note', title: 'My scan', subject: 'physics', pageCount: 1, sizeBytes: 10,
    createdAt: '2026-11-20T08:00:00Z', pdfExported: false, pageKeys: [pageKey],
  }] };
  expect(() => parseBackup(JSON.stringify(raw))).toThrow(/স্ক্যান/);
});
