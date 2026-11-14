import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, SUBJECTS } from './data';
import type { SubjectId } from './data';
import { addDays, dhakaMinutes, todayKey } from './planner';
import type { AppData, Day, Settings } from './planner';
import type { StudyMode, ThemeMode } from './types';

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
    accumulatedMs: 0, running: false, startedAt: null, subject: 'physics', chapterId: '', label: '', logging: true, focusCount: 0,
  };
}
export function parseStudyTimer(raw: string | null, settings?: Pick<Settings, 'pomodoroFocus'>): StudyTimerState {
  const fresh = freshTimerState(settings);
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return fresh;
    const mode = modes.has(value.mode) ? value.mode as StudyMode : fresh.mode;
    const phase = phases.has(value.phase) ? value.phase as StudyTimerState['phase'] : fresh.phase;
    const durationMin = Number.isSafeInteger(value.durationMin) && value.durationMin >= 1 && value.durationMin <= 180 ? value.durationMin : fresh.durationMin;
    const accumulatedMs = Number.isFinite(value.accumulatedMs) && value.accumulatedMs >= 0 && value.accumulatedMs <= 86_400_000 ? value.accumulatedMs : 0;
    const running = value.running === true;
    const startedAt = Number.isFinite(value.startedAt) && value.startedAt > 0 && value.startedAt <= Date.now() + 60_000 ? value.startedAt : null;
    if (running && !startedAt) return fresh;
    const subject = typeof value.subject === 'string' && subjectIds.has(value.subject) ? value.subject as SubjectId : fresh.subject;
    const chapterId = typeof value.chapterId === 'string' && chapterIds.has(value.chapterId) ? value.chapterId : '';
    const label = typeof value.label === 'string' && value.label.length <= 120 ? value.label : '';
    const logging = value.logging !== false;
    const focusCount = Number.isSafeInteger(value.focusCount) && value.focusCount >= 0 && value.focusCount < 100000 ? value.focusCount : 0;
    return { mode, phase, durationMin, accumulatedMs, running, startedAt, subject, chapterId, label, logging, focusCount };
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
export interface CompletedSession { minutes: number; subject: SubjectId; chapterId: string; mode: StudyMode; label: string }
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
      doneRef.current({ minutes: snapshot.durationMin, subject: snapshot.subject, chapterId: snapshot.chapterId, mode: snapshot.mode, label: snapshot.label });
    }
    const settingsNow = settingsRef.current;
    if (snapshot.mode === 'pomodoro') {
      if (snapshot.phase === 'focus') {
        const focusCount = snapshot.focusCount + 1;
        const long = focusCount % 4 === 0;
        const nextMinutes = long ? settingsNow.pomodoroLongBreak : settingsNow.pomodoroBreak;
        notifyRef.current(`${snapshot.durationMin} মিনিট ফোকাস শেষ! ${nextMinutes} মিনিটের ${long ? 'লম্বা ' : ''}বিরতি।`, 'success');
        setState(current => ({ ...current, phase: long ? 'long' : 'short', durationMin: nextMinutes, accumulatedMs: 0, running: true, startedAt: Date.now(), logging: false, focusCount }));
      } else {
        notifyRef.current('বিরতি শেষ। পরের ফোকাস সেশনের জন্য তৈরি হও।', 'info');
        setState(current => ({ ...current, phase: 'focus', durationMin: settingsNow.pomodoroFocus, accumulatedMs: 0, running: false, startedAt: null, logging: true }));
      }
      return;
    }
    notifyRef.current(shouldLog ? `${snapshot.durationMin} মিনিটের সেশন সেভ হয়েছে। দারুণ!` : 'বিরতি শেষ! আবার পড়ায় ফেরো।', shouldLog ? 'success' : 'info');
    setState(current => ({ ...current, running: false, accumulatedMs: current.durationMin * 60_000, startedAt: null }));
  }, [elapsedMs, state, targetMs]);

  const start = () => setState(current => {
    if (current.running) return current;
    const atEnd = current.mode !== 'stopwatch' && current.accumulatedMs >= current.durationMin * 60_000;
    return { ...current, running: true, startedAt: Date.now(), accumulatedMs: atEnd ? 0 : current.accumulatedMs, logging: current.mode === 'pomodoro' ? current.logging : true };
  });
  const pause = () => setState(current => {
    if (!current.running || !current.startedAt) return current;
    const accumulated = current.accumulatedMs + Math.max(0, Date.now() - current.startedAt);
    const capped = current.mode === 'stopwatch' ? accumulated : Math.min(accumulated, current.durationMin * 60_000);
    return { ...current, running: false, startedAt: null, accumulatedMs: capped };
  });
  const reset = () => setState(current => ({ ...current, accumulatedMs: 0, running: false, startedAt: null, logging: true }));
  const setMode = (mode: StudyMode) => setState(current => {
    const minutes = mode === 'pomodoro' ? settingsRef.current.pomodoroFocus : mode === 'countdown' ? 25 : 0;
    return { ...current, mode, phase: mode === 'pomodoro' ? 'focus' : 'none', durationMin: minutes, accumulatedMs: 0, running: false, startedAt: null, logging: mode !== 'pomodoro', label: '' };
  });
  const setDuration = (minutes: number) => setState(current => ({ ...current, durationMin: Math.max(1, Math.min(180, Math.round(minutes))), accumulatedMs: 0, running: false, startedAt: null }));
  const setSubject = (subject: SubjectId) => setState(current => ({ ...current, subject, chapterId: '' }));
  const setChapter = (chapterId: string) => setState(current => ({ ...current, chapterId }));
  const setLabel = (label: string) => setState(current => ({ ...current, label: label.slice(0, 120) }));
  const startBreak = (minutes: number) => setState(current => ({ ...current, mode: 'countdown', phase: 'none', durationMin: minutes, accumulatedMs: 0, running: true, startedAt: Date.now(), logging: false, label: 'বিরতি' }));
  const saveStopwatch = (): number => {
    const minutes = Math.floor(elapsedMs / 60_000);
    if (!minutes) { notifyRef.current('কমপক্ষে ১ মিনিট সময় হলে সেভ করা যাবে।', 'info'); return 0; }
    doneRef.current({ minutes, subject: state.subject, chapterId: state.chapterId, mode: 'stopwatch', label: state.label });
    setState(current => ({ ...current, accumulatedMs: 0, running: false, startedAt: null }));
    notifyRef.current(`${minutes} মিনিটের স্টপওয়াচ সেশন সেভ হয়েছে।`, 'success');
    return minutes;
  };
  return {
    ...state, elapsedSec, remainingSec, progress, start, pause, reset, setMode, setDuration,
    setSubject, setChapter, setLabel, startBreak, saveStopwatch,
  };
}

