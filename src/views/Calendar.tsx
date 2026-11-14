import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BellRing, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, GripVertical, ListChecks, Plus, Trash2 } from 'lucide-react';
import { usePlanner } from '../context';
import { SUBJECTS, subjectById } from '../data';
import type { SubjectId } from '../data';
import { addDays, bn, formatDate, getPhases, percent, phaseName, taskStart } from '../planner';
import { newId } from '../storage';
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
  const [routineWeekday, setRoutineWeekday] = useState(() => new Date(`${selectedDate}T00:00:00Z`).getUTCDay());
  const [routineTime, setRoutineTime] = useState('20:00');
  const [routineMinutes, setRoutineMinutes] = useState('60');
  const [routineSubject, setRoutineSubject] = useState<SubjectId>('physics');
  const [routineTitle, setRoutineTitle] = useState('');
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [importantTitle, setImportantTitle] = useState('');
  const [importantDate, setImportantDate] = useState(addDays(today, 7));
  const [importantNote, setImportantNote] = useState('');
  const [importantNotify, setImportantNotify] = useState(true);
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
  const addRoutineBlock = (event: React.FormEvent) => {
    event.preventDefault();
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(routineTime);
    const minutes = Number(routineMinutes);
    if (!match) { notify('শুরুর সময় HH:MM ফরম্যাটে লেখো।', 'error'); return; }
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 480) { notify('একটি ব্লক ১৫ থেকে ৪৮০ মিনিটের মধ্যে হতে হবে।', 'error'); return; }
    if (data.routineBlocks.length >= 40) { notify('সর্বোচ্চ ৪০টি কাস্টম ব্লক রাখা যায়।', 'error'); return; }
    const startMinute = Number(match[1]) * 60 + Number(match[2]);
    setData(d => ({ ...d, routineBlocks: [...d.routineBlocks, { id: newId(), weekday: routineWeekday, startMinute, minutes, subject: routineSubject, title: routineTitle.trim(), createdAt: new Date().toISOString() }] }));
    setRoutineTitle('');
    notify('কাস্টম রুটিন ব্লক যোগ হয়েছে। শুধু এই সপ্তাহের দিনগুলোতে যোগ হবে।');
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
    notify('দুই ব্লকের সময় অদলবদল হয়েছে।');
  };
  const moveRoutineBlock = (id: string, direction: -1 | 1) => {
    const sameDay = data.routineBlocks.filter(block => block.weekday === routineWeekday).sort((a, b) => a.startMinute - b.startMinute);
    const index = sameDay.findIndex(block => block.id === id);
    const target = sameDay[index + direction];
    if (target) swapRoutineTimes(id, target.id);
  };
  const addImportantDate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!importantTitle.trim()) { notify('তারিখের নাম লেখো।', 'error'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(importantDate)) { notify('সঠিক তারিখ বাছো।', 'error'); return; }
    if (data.importantDates.length >= 200) { notify('সর্বোচ্চ ২০০টি তারিখ রাখা যায়।', 'error'); return; }
    setData(d => ({ ...d, importantDates: [...d.importantDates, { id: newId(), date: importantDate, title: importantTitle.trim(), note: importantNote.trim(), notify: importantNotify, createdAt: new Date().toISOString() }] }));
    setImportantTitle(''); setImportantNote('');
    notify('গুরুত্বপূর্ণ তারিখ যোগ হয়েছে।');
  };
  const removeImportantDate = (id: string) => setData(d => ({ ...d, importantDates: d.importantDates.filter(item => item.id !== id) }));
  const weekdayNames = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
  const routineRows = data.routineBlocks.filter(block => block.weekday === routineWeekday).sort((a, b) => a.startMinute - b.startMinute);
  const upcomingImportant = [...data.importantDates].sort((a, b) => a.date.localeCompare(b.date)).filter(item => item.date >= today).slice(0, 12);
  const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
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
    <PageHeading eyebrow="DAY BY DAY" title="এক দিন। এক পদক্ষেপ।" titleEn="One day. One step." description="কোন দিন কী পড়বে, সব আছে এখানে। মাস বা সপ্তাহে দেখো, তারিখে ক্লিক করে সেই দিনের কাজ দেখো।" descriptionEn="See what to study on every day. Switch between month and week, or pick a date to open its sessions." action={<div className="heading-actions"><div className="segmented small"><button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}><CalendarDays size={14} />মাস</button><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}><CalendarRange size={14} />সপ্তাহ</button></div><button className="button secondary" onClick={() => exportICS('all')}><CalendarDays size={17} />পুরো রুটিন</button></div>} />
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
    <section className="card routine-card">
      <div className="card-heading"><div><h2><Clock3 size={20} />কাস্টম সাপ্তাহিক রুটিন</h2><p>অটো রুটিনের সঙ্গে নিজের নির্দিষ্ট সময়ের সেশন যোগ করো। অধ্যায়ের অগ্রগতি বদলাবে না।</p></div><span className="count-badge">{bn(data.routineBlocks.length)} ব্লক</span></div>
      <div className="weekday-tabs">{weekdayNames.map((name, index) => <button key={name} type="button" className={routineWeekday === index ? 'active' : ''} onClick={() => setRoutineWeekday(index)}>{name}</button>)}</div>
      <form className="routine-form" onSubmit={addRoutineBlock}>
        <label>শুরু<input type="time" value={routineTime} onChange={e => setRoutineTime(e.target.value)} required /></label>
        <label>মিনিট<input type="number" min={15} max={480} step={5} value={routineMinutes} onChange={e => setRoutineMinutes(e.target.value)} required /></label>
        <label>বিষয়<select value={routineSubject} onChange={e => setRoutineSubject(e.target.value as SubjectId)}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>নাম (ঐচ্ছিক)<input value={routineTitle} maxLength={120} onChange={e => setRoutineTitle(e.target.value)} placeholder="যেমন: সূত্র ঝালাই" /></label>
        <button className="button primary" type="submit"><Plus size={16} />ব্লক যোগ করো</button>
      </form>
      {routineRows.length ? <div className="routine-list">{routineRows.map((block, index) => <div className={`routine-row${dragBlockId === block.id ? ' dragging' : ''}`} key={block.id} draggable onDragStart={event => { setDragBlockId(block.id); event.dataTransfer?.setData('text/plain', block.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragBlockId(null)} onDragOver={event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); const dragged = dragBlockId || event.dataTransfer?.getData('text/plain'); if (dragged) swapRoutineTimes(dragged, block.id); setDragBlockId(null); }}><span className="routine-grip" aria-hidden="true"><GripVertical size={14} /></span><span className="routine-time">{bn(String(Math.floor(block.startMinute / 60)).padStart(2, '0'))}:{bn(String(block.startMinute % 60).padStart(2, '0'))}</span><span className="subject-dot" style={{ background: subjectById[block.subject].color }} /><strong>{block.title || `${subjectById[block.subject].name}: কাস্টম সেশন`}</strong><small>{bn(block.minutes)} মিনিট · {weekdayNames[block.weekday]}বার</small><span className="routine-move"><button type="button" className="icon-button" aria-label="ব্লক উপরে সরাও" disabled={index === 0} onClick={() => moveRoutineBlock(block.id, -1)}><ChevronUp size={14} /></button><button type="button" className="icon-button" aria-label="ব্লক নিচে সরাও" disabled={index === routineRows.length - 1} onClick={() => moveRoutineBlock(block.id, 1)}><ChevronDown size={14} /></button></span><button className="icon-button delete-button" aria-label="ব্লক মুছো" onClick={() => removeRoutineBlock(block.id)}><Trash2 size={15} /></button></div>)}</div> : <p className="muted padded">এই দিনে কোনো কাস্টম ব্লক নেই। উপরে একটি যোগ করো।</p>}
      <p className="tiny-muted">কাস্টম ব্লক ১৮১ দিনের রুটিনে প্রতি সপ্তাহে একই দিনে যোগ হবে। অনেকগুলো ব্লক একই সময়ে থাকলে সময় মিলিয়ে নাও।</p>
    </section>
    <section className="card important-dates-card">
      <div className="card-heading"><div><h2><BellRing size={20} />গুরুত্বপূর্ণ তারিখ</h2><p>পরীক্ষা, স্কুল ইভেন্ট বা নিজের লক্ষ্য—আলাদা করে মনে রাখো।</p></div><span className="count-badge">{bn(upcomingImportant.length)} আসন্ন</span></div>
      <form className="important-form" onSubmit={addImportantDate}>
        <label>তারিখ<input type="date" min={addDays(today, -365)} max="2041-12-31" value={importantDate} onChange={e => setImportantDate(e.target.value)} required /></label>
        <label>নাম<input value={importantTitle} maxLength={200} onChange={e => setImportantTitle(e.target.value)} placeholder="যেমন: রসায়ন মডেল টেস্ট" required /></label>
        <label>নোট (ঐচ্ছিক)<input value={importantNote} maxLength={2000} onChange={e => setImportantNote(e.target.value)} placeholder="সময়, স্থান বা প্রস্তুতি" /></label>
        <label className="checkbox-line"><input type="checkbox" checked={importantNotify} onChange={e => setImportantNotify(e.target.checked)} />ডিভাইসে নোটিফিকেশন</label>
        <button className="button primary" type="submit"><Plus size={16} />তারিখ যোগ করো</button>
      </form>
      {upcomingImportant.length ? <div className="important-list">{upcomingImportant.map(item => <div className="important-row" key={item.id}><span className="important-days">{bn(daysUntil(item.date))}<small>দিন</small></span><div><strong>{item.title}</strong><span>{formatDate(item.date, 'long')}{item.note ? ` · ${item.note}` : ''}</span></div>{item.notify && <BellRing size={15} />}<button className="icon-button delete-button" aria-label="তারিখ মুছো" onClick={() => removeImportantDate(item.id)}><Trash2 size={15} /></button></div>)}</div> : <p className="muted padded">আসন্ন কোনো তারিখ নেই। পরীক্ষার তারিখ বা নিজের লক্ষ্য যোগ করো।</p>}
    </section>
  </div>;
}
