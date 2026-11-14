import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, ClipboardCheck, Command, LayoutDashboard, LibraryBig, Menu, NotebookPen, Search, Settings as SettingsIcon, ShieldCheck, Sprout, X } from 'lucide-react';
import { CHAPTERS, PAPERS, SUBJECTS, subjectById } from './data';
import type { Chapter, SubjectId } from './data';
import { bn, buildPlan, chapterTasks, formatDate, formatDayOffset, formatTime, isChapterDone, isValidDate, percent, phaseName, todayKey } from './planner';
import type { AppData } from './planner';
import { loadData, MISTAKE_LIMIT, newId, nowIso, parseBackup, saveData } from './storage';
import { STORAGE_KEY } from './planner';
import { exportCalendar } from './exports';
import { useFocusTimer, useNow, useReminders } from './hooks';
import { PlannerContext } from './context';
import type { ConfirmRequest, View } from './context';
import { EmptyState, Modal, ProgressBar, SubjectBadge } from './components';
import TodayView from './views/Today';
import CalendarView from './views/Calendar';
import SyllabusView from './views/Syllabus';
import ExamsView from './views/Exams';
import ProgressView from './views/Progress';
import RemindersView from './views/Reminders';
import SettingsView from './views/Settings';

const NAV = [
  { id: 'today' as const, label: 'আজকের পড়া', icon: LayoutDashboard },
  { id: 'calendar' as const, label: 'ক্যালেন্ডার', icon: CalendarDays },
  { id: 'syllabus' as const, label: 'সিলেবাস', icon: LibraryBig },
  { id: 'exams' as const, label: 'মডেল টেস্ট', icon: ClipboardCheck },
  { id: 'progress' as const, label: 'অগ্রগতি', icon: ChartNoAxesCombined },
  { id: 'reminders' as const, label: 'রিমাইন্ডার', icon: Bell },
];
const viewFromHash = (): View => { const h = window.location.hash.slice(1); return [...NAV.map(n => n.id), 'settings'].includes(h) ? h as View : 'today'; };
type OpenModal = { type: 'chapter'; chapter: Chapter } | { type: 'exam'; paperId: string } | { type: 'mistake'; subject: SubjectId; text: string } | { type: 'search' } | null;

