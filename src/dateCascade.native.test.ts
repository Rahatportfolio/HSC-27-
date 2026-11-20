// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTERS } from './data';
import { freshData, shiftPlanStart } from './planner';
import { buildStudyPlan } from './studyPlan';
import { applyScheduleSettings } from './reschedule';
import { setLanguage } from './i18n';

interface Scheduled { id: number; title: string; body: string; schedule: { at: Date } }
const mocks = vi.hoisted(() => ({
  getPending: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), checkPermissions: vi.fn(), createChannel: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T06:00:00Z'));
  setLanguage('en');
  (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
  mocks.checkPermissions.mockResolvedValue({ display: 'granted' });
  mocks.createChannel.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.schedule.mockResolvedValue(undefined);
  mocks.getPending.mockResolvedValue({ notifications: [] });
});
afterEach(() => { vi.useRealTimers(); Reflect.deleteProperty(window, 'Capacitor'); });
const batch = (): Scheduled[] => mocks.schedule.mock.calls.at(-1)![0].notifications;

describe('date cascade reaches native reminders', () => {
  it('cancels stale study alarms, uses the new dates/times, and keeps real appointments and recall dates unchanged', async () => {
    const { syncNativeReminders, TIMER_ALARM_ID } = await import('./native');
    const data = freshData();
    data.settings.reminderEnabled = true;
    data.settings.adaptiveEnabled = false;
    // Fresh installs default to today; pin an explicit future start so this cascade has tomorrow's plan to move.
    data.settings.startDate = '2026-11-20';
    data.settings.boostStartDate = '2026-12-07';
    data.importantDates = [{ id: 'appointment', title: 'Real appointment', date: '2026-11-21', note: '', notify: true, createdAt: '2026-11-16T06:00:00Z' }];
    data.revisions = [{ id: 'recall', chapterId: CHAPTERS[0].id, subject: CHAPTERS[0].subject, dueDate: '2026-11-22', interval: 1, createdAt: '2026-11-16T06:00:00Z', adjusted: true }];
    const plan = buildStudyPlan(data, '2026-11-16');
    await syncNativeReminders(plan, data, '2026-11-16');
    const original = batch();
    const taskReminder = original.find(item => item.title.includes(plan[0].tasks[0].title))!;
    expect(taskReminder.schedule.at.toISOString()).toBe(`${plan[0].date}T00:20:00.000Z`);
    const appointment = original.find(item => item.body === 'Real appointment')!;
    const recall = original.find(item => item.title === 'রিভিশন দিন')!;

    mocks.getPending.mockResolvedValue({ notifications: [...original.map(({ id }) => ({ id })), { id: TIMER_ALARM_ID }] });
    const settings = { ...shiftPlanStart(data.settings, '2026-11-26'), startTime: '05:30' };
    const next = applyScheduleSettings(data, settings);
    await syncNativeReminders(buildStudyPlan(next, '2026-11-16'), next, '2026-11-16');
    const shifted = batch();
    expect(mocks.cancel).toHaveBeenLastCalledWith({ notifications: original.map(({ id }) => ({ id })) });
    expect(shifted.find(item => item.id === taskReminder.id)?.schedule.at.toISOString()).toBe('2026-11-25T23:20:00.000Z');
    expect(shifted.find(item => item.id === appointment.id)?.schedule.at.toISOString()).toBe(appointment.schedule.at.toISOString());
    expect(shifted.find(item => item.id === recall.id)?.schedule.at.toISOString()).toBe(recall.schedule.at.toISOString());
  });

  it('keeps an after-midnight session from the preceding planning day in today’s notification window', async () => {
    const { syncNativeReminders } = await import('./native');
    vi.setSystemTime(new Date('2026-11-20T18:00:00Z')); // 21 November, midnight in Dhaka.
    const data = freshData(); data.settings.reminderEnabled = true;
    const plan = buildStudyPlan(data, '2026-11-20');
    const task = { ...plan[0].tasks[0], startMinute: 1500, endMinute: 1560 };
    await syncNativeReminders([{ ...plan[0], tasks: [task] }], data, '2026-11-21');
    const reminder = batch().find(item => item.title.includes(task.title));
    expect(reminder?.schedule.at.toISOString()).toBe(`${plan[0].date}T18:50:00.000Z`);
  });

  it('derives a late day’s briefing from absolute slot minutes, not a next-day clock value modulo 24 hours', async () => {
    const { syncNativeReminders } = await import('./native');
    const data = freshData(); data.settings.reminderEnabled = true;
    const plan = buildStudyPlan(data, '2026-11-16');
    const tasks = [
      { ...plan[0].tasks[0], startMinute: 1380, endMinute: 1440 },
      { ...plan[0].tasks[1], startMinute: 1500, endMinute: 1560 },
    ];
    await syncNativeReminders([{ ...plan[0], tasks }], data, '2026-11-16');
    const brief = batch().find(item => item.title.startsWith('📚'))!;
    expect(brief.schedule.at.toISOString()).toBe(`${plan[0].date}T16:40:00.000Z`);
  });
});
