import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BellRing, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Flag, GripVertical, ListChecks, Lock, Plus, RefreshCw, Trash2, Unlock } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, subjectById } from '../data';
import type { SubjectId } from '../data';
import { addDays, bn, diffDays, formatDate, getPhases, isValidDate, percent, phaseName, taskStart } from '../planner';
import { newId } from '../storage';
import { startOfWeek, subjectMinutes } from '../analytics';
import type { PhaseId } from '../planner';
import { addCarryover } from '../study';
import { chapterPriority } from '../learning';
import { categoryScheduleDates, estimatedFinishDate, expectedPercentBy, scheduleStatus } from '../prediction';
import { isDateLocked, regenerationSummary, rescheduleUnfinished, toggleLockDate } from '../scheduleEdit';
import { DaySummary, EmptyState, PageHeading, ProgressBar, TaskCard } from '../components';
import { t, weekdayName } from '../i18n';
import { planHealth } from '../planHealth';

export default function CalendarView() {
  const { plan, data, setData, today, selectedDate, setSelectedDate, navigate, exportICS, notify, toggleTask, confirm } = usePlanner();
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [weekStart, setWeekStart] = useState(startOfWeek(selectedDate));
  useEffect(() => { setMonth(selectedDate.slice(0, 7)); setWeekStart(startOfWeek(selectedDate)); }, [selectedDate]);
  const [phase, setPhase] = useState<PhaseId | 'all'>('all');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [backlog, setBacklog] = useState(false);
  const [routineWeekday, setRoutineWeekday] = useState(() => new Date(`${selectedDate}T00:00:00Z`).getUTCDay());
  useEffect(() => { setRoutineWeekday(new Date(`${selectedDate}T00:00:00Z`).getUTCDay()); }, [selectedDate]);
  const [routineTime, setRoutineTime] = useState('20:00');
  const [routineMinutes, setRoutineMinutes] = useState('60');
  const [routineSubject, setRoutineSubject] = useState<SubjectId>('physics');
  const [routineTitle, setRoutineTitle] = useState('');
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [importantTitle, setImportantTitle] = useState('');
  const [importantDate, setImportantDate] = useState(addDays(today, 7));
  const [importantNote, setImportantNote] = useState('');
  const [importantNotify, setImportantNotify] = useState(true);
  const phases = getPhases(data.settings);
  const health = useMemo(() => planHealth(plan, data.settings, data.completed), [plan, data.settings, data.completed]);
  const byDate = useMemo(() => new Map(plan.map(day => [day.date, day])), [plan]);
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
  const shiftMonth = (amount: number) => { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + amount); setMonth(d.toISOString().slice(0, 7)); };
  const day = byDate.get(selectedDate);
  const visibleTasks = day?.tasks.filter(task => (subject === 'all' || task.subject === subject) && (phase === 'all' || task.phase === phase)) || [];
  const overdue = plan.flatMap(d => d.tasks).filter(task => taskStart(task).date < today && !data.completed[task.id] && (subject === 'all' || task.subject === subject) && (phase === 'all' || task.phase === phase));
  const filteredDates = new Set(plan.filter(d => phase === 'all' || d.phase === phase).flatMap(d => d.tasks.filter(task => subject === 'all' || task.subject === subject).map(() => d.date)));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekSessions = data.studySessions.filter(session => session.date >= weekStart && session.date <= addDays(weekStart, 6));
  const allocation = subjectMinutes(weekSessions, weekStart, addDays(weekStart, 6));
  const addRoutineBlock = (event: React.FormEvent) => {
    event.preventDefault();
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(routineTime);
    const minutes = Number(routineMinutes);
    if (!match) { notify(t('শুরুর সময় HH:MM ফরম্যাটে লেখো।', 'Write the start time as HH:MM.'), 'error'); return; }
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) { notify(t('একটি ব্লক ১৫ থেকে ৪৮০ মিনিটের মধ্যে হতে হবে।', 'A block must be between 15 and 480 minutes.'), 'error'); return; }
    if (data.routineBlocks.filter(block => !block.date).length >= 40 || data.routineBlocks.length >= 500) { notify(t('সর্বোচ্চ ৪০টি কাস্টম ব্লক রাখা যায়।', 'You can keep at most 40 custom blocks.'), 'error'); return; }
    const startMinute = Number(match[1]) * 60 + Number(match[2]);
    setData(d => ({ ...d, routineBlocks: [...d.routineBlocks, { id: newId(), weekday: routineWeekday, startMinute, minutes, subject: routineSubject, title: routineTitle.trim(), createdAt: new Date().toISOString() }] }));
    setRoutineTitle('');
    notify(t('কাস্টম ব্লক এই বার থেকে প্রতি সপ্তাহে যোগ হবে।', 'The custom block repeats weekly from today.'));
  };
  const removeRoutineBlock = (id: string) => setData(d => ({ ...d, routineBlocks: d.routineBlocks.filter(block => block.id !== id) }));
  const swapRoutineTimes = (firstId: string, secondId: string) => {
    if (firstId === secondId) return;
    setData(d => {
      const first = d.routineBlocks.find(block => block.id === firstId);
      const second = d.routineBlocks.find(block => block.id === secondId);
      if (!first || !second || first.weekday !== second.weekday || first.startMinute === second.startMinute) return d;
      return { ...d, routineBlocks: d.routineBlocks.map(block => block.id === firstId ? { ...block, startMinute: second.startMinute } : block.id === secondId ? { ...block, startMinute: first.startMinute } : block) };
    });
    notify(t('দুই ব্লকের সময় অদলবদল হয়েছে।', 'The two blocks swapped times.'));
  };
  const moveRoutineBlock = (id: string, direction: -1 | 1) => {
    const sameDay = data.routineBlocks.filter(block => !block.date && block.weekday === routineWeekday).sort((a, b) => a.startMinute - b.startMinute);
    const index = sameDay.findIndex(block => block.id === id);
    const target = sameDay[index + direction];
    if (target) swapRoutineTimes(id, target.id);
  };
  const addImportantDate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!importantTitle.trim()) { notify(t('তারিখের নাম লেখো।', 'Write the date name.'), 'error'); return; }
    if (!isValidDate(importantDate)) { notify(t('সঠিক তারিখ বাছো।', 'Pick a valid date.'), 'error'); return; }
    if (data.importantDates.length >= 200) { notify(t('সর্বোচ্চ ২০০টি তারিখ রাখা যায়।', 'You can keep at most 200 dates.'), 'error'); return; }
    setData(d => ({ ...d, importantDates: [...d.importantDates, { id: newId(), date: importantDate, title: importantTitle.trim(), note: importantNote.trim(), notify: importantNotify, createdAt: new Date().toISOString() }] }));
    setImportantTitle(''); setImportantNote('');
    notify(t('গুরুত্বপূর্ণ তারিখ যোগ হয়েছে।', 'Important date added.'));
  };
  const removeImportantDate = (id: string) => setData(d => ({ ...d, importantDates: d.importantDates.filter(item => item.id !== id) }));
  // Full-syllabus timeline + honest completion prediction from the student's own pace.
  const categoryIds = useMemo(() => {
    const build = (p: 'A' | 'B' | 'C') => new Set(CHAPTERS.filter(chapter => chapterPriority(chapter, data) === p).map(chapter => chapter.id));
    return { A: build('A'), B: build('B'), C: build('C') };
  }, [data]);
  const categoryDates = useMemo(() => categoryScheduleDates(plan, categoryIds), [plan, categoryIds]);
  const planStatus = useMemo(() => scheduleStatus(plan, data, today), [plan, data, today]);
  const expectedAtTest = useMemo(() => expectedPercentBy(plan, data, today, data.settings.testExamDate), [plan, data, today]);
  const estimatedFinish = useMemo(() => estimatedFinishDate(plan, data, today), [plan, data, today]);
  const lockedSelected = isDateLocked(data, selectedDate);
  const [oneOffTitle, setOneOffTitle] = useState('');
  const [oneOffTime, setOneOffTime] = useState('20:00');
  const [oneOffMinutes, setOneOffMinutes] = useState('45');
  const [oneOffSubject, setOneOffSubject] = useState<SubjectId>('physics');
  const addOneOffTask = (event: FormEvent) => {
    event.preventDefault();
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(oneOffTime);
    const minutes = Number(oneOffMinutes);
    if (!oneOffTitle.trim()) { notify(t('কাজের নাম লেখো।', 'Write the task name.'), 'error'); return; }
    if (!match) { notify(t('সময় HH:MM ফরম্যাটে লেখো।', 'Write the time as HH:MM.'), 'error'); return; }
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) { notify(t('১৫ থেকে ৪৮০ মিনিটের মধ্যে হতে হবে।', 'It must be between 15 and 480 minutes.'), 'error'); return; }
    if (!isValidDate(selectedDate)) { notify(t('সঠিক তারিখ বাছো।', 'Pick a valid date.'), 'error'); return; }
    const startMinute = Number(match[1]) * 60 + Number(match[2]);
    const weekday = new Date(`${selectedDate}T00:00:00Z`).getUTCDay();
    setData(d => ({ ...d, routineBlocks: [...d.routineBlocks, { id: newId(), date: selectedDate, weekday, startMinute, minutes, subject: oneOffSubject, title: oneOffTitle.trim(), createdAt: new Date().toISOString() }] }));
    setOneOffTitle('');
    notify(t('সেদিনের জন্য কাজ যোগ হয়েছে।', 'Task added for that date.'));
  };
  const rebalancePlan = () => {
    const summary = regenerationSummary(data);
    confirm({
      title: t('অসমাপ্ত কাজ সামনে সরাবে?', 'Move unfinished work forward?'),
      message: t(
        `সম্পন্ন কাজ (${bn(summary.completedPreserved)}টি), লক করা দিন (${bn(summary.lockedDates)}টি), নিজের সম্পাদনা (${bn(summary.editedTasks)}টি) ও কাস্টম ব্লক অক্ষত থাকবে। শুধু অতীতের অসমাপ্ত কাজ আজ বা পরের দিনে সরানো হবে (প্রতি দিন সর্বোচ্চ ৪৫ মিনিট বাড়তে পারে)।`,
        `Completed work (${summary.completedPreserved}), locked dates (${summary.lockedDates}), your edits (${summary.editedTasks}) and custom blocks stay untouched. Only unfinished past work moves to today or later (up to 45 extra minutes per day).`,
      ),
      label: t('রিব্যালেন্স করো', 'Rebalance'),
      action: () => {
        const result = rescheduleUnfinished(plan, data, today);
        setData(result.data);
        notify(result.moved
          ? t(`${bn(result.moved)}টি কাজ সামনে সরানো হয়েছে।`, `${result.moved} task(s) moved forward.`)
          : t('সরানো মতো কোনো অসমাপ্ত কাজ নেই (লক বা সময়সীমা)।', 'Nothing to move (locked or out of budget).'), result.moved ? 'success' : 'info');
      },
    });
  };
  const routineRows = data.routineBlocks.filter(block => !block.date && block.weekday === routineWeekday).sort((a, b) => a.startMinute - b.startMinute);
  const upcomingImportant = [...data.importantDates].sort((a, b) => a.date.localeCompare(b.date)).filter(item => item.date >= today).slice(0, 12);
  const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const carryToToday = (task: { id: string; title: string; subject: SubjectId; startMinute: number; endMinute: number; date: string }) => {
    if (data.carryovers.some(item => item.taskId === task.id && !item.completedAt)) { notify(t('কাজটি আগেই ব্যাকলগে আছে।', 'This task is already in your backlog.'), 'info'); return; }
    if (data.carryovers.length >= 2000) { notify(t('ব্যাকলগের সীমা পূর্ণ।', 'Backlog limit reached.'), 'error'); return; }
    setData(d => addCarryover(d, task, today));
    notify(t('আজকের ব্যাকলগে যোগ হয়েছে।', 'Added to today’s backlog.'), 'info');
  };
  // Spreading backlog is no longer done blindly here: the backlog manager checks the
  // 8-hour ceiling, merges repeats and only then writes carryovers.
  const openBacklog = () => navigate('backlog');
  return <div className="view">
    <PageHeading eyebrow="DAY BY DAY" title={t("এক দিন। এক পদক্ষেপ।", "One day. One step.")} titleEn="One day. One step." description="কোন দিন কী পড়বে, সব আছে এখানে। মাস বা সপ্তাহে দেখো, তারিখে ক্লিক করে সেই দিনের কাজ দেখো।" descriptionEn="See what to study on every day. Switch between month and week, or pick a date to open its sessions." action={<div className="heading-actions"><div className="segmented small"><button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}><CalendarDays size={14} />{t("মাস", "Month")}</button><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}><CalendarRange size={14} />{t("সপ্তাহ", "Week")}</button></div><button className="button secondary" onClick={() => exportICS('all')}><CalendarDays size={17} />{t("পুরো রুটিন", "Full routine")}</button></div>} />
    <section className="card plan-timeline-card" aria-label={t('সিলেবাস টাইমলাইন ও পূর্বাভাস', 'Syllabus timeline & forecast')}>
      <div className="card-heading">
        <div><h2><Flag size={18} />{t('সম্পূর্ণ পরিকল্পনার টাইমলাইন', 'Full plan timeline')}</h2>
        <p>{t('ক্যাটাগরি শেষ হওয়ার তারিখ, টেস্ট কাউন্টডাউন ও তোমার আসল গতি থেকে পূর্বাভাস — নিশ্চয়তা নয়।', 'Category finish dates, test countdown and a forecast from your actual pace — not a guarantee.')}</p></div>
        <button className="button secondary small" onClick={rebalancePlan}><RefreshCw size={14} />{t('বাকি কাজ সরাও', 'Rebalance')}</button>
      </div>
      <div className="plan-timeline">
        {([
          { key: 'A', label: t('A ক্যাটাগরি শেষ', 'Category A done'), date: categoryDates.A, color: '#236149' },
          { key: 'B', label: t('B ক্যাটাগরি শেষ', 'Category B done'), date: categoryDates.B, color: '#9a6722' },
          { key: 'C', label: t('C ক্যাটাগরি শেষ', 'Category C done'), date: categoryDates.C, color: '#5a4b82' },
          { key: 'full', label: t('পুরো সিলেবাস শেষ', 'Whole syllabus done'), date: health.syllabusEnd, color: '#2c5e8a' },
          { key: 'test', label: t('টেস্ট পরীক্ষা', 'Test Exam'), date: data.settings.testExamDate, color: '#b57463' },
        ]).map(item => (
          <div className="plan-timeline-node" key={item.key}>
            <span className="plan-timeline-dot" style={{ background: item.color }} />
            <strong>{item.label}</strong>
            <span>{item.date ? formatDate(item.date, 'long') : '—'}</span>
            {item.date && <small>{item.date > today ? `${bn(diffDays(today, item.date))} ${t('দিন পরে', 'days away')}` : item.date === today ? t('আজ', 'today') : t('তারিখ পেরিয়েছে', 'past')}</small>}
          </div>
        ))}
      </div>
      <div className="plan-prediction">
        <span className={`plan-status-chip ${planStatus.status}`}>{planStatus.status === 'ahead' ? t('সময়ের আগে আছো', 'Ahead of schedule') : planStatus.status === 'ontrack' ? t('সময়ের সঙ্গে আছো', 'On track') : t(`${bn(planStatus.gapPercent)}% পিছিয়ে`, `${planStatus.gapPercent}% behind`)}</span>
        <span>{t('টেস্ট তারিখে প্রত্যাশিত অগ্রগতি', 'Expected progress by Test Exam')}: <strong>{bn(expectedAtTest)}%</strong></span>
        <span>{t('এই গতিতে সম্ভাব্য শেষ', 'Estimated finish at this pace')}: <strong>{estimatedFinish ? formatDate(estimatedFinish, 'long') : t('সাম্প্রতিক গতি নেই', 'no recent pace')}</strong></span>
      </div>
    </section>
    <div className="filter-bar"><div className="segmented">{(['all', 'learn', 'revise', 'exam'] as const).map(p => <button key={p} className={phase === p ? 'active' : ''} onClick={() => setPhase(p)}>{p === 'all' ? 'সব ধাপ' : phaseName(p)}</button>)}</div><select aria-label={t("বিষয় ফিল্টার", "Subject filter")} value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">{t("সব বিষয়", "All subjects")}</option>{SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className={`button ${backlog ? 'primary' : 'secondary'}`} onClick={() => setBacklog(!backlog)}><ListChecks size={16} />{t("ব্যাকলগ", "Backlog")}<span className="count-badge">{bn(overdue.length)}</span></button></div>
    {backlog ? <section className="card backlog-card"><div className="card-heading"><div><h2>{t("আগের অসমাপ্ত কাজ", "Earlier unfinished work")}</h2><span className="tiny-muted">পুরোনো থেকে নতুন · {bn(overdue.length)}{t('টি', '')}</span></div><button className="button secondary small" onClick={openBacklog}><Plus size={15} />{t("ব্যাকলগ ম্যানেজার", "Backlog manager")}</button></div>{overdue.length ? <div className="backlog-list">{overdue.slice(0, 100).map(task => <div key={task.id} className="backlog-row"><button className="task-check" aria-label={t(`${task.title} সম্পন্ন করো`, `Complete ${task.title}`)} aria-pressed={false} onClick={() => toggleTask(task.id)} /><div><span className="eyebrow">{formatDate(task.date)} · {subjectById[task.subject].short} · {phaseName(task.phase)}</span><strong>{task.title}</strong></div><div className="backlog-actions"><button className="button secondary small" disabled={data.carryovers.some(item => item.taskId === task.id && !item.completedAt)} onClick={() => carryToToday(task)}><Plus size={14} />{data.carryovers.some(item => item.taskId === task.id && !item.completedAt) ? t("তালিকায় আছে", "Already added") : t("আজকের তালিকায়", "Add to today")}</button><button className="button ghost small" onClick={() => { setSelectedDate(task.date); setBacklog(false); setMonth(task.date.slice(0, 7)); }}>{t("সেদিনে যাও", "Go to that day")}<ArrowRight size={14} /></button></div></div>)}{overdue.length > 100 && <p className="muted padded">{t('প্রথম ১০০টি দেখানো হচ্ছে। বাকিগুলো সংশ্লিষ্ট তারিখে পাবে।', 'Showing the first 100. The rest appear on their own dates.')}</p>}</div> : <EmptyState title={t("ব্যাকলগ নেই", "No backlog")} description={t('অতীতের সব নির্ধারিত কাজ শেষ, অথবা এখনও কোনো কাজ বাকি পড়েনি।', 'Every scheduled task in the past is done, or none is due yet.')} />}</section>
      : <div className="calendar-layout">
        <section className="card calendar-card">
          {mode === 'month' ? <>
            <div className="calendar-toolbar"><div><h2>{formatDate(first, 'month')}</h2><div className="calendar-legend">{phases.map(p => <span key={p.id}><i style={{ background: p.color }} />{phaseName(p.id)}</span>)}</div></div><div className="calendar-nav"><button className="button secondary small" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }}>{t("আজ", "Today")}</button><button className="icon-button" aria-label={t("আগের মাস", "Previous month")} onClick={() => shiftMonth(-1)}><ChevronLeft size={19} /></button><button className="icon-button" aria-label={t("পরের মাস", "Next month")} onClick={() => shiftMonth(1)}><ChevronRight size={19} /></button></div></div>
            <div className="calendar-weekdays">{[1, 2, 3, 4, 5, 6, 0].map(d => <span key={d}>{weekdayName(d)}</span>)}</div>
            <div className="calendar-grid">{cells.map(date => {
              const d = byDate.get(date), inMonth = date.startsWith(month), matches = filteredDates.has(date);
              const done = d?.tasks.filter(task => data.completed[task.id] && (subject === 'all' || task.subject === subject)).length || 0;
              const total = d?.tasks.filter(task => subject === 'all' || task.subject === subject).length || 0;
              const p = phases.find(phaseItem => date >= phaseItem.start && date <= phaseItem.end);
              return <button key={date} className={`calendar-cell ${!inMonth ? 'outside' : ''} ${date === today ? 'is-today' : ''} ${date === selectedDate ? 'selected' : ''} ${!matches ? 'filtered' : ''}`} onClick={() => setSelectedDate(date)} aria-label={t(
                `${formatDate(date, 'long')}${isDateLocked(data, date) ? ', লক করা' : ''}${d ? `, ${phaseName(d.phase)}, ${bn(done)}/${bn(total)} কাজ শেষ` : ', কোনো সেশন নেই'}`,
                `${formatDate(date, 'long')}${isDateLocked(data, date) ? ', locked' : ''}${d ? `, ${phaseName(d.phase)}, ${done}/${total} tasks done` : ', no session'}`,
              )} aria-pressed={date === selectedDate}><span className="cell-date">{bn(Number(date.slice(8)))}</span>{isDateLocked(data, date) && <Lock size={11} className="cell-lock" aria-hidden="true" />}{d && matches && <><span className="cell-phase" style={{ background: p?.color }} /><span className="cell-label">{d.isCatchup ? t('ব্যাকলগ দিন','Backlog day') : phaseName(d.phase)}</span><ProgressBar value={percent(done, total)} color={p?.color} /></>}{date === today && <span className="today-dot" />}</button>;
            })}</div>
            <div className="calendar-bottom"><span>{t("তারিখ বেছে নাও, ডানদিকে কাজ দেখো।", "Pick a date and read the work on the right.")}</span><span>{bn(plan.length)} {t('দিনের পরিকল্পনা','day plan')}</span></div>
          </> : <>
            <div className="calendar-toolbar"><div><h2>{formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}</h2><div className="calendar-legend"><span>{t("সপ্তাহের রুটিন ও মাপা সময়", "Weekly routine & measured time")}</span></div></div><div className="calendar-nav"><button className="button secondary small" onClick={() => setWeekStart(startOfWeek(today))}>{t("এই সপ্তাহ", "This week")}</button><button className="icon-button" aria-label={t("আগের সপ্তাহ", "Previous week")} onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={19} /></button><button className="icon-button" aria-label={t("পরের সপ্তাহ", "Next week")} onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={19} /></button></div></div>
            <div className="week-plan-grid">{weekDays.map((date, i) => {
              const d = byDate.get(date);
              const minutes = weekSessions.filter(session => session.date === date).reduce((sum, session) => sum + session.minutes, 0);
              const done = d?.tasks.filter(task => data.completed[task.id]).length || 0;
              return <button key={date} className={`week-plan-day ${date === today ? 'today' : ''} ${date === selectedDate ? 'selected' : ''}`} onClick={() => setSelectedDate(date)}><span className="week-plan-name">{weekdayName((i + 1) % 7)}</span><strong>{bn(Number(date.slice(8)))}</strong><span className="week-plan-month">{formatDate(date, 'month').split(' ')[0]}</span>{d ? <><span className="week-plan-count">{bn(done)}/{bn(d.tasks.length)}</span><div className="week-plan-dots">{d.tasks.map(task => <i key={task.id} title={`${subjectById[task.subject].name}: ${task.title}`} style={{ background: subjectById[task.subject].color, opacity: data.completed[task.id] ? .3 : 1 }} />)}</div></> : <span className="week-plan-count">—</span>}<span className="week-plan-minutes">{bn(Math.floor(minutes / 60))}{t('ঘ','h')} {bn(minutes % 60)}{t('মি','m')}</span></button>;
            })}</div>
            <div className="week-allocation"><strong>{t("এই সপ্তাহে বিষয়ভিত্তিক মাপা সময়", "Time by subject this week")}</strong>{SUBJECTS.map(s => <div className="allocation-row" key={s.id}><span>{s.short}</span><ProgressBar value={percent(allocation[s.id], Math.max(...Object.values(allocation), 1))} color={s.color} /><small>{bn(Math.floor(allocation[s.id] / 60))}{t('ঘ','h')} {bn(allocation[s.id] % 60)}{t('মি','m')}</small></div>)}</div>
          </>}
        </section>
        <aside className="card calendar-day-panel"><div className="card-heading"><div><span className="eyebrow">{formatDate(selectedDate, 'weekday')}</span><h2>{formatDate(selectedDate, 'long')}</h2></div><div className="day-panel-heading-actions">{day && <span className="phase-pill">{phaseName(day.phase)}</span>}<button type="button" className={`icon-button date-lock ${lockedSelected ? 'locked' : ''}`} aria-pressed={lockedSelected} aria-label={lockedSelected ? t('দিনের লক খোলো', 'Unlock this date') : t('দিনটি লক করো', 'Lock this date')} title={lockedSelected ? t('লক করা — রিব্যালেন্স এই দিন ছোবে না', 'Locked — rebalancing will not touch this day') : t('লক করলে রিব্যালেন্স এই দিনের কাজ বদলাবে না', 'Lock so rebalancing never changes this day')} onClick={() => { setData(d => toggleLockDate(d, selectedDate)); notify(lockedSelected ? t('দিনটি আনলক করা হয়েছে।', 'Date unlocked.') : t('দিনটি লক করা হয়েছে — স্বয়ংক্রিয় পরিবর্তন থেকে রক্ষা।', 'Date locked from automatic changes.')); }}>{lockedSelected ? <Lock size={15} /> : <Unlock size={15} />}</button></div></div>{day ? <><DaySummary day={day} /><div className="compact-tasks">{visibleTasks.length ? visibleTasks.map(task => <TaskCard key={task.id} task={task} compact />) : <EmptyState title={t("এই বিষয়ে কাজ নেই", "No work left in this subject")} description={t('ফিল্টার বদলে অন্য বিষয় দেখো।', 'Switch the filter to see another subject.')} />}</div><form className="day-add-task" onSubmit={addOneOffTask}><strong>{t('এই দিনে নিজের কাজ যোগ করো', 'Add your own task for this day')}</strong><div className="day-add-task-row"><input value={oneOffTitle} onChange={e => setOneOffTitle(e.target.value)} maxLength={120} placeholder={t('কাজের নাম', 'Task name')} aria-label={t('কাজের নাম', 'Task name')} /><input type="time" value={oneOffTime} onChange={e => setOneOffTime(e.target.value)} aria-label={t('শুরুর সময়', 'Start time')} /><input type="number" min={15} max={480} step={5} value={oneOffMinutes} onChange={e => setOneOffMinutes(e.target.value)} aria-label={t('মিনিট', 'Minutes')} /><select value={oneOffSubject} onChange={e => setOneOffSubject(e.target.value as SubjectId)} aria-label={t('বিষয়', 'Subject')}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.short}</option>)}</select><button className="button primary small" type="submit" aria-label={t('কাজ যোগ করো', 'Add task')}><Plus size={14} /></button></div></form><button className="button secondary full-width" onClick={() => navigate('today', selectedDate)}>{t("বিস্তারিত রুটিন", "Detailed routine")}<ArrowRight size={16} /></button></> : <EmptyState title={t("এই দিনে কোনো সেশন নেই", "No session on this day")} description={t('পরিকল্পনার তারিখের মধ্যে একটি দিন বেছে নাও।', 'Pick a day inside the plan’s date range.')} />}</aside>
      </div>}
    <section className="card routine-card">
      <div className="card-heading"><div><h2><Clock3 size={20} />{t("কাস্টম সাপ্তাহিক রুটিন", "Custom weekly routine")}</h2><p>{t('অটো রুটিনের সঙ্গে নিজের নির্দিষ্ট সময়ের সেশন যোগ করো। অধ্যায়ের অগ্রগতি বদলাবে না।', 'Add your own fixed-time sessions alongside the automatic routine. Chapter progress is unaffected.')}</p></div><span className="count-badge">{bn(data.routineBlocks.filter(block => !block.date).length)} {t('ব্লক','blocks')}</span></div>
      <div className="weekday-tabs">{[0, 1, 2, 3, 4, 5, 6].map(index => <button key={index} type="button" className={routineWeekday === index ? 'active' : ''} onClick={() => setRoutineWeekday(index)}>{weekdayName(index, true)}</button>)}</div>
      <form className="routine-form" onSubmit={addRoutineBlock}>
        <label>{t("শুরু", "Start")}<input type="time" value={routineTime} onChange={e => setRoutineTime(e.target.value)} required /></label>
        <label>{t("মিনিট", "min")}<input type="number" min={15} max={480} step={5} value={routineMinutes} onChange={e => setRoutineMinutes(e.target.value)} required /></label>
        <label>{t("বিষয়", "Subject")}<select value={routineSubject} onChange={e => setRoutineSubject(e.target.value as SubjectId)}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>{t("নাম (ঐচ্ছিক)", "Name (optional)")}<input value={routineTitle} maxLength={120} onChange={e => setRoutineTitle(e.target.value)} placeholder={t("যেমন: সূত্র ঝালাই", "e.g. formula drill")} /></label>
        <button className="button primary" type="submit"><Plus size={16} />{t("ব্লক যোগ করো", "Add block")}</button>
      </form>
      {routineRows.length ? <div className="routine-list">{routineRows.map((block, index) => <div className={`routine-row${dragBlockId === block.id ? ' dragging' : ''}`} key={block.id} draggable onDragStart={event => { setDragBlockId(block.id); event.dataTransfer?.setData('text/plain', block.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragBlockId(null)} onDragOver={event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); const dragged = dragBlockId || event.dataTransfer?.getData('text/plain'); if (dragged) swapRoutineTimes(dragged, block.id); setDragBlockId(null); }}><span className="routine-grip" aria-hidden="true"><GripVertical size={14} /></span><span className="routine-time">{bn(String(Math.floor(block.startMinute / 60)).padStart(2, '0'))}:{bn(String(block.startMinute % 60).padStart(2, '0'))}</span><span className="subject-dot" style={{ background: subjectById[block.subject].color }} /><strong>{block.title || t(`${subjectById[block.subject].name}: কাস্টম সেশন`, `${subjectById[block.subject].english}: custom session`)}</strong><small>{t(`${bn(block.minutes)} মিনিট`, `${block.minutes} min`)} · {t(`${weekdayName(block.weekday, true)}বার`, `every ${weekdayName(block.weekday)}`)}</small><span className="routine-move"><button type="button" className="icon-button" aria-label={t("ব্লক উপরে সরাও", "Move block up")} disabled={index === 0} onClick={() => moveRoutineBlock(block.id, -1)}><ChevronUp size={14} /></button><button type="button" className="icon-button" aria-label={t("ব্লক নিচে সরাও", "Move block down")} disabled={index === routineRows.length - 1} onClick={() => moveRoutineBlock(block.id, 1)}><ChevronDown size={14} /></button></span><button className="icon-button delete-button" aria-label={t("ব্লক মুছো", "Delete block")} onClick={() => removeRoutineBlock(block.id)}><Trash2 size={15} /></button></div>)}</div> : <p className="muted padded">{t("এই দিনে কোনো কাস্টম ব্লক নেই। উপরে একটি যোগ করো।", "No custom block on this day. Add one above.")}</p>}
      <p className="tiny-muted">{t('কাস্টম ব্লক পুরো রুটিনে প্রতি সপ্তাহে একই দিনে যোগ হবে। অনেকগুলো ব্লক একই সময়ে থাকলে সময় মিলিয়ে নাও।', 'A custom block repeats on the same weekday throughout the routine. If several blocks land at the same time, adjust the times.')}</p>
    </section>
    <section className="card important-dates-card">
      <div className="card-heading"><div><h2><BellRing size={20} />{t("গুরুত্বপূর্ণ তারিখ", "Important dates")}</h2><p>{t("টেস্ট পরীক্ষা, ঈদুল আজহা, বোর্ড পরীক্ষা ও তোমার নিজের লক্ষ্য তারিখ—সব এক নজরে।", "Test Exam, Eid-ul-Adha, Board Exam and your own target dates — at a glance.")}</p></div><span className="count-badge">{bn(upcomingImportant.length)} {t('আসন্ন','upcoming')}</span></div>
      <div className="built-in-milestones">
        {[
          { key: 'test', date: data.settings.testExamDate, title: t('কলেজের টেস্টের ব্যক্তিগত লক্ষ্য', 'Personal college-test target'), note: t('সেটিংসে কলেজের নির্দিষ্ট তারিখ বসানো যাবে', 'Editable in Settings') },
          { key: 'eid', date: '2027-05-16', title: t('ঈদুল আজহা ২০২৭ (সম্ভাব্য)', 'Eid-ul-Adha 2027 (expected)'), note: t('চাঁদ দেখা সাপেক্ষে; রুটিন সরালেও ছুটির তারিখ সরে না', 'Subject to moon sighting; moving the plan does not move this date') },
          { key: 'hsc', date: data.settings.examDate, title: t('HSC প্রস্তুতির ব্যক্তিগত লক্ষ্য', 'Personal HSC preparation target'), note: t('সরকারি রুটিন নিশ্চিত করা যায়নি; সেটিংসে পরিবর্তনযোগ্য', 'Official routine not verified; editable in Settings') },
        ].map(m => {
          const left = daysUntil(m.date);
          return <div className="milestone-chip-card" key={m.key}>
            <span className={`important-days ${left >= 0 && left <= 45 ? 'soon' : ''}`}>{left >= 0 ? bn(left) : '✓'}<small>{left >= 0 ? t('দিন বাকি', 'days') : t('সম্পন্ন', 'done')}</small></span>
            <div><strong>{m.title}</strong><span>{formatDate(m.date, 'long')} · {m.note}</span></div>
          </div>;
        })}
      </div>
      <form className="important-form" onSubmit={addImportantDate}>
        <label>{t("তারিখ", "Date")}<input type="date" min={addDays(today, -365)} max="2041-12-31" value={importantDate} onChange={e => setImportantDate(e.target.value)} required /></label>
        <label>{t("নাম", "Name")}<input value={importantTitle} maxLength={200} onChange={e => setImportantTitle(e.target.value)} placeholder={t("যেমন: রসায়ন মডেল টেস্ট", "e.g. chemistry model test")} required /></label>
        <label>{t("নোট (ঐচ্ছিক)", "Note (optional)")}<input value={importantNote} maxLength={2000} onChange={e => setImportantNote(e.target.value)} placeholder={t("সময়, স্থান বা প্রস্তুতি", "Time, place or prep")} /></label>
        <label className="checkbox-line"><input type="checkbox" checked={importantNotify} onChange={e => setImportantNotify(e.target.checked)} />{t("ডিভাইসে নোটিফিকেশন", "Device notification")}</label>
        <button className="button primary" type="submit"><Plus size={16} />{t("তারিখ যোগ করো", "Add a date")}</button>
      </form>
      {upcomingImportant.length ? <div className="important-list">{upcomingImportant.map(item => <div className="important-row" key={item.id}><span className="important-days">{bn(daysUntil(item.date))}<small>{t("দিন", "Day")}</small></span><div><strong>{item.title}</strong><span>{formatDate(item.date, 'long')}{item.note ? ` · ${item.note}` : ''}</span></div>{item.notify && <BellRing size={15} />}<button className="icon-button delete-button" aria-label={t("তারিখ মুছো", "Delete date")} onClick={() => removeImportantDate(item.id)}><Trash2 size={15} /></button></div>)}</div> : <p className="muted padded">{t("আসন্ন কোনো তারিখ নেই। পরীক্ষার তারিখ বা নিজের লক্ষ্য যোগ করো।", "No upcoming date. Add an exam date or your own target.")}</p>}
    </section>
  </div>;
}
