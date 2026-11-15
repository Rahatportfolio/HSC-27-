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
