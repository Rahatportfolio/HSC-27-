import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, SUBJECTS } from './data';
import type { SubjectId } from './data';
import {
  buildDailyStatusNotification,
  buildExamRoutineLine,
  buildEveningCheckinNotification,
  buildTaskReminderNotification,
} from './notifications';
import { addDays, dhakaMinutes, todayKey } from './planner';
import type { AppData, Day, Settings } from './planner';
import type { FontScale, StudyMode, ThemeMode } from './types';

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id); }, []);
  return now;
}

export interface StudyTimerState {
  mode: StudyMode;
  phase: 'focus' | 'short' | 'long' | 'none';
  durationMin: number;
  accumulatedMs: number;
  running: boolean;
  startedAt: number | null;
  subject: SubjectId;
  chapterId: string;
  label: string;
  /** Optional Today task ID linked to this running preset timer. */
  taskId?: string;
  /** Breaks are timed but never counted as study time. */
  logging: boolean;
  focusCount: number;
}
export const TIMER_KEY = 'hsc27-study-timer-v2';
const CLAIM_KEY = 'hsc27-timer-claimed-v2';
const chapterIds = new Set(CHAPTERS.map(chapter => chapter.id));
const subjectIds = new Set(SUBJECTS.map(subject => subject.id));
const modes = new Set<StudyMode>(['stopwatch', 'countdown', 'pomodoro']);
const phases = new Set(['focus', 'short', 'long', 'none']);

