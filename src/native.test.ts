// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { clearDatabase, persistToDatabase, restoreFromDatabase } from './db';
import {
  cancelTimerAlarm, isNativeApp, nativeNotificationStatus, nativeNotify, openExactAlarmSettings,
  prepareNativeNotifications, requestNativeNotifications, scheduleTimerAlarm, setSystemBarsTheme,
  startStudyTimerService, stopStudyTimerService, syncNativeReminders,
} from './native';
import { canNotify } from './hooks';
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
  it('reports notifications as unavailable and never leaks a throw in the browser', async () => {
    await expect(prepareNativeNotifications()).resolves.toBe(false);
    await expect(nativeNotify('টাইটেল', 'বডি')).resolves.toBe(false);
    await expect(requestNativeNotifications()).resolves.toBe('unavailable');
    await expect(openExactAlarmSettings()).resolves.toBe(false);
    const status = await nativeNotificationStatus();
    expect(status.permission).toBe('unavailable');
    expect(status.exact).toBe('unavailable');
  });

  it('ignores a session alarm that has no future time or no native shell', async () => {
    await expect(scheduleTimerAlarm(Date.now() - 1000, 'সেশন শেষ', 'পদার্থ')).resolves.toBe(false);
    await expect(scheduleTimerAlarm(Date.now() + 60_000, 'সেশন শেষ', 'পদার্থ')).resolves.toBe(false);
    await expect(cancelTimerAlarm()).resolves.toBe(false);
  });

  it('leaves the system bars alone in a browser', async () => {
    await expect(setSystemBarsTheme(true)).resolves.toBe(false);
    await expect(setSystemBarsTheme(false)).resolves.toBe(false);
  });

  it('knows that a browser without permission cannot notify', () => {
    expect(canNotify()).toBe(false);
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

describe('Android live timer clock bridge', () => {
  it('passes the wall-clock anchor and opens a native floating timer', async () => {
    const { openNativeTimerPictureInPicture } = await import('./native');
    const start = vi.fn(async () => ({}));
    const picture = vi.fn(async () => ({ started: true }));
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, Plugins: { StudyTimer: { start, stop: async () => ({}), enterPictureInPicture: picture } } };
    try {
      const referenceTime = Date.now() + 90_000;
      expect(await startStudyTimerService('Test', 'Running', { referenceTime, countdown: true })).toBe(true);
      expect(start).toHaveBeenCalledWith({ title: 'Test', body: 'Running', referenceTime, countdown: true });
      expect(await openNativeTimerPictureInPicture('Test', referenceTime, true)).toBe(true);
      expect(picture).toHaveBeenCalledWith({ title: 'Test', referenceTime, countdown: true });
      expect(await openNativeTimerPictureInPicture('Test', 0, true)).toBe(false);
    } finally { delete (window as unknown as { Capacitor?: unknown }).Capacitor; }
  });
});
