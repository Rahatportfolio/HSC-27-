import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Bell, BookOpen, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, ClipboardCheck, Command, LibraryBig, LayoutDashboard, Menu, RotateCcw, Search, Settings as SettingsIcon, ShieldCheck, Sprout, Timer, FolderOpen, PenLine, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SUBJECTS } from './data';
import type { Chapter, SubjectId } from './data';
import { applyRoutine, bn, buildPlan, diffDays, formatDate, isValidDate, todayKey } from './planner';
import type { AppData } from './planner';
import { loadData, parseBackup, saveData, SAVED_AT_KEY } from './storage';
import { persistToDatabase, restoreFromDatabase } from './db';
import { STORAGE_KEY } from './planner';
import { exportCalendar } from './exports';
import { useNow, useReminders, useRevisionReminder, useStudyTimer, useTheme } from './hooks';
import { isNativeApp, syncNativeReminders } from './native';
import { ensureRevisions, revisionDueCount } from './revision';
import { addStudySession, autoCarryover } from './study';
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
    { id: 'syllabus' as const, label: 'সিলেবাস ও অধ্যায়', labelEn: 'Syllabus & chapters', short: 'সিলেবাস', shortEn: 'Syllabus', icon: LibraryBig },
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
  const plan = useMemo(() => applyRoutine(basePlan, data.routineBlocks), [basePlan, data.routineBlocks]);
  const timer = useStudyTimer({
    settings: data.settings,
    notify,
    onComplete: session => setData(d => addStudySession(d, { minutes: session.minutes, subject: session.subject, chapterId: session.chapterId || undefined, mode: session.mode, label: session.label || undefined })),
  });
  const navigate = useCallback((next: View, date?: string) => { if (date) setSelectedDate(date); setView(next); setMobileMenu(false); window.location.hash = next; window.scrollTo({ top: 0, behavior: 'smooth' }); }, [setSelectedDate]);
  useTheme(data.settings.theme);
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
  useEffect(() => {
    if (!data.settings.reminderEnabled || !isNativeApp()) return;
    const handle = window.setTimeout(() => { void syncNativeReminders(plan, data, today).catch(() => undefined); }, 2000);
    return () => window.clearTimeout(handle);
  }, [plan, data, today]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { const onHash = () => { setView(viewFromHash()); setMobileMenu(false); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!confirmRequest) setModal(m => m?.type === 'search' ? null : { type: 'search' }); } if (e.key === 'Escape') setMobileMenu(false); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [confirmRequest]);
  useEffect(() => { const onStorage = (e: StorageEvent) => { if (e.key !== STORAGE_KEY || !e.newValue) return; try { setData(parseBackup(e.newValue)); notify('অন্য ট্যাবের পরিবর্তন এই ট্যাবেও এসেছে।', 'info'); } catch { notify('অন্য ট্যাবের তথ্য পড়া যায়নি।', 'error'); } }; window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage); }, [notify]);
  const toggleTask = useCallback((id: string) => setData(d => {
    const completed = { ...d.completed };
    if (completed[id]) delete completed[id];
    else {
      completed[id] = new Date().toISOString();
      // The carried copy is no longer needed once the original session is done.
      return { ...d, completed, carryovers: d.carryovers.map(item => item.taskId === id && !item.completedAt ? { ...item, completedAt: completed[id] } : item) };
    }
    return { ...d, completed };
  }), []);
  const logSession = useCallback((session: Parameters<typeof addStudySession>[1]) => setData(d => addStudySession(d, session)), []);
  const exportICS = useCallback((range: 'day' | 'week' | 'all', date?: string) => { try { const count = exportCalendar(plan, data, range, date || today); if (!count) { notify('এই সময়ে কোনো অসমাপ্ত সেশন নেই।', 'info'); return; } notify(`${bn(count)}টি সেশনের .ics ফাইল ডাউনলোড হয়েছে। এবার ক্যালেন্ডারে ইমপোর্ট করো।`); } catch { notify('ক্যালেন্ডার ফাইল তৈরি হয়নি। আবার চেষ্টা করো।', 'error'); } }, [plan, data, today, notify]);
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
  const setTheme = useCallback((theme: AppData['settings']['theme']) => setData(d => ({ ...d, settings: { ...d.settings, theme } })), []);
  const currentNav = NAV.find(n => n.id === view);
  const context = {
    data, setData, plan, today, now, view, navigate, selectedDate, setSelectedDate, notify, toggleTask,
    openChapter: (chapter: Chapter) => setModal({ type: 'chapter', chapter }), openExam: (paperId: string) => setModal({ type: 'exam', paperId }), openMistake,
    confirm: (request: ConfirmRequest) => setConfirmRequest(request), exportICS, storageOk, timer, logSession, startTimer, setTheme,
  };
  const ViewComponent = { today: TodayView, calendar: CalendarView, syllabus: SyllabusView, revision: RevisionView, timer: TimerView, practice: PracticeView, exams: ExamsView, analytics: AnalyticsView, library: LibraryView, reminders: RemindersView, settings: SettingsView }[view];
  const examDays = diffDays(today, data.settings.examDate);
  return <PlannerContext.Provider value={context}>
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }); }}>{t('মূল কনটেন্টে যাও', 'Skip to main content')}</a>
    <div className="app-shell">
      {mobileMenu && <button className="sidebar-overlay" aria-label={t('মেনু বন্ধ করো', 'Close menu')} onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('today', today)} aria-label={t('প্রস্তুতি হোম', 'Prostuti home')}><span className="brand-mark"><BookOpen size={25} strokeWidth={1.8} /><Check size={12} className="brand-check" /></span><span><strong>প্রস্তুতি<span className="brand-period">.</span></strong><small>HSC 27 · SCIENCE</small></span></button>
        <button className="sidebar-close icon-button" onClick={() => setMobileMenu(false)} aria-label={t('মেনু বন্ধ করো', 'Close menu')}><X size={20} /></button>
        {NAV_GROUPS.map(group => <div key={group.label}><div className="nav-section-label">{t(group.label, group.labelEn)}</div><nav aria-label={t('মূল নেভিগেশন', 'Main navigation')}>{group.items.map(n => <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)} aria-current={view === n.id ? 'page' : undefined}><n.icon size={19} strokeWidth={1.7} /><span>{t(n.label, n.labelEn)}</span>{n.id === 'today' && <span className="nav-today-dot" />}{n.id === 'revision' && dueRevisions > 0 && <span className="nav-count alert">{bn(dueRevisions)}</span>}{n.id === 'exams' && <span className="nav-count">{bn(Object.keys(data.exams).length + data.tests.length)}</span>}</button>)}</nav></div>)}
        <div className="sidebar-bottom">
          <div className="dream-card"><Sprout size={27} strokeWidth={1.5} /><strong>স্বপ্নটা তোমার।<br />প্রস্তুতিও তোমার।</strong><p>আজকের ছোট চেষ্টাই<br />আগামীকের বড় আত্মবিশ্বাস।</p><span>A+ এর পথে <ArrowUpRight size={13} /></span></div>
          <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><SettingsIcon size={19} strokeWidth={1.7} /><span>{t('সেটিংস ও ব্যাকআপ', 'Settings & backup')}</span></button>
          <div className="sidebar-profile"><span className="avatar">{data.settings.name.trim().slice(0, 1) || 'প'}</span><div><strong>{data.settings.name || t('আমার প্রস্তুতি', 'My preparation')}</strong><span>{data.settings.board} {t('বোর্ড · বিজ্ঞান', 'board · Science')}</span></div><span className="status-dot" /></div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileMenu(true)} aria-label={t('মেনু খুলো', 'Open menu')}><Menu size={22} /></button><div className="breadcrumb"><span>{t('আমার প্রস্তুতি', 'My preparation')}</span><ChevronRight size={14} /><strong>{currentNav ? t(currentNav.label, currentNav.labelEn) : t('সেটিংস ও ব্যাকআপ', 'Settings & backup')}</strong></div></div>
          <div className="topbar-actions">
            {examDays >= 0 && <span className="countdown-chip" title={`ব্যক্তিগত লক্ষ্য তারিখ: ${formatDate(data.settings.examDate)} — বোর্ডের সরকারি তারিখ নয়`}><Timer size={13} />{t('HSC লক্ষ্য', 'HSC target')} <strong>{bn(examDays)} {t('দিন', 'days')}</strong></span>}
            <button className="global-search" aria-label={t('সব কিছু খুঁজো', 'Search everything')} onClick={() => setModal({ type: 'search' })}><Search size={16} /><span>{t('অধ্যায়, নোট বা রুটিন খুঁজো…', 'Search chapters, notes or routine…')}</span><kbd><Command size={11} /> K</kbd></button>
            <span className="topbar-divider" />
            <button className="icon-button notification-button" onClick={() => navigate('reminders')} aria-label={t('রিমাইন্ডার', 'Reminders')}><Bell size={19} strokeWidth={1.7} />{data.settings.reminderEnabled && <span />}</button>
            <button className="topbar-avatar" onClick={() => navigate('settings')} aria-label={t('প্রোফাইল ও সেটিংস', 'Profile & settings')}>{data.settings.name.trim().slice(0, 1) || 'প'}</button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>{!storageOk && <div className="storage-warning"><ShieldCheck size={18} /><p>{t('ব্রাউজারে তথ্য সেভ করা যাচ্ছে না। স্টোরেজ খালি করো এবং যাওয়ার আগে JSON ব্যাকআপ রাখো।', 'The browser cannot save data. Free some storage and keep a JSON backup before leaving.')}</p><button className="text-button" onClick={() => navigate('settings')}>ব্যাকআপ</button></div>}<ViewComponent /></main>
      </div>
      <nav className="mobile-bottom-nav" aria-label={t('মোবাইল নেভিগেশন', 'Mobile navigation')}>{[NAV[0], NAV[1], NAV[4], NAV[3], NAV[6]].map(n => <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => navigate(n.id)}><n.icon size={19} strokeWidth={1.7} /><span>{t(n.short, n.shortEn)}</span></button>)}</nav>
    </div>
    {modal?.type === 'chapter' && <ChapterModal chapter={modal.chapter} onClose={() => setModal(null)} />}
    {modal?.type === 'exam' && <ExamModal paperId={modal.paperId} onClose={() => setModal(null)} />}
    {modal?.type === 'mistake' && <MistakeModal subject={modal.subject} initialText={modal.text} onClose={() => setModal(null)} />}
    {modal?.type === 'search' && <SearchModal onClose={() => setModal(null)} onChapter={chapter => setModal({ type: 'chapter', chapter })} />}
    {confirmRequest && <Modal title={confirmRequest.title} onClose={() => setConfirmRequest(null)}><p className="confirm-message">{confirmRequest.message}</p><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmRequest(null)}>{t('বাতিল', 'Cancel')}</button><button className={`button ${confirmRequest.danger ? 'danger' : 'primary'}`} onClick={() => { const action = confirmRequest.action; setConfirmRequest(null); action(); }}>{confirmRequest.label || t('নিশ্চিত করো', 'Confirm')}</button></div></Modal>}
    {toast && <div className={`toast ${toast.type}`} role="status" aria-live="polite"><span>{toast.type === 'success' ? <Check size={18} /> : toast.type === 'error' ? <X size={18} /> : <Bell size={18} />}</span><p>{toast.message}</p><button onClick={() => setToast(null)} aria-label={t('বার্তা বন্ধ করো', 'Dismiss message')}><X size={16} /></button></div>}
  </PlannerContext.Provider>;
}
function subjectIds(s: string): SubjectId { return SUBJECTS.some(x => x.id === s) ? s as SubjectId : 'physics'; }
