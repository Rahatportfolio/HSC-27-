import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bell, BookOpen, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, ClipboardCheck, Command, FolderOpen, LayoutDashboard, LibraryBig, Menu, Moon, NotebookPen, Pause, PenLine, PictureInPicture2, Play, RotateCcw, Search, Settings as SettingsIcon, ShieldCheck, Sprout, Sun, Timer, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SUBJECTS, chapterById, subjectById } from './data';
import type { Chapter, SubjectId } from './data';
import { applyDayOverrides, applyRoutine, bn, buildPlan, diffDays, formatDate, isValidDate, todayKey } from './planner';
import type { AppData } from './planner';
import { loadData, parseBackup, saveData, SAVED_AT_KEY } from './storage';
import { persistToDatabase, restoreFromDatabase } from './db';
import { STORAGE_KEY } from './planner';
import { exportCalendar } from './exports';
import { canNotify, clearLiveTimerNotification, notifySessionDone, showNotification, syncDailyProgressNotification, syncLiveTimerNotification, useFontScale, useNow, useReminders, useRevisionReminder, useStudyTimer, useTheme, useWakeLock } from './hooks';
import type { PresetTimerInput } from './hooks';
import { cancelTimerAlarm, isNativeApp, nativeNotify, prepareNativeNotifications, requestNativeNotifications, scheduleTimerAlarm, startStudyTimerService, stopStudyTimerService, syncNativeReminders } from './native';
import { buildDailyNotificationDigest, buildDailyStatusNotification } from './notifications';
import { ensureRevisions, revisionDueCount } from './revision';
import { addStudySession, autoCarryover, setTaskCompletion } from './study';
import { PlannerContext } from './context';
import type { ConfirmRequest, View } from './context';
import { Modal } from './components';
import { setLanguage, t } from './i18n';
import { ChapterModal, ExamModal, MistakeModal, SearchModal } from './modals';
import TodayView from './views/Today';
import CalendarView from './views/Calendar';
import SyllabusView from './views/Syllabus';
import RevisionView from './views/Revision';
import TimerView from './views/Timer';
import PracticeView from './views/Practice';
import ExamsView from './views/Exams';
import AnalyticsView from './views/Analytics';
import LibraryView from './views/Library';
import RemindersView from './views/Reminders';
import SettingsView from './views/Settings';

type NavItem = { id: View; label: string; labelEn: string; short: string; shortEn: string; icon: LucideIcon };
const NAV_GROUPS: { label: string; labelEn: string; items: NavItem[] }[] = [
  { label: 'তোমার পথচলা', labelEn: 'Your journey', items: [
    { id: 'today' as const, label: 'আজকের পড়া', labelEn: "Today's study", short: 'আজ', shortEn: 'Today', icon: LayoutDashboard },
    { id: 'calendar' as const, label: 'রুটিন ও ক্যালেন্ডার', labelEn: 'Routine & calendar', short: 'রুটিন', shortEn: 'Routine', icon: CalendarDays },
    { id: 'syllabus' as const, label: 'সিলেবাস ও ক্লাস', labelEn: 'Syllabus & classes', short: 'সিলেবাস', shortEn: 'Classes', icon: LibraryBig },
    { id: 'revision' as const, label: 'স্মার্ট রিভিশন', labelEn: 'Smart revision', short: 'রিভিশন', shortEn: 'Revision', icon: RotateCcw },
  ] },
  { label: 'অনুশীলন ও মূল্যায়ন', labelEn: 'Practice & review', items: [
    { id: 'timer' as const, label: 'স্টাডি টাইমার', labelEn: 'Study timer', short: 'টাইমার', shortEn: 'Timer', icon: Timer },
    { id: 'practice' as const, label: 'MCQ ও CQ অনুশীলন', labelEn: 'MCQ & CQ practice', short: 'অনুশীলন', shortEn: 'Practice', icon: PenLine },
    { id: 'exams' as const, label: 'পরীক্ষা ও GPA', labelEn: 'Exams & GPA', short: 'পরীক্ষা', shortEn: 'Exams', icon: ClipboardCheck },
    { id: 'analytics' as const, label: 'বিশ্লেষণ ও রিভিউ', labelEn: 'Analytics & review', short: 'বিশ্লেষণ', shortEn: 'Analytics', icon: ChartNoAxesCombined },
  ] },
  { label: 'সংগ্রহ ও সহায়তা', labelEn: 'Library & help', items: [
    { id: 'library' as const, label: 'লাইব্রেরি', labelEn: 'Library', short: 'লাইব্রেরি', shortEn: 'Library', icon: FolderOpen },
    { id: 'reminders' as const, label: 'রিমাইন্ডার', labelEn: 'Reminders', short: 'রিমাইন্ডার', shortEn: 'Reminders', icon: Bell },
  ] },
];
const NAV: NavItem[] = NAV_GROUPS.flatMap(group => group.items);
const viewFromHash = (): View => { const h = window.location.hash.slice(1); return [...NAV.map(n => n.id), 'settings'].includes(h) ? h as View : 'today'; };
type OpenModal = { type: 'chapter'; chapter: Chapter } | { type: 'exam'; paperId: string } | { type: 'mistake'; subject: SubjectId; text: string } | { type: 'search' } | null;

