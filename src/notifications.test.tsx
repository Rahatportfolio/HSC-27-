// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { setLanguage } from './i18n';
import {
  buildDailyNotificationDigest,
  buildDailyStatusNotification,
  buildEveningCheckinNotification,
  buildTaskReminderNotification,
} from './notifications';
import { DEFAULT_SETTINGS, applyDayOverrides, buildPlan, freshData, STORAGE_KEY } from './planner';
import { loadData } from './storage';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('smart study notifications (what to study, total study, and remaining to complete)', () => {
  beforeEach(() => {
    localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData())); // legacy saved profile

    window.location.hash = '';
    setLanguage('bn');
  });

  it('builds a full daily digest with today’s subjects/chapters, total hours, completed progress, and remaining tasks', () => {
    const { data } = loadData();
    const plan = applyDayOverrides(buildPlan(data.settings), data.dayOverrides, data.settings);
    const firstDay = plan[0];

    const initialDigest = buildDailyNotificationDigest(plan, data, firstDay.date);
    expect(initialDigest.totalTasks).toBeGreaterThan(0);
    expect(initialDigest.doneTasks).toBe(0);
    expect(initialDigest.remainingTasks).toBe(initialDigest.totalTasks);
    expect(initialDigest.whatToStudy.length).toBeGreaterThan(3);
    expect(initialDigest.totalSummary).toContain('সেশন');
    expect(initialDigest.remainingSummary).toContain('বাকি');

    const statusNotif = buildDailyStatusNotification(plan, data, firstDay.date);
    expect(statusNotif.title).toContain('আজকের পড়া');
    expect(statusNotif.body).toContain('আজ কী পড়া:');
    expect(statusNotif.body).toContain('মোট পড়া:');
    expect(statusNotif.body).toContain('কমপ্লিট করা লাগবে:');

    // Mark 1 of today's tasks complete -> digest updates completed & remaining counts
    const completed = { ...data.completed, [firstDay.tasks[0].id]: '2026-11-14T08:00:00Z' };
    const midData = { ...data, completed };
    const midDigest = buildDailyNotificationDigest(plan, midData, firstDay.date);
    expect(midDigest.doneTasks).toBe(1);
    expect(midDigest.remainingTasks).toBe(firstDay.tasks.length - 1);

    const midNotif = buildDailyStatusNotification(plan, midData, firstDay.date);
    expect(midNotif.body).toContain(midDigest.completedSummary);
    expect(midNotif.body).toContain(midDigest.remainingSummary);

    // Mark ALL of today's tasks complete -> 100% done + previews next day's study!
    const allCompleted = Object.fromEntries(firstDay.tasks.map(tk => [tk.id, '2026-11-14T18:00:00Z']));
    const doneData = { ...data, completed: allCompleted };
    const doneDigest = buildDailyNotificationDigest(plan, doneData, firstDay.date);
    expect(doneDigest.allDone).toBe(true);
    expect(doneDigest.remainingTasks).toBe(0);
    expect(doneDigest.nextDayWhatToStudy.length).toBeGreaterThan(3);

    const doneNotif = buildDailyStatusNotification(plan, doneData, firstDay.date);
    expect(doneNotif.title).toContain('আজকের সব পড়া সম্পন্ন');
    expect(doneNotif.body).toContain('পরের দিনের পড়া:');
    expect(buildEveningCheckinNotification(plan, doneData, firstDay.date)).toBeNull();
  });

  it('includes earlier days’ unfinished sessions and builds rich per-session & evening notifications', () => {
    const { data } = loadData();
    const plan = buildPlan(DEFAULT_SETTINGS);
    const secondDay = plan[1];
    const sampleTask = secondDay.tasks[0];

    const taskNotif = buildTaskReminderNotification(plan, data, sampleTask);
    expect(taskNotif.title).toContain('এখন পড়া');
    expect(taskNotif.body).toContain('সময়:');
    expect(taskNotif.body).toContain('আজ কী পড়া:');
    expect(taskNotif.body).toContain('মোট:');
    expect(taskNotif.body).toContain('কমপ্লিট করা বাকি:');

    const eveningNotif = buildEveningCheckinNotification(plan, data, secondDay.date);
    expect(eveningNotif).not.toBeNull();
    expect(eveningNotif?.title).toContain('রাতের রিমাইন্ডার');
    expect(eveningNotif?.body).toContain('আজ কী পড়া:');
    expect(eveningNotif?.body).toContain('বাকি আছে:');

    // English language support
    setLanguage('en');
    const enNotif = buildDailyStatusNotification(plan, data, secondDay.date);
    expect(enNotif.body).toContain("Today's study:");
    expect(enNotif.body).toContain('Total:');
    expect(enNotif.body).toContain('Left to complete:');
  });

  it('lets the student enable & immediately dispatch the full study notification from TodayView and RemindersView', async () => {
    const sentNotifications: { title: string; options?: NotificationOptions }[] = [];
    class MockNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = vi.fn(async () => {
        MockNotification.permission = 'granted';
        return 'granted' as NotificationPermission;
      });
      constructor(title: string, options?: NotificationOptions) {
        sentNotifications.push({ title, options });
      }
    }
    vi.stubGlobal('Notification', MockNotification);

    render(<App />);

    // Click the 1-click enable & send button on TodayView
    const enableBtn = screen.getByRole('button', { name: /রিমাইন্ডার চালু করো/i });
    fireEvent.click(enableBtn);

    await waitFor(() => {
      expect(MockNotification.requestPermission).toHaveBeenCalled();
      expect(sentNotifications.length).toBeGreaterThanOrEqual(1);
    });

    const lastSent = sentNotifications[sentNotifications.length - 1];
    expect(lastSent.title).toContain('আজকের পড়া');
    expect(lastSent.options?.body).toContain('আজ কী পড়া:');
    expect(lastSent.options?.body).toContain('মোট পড়া:');
    expect(lastSent.options?.body).toContain('কমপ্লিট করা লাগবে:');

    // Navigate to RemindersView and verify the live notification preview card renders all 4 fields
    const sidebar = document.querySelector('aside.sidebar') as HTMLElement;
    fireEvent.click(within(sidebar).getByRole('button', { name: /রিমাইন্ডার/i }));
    const previewCard = await screen.findByLabelText('স্টাডি নোটিফিকেশন প্রিভিউ');
    expect(within(previewCard).getByText('আজ কী পড়া')).toBeTruthy();
    expect(within(previewCard).getByText('কতটুকু পড়া (মোট)')).toBeTruthy();
    expect(within(previewCard).getByText('সম্পন্ন হয়েছে')).toBeTruthy();
    expect(within(previewCard).getByText('কতটুকু কমপ্লিট করা লাগবে')).toBeTruthy();
  });

  it('provides handy 1-tap topbar theme/language toggles, "/" search shortcut, and hero quick-start CTA', async () => {
    render(<App />);

    // Hero 1-tap next-session CTA renders right inside welcome-hero
    expect(screen.getByRole('button', { name: /এখন শুরু করো:/i })).toBeTruthy();

    // 1-tap topbar theme toggle flips light <-> dark immediately
    const themeBtn = screen.getByRole('button', { name: 'থিম পরিবর্তন করো' });
    fireEvent.click(themeBtn);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    // Pressing "/" opens the upgraded SearchModal with subject filter pills & quick actions
    fireEvent.keyDown(window, { key: '/' });
    expect(await screen.findByLabelText('অধ্যায় ও রুটিন খুঁজো')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'বিষয় ফিল্টার' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /২৫ মি\. কুইক টাইমার/i })).toBeTruthy();
  });
});
