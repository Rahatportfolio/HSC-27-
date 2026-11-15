// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clearDatabase, persistToDatabase, restoreFromDatabase } from './db';
import { isNativeApp, startStudyTimerService, stopStudyTimerService, syncNativeReminders } from './native';
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
  it('never starts the Android foreground service in the browser', async () => {
    await expect(startStudyTimerService('পদার্থ · পড়া চলছে', 'টাইমার চলছে')).resolves.toBe(false);
    await expect(stopStudyTimerService()).resolves.toBe(false);
  });

  it('talks to the native timer plugin when a shell registers it', async () => {
    const calls: string[] = [];
    const plugin = {
      start: async (options: { title: string; body: string }) => { calls.push('start:' + options.title); },
      stop: async () => { calls.push('stop'); },
    };
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, Plugins: { StudyTimer: plugin } };
    try {
      expect(await startStudyTimerService('পদার্থ · পড়া চলছে', 'টাইমার চলছে')).toBe(true);
      expect(await stopStudyTimerService()).toBe(true);
      expect(calls).toEqual(['start:পদার্থ · পড়া চলছে', 'stop']);
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });
});
