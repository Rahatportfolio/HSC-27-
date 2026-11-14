import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { addDays, dhakaMinutes, todayKey } from './planner';
import type { AppData, Day } from './planner';

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id); }, []);
  return now;
}
interface TimerState { id: string; duration: number; remaining: number; running: boolean; endAt: number }
const TIMER_KEY = 'hsc27-focus-timer-v1';
const TIMER_DONE_KEY = 'hsc27-focus-done-v1';
const freshTimer = (): TimerState => ({ id: '', duration: 25, remaining: 1500, running: false, endAt: 0 });
const timerId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function parseTimerState(raw: string | null): TimerState {
  try {
    const t = JSON.parse(raw || 'null');
    if (t && [25, 50].includes(t.duration) && Number.isFinite(t.remaining) && t.remaining >= 0 && t.remaining <= t.duration * 60 && typeof t.running === 'boolean' && Number.isFinite(t.endAt)) {
      // A running timer must have a real deadline; endAt=0 used to credit a full session instantly.
      if (t.running && t.endAt <= 0) return freshTimer();
      return { id: typeof t.id === 'string' && t.id ? t.id : (t.running ? `legacy-${t.endAt}` : ''), duration: t.duration, remaining: t.remaining, running: t.running, endAt: t.running ? t.endAt : 0 };
    }
  } catch { /* use a fresh timer */ }
  return freshTimer();
}
const readTimer = (): TimerState => { try { return parseTimerState(localStorage.getItem(TIMER_KEY)); } catch { return freshTimer(); } };
export function useFocusTimer(setData: Dispatch<SetStateAction<AppData>>, notify: (message: string) => void) {
  const [timer, setTimer] = useState<TimerState>(readTimer);
  const [tick, setTick] = useState(Date.now());
  const notifyRef = useRef(notify); notifyRef.current = notify;
  useEffect(() => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch { /* progress storage warning covers persistence */ } }, [timer]);
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === TIMER_KEY) setTimer(parseTimerState(e.newValue)); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(id); }, []);
  const remaining = timer.running ? Math.max(0, Math.ceil((timer.endAt - tick) / 1000)) : timer.remaining;
  useEffect(() => {
    if (!timer.running || timer.endAt > tick) return;
    const finished = timer;
    setTimer({ id: '', duration: finished.duration, remaining: 0, running: false, endAt: 0 });
    let claimed = true;
    try {
      const parsed = JSON.parse(localStorage.getItem(TIMER_DONE_KEY) || '[]');
      const done: string[] = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
      if (finished.id && done.includes(finished.id)) claimed = false;
      else localStorage.setItem(TIMER_DONE_KEY, JSON.stringify([...done, finished.id || `legacy-${finished.endAt}`].slice(-50)));
    } catch { /* if storage is unavailable, still count locally once */ }
    if (!claimed) return;
    setData(d => ({ ...d, focus: { minutes: d.focus.minutes + finished.duration, sessions: d.focus.sessions + 1 } }));
    notifyRef.current(`${finished.duration} মিনিটের ফোকাস শেষ! একটু বিরতি নাও।`);
    if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('ফোকাস শেষ · প্রস্তুতি', { body: 'একটু বিরতি নাও। এরপর পরের ছোট কাজটি শুরু করো।', icon: new URL('icon-192.png', document.baseURI).href }); } catch { /* in-app toast remains */ } }
  }, [tick, timer, setData]);
  const toggle = () => setTimer(t => {
    if (t.running) return { ...t, running: false, remaining: Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)), endAt: 0 };
    const remaining = t.remaining || t.duration * 60;
    const id = t.id && t.remaining > 0 && t.remaining < t.duration * 60 ? t.id : timerId();
    return { id, duration: t.duration, remaining, running: true, endAt: Date.now() + remaining * 1000 };
  });
  const reset = () => setTimer(t => ({ id: '', duration: t.duration, remaining: t.duration * 60, running: false, endAt: 0 }));
  const preset = (duration: number) => setTimer(t => t.running ? t : { id: '', duration, remaining: duration * 60, running: false, endAt: 0 });
  return { ...timer, remaining, toggle, reset, preset };
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
      // Include yesterday so a late-start session that crosses midnight can still remind.
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
