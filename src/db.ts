import { SAVED_AT_KEY } from './storage';
import { isNativeApp } from './native';

/**
 * Durable on-device SQLite mirror, used only inside the Capacitor Android app.
 * The web/PWA build keeps using localStorage; the app never needs a server.
 * Every operation is best-effort: if the plugin is unavailable the validated
 * localStorage snapshot remains the source of truth.
 */
const DB_NAME = 'hsc27';
const TABLE_SQL = 'CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL);';

type Row = Record<string, unknown>;
type Db = {
  open: () => Promise<void>;
  execute: (statement: string) => Promise<unknown>;
  run: (statement: string, values?: unknown[]) => Promise<unknown>;
  query: (statement: string, values?: unknown[]) => Promise<{ values?: Row[] }>;
};

let connection: Promise<Db | null> | null = null;

async function getConnection(): Promise<Db | null> {
  if (!isNativeApp()) return null;
  if (!connection) {
    connection = (async () => {
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      let db: Db;
      const existing = await sqlite.isConnection(DB_NAME, false);
      db = (existing.result
        ? await sqlite.retrieveConnection(DB_NAME, false)
        : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)) as unknown as Db;
      try { await db.open(); } catch { /* the connection may already be open after a hot reload */ }
      await db.execute(TABLE_SQL);
      return db;
    })().catch(error => {
      console.warn('SQLite mirror unavailable; staying on local storage.', error);
      return null;
    });
  }
  return connection;
}

/** Returns a newer payload than localStorage, or null when local storage is current. */
export async function restoreFromDatabase(): Promise<string | null> {
  try {
    const db = await getConnection();
    if (!db) return null;
    const result = await db.query('SELECT payload, updated_at FROM app_state WHERE id = 1 LIMIT 1;');
    const row = result.values?.[0];
    if (!row || typeof row.payload !== 'string' || typeof row.updated_at !== 'string') return null;
    const localStamp = localStorage.getItem(SAVED_AT_KEY) || '';
    if (row.updated_at <= localStamp) return null;
    localStorage.setItem(SAVED_AT_KEY, row.updated_at);
    return row.payload;
  } catch (error) {
    console.warn('Could not read the SQLite snapshot.', error);
    return null;
  }
}

export async function persistToDatabase(payload: string, updatedAt: string): Promise<boolean> {
  try {
    const db = await getConnection();
    if (!db) return false;
    await db.run('INSERT OR REPLACE INTO app_state (id, payload, updated_at) VALUES (1, ?, ?);', [payload, updatedAt]);
    return true;
  } catch (error) {
    console.warn('Could not write the SQLite snapshot.', error);
    return false;
  }
}

export async function clearDatabase(): Promise<void> {
  try {
    const db = await getConnection();
    if (db) await db.run('DELETE FROM app_state;');
  } catch (error) {
    console.warn('Could not clear the SQLite snapshot.', error);
  }
}
