// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDayOverrides, buildPlan, freshData } from './planner';
import { buildTomorrowPreviewNotification } from './notifications';
import { setLanguage } from './i18n';

setLanguage('bn');

const data = freshData();
const plan = applyDayOverrides(buildPlan(data.settings), data.dayOverrides, data.settings);
const today = plan[0].date;

describe('tomorrow preview notification', () => {
  afterEach(() => setLanguage('bn'));

  it('lists tomorrow’s subjects, first session time and totals in Bengali', () => {
    const preview = buildTomorrowPreviewNotification(plan, data, today);
    expect(preview).not.toBeNull();
    expect(preview!.title).toContain('আগামীকালের ক্লাস');
    expect(preview!.title).toContain('সেশন');
    expect(preview!.body).toContain('আগামীকাল কী পড়া:');
    expect(preview!.body).toContain('প্রথম সেশন');
    expect(preview!.body).toContain('মোট');
  });

  it('returns null when there is no plan day after the given date', () => {
    const lastDay = plan[plan.length - 1].date;
    expect(buildTomorrowPreviewNotification(plan, data, lastDay)).toBeNull();
  });

  it('still previews tomorrow even when every task today is already complete', () => {
    const allCompleted = Object.fromEntries(plan[0].tasks.map(tk => [tk.id, '2026-11-20T08:00:00Z']));
    const doneData = { ...data, completed: allCompleted };
    const preview = buildTomorrowPreviewNotification(plan, doneData, today);
    expect(preview).not.toBeNull();
    expect(preview!.body).toContain('আগামীকাল কী পড়া:');
  });
});

describe('native sync schedules the 9 PM tomorrow preview', () => {
  const mocks = vi.hoisted(() => ({
    getPending: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), checkPermissions: vi.fn(), createChannel: vi.fn(),
  }));
  vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }));

  afterEach(() => {
    Reflect.deleteProperty(window, 'Capacitor');
    vi.restoreAllMocks();
  });

  it('creates a tomorrow-preview notification for upcoming days with classes', async () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    mocks.checkPermissions.mockResolvedValue({ display: 'granted' });
    mocks.createChannel.mockResolvedValue(undefined);
    mocks.getPending.mockResolvedValue({ notifications: [] });
    mocks.schedule.mockResolvedValue(undefined);
    const { syncNativeReminders } = await import('./native');
    const nativeData = freshData();
    nativeData.settings.reminderEnabled = true;
    const result = await syncNativeReminders(plan, nativeData, today);
    expect(result.permission).toBe('granted');
    const scheduled = mocks.schedule.mock.calls.flatMap(call => call[0].notifications as { title: string; schedule: { at: Date } }[]);
    const previews = scheduled.filter(item => item.title.includes('আগামীকালের ক্লাস'));
    expect(previews.length).toBeGreaterThan(0);
    for (const preview of previews) expect(preview.schedule.at.getTime()).toBeGreaterThan(Date.now());
  });
});
