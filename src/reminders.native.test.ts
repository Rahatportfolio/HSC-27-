// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshData } from './planner';

const mocks = vi.hoisted(() => ({
  getPending: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), checkPermissions: vi.fn(), createChannel: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }));

afterEach(() => { Reflect.deleteProperty(window, 'Capacitor'); vi.restoreAllMocks(); });

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
