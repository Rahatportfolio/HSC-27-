import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Flame, HeartPulse, ListChecks, Pause, Play, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, chapterById, subjectById } from '../data';
import { CHAPTER_SCHEDULE } from '../schedule';
import { CHAPTER_CLASSES } from '../classLinks';
import { addDays, bn, diffDays, formatDate, getStats, isValidDate, percent, phaseName } from '../planner';
import { minutesBetween, minutesOn, startOfWeek } from '../analytics';
import { revisionBuckets, INTERVAL_LABEL } from '../revision';
import { t } from '../i18n';
import { motivationFor } from '../motivation';
import { carryoversOn, pendingCarryovers, removeCarryover, toggleCarryover } from '../study';
import { ClassLinkRow, DaySummary, EmptyState, LocalNote, PhaseJourney, ProgressBar, StudyIllustration, SyllabusNotice, TaskCard, WeekChart } from '../components';

export default function TodayView() {
  const { plan, data, setData, storageOk, today, selectedDate, setSelectedDate, navigate, exportICS, timer, openChapter } = usePlanner();
  const day = plan.find(item => item.date === selectedDate);
  const stats = getStats(plan, data, today);
  const [showAllTargets, setShowAllTargets] = useState(false);
  const isToday = selectedDate === today;
  const dayNumber = diffDays(data.settings.startDate, selectedDate) + 1;
  const measured = minutesOn(data.studySessions, selectedDate);
  const target = data.settings.dailyHours * 60;
  const weekMinutes = minutesBetween(data.studySessions, startOfWeek(today), addDays(startOfWeek(today), 6));
  const totalHours = Math.round(data.focus.minutes / 6) / 10;
  const carriedTasks = new Set(pendingCarryovers(data).map(item => item.taskId));
  const pending = pendingCarryovers(data).length + stats.backlog.filter(task => !carriedTasks.has(task.id)).length;
  const buckets = revisionBuckets(data.revisions, today);
  const due = [...buckets.overdue, ...buckets.today];
  const carryovers = carryoversOn(data, selectedDate);
  const motivation = motivationFor(today);
  const targets = CHAPTERS.filter(chapter => { const slot = CHAPTER_SCHEDULE[chapter.id]; return !!slot && slot.start <= selectedDate && slot.end >= selectedDate; }).sort((a, b) => { const sa = CHAPTER_SCHEDULE[a.id], sb = CHAPTER_SCHEDULE[b.id]; return sb.star - sa.star || sa.end.localeCompare(sb.end); });
  const nextImportant = [...data.importantDates].filter(item => item.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const shiftDate = (amount: number) => { const next = addDays(selectedDate, amount); if (isValidDate(next)) setSelectedDate(next); };
  const timerText = timer.mode === 'stopwatch'
    ? `${bn(String(Math.floor(timer.elapsedSec / 60)).padStart(2, '0'))}:${bn(String(timer.elapsedSec % 60).padStart(2, '0'))}`
    : `${bn(String(Math.floor(timer.remainingSec / 60)).padStart(2, '0'))}:${bn(String(timer.remainingSec % 60).padStart(2, '0'))}`;
  return <div className="view today-view">
    <section className="welcome-hero">
      <div className="hero-copy">
        <div className="hero-eyebrow"><span className="live-dot" />{t('তোমার HSC 27 পথচলা', 'Your HSC 27 journey')}</div>
        <h1>{isToday ? t('আজ একটু', 'A little today') : t('প্রতিদিন একটু', 'A little every day')}<br /><span>{t('এগিয়ে যাই।', 'moves us forward.')}</span></h1>
        <p>{formatDate(selectedDate, 'long')}, {formatDate(selectedDate, 'weekday')} <span className="hero-separator">·</span> {day ? `${t('দিন', 'Day')} ${bn(dayNumber)}` : t('নতুন করে শুরু করো', 'start fresh')}</p>
        <div className="hero-chips"><span><BookOpen size={14} />{bn(data.settings.dailyHours)} {t('ঘণ্টার লক্ষ্য', 'hour target')}</span><span><Clock3 size={14} />{t('আজ মাপা', 'Measured today')} {bn(Math.floor(measured / 60))}{t('ঘ', 'h')} {bn(measured % 60)}{t('মি', 'm')}</span><span><HeartPulse size={14} />{day ? phaseName(day.phase) : t('তোমার পরিকল্পনা', 'your plan')}</span></div>
        <div className="hero-progress"><div><span>{t('আজকের মাপা পড়ার সময়', 'Study time measured today')}</span><strong>{bn(percent(measured, target))}%</strong></div><ProgressBar value={percent(measured, target)} /></div>
      </div>
      <div className="hero-art"><StudyIllustration /><div className="hero-art-note"><span className="small-spark">✦</span> ছোট পদক্ষেপ। বড় স্বপ্ন।</div></div>
    </section>
    <section className="motivation-card"><span className="motivation-mark" aria-hidden="true">✦</span><div><span className="eyebrow">{t('আজকের অনুপ্রেরণা', 'Today’s motivation')}</span><p>{t(motivation.bn, motivation.en)}</p></div></section>
    <section className="card target-card">
      <div className="card-heading"><h3><ListChecks size={17} />{t('আজকের টার্গেট', 'Today’s targets')}</h3><span className="tiny-muted">{t('এই তারিখের মধ্যে শেষ', 'Finish by this date')}</span></div>
      {targets.length ? <div className="target-list">{targets.slice(0, showAllTargets ? targets.length : 4).map(chapter => { const slot = CHAPTER_SCHEDULE[chapter.id], links = CHAPTER_CLASSES[chapter.id]; return <div className="target-item" key={chapter.id} style={{ '--subject': subjectById[chapter.subject].color } as CSSProperties}>
        <div className="target-copy"><strong>{chapter.title}</strong><small>{subjectById[chapter.subject].name} · {bn(slot.hours)} {t('ঘণ্টা', 'h')} · শেষ {formatDate(slot.end)}</small><span className={`star-badge s${slot.star}`}>{'★'.repeat(slot.star)}{'☆'.repeat(5 - slot.star)}</span></div>
        {links && <div className="target-links"><ClassLinkRow classes={links} /><button className="text-button target-open" onClick={() => openChapter(chapter)}>{t('সব অপশন', 'All options')} <ChevronRight size={14} /></button></div>}
      </div>; })}{targets.length > 4 && <button className="text-button target-more" onClick={() => setShowAllTargets(!showAllTargets)}>{showAllTargets ? t('কম দেখাও', 'Show less') : `${t('আরও', 'Show')} ${bn(targets.length - 4)} ${t('টি টার্গেট', 'more targets')}`} <ArrowRight size={14} /></button>}</div> : <p className="tiny-muted">{t('আজ কোনো নতুন অধ্যায়ের টার্গেট নেই — রিভিশন বা ব্যাকলগ দেখে নাও।', 'No new chapter target today — use it for revision or backlog.')}</p>}
    </section>
    <PhaseJourney startDate={data.settings.startDate} activeDate={selectedDate} />
    <div className="stats-grid">
      <button className="stat-card stat-link" onClick={() => navigate('calendar')}><span className="stat-icon green"><BookOpen size={19} /></span><div><span>{t('সিলেবাস এগিয়েছে', 'Syllabus progress')}</span><strong>{bn(percent(stats.chapters, stats.totalChapters))}<small>%</small></strong><p>{bn(stats.chapters)} / {bn(stats.totalChapters)} {t('অধ্যায় ও ইউনিট', 'chapters & units')}</p></div><ProgressBar value={percent(stats.chapters, stats.totalChapters)} className="stat-progress" /></button>
      <button className="stat-card stat-link" onClick={() => navigate('timer')}><span className="stat-icon peach"><Clock3 size={19} /></span><div><span>{t('এ সপ্তাহের মাপা সময়', 'Measured this week')}</span><strong>{bn(Math.floor(weekMinutes / 60))}<small> ঘণ্টা {bn(weekMinutes % 60)} মি.</small></strong><p>{t('মোট', 'Total')} {bn(totalHours)} {t('ঘণ্টা টাইমারে', 'hours on the timer')}</p></div></button>
      <button className="stat-card stat-link" onClick={() => navigate('analytics')}><span className="stat-icon lavender"><Flame size={19} /></span><div><span>{t('টানা সক্রিয় দিন', 'Active streak')}</span><strong>{bn(stats.streak)}<small> {t('দিন', 'days')}</small></strong><p>{stats.streak ? t('এই ধারাবাহিকতা ধরে রাখো', 'Keep this streak going') : t('আজই শুরু হোক তোমার ধারা', 'Start your streak today')}</p></div></button>
      <button className="stat-card stat-link" onClick={() => navigate('practice')}><span className="stat-icon blue"><ListChecks size={19} /></span><div><span>{t('বাকি কাজ ও ব্যাকলগ', 'Pending work & backlog')}</span><strong>{bn(pending)}<small> {t('কাজ', 'tasks')}</small></strong><p>{due.length ? `${bn(due.length)} ${t('টি রিভিশন দরকার', 'revisions due')}` : t('রিভিশন আপাতত শেষ', 'No revision due')}</p></div><ArrowUpRight size={15} className="stat-arrow" /></button>
    </div>
    {due.length > 0 && <div className="recall-banner"><span><RotateCcw size={17} /><strong>{bn(due.length)} {t('টি রিভিশন আজ বা আগেই দরকার।', 'revisions are due today or earlier.')}</strong> {t('ছোট করে হলেও ঝালাই করে নাও।', 'Even a short review counts.')}</span><button className="text-button" onClick={() => navigate('revision')}>{t('রিভিশন শুরু', 'Start revision')} <ArrowRight size={15} /></button></div>}
    {nextImportant && <div className="important-banner"><span><Bell size={17} /><strong>{nextImportant.title}</strong> · {formatDate(nextImportant.date, 'long')} · {diffDays(today, nextImportant.date) === 0 ? t('আজ', 'today') : `${bn(diffDays(today, nextImportant.date))} ${t('দিন বাকি', 'days left')}`}{nextImportant.note ? ` — ${nextImportant.note}` : ''}</span><button className="text-button" onClick={() => navigate('calendar')}>{t('সব তারিখ', 'All dates')} <ArrowRight size={15} /></button></div>}
    {stats.backlog.length > 0 && <div className="backlog-banner"><span><Bell size={17} /><strong>{bn(stats.backlog.length)} {t('টি আগের কাজ বাকি।', 'older tasks are pending.')}</strong> {t('একসাথে নয়, প্রতিদিন একটু করে মিটিয়ে নাও।', 'Clear a little every day, not all at once.')}</span><button className="text-button" onClick={() => navigate('calendar')}>{t('ব্যাকলগ দেখো', 'View backlog')} <ArrowRight size={15} /></button></div>}
    <div className="dashboard-grid">
      <section className="card schedule-card">
        <div className="schedule-heading"><div><h2>{isToday ? t('আজকের রুটিন', 'Today’s routine') : t('দিনের রুটিন', 'Day routine')} <span className="count-badge">{bn(day?.tasks.length || 0)}টি সেশন</span></h2><p>{t('একটা কাজ শেষ করো, টিক দাও। এগিয়ে যাও।', 'Finish a task, tick it off, move on.')}</p></div><div className="date-switcher"><button className="icon-button" onClick={() => shiftDate(-1)} aria-label={t('আগের দিন', 'Previous day')}><ChevronLeft size={17} /></button><label className="date-input-wrap"><CalendarDays size={15} /><input type="date" aria-label={t('রুটিনের তারিখ', 'Routine date')} value={selectedDate} min="2020-01-01" max="2041-12-31" onChange={e => { if (isValidDate(e.target.value)) setSelectedDate(e.target.value); }} /></label><button className="icon-button" onClick={() => shiftDate(1)} aria-label={t('পরের দিন', 'Next day')}><ChevronRight size={17} /></button></div></div>
        {!isToday && <div className="selected-date-bar"><span>{formatDate(selectedDate, 'long')}</span><button className="text-button" onClick={() => setSelectedDate(today)}>{t('আজ ফিরে যাও', 'Back to today')} <ArrowRight size={14} /></button></div>}
        {day?.isCatchup && <div className="catchup-note"><RotateCcw size={16} />{t('আজ নতুন অধ্যায় নয়। ব্যাকলগ, রিকল আর ছোট পরীক্ষার দিন।', 'No new chapter today. Backlog, recall and short tests.')}</div>}
        {carryovers.length > 0 && <div className="carryover-list"><div className="carryover-heading"><strong><ListChecks size={15} />{t('এই দিনের ব্যাকলগ', 'Backlog for this day')}</strong><span>{bn(carryovers.filter(item => !item.completedAt).length)} {t('টি বাকি', 'left')}</span></div>{carryovers.map(item => <div key={item.id} className={`carryover-row ${item.completedAt ? 'done' : ''}`}><button className={`task-check ${item.completedAt ? 'checked' : ''}`} aria-pressed={!!item.completedAt} aria-label={`${item.title} সম্পন্ন`} onClick={() => setData(d => toggleCarryover(d, item.id))}>{item.completedAt && <span>✓</span>}</button><div><strong>{item.title}</strong><span>{phaseName(plan.find(d => d.date === item.fromDate)?.phase || 'learn')} · {t('থেকে', 'from')} {formatDate(item.fromDate)} · {bn(item.minutes)} {t('মি.', 'min')}</span></div><button className="icon-button" aria-label={t('ব্যাকলগ থেকে সরাও', 'Remove from backlog')} onClick={() => setData(d => removeCarryover(d, item.id))}><Trash2 size={15} /></button></div>)}</div>}
        {day ? <><div className="task-list">{day.tasks.map(task => <TaskCard key={task.id} task={task} />)}</div><DaySummary day={day} /><div className="schedule-footer"><span>{t('বিরতি বাদে পড়ার সময় · Asia/Dhaka', 'Study time excluding breaks · Asia/Dhaka')}</span><button className="text-button" onClick={() => exportICS('day', selectedDate)}><CalendarDays size={15} />{t('ক্যালেন্ডারে নাও', 'Add to calendar')}</button></div></> : <EmptyState title={t('এই তারিখে কোনো সেশন নেই', 'No session on this date')} description={t(`তোমার পরিকল্পনা ${formatDate(plan[0].date)} থেকে ${formatDate(plan[plan.length - 1].date)} পর্যন্ত।`, `Your plan runs from ${formatDate(plan[0].date)} to ${formatDate(plan[plan.length - 1].date)}.`)} action={<button className="button primary" onClick={() => setSelectedDate(today)}>{t('আজকের পড়ায় ফিরে যাও', 'Back to today’s study')}</button>} />}
      </section>
      <aside className="dashboard-rail">
        <section className="focus-card">
          <div className="focus-heading"><span><span className="live-dot" />{timer.mode === 'pomodoro' ? 'পোমোডোরো' : timer.mode === 'countdown' ? 'কাউন্টডাউন' : 'স্টপওয়াচ'}</span><button className="mini-link" onClick={() => navigate('timer')}>টাইমার <ArrowUpRight size={13} /></button></div>
          <div className="timer-mini-display"><strong>{timerText}</strong><span>{chapterById[timer.chapterId]?.title || subjectById[timer.subject].name}</span></div>
          <div className="timer-mini-actions"><button className="timer-start" onClick={timer.running ? timer.pause : timer.start}>{timer.running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}{timer.running ? 'বিরতি' : 'শুরু'}</button><button className="timer-reset" onClick={() => navigate('timer')} aria-label="টাইমার পেজ"><Timer size={16} /></button></div>
          <p>মোট {bn(data.focus.sessions)}টি সেশন · {bn(totalHours)} ঘণ্টা</p>
        </section>
        <section className="card revision-mini-card">
          <div className="card-heading"><h3>আজকের রিভিশন</h3><span className="tiny-muted">{bn(due.length)}টি</span></div>
          {due.length ? <div className="mini-revision-list">{due.slice(0, 3).map(item => <button key={item.id} onClick={() => navigate('revision')}><span className={`revision-dot ${item.dueDate < today ? 'late' : ''}`} /><span><strong>{chapterById[item.chapterId]?.title}</strong><small>{INTERVAL_LABEL[item.interval]} · {formatDate(item.dueDate)}</small></span><ChevronRight size={15} /></button>)}</div> : <div className="mini-empty"><CheckMark />আপনার রিভিশন আপাতত শেষ</div>}
          <button className="button secondary full-width small" onClick={() => navigate('revision')}><RotateCcw size={15} />সব রিভিশন দেখো</button>
        </section>
        <section className="card week-card"><div className="card-heading"><h3>এ সপ্তাহের পথচলা</h3><span className="tiny-muted">সম্পন্ন কাজের সময়</span></div><WeekChart /><div className="week-legend"><span className="legend-dot" />পরিকল্পিত পড়ার সময়, প্রকৃত ট্র্যাকিং নয়</div></section>
        <section className="reminder-nudge"><span className="nudge-icon"><Bell size={20} /></span><h3>পড়া যেন মনে থাকে</h3><p>রুটিনটা ক্যালেন্ডারে নাও। প্রতিটি সেশনের আগে রিমাইন্ডার পাবে।</p><button onClick={() => navigate('reminders')}>রিমাইন্ডার সেট করো <ArrowUpRight size={16} /></button></section>
        <LocalNote />
      </aside>
    </div>
    <SyllabusNotice />
    <div className="view-footer"><span><span className={`status-dot ${storageOk ? 'ok' : ''}`} />{storageOk ? 'সব তথ্য এই ডিভাইসে সেভ হচ্ছে' : 'সেভ হয়নি — ব্যাকআপ রাখো'}</span><button className="text-button" onClick={() => navigate('settings')}>ব্যাকআপ রাখো <ArrowUpRight size={13} /></button></div>
  </div>;
}
function CheckMark() {
  return <span className="mini-check"><ClipboardCheck size={15} /></span>;
}