export default function App() {
  const [initial] = useState(loadData);
  const [data, setData] = useState<AppData>(initial.data);
  setLanguage(data.settings.language);
  const [storageOk, setStorageOk] = useState(true);
  const [view, setView] = useState<View>(viewFromHash);
  const now = useNow(); const today = todayKey(now);
  const [selectedDate, setSelectedDateState] = useState(today);
  const setSelectedDate = useCallback((date: string) => { if (isValidDate(date)) setSelectedDateState(date); }, []);
  const [dbReady, setDbReady] = useState(() => !isNativeApp());
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<OpenModal>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; id: number } | null>(initial.warning ? { message: initial.warning, type: 'info', id: 0 } : null);
  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => setToast({ message, type, id: Date.now() }), []);
  const basePlan = useMemo(() => buildPlan(data.settings), [data.settings]);
  const planWithRoutine = useMemo(() => applyRoutine(basePlan, data.routineBlocks), [basePlan, data.routineBlocks]);
  const plan = useMemo(() => applyDayOverrides(planWithRoutine, data.dayOverrides, data.settings), [planWithRoutine, data.dayOverrides, data.settings]);
  const timer = useStudyTimer({
    settings: data.settings,
    notify,
    onComplete: session => {
      let updatedSnapshot: AppData | null = null;
      setData(d => {
        const next = addStudySession(d, { minutes: session.minutes, subject: session.subject, chapterId: session.chapterId || undefined, mode: session.mode, label: session.label || undefined });
        if (session.taskId && !next.completed[session.taskId]) {
          updatedSnapshot = setTaskCompletion(next, [session.taskId], true);
          return updatedSnapshot;
        }
        updatedSnapshot = next;
        return next;
      });
      void clearLiveTimerNotification();
      const snapshot = updatedSnapshot ?? data;
      const digest = buildDailyNotificationDigest(plan, snapshot, today);
      const doneTitle = digest.allDone && digest.totalTasks > 0
        ? t(`🎉 সেশন শেষ (${bn(session.minutes)} মি.) · আজকের সব পড়া কমপ্লিট!`, `🎉 Session done (${session.minutes}m) · All study completed!`)
        : t(`✅ সেশন শেষ (${bn(session.minutes)} মি.) · বাকি: ${digest.remainingSummary}`, `✅ Session done (${session.minutes}m) · Left: ${digest.remainingSummary}`);
      const doneBody = `${t('আজ কী পড়া', 'Today')}: ${digest.whatToStudy}\n${t('সম্পন্ন', 'Completed')}: ${digest.completedSummary} · ${t('কমপ্লিট করা লাগবে', 'Remaining')}: ${digest.remainingSummary}`;
      void notifySessionDone(doneTitle, doneBody);
    },
  });
  const screenAwake = useWakeLock(timer.running && timer.logging);
  const [serviceRunning, setServiceRunning] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Global background timer sync: Android foreground service + OS notification tray + tab title + MediaSession
  const formatClock = useCallback((sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (v: number) => bn(String(v).padStart(2, '0'));
    return h ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }, []);

  const timerTitleText = useMemo(() => {
    const ch = timer.chapterId ? chapterById[timer.chapterId]?.title : '';
    return ch || timer.label || subjectById[timer.subject]?.name || 'স্টাডি টাইমার';
  }, [timer.chapterId, timer.label, timer.subject]);

  useEffect(() => {
    let alive = true;
    const subName = subjectById[timer.subject]?.name ?? '';
    if (timer.running) {
      void startStudyTimerService(
        `${subName} · ${timerTitleText}`,
        'টাইমার ব্যাকগ্রাউন্ডে চলছে — অ্যাপ থেকে বের হলেও সময় গণনা চালু থাকবে।',
      ).then(started => { if (alive) setServiceRunning(started); });
      if (timer.mode !== 'stopwatch' && timer.remainingSec > 0) {
        const digest = buildDailyNotificationDigest(plan, data, today);
        void scheduleTimerAlarm(
          Date.now() + timer.remainingSec * 1000,
          `${subName} · সেশন শেষ!`,
          `${timerTitleText} — সময় শেষ। আজ কী পড়া: ${digest.whatToStudy} · কমপ্লিট করা বাকি: ${digest.remainingSummary}`,
        );
      }
    } else {
      setServiceRunning(false);
      void stopStudyTimerService();
      void cancelTimerAlarm();
      if (timer.elapsedSec === 0) void clearLiveTimerNotification();
    }
    return () => { alive = false; };
  }, [timer.running, timer.subject, timerTitleText, timer.mode]);

  // Live document.title + OS notification bar update + PiP canvas draw
  useEffect(() => {
    const activeOrPaused = timer.running || timer.elapsedSec > 0;
    if ( typeof document !== 'undefined') {
      if (activeOrPaused) {
        const display = timer.mode === 'stopwatch' ? formatClock(timer.elapsedSec) : formatClock(timer.remainingSec);
        document.title = `${timer.running ? '🔴' : '⏸'} ${display} · ${timerTitleText} — প্রস্তুতি`;
      } else {
        document.title = 'প্রস্তুতি · HSC ’27 স্টাডি প্ল্যানার';
      }
    }
    if (pipCanvasRef.current && pipActive) {
      const ctx = pipCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#14231c';
        ctx.fillRect(0, 0, 360, 160);
        ctx.fillStyle = timer.running ? '#ef4444' : '#f59e0b';
        ctx.beginPath(); ctx.arc(28, 32, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a7f3d0';
        ctx.font = '600 15px sans-serif';
        ctx.fillText(timer.running ? 'পড়া চলছে · প্রস্তুতি' : 'বিরতি · প্রস্তুতি', 46, 37);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 42px monospace';
        const mainClock = timer.mode === 'stopwatch' ? formatClock(timer.elapsedSec) : formatClock(timer.remainingSec);
        ctx.fillText(mainClock, 22, 96);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 14px sans-serif';
        ctx.fillText(timerTitleText.slice(0, 32), 22, 134);
      }
    }
  }, [timer.running, timer.elapsedSec, timer.remainingSec, timer.mode, timerTitleText, formatClock, pipActive]);

  // Silent live OS status-bar notification update when running (every 30s & immediately on tab hide)
  useEffect(() => {
    if (!timer.running) return;
    const pushStatus = () => {
      const elapsedStr = formatClock(timer.elapsedSec);
      const remStr = timer.mode === 'stopwatch' ? '' : ` · বাকি ${formatClock(timer.remainingSec)}`;
      void syncLiveTimerNotification(`🔴 চলছে: ${timerTitleText}`, `অতিবাহিত ${elapsedStr}${remStr}`);
    };
    const onVis = () => { if (document.hidden) pushStatus(); };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(pushStatus, 30000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(id);
    };
  }, [timer.running, timer.elapsedSec, timer.remainingSec, timer.mode, timerTitleText, formatClock]);

  const toggleFloatingPiP = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
        return;
      }
      let canvas = pipCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 160;
        pipCanvasRef.current = canvas;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#14231c';
        ctx.fillRect(0, 0, 360, 160);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 38px monospace';
        ctx.fillText(formatClock(timer.mode === 'stopwatch' ? timer.elapsedSec : timer.remainingSec), 22, 95);
      }
      const capture = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
      if (!capture || !document.pictureInPictureEnabled) {
        notify('এই ব্রাউজারে ভাসমান মিনি ঘড়ি সাপোর্ট নেই — তবে উপরের লাইভ টাইমার বার সবসময় চালু থাকবে!', 'info');
        return;
      }
      let video = pipVideoRef.current;
      if (!video) {
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.addEventListener('leavepictureinpicture', () => setPipActive(false));
        pipVideoRef.current = video;
      }
      video.srcObject = capture.call(canvas, 2);
      await video.play();
      await video.requestPictureInPicture();
      setPipActive(true);
    } catch {
      notify('ভাসমান ঘড়ি চালু করা যায়নি — উপরের স্ট্যাটাস বারে লাইভ সময় দেখাচ্ছে।', 'info');
    }
  }, [formatClock, notify, timer.elapsedSec, timer.mode, timer.remainingSec]);
  const navigate = useCallback((next: View, date?: string) => { if (date) setSelectedDate(date); setView(next); setMobileMenu(false); window.location.hash = next; window.scrollTo({ top: 0, behavior: 'smooth' }); }, [setSelectedDate]);
  useTheme(data.settings.theme);
  const isDarkTheme = data.settings.theme === 'dark' || (data.settings.theme === 'system' && typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  useFontScale(data.settings.fontScale);
  const dueRevisions = revisionDueCount(data, today);
  const browserReminders = data.settings.reminderEnabled && !isNativeApp();
  useReminders(plan, data, browserReminders, () => navigate('today', todayKey()));
  useRevisionReminder(data, browserReminders, today, dueRevisions);
  useEffect(() => {
    if (!isNativeApp()) return;
    let active = true;
    let timer = 0;
    const timeout = new Promise<null>(resolve => { timer = window.setTimeout(() => resolve(null), 4000); });
    void Promise.race([restoreFromDatabase(), timeout]).then(payload => {
      if (!active) return;
      if (payload) {
        try { setData(parseBackup(payload)); notify('ডিভাইসের লোকাল ডাটাবেস থেকে সর্বশেষ তথ্য লোড হয়েছে।', 'info'); } catch { /* keep the localStorage copy */ }
      }
      setDbReady(true);
    }).catch(() => setDbReady(true));
    return () => { active = false; window.clearTimeout(timer); };
  }, [notify]);
  useEffect(() => { if (dbReady) setStorageOk(saveData(data)); }, [data, dbReady]);
  useEffect(() => {
    if (!isNativeApp() || !dbReady) return;
    const payload = JSON.stringify(data);
    const updatedAt = localStorage.getItem(SAVED_AT_KEY) || new Date().toISOString();
    const handle = window.setTimeout(() => { void persistToDatabase(payload, updatedAt); }, 900);
    return () => window.clearTimeout(handle);
  }, [data, dbReady]);
  useEffect(() => { setData(current => ensureRevisions(plan, current)); }, [plan, data.completed, data.settings.revisionEnabled]);
  useEffect(() => { setData(current => autoCarryover(plan, current, today)); }, [plan, data.settings.carryoverMode, today]);
  // Android drops a notification whose channel does not exist, so the channels are
  // created at start-up; the permission dialog only appears when reminders are on.
  useEffect(() => {
    if (!isNativeApp()) return;
    void prepareNativeNotifications();
  }, []);
  useEffect(() => {
    if (!isNativeApp() || !data.settings.reminderEnabled) return;
    let asked = false;
    try { asked = localStorage.getItem('hsc27-permission-asked') === 'yes'; } catch { asked = false; }
    if (asked) return;
    try { localStorage.setItem('hsc27-permission-asked', 'yes'); } catch { /* storage may be full */ }
    void requestNativeNotifications();
  }, [data.settings.reminderEnabled]);
  useEffect(() => {
    if (!data.settings.reminderEnabled || !isNativeApp()) return;
    const handle = window.setTimeout(() => { void syncNativeReminders(plan, data, today).catch(() => undefined); }, 2000);
    return () => window.clearTimeout(handle);
  }, [plan, data, today]);
  const progressSyncMounted = useRef(false);
  useEffect(() => {
    if (!progressSyncMounted.current) { progressSyncMounted.current = true; return; }
    if (!data.settings.reminderEnabled || isNativeApp() || !canNotify()) return;
    const handle = window.setTimeout(() => {
      void syncDailyProgressNotification(plan, data, today, true);
    }, 650);
    return () => window.clearTimeout(handle);
  }, [data.completed, data.dayOverrides, data.settings.reminderEnabled, plan, today]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { const onHash = () => { setView(viewFromHash()); setMobileMenu(false); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!confirmRequest) setModal(m => m?.type === 'search' ? null : { type: 'search' });
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        const editable = (e.target as HTMLElement | null)?.isContentEditable;
        if (!editable && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !modal && !confirmRequest) {
          e.preventDefault();
          setModal({ type: 'search' });
          return;
        }
      }
      if (e.key === 'Escape') setMobileMenu(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [confirmRequest, modal]);
  useEffect(() => { const onStorage = (e: StorageEvent) => { if (e.key !== STORAGE_KEY || !e.newValue) return; try { setData(parseBackup(e.newValue)); notify('অন্য ট্যাবের পরিবর্তন এই ট্যাবেও এসেছে।', 'info'); } catch { notify('অন্য ট্যাবের তথ্য পড়া যায়নি।', 'error'); } }; window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage); }, [notify]);
  const toggleTask = useCallback((id: string) => setData(d => setTaskCompletion(d, [id], !d.completed[id])), []);
  const logSession = useCallback((session: Parameters<typeof addStudySession>[1]) => setData(d => addStudySession(d, session)), []);
  const exportICS = useCallback((range: 'day' | 'week' | 'all', date?: string) => { try { const count = exportCalendar(plan, data, range, date || today); if (!count) { notify('এই সময়ে কোনো অসমাপ্ত সেশন নেই।', 'info'); return; } notify(`${bn(count)}টি সেশনের .ics ফাইল ডাউনলোড হয়েছে। এবার ক্যালেন্ডারে ইমপোর্ট করো।`); } catch { notify('ক্যালেন্ডার ফাইল তৈরি হয়নি। আবার চেষ্টা করো।', 'error'); } }, [plan, data, today, notify]);
  /**
   * Android's gesture back (and the predictive-back arrow in 14/15/16) should close an
   * open sheet instead of leaving the screen, so an open sheet pushes one history entry
   * and the X button walks back through it.
   */
  const sheetInHistory = useRef(false);
  /** The history entry the open sheet pushed, so a popstate from pushState() itself is ignored. */
  const sheetState = useRef<unknown>(null);
  const closeModal = useCallback(() => {
    if (sheetInHistory.current) history.back();
    else setModal(null);
  }, []);
  useEffect(() => {
    if (!modal) { sheetInHistory.current = false; return; }
    if (!sheetInHistory.current) {
      try { history.pushState({ sheet: true }, ''); sheetState.current = history.state; sheetInHistory.current = true; } catch { sheetInHistory.current = false; }
    }
    /**
     * Android's back gesture pops the entry the sheet pushed. A few WebViews also emit a
     * popstate from pushState() itself — the entry is then still ours, so ignore it.
     */
    const onBack = () => {
      if (sheetState.current !== null && history.state === sheetState.current) return;
      sheetInHistory.current = false; setModal(null);
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [modal]);
  const openMistake = (subject = 'physics', text = '') => setModal({ type: 'mistake', subject: subjectIds(subject), text });
  const startTimer = useCallback((subject: SubjectId, chapterId?: string) => {
    const apply = () => {
      timer.setMode('pomodoro');
      timer.setSubject(subject);
      if (chapterId) timer.setChapter(chapterId);
      navigate('timer');
    };
    if (timer.running) {
      setConfirmRequest({ title: 'চলমান টাইমার থামিয়ে নতুন শুরু করবে?', message: 'বর্তমান টাইমারের অগ্রগতি সেভ হবে না। আগে থামিয়ে রাখতে চাইলে টাইমার পেজে যাও।', label: 'নতুন টাইমার শুরু', action: apply });
      return;
    }
    apply();
  }, [timer, navigate]);
  const startPresetTimer = useCallback((preset: PresetTimerInput) => {
    const launch = () => {
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => undefined);
      }
      timer.startPreset(preset);
      notify(`▶ টাইমার চালু হয়েছে: ${preset.label || subjectById[preset.subject].name} (${bn(preset.durationMin)} মি.)`, 'info');
    };
    if (timer.running && timer.taskId !== preset.taskId) {
      setConfirmRequest({
        title: 'চলমান টাইমার বদলে এই অধ্যায়ের টাইমার চালাবে?',
        message: 'আগের চলমান টাইমারটি থেমে নতুন প্রিসেট টাইমার শুরু হবে।',
        label: 'হ্যাঁ, নতুন টাইমার চালাও',
        action: launch,
      });
      return;
    }
    launch();
  }, [timer, notify]);
  const finishActiveTimer = useCallback(() => {
    const linkedTaskId = timer.taskId;
    timer.finishNow();
    if (linkedTaskId && !data.completed[linkedTaskId]) {
      toggleTask(linkedTaskId);
    }
    void clearLiveTimerNotification();
  }, [timer, data.completed, toggleTask]);
  const sendStudyStatusNotification = useCallback(async (targetDate?: string): Promise<boolean> => {
    const dateKey = targetDate || selectedDate || today;
    const nextData: AppData = data.settings.reminderEnabled
      ? data
      : { ...data, settings: { ...data.settings, reminderEnabled: true } };
    const payload = buildDailyStatusNotification(plan, nextData, dateKey);

    if (isNativeApp()) {
      const perm = await requestNativeNotifications();
      if (perm !== 'granted') {
        notify(t('ফোন সেটিংস থেকে নোটিফিকেশনের অনুমতি দাও।', 'Allow notifications in your phone settings.'), 'error');
        return false;
      }
      setData(d => ({ ...d, settings: { ...d.settings, reminderEnabled: true } }));
      const ok = await nativeNotify(payload.title, payload.body);
      void syncNativeReminders(plan, nextData, today, { requestPermission: true }).catch(() => undefined);
      if (ok) notify(t('🔔 আজকের কী পড়া, মোট সময় ও কমপ্লিট করার বাকি অংশ নোটিফিকেশনে পাঠানো হয়েছে!', '🔔 Today’s study & remaining progress sent to notifications!'));
      return ok;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      notify(t('এই ব্রাউজারে নোটিফিকেশন সাপোর্ট নেই — Chrome/Edge বা Android অ্যাপ ব্যবহার করো।', 'Notifications are not supported in this browser.'), 'error');
      return false;
    }
    let permission = Notification.permission;
    if (permission !== 'granted') {
      try { permission = await Notification.requestPermission(); } catch { permission = 'denied'; }
    }
    if (permission !== 'granted') {
      notify(t('ব্রাউজারের অ্যাড্রেস বারের লক আইকন থেকে Notification Allow করো।', 'Please allow notifications in browser site settings.'), 'error');
      return false;
    }
    if (!data.settings.reminderEnabled) {
      setData(d => ({ ...d, settings: { ...d.settings, reminderEnabled: true } }));
    }
    try {
      await showNotification(payload.title, payload.body, { tag: 'prostuti-daily-progress', silent: false });
      try { localStorage.setItem('hsc27-daily-brief-v1', today); } catch { /* ignore */ }
      notify(t('🔔 আজকের পড়া, মোট সময় ও কতটুকু কমপ্লিট বাকি — সব নোটিফিকেশনে পাঠানো হয়েছে!', '🔔 Sent today’s study, total hours & remaining tasks to notifications!'));
      return true;
    } catch {
      notify(t('নোটিফিকেশন পাঠানো যায়নি — ব্রাউজার পারমিশন চেক করো।', 'Could not send notification — check browser permission.'), 'error');
      return false;
    }
  }, [data, notify, plan, selectedDate, today]);
  const setTheme = useCallback((theme: AppData['settings']['theme']) => setData(d => ({ ...d, settings: { ...d.settings, theme } })), []);
  const setFontScale = useCallback((fontScale: AppData['settings']['fontScale']) => setData(d => ({ ...d, settings: { ...d.settings, fontScale } })), []);
  const toggleQuickLanguage = useCallback(() => {
    setData(d => ({ ...d, settings: { ...d.settings, language: d.settings.language === 'en' ? 'bn' : 'en' } }));
  }, []);
  const todayDigest = useMemo(() => buildDailyNotificationDigest(plan, data, today), [plan, data, today]);
  const currentNav = NAV.find(n => n.id === view);
  const context = {
    data, setData, plan, today, now, view, navigate, selectedDate, setSelectedDate, notify, toggleTask,
    openChapter: (chapter: Chapter) => setModal({ type: 'chapter', chapter }), openExam: (paperId: string) => setModal({ type: 'exam', paperId }), openMistake,
    confirm: (request: ConfirmRequest) => setConfirmRequest(request), exportICS, storageOk, timer, logSession, startTimer, startPresetTimer, sendStudyStatusNotification, setTheme, setFontScale, screenAwake, serviceRunning,
  };
  const ViewComponent = { today: TodayView, calendar: CalendarView, syllabus: SyllabusView, revision: RevisionView, timer: TimerView, practice: PracticeView, exams: ExamsView, analytics: AnalyticsView, library: LibraryView, reminders: RemindersView, settings: SettingsView }[view];
  const testExamDays = diffDays(today, data.settings.testExamDate);
  const examDays = diffDays(today, data.settings.examDate);
  const countdownText = (days: number) => days > 0 ? t(`বাকি ${bn(days)} দিন`, `${days}d left`) : days === 0 ? t('আজ পরীক্ষা', 'Today') : t('সম্পন্ন', 'Completed');
  return <PlannerContext.Provider value={context}>
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }); }}>{t('মূল কনটেন্টে যাও', 'Skip to main content')}</a>
    <div className="app-shell">
      {mobileMenu && <button className="sidebar-overlay" aria-label={t('মেনু বন্ধ করো', 'Close menu')} onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('today', today)} aria-label={t('প্রস্তুতি হোম', 'Prostuti home')}><span className="brand-mark"><BookOpen size={25} strokeWidth={1.8} /><Check size={12} className="brand-check" /></span><span><strong>{t("প্রস্তুতি", "Preparation")}<span className="brand-period">.</span></strong><small>HSC 27 · SCIENCE</small></span></button>
        <button className="sidebar-close icon-button" onClick={() => setMobileMenu(false)} aria-label={t('মেনু বন্ধ করো', 'Close menu')}><X size={20} /></button>
        <div className="sidebar-nav-scroll">
          {NAV_GROUPS.map(group => <div key={group.label}><div className="nav-section-label">{t(group.label, group.labelEn)}</div><nav aria-label={t('মূল নেভিগেশন', 'Main navigation')}>{group.items.map(n => <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)} aria-current={view === n.id ? 'page' : undefined}><n.icon size={19} strokeWidth={1.7} /><span>{t(n.label, n.labelEn)}</span>{n.id === 'today' && <span className="nav-today-dot" />}{n.id === 'revision' && dueRevisions > 0 && <span className="nav-count alert">{bn(dueRevisions)}</span>}{n.id === 'exams' && <span className="nav-count">{bn(Object.keys(data.exams).length + data.tests.length)}</span>}</button>)}</nav></div>)}
        </div>
        <div className="sidebar-bottom">
          <div className="dream-card"><Sprout size={24} strokeWidth={1.6} /><strong>{t("স্বপ্নটা তোমার।", "The dream is yours.")}<br />{t("প্রস্তুতিও তোমার।", "The preparation is yours too.")}</strong><p>{t("আজকের ছোট চেষ্টাই আগামীকের বড় আত্মবিশ্বাস।", "Today's steady effort builds tomorrow's confidence.")}</p><span>{t("A+ এর পথে", "On the way to A+")}<ArrowUpRight size={13} /></span></div>
          <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><SettingsIcon size={19} strokeWidth={1.7} /><span>{t('সেটিংস ও ব্যাকআপ', 'Settings & backup')}</span></button>
          <div className="sidebar-profile"><span className="avatar">{data.settings.name.trim().slice(0, 1) || 'প'}</span><div><strong>{data.settings.name || t('আমার প্রস্তুতি', 'My preparation')}</strong><span>{data.settings.board} {t('বোর্ড · বিজ্ঞান', 'board · Science')}</span></div><span className="status-dot" /></div>
        </div>
      </aside>
      <div className="main-shell">
        <div className="top-chrome-stack">
          {(timer.running || timer.elapsedSec > 0) && (
            <div className={`live-timer-topbar ${timer.running ? 'running' : 'paused'}`} role="status" aria-live="off">
              <div className="live-timer-indicator" onClick={() => navigate('timer')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') navigate('timer'); }}>
                <span className={`live-rec-dot ${timer.running ? 'pulse' : ''}`} aria-hidden="true" />
                <span className="live-rec-badge">{timer.running ? t('লাইভ চলছে', 'LIVE') : t('বিরতি', 'PAUSED')}</span>
                <strong className="live-timer-subject">{subjectById[timer.subject]?.short} · {timerTitleText}</strong>
              </div>
              <div className="live-timer-clocks">
                <span className="live-clock-chip elapsed" title={t('কতক্ষণ ধরে চলছে', 'Elapsed time')}>
                  <small>{t('অতিবাহিত', 'Elapsed')}</small>
                  <strong>{formatClock(timer.elapsedSec)}</strong>
                </span>
                {timer.mode !== 'stopwatch' && (
                  <span className="live-clock-chip remaining" title={t('কতক্ষণ বাকি আছে', 'Remaining time')}>
                    <small>{t('বাকি', 'Left')}</small>
                    <strong>{formatClock(timer.remainingSec)}</strong>
                  </span>
                )}
              </div>
              <div className="live-timer-actions">
                <button type="button" className="live-btn toggle" onClick={timer.running ? timer.pause : timer.start}>
                  {timer.running ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                  <span>{timer.running ? t('বিরতি', 'Pause') : t('চালু', 'Resume')}</span>
                </button>
                <button type="button" className="live-btn pip" onClick={() => void toggleFloatingPiP()} title={t('ক্লাস দেখার সময় স্ক্রিনের উপরে ভাসমান ঘড়ি চালু করো', 'Float mini timer above YouTube / other tabs')}>
                  <PictureInPicture2 size={13} />
                  <span>{pipActive ? t('ভাসমান বন্ধ', 'Close PiP') : t('ভাসমান ঘড়ি', 'Float')}</span>
                </button>
                <button type="button" className="live-btn done" onClick={finishActiveTimer} title={t('পড়া সেভ করে সম্পন্ন দাও', 'Save session & mark done')}>
                  <Check size={13} />
                  <span>{t('সম্পন্ন ও সেভ', 'Finish')}</span>
                </button>
                <button type="button" className="live-btn dismiss" onClick={() => { timer.reset(); void clearLiveTimerNotification(); }} aria-label={t('টাইমার বন্ধ করো', 'Reset timer')}>
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
          <header className="topbar">
            <div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileMenu(true)} aria-label={t('মেনু খুলো', 'Open menu')}><Menu size={22} /></button><div className="breadcrumb"><span>{t('আমার প্রস্তুতি', 'My preparation')}</span><ChevronRight size={14} /><strong>{currentNav ? t(currentNav.label, currentNav.labelEn) : t('সেটিংস ও ব্যাকআপ', 'Settings & backup')}</strong></div></div>
            <div className="topbar-actions">
              {todayDigest.totalTasks > 0 && (
                <button
                  type="button"
                  className={`topbar-progress-pill ${todayDigest.allDone ? 'done' : ''}`}
                  onClick={() => navigate('today', today)}
                  title={t(`আজকের অগ্রগতি: ${todayDigest.completedSummary}`, `Today: ${todayDigest.completedSummary}`)}
                >
                  <span className="topbar-progress-dot" />
                  <span>{t(`আজ ${bn(todayDigest.doneTasks)}/${bn(todayDigest.totalTasks)}`, `${todayDigest.doneTasks}/${todayDigest.totalTasks} done`)}</span>
                  <strong>{bn(todayDigest.percentDone)}%</strong>
                </button>
              )}
              <button className="global-search" aria-label={t('সব কিছু খুঁজো', 'Search everything')} onClick={() => setModal({ type: 'search' })}><Search size={16} /><span>{t('অধ্যায়, ক্লাস বা রুটিন খুঁজো…', 'Search chapters, classes or routine…')}</span><kbd><Command size={11} /> K</kbd></button>
              <div className="topbar-quick-tools">
                <button
                  type="button"
                  className="icon-button quick-tool-btn"
                  onClick={() => openMistake()}
                  title={t('দ্রুত ভুল বা নোট লিখে রাখো', 'Quickly log a mistake or study note')}
                  aria-label={t('ভুলের খাতায় দ্রুত যোগ', 'Quick mistake log')}
                >
                  <NotebookPen size={18} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="icon-button quick-tool-btn"
                  onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
                  title={t('দিন/রাত থিম পরিবর্তন', 'Toggle light or dark mode')}
                  aria-label={t('থিম পরিবর্তন করো', 'Switch color theme')}
                >
                  {isDarkTheme ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
                </button>
                <button
                  type="button"
                  className="lang-toggle-chip"
                  onClick={toggleQuickLanguage}
                  title={t('বাংলা / EN ভাষা পরিবর্তন', 'Switch language')}
                  aria-label={t('ভাষা পরিবর্তন করো', 'Switch language')}
                >
                  {data.settings.language === 'en' ? 'বাং' : 'EN'}
                </button>
                <button className="icon-button notification-button" onClick={() => navigate('reminders')} aria-label={t('রিমাইন্ডার', 'Reminders')}><Bell size={18} strokeWidth={1.75} />{data.settings.reminderEnabled && <span />}</button>
              </div>
              <button className="topbar-avatar" onClick={() => navigate('settings')} aria-label={t('প্রোফাইল ও সেটিংস', 'Profile & settings')}>{data.settings.name.trim().slice(0, 1) || 'প'}</button>
            </div>
          </header>
        </div>
        <div className="exam-countdown-bar" role="region" aria-label={t('পরীক্ষার কাউন্টডাউন', 'Exam countdown')}>
          <button type="button" className={`exam-countdown-pill test ${testExamDays >= 0 && testExamDays <= 45 ? 'soon' : ''}`} onClick={() => navigate('settings')} title={t(`কলেজের টেস্ট পরীক্ষার লক্ষ্য তারিখ: ${formatDate(data.settings.testExamDate)} (সেটিংসে পরিবর্তনযোগ্য)`, `College Test Exam target: ${formatDate(data.settings.testExamDate)} (editable in Settings)`)}>
            <span className="exam-pill-dot" aria-hidden="true" />
            <span className="exam-pill-label">{t('টেস্ট পরীক্ষা', 'Test Exam')} <small>· {formatDate(data.settings.testExamDate)}</small></span>
            <strong className="exam-pill-days">{countdownText(testExamDays)}</strong>
          </button>
          <button type="button" className={`exam-countdown-pill hsc`} onClick={() => navigate('settings')} title={t(`HSC ২০২৭ বোর্ড পরীক্ষার সম্ভাব্য তারিখ (ঈদুল আজহার পর): ${formatDate(data.settings.examDate)}`, `Expected HSC 2027 Board Exam date (post-Eid-ul-Adha): ${formatDate(data.settings.examDate)}`)}>
            <Timer size={14} aria-hidden="true" />
            <span className="exam-pill-label">{t('HSC ’২৭ পরীক্ষা', "HSC '27 Exam")} <small>· {formatDate(data.settings.examDate)}</small></span>
            <strong className="exam-pill-days">{countdownText(examDays)}</strong>
          </button>
        </div>
        <main id="main-content" className="main-content" tabIndex={-1}>{!storageOk && <div className="storage-warning"><ShieldCheck size={18} /><p>{t('ব্রাউজারে তথ্য সেভ করা যাচ্ছে না। স্টোরেজ খালি করো এবং যাওয়ার আগে JSON ব্যাকআপ রাখো।', 'The browser cannot save data. Free some storage and keep a JSON backup before leaving.')}</p><button className="text-button" onClick={() => navigate('settings')}>{t("ব্যাকআপ", "Backup")}</button></div>}<ViewComponent /></main>
      </div>
      <nav className="mobile-bottom-nav" aria-label={t('মোবাইল নেভিগেশন', 'Mobile navigation')}>
        {[NAV[0], NAV[2], NAV[1], NAV[4], NAV[5]].map(n => (
          <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => navigate(n.id)}>
            <span className="mobile-nav-icon-wrap">
              <n.icon size={19} strokeWidth={view === n.id ? 2.1 : 1.7} />
              {n.id === 'timer' && timer.running && <i className="mobile-nav-live-dot" />}
            </span>
            <span>{t(n.short, n.shortEn)}</span>
          </button>
        ))}
        <button type="button" className={mobileMenu ? 'active' : ''} onClick={() => setMobileMenu(v => !v)} aria-label={t('সব মেনু দেখো', 'More pages')}>
          <span className="mobile-nav-icon-wrap">
            <Menu size={19} strokeWidth={1.7} />
            {dueRevisions > 0 && <i className="mobile-nav-badge-dot" />}
          </span>
          <span>{t('আরও', 'More')}</span>
        </button>
      </nav>
    </div>
    {modal?.type === 'chapter' && <ChapterModal chapter={modal.chapter} onClose={closeModal} />}
    {modal?.type === 'exam' && <ExamModal paperId={modal.paperId} onClose={closeModal} />}
    {modal?.type === 'mistake' && <MistakeModal subject={modal.subject} initialText={modal.text} onClose={closeModal} />}
    {modal?.type === 'search' && <SearchModal onClose={closeModal} onChapter={chapter => setModal({ type: 'chapter', chapter })} />}
    {confirmRequest && <Modal title={confirmRequest.title} onClose={() => setConfirmRequest(null)}><p className="confirm-message">{confirmRequest.message}</p><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmRequest(null)}>{t('বাতিল', 'Cancel')}</button><button className={`button ${confirmRequest.danger ? 'danger' : 'primary'}`} onClick={() => { const action = confirmRequest.action; setConfirmRequest(null); action(); }}>{confirmRequest.label || t('নিশ্চিত করো', 'Confirm')}</button></div></Modal>}
    {toast && <div className={`toast ${toast.type}`} role="status" aria-live="polite"><span>{toast.type === 'success' ? <Check size={18} /> : toast.type === 'error' ? <X size={18} /> : <Bell size={18} />}</span><p>{toast.message}</p><button onClick={() => setToast(null)} aria-label={t('বার্তা বন্ধ করো', 'Dismiss message')}><X size={16} /></button></div>}
  </PlannerContext.Provider>;
}
function subjectIds(s: string): SubjectId { return SUBJECTS.some(x => x.id === s) ? s as SubjectId : 'physics'; }
