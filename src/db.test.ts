// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(), query: vi.fn(), execute: vi.fn(), open: vi.fn(), native: vi.fn(() => true),
}));
vi.mock('./native', () => ({ isNativeApp: mocks.native }));
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    isConnection() { return Promise.resolve({ result: false }); }
    createConnection() { return Promise.resolve({ open: mocks.open, execute: mocks.execute, query: mocks.query, run: mocks.run }); }
  },
}));

beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.clearAllMocks(); mocks.open.mockResolvedValue(undefined); mocks.execute.mockResolvedValue(undefined); mocks.run.mockResolvedValue(undefined); });

describe('SQLite snapshot safety', () => {
  it('does not update local metadata merely by reading a newer snapshot', async () => {
    const { SAVED_AT_KEY } = await import('./storage');
    const { restoreFromDatabase } = await import('./db');
    localStorage.setItem(SAVED_AT_KEY, '2026-11-01T00:00:00.000Z');
    mocks.query.mockResolvedValue({ values: [{ payload: '{"broken":true}', updated_at: '2026-11-02T00:00:00.000Z' }] });
    expect(await restoreFromDatabase()).toEqual({ payload: '{"broken":true}', updatedAt: '2026-11-02T00:00:00.000Z' });
    expect(localStorage.getItem(SAVED_AT_KEY)).toBe('2026-11-01T00:00:00.000Z');
  });
  it('serializes older writes, resets and later writes, with an SQL freshness guard', async () => {
    const { persistToDatabase, clearDatabase } = await import('./db');
    let release!: () => void;
    mocks.run.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const old = persistToDatabase('old', '2026-11-01T00:00:00.000Z');
    const reset = clearDatabase();
    const fresh = persistToDatabase('new', '2026-11-02T00:00:00.000Z');
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
    expect(mocks.run.mock.calls[0][0]).toContain('WHERE NOT EXISTS (SELECT 1 FROM app_state WHERE id = 1 AND updated_at > ?)');
    release();
    await Promise.all([old, reset, fresh]);
    expect(mocks.run.mock.calls.map(call => call[0].startsWith('DELETE') ? 'delete' : call[1][0])).toEqual(['old', 'delete', 'new']);
  });
});

it('reports a database read failure so the app can avoid overwriting its mirror', async () => {
  const { restoreFromDatabase } = await import('./db');
  mocks.query.mockRejectedValue(new Error('read failed'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(restoreFromDatabase()).rejects.toThrow('read failed');
  warning.mockRestore();
});

it('reports a failed database reset rather than treating it as successful', async () => {
  const { clearDatabase } = await import('./db');
  mocks.run.mockRejectedValue(new Error('delete failed'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(clearDatabase()).resolves.toBe(false);
  warning.mockRestore();
});

it('only confirms a write after the matching row has actually committed', async () => {
  const { persistToDatabase } = await import('./db');
  mocks.query.mockResolvedValueOnce({ values: [{ payload: 'newer', updated_at: '2026-11-03T00:00:00.000Z' }] });
  expect(await persistToDatabase('old', '2026-11-02T00:00:00.000Z')).toBe(false);
  mocks.query.mockResolvedValueOnce({ values: [{ payload: 'current', updated_at: '2026-11-03T00:00:00.000Z' }] });
  expect(await persistToDatabase('current', '2026-11-03T00:00:00.000Z')).toBe(true);
});

it('restores a committed mirror when local payload diverges at the same stamp', async () => {
  const { SAVED_AT_KEY } = await import('./storage');
  const { STORAGE_KEY } = await import('./planner');
  const { restoreFromDatabase } = await import('./db');
  const stamp = '2026-11-02T00:00:00.000Z';
  localStorage.setItem(SAVED_AT_KEY, stamp);
  localStorage.setItem(STORAGE_KEY, 'older local payload');
  mocks.query.mockResolvedValue({ values: [{ payload: 'committed payload', updated_at: stamp }] });
  expect(await restoreFromDatabase()).toEqual({ payload: 'committed payload', updatedAt: stamp });
  expect(localStorage.getItem(STORAGE_KEY)).toBe('older local payload');
  localStorage.setItem(STORAGE_KEY, 'committed payload');
  expect(await restoreFromDatabase()).toBeNull();
});
