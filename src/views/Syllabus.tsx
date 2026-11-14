import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronRight, Search } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, PAPER_NAMES, SUBJECTS, SYLLABUS_NOTE, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, chapterFirstDate, chapterTasks, formatDate, isChapterDone, percent } from '../planner';
import { EmptyState, PageHeading, ProgressBar, SubjectIcon } from '../components';

export default function SyllabusView() {
  const { plan, data, openChapter } = usePlanner();
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [priority, setPriority] = useState<'all' | 'A' | 'B'>('all');
  const [query, setQuery] = useState('');
  const s = subjectById[subject];
  const chapters = CHAPTERS.filter(c => c.subject === subject);
  const done = chapters.filter(c => isChapterDone(plan, c.id, data.completed)).length;
  const visible = chapters.filter(c => (priority === 'all' || c.priority === priority) && `${c.title} ${c.number} ${c.focus}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="view"><PageHeading eyebrow="THE BIG PICTURE" title="সিলেবাসটা গুছিয়ে নিই।" description="আগে ভিত্তি, তারপর বাকি অধ্যায়। কোন পাঠ কবে পড়বে—সব তারিখসহ।" action={<div className="syllabus-total"><strong>{bn(CHAPTERS.length)}</strong><span>অধ্যায় ও ইউনিট<br />৭ বিষয় · ১৩ পত্র</span></div>} />
    <div className="subject-tabs">{SUBJECTS.map(sub => { const total = CHAPTERS.filter(c => c.subject === sub.id), complete = total.filter(c => isChapterDone(plan, c.id, data.completed)).length; return <button key={sub.id} className={`subject-tab ${subject === sub.id ? 'active' : ''}`} onClick={() => { setSubject(sub.id); setQuery(''); }} style={{ '--subject': sub.color, '--subject-tint': sub.tint } as CSSProperties}><span className="subject-tab-icon"><SubjectIcon subject={sub.id} /></span><strong>{sub.name}</strong><span>{bn(complete)}/{bn(total.length)}{sub.optional ? ' · ৪র্থ বিষয়' : ''}</span></button>; })}</div>
    <section className="card syllabus-card"><div className="syllabus-subject-heading"><div><h2>{s.name} {s.optional && <span className="optional-badge">চতুর্থ বিষয়</span>}</h2><p>বিষয় কোড {s.code} · {bn(done)} / {bn(chapters.length)} সম্পন্ন</p></div><div className="syllabus-subject-progress"><strong>{bn(percent(done, chapters.length))}%</strong><ProgressBar value={percent(done, chapters.length)} color={s.color} /></div></div><div className="filter-bar"><label className="search-field"><Search size={17} /><input placeholder="অধ্যায় বা টপিক খুঁজো…" aria-label="অধ্যায় খুঁজো" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="segmented">{(['all', 'A', 'B'] as const).map(p => <button key={p} className={priority === p ? 'active' : ''} onClick={() => setPriority(p)}>{p === 'all' ? 'সব অধ্যায়' : `${p} · ${p === 'A' ? 'আগে' : 'এরপর'}`}</button>)}</div></div>
      {[1, 2].map(paper => { const rows = visible.filter(c => c.paper === paper); if (!rows.length) return null; return <div className="paper-section" key={paper}><div className="paper-heading"><h3>{PAPER_NAMES[subject][paper - 1]}</h3><span>{bn(rows.length)}টি অধ্যায়/ইউনিট</span></div><div className="chapter-list">{rows.map(c => { const tasks = chapterTasks(plan, c.id), complete = tasks.filter(t => data.completed[t.id]).length, isDone = complete === tasks.length && tasks.length > 0, date = chapterFirstDate(plan, c.id); return <button key={c.id} className={`chapter-row ${isDone ? 'done' : ''}`} onClick={() => openChapter(c)}><span className={`chapter-number ${isDone ? 'complete' : ''}`}>{isDone ? <Check size={17} /> : c.subject === 'english' || c.subject === 'bangla' ? <BookOpen size={15} /> : bn(c.number)}</span><span className="chapter-copy"><strong>{c.title}</strong><span>{c.focus}</span></span><span className={`priority-badge ${c.priority.toLowerCase()}`}>{c.priority}</span><span className="chapter-date">{date ? formatDate(date) : 'তারিখ নেই'}<small>{bn(complete)}/{bn(tasks.length)} ধাপ</small></span><ChevronRight size={17} /></button>; })}</div></div>; })}
      {!visible.length && <EmptyState title="মিলে যাওয়া অধ্যায় নেই" description="অন্য শব্দ দিয়ে খুঁজো বা অগ্রাধিকার ফিল্টার বদলাও।" />}
    </section><div className="info-panel"><ArrowUpRight size={18} /><p>{SYLLABUS_NOTE}</p></div>
  </div>;
}
