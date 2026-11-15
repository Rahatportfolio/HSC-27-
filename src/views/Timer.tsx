import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlarmClock, BellRing, CheckCircle2, Clock3, Coffee, Maximize2, Minimize2, Pause, Play, Plus, RotateCcw, Save, Sun, Timer as TimerIcon, Trash2, TrendingUp } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, sortChapters, subjectById } from '../data';
import type { SubjectId } from '../data';
import { addDays, bn, formatDate, percent } from '../planner';
import { minutesBetween, minutesOn, startOfWeek } from '../analytics';
import { deleteStudySession } from '../study';
import { PageHeading, ProgressBar, ProgressRing } from '../components';

const pad = (value: number): string => bn(String(value).padStart(2, '0'));
function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
const PHASE_LABEL = { focus: 'ফোকাস সময়', short: 'ছোট বিরতি', long: 'লম্বা বিরতি', none: 'টাইমার' } as const;
export default function TimerView() {
  const { data, setData, today, timer, logSession, notify, confirm, navigate, screenAwake } = usePlanner();
  const [manualMinutes, setManualMinutes] = useState('30');
  const [manualSubject, setManualSubject] = useState<SubjectId>('physics');
  const [manualChapter, setManualChapter] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('focus-mode', focusMode);
    return () => document.documentElement.classList.remove('focus-mode');
  }, [focusMode]);
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFocusMode(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFocusMode = async () => {
    const next = !focusMode;
    setFocusMode(next);
    try {
      if (next && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else if (!next && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* Fullscreen can be blocked; the CSS focus layout still works. */ }
  };
  const chapters = sortChapters(CHAPTERS.filter(chapter => chapter.subject === timer.subject));
  const todaySessions = data.studySessions.filter(session => session.date === today).sort((a, b) => b.at.localeCompare(a.at));
  const todayMinutes = minutesOn(data.studySessions, today);
  const weekMinutes = minutesBetween(data.studySessions, startOfWeek(today), addDays(startOfWeek(today), 6));
  const streakWithTimer = new Set(data.studySessions.map(session => session.date)).size;
  const ringProgress = timer.mode === 'stopwatch' ? (timer.elapsedSec % 3600) / 36 : timer.progress;
  const canSaveStopwatch = timer.mode === 'stopwatch' && timer.elapsedSec >= 60;
  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const minutes = Math.round(Number(manualMinutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) { notify('১ থেকে ৭২০ মিনিটের মধ্যে সময় লেখো।', 'error'); return; }
    logSession({ minutes, subject: manualSubject, chapterId: manualChapter || undefined, mode: 'stopwatch', label: manualLabel.trim() || 'ম্যানুয়াল এন্ট্রি' });
    setManualLabel('');
    notify(`${bn(minutes)} মিনিটের সেশন যোগ হয়েছে।`, 'success');
  };
  return <div className="view timer-view">
    <button className="focus-toggle button secondary small" onClick={() => void toggleFocusMode()} aria-pressed={focusMode}>{focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{focusMode ? 'ফোকাস বন্ধ' : 'ফোকাস মোড'}</button>
    <PageHeading eyebrow="FOCUS, THEN REST" title="সময় গুনি, মন দিই।" titleEn="Count the time, keep the mind." description="স্টপওয়াচ, কাউন্টডাউন বা পোমোডোরো—যেভাবে ভালো লাগে। প্রতিটি সেশন বিষয় ও অধ্যায়ের সঙ্গে অটো সেভ হয়।" descriptionEn="Stopwatch, countdown or Pomodoro. Every session is saved with its subject and chapter." action={<div className="timer-header-total"><Clock3 size={17} /><span>আজ</span><strong>{bn(Math.floor(todayMinutes / 60))}ঘ {bn(todayMinutes % 60)}মি</strong></div>} />
    <div className="timer-layout">
      <section className={`card timer-main-card phase-${timer.phase}`}>
        <div className="mode-switch">{(['pomodoro', 'countdown', 'stopwatch'] as const).map(mode => <button key={mode} className={timer.mode === mode ? 'active' : ''} onClick={() => timer.setMode(mode)} disabled={timer.running}>{mode === 'pomodoro' ? 'পোমোডোরো' : mode === 'countdown' ? 'কাউন্টডাউন' : 'স্টপওয়াচ'}</button>)}</div>
        <div className="timer-phase-line"><span className={`phase-dot ${timer.phase}`} />{timer.mode === 'pomodoro' ? PHASE_LABEL[timer.phase] : timer.mode === 'countdown' ? (timer.logging ? 'কাউন্টডাউন' : 'বিরতি') : 'স্টপওয়াচ'}<small>{timer.focusCount ? `${bn(timer.focusCount)}টি ফোকাস সম্পন্ন` : ''}</small>{screenAwake && <span className="wake-chip" title="সেশন চলার সময় ফোনের স্ক্রিন বন্ধ হবে না"><Sun size={12} />স্ক্রিন জেগে আছে</span>}</div>
        <ProgressRing value={ringProgress} size={270} stroke={9} color={timer.phase === 'short' || timer.phase === 'long' ? '#d8b26a' : '#8fb573'}>
          <strong className="timer-big-digits">{clock(timer.mode === 'stopwatch' ? timer.elapsedSec : timer.remainingSec)}</strong>
          <span>{timer.running ? 'মনোযোগ ধরে রাখো' : timer.mode === 'stopwatch' ? 'শুরু করলে সময় জমবে' : 'শুরু করার জন্য তৈরি'}</span>
        </ProgressRing>
        <div className="timer-controls"><button className="timer-main-button" onClick={timer.running ? timer.pause : timer.start}>{timer.running ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}{timer.running ? 'বিরতি' : 'শুরু করো'}</button><button className="timer-reset-button" onClick={timer.reset} aria-label="রিসেট"><RotateCcw size={18} /></button>{timer.mode === 'stopwatch' && <button className="button secondary" disabled={!canSaveStopwatch} onClick={timer.saveStopwatch}><Save size={16} />সেশন সেভ</button>}</div>
        {timer.mode !== 'stopwatch' && <div className="timer-presets">{[15, 25, 45, 60, 90].map(minutes => <button key={minutes} disabled={timer.running} className={timer.durationMin === minutes ? 'active' : ''} onClick={() => timer.setDuration(minutes)}>{bn(minutes)} মি.</button>)}<label className="custom-duration">নিজের<input type="number" min={1} max={180} value={timer.durationMin} disabled={timer.running} onChange={e => timer.setDuration(Number(e.target.value))} /><span>মিনিট</span></label></div>}
        <div className="timer-tagging">
          <label>বিষয়<select value={timer.subject} onChange={e => timer.setSubject(e.target.value as SubjectId)}>{SUBJECTS.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label>অধ্যায় (ঐচ্ছিক)<select value={timer.chapterId} onChange={e => timer.setChapter(e.target.value)}><option value="">অধ্যায় বাছো</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
          <label>লেবেল (ঐচ্ছিক)<input maxLength={120} value={timer.label} onChange={e => timer.setLabel(e.target.value)} placeholder="যেমন: সূত্র ঝালাই" /></label>
        </div>
        <p className="timer-note"><BellRing size={13} /> ফোন লক থাকলেও সেশন শেষ হলে নোটিফিকেশন পাবে। অ্যাপ বন্ধ হলেও টাইমার ঘড়ির হিসাবে চলবে; ফিরে এলে বাকি সময় ঠিক দেখাবে। {timer.mode === 'pomodoro' && `ফোকাস ${bn(data.settings.pomodoroFocus)} মি. · ছোট বিরতি ${bn(data.settings.pomodoroBreak)} মি. · ৪ ফোকাস পর ${bn(data.settings.pomodoroLongBreak)} মি.`}</p>
      </section>
      <aside className="timer-rail">
        <section className="card break-card"><div className="card-heading"><h3><Coffee size={18} />বিরতি টাইমার</h3><span className="tiny-muted">পড়া হিসেবে গোনা হবে না</span></div><p>চোখ বন্ধ করো, পানি খাও, একটু হাঁটো। ছোট বিরতিই মন ভালো রাখে।</p><div className="break-buttons">{[5, 10, 15].map(minutes => <button key={minutes} className="button secondary small" onClick={() => timer.startBreak(minutes)}><TimerIcon size={15} />{bn(minutes)} মিনিট</button>)}</div></section>
        <section className="card session-summary"><div className="card-heading"><h3>আজকের মাপা সময়</h3><span className="tiny-muted">{bn(todaySessions.length)}টি সেশন</span></div><div className="session-big">{bn(Math.floor(todayMinutes / 60))}<small>ঘ</small> {bn(todayMinutes % 60)}<small>মি</small></div><ProgressBar value={percent(todayMinutes, data.settings.dailyHours * 60)} /><div className="session-meta"><span>লক্ষ্য {bn(data.settings.dailyHours)} ঘণ্টা</span><span>সপ্তাহে {bn(Math.floor(weekMinutes / 60))} ঘণ্টা</span></div><div className="session-stats"><span><TrendingUp size={14} />{bn(streakWithTimer)} দিনে টাইমার</span><span><CheckCircle2 size={14} />{bn(data.focus.sessions)} সেশন সর্বকালীন</span></div></section>
        <section className="card manual-card"><div className="card-heading"><h3><Plus size={17} />ম্যানুয়াল সময় যোগ</h3><span className="tiny-muted">টাইমার ছাড়া পড়লে</span></div><form onSubmit={submitManual} className="manual-form"><label>মিনিট<input type="number" min={1} max={720} value={manualMinutes} onChange={e => setManualMinutes(e.target.value)} required /></label><label>বিষয়<select value={manualSubject} onChange={e => { setManualSubject(e.target.value as SubjectId); setManualChapter(''); }}>{SUBJECTS.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>অধ্যায়<select value={manualChapter} onChange={e => setManualChapter(e.target.value)}><option value="">ঐচ্ছিক</option>{CHAPTERS.filter(chapter => chapter.subject === manualSubject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label>নোট<input value={manualLabel} maxLength={120} onChange={e => setManualLabel(e.target.value)} placeholder="ঐচ্ছিক" /></label><button className="button primary" type="submit"><Plus size={16} />যোগ করো</button></form></section>
      </aside>
    </div>
    <section className="card sessions-card">
      <div className="card-heading"><div><h2>আজকের সেশন</h2><p>টাইমার বা ম্যানুয়াল—সব এখানে। ভুল হলে মুছে দিতে পারো।</p></div><button className="text-button" onClick={() => navigate('analytics')}>বিশ্লেষণ দেখো <TrendingUp size={14} /></button></div>
      {todaySessions.length ? <div className="session-list">{todaySessions.map(session => <div key={session.id} className="session-row"><span className="session-icon" style={{ color: subjectById[session.subject].color, background: subjectById[session.subject].tint }}><Clock3 size={17} /></span><div><strong>{chapterById[session.chapterId || '']?.title || session.label || subjectById[session.subject].name}</strong><span>{subjectById[session.subject].name} · {formatDate(session.date)} · {new Intl.DateTimeFormat('bn-BD', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }).format(new Date(session.at))} · {session.mode === 'pomodoro' ? 'পোমোডোরো' : session.mode === 'countdown' ? 'কাউন্টডাউন' : session.mode === 'stopwatch' ? 'স্টপওয়াচ' : 'সেশন'}</span></div><strong className="session-minutes">{bn(session.minutes)} মি.</strong><button className="icon-button delete-button" aria-label="সেশন মুছো" onClick={() => confirm({ title: 'সেশনটি মুছে ফেলবে?', message: `${bn(session.minutes)} মিনিটের এই সেশনটি মুছে গেলে মোট সময় থেকেও বাদ যাবে।`, label: 'মুছে ফেলো', danger: true, action: () => { setData(d => deleteStudySession(d, session.id)); notify('সেশন মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={15} /></button></div>)}</div> : <div className="empty-inline"><AlarmClock size={22} /><div><strong>আজ এখনও কোনো সেশন নেই</strong><span>উপরের টাইমার চালু করো বা ম্যানুয়াল সময় যোগ করো।</span></div></div>}
    </section>
    <div className="revision-tip"><TimerIcon size={18} /><p><strong>টাইমার মানে চাপ নয়।</strong> ২৫ মিনিট একাগ্রতা, ৫ মিনিট বিশ্রাম—দীর্ঘ সময়ের চেয়ে নিয়মিত ছোট সেশন মস্তিষ্কে বেশি থাকে। মডেল টেস্টে সময় ধরে অনুশীলন করতে <button className="inline-link" onClick={() => navigate('exams')}>পরীক্ষার ঘড়ি</button> ব্যবহার করো।</p></div>
  </div>;
}
