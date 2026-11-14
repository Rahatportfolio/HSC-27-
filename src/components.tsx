import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, Clock3, FlaskConical, Leaf, NotebookPen, Sparkles, X } from 'lucide-react';
import { subjectById } from './data';
import type { SubjectId } from './data';
import { bn, dhakaMinutes, formatDate, formatTime, getPhases, percent } from './planner';
import type { Day, Task } from './planner';
import { usePlanner } from './context';

export function SubjectBadge({ subject, small = false }: { subject: SubjectId; small?: boolean }) {
  const s = subjectById[subject];
  return <span className={`subject-badge ${small ? 'small' : ''}`} style={{ '--subject': s.color, '--subject-tint': s.tint } as CSSProperties}><span className="subject-dot" />{s.short}</span>;
}
export function SubjectIcon({ subject, size = 18 }: { subject: SubjectId; size?: number }) {
  const Icon = subject === 'chemistry' ? FlaskConical : subject === 'biology' ? Leaf : subject === 'bangla' || subject === 'english' ? BookOpen : NotebookPen;
  return <Icon size={size} strokeWidth={1.7} />;
}
export function ProgressBar({ value, color, className = '' }: { value: number; color?: string; className?: string }) {
  return <div className={`progress-track ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} /></div>;
}
export function ProgressRing({ value, size = 112, stroke = 8, children, color = 'var(--green)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return <div className="progress-ring" style={{ width: size, height: size }}><svg width={size} height={size} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="ring-track" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg><div className="ring-content">{children}</div></div>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || []);
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') || focusable()[0]; first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') { const items = focusable(); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="বন্ধ করো"><X size={20} /></button></div><div className="modal-body">{children}</div></div></div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><CheckCheck size={28} strokeWidth={1.5} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function PhaseJourney({ startDate, activeDate }: { startDate: string; activeDate: string }) {
  const { navigate } = usePlanner();
  const phases = getPhases(startDate);
  return <div className="phase-journey">{phases.map((p, i) => {
    const active = activeDate >= p.start && activeDate <= p.end;
    return <button key={p.id} className={`phase-step ${active ? 'active' : ''}`} onClick={() => navigate('calendar', p.start)} style={{ '--phase-color': p.color } as CSSProperties}><span className="phase-number">{active ? <span className="live-dot" /> : bn(i + 1)}</span><span className="phase-copy"><strong>{p.name}</strong><span>{formatDate(p.start)} – {formatDate(p.end)} <span className="phase-days">· {bn(p.days)} দিন</span></span></span>{i < 2 && <ChevronRight className="phase-arrow" size={17} />}</button>;
  })}</div>;
}
export function TaskCard({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { data, toggleTask, today, now, openMistake } = usePlanner();
  const [expanded, setExpanded] = useState(false);
  const done = !!data.completed[task.id];
  const minute = dhakaMinutes(now);
  const current = task.date === today && minute >= task.startMinute && minute < task.endMinute && !done;
  return <article className={`task-card ${done ? 'done' : ''} ${current ? 'current' : ''} ${compact ? 'compact' : ''}`}>
    <div className="task-time"><strong>{formatTime(task.startMinute).split(' ')[0]}</strong><span>{formatTime(task.startMinute).split(' ')[1]}</span><span className="time-line" /><small>{bn(task.endMinute - task.startMinute)} মি.</small></div>
    <div className="task-main"><div className="task-topline"><SubjectBadge subject={task.subject} small />{current && <span className="now-badge">এখন চলছে</span>}{task.kind === 'exam' && <span className="kind-badge">মডেল টেস্ট</span>}{task.kind === 'revision' && <span className="kind-badge">রিভিশন</span>}</div>
      <button className="task-title-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><h3>{task.title}</h3><ChevronDown size={16} className={expanded ? 'rotated' : ''} /></button>
      <p className={`task-detail ${expanded ? 'expanded' : ''}`}>{task.detail}</p>
      {expanded && <div className="task-expanded"><span><Clock3 size={14} />{formatTime(task.startMinute)} – {formatTime(task.endMinute)}</span><button className="text-button" onClick={() => openMistake(task.subject, `${task.title}: `)}><NotebookPen size={14} />ভুলের খাতায় যোগ করো</button></div>}
    </div>
    <button className={`task-check ${done ? 'checked' : ''}`} onClick={() => toggleTask(task.id)} aria-label={`${task.title} — ${done ? 'অসম্পন্ন করো' : 'সম্পন্ন করো'}`} aria-pressed={done}>{done && <Check size={17} strokeWidth={2.5} />}</button>
  </article>;
}
export function WeekChart({ large = false }: { large?: boolean }) {
  const { plan, data, today, setSelectedDate, navigate } = usePlanner();
  const date = new Date(`${today}T00:00:00Z`); const dow = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - dow * 86400000).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10); return { date: d, day: plan.find(x => x.date === d) }; });
  return <div className={`week-chart ${large ? 'large' : ''}`}>{days.map((d, i) => {
    const minutes = d.day?.tasks.filter(t => data.completed[t.id]).reduce((n, t) => n + t.endMinute - t.startMinute, 0) || 0;
    return <button key={d.date} className={`week-day ${d.date === today ? 'today' : ''}`} onClick={() => { setSelectedDate(d.date); navigate('today', d.date); }} title={`${formatDate(d.date)}: ${bn(Math.round(minutes / 6) / 10)} ঘণ্টার কাজ সম্পন্ন`}><div className="bar-space"><span style={{ height: `${Math.max(3, Math.min(100, minutes / (data.settings.dailyHours * 60) * 100))}%` }} className={minutes ? 'has-value' : ''} /></div><span>{['সো', 'মঙ্গল', 'বু', 'বৃ', 'শু', 'শ', 'র'][i]}</span>{large && <small>{bn(Math.round(minutes / 6) / 10)}ঘ</small>}</button>;
  })}</div>;
}
export function StudyIllustration() {
  return <svg className="study-illustration" viewBox="0 0 280 210" fill="none" aria-hidden="true"><circle cx="161" cy="102" r="83" fill="#DCE7CC" /><circle cx="220" cy="42" r="19" fill="#F2D995" /><path d="M43 165c35-13 62-8 94 8 36-18 69-20 105-7v16c-38-12-70-5-105 10-34-16-64-20-94-9z" fill="#B8CDA7" opacity=".4" /><path d="M42 70c31-9 62-2 94 18 32-20 63-27 94-18v94c-31-9-62-2-94 18-32-20-63-27-94-18z" fill="#FAFCF4" stroke="#719475" strokeWidth="2.5" /><path d="M136 89v92" stroke="#719475" strokeWidth="2.5" /><path d="M57 91c22-3 42 2 62 13M57 108c22-3 42 2 62 13M57 125c22-3 42 2 62 13M57 142c17-2 32 1 45 7" stroke="#C2D2B7" strokeWidth="4" strokeLinecap="round" /><path d="M153 105c17-10 36-15 59-14M153 122c17-10 36-15 59-14M153 139c17-10 36-15 44-14" stroke="#C2D2B7" strokeWidth="4" strokeLinecap="round" /><path d="M182 54c-3-24 8-37 27-40-1 22-11 34-27 40z" fill="#6F956B" /><path d="M181 55c-20-4-29-17-27-34 19 3 28 15 27 34z" fill="#A4BD87" /><path d="M181 54v30" stroke="#6F956B" strokeWidth="3" strokeLinecap="round" /><rect x="178" y="128" width="70" height="54" rx="12" fill="#2B654E" transform="rotate(-8 178 128)" /><path d="m198 151 9 7 17-21" stroke="#EDF4DE" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="m40 39 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#9BB486" /><circle cx="247" cy="102" r="4" fill="#A4BD87" /><circle cx="67" cy="188" r="3" fill="#C2A66C" /></svg>;
}
export function LocalNote() {
  const { data, setData, selectedDate, storageOk } = usePlanner();
  return <section className="card note-card"><div className="card-heading"><h3><NotebookPen size={17} />দিনের ছোট নোট</h3><span className="tiny-muted">{storageOk ? 'অটো সেভ' : 'সেভ হয়নি'}</span></div><textarea aria-label="দিনের নোট" placeholder="কী শিখলে, কোথায় আটকে গেলে… নিজের জন্য লিখে রাখো।" value={data.notes[selectedDate] || ''} maxLength={10000} onChange={e => setData(d => ({ ...d, notes: { ...d.notes, [selectedDate]: e.target.value } }))} /><span className="note-date">{formatDate(selectedDate, 'long')}</span></section>;
}
export function SyllabusNotice() {
  const { data, navigate } = usePlanner();
  if (data.settings.syllabusChecked) return null;
  return <div className="syllabus-notice"><Sparkles size={17} /><p>বইয়ের সঙ্গে সিলেবাস মিলিয়ে নাও। <span>A আগে, B এরপর—কোনো অধ্যায় বাদ নয়।</span></p><button className="text-button" onClick={() => navigate('settings')}>যাচাই করো <ArrowUpRight size={14} /></button></div>;
}
export function DaySummary({ day }: { day: Day }) {
  const { data } = usePlanner();
  const done = day.tasks.filter(t => data.completed[t.id]).length;
  return <div className="day-summary"><span>{bn(done)}/{bn(day.tasks.length)} কাজ শেষ</span><ProgressBar value={percent(done, day.tasks.length)} /></div>;
}
