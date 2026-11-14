import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { usePlanner } from '../context';
import { SUBJECTS } from '../data';
import type { SubjectId } from '../data';
import { addDays, bn, formatDate, getPhases, percent, phaseName, taskStart } from '../planner';
import type { PhaseId } from '../planner';
import { DaySummary, EmptyState, PageHeading, ProgressBar, TaskCard } from '../components';

export default function CalendarView() {
  const { plan, data, today, selectedDate, setSelectedDate, navigate, exportICS } = usePlanner();
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  useEffect(() => setMonth(selectedDate.slice(0, 7)), [selectedDate]);
  const [phase, setPhase] = useState<PhaseId | 'all'>('all');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [backlog, setBacklog] = useState(false);
  const phases = getPhases(data.settings.startDate);
  const byDate = useMemo(() => new Map(plan.map(d => [d.date, d])), [plan]);
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
  const shiftMonth = (n: number) => { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const day = byDate.get(selectedDate);
  const visibleTasks = day?.tasks.filter(t => (subject === 'all' || t.subject === subject) && (phase === 'all' || t.phase === phase)) || [];
  const overdue = plan.flatMap(d => d.tasks).filter(t => taskStart(t).date < today && !data.completed[t.id] && (subject === 'all' || t.subject === subject) && (phase === 'all' || t.phase === phase));
  const filteredDates = new Set(plan.filter(d => phase === 'all' || d.phase === phase).flatMap(d => d.tasks.filter(t => subject === 'all' || t.subject === subject).map(() => d.date)));
  return <div className="view"><PageHeading eyebrow="DAY BY DAY" title="এক দিন। এক পদক্ষেপ।" description="কোন দিন কী পড়বে, সব আছে এখানে। তারিখে ক্লিক করে সেই দিনের কাজ দেখো।" action={<button className="button secondary" onClick={() => exportICS('all')}><CalendarDays size={17} />পুরো রুটিন এক্সপোর্ট</button>} />
    <div className="filter-bar"><div className="segmented">{(['all', 'learn', 'revise', 'exam'] as const).map(p => <button key={p} className={phase === p ? 'active' : ''} onClick={() => setPhase(p)}>{p === 'all' ? 'সব ধাপ' : phaseName(p)}</button>)}</div><select aria-label="বিষয় ফিল্টার" value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">সব বিষয়</option>{SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className={`button ${backlog ? 'primary' : 'secondary'}`} onClick={() => setBacklog(!backlog)}><ListChecks size={16} />ব্যাকলগ <span className="count-badge">{bn(overdue.length)}</span></button></div>
    {backlog ? <section className="card backlog-card"><div className="card-heading"><h2>আগের অসমাপ্ত কাজ</h2><span className="tiny-muted">পুরোনো থেকে নতুন</span></div>{overdue.length ? <div className="backlog-list">{overdue.slice(0, 100).map(t => <div key={t.id} className="backlog-row"><div><span className="eyebrow">{formatDate(t.date)} · {phaseName(t.phase)}</span><strong>{t.title}</strong></div><button className="button secondary small" onClick={() => { setSelectedDate(t.date); setBacklog(false); setMonth(t.date.slice(0, 7)); }}>সেদিনে যাও <ArrowRight size={14} /></button></div>)}{overdue.length > 100 && <p className="muted padded">প্রথম ১০০টি দেখানো হচ্ছে। বাকিগুলো সংশ্লিষ্ট তারিখে পাবে।</p>}</div> : <EmptyState title="ব্যাকলগ নেই" description="অতীতের সব নির্ধারিত কাজ শেষ, অথবা এখনও কোনো কাজ বাকি পড়েনি।" />}</section> : <div className="calendar-layout"><section className="card calendar-card"><div className="calendar-toolbar"><div><h2>{formatDate(first, 'month')}</h2><div className="calendar-legend">{phases.map(p => <span key={p.id}><i style={{ background: p.color }} />{phaseName(p.id)}</span>)}</div></div><div className="calendar-nav"><button className="button secondary small" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }}>আজ</button><button className="icon-button" aria-label="আগের মাস" onClick={() => shiftMonth(-1)}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="পরের মাস" onClick={() => shiftMonth(1)}><ChevronRight size={19} /></button></div></div><div className="calendar-weekdays">{['সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি', 'রবি'].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{cells.map(date => {
      const d = byDate.get(date), inMonth = date.startsWith(month), matches = filteredDates.has(date);
      const done = d?.tasks.filter(t => data.completed[t.id] && (subject === 'all' || t.subject === subject)).length || 0;
      const total = d?.tasks.filter(t => subject === 'all' || t.subject === subject).length || 0;
      const p = phases.find(p => date >= p.start && date <= p.end);
      return <button key={date} className={`calendar-cell ${!inMonth ? 'outside' : ''} ${date === today ? 'is-today' : ''} ${date === selectedDate ? 'selected' : ''} ${!matches ? 'filtered' : ''}`} onClick={() => setSelectedDate(date)} aria-label={`${formatDate(date, 'long')}${d ? `, ${phaseName(d.phase)}, ${bn(done)}/${bn(total)} কাজ শেষ` : ', কোনো সেশন নেই'}`} aria-pressed={date === selectedDate}><span className="cell-date">{bn(Number(date.slice(8)))}</span>{d && matches && <><span className="cell-phase" style={{ background: p?.color }} /><span className="cell-label">{d.isCatchup ? 'ব্যাকলগ দিন' : phaseName(d.phase)}</span><ProgressBar value={percent(done, total)} color={p?.color} /></>}{date === today && <span className="today-dot" />}</button>;
    })}</div><div className="calendar-bottom"><span>তারিখ বেছে নাও, ডানদিকে কাজ দেখো।</span><span>{bn(plan.length)} দিনের পরিকল্পনা</span></div></section><aside className="card calendar-day-panel"><div className="card-heading"><div><span className="eyebrow">{formatDate(selectedDate, 'weekday')}</span><h2>{formatDate(selectedDate, 'long')}</h2></div>{day && <span className="phase-pill">{phaseName(day.phase)}</span>}</div>{day ? <><DaySummary day={day} /><div className="compact-tasks">{visibleTasks.length ? visibleTasks.map(t => <TaskCard key={t.id} task={t} compact />) : <EmptyState title="এই বিষয়ে কাজ নেই" description="ফিল্টার বদলে অন্য বিষয় দেখো।" />}</div><button className="button secondary full-width" onClick={() => navigate('today', selectedDate)}>বিস্তারিত রুটিন <ArrowRight size={16} /></button></> : <EmptyState title="এই দিনে কোনো সেশন নেই" description="পরিকল্পনার তারিখের মধ্যে একটি দিন বেছে নাও।" />}</aside></div>}
  </div>;
}
