import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronRight, FileText, Search, ShieldAlert } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, PAPER_NAMES, SUBJECTS, SYLLABUS_NOTE, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, chapterFirstDate, chapterTasks, formatDate, isChapterDone, percent } from '../planner';
import { chapterMeta } from '../study';
import { EmptyState, PageHeading, ProgressBar, SubjectIcon } from '../components';

const PRIORITY_LABEL: Record<string, string> = { A: 'আগে', B: 'এরপর', C: 'সময় থাকলে' };
export default function SyllabusView() {
  const { plan, data, openChapter } = usePlanner();
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [priority, setPriority] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [query, setQuery] = useState('');
  const [weakOnly, setWeakOnly] = useState(false);
  const s = subjectById[subject];
  const chapters = CHAPTERS.filter(chapter => chapter.subject === subject);
  const done = chapters.filter(chapter => isChapterDone(plan, chapter.id, data.completed)).length;
  const weak = chapters.filter(chapter => chapterMeta(data, chapter.id).weak || data.confidence[chapter.id] === 'weak').length;
  const noted = chapters.filter(chapter => chapterMeta(data, chapter.id).note.trim()).length;
  const ready = chapters.filter(chapter => { const meta = chapterMeta(data, chapter.id); return meta.cq === 'ready' && meta.mcq === 'ready'; }).length;
  const visible = chapters.filter(chapter => (priority === 'all' || chapter.priority === priority)
    && (!weakOnly || chapterMeta(data, chapter.id).weak || data.confidence[chapter.id] === 'weak')
    && `${chapter.title} ${chapter.number} ${chapter.focus}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="view">
    <PageHeading eyebrow="THE BIG PICTURE" title="সিলেবাসটা গুছিয়ে নিই।" titleEn="Let’s organise the syllabus." description="আগে ভিত্তি, তারপর বাকি অধ্যায়। কোন পাঠ কবে পড়বে, নোট কী আছে, কোথায় দুর্বল—সব এক জায়গায়।" descriptionEn="Priorities, dates, chapter notes and confidence — all in one place. Foundations first." action={<div className="syllabus-total"><strong>{bn(CHAPTERS.length)}</strong><span>অধ্যায় ও ইউনিট<br />৭ বিষয় · ১৩ পত্র</span></div>} />
    <div className="subject-tabs">{SUBJECTS.map(sub => { const total = CHAPTERS.filter(chapter => chapter.subject === sub.id), complete = total.filter(chapter => isChapterDone(plan, chapter.id, data.completed)).length; return <button key={sub.id} className={`subject-tab ${subject === sub.id ? 'active' : ''}`} onClick={() => { setSubject(sub.id); setQuery(''); setWeakOnly(false); }} style={{ '--subject': sub.color, '--subject-tint': sub.tint } as CSSProperties}><span className="subject-tab-icon"><SubjectIcon subject={sub.id} /></span><strong>{sub.name}</strong><span>{bn(complete)}/{bn(total.length)}{sub.optional ? ' · ৪র্থ বিষয়' : ''}</span></button>; })}</div>
    <section className="card syllabus-card">
      <div className="syllabus-subject-heading"><div><h2>{s.name} {s.optional && <span className="optional-badge">চতুর্থ বিষয়</span>}</h2><p>বিষয় কোড {s.code} · {bn(done)} / {bn(chapters.length)} সম্পন্ন</p></div><div className="syllabus-subject-progress"><strong>{bn(percent(done, chapters.length))}%</strong><ProgressBar value={percent(done, chapters.length)} color={s.color} /></div></div>
      <div className="syllabus-summary"><span><Check size={15} /><strong>{bn(done)}</strong> সম্পন্ন</span><span><ShieldAlert size={15} /><strong>{bn(weak)}</strong> দুর্বল</span><span><FileText size={15} /><strong>{bn(noted)}</strong> নোটযুক্ত</span><span><BookOpen size={15} /><strong>{bn(ready)}</strong> CQ+MCQ প্রস্তুত</span></div>
      <div className="filter-bar"><label className="search-field"><Search size={17} /><input placeholder="অধ্যায় বা টপিক খুঁজো…" aria-label="অধ্যায় খুঁজো" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="segmented">{(['all', 'A', 'B', 'C'] as const).map(p => <button key={p} className={priority === p ? 'active' : ''} onClick={() => setPriority(p)}>{p === 'all' ? 'সব অধ্যায়' : `${p} · ${PRIORITY_LABEL[p]}`}</button>)}</div><button className={`button ${weakOnly ? 'primary' : 'secondary'} small`} aria-pressed={weakOnly} onClick={() => setWeakOnly(!weakOnly)}><ShieldAlert size={15} />শুধু দুর্বল</button></div>
      {[1, 2].map(paper => {
        const rows = visible.filter(chapter => chapter.paper === paper);
        if (!rows.length) return null;
        return <div className="paper-section" key={paper}>
          <div className="paper-heading"><h3>{PAPER_NAMES[subject][paper - 1]}</h3><span>{bn(rows.length)}টি অধ্যায়/ইউনিট</span></div>
          <div className="chapter-list">{rows.map(chapter => {
            const tasks = chapterTasks(plan, chapter.id), complete = tasks.filter(task => data.completed[task.id]).length;
            const isDone = complete === tasks.length && tasks.length > 0;
            const date = chapterFirstDate(plan, chapter.id);
            const meta = chapterMeta(data, chapter.id);
            const isWeak = meta.weak || data.confidence[chapter.id] === 'weak';
            return <button key={chapter.id} className={`chapter-row ${isDone ? 'done' : ''} ${isWeak ? 'weak' : ''}`} onClick={() => openChapter(chapter)}>
              <span className={`chapter-number ${isDone ? 'complete' : ''}`}>{isDone ? <Check size={17} /> : chapter.subject === 'english' || chapter.subject === 'bangla' ? <BookOpen size={15} /> : bn(chapter.number)}</span>
              <span className="chapter-copy"><strong>{chapter.title}{isWeak && <span className="weak-pill">দুর্বল</span>}{meta.note.trim() && <span className="note-pill"><FileText size={11} />নোট</span>}</strong><span>{chapter.focus}</span><span className="chapter-prep">{meta.mcq !== 'none' && <em>MCQ {meta.mcq === 'ready' ? '✓' : '…'}</em>}{meta.cq !== 'none' && <em>CQ {meta.cq === 'ready' ? '✓' : '…'}</em>}{meta.note.trim() && <em>{meta.note.trim().slice(0, 36)}…</em>}</span></span>
              <span className={`priority-badge ${chapter.priority.toLowerCase()}`}>{chapter.priority}</span>
              <span className="chapter-date">{date ? formatDate(date) : 'তারিখ নেই'}<small>{bn(complete)}/{bn(tasks.length)} ধাপ</small></span>
              <ChevronRight size={17} />
            </button>;
          })}</div>
        </div>;
      })}
      {!visible.length && <EmptyState title="মিলে যাওয়া অধ্যায় নেই" description="অন্য শব্দ দিয়ে খুঁজো, অগ্রাধিকার ফিল্টার বদলাও বা দুর্বল ফিল্টার বন্ধ করো।" />}
    </section>
    <div className="info-panel"><ArrowUpRight size={18} /><p>{SYLLABUS_NOTE}</p></div>
  </div>;
}
