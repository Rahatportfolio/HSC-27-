import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react';
import { usePlanner } from '../context';
import { SUBJECTS, subjectById } from '../data';
import type { SubjectId } from '../data';
import { addDays, bn, formatDate, getPhases, percent, phaseName, taskStart } from '../planner';
import { startOfWeek, subjectMinutes } from '../analytics';
import type { PhaseId } from '../planner';
import { addBacklogToToday, addCarryover } from '../study';
import { DaySummary, EmptyState, PageHeading, ProgressBar, TaskCard } from '../components';

export default function CalendarView() {
  const { plan, data, setData, today, selectedDate, setSelectedDate, navigate, exportICS, notify } = usePlanner();
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [weekStart, setWeekStart] = useState(startOfWeek(selectedDate));
  useEffect(() => { setMonth(selectedDate.slice(0, 7)); setWeekStart(startOfWeek(selectedDate)); }, [selectedDate]);
  const [phase, setPhase] = useState<PhaseId | 'all'>('all');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [backlog, setBacklog] = useState(false);
  const phases = getPhases(data.settings.startDate);
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
  const carryToToday = (task: { id: string; title: string; subject: SubjectId; startMinute: number; endMinute: number; date: string }) => {
    setData(d => addCarryover(d, task, today));
    notify('আজকের ব্যাকলগে যোগ হয়েছে। Today পেজে টিক দিতে পারবে।', 'info');
  };
  const takeFive = () => {
    let added = 0;
    setData(d => { const result = addBacklogToToday(plan, d, today, 5); added = result.added; return result.data; });
    notify(added ? `${bn(added)}টি কাজ আজকের তালিকায় নেওয়া হয়েছে।` : 'যোগ করার মতো নতুন ব্যাকলগ নেই।', 'info');
  };
  return <div className="view">
    <PageHeading eyebrow="DAY BY DAY" title="এক দিন। এক পদক্ষেপ।" description="কোন দিন কী পড়বে, সব আছে এখানে। মাস বা সপ্তাহে দেখো, তারিখে ক্লিক করে সেই দিনের কাজ দেখো।" action={<div className="heading-actions"><div className="segmented small"><button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}><CalendarDays size={14} />মাস</button><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}><CalendarRange size={14} />সপ্তাহ</button></div><button className="button secondary" onClick={() => exportICS('all')}><CalendarDays size={17} />পুরো রুটিন</button></div>} />
    <div className="filter-bar"><div className="segmented">{(['all', 'learn', 'revise', 'exam'] as const).map(p => <button key={p} className={phase === p ? 'active' : ''} onClick={() => setPhase(p)}>{p === 'all' ? 'সব ধাপ' : phaseName(p)}</button>)}</div><select aria-label="বিষয় ফিল্টার" value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">সব বিষয়</option>{SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className={`button ${backlog ? 'primary' : 'secondary'}`} onClick={() => setBacklog(!backlog)}><ListChecks size={16} />ব্যাকলগ <span className="count-badge">{bn(overdue.length)}</span></button></div>
    {backlog ? <section className="card backlog-card"><div className="card-heading"><div><h2>আগের অসমাপ্ত কাজ</h2><span className="tiny-muted">পুরোনো থেকে নতুন · {bn(overdue.length)}টি</span></div><button className="button secondary small" onClick={takeFive}><Plus size={15} />৫টি আজকের তালিকায়</button></div>{overdue.length ? <div className="backlog-list">{overdue.slice(0, 100).map(task => <div key={task.id} className="backlog-row"><div><span className="eyebrow">{formatDate(task.date)} · {subjectById[task.subject].short} · {phaseName(task.phase)}</span><strong>{task.title}</strong></div><div className="backlog-actions"><button className="button secondary small" onClick={() => carryToToday(task)}><Plus size={14} />আজকের তালিকায়</button><button className="button ghost small" onClick={() => { setSelectedDate(task.date); setBacklog(false); setMonth(task.date.slice(0, 7)); }}>সেদিনে যাও <ArrowRight size={14} /></button></div></div>)}{overdue.length > 100 && <p className="muted padded">প্রথম ১০০টি দেখানো হচ্ছে। বাকিগুলো সংশ্লিষ্ট তারিখে পাবে।</p>}</div> : <EmptyState title="ব্যাকলগ নেই" description="অতীতের সব নির্ধারিত কাজ শেষ, অথবা এখনও কোনো কাজ বাকি পড়েনি।" />}</section>
      : <div className="calendar-layout">
        <section className="card calendar-card">
          {mode === 'month' ? <>
            <div className="calendar-toolbar"><div><h2>{formatDate(first, 'month')}</h2><div className="calendar-legend">{phases.map(p => <span key={p.id}><i style={{ background: p.color }} />{phaseName(p.id)}</span>)}</div></div><div className="calendar-nav"><button className="button secondary small" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }}>আজ</button><button className="icon-button" aria-label="আগের মাস" onClick={() => shiftMonth(-1)}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="পরের মাস" onClick={() => shiftMonth(1)}><ChevronRight size={19} /></button></div></div>
            <div className="calendar-weekdays">{['সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি', 'রবি'].map(d => <span key={d}>{d}</span>)}</div>
            <div className="calendar-grid">{cells.map(date => {
              const d = byDate.get(date), inMonth = date.startsWith(month), matches = filteredDates.has(date);
              const done = d?.tasks.filter(task => data.completed[task.id] && (subject === 'all' || task.subject === subject)).length || 0;
              const total = d?.tasks.filter(task => subject === 'all' || task.subject === subject).length || 0;
              const p = phases.find(phaseItem => date >= phaseItem.start && date <= phaseItem.end);
              return <button key={date} className={`calendar-cell ${!inMonth ? 'outside' : ''} ${date === today ? 'is-today' : ''} ${date === selectedDate ? 'selected' : ''} ${!matches ? 'filtered' : ''}`} onClick={() => setSelectedDate(date)} aria-label={`${formatDate(date, 'long')}${d ? `, ${phaseName(d.phase)}, ${bn(done)}/${bn(total)} কাজ শেষ` : ', কোনো সেশন নেই'}`} aria-pressed={date === selectedDate}><span className="cell-date">{bn(Number(date.slice(8)))}</span>{d && matches && <><span className="cell-phase" style={{ background: p?.color }} /><span className="cell-label">{d.isCatchup ? 'ব্যাকলগ দিন' : phaseName(d.phase)}</span><ProgressBar value={percent(done, total)} color={p?.color} /></>}{date === today && <span className="today-dot" />}</button>;
            })}</div>
            <div className="calendar-bottom"><span>তারিখ বেছে নাও, ডানদিকে কাজ দেখো।</span><span>{bn(plan.length)} দিনের পরিকল্পনা</span></div>
          </> : <>
            <div className="calendar-toolbar"><div><h2>{formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}</h2><div className="calendar-legend"><span>সপ্তাহের রুটিন ও মাপা সময়</span></div></div><div className="calendar-nav"><button className="button secondary small" onClick={() => setWeekStart(startOfWeek(today))}>এই সপ্তাহ</button><button className="icon-button" aria-label="আগের সপ্তাহ" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="পরের সপ্তাহ" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={19} /></button></div></div>
            <div className="week-plan-grid">{weekDays.map((date, i) => {
              const d = byDate.get(date);
              const minutes = weekSessions.filter(session => session.date === date).reduce((sum, session) => sum + session.minutes, 0);
              const done = d?.tasks.filter(task => data.completed[task.id]).length || 0;
              return <button key={date} className={`week-plan-day ${date === today ? 'today' : ''} ${date === selectedDate ? 'selected' : ''}`} onClick={() => setSelectedDate(date)}><span className="week-plan-name">{['সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি', 'রবি'][i]}</span><strong>{bn(Number(date.slice(8)))}</strong><span className="week-plan-month">{formatDate(date, 'month').split(' ')[0]}</span>{d ? <><span className="week-plan-count">{bn(done)}/{bn(d.tasks.length)}</span><div className="week-plan-dots">{d.tasks.map(task => <i key={task.id} title={`${subjectById[task.subject].name}: ${task.title}`} style={{ background: subjectById[task.subject].color, opacity: data.completed[task.id] ? .3 : 1 }} />)}</div></> : <span className="week-plan-count">—</span>}<span className="week-plan-minutes">{bn(Math.floor(minutes / 60))}ঘ {bn(minutes % 60)}মি</span></button>;
            })}</div>
            <div className="week-allocation"><strong>এই সপ্তাহে বিষয়ভিত্তিক মাপা সময়</strong>{SUBJECTS.map(s => <div className="allocation-row" key={s.id}><span>{s.short}</span><ProgressBar value={percent(allocation[s.id], Math.max(...Object.values(allocation), 1))} color={s.color} /><small>{bn(Math.floor(allocation[s.id] / 60))}ঘ {bn(allocation[s.id] % 60)}মি</small></div>)}</div>
          </>}
        </section>
        <aside className="card calendar-day-panel"><div className="card-heading"><div><span className="eyebrow">{formatDate(selectedDate, 'weekday')}</span><h2>{formatDate(selectedDate, 'long')}</h2></div>{day && <span className="phase-pill">{phaseName(day.phase)}</span>}</div>{day ? <><DaySummary day={day} /><div className="compact-tasks">{visibleTasks.length ? visibleTasks.map(task => <TaskCard key={task.id} task={task} compact />) : <EmptyState title="এই বিষয়ে কাজ নেই" description="ফিল্টার বদলে অন্য বিষয় দেখো।" />}</div><button className="button secondary full-width" onClick={() => navigate('today', selectedDate)}>বিস্তারিত রুটিন <ArrowRight size={16} /></button></> : <EmptyState title="এই দিনে কোনো সেশন নেই" description="পরিকল্পনার তারিখের মধ্যে একটি দিন বেছে নাও।" />}</aside>
      </div>}
  </div>;
}
