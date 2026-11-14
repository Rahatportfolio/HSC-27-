// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clearDatabase, persistToDatabase, restoreFromDatabase } from './db';
import { isNativeApp, syncNativeReminders } from './native';
import { freshData } from './planner';

describe('native-only storage and notifications', () => {
  it('detects a browser and never touches SQLite there', async () => {
    expect(isNativeApp()).toBe(false);
    expect(await restoreFromDatabase()).toBeNull();
    expect(await persistToDatabase('{}', new Date().toISOString())).toBe(false);
    await expect(clearDatabase()).resolves.toBeUndefined();
  });
  it('reports native reminders as unavailable in the web build', async () => {
    const result = await syncNativeReminders([], freshData(), '2026-11-14');
    expect(result).toEqual({ scheduled: 0, permission: 'unavailable' });
  });
});