export function freshTimerState(settings?: Pick<Settings, 'pomodoroFocus'>): StudyTimerState {
  return {
    mode: 'pomodoro', phase: 'focus', durationMin: settings?.pomodoroFocus ?? 25,
    accumulatedMs: 0, running: false, startedAt: null, subject: 'physics', chapterId: '', label: '', taskId: '', logging: true, focusCount: 0,
  };
}
export function parseStudyTimer(raw: string | null, settings?: Pick<Settings, 'pomodoroFocus'>): StudyTimerState {
  const fresh = freshTimerState(settings);
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return fresh;
    const mode = modes.has(value.mode) ? value.mode as StudyMode : fresh.mode;
    const phase = phases.has(value.phase) ? value.phase as StudyTimerState['phase'] : fresh.phase;
    const durationMin = Number.isSafeInteger(value.durationMin) && value.durationMin >= 1 && value.durationMin <= 720 ? value.durationMin : fresh.durationMin;
    const accumulatedMs = Number.isFinite(value.accumulatedMs) && value.accumulatedMs >= 0 && value.accumulatedMs <= 365 * 86_400_000 ? value.accumulatedMs : 0;
    const running = value.running === true;
    const startedAt = Number.isFinite(value.startedAt) && value.startedAt > 0 && value.startedAt <= Date.now() + 60_000 ? value.startedAt : null;
    if (running && !startedAt) return fresh;
    const subject = typeof value.subject === 'string' && subjectIds.has(value.subject) ? value.subject as SubjectId : fresh.subject;
    const chapterId = typeof value.chapterId === 'string' && chapterIds.has(value.chapterId) ? value.chapterId : '';
    const label = typeof value.label === 'string' && value.label.length <= 120 ? value.label : '';
    const taskId = typeof value.taskId === 'string' && value.taskId.length <= 180 ? value.taskId : '';
    const logging = value.logging !== false;
    const focusCount = Number.isSafeInteger(value.focusCount) && value.focusCount >= 0 && value.focusCount < 100000 ? value.focusCount : 0;
    return { mode, phase, durationMin, accumulatedMs, running, startedAt, subject, chapterId, label, taskId, logging, focusCount };
  } catch {
    return fresh;
  }
}
const readTimer = (settings: Pick<Settings, 'pomodoroFocus'>): StudyTimerState => {
  try { return parseStudyTimer(localStorage.getItem(TIMER_KEY), settings); } catch { return freshTimerState(settings); }
};
function claimCompletion(token: string): boolean {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLAIM_KEY) || '[]');
    const list: string[] = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    if (list.includes(token)) return false;
    localStorage.setItem(CLAIM_KEY, JSON.stringify([...list, token].slice(-80)));
  } catch { /* if storage is unavailable, log once locally */ }
  return true;
}
export interface CompletedSession { minutes: number; subject: SubjectId; chapterId: string; mode: StudyMode; label: string; taskId?: string }
export interface PresetTimerInput {
  subject: SubjectId;
  chapterId?: string;
  durationMin: number;
  label?: string;
  taskId?: string;
}
export interface StudyTimerOptions {
  settings: Settings;
  onComplete: (session: CompletedSession) => void;
  notify: (message: string, type?: 'success' | 'info' | 'error') => void;
}
export function useStudyTimer({ settings, onComplete, notify }: StudyTimerOptions) {
  const [state, setState] = useState<StudyTimerState>(() => readTimer(settings));
  const [tick, setTick] = useState(() => Date.now());
  const notifyRef = useRef(notify); notifyRef.current = notify;
  const doneRef = useRef(onComplete); doneRef.current = onComplete;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(id); }, []);
  useEffect(() => {
    try { localStorage.setItem(TIMER_KEY, JSON.stringify(state)); } catch { /* storage warning is shown elsewhere */ }
  }, [state]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === TIMER_KEY) setState(parseStudyTimer(event.newValue, settingsRef.current)); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const elapsedMs = state.accumulatedMs + (state.running && state.startedAt ? Math.max(0, tick - state.startedAt) : 0);
  const targetMs = state.mode === 'stopwatch' ? 0 : state.durationMin * 60_000;
  const remainingSec = state.mode === 'stopwatch' ? Math.floor(elapsedMs / 1000) : Math.max(0, Math.ceil((targetMs - elapsedMs) / 1000));
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const progress = targetMs ? Math.min(100, elapsedMs / targetMs * 100) : 0;

  // Completion runs once per started session, even across reloads/tabs.
  useEffect(() => {
    if (!state.running || state.mode === 'stopwatch' || elapsedMs < targetMs) return;
    const snapshot = state;
    const token = `${snapshot.mode}:${snapshot.phase}:${snapshot.startedAt}:${snapshot.durationMin}`;
    if (!claimCompletion(token)) { setState(current => ({ ...current, running: false, accumulatedMs: targetMs, startedAt: null })); return; }
    const shouldLog = snapshot.logging && snapshot.phase !== 'short' && snapshot.phase !== 'long';
    if (shouldLog) {
      doneRef.current({ minutes: snapshot.durationMin, subject: snapshot.subject, chapterId: snapshot.chapterId, mode: snapshot.mode, label: snapshot.label, taskId: snapshot.taskId });
    }
    const settingsNow = settingsRef.current;
    if (snapshot.mode === 'pomodoro') {
      if (snapshot.phase === 'focus') {
        const focusCount = snapshot.focusCount + 1;
        const long = focusCount % 4 === 0;
        const nextMinutes = long ? settingsNow.pomodoroLongBreak : settingsNow.pomodoroBreak;
        notifyRef.current(`${snapshot.durationMin} মিনিট ফোকাস শেষ! ${nextMinutes} মিনিটের ${long ? 'লম্বা ' : ''}বিরতি।`, 'success');
        setState(current => ({ ...current, phase: long ? 'long' : 'short', durationMin: nextMinutes, accumulatedMs: 0, running: true, startedAt: Date.now(), logging: false, taskId: '', focusCount }));
      } else {
        notifyRef.current('বিরতি শেষ। পরের ফোকাস সেশনের জন্য তৈরি হও।', 'info');
        setState(current => ({ ...current, phase: 'focus', durationMin: settingsNow.pomodoroFocus, accumulatedMs: 0, running: false, startedAt: null, logging: true }));
      }
      return;
    }
    notifyRef.current(shouldLog ? `${snapshot.durationMin} মিনিটের সেশন সেভ হয়েছে। দারুণ!` : 'বিরতি শেষ! আবার পড়ায় ফেরো।', shouldLog ? 'success' : 'info');
    setState(current => ({ ...current, running: false, accumulatedMs: 0, startedAt: null, taskId: '', logging: true, label: shouldLog ? current.label : '' }));
  }, [elapsedMs, state, targetMs]);

  const start = () => setState(current => {
    if (current.running) return current;
    const atEnd = current.mode !== 'stopwatch' && current.accumulatedMs >= current.durationMin * 60_000;
    return { ...current, running: true, startedAt: Date.now(), accumulatedMs: atEnd ? 0 : current.accumulatedMs, logging: current.logging };
  });
  const pause = () => {
    const now = Date.now();
    setTick(now);
    setState(current => {
      if (!current.running || !current.startedAt) return current;
      const accumulated = current.accumulatedMs + Math.max(1, now - current.startedAt);
      // Let the completion effect save a countdown that expired between ticks.
      if (current.mode !== 'stopwatch' && accumulated >= current.durationMin * 60_000) return current;
      return { ...current, running: false, startedAt: null, accumulatedMs: accumulated };
    });
  };
  // Keep ticking cleanly on visibility return so backgrounded tabs snap immediately to exact wall-clock elapsed time
  useEffect(() => {
    const onVisible = () => setTick(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const reset = () => setState(current => ({ ...current, phase: current.mode === 'pomodoro' ? 'focus' : 'none', durationMin: current.mode === 'pomodoro' && current.phase !== 'focus' ? settingsRef.current.pomodoroFocus : current.durationMin, accumulatedMs: 0, running: false, startedAt: null, label: current.logging ? current.label : '', logging: true, taskId: '' }));
  const setMode = (mode: StudyMode) => setState(current => {
    const minutes = mode === 'pomodoro' ? settingsRef.current.pomodoroFocus : mode === 'countdown' ? 25 : 0;
    return { ...current, mode, phase: mode === 'pomodoro' ? 'focus' : 'none', durationMin: minutes, accumulatedMs: 0, running: false, startedAt: null, logging: true, label: '', taskId: '' };
  });
  const setDuration = (minutes: number) => setState(current => ({ ...current, durationMin: Math.max(1, Math.min(720, Math.round(minutes))), accumulatedMs: 0, running: false, startedAt: null }));
  const setSubject = (subject: SubjectId) => setState(current => ({ ...current, subject, chapterId: '' }));
  const setChapter = (chapterId: string) => setState(current => ({ ...current, chapterId }));
  const setLabel = (label: string) => setState(current => ({ ...current, label: label.slice(0, 120) }));
  const startPreset = (preset: PresetTimerInput) => {
    const mins = Math.max(1, Math.min(720, Math.round(preset.durationMin)));
    setTick(Date.now());
    setState(current => ({
      ...current,
      mode: 'countdown',
      phase: 'none',
      durationMin: mins,
      accumulatedMs: 0,
      running: true,
      startedAt: Date.now(),
      subject: preset.subject,
      chapterId: preset.chapterId && chapterIds.has(preset.chapterId) ? preset.chapterId : '',
      label: (preset.label || '').slice(0, 120),
      taskId: (preset.taskId || '').slice(0, 180),
      logging: true,
    }));
  };
  const finishNow = (): number => {
    const currentElapsed = state.accumulatedMs + (state.running && state.startedAt ? Math.max(0, Date.now() - state.startedAt) : 0);
    const actualMinutes = Math.max(1, Math.round(currentElapsed / 60_000));
    const minutes = Math.min(720, actualMinutes);
    if (currentElapsed >= 15_000 && state.logging) {
      doneRef.current({ minutes, subject: state.subject, chapterId: state.chapterId, mode: state.mode, label: state.label, taskId: state.taskId });
      notifyRef.current(actualMinutes > 720 ? 'সর্বোচ্চ ৭২০ মিনিটের সেশন সেভ হয়েছে; বাকি সময় আলাদা করে যোগ করো।' : `${minutes} মিনিটের সেশন সেভ হয়েছে!`, actualMinutes > 720 ? 'info' : 'success');
    }
    setState(current => ({ ...current, accumulatedMs: 0, running: false, startedAt: null, taskId: '' }));
    return minutes;
  };
  const startBreak = (minutes: number) => setState(current => ({ ...current, mode: 'countdown', phase: 'none', durationMin: minutes, accumulatedMs: 0, running: true, startedAt: Date.now(), logging: false, label: 'বিরতি', taskId: '' }));
  const saveStopwatch = (): number => {
    const currentElapsed = state.accumulatedMs + (state.running && state.startedAt ? Math.max(0, Date.now() - state.startedAt) : 0);
    const actualMinutes = Math.floor(currentElapsed / 60_000);
    const minutes = Math.min(720, actualMinutes);
    if (!minutes) { notifyRef.current('কমপক্ষে ১ মিনিট সময় হলে সেভ করা যাবে।', 'info'); return 0; }
    doneRef.current({ minutes, subject: state.subject, chapterId: state.chapterId, mode: 'stopwatch', label: state.label, taskId: state.taskId });
    setState(current => ({ ...current, accumulatedMs: 0, running: false, startedAt: null, taskId: '' }));
    notifyRef.current(actualMinutes > 720 ? 'সর্বোচ্চ ৭২০ মিনিট সেভ হয়েছে; বাকি সময় আলাদা করে যোগ করো।' : `${minutes} মিনিটের স্টপওয়াচ সেশন সেভ হয়েছে।`, actualMinutes > 720 ? 'info' : 'success');
    return minutes;
  };
  return {
    ...state, elapsedSec, remainingSec, progress, start, pause, reset, setMode, setDuration,
    setSubject, setChapter, setLabel, startPreset, finishNow, startBreak, saveStopwatch,
  };
}

/** Reading size. px sizes are scaled by CSS `zoom` on the main content, so nothing is clipped. */
export function useFontScale(scale: FontScale): void {
  useEffect(() => { document.documentElement.dataset.font = scale; }, [scale]);
}

type WakeLockSentinel = { release: () => Promise<void>; released: boolean; addEventListener?: (type: 'release', listener: () => void) => void };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } };

/**
 * Keeps the screen on while a session runs. Browsers drop the lock when the tab is
 * hidden, so it is re-acquired on the next visible tick — the timer itself is
 * timestamp based and keeps counting either way.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    const nav = navigator as WakeLockNavigator;
    if (!active || !nav.wakeLock) { setHeld(false); return; }
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || lockRef.current && !lockRef.current.released) return;
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) { void lock.release(); return; }
        lockRef.current = lock; setHeld(true);
        lock.addEventListener?.('release', () => { if (!cancelled) setHeld(false); });
      } catch { setHeld(false); }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      const lock = lockRef.current; lockRef.current = null; setHeld(false);
      if (lock && !lock.released) void lock.release().catch(() => undefined);
    };
  }, [active]);
  return held;
}

export function useTheme(theme: ThemeMode): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      // Edge-to-edge phones (Android 14/15/16) need the status bar icons to match.
      void import('./native')
        .then(({ setSystemBarsTheme }) => setSystemBarsTheme(resolved === 'dark'))
        .catch(() => undefined);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/**
 * True when this shell can actually show a notification: the Android app uses the
 * local-notification plugin (the WebView's own Notification API always reports
 * 'denied' inside Capacitor), browsers need the granted permission.
 */
export function canNotify(): boolean {
  if (typeof window !== 'undefined') {
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    try { if (capacitor?.isNativePlatform?.()) return true; } catch { /* treat as web */ }
  }
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export async function showNotification(
  title: string,
  body: string,
  options: { tag?: string; silent?: boolean } = {},
): Promise<void> {
  const tag = options.tag || 'prostuti-study';
  const silent = options.silent === true;
  if (typeof window !== 'undefined') {
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    let native = false;
    try { native = Boolean(capacitor?.isNativePlatform?.()); } catch { native = false; }
    if (native) {
      const { nativeNotify } = await import('./native');
      if (await nativeNotify(title, body)) return;
      throw new Error('নোটিফিকেশন পাঠানো যায়নি।');
    }
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') throw new Error('নোটিফিকেশনের অনুমতি নেই।');
  const icon = new URL('icon-192.png', document.baseURI).href;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active) {
      await registration.showNotification(title, { body, icon, badge: icon, tag, silent });
      return;
    }
  }
  new Notification(title, { body, icon, tag, silent });
}

