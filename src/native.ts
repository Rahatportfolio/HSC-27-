import { chapterById } from './data';
import { isPersonalTaskComplete } from './personalRoutine';
import {
  actionableReminderPlan,
  buildDailyStatusNotification,
  buildEveningCheckinNotification,
  buildTaskReminderNotification,
  reminderTasksForDay,
  buildTomorrowPreviewNotification,
} from './notifications';
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

/** Two channels: quiet reminders and a loud timer alarm. Android drops a notification
 *  whose channel does not exist yet, so both are created before anything is scheduled. */
export const REMINDER_CHANNEL = 'study-reminders';
export const ALARM_CHANNEL = 'study-timer-alarm';
/** Fixed id so a running session only ever has one pending end-of-session alarm. */
export const TIMER_ALARM_ID = 4127;
const SMALL_ICON = 'ic_stat_icon';

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications')['LocalNotifications'];
let channelsReady: Promise<void> | null = null;
/** Android validates channel importance, so the alarm channel uses HIGH (4), not 5. */
let alarmChannelOk = false;

async function ensureChannels(LocalNotifications: LocalNotificationsPlugin): Promise<void> {
  if (!channelsReady) {
    channelsReady = (async () => {
      let created = false;
      try {
        await LocalNotifications.createChannel({
          id: REMINDER_CHANNEL, name: 'পড়ার রিমাইন্ডার', description: 'স্টাডি সেশন ও রিভিশনের সময়',
          importance: 4, visibility: 1, vibration: true, lights: true,
        });
        created = true;
      } catch { /* Android 7 and older have no channels */ }
      try {
        await LocalNotifications.createChannel({
          id: ALARM_CHANNEL, name: 'টাইমার অ্যালার্ম', description: 'সেশন শেষ হলে বাজবে',
          importance: 4, visibility: 1, vibration: true, lights: true,
        });
        alarmChannelOk = true;
        created = true;
      } catch { /* same */ }
      // Nothing worked (bridge not ready yet) — let the next call try again.
      if (!created) channelsReady = null;
    })();
  }
  return channelsReady;
}

/**
 * Android 14/15/16: the app draws behind the status and navigation bars, so the icon
 * colour has to follow the selected theme or the clock becomes invisible.
 */
export async function setSystemBarsTheme(dark: boolean): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { SystemBars, SystemBarsStyle } = await import('@capacitor/core');
    await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
    return true;
  } catch { return false; }
}

/**
 * Creates the channels without asking for anything. Called once at start-up so the
 * very first timer alarm cannot be dropped for a missing channel.
 */
export async function prepareNativeNotifications(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await ensureChannels(LocalNotifications);
    return true;
  } catch { return false; }
}

export type NativeNotificationStatus = {
  permission: NativePermission;
  /** Exact alarms (Android 12+). 'denied' means the OS may delay a session alarm. */
  exact: 'granted' | 'denied' | 'unavailable';
  channels: boolean;
};

/** What the phone currently allows, so Settings/Reminders can show the truth. */
export async function nativeNotificationStatus(): Promise<NativeNotificationStatus> {
  if (!isNativeApp()) return { permission: 'unavailable', exact: 'unavailable', channels: false };
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.checkPermissions();
    let exact: NativeNotificationStatus['exact'] = 'unavailable';
    try {
      const setting = await LocalNotifications.checkExactNotificationSetting();
      exact = setting.exact_alarm === 'granted' ? 'granted' : 'denied';
    } catch { /* older Android: exact alarms are always allowed */ }
    return {
      permission: permission.display === 'granted' ? 'granted' : permission.display === 'denied' ? 'denied' : 'prompt',
      exact, channels: true,
    };
  } catch {
    return { permission: 'unavailable', exact: 'unavailable', channels: false };
  }
}

/** Ask the OS once (Android 13+ shows the system dialog). */
export async function requestNativeNotifications(): Promise<NativePermission> {
  if (!isNativeApp()) return 'unavailable';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await ensureChannels(LocalNotifications);
    const permission = await LocalNotifications.requestPermissions();
    return permission.display === 'granted' ? 'granted' : permission.display === 'denied' ? 'denied' : 'prompt';
  } catch { return 'unavailable'; }
}

/** Opens the OS screen for "Alarms & reminders" so exact session alarms can fire on time. */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.changeExactNotificationSetting();
    return true;
  } catch { return false; }
}