export function useTheme(theme: ThemeMode): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme; };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export async function showNotification(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') throw new Error('নোটিফিকেশনের অনুমতি নেই।');
  const icon = new URL('icon-192.png', document.baseURI).href;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active) { await registration.showNotification(title, { body, icon, badge: icon, tag: 'prostuti-study' }); return; }
  }
  new Notification(title, { body, icon });
}
export function useReminders(plan: Day[], data: AppData, enabled: boolean, onOpen: () => void) {
  const latest = useRef({ plan, data, enabled, onOpen }); latest.current = { plan, data, enabled, onOpen };
  useEffect(() => {
    const check = async () => {
      const { plan, data, enabled, onOpen } = latest.current;
      if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
      const date = todayKey(), minute = dhakaMinutes();
      const nowMs = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
      let sent: string[] = [];
      try { const v = JSON.parse(localStorage.getItem('hsc27-notified-v1') || '[]'); if (Array.isArray(v)) sent = v.filter(x => typeof x === 'string').slice(-500); } catch { /* empty history */ }
      const candidates = plan.filter(d => d.date >= addDays(date, -1) && d.date <= date).flatMap(d => d.tasks);
      for (const task of candidates) {
        const startMs = Date.parse(`${task.date}T00:00:00Z`) + task.startMinute * 60000;
        const due = startMs - data.settings.reminderLead * 60000;
        const key = `${task.date}:${task.startMinute}:${task.id}`;
        if (data.completed[task.id] || nowMs < due || nowMs >= startMs + 120000 || sent.includes(key)) continue;
        try {
          await showNotification('পড়ার সময় হচ্ছে · প্রস্তুতি', task.title);
          sent.push(key);
          try { localStorage.setItem('hsc27-notified-v1', JSON.stringify(sent.slice(-500))); } catch { /* notification already shown */ }
          onOpen();
        } catch { /* permission may have been revoked */ }
      }
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
      if (!enabled || dueCount === 0 || !('Notification' in window) || Notification.permission !== 'granted') return;
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