/**
 * Keeps a single OS notification slot (`prostuti-daily-progress`) updated with today's
 * subjects/chapters, total hours, completed progress, and exact remaining work to complete.
 */
export async function syncDailyProgressNotification(plan: Day[], data: AppData, date: string, silent = true): Promise<boolean> {
  if (!canNotify()) return false;
  try {
    const base = buildDailyStatusNotification(plan, data, date);
    const examLine = buildExamRoutineLine(data, date);
    const payload = examLine ? { title: base.title, body: `${base.body}\n${examLine}` } : base;
    await showNotification(payload.title, payload.body, { tag: 'prostuti-daily-progress', silent });
    return true;
  } catch {
    return false;
  }
}
/**
 * A finished session is easy to miss when the phone is locked or the app is in the
 * background, so the completion also goes out as an OS notification. Native devices
 * use the local-notification plugin; browsers use the service worker.
 */
export async function notifySessionDone(title: string, body: string): Promise<boolean> {
  try {
    const { nativeNotify, isNativeApp } = await import('./native');
    if (isNativeApp() && await nativeNotify(title, body)) return true;
  } catch { /* fall through to the web notification */ }
  try { await showNotification(title, body, { tag: 'prostuti-session-done' }); return true; } catch { return false; }
}

/** Updates a silent, single-slot OS notification (`prostuti-live-timer`) so the top status tray shows live elapsed/remaining time. */
export async function syncLiveTimerNotification(title: string, body: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const icon = new URL('icon-192.png', document.baseURI).href;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) {
        await reg.showNotification(title, { body, icon, badge: icon, tag: 'prostuti-live-timer', silent: true });
        return;
      }
    }
    new Notification(title, { body, icon, tag: 'prostuti-live-timer', silent: true });
  } catch { /* ignore if unsupported */ }
}