/** One immediate OS notification (used when a timer or break finishes in the background). */
export async function nativeNotify(title: string, body: string, channelId: string = REMINDER_CHANNEL): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  try {
    await ensureChannels(LocalNotifications);
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return false;
    await LocalNotifications.schedule({ notifications: [{
      id: idFor(`${title}:${body}`), title, body, largeBody: body, channelId,
      schedule: { at: new Date(Date.now() + 400) }, smallIcon: SMALL_ICON,
    }] });
    return true;
  } catch { return false; }
}

/**
 * The session alarm. Scheduled when a countdown starts, so the phone rings at the right
 * second even when the WebView is frozen or the app was swiped away.
 */
export async function scheduleTimerAlarm(endsAt: number, title: string, body: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  if (!Number.isFinite(endsAt) || endsAt <= Date.now()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  try {
    await ensureChannels(LocalNotifications);
    let permission = await LocalNotifications.checkPermissions();
    // Starting a session is the natural moment for the system dialog (Android 13+).
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return false;
    const notifications = [{
      // If the alarm channel could not be created, fall back to the reminder channel so the
      // alarm is never dropped for a missing channel.
      id: TIMER_ALARM_ID, title, body, largeBody: body, channelId: alarmChannelOk ? ALARM_CHANNEL : REMINDER_CHANNEL, smallIcon: SMALL_ICON,
      schedule: { at: new Date(endsAt), allowWhileIdle: true },
    }];
    try {
      await LocalNotifications.schedule({ notifications });
    } catch {
      // Android 12+ can refuse exact alarms; an inexact one still arrives, just later.
      await LocalNotifications.schedule({ notifications: notifications.map(item => ({ ...item, schedule: { at: item.schedule.at, allowWhileIdle: false } })) });
    }
    return true;
  } catch { return false; }
}

export async function cancelTimerAlarm(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: TIMER_ALARM_ID }] });
    return true;
  } catch { return false; }
}

