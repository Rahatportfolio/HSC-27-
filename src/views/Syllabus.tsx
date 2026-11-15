import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronRight, FileText, Play, Search, ShieldAlert } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, PAPER_NAMES, SUBJECTS, SYLLABUS_NOTE, sortChapters, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, chapterFirstDate, chapterTasks, formatDate, isChapterDone, percent } from '../planner';
import { chapterMeta } from '../study';
import { CHAPTER_SCHEDULE } from '../schedule';
import { CHAPTER_CLASSES } from '../classLinks';
import { t } from '../i18n';
import { chapterClassProgress } from '../classes';
import { EmptyState, PageHeading, ProgressBar, SubjectIcon } from '../components';

const PRIORITY_LABEL: Record<string, string> = { A: 'আগে', B: 'এরপর', C: 'সময় থাকলে' };
export default function SyllabusView() {
  const { plan, data, openChapter } = usePlanner();
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [priority, setPriority] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [query, setQuery] = useState('');
  const [weakOnly, setWeakOnly] = useState(false);
  const [star, setStar] = useState<'all' | 5 | 3 | 1>('all');
  const [videoOnly, setVideoOnly] = useState(false);
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);
  const s = subjectById[subject];
  const chapters = sortChapters(CHAPTERS.filter(chapter => chapter.subject === subject));
  const done = chapters.filter(chapter => isChapterDone(plan, chapter.id, data.completed)).length;
  const weak = chapters.filter(chapter => chapterMeta(data, chapter.id).weak || data.confidence[chapter.id] === 'weak').length;
  const noted = chapters.filter(chapter => chapterMeta(data, chapter.id).note.trim()).length;
  const ready = chapters.filter(chapter => { const meta = chapterMeta(data, chapter.id); return meta.cq === 'ready' && meta.mcq === 'ready'; }).length;
  const visible = chapters.filter(chapter => (priority === 'all' || chapter.priority === priority)
    && (star === 'all' || CHAPTER_SCHEDULE[chapter.id]?.star === star)
    && (!videoOnly || (() => { const links = CHAPTER_CLASSES[chapter.id]; return !!links && [...links.oneShot, ...links.mcq, ...links.cq].some(option => option.kind !== 'search'); })())
    && (!weakOnly || chapterMeta(data, chapter.id).weak || data.confidence[chapter.id] === 'weak')
    && (!unwatchedOnly || (() => { const progress = chapterClassProgress(data, chapter.id); return progress.total > 0 && progress.watched < progress.total; })())
    && `${chapter.title} ${chapter.number} ${chapter.focus}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="view">
    <PageHeading eyebrow="THE BIG PICTURE" title="সিলেবাসটা গুছিয়ে নিই।" titleEn="Let’s organise the syllabus." description="আগে ভিত্তি, তারপর বাকি অধ্যায়। কোন পাঠ কবে পড়বে, নোট কী আছে, কোথায় দুর্বল—সব এক জায়গায়।" descriptionEn="Priorities, dates, chapter notes and confidence — all in one place. Foundations first." action={<div className="syllabus-total"><strong>{bn(CHAPTERS.length)}</strong><span>{t("অধ্যায় ও ইউনিট", "Chapters & units")}<br />{t("৭ বিষয় · ১৩ পত্র", "7 subjects · 13 papers")}</span></div>} />
    <div className="subject-tabs">{SUBJECTS.map(sub => { const total = CHAPTERS.filter(chapter => chapter.subject === sub.id), complete = total.filter(chapter => isChapterDone(plan, chapter.id, data.completed)).length; return <button key={sub.id} className={`subject-tab ${subject === sub.id ? 'active' : ''}`} onClick={() => { setSubject(sub.id); setQuery(''); setWeakOnly(false); }} style={{ '--subject': sub.color, '--subject-tint': sub.tint } as CSSProperties}><span className="subject-tab-icon"><SubjectIcon subject={sub.id} /></span><strong>{sub.name}</strong><span>{bn(complete)}/{bn(total.length)}{sub.optional ? ' · ৪র্থ বিষয়' : ''}</span></button>; })}</div>
    <section className="card syllabus-card">
      <div className="syllabus-subject-heading"><div><h2>{s.name} {s.optional && <span className="optional-badge">{t("চতুর্থ বিষয়", "Fourth subject")}</span>}</h2><p>বিষয় কোড {s.code} · {bn(done)} / {bn(chapters.length)} সম্পন্ন</p></div><div className="syllabus-subject-progress"><strong>{bn(percent(done, chapters.length))}%</strong><ProgressBar value={percent(done, chapters.length)} color={s.color} /></div></div>
      <div className="syllabus-summary"><span><Check size={15} /><strong>{bn(done)}</strong>{t("সম্পন্ন", "Done")}</span><span><ShieldAlert size={15} /><strong>{bn(weak)}</strong>{t("দুর্বল", "Weak")}</span><span><FileText size={15} /><strong>{bn(noted)}</strong>{t("নোটযুক্ত", "With notes")}</span><span><BookOpen size={15} /><strong>{bn(ready)}</strong>{t("CQ+MCQ প্রস্তুত", "CQ+MCQ ready")}</span><span><Play size={15} /><strong>{bn(chapters.reduce((sum, chapter) => sum + chapterClassProgress(data, chapter.id).watched, 0))}</strong>{t("ক্লাস দেখা", "Classes watched")}</span></div>
      <div className="filter-bar"><label className="search-field"><Search size={17} /><input placeholder={t("অধ্যায় বা টপিক খুঁজো…", "Search chapter or topic…")} aria-label={t("অধ্যায় খুঁজো", "Search chapters")} value={query} onChange={e => setQuery(e.target.value)} /></label><div className="segmented">{(['all', 'A', 'B', 'C'] as const).map(p => <button key={p} className={priority === p ? 'active' : ''} onClick={() => setPriority(p)}>{p === 'all' ? 'সব অধ্যায়' : `${p} · ${PRIORITY_LABEL[p]}`}</button>)}</div><div className="segmented star-filter">{(['all', 5, 3, 1] as const).map(value => { const count = value === 'all' ? chapters.length : chapters.filter(chapter => CHAPTER_SCHEDULE[chapter.id]?.star === value).length; return <button key={value} className={star === value ? 'active' : ''} aria-pressed={star === value} onClick={() => setStar(value)} disabled={value !== 'all' && count === 0}>{value === 'all' ? 'সব ★' : `${value}★`}<small>{bn(count)}</small></button>; })}</div><button className={`button ${weakOnly ? 'primary' : 'secondary'} small`} aria-pressed={weakOnly} onClick={() => setWeakOnly(!weakOnly)}><ShieldAlert size={15} />{t("শুধু দুর্বল", "Weak only")}</button><button className={`button ${videoOnly ? 'primary' : 'secondary'} small`} aria-pressed={videoOnly} onClick={() => setVideoOnly(!videoOnly)} title={t("যেসব অধ্যায়ে সরাসরি ক্লাস ভিডিও বা প্লেলিস্ট আছে", "Chapters with a direct class video or playlist")}><Play size={15} />{t("ভিডিও আছে", "Has video")}</button><button className={`button ${unwatchedOnly ? 'primary' : 'secondary'} small`} aria-pressed={unwatchedOnly} onClick={() => setUnwatchedOnly(!unwatchedOnly)} title={t("যেসব অধ্যায়ের সরাসরি ক্লাস এখনও দেখা হয়নি", "Chapters whose direct class is still unwatched")}><Play size={15} />{t("ক্লাস বাকি", "Classes pending")}<span className="count-badge">{bn(chapters.filter(chapter => { const progress = chapterClassProgress(data, chapter.id); return progress.total > 0 && progress.watched < progress.total; }).length)}</span></button></div>
      <p className="plan-legend"><span className="star-badge s5">★★★★★</span> {t('সবচেয়ে গুরুত্বপূর্ণ — প্রথমে পড়ো', 'Most important — study first')}<span className="legend-sep">·</span><span className="star-badge s3">★★★</span> {t('মাঝারি — দ্বিতীয় ধাপে', 'Medium — second pass')}<span className="legend-sep">·</span><span className="star-badge s1">★</span> {t('কম সময় দিলেও চলবে', 'Can take less time')}</p>
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
              <span className="chapter-copy"><strong>{chapter.title}{isWeak && <span className="weak-pill">{t("দুর্বল", "Weak")}</span>}{meta.note.trim() && <span className="note-pill"><FileText size={11} />{t("নোট", "Notes")}</span>}</strong><span>{chapter.focus}</span><span className="chapter-prep">{meta.mcq !== 'none' && <em>MCQ {meta.mcq === 'ready' ? '✓' : '…'}</em>}{meta.cq !== 'none' && <em>CQ {meta.cq === 'ready' ? '✓' : '…'}</em>}{meta.note.trim() && <em>{meta.note.trim().slice(0, 36)}…</em>}</span></span>
              {(() => { const slot = CHAPTER_SCHEDULE[chapter.id]; return slot ? <span className="chapter-plan-cell"><span className={`star-badge s${slot.star}`}>{'★'.repeat(slot.star)}{'☆'.repeat(5 - slot.star)}</span><small>{bn(slot.hours)} ঘণ্টা · শেষ {formatDate(slot.end)}</small><small className="plan-links">{(() => { const progress = chapterClassProgress(data, chapter.id); if (!progress.total) return 'চ্যানেলে খুঁজে নাও'; return progress.watched ? `${bn(progress.watched)}/${bn(progress.total)} ক্লাস দেখা` : `${bn(progress.total)}টি ক্লাস ভিডিও`; })()}</small></span> : null; })()}
              <span className={`priority-badge ${chapter.priority.toLowerCase()}`}>{chapter.priority}</span>
              <span className="chapter-date">{date ? formatDate(date) : 'তারিখ নেই'}<small>{bn(complete)}/{bn(tasks.length)} ধাপ</small></span>
              <ChevronRight size={17} />
            </button>;
          })}</div>
        </div>;
      })}
      {!visible.length && <EmptyState title={t("মিলে যাওয়া অধ্যায় নেই", "No matching chapter")} description="অন্য শব্দ দিয়ে খুঁজো, অগ্রাধিকার ফিল্টার বদলাও বা দুর্বল ফিল্টার বন্ধ করো।" />}
    </section>
    <div className="info-panel"><ArrowUpRight size={18} /><p>{SYLLABUS_NOTE}</p></div>
  </div>;
}