export async function clearLiveTimerNotification(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const list = await reg?.getNotifications({ tag: 'prostuti-live-timer' });
    list?.forEach(n => n.close());
  } catch { /* ignore */ }
}

export function useReminders(plan: Day[], data: AppData, enabled: boolean, onOpen: () => void) {
  const latest = useRef({ plan, data, enabled, onOpen }); latest.current = { plan, data, enabled, onOpen };
  useEffect(() => {
    const check = async () => {
      const { plan, data, enabled, onOpen } = latest.current;
      if (!enabled || !canNotify()) return;
      const date = todayKey(), minute = dhakaMinutes();
      const nowMs = Date.parse(`${date}T00:00:00Z`) + minute * 60000;

      // 1. Daily study briefing (once per day after 05:30 AM Dhaka time): what to study, total study, and remaining to complete
      const briefKey = 'hsc27-daily-brief-v1';
      try {
        if (minute >= 5 * 60 + 30 && localStorage.getItem(briefKey) !== date) {
          const brief = buildDailyStatusNotification(plan, data, date);
          await showNotification(brief.title, brief.body, { tag: 'prostuti-daily-progress' });
          localStorage.setItem(briefKey, date);
        }
      } catch { /* ignore storage/permission errors */ }

      // 2. Per-session upcoming reminder with session time, today's chapters & remaining work to complete
      let sent: string[] = [];
      try { const v = JSON.parse(localStorage.getItem('hsc27-notified-v1') || '[]'); if (Array.isArray(v)) sent = v.filter(x => typeof x === 'string').slice(-500); } catch { /* empty history */ }
      const candidates = plan.filter(d => d.date >= addDays(date, -1) && d.date <= date).flatMap(d => d.tasks);
      for (const task of candidates) {
        const startMs = Date.parse(`${task.date}T00:00:00Z`) + task.startMinute * 60000;
        const due = startMs - data.settings.reminderLead * 60000;
        const key = `${task.date}:${task.startMinute}:${task.id}`;
        if (data.completed[task.id] || nowMs < due || nowMs >= startMs + 120000 || sent.includes(key)) continue;
        try {
          const reminder = buildTaskReminderNotification(plan, data, task);
          await showNotification(reminder.title, reminder.body, { tag: `prostuti-task-${task.id}` });
          sent.push(key);
          try { localStorage.setItem('hsc27-notified-v1', JSON.stringify(sent.slice(-500))); } catch { /* notification already shown */ }
          onOpen();
        } catch { /* permission may have been revoked */ }
      }

      // 3. Evening remaining-work check-in (once per evening after 8:00 PM Dhaka time if work remains)
      const eveKey = 'hsc27-evening-checkin-v1';
      try {
        if (minute >= 20 * 60 && localStorage.getItem(eveKey) !== date) {
          const checkin = buildEveningCheckinNotification(plan, data, date);
          if (checkin) {
            await showNotification(checkin.title, checkin.body, { tag: 'prostuti-evening-checkin' });
          }
          localStorage.setItem(eveKey, date);
        }
      } catch { /* ignore */ }
    };
    void check(); const id = setInterval(() => void check(), 15000); return () => clearInterval(id);
  }, []);
}
/** One gentle OS reminder per day when revision cards are due. */
export function useRevisionReminder(_data: AppData, enabled: boolean, today: string, dueCount: number): void {
  const ref = useRef({ enabled, today, dueCount }); ref.current = { enabled, today, dueCount };
  useEffect(() => {
    const check = async () => {
      const { enabled, today, dueCount } = ref.current;
      if (!enabled || dueCount === 0 || !canNotify()) return;
      const key = 'hsc27-revision-notified-v2';
      try {
        if (localStorage.getItem(key) === today) return;
        await showNotification('রিভিশন সময় হয়েছে · প্রস্তুতি', `${dueCount}টি অধ্যায়ের রিভিশন আজ বা আগেই দরকার।`);
        localStorage.setItem(key, today);
      } catch { /* permission may have been revoked */ }
    };
    void check();
  }, [dueCount, enabled, today]);
}
