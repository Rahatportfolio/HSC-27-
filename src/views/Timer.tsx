import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlarmClock, BellRing, CheckCircle2, Clock3, Coffee, Maximize2, Minimize2, Pause, Play, Plus, RotateCcw, Save, Sun, Timer as TimerIcon, Trash2, TrendingUp, Zap } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, sortChapters, subjectById } from '../data';
import type { SubjectId } from '../data';
import { addDays, bn, formatDate, percent } from '../planner';
import { minutesBetween, minutesOn, startOfWeek } from '../analytics';
import { deleteStudySession } from '../study';
import { CHAPTER_CLASSES } from '../classLinks';
import { ClassBlock, PageHeading, ProgressBar, ProgressRing } from '../components';
import { dailyTargetMinutes } from '../planner';
import { t } from '../i18n';
import { focusActions, focusReport, PART_LABEL, toBnDigits } from '../focus';
import { weaknessReport } from '../weakness';

const pad = (value: number): string => bn(String(value).padStart(2, '0'));
function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
// A plain object would freeze the language at import time, so resolve per render.
const phaseLabel = (phase: 'focus' | 'short' | 'long' | 'none'): string =>
  phase === 'focus' ? t('ফোকাস সময়', 'Focus')
    : phase === 'short' ? t('ছোট বিরতি', 'Short break')
      : phase === 'long' ? t('লম্বা বিরতি', 'Long break')
        : t('টাইমার', 'Timer');
