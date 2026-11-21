// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshData } from './planner';

const mocks = vi.hoisted(() => ({
  getPending: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), checkPermissions: vi.fn(), createChannel: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }));

afterEach(() => { Reflect.deleteProperty(window, 'Capacitor'); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('native reminder cancellation', () => {
  it('clears scheduled reminders when switched off without cancelling the timer alarm', async () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    mocks.checkPermissions.mockResolvedValue({ display: 'granted' });
    mocks.createChannel.mockResolvedValue(undefined);
    mocks.getPending.mockResolvedValue({ notifications: [{ id: 123 }, { id: 2728 }] });
    mocks.cancel.mockResolvedValue(undefined);
    const { syncNativeReminders, TIMER_ALARM_ID } = await import('./native');
    mocks.getPending.mockResolvedValue({ notifications: [{ id: 123 }, { id: TIMER_ALARM_ID }] });
    const data = freshData(); data.settings.reminderEnabled = false;
    expect(await syncNativeReminders([], data, '2026-11-15')).toEqual({ scheduled: 0, permission: 'granted' });
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 123 }] });
    expect(mocks.schedule).not.toHaveBeenCalled();
    mocks.checkPermissions.mockResolvedValue({ display: 'denied' });
    expect(await syncNativeReminders([], data, '2026-11-15')).toEqual({ scheduled: 0, permission: 'denied' });
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
  });
});

it('does not resurrect old reminders when an earlier sync is still running as reminders are switched off', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T03:00:00Z'));
  (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
  mocks.checkPermissions.mockResolvedValue({ display: 'granted' });
  mocks.createChannel.mockResolvedValue(undefined);
  let pending: { id: number }[] = [];
  let release!: (value: { notifications: { id: number }[] }) => void;
  let firstReadStarted!: () => void;
  const started = new Promise<void>(resolve => { firstReadStarted = resolve; });
  mocks.getPending.mockReset().mockImplementationOnce(() => {
    firstReadStarted();
    return new Promise(resolve => { release = resolve; });
  }).mockImplementation(async () => ({ notifications: [...pending] }));
  mocks.cancel.mockImplementation(async ({ notifications }: { notifications: { id: number }[] }) => {
    const cancelled = new Set(notifications.map(n => n.id));
    pending = pending.filter(n => !cancelled.has(n.id));
  });
  mocks.schedule.mockImplementation(async ({ notifications }: { notifications: { id: number }[] }) => { pending.push(...notifications.map(n => ({ id: n.id }))); });
  const { syncNativeReminders } = await import('./native');
  const enabled = freshData();
  enabled.settings.reminderEnabled = true;
  enabled.importantDates = [{ id: 'appointment', title: 'Important exam', date: '2026-11-21', note: '', notify: true, createdAt: '2026-11-20T00:00:00Z' }];
  const first = syncNativeReminders([], enabled, '2026-11-20');
  await started;
  const disabled = { ...enabled, settings: { ...enabled.settings, reminderEnabled: false } };
  const second = syncNativeReminders([], disabled, '2026-11-20');
  // Give an unsynchronized second sync the opportunity to finish before the first.
  await new Promise(resolve => setTimeout(resolve, 0));
  release({ notifications: [] });
  await Promise.all([first, second]);
  expect(pending).toEqual([]);
  vi.useRealTimers();
});

it('continues later reminder syncs after an earlier native failure', async () => {
  (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
  mocks.checkPermissions.mockReset().mockRejectedValueOnce(new Error('bridge failed')).mockResolvedValue({ display: 'granted' });
  mocks.getPending.mockReset().mockResolvedValue({ notifications: [] });
  const { syncNativeReminders } = await import('./native');
  const data = freshData(); data.settings.reminderEnabled = false;
  await expect(syncNativeReminders([], data, '2026-11-20')).rejects.toThrow('bridge failed');
  await expect(syncNativeReminders([], data, '2026-11-20')).resolves.toEqual({ scheduled: 0, permission: 'granted' });
});
