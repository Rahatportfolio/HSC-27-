import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { dhakaMinutes, todayKey } from './planner';
import type { AppData, Day } from './planner';

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id); }, []);
  return now;
}
interface TimerState { duration: number; remaining: number; running: boolean; endAt: number }
const TIMER_KEY = 'hsc27-focus-timer-v1';
const readTimer = (): TimerState => {
  try { const t = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null'); if (t && [25, 50].includes(t.duration) && Number.isFinite(t.remaining) && t.remaining >= 0 && t.remaining <= t.duration * 60 && typeof t.running === 'boolean' && Number.isFinite(t.endAt)) return t; } catch { /* use a fresh timer */ }
  return { duration: 25, remaining: 1500, running: false, endAt: 0 };
};
export function useFocusTimer(setData: Dispatch<SetStateAction<AppData>>, notify: (message: string) => void) {
  const [timer, setTimer] = useState<TimerState>(readTimer);
  const [tick, setTick] = useState(Date.now());
  const notifyRef = useRef(notify); notifyRef.current = notify;
  useEffect(() => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch { /* progress storage warning covers persistence */ } }, [timer]);
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(id); }, []);
  const remaining = timer.running ? Math.max(0, Math.ceil((timer.endAt - tick) / 1000)) : timer.remaining;
  useEffect(() => {
    if (!timer.running || timer.endAt > tick) return;
    setTimer({ duration: timer.duration, remaining: 0, running: false, endAt: 0 });
    setData(d => ({ ...d, focus: { minutes: d.focus.minutes + timer.duration, sessions: d.focus.sessions + 1 } }));
    notifyRef.current(`${timer.duration} মিনিটের ফোকাস শেষ! একটু বিরতি নাও।`);
    if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('ফোকাস শেষ · প্রস্তুতি', { body: 'একটু বিরতি নাও। এরপর পরের ছোট কাজটি শুরু করো।', icon: new URL('icon-192.png', document.baseURI).href }); } catch { /* in-app toast remains */ } }
  }, [tick, timer, setData]);
  const toggle = () => setTimer(t => t.running ? { ...t, running: false, remaining: Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)), endAt: 0 }
    : { ...t, running: true, remaining: t.remaining || t.duration * 60, endAt: Date.now() + (t.remaining || t.duration * 60) * 1000 });
  const reset = () => setTimer(t => ({ duration: t.duration, remaining: t.duration * 60, running: false, endAt: 0 }));
  const preset = (duration: number) => setTimer(t => t.running ? t : { duration, remaining: duration * 60, running: false, endAt: 0 });
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
      let sent: string[] = [];
      try { const v = JSON.parse(localStorage.getItem('hsc27-notified-v1') || '[]'); if (Array.isArray(v)) sent = v.filter(x => typeof x === 'string').slice(-500); } catch { /* empty history */ }
      for (const task of plan.find(d => d.date === date)?.tasks || []) {
        const due = task.startMinute - data.settings.reminderLead;
        const key = `${date}:${task.startMinute}:${task.id}`;
        if (data.completed[task.id] || minute < due || minute >= due + 2 || sent.includes(key)) continue;
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