export default function App() {
  const [initial] = useState(loadData);
  const [data, setData] = useState<AppData>(initial.data);
  const [storageOk, setStorageOk] = useState(true);
  const [view, setView] = useState<View>(viewFromHash);
  const now = useNow(); const today = todayKey(now);
  const [selectedDate, setSelectedDateState] = useState(today);
  const setSelectedDate = useCallback((date: string) => { if (isValidDate(date)) setSelectedDateState(date); }, []);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<OpenModal>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; id: number } | null>(initial.warning ? { message: initial.warning, type: 'info', id: 0 } : null);
  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => setToast({ message, type, id: Date.now() }), []);
  const plan = useMemo(() => buildPlan(data.settings), [data.settings]);
  const timer = useFocusTimer(setData, notify);
  const navigate = useCallback((next: View, date?: string) => { if (date) setSelectedDate(date); setView(next); setMobileMenu(false); window.location.hash = next; window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  useReminders(plan, data, data.settings.reminderEnabled, () => navigate('today', todayKey()));
  useEffect(() => { setStorageOk(saveData(data)); }, [data]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { const onHash = () => { setView(viewFromHash()); setMobileMenu(false); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!confirmRequest) setModal(m => m?.type === 'search' ? null : { type: 'search' }); } if (e.key === 'Escape') setMobileMenu(false); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [confirmRequest]);
  useEffect(() => { const onStorage = (e: StorageEvent) => { if (e.key !== STORAGE_KEY || !e.newValue) return; try { setData(parseBackup(e.newValue)); notify('অন্য ট্যাবের পরিবর্তন এই ট্যাবেও এসেছে।', 'info'); } catch { notify('অন্য ট্যাবের তথ্য পড়া যায়নি।', 'error'); } }; window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage); }, [notify]);
  const toggleTask = useCallback((id: string) => setData(d => { const completed = { ...d.completed }; if (completed[id]) delete completed[id]; else completed[id] = nowIso(); return { ...d, completed }; }), []);
  const exportICS = useCallback((range: 'day' | 'week' | 'all', date?: string) => { try { const count = exportCalendar(plan, data, range, date || today); if (!count) { notify('এই সময়ে কোনো অসমাপ্ত সেশন নেই।', 'info'); return; } notify(`${bn(count)}টি সেশনের .ics ফাইল ডাউনলোড হয়েছে। এবার ক্যালেন্ডারে ইমপোর্ট করো।`); } catch { notify('ক্যালেন্ডার ফাইল তৈরি হয়নি। আবার চেষ্টা করো।', 'error'); } }, [plan, data, today, notify]);
  const openMistake = (subject = 'physics', text = '') => setModal({ type: 'mistake', subject: subjectIds(subject), text });
  const currentNav = NAV.find(n => n.id === view);
  const context = { data, setData, plan, today, now, view, navigate, selectedDate, setSelectedDate, notify, toggleTask,
    openChapter: (chapter: Chapter) => setModal({ type: 'chapter', chapter }), openExam: (paperId: string) => setModal({ type: 'exam', paperId }), openMistake,
    confirm: (request: ConfirmRequest) => setConfirmRequest(request), exportICS, storageOk, timer };
  const ViewComponent = { today: TodayView, calendar: CalendarView, syllabus: SyllabusView, exams: ExamsView, progress: ProgressView, reminders: RemindersView, settings: SettingsView }[view];
  return <PlannerContext.Provider value={context}><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }); }}>মূল কনটেন্টে যাও</a><div className="app-shell">
    {mobileMenu && <button className="sidebar-overlay" aria-label="মেনু বন্ধ করো" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}><button className="brand" onClick={() => navigate('today', today)} aria-label="প্রস্তুতি হোম"><span className="brand-mark"><BookOpen size={25} strokeWidth={1.8} /><Check size={12} className="brand-check" /></span><span><strong>প্রস্তুতি<span className="brand-period">.</span></strong><small>HSC 27 · SCIENCE</small></span></button><button className="sidebar-close icon-button" onClick={() => setMobileMenu(false)} aria-label="মেনু বন্ধ করো"><X size={20} /></button>
      <div className="nav-section-label">তোমার পথচলা</div><nav aria-label="মূল নেভিগেশন">{NAV.map((n, i) => <div key={n.id}>{i === 5 && <div className="nav-section-label second">একটু সহায়তা</div>}<button className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)} aria-current={view === n.id ? 'page' : undefined}><n.icon size={19} strokeWidth={1.7} /><span>{n.label}</span>{n.id === 'today' && <span className="nav-today-dot" />}{n.id === 'exams' && <span className="nav-count">১৩</span>}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="dream-card"><Sprout size={27} strokeWidth={1.5} /><strong>স্বপ্নটা তোমার।<br />প্রস্তুতিও তোমার।</strong><p>আজকের ছোট চেষ্টাই<br />আগামীকের বড় আত্মবিশ্বাস।</p><span>A+ এর পথে <ArrowUpRight size={13} /></span></div><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><SettingsIcon size={19} strokeWidth={1.7} /><span>সেটিংস ও ব্যাকআপ</span></button><div className="sidebar-profile"><span className="avatar">{data.settings.name.trim().slice(0, 1) || 'প'}</span><div><strong>{data.settings.name || 'আমার প্রস্তুতি'}</strong><span>{data.settings.board} বোর্ড · বিজ্ঞান</span></div><span className="status-dot" /></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileMenu(true)} aria-label="মেনু খুলো"><Menu size={22} /></button><div className="breadcrumb"><span>আমার প্রস্তুতি</span><ChevronRight size={14} /><strong>{currentNav?.label || 'সেটিংস ও ব্যাকআপ'}</strong></div></div><div className="topbar-actions"><button className="global-search" aria-label="অধ্যায় বা রুটিন খুঁজো" onClick={() => setModal({ type: 'search' })}><Search size={16} /><span>অধ্যায় বা রুটিন খুঁজো…</span><kbd><Command size={11} /> K</kbd></button><span className="topbar-divider" /><button className="icon-button notification-button" onClick={() => navigate('reminders')} aria-label="রিমাইন্ডার"><Bell size={19} strokeWidth={1.7} />{data.settings.reminderEnabled && <span />}</button><button className="topbar-avatar" onClick={() => navigate('settings')} aria-label="প্রোফাইল ও সেটিংস">{data.settings.name.trim().slice(0, 1) || 'প'}</button></div></header>
      <main id="main-content" className="main-content" tabIndex={-1}>{!storageOk && <div className="storage-warning"><ShieldCheck size={18} /><p>ব্রাউজারে তথ্য সেভ করা যাচ্ছে না। স্টোরেজ খালি করো এবং যাওয়ার আগে JSON ব্যাকআপ রাখো।</p><button className="text-button" onClick={() => navigate('settings')}>ব্যাকআপ</button></div>}<ViewComponent /></main>
    </div><nav className="mobile-bottom-nav" aria-label="মোবাইল নেভিগেশন">{NAV.slice(0, 5).map(n => <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => navigate(n.id)}><n.icon size={20} strokeWidth={1.7} /><span>{n.label}</span></button>)}</nav>
  </div>
  {modal?.type === 'chapter' && <ChapterModal chapter={modal.chapter} onClose={() => setModal(null)} />}
  {modal?.type === 'exam' && <ExamModal paperId={modal.paperId} onClose={() => setModal(null)} />}
  {modal?.type === 'mistake' && <MistakeModal subject={modal.subject} initialText={modal.text} onClose={() => setModal(null)} />}
  {modal?.type === 'search' && <SearchModal onClose={() => setModal(null)} onChapter={c => setModal({ type: 'chapter', chapter: c })} />}
  {confirmRequest && <Modal title={confirmRequest.title} onClose={() => setConfirmRequest(null)}><p className="confirm-message">{confirmRequest.message}</p><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmRequest(null)}>বাতিল</button><button className={`button ${confirmRequest.danger ? 'danger' : 'primary'}`} onClick={() => { const action = confirmRequest.action; setConfirmRequest(null); action(); }}>{confirmRequest.label || 'নিশ্চিত করো'}</button></div></Modal>}
  {toast && <div className={`toast ${toast.type}`} role="status" aria-live="polite"><span>{toast.type === 'success' ? <Check size={18} /> : toast.type === 'error' ? <X size={18} /> : <Bell size={18} />}</span><p>{toast.message}</p><button onClick={() => setToast(null)} aria-label="বার্তা বন্ধ করো"><X size={16} /></button></div>}
  </PlannerContext.Provider>;
}
function subjectIds(s: string): SubjectId { return SUBJECTS.some(x => x.id === s) ? s as SubjectId : 'physics'; }