type StudyTimerBridge = {
  start: (options: { title: string; body: string; referenceTime?: number; countdown?: boolean }) => Promise<unknown>;
  enterPictureInPicture?: (options: { title: string; referenceTime: number; countdown: boolean }) => Promise<{ started?: boolean }>;
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
export async function startStudyTimerService(title: string, body: string, clock?: { referenceTime: number; countdown: boolean }): Promise<boolean> {
  const bridge = studyTimerBridge();
  if (!bridge) return false;
  try {
    await bridge.start({ title: title.slice(0, 80), body: body.slice(0, 120), ...clock });
    return true;
  } catch {
    return false;
  }
}

/** Open an Android picture-in-picture clock; unavailable platforms return false. */
export async function openNativeTimerPictureInPicture(title: string, referenceTime: number, countdown: boolean): Promise<boolean> {
  const bridge = studyTimerBridge();
  if (!bridge?.enterPictureInPicture || !Number.isFinite(referenceTime) || referenceTime <= 0) return false;
  try { return (await bridge.enterPictureInPicture({ title: title.slice(0, 120), referenceTime, countdown })).started === true; }
  catch { return false; }
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
// Well below Android's ~500 pending-notification cap; leaves headroom for the
// nightly 9 PM tomorrow-preview on top of briefs, session alerts and check-ins.
const LIMIT = 96;

// Settings, the reminder screen and the app's background effect can all request
// a sync. Serialize every caller so an older slow operation cannot schedule
// obsolete reminders after a newer sync has cancelled them.
let reminderSyncQueue: Promise<unknown> = Promise.resolve();
export function syncNativeReminders(plan: Day[], data: AppData, today: string, options: { requestPermission?: boolean } = {}): Promise<NativeSyncResult> {
  const result = reminderSyncQueue.catch(() => undefined).then(() => performNativeReminderSync(plan, data, today, options));
  reminderSyncQueue = result.catch(() => undefined);
  return result;
}

async function performNativeReminderSync(plan: Day[], data: AppData, today: string, options: { requestPermission?: boolean }): Promise<NativeSyncResult> {
  if (!isNativeApp()) return { scheduled: 0, permission: 'unavailable' };
  plan = actionableReminderPlan(plan, data);
  const { LocalNotifications } = await import('@capacitor/local-notifications');

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && options.requestPermission) permission = await LocalNotifications.requestPermissions();
  const permissionStatus = permission.display === 'granted' ? 'granted' : permission.display === 'denied' ? 'denied' : 'prompt';
  // Cancellation must still happen when notification permission was revoked.
  if (!data.settings.reminderEnabled || permission.display === 'granted') {
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter(item => item.id !== TIMER_ALARM_ID);
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map(item => ({ id: item.id })) });
  }
  // The independently controlled timer alarm is intentionally left untouched.
  if (!data.settings.reminderEnabled || permission.display !== 'granted') return { scheduled: 0, permission: permissionStatus };
  await ensureChannels(LocalNotifications);

  const lastDate = addDays(today, WINDOW_DAYS);
  const now = Date.now() + 60_000;
  const notifications: {
    id: number; title: string; body: string; largeBody?: string; channelId: string;
    schedule: { at: Date; allowWhileIdle: boolean };
  }[] = [];

  for (const day of plan) {
    // A late session from yesterday's plan may actually begin after midnight today.
    // Filter per-task instants below rather than dropping the entire planning day.
    if (day.date > lastDate) break;

    // 1. Morning daily briefing (20 min before first session, clamped >= 5:45 AM): what to study + total hours + remaining work
    const incompleteDayTasks = day.tasks.filter(t => !isPersonalTaskComplete(t, data.completed));
    if (day.date >= today && incompleteDayTasks.length > 0) {
      const firstStart = Math.min(...incompleteDayTasks.map(t => t.startMinute));
      const briefMinute = Math.max(5 * 60 + 45, firstStart - 20);
      const briefAt = instant(day.date, briefMinute);
      if (briefAt > now && briefAt <= instant(lastDate, 24 * 60)) {
        const brief = buildDailyStatusNotification(plan, data, day.date);
        notifications.push({
          id: idFor(`daily-brief:${day.date}`),
          title: brief.title,
          body: brief.body,
          largeBody: brief.body,
          channelId: REMINDER_CHANNEL,
          schedule: { at: new Date(briefAt), allowWhileIdle: true },
        });
      }
    }

    // 2. Per-session reminder with full daily context (today's study, total hours, completed vs remaining)
    for (const task of data.personalRoutine ? reminderTasksForDay(day.tasks) : day.tasks) {
      if (isPersonalTaskComplete(task, data.completed)) continue;
      const start = taskStart(task);
      const at = instant(start.date, start.minute - data.settings.reminderLead);
      if (at <= now || at > instant(lastDate, 24 * 60)) continue;
      const reminder = buildTaskReminderNotification(plan, data, task);
      notifications.push({
        id: idFor(`task:${task.id}`),
        title: reminder.title,
        body: reminder.body,
        largeBody: reminder.body,
        channelId: REMINDER_CHANNEL,
        schedule: { at: new Date(at), allowWhileIdle: true },
      });
    }

    // 3. Evening remaining-study check-in at 8:30 PM when tasks are still incomplete
    if (day.date >= today && incompleteDayTasks.length > 0) {
      const eveAt = instant(day.date, 20 * 60 + 30);
      if (eveAt > now && eveAt <= instant(lastDate, 24 * 60)) {
        const checkin = buildEveningCheckinNotification(plan, data, day.date);
        if (checkin) {
          notifications.push({
            id: idFor(`evening-checkin:${day.date}`),
            title: checkin.title,
            body: checkin.body,
            largeBody: checkin.body,
            channelId: REMINDER_CHANNEL,
            schedule: { at: new Date(eveAt), allowWhileIdle: true },
          });
        }
      }
    }

    // 4. Night-before preview: at 9 PM each day, announce the NEXT day's classes
    if (day.date >= today && day.date < lastDate) {
      const previewAt = instant(day.date, 21 * 60);
      if (previewAt > now) {
        const preview = buildTomorrowPreviewNotification(plan, data, day.date);
        if (preview) {
          notifications.push({
            id: idFor(`tomorrow-preview:${day.date}`),
            title: preview.title,
            body: preview.body,
            largeBody: preview.body,
            channelId: REMINDER_CHANNEL,
            schedule: { at: new Date(previewAt), allowWhileIdle: true },
          });
        }
      }
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
      channelId: REMINDER_CHANNEL,
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
        channelId: REMINDER_CHANNEL,
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
        channelId: REMINDER_CHANNEL,
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