export default function TimerView() {
  const { data, setData, plan, today, now, timer, logSession, notify, confirm, navigate, screenAwake, serviceRunning } = usePlanner();
  const todayTargetHours = dailyTargetMinutes(data,today)/60;
  const [manualMinutes, setManualMinutes] = useState('30');
  const [manualSubject, setManualSubject] = useState<SubjectId>('physics');
  const [manualChapter, setManualChapter] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  // Everything on this panel is derived from saved sessions; nothing is estimated.
  const focus = focusReport(data, today, 28, now.getTime());
  const weakIds = weaknessReport(plan, data, today).filter(row => row.score >= 5).map(row => row.chapterId);
  const actions = focusActions(focus, weakIds);
  const startAction = (action: (typeof actions)[number]) => {
    if (action.chapterId) timer.setChapter(action.chapterId);
    if (action.subject) timer.setSubject(action.subject);
    timer.setDuration(action.minutes);
    notify(t(`${toBnDigits(action.minutes)} মিনিটের ব্লক তৈরি—শুরু করো।`, `${action.minutes}-minute block ready — press start.`), 'info');
  };
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
  const resetTimer = () => {
    if (!timer.running && timer.accumulatedMs === 0) { timer.reset(); return; }
    confirm({ title: t('টাইমার রিসেট করবে?', 'Reset the timer?'), message: t('এই সেশনের সময় সেভ হবে না।', 'This session will not be saved.'), danger: true, label: t('রিসেট করো', 'Reset'), action: timer.reset });
  };
  const startBreak = (minutes: number) => {
    const action = () => timer.startBreak(minutes);
    if (!timer.running && timer.accumulatedMs === 0) { action(); return; }
    confirm({ title: t('চলমান সেশন বদলে বিরতি চালাবে?', 'Replace this session with a break?'), message: t('আগের সেশনের সময় সেভ হবে না।', 'The previous session will not be saved.'), label: t('বিরতি চালাও', 'Start break'), action });
  };
  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const minutes = Math.round(Number(manualMinutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) { notify(t('১ থেকে ৭২০ মিনিটের মধ্যে সময় লেখো।', 'Enter a time between 1 and 720 minutes.'), 'error'); return; }
    logSession({ minutes, subject: manualSubject, chapterId: manualChapter || undefined, mode: 'stopwatch', label: manualLabel.trim() || t('ম্যানুয়াল এন্ট্রি', 'Manual entry') });
    setManualLabel('');
    notify(t(`${bn(minutes)} মিনিটের সেশন যোগ হয়েছে।`, `${minutes}-minute session added.`), 'success');
  };
  return <div className="view timer-view">
    <button className="focus-toggle button secondary small" onClick={() => void toggleFocusMode()} aria-pressed={focusMode}>{focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{focusMode ? t('ফোকাস বন্ধ', 'Exit focus') : t('ফোকাস মোড', 'Focus mode')}</button>
    <PageHeading eyebrow="FOCUS, THEN REST" title="সময় গুনি, মন দিই।" titleEn="Count the time, keep the mind." description="স্টপওয়াচ, কাউন্টডাউন বা পোমোডোরো—যেভাবে ভালো লাগে। প্রতিটি সেশন বিষয় ও অধ্যায়ের সঙ্গে অটো সেভ হয়।" descriptionEn="Stopwatch, countdown or Pomodoro. Every session is saved with its subject and chapter." action={<div className="timer-header-total"><Clock3 size={17} /><span>{t("আজ", "Today")}</span><strong>{bn(Math.floor(todayMinutes / 60))}{t('ঘ','h')} {bn(todayMinutes % 60)}{t('মি','m')}</strong></div>} />
    <div className="timer-layout">
      <section className={`card timer-main-card phase-${timer.phase}`}>
        <div className="mode-switch">{(['pomodoro', 'countdown', 'stopwatch'] as const).map(mode => <button key={mode} className={timer.mode === mode ? 'active' : ''} onClick={() => timer.setMode(mode)} disabled={timer.running || timer.accumulatedMs > 0}>{mode === 'pomodoro' ? t('পোমোডোরো', 'Pomodoro') : mode === 'countdown' ? t('কাউন্টডাউন', 'Countdown') : t('স্টপওয়াচ', 'Stopwatch')}</button>)}</div>
        <div className="timer-phase-line"><span className={`phase-dot ${timer.phase}`} />{timer.mode === 'pomodoro' ? phaseLabel(timer.phase) : timer.mode === 'countdown' ? (timer.logging ? t('কাউন্টডাউন', 'Countdown') : t('বিরতি', 'Break')) : t('স্টপওয়াচ', 'Stopwatch')}<small>{timer.focusCount ? t(`${bn(timer.focusCount)}টি ফোকাস সম্পন্ন`, `${timer.focusCount} focus sessions done`) : ''}</small>{focus.breakDue && <span className="wake-chip break-chip" title={t('একটানা পড়ার পর বিরতি দরকার', 'A break is due after this long run')}><Coffee size={12} />{t(`${toBnDigits(focus.continuousMinutes)} মিনিট একটানা—বিরতি নাও`, `${focus.continuousMinutes} min unbroken — break due`)}</span>}
{serviceRunning && <span className="wake-chip service-chip" title={t("Android ফোরগ্রাউন্ড সার্ভিস চালু", "Android foreground service is on")}><Clock3 size={12} />{t("ব্যাকগ্রাউন্ডে চলছে", "Running in background")}</span>}{screenAwake && <span className="wake-chip" title={t("সেশন চলার সময় ফোনের স্ক্রিন বন্ধ হবে না", "The screen stays on during a session")}><Sun size={12} />{t("স্ক্রিন জেগে আছে", "Screen is awake")}</span>}</div>
        <ProgressRing value={ringProgress} size={270} stroke={9} color={timer.phase === 'short' || timer.phase === 'long' ? '#d8b26a' : '#8fb573'}>
          <strong className="timer-big-digits">{clock(timer.mode === 'stopwatch' ? timer.elapsedSec : timer.remainingSec)}</strong>
          <span>{timer.running ? t('মনোযোগ ধরে রাখো', 'Stay with it') : timer.mode === 'stopwatch' ? t('শুরু করলে সময় জমবে', 'Start to bank time') : t('শুরু করার জন্য তৈরি', 'Ready to start')}</span>
        </ProgressRing>
        <div className="timer-controls"><button className="timer-main-button" onClick={timer.running ? timer.pause : timer.start}>{timer.running ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}{timer.running ? t('বিরতি', 'Pause') : t('শুরু করো', 'Start')}</button><button className="timer-reset-button" onClick={resetTimer} aria-label={t("রিসেট", "Reset")}><RotateCcw size={18} /></button>{timer.mode === 'stopwatch' && <button className="button secondary" disabled={!canSaveStopwatch} onClick={timer.saveStopwatch}><Save size={16} />{t("সেশন সেভ", "Save session")}</button>}</div>
        {!timer.running && timer.accumulatedMs > 0 && <p className="tiny-muted">{t('নতুন মোড বা সময় বাছতে আগে টাইমার রিসেট করো।', 'Reset the timer before choosing a new mode or duration.')}</p>}
        {timer.mode !== 'stopwatch' && <div className="timer-presets">{[25, 45, 60, 120, 180, 240].map(minutes => <button key={minutes} disabled={timer.running || timer.accumulatedMs > 0} className={timer.durationMin === minutes ? 'active' : ''} onClick={() => timer.setDuration(minutes)}>{minutes >= 60 ? t(`${bn(minutes / 60)} ঘ.`, `${minutes / 60}h`) : t(`${bn(minutes)} মি.`, `${minutes}m`)}</button>)}<label className="custom-duration">{t("নিজের", "Own")}<input type="number" min={1} max={720} value={timer.durationMin} disabled={timer.running || timer.accumulatedMs > 0} onChange={e => timer.setDuration(Number(e.target.value))} /><span>{t("মিনিট", "min")}</span></label></div>}
        <div className="timer-tagging">
          <label>{t("বিষয়", "Subject")}<select value={timer.subject} onChange={e => timer.setSubject(e.target.value as SubjectId)}>{SUBJECTS.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label>{t("অধ্যায় (ঐচ্ছিক)", "Chapter (optional)")}<select value={timer.chapterId} onChange={e => timer.setChapter(e.target.value)}><option value="">{t("অধ্যায় বাছো", "Pick a chapter")}</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
          <label>{t("লেবেল (ঐচ্ছিক)", "Label (optional)")}<input maxLength={120} value={timer.label} onChange={e => timer.setLabel(e.target.value)} placeholder={t("যেমন: সূত্র ঝালাই", "e.g. formula drill")} /></label>
        </div>
        {timer.chapterId && CHAPTER_CLASSES[timer.chapterId] && (
          <div className="timer-chapter-classes">
            <div className="timer-chapter-classes-head">
              <strong>{chapterById[timer.chapterId]?.title} — {t('সরাসরি ক্লাস ব্লক', 'Direct class blocks')}</strong>
              <small>{t('টাইমার চালু রেখে এক ক্লিকে ক্লাস দেখো', 'Watch any class with timer running')}</small>
            </div>
            <ClassBlock classes={CHAPTER_CLASSES[timer.chapterId]} compact />
          </div>
        )}
        <p className="timer-note"><BellRing size={13} /> {t('অন্য অ্যাপে ক্লাস দেখার আগে উপরের ভাসমান ঘড়ি বেছে নাও। নোটিফিকেশনের অনুমতি থাকলে সেশন শেষের সতর্কতা পাওয়া যায়; ফোনের ব্যাটারি নিয়মে দেরি হতে পারে।', 'Choose Float above before opening a class in another app. With notification permission, the session-end alert is available; battery restrictions may delay it.')} {timer.mode === 'pomodoro' && `${t('ফোকাস', 'Focus')} ${bn(data.settings.pomodoroFocus)} ${t('মি.', 'min')} · ${t('ছোট বিরতি', 'short break')} ${bn(data.settings.pomodoroBreak)} ${t('মি.', 'min')} · ${t('৪ ফোকাস পর', 'after 4 focus blocks')} ${bn(data.settings.pomodoroLongBreak)} ${t('মি.', 'min')}`}</p>
      </section>
      <aside className="timer-rail">
        <section className="card focus-next-card">
          <div className="card-heading"><h3><Zap size={18} />{t('এখন কী করবে', 'What to do now')}</h3><span className="tiny-muted">{t('সংখ্যা থেকে', 'From your numbers')}</span></div>
          <div className="focus-action-list">{actions.map(action => <button key={action.key} className="focus-action" onClick={() => startAction(action)}><span>{t(action.bn, action.en)}</span><small>{toBnDigits(action.minutes)} {t('মিনিট', 'min')}</small></button>)}</div>
          <p className="tiny-muted">{t('ব্লক বাছলে টাইমার তৈরি হয়ে যায়—শুরু কেবল তোমার হাতে।', 'Picking a block only sets the timer — starting stays in your hands.')}</p>
        </section>
        <section className="card break-card"><div className="card-heading"><h3><Coffee size={18} />{t("বিরতি টাইমার", "Break timer")}</h3><span className="tiny-muted">{t("পড়া হিসেবে গোনা হবে না", "Won't count as study")}</span></div><p>{t('চোখ বন্ধ করো, পানি খাও, একটু হাঁটো। ছোট বিরতিই মন ভালো রাখে।', 'Close your eyes, drink water, walk a little. Short breaks keep the mind fresh.')}</p><div className="break-buttons">{[5, 10, 15].map(minutes => <button key={minutes} className="button secondary small" onClick={() => startBreak(minutes)}><TimerIcon size={15} />{t(`${bn(minutes)} মিনিট`, `${minutes} min`)}</button>)}</div></section>
        <section className="card session-summary"><div className="card-heading"><h3>{t("আজকের মাপা সময়", "Time measured today")}</h3><span className="tiny-muted">{t(`${bn(todaySessions.length)}টি সেশন`, `${todaySessions.length} sessions`)}</span></div><div className="session-big">{bn(Math.floor(todayMinutes / 60))}<small>{t("ঘ", "h")}</small> {bn(todayMinutes % 60)}<small>{t("মি", "m")}</small></div><ProgressBar value={percent(todayMinutes, todayTargetHours * 60)} /><div className="session-meta"><span>{t('লক্ষ্য', 'Goal')} {t(`${bn(todayTargetHours)} ঘণ্টা`, `${todayTargetHours}h`)}</span><span>{t('সপ্তাহে', 'This week')} {t(`${bn(Math.floor(weekMinutes / 60))} ঘণ্টা`, `${Math.floor(weekMinutes / 60)}h`)}</span></div><div className="session-stats"><span><TrendingUp size={14} />{t(`${bn(streakWithTimer)} দিনে টাইমার`, `${streakWithTimer} days with a timer`)}</span><span><CheckCircle2 size={14} />{t(`${bn(data.focus.sessions)} সেশন সর্বকালীন`, `${data.focus.sessions} sessions all-time`)}</span></div></section>
        <section className="card manual-card"><div className="card-heading"><h3><Plus size={17} />{t("ম্যানুয়াল সময় যোগ", "Add time manually")}</h3><span className="tiny-muted">{t("টাইমার ছাড়া পড়লে", "If you study without the timer")}</span></div><form onSubmit={submitManual} className="manual-form"><label>{t("মিনিট", "min")}<input type="number" min={1} max={720} value={manualMinutes} onChange={e => setManualMinutes(e.target.value)} required /></label><label>{t("বিষয়", "Subject")}<select value={manualSubject} onChange={e => { setManualSubject(e.target.value as SubjectId); setManualChapter(''); }}>{SUBJECTS.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={manualChapter} onChange={e => setManualChapter(e.target.value)}><option value="">{t("ঐচ্ছিক", "Optional")}</option>{CHAPTERS.filter(chapter => chapter.subject === manualSubject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label>{t("নোট", "Notes")}<input value={manualLabel} maxLength={120} onChange={e => setManualLabel(e.target.value)} placeholder={t("ঐচ্ছিক", "Optional")} /></label><button className="button primary" type="submit"><Plus size={16} />{t("যোগ করো", "Add")}</button></form></section>
      </aside>
    </div>
    <section className="card sessions-card">
      <div className="card-heading"><div><h2>{t("আজকের সেশন", "Today's sessions")}</h2><p>{t('টাইমার বা ম্যানুয়াল—সব এখানে। ভুল হলে মুছে দিতে পারো।', 'Timer or manual — it all lands here. Delete an entry if it is wrong.')}</p></div><button className="text-button" onClick={() => navigate('analytics')}>{t("বিশ্লেষণ দেখো", "See the analysis")}<TrendingUp size={14} /></button></div>
      {todaySessions.length ? <div className="session-list">{todaySessions.map(session => <div key={session.id} className="session-row"><span className="session-icon" style={{ color: subjectById[session.subject].color, background: subjectById[session.subject].tint }}><Clock3 size={17} /></span><div><strong>{chapterById[session.chapterId || '']?.title || session.label || subjectById[session.subject].name}</strong><span>{subjectById[session.subject].name} · {formatDate(session.date)} · {new Intl.DateTimeFormat('bn-BD', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }).format(new Date(session.at))} · {session.mode === 'pomodoro' ? t('পোমোডোরো', 'Pomodoro') : session.mode === 'countdown' ? t('কাউন্টডাউন', 'Countdown') : session.mode === 'stopwatch' ? t('স্টপওয়াচ', 'Stopwatch') : t('সেশন', 'Session')}</span></div><strong className="session-minutes">{t(`${bn(session.minutes)} মি.`, `${session.minutes}m`)}</strong><button className="icon-button delete-button" aria-label={t("সেশন মুছো", "Delete session")} onClick={() => confirm({ title: t('সেশনটি মুছে ফেলবে?', 'Delete this session?'), message: t(`${bn(session.minutes)} মিনিটের এই সেশনটি মুছে গেলে মোট সময় থেকেও বাদ যাবে।`, `Deleting this ${session.minutes}-minute session also removes the time from your totals.`), label: t('মুছে ফেলো', 'Delete'), danger: true, action: () => { setData(d => deleteStudySession(d, session.id)); notify(t('সেশন মুছে ফেলা হয়েছে।', 'Session deleted.'), 'info'); } })}><Trash2 size={15} /></button></div>)}</div> : <div className="empty-inline"><AlarmClock size={22} /><div><strong>{t("আজ এখনও কোনো সেশন নেই", "No session yet today")}</strong><span>{t('উপরের টাইমার চালু করো বা ম্যানুয়াল সময় যোগ করো।', 'Run the timer above or add time manually.')}</span></div></div>}
    </section>
    <section className="card focus-report-card">
      <div className="card-heading"><div><h2><TrendingUp size={18} />{t('ফোকাসের আসল ছবি · ২৮ দিন', 'The real focus picture · 28 days')}</h2><p>{t('সব সংখ্যা তোমার সেভ করা সেশন থেকে—কোনো অনুমান নয়।', 'Every number comes from your saved sessions — nothing estimated.')}</p></div><button className="text-button" onClick={() => navigate('analytics')}>{t('পুরো বিশ্লেষণ', 'Full analysis')}<TrendingUp size={14} /></button></div>
      <div className="focus-kpis">
        <div><span>{t('মোট সময়', 'Total time')}</span><strong>{bn(Math.floor(focus.minutes / 60))}<small>{t('ঘ', 'h')}</small> {bn(focus.minutes % 60)}<small>{t('মি', 'm')}</small></strong></div>
        <div><span>{t('সক্রিয় দিন', 'Active days')}</span><strong>{bn(focus.activeDays)}<small>/{bn(focus.quality.days)}</small></strong></div>
        <div><span>{t('গড় সেশন', 'Avg session')}</span><strong>{bn(focus.quality.averageSession)}<small>{t(' মি', ' min')}</small></strong></div>
        <div><span>{t('একটানা ধারা', 'Run')}</span><strong>{bn(focus.streak)}<small>{t(' দিন', ' days')}</small></strong></div>
      </div>
      <div className="focus-grid">
        <div className="focus-block">
          <h3>{t('দিনের কোন সময়ে পড়ো', 'When you actually study')}</h3>
          <div className="focus-hours">{focus.hours.map(cell => <span key={cell.hour} className={`focus-hour ${focus.bestHour?.hour === cell.hour ? 'best' : ''} ${cell.minutes ? 'has' : ''}`} title={t(`${toBnDigits(cell.hour)}টা · ${toBnDigits(cell.minutes)} মিনিট`, `${cell.hour}:00 · ${cell.minutes} min`)} style={{ height: `${Math.max(6, Math.round(cell.minutes / Math.max(1, ...focus.hours.map(item => item.minutes)) * 100))}%` }} />)}</div>
          <div className="focus-hours-axis">{[0, 6, 12, 18, 23].map(hour => <span key={hour}>{bn(String(hour).padStart(2, '0'))}</span>)}</div>
          <div className="focus-parts">{(['morning', 'afternoon', 'evening', 'night'] as const).map(part => <span key={part}><small>{t(PART_LABEL[part].bn, PART_LABEL[part].en)}</small><strong>{bn(focus.parts[part])}</strong></span>)}</div>
        </div>
        <div className="focus-block">
          <h3>{t('সেশন কেমন ছিল', 'What the sessions looked like')}</h3>
          <div className="focus-quality">
            <div><span>{t('১০ মিনিটের কম', 'Under 10 min')}</span><strong className={focus.quality.shortShare >= 40 ? 'warn' : ''}>{bn(focus.quality.shortSessions)}<small> ({bn(focus.quality.shortShare)}%)</small></strong></div>
            <div><span>{t('আড়াই ঘণ্টার বেশি', 'Over 2.5 h')}</span><strong>{bn(focus.quality.longSessions)}</strong></div>
            <div><span>{t('সেরা দিন', 'Best day')}</span><strong>{bn(focus.quality.bestDay)}<small>{t(' মি', ' min')}</small></strong></div>
            <div><span>{t('দীর্ঘতম একটানা', 'Longest run')}</span><strong>{bn(focus.longestSitting?.minutes ?? 0)}<small>{t(' মি', ' min')}</small></strong></div>
          </div>
        </div>
      </div>
      <div className="focus-insights">{focus.insights.map(insight => <div key={insight.key} className={`focus-insight ${insight.tone}`}><strong>{t(insight.titleBn, insight.titleEn)}</strong><span>{t(insight.detailBn, insight.detailEn)}</span></div>)}</div>
      <div className="focus-caveats">{focus.caveats.map(line => <p key={line}>{line}</p>)}</div>
    </section>
    <div className="revision-tip"><TimerIcon size={18} /><p><strong>{t("টাইমার মানে চাপ নয়।", "A timer is not pressure.")}</strong>{t(' ২৫ মিনিট একাগ্রতা, ৫ মিনিট বিশ্রাম—দীর্ঘ সময়ের চেয়ে নিয়মিত ছোট সেশন মস্তিষ্কে বেশি থাকে। মডেল টেস্টে সময় ধরে অনুশীলন করতে ', ' 25 minutes focused, 5 minutes resting — short regular sessions stick better than long ones. To practise under exam timing use ')}<button className="inline-link" onClick={() => navigate('exams')}>{t("পরীক্ষার ঘড়ি", "Exam clock")}</button>{t("ব্যবহার করো।", "use it.")}</p></div>
  </div>;
}
