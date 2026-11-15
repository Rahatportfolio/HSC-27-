import { chapterById, subjectById } from './data';
import type { AppData, Day } from './planner';
import { addDays, taskStart } from './planner';

/**
 * Native-only helpers. The web build never imports the notification plugin:
 * it is loaded dynamically and only after Capacitor reports an Android/iOS shell.
 */
export type NativePermission = 'granted' | 'denied' | 'prompt' | 'unavailable';
export type NativeSyncResult = { scheduled: number; permission: NativePermission };

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try { return Boolean(capacitor?.isNativePlatform?.()); } catch { return false; }
}

/** Stable 31-bit notification id so re-syncing replaces instead of duplicating. */
function idFor(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647 || 1;
}

/** Bangladesh has no daylight saving time, so a fixed +06:00 offset is exact. */
function instant(date: string, minute: number): number {
  return Date.parse(`${date}T00:00:00+06:00`) + minute * 60000;
}

/** One immediate OS notification (used when a timer or break finishes in the background). */
export async function nativeNotify(title: string, body: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return false;
    await LocalNotifications.schedule({ notifications: [{
      id: idFor(`${title}:${body}`) , title, body, channelId: 'study-reminders',
      schedule: { at: new Date(Date.now() + 400) }, smallIcon: 'ic_stat_icon_config_sample',
    }] });
    return true;
  } catch { return false; }
}

type StudyTimerBridge = {
  start: (options: { title: string; body: string }) => Promise<unknown>;
  stop: () => Promise<unknown>;
};

function studyTimerBridge(): StudyTimerBridge | null {
  if (!isNativeApp()) return null;
  const capacitor = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const plugin = capacitor?.Plugins?.StudyTimer as StudyTimerBridge | undefined;
  return plugin && typeof plugin.start === 'function' ? plugin : null;
}

/**
 * Android foreground service: keeps the WebView (and the session) alive while the
 * student is in another app, with an ongoing notification instead of a silent kill.
 * The web build simply returns false — nothing to fake.
 */
export async function startStudyTimerService(title: string, body: string): Promise<boolean> {
  const bridge = studyTimerBridge();
  if (!bridge) return false;
  try {
    await bridge.start({ title: title.slice(0, 80), body: body.slice(0, 120) });
    return true;
  } catch {
    return false;
  }
}

export async function stopStudyTimerService(): Promise<boolean> {
  const bridge = studyTimerBridge();
  if (!bridge) return false;
  try {
    await bridge.stop();
    return true;
  } catch {
    return false;
  }
}

const WINDOW_DAYS = 14;
const LIMIT = 64;

export async function syncNativeReminders(plan: Day[], data: AppData, today: string, options: { requestPermission?: boolean } = {}): Promise<NativeSyncResult> {
  if (!isNativeApp()) return { scheduled: 0, permission: 'unavailable' };
  const { LocalNotifications } = await import('@capacitor/local-notifications');

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && options.requestPermission) permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') {
    return { scheduled: 0, permission: permission.display === 'denied' ? 'denied' : 'prompt' };
  }

  try {
    await LocalNotifications.createChannel({ id: 'study-reminders', name: 'পড়ার রিমাইন্ডার', description: 'স্টাডি সেশন ও রিভিশনের সময়', importance: 4, visibility: 1, vibration: true });
  } catch {
    // Channels exist on Android 8+ only; other platforms ignore this step.
  }

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) });
  }

  const lastDate = addDays(today, WINDOW_DAYS);
  const now = Date.now() + 60_000;
  const notifications: {
    id: number; title: string; body: string; channelId: string;
    schedule: { at: Date; allowWhileIdle: boolean };
  }[] = [];

  for (const day of plan) {
    if (day.date < today) continue;
    if (day.date > lastDate) break;
    for (const task of day.tasks) {
      if (data.completed[task.id]) continue;
      const start = taskStart(task);
      const at = instant(start.date, start.minute - data.settings.reminderLead);
      if (at <= now || at > instant(lastDate, 24 * 60)) continue;
      const subject = subjectById[task.subject].name;
      const chapters = task.chapterIds.map(id => chapterById[id]?.title).filter(Boolean).slice(0, 2).join(' · ');
      notifications.push({
        id: idFor(`task:${task.id}`),
        title: `${subject} · পড়ার সময়`,
        body: chapters || task.title,
        channelId: 'study-reminders',
        schedule: { at: new Date(at), allowWhileIdle: true },
      });
    }
  }

  for (const item of data.revisions) {
    if (item.completedAt) continue;
    if (item.dueDate < today || item.dueDate > lastDate) continue;
    const at = instant(item.dueDate, 8 * 60);
    if (at <= now) continue;
    notifications.push({
      id: idFor(`revision:${item.id}`),
      title: 'রিভিশন দিন',
      body: `${chapterById[item.chapterId]?.title || 'অধ্যায়'} · ${item.interval} দিন পরের রিভিশন`,
      channelId: 'study-reminders',
      schedule: { at: new Date(at), allowWhileIdle: true },
    });
  }

  for (const item of data.importantDates) {
    if (!item.notify) continue;
    if (item.date >= today && item.date <= lastDate) {
      const at = instant(item.date, 9 * 60);
      if (at > now) notifications.push({
        id: idFor(`date-day:${item.id}`),
        title: 'গুরুত্বপূর্ণ তারিখ',
        body: `${item.title}${item.note ? ` · ${item.note}` : ''}`,
        channelId: 'study-reminders',
        schedule: { at: new Date(at), allowWhileIdle: true },
      });
    }
    const eve = addDays(item.date, -1);
    if (eve >= today && eve <= lastDate) {
      const at = instant(eve, 20 * 60);
      if (at > now) notifications.push({
        id: idFor(`date-eve:${item.id}`),
        title: 'আগামীকাল গুরুত্বপূর্ণ তারিখ',
        body: `${item.title} · ${item.date}`,
        channelId: 'study-reminders',
        schedule: { at: new Date(at), allowWhileIdle: true },
      });
    }
  }

  const chosen = notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime()).slice(0, LIMIT);
  if (chosen.length) {
    try {
      await LocalNotifications.schedule({ notifications: chosen });
    } catch {
      // Android 14+ can deny exact alarms unless the user grants "Alarms & reminders".
      // Re-schedule as inexact alarms so the reminder still arrives (possibly a few minutes late).
      await LocalNotifications.schedule({ notifications: chosen.map(item => ({ ...item, schedule: { at: item.schedule.at, allowWhileIdle: false } })) });
    }
  }
  return { scheduled: chosen.length, permission: 'granted' };
}