function ChapterModal({ chapter: c, onClose }: { chapter: Chapter; onClose: () => void }) {
  const { plan, data, setData, navigate, toggleTask } = usePlannerSafe();
  const tasks = chapterTasks(plan, c.id), done = tasks.filter(t => data.completed[t.id]).length;
  return <Modal title={c.title} onClose={onClose} wide><div className="chapter-modal-meta"><SubjectBadge subject={c.subject} /><span>পত্র {bn(c.paper)} · পাঠ/অধ্যায় {bn(c.number)}</span><span className={`priority-badge ${c.priority.toLowerCase()}`}>{c.priority} · {c.priority === 'A' ? 'আগে পড়ো' : 'এরপর পড়ো'}</span></div><p className="modal-description">{c.focus}</p>{c.note && <div className="notice-box"><BookOpen size={18} /><p>{c.note}</p></div>}<div className="chapter-modal-progress"><span>{bn(done)}/{bn(tasks.length)} ধাপ শেষ · {isChapterDone(plan, c.id, data.completed) ? 'অধ্যায় সম্পন্ন' : 'প্রতিটি ধাপ আলাদাভাবে টিক দাও'}</span><ProgressBar value={percent(done, tasks.length)} /></div><div className="chapter-session-list">{tasks.map(t => <div key={t.id} className="chapter-session"><button className={`task-check ${data.completed[t.id] ? 'checked' : ''}`} aria-pressed={!!data.completed[t.id]} aria-label={`${formatDate(t.date)} ধাপ সম্পন্ন`} onClick={() => toggleTask(t.id)}>{data.completed[t.id] && <Check size={16} />}</button><div><strong>{formatDate(t.date, 'long')} · ধাপ {bn(t.id.split('-').pop() || '1')}</strong><span>{formatTime(t.startMinute)}{formatDayOffset(t.startMinute)} – {formatTime(t.endMinute)}{formatDayOffset(t.endMinute)}</span><p>{t.detail}</p></div></div>)}</div>{!tasks.length && <EmptyState title="এই ইউনিটের তারিখ পাওয়া যায়নি" description="সেটিংস থেকে শুরুর তারিখ যাচাই করো।" />}<div className="confidence-section"><strong>এই অধ্যায়ে কতটা আত্মবিশ্বাসী?</strong><div>{(['weak', 'okay', 'confident'] as const).map((level, i) => <button key={level} className={`button secondary ${data.confidence[c.id] === level ? 'selected' : ''}`} aria-pressed={data.confidence[c.id] === level} onClick={() => setData(d => ({ ...d, confidence: { ...d.confidence, [c.id]: level } }))}>{['আবার দেখব', 'মোটামুটি বুঝি', 'আত্মবিশ্বাসী'][i]}</button>)}</div><small>এটি নিজের মূল্যায়ন; সম্পন্ন ধাপের সংখ্যা বদলায় না।</small></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>বন্ধ করো</button>{tasks[0] && <button className="button primary" onClick={() => { navigate('today', tasks[0].date); onClose(); }}>রুটিনে দেখো <ArrowRight size={16} /></button>}</div></Modal>;
}
function ExamModal({ paperId, onClose }: { paperId: string; onClose: () => void }) {
  const { data, setData, plan, notify } = usePlannerSafe();
  const paper = PAPERS.find(p => p.id === paperId)!;
  const existing = data.exams[paperId];
  const [score, setScore] = useState(existing ? String(existing.score) : '');
  const [mistakes, setMistakes] = useState(existing?.mistakes || '');
  const [error, setError] = useState('');
  const task = plan.flatMap(d => d.tasks).find(t => t.kind === 'exam' && t.paperId === paperId);
  const submit = (e: FormEvent) => {
    e.preventDefault(); const n = Number(score);
    if (!score.trim() || !Number.isFinite(n) || n < 0 || n > paper.maxScore) { setError(`০ থেকে ${bn(paper.maxScore)}-এর মধ্যে নম্বর লেখো।`); return; }
    setData(d => ({ ...d, exams: { ...d.exams, [paperId]: { score: n, total: paper.maxScore, at: nowIso(), mistakes: mistakes.trim() } }, completed: task && !d.completed[task.id] ? { ...d.completed, [task.id]: nowIso() } : d.completed }));
    notify('মডেল টেস্টের নম্বর সেভ হয়েছে। ভুলগুলো থেকে শেখা চালিয়ে যাও।'); onClose();
  };
  return <Modal title={`${paper.name} · নম্বর`} onClose={onClose}><div className="chapter-modal-meta"><SubjectBadge subject={paper.subject} /><span>{task && formatDate(task.date, 'long')}</span></div><p className="modal-description">নিজে মূল্যায়ন করা তত্ত্বীয় নম্বর লেখো। এটি বোর্ডের ফল বা GPA হিসাব নয়।</p><form onSubmit={submit}><div className="score-input-row"><label>তোমার নম্বর<input data-autofocus type="number" min={0} max={paper.maxScore} step="0.5" required value={score} onChange={e => { setScore(e.target.value); setError(''); }} placeholder="যেমন ৭২" /></label><span>/ {bn(paper.maxScore)}</span></div>{error && <p className="field-error" role="alert">{error}</p>}<label className="form-label">কোথায় নম্বর হারালে?<textarea value={mistakes} maxLength={5000} rows={5} onChange={e => setMistakes(e.target.value)} placeholder="অধ্যায়/টপিক, ভুলের কারণ, পরেরবার কী করবে…" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button type="submit" className="button primary"><Check size={16} />নম্বর সেভ করো</button></div></form></Modal>;
}
function MistakeModal({ subject, initialText, onClose }: { subject: SubjectId; initialText: string; onClose: () => void }) {
  const { data, setData, today, notify } = usePlannerSafe();
  const [s, setS] = useState(subject), [textValue, setTextValue] = useState(initialText), [error, setError] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (!textValue.trim()) { setError('কী ভুল হয়েছে, ছোট করে লেখো।'); return; } if (data.mistakes.length >= MISTAKE_LIMIT) { setError(`ভুলের খাতায় সর্বোচ্চ ${MISTAKE_LIMIT}টি নোট রাখা যায়। আগে কিছু নোট মুছে নাও।`); return; } setData(d => ({ ...d, mistakes: [...d.mistakes, { id: newId(), subject: s, text: textValue.trim(), date: today, resolved: false }] })); notify('ভুলের খাতায় যোগ হয়েছে। পরে শুধরে নিও।'); onClose(); };
  return <Modal title="ভুল থেকেই শেখা" onClose={onClose}><p className="modal-description">একটি ভুল, তার কারণ, আর পরেরবার কী করবে—লিখে রাখো।</p><form onSubmit={submit}><label className="form-label">বিষয়<select value={s} onChange={e => setS(e.target.value as SubjectId)}>{SUBJECTS.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}</select></label><label className="form-label">আমার নোট<textarea data-autofocus rows={5} maxLength={5000} value={textValue} onChange={e => { setTextValue(e.target.value); setError(''); }} placeholder="যেমন: ভেক্টরের ক্রস গুণে দিক ভুল করেছি। ডান হাতের নিয়ম আবার অনুশীলন করব।" /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button className="button primary" type="submit"><NotebookPen size={16} />যোগ করো</button></div></form></Modal>;
}
function SearchModal({ onClose, onChapter }: { onClose: () => void; onChapter: (c: Chapter) => void }) {
  const { plan, data, today, navigate, selectedDate } = usePlannerSafe();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const chapters = (q ? CHAPTERS.filter(c => `${c.title} ${c.number} ${c.focus} ${subjectById[c.subject].name} ${subjectById[c.subject].english}`.toLowerCase().includes(q)) : CHAPTERS.filter(c => c.priority === 'A')).slice(0, 7);
  const tasks = (q ? plan.flatMap(d => d.tasks).filter(t => `${t.title} ${t.date} ${subjectById[t.subject].name}`.toLowerCase().includes(q)) : plan.find(d => d.date === selectedDate)?.tasks || []).slice(0, 10);
  return <Modal title="কী খুঁজছ?" onClose={onClose} wide><label className="search-field modal-search"><Search size={20} /><input data-autofocus value={query} onChange={e => setQuery(e.target.value)} placeholder="অধ্যায়, বিষয় বা তারিখ (YYYY-MM-DD)…" aria-label="অধ্যায় ও রুটিন খুঁজো" /><kbd>ESC</kbd></label><div className="search-results">{chapters.length > 0 && <><div className="search-group-label">অধ্যায় ও ইউনিট</div>{chapters.map(c => <button className="search-result" key={c.id} onClick={() => onChapter(c)}><span className="search-result-icon" style={{ color: subjectById[c.subject].color, background: subjectById[c.subject].tint } as CSSProperties}><BookOpen size={18} /></span><span><strong>{c.title}</strong><small>{subjectById[c.subject].name} · পত্র {bn(c.paper)} · অগ্রাধিকার {c.priority}</small></span><ChevronRight size={17} /></button>)}</>}{tasks.length > 0 && <><div className="search-group-label">{q ? 'রুটিনের সেশন' : `${formatDate(selectedDate)}-এর রুটিন`}</div>{tasks.map(t => <button className="search-result" key={t.id} onClick={() => { navigate('today', t.date); onClose(); }}><span className="search-result-icon"><CalendarDays size={18} /></span><span><strong>{t.title}</strong><small>{formatDate(t.date)} · {formatTime(t.startMinute)}{formatDayOffset(t.startMinute)} · {phaseName(t.phase)}{data.completed[t.id] ? ' · সম্পন্ন' : ''}</small></span><ArrowUpRight size={17} /></button>)}</>}{!chapters.length && !tasks.length && <EmptyState title="কিছু পাওয়া যায়নি" description="বিষয়ের নাম, অধ্যায়ের শব্দ বা তারিখ দিয়ে আবার খুঁজো।" />}</div><div className="search-footer"><span>{bn(CHAPTERS.length)} অধ্যায়/ইউনিট · {bn(plan.length)} দিন</span><button className="text-button" onClick={() => { navigate('calendar', today); onClose(); }}>ক্যালেন্ডার দেখো <ArrowRight size={14} /></button></div></Modal>;
}
// Imported separately to keep modal components readable without prop drilling.
import { usePlanner as usePlannerSafe } from './context';
