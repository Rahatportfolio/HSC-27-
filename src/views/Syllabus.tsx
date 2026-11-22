import { useState } from 'react';
import { RECOMMENDED_S_IDS, chapterWorkEstimate, hasFullPersonalAllocation, isPersonalTaskComplete, personalRoutineForChapter } from '../personalRoutine';
import type { CSSProperties } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, FileText, LayoutGrid, List, Play, Search, ShieldAlert } from 'lucide-react';
import { usePlanner } from '../context';
import { PAPER_NAMES, SUBJECTS, syllabusNote, sortChapters, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, chapterFirstDate, chapterStudyTasks, formatDate, formatDurationBn, percent } from '../planner';
import { chapterMeta } from '../study';
import { CHAPTER_SCHEDULE, scheduleFor } from '../schedule';
import { BANGLA_LESSONS, CHAPTER_CLASSES } from '../classLinks';
import { t } from '../i18n';
import { mergedChapters, isCustomChapter } from '../chapterStore';
import { chapterPriority, chapterStage, isLearningComplete } from '../learning';
import { chapterClassProgress } from '../classes';
import { ClassBlock, ClassLinkRow, EmptyState, LessonList, PageHeading, ProgressBar, SubjectIcon } from '../components';

// Resolved per render: a module-level object would freeze the language at import.
const priorityLabel = (priority: string): string =>
  priority === 'A' ? t('টেস্ট অগ্রাধিকার', 'Test priority')
    : priority === 'B' ? t('২য় ধাপ', 'Second pass')
      : t('পরের ধাপ', 'Later pass');

export default function SyllabusView() {
  const { plan, data, openChapter } = usePlanner();
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [status, setStatus] = useState<'all' | 'pending' | 'done'>('all');
  const [priority, setPriority] = useState<'all' | 'S' | 'A' | 'B' | 'C'>(data.personalRoutine?.scope === 'ALL' || data.personalRoutine?.scope === 'SELECTED' ? 'all' : data.personalRoutine || data.routineSetupRequired ? 'S' : 'all');
  const [query, setQuery] = useState('');
  const [weakOnly, setWeakOnly] = useState(false);
  const [star, setStar] = useState<'all' | 5 | 3 | 1>('all');
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);
  const [showFullBlocks, setShowFullBlocks] = useState(true);
  const [openLessons, setOpenLessons] = useState<Record<string, boolean>>({});

  const CHAPTERS = mergedChapters(data);
  const sIds = data.personalRoutine?.scope === 'SELECTED' ? data.personalRoutine.chapterIds.filter(id => data.personalRoutine!.categories?.[id] === 'S') : (data.personalRoutine?.scope === 'S' ? data.personalRoutine : data.personalPhases?.S)?.chapterIds || RECOMMENDED_S_IDS;
  const syllabusPriority = (chapter: (typeof CHAPTERS)[number]) => data.personalRoutine?.scope === 'SELECTED' && data.personalRoutine.categories?.[chapter.id] !== undefined
    ? data.personalRoutine.categories[chapter.id] : chapterPriority(chapter, data);
  const s = subjectById[subject];
  const chapters = sortChapters(CHAPTERS.filter(chapter => chapter.subject === subject && (priority !== 'S' || sIds.includes(chapter.id))));
  const done = chapters.filter(chapter => isLearningComplete(chapterStage(chapter, data, plan))).length;
  const weak = chapters.filter(chapter => chapterMeta(data, chapter.id).weak || data.confidence[chapter.id] === 'weak').length;
  const noted = chapters.filter(chapter => chapterMeta(data, chapter.id).note.trim()).length;
  const ready = chapters.filter(chapter => { const meta = chapterMeta(data, chapter.id); return meta.cq === 'ready' && meta.mcq === 'ready'; }).length;

  const visible = chapters.filter(chapter => (status === 'all' || (status === 'done') === isLearningComplete(chapterStage(chapter, data, plan)))
    && (priority === 'all' || (priority === 'S' ? sIds.includes(chapter.id) : !sIds.includes(chapter.id) && syllabusPriority(chapter) === priority))
    && (star === 'all' || CHAPTER_SCHEDULE[chapter.id]?.star === star)
    && (!weakOnly || chapterMeta(data, chapter.id).weak || data.confidence[chapter.id] === 'weak')
    && (!unwatchedOnly || (() => { const progress = chapterClassProgress(data, chapter.id); return progress.total > 0 && progress.watched < progress.total; })())
    && `${chapter.title} ${chapter.number} ${chapter.focus}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="view">
    <PageHeading
      eyebrow="SYLLABUS & DIRECT CLASSES"
      title="সিলেবাসটা গুছিয়ে নিই।"
      titleEn="Let’s organise the syllabus."
      description="অধ্যায় ও ব্যক্তিগত অগ্রগতি দেখো। বিদ্যমান ক্লাস লিংক ও HSC ২০২৭ সিলেবাস সম্পূর্ণ যাচাই করা হয়নি।"
      descriptionEn="Track your chapters. Existing class links and the HSC 2027 syllabus have not been fully verified."
      action={<div className="syllabus-total"><strong>{bn(priority === 'S' ? sIds.length : CHAPTERS.length)}</strong><span>{priority === 'S' && 'S · '}{t('অধ্যায় ও ইউনিট', 'Chapters & units')}<br />{t('৭ বিষয় · ১৩ পত্র', '7 subjects · 13 papers')}</span></div>}
    />

    {data.personalRoutine?.scope !== 'ALL' && data.personalRoutine?.scope !== 'SELECTED' && <section className="card s-shortlist-notice"><span className="s-category-badge">S</span><div><strong>{t('A থেকে বাছাই করা গুরুত্বপূর্ণ অধ্যায়', 'Important chapters selected from A')} · {bn(sIds.length)}</strong><p>{data.personalRoutine && data.personalRoutine.scope !== 'S' ? t(`S সংরক্ষিত আছে; S-এর সব কাজ শেষ করে এখন ${data.personalRoutine.scope} ধাপ চলছে। বাকি A/B/C লাইব্রেরিতে থাকবে।`, `S is retained. After completing its required work you are now in phase ${data.personalRoutine.scope}. Other A/B/C chapters remain in the library.`) : data.personalRoutine ? t('এখন শুধু এই S তালিকাই রুটিনের লক্ষ্য। বাকি A/B/C দেখা যাবে, কিন্তু শেষ করতে বাধ্য করা হবে না।', 'Only your S shortlist is this routine’s goal. Other A/B/C chapters remain available, not compulsory.') : t('প্রস্তাবিত shortlist = A-এর ৫★ অধ্যায়। সব অধ্যায়ের রুটিন চালু করতে হোম/Settings-এ নিজের সময় দাও; পুরোনো রুটিন নিজে থেকে বদলায়নি।', 'Suggested shortlist = five-star A chapters. Set your availability in Home/Settings to plan all chapters; the legacy routine has not silently changed.')}</p></div><button type="button" className="button primary small" onClick={() => setPriority('S')}>{t('S ক্যাটাগরি দেখো', 'Show S category')}</button></section>}
    <div className="subject-tabs">
      {SUBJECTS.map(sub => {
        const total = CHAPTERS.filter(chapter => chapter.subject === sub.id && (priority !== 'S' || sIds.includes(chapter.id)));
        const complete = total.filter(chapter => isLearningComplete(chapterStage(chapter, data, plan))).length;
        return <button key={sub.id} className={`subject-tab ${subject === sub.id ? 'active' : ''}`} onClick={() => { setSubject(sub.id); setQuery(''); setWeakOnly(false); setUnwatchedOnly(false); setPriority(data.personalRoutine?.scope === 'ALL' || data.personalRoutine?.scope === 'SELECTED' ? 'all' : data.personalRoutine || data.routineSetupRequired ? 'S' : 'all'); setStar('all'); setStatus('all'); }} style={{ '--subject': sub.color, '--subject-tint': sub.tint } as CSSProperties}>
          <span className="subject-tab-icon"><SubjectIcon subject={sub.id} /></span>
          <strong>{sub.name}</strong>
          <span>{bn(complete)}/{bn(total.length)}{sub.optional ? ` · ${t('৪র্থ বিষয়','4th subject')}` : ''}</span>
        </button>;
      })}
    </div>

    <section className="card syllabus-card">
      <div className="syllabus-subject-heading">
        <div>
          <h2>{s.name} {s.optional && <span className="optional-badge">{t('চতুর্থ বিষয়', 'Fourth subject')}</span>}</h2>
          <p>{t('বিষয় কোড','Subject code')} {s.code} · {bn(done)} / {bn(chapters.length)} {t('সম্পন্ন','done')}</p>
        </div>
        <div className="syllabus-subject-progress">
          <strong>{bn(percent(done, chapters.length))}%</strong>
          <ProgressBar value={percent(done, chapters.length)} color={s.color} />
        </div>
      </div>

      <div className="syllabus-summary">
        <span><Check size={15} /><strong>{bn(done)}</strong>{t('সম্পন্ন', 'Done')}</span>
        <span><ShieldAlert size={15} /><strong>{bn(weak)}</strong>{t('দুর্বল', 'Weak')}</span>
        <span><FileText size={15} /><strong>{bn(noted)}</strong>{t('নোটযুক্ত', 'With notes')}</span>
        <span><BookOpen size={15} /><strong>{bn(ready)}</strong>{t('CQ+MCQ প্রস্তুত', 'CQ+MCQ ready')}</span>
        <span><Play size={15} /><strong>{bn(chapters.reduce((sum, chapter) => sum + chapterClassProgress(data, chapter.id).watched, 0))}</strong>{t('ক্লাস দেখা', 'Classes watched')}</span>
      </div>

      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input placeholder={t('অধ্যায় বা টপিক খুঁজো…', 'Search chapter or topic…')} aria-label={t('অধ্যায় খুঁজো', 'Search chapters')} value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <div className="segmented">
          {(['all', 'S', 'A', 'B', 'C'] as const).map(p => <button key={p} aria-pressed={priority === p} className={priority === p ? 'active' : ''} onClick={() => setPriority(p)}>{p === 'all' ? t('সব অধ্যায়', 'All') : p === 'S' ? t('S · শুধু গুরুত্বপূর্ণ', 'S · important only') : `${p} · ${priorityLabel(p)}`}</button>)}
        </div>
        <div className="segmented" role="group" aria-label={t('সম্পন্ন অবস্থা', 'Completion status')}>
          {(['all', 'pending', 'done'] as const).map(value => <button key={value} aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{value === 'all' ? t('সব অবস্থা', 'All statuses') : value === 'pending' ? t('বাকি', 'Pending') : t('সম্পন্ন', 'Done')}</button>)}
        </div>
        <div className="segmented star-filter">
          {(['all', 5, 3, 1] as const).map(value => {
            const count = value === 'all' ? chapters.length : chapters.filter(chapter => CHAPTER_SCHEDULE[chapter.id]?.star === value).length;
            return <button key={value} className={star === value ? 'active' : ''} aria-pressed={star === value} onClick={() => setStar(value)} disabled={value !== 'all' && count === 0}>{value === 'all' ? t('সব ★', 'All ★') : `${value}★`}<small>{bn(count)}</small></button>;
          })}
        </div>
        <button className={`button ${weakOnly ? 'primary' : 'secondary'} small`} aria-pressed={weakOnly} onClick={() => setWeakOnly(!weakOnly)}><ShieldAlert size={15} />{t('শুধু দুর্বল', 'Weak only')}</button>
        <button className={`button ${unwatchedOnly ? 'primary' : 'secondary'} small`} aria-pressed={unwatchedOnly} onClick={() => setUnwatchedOnly(!unwatchedOnly)} title={t('যেসব অধ্যায়ের ক্লাস এখনও দেখা বাকি', 'Chapters with unwatched classes')}>
          <Play size={15} />{t('ক্লাস বাকি', 'Classes left')}
          <span className="count-badge">{bn(chapters.filter(chapter => { const progress = chapterClassProgress(data, chapter.id); return progress.total > 0 && progress.watched < progress.total; }).length)}</span>
        </button>
        <button className="button ghost small" type="button" onClick={() => setShowFullBlocks(v => !v)} title={t('ক্লাস ব্লক ভিউ বদলাও', 'Toggle class block view')}>
          {showFullBlocks ? <List size={15} /> : <LayoutGrid size={15} />}
          {showFullBlocks ? t('সংক্ষিপ্ত ভিউ', 'Compact') : t('পূর্ণ ক্লাস ব্লক', 'Full blocks')}
        </button>
      </div>

      <p className="plan-legend">
        <span className="star-badge s5">★★★★★</span> {t('সবচেয়ে গুরুত্বপূর্ণ — টেস্ট পরীক্ষার আগে অগ্রাধিকার', 'Highest yield — complete first for Test Exam')}
        <span className="legend-sep">·</span>
        <span className="star-badge s3">★★★</span> {t('মাঝারি গুরুত্ব', 'Medium yield')}
        <span className="legend-sep">·</span>
        <span className="star-badge s1">★</span> {t('দ্রুত রিভিশনযোগ্য', 'Quick review')}
      </p>

      {[1, 2].map(paper => {
        const rows = visible.filter(chapter => chapter.paper === paper);
        if (!rows.length) return null;
        return <div className="paper-section" key={paper}>
          <div className="paper-heading"><h3>{PAPER_NAMES[subject][paper - 1]}</h3><span>{bn(rows.length)} {t('টি অধ্যায়/ইউনিট','chapters/units')}</span></div>
          <div className="chapter-list">
            {rows.map(chapter => {
              const tasks = chapterStudyTasks(plan, chapter.id);
              const complete = tasks.filter(task => isPersonalTaskComplete(task, data.completed)).length;
              const isDone = isLearningComplete(chapterStage(chapter, data, plan));
              const date = chapterFirstDate(plan, chapter.id);
              const endDate = data.personalRoutine && !hasFullPersonalAllocation(data, plan, chapter.id) ? undefined : tasks[tasks.length - 1]?.date;
              const meta = chapterMeta(data, chapter.id);
              const isWeak = meta.weak || data.confidence[chapter.id] === 'weak';
              const slot = scheduleFor(chapter.id, plan);
              const personal = personalRoutineForChapter(data, chapter.id);
              const work = personal ? chapterWorkEstimate(personal, chapter.id) : null;
              const links = CHAPTER_CLASSES[chapter.id];
              const lessons = BANGLA_LESSONS[chapter.id];
              const progress = chapterClassProgress(data, chapter.id);
              const lessonsExpanded = !!openLessons[chapter.id];

              if (isCustomChapter(data, chapter.id)) return <div key={chapter.id} className="chapter-card-item"><div className="chapter-row">
                <span className="chapter-number">{bn(chapter.number)}</span><span className="chapter-copy"><strong>{chapter.title}</strong><span>{t('নিজের অধ্যায় · AI তালিকায় সংরক্ষিত; রুটিন ও ট্র্যাকিংয়ে এখনো যোগ হয় না।', 'Custom chapter · saved in your AI list; not yet available in routines or tracking.')}</span></span><span className={`priority-badge ${chapter.priority.toLowerCase()}`}>{chapter.priority}</span>
              </div></div>;

              return <div key={chapter.id} className={`chapter-card-item ${isDone ? 'done' : ''} ${isWeak ? 'weak' : ''}`}>
                <button className={`chapter-row ${isDone ? 'done' : ''} ${isWeak ? 'weak' : ''}`} onClick={() => openChapter(chapter)}>
                  <span className={`chapter-number ${isDone ? 'complete' : ''}`}>{isDone ? <Check size={17} /> : chapter.subject === 'english' || chapter.subject === 'bangla' ? <BookOpen size={15} /> : bn(chapter.number)}</span>
                  <span className="chapter-copy">
                    <strong>
                      {chapter.title}
                      {isWeak && <span className="weak-pill">{t('দুর্বল', 'Weak')}</span>}
                      {meta.note.trim() && <span className="note-pill"><FileText size={11} />{t('নোট', 'Notes')}</span>}
                    </strong>
                    <span>{chapter.focus}</span>
                    <span className="chapter-prep">
                      {meta.mcq !== 'none' && <em>MCQ {meta.mcq === 'ready' ? '✓' : '…'}</em>}
                      {meta.cq !== 'none' && <em>CQ {meta.cq === 'ready' ? '✓' : '…'}</em>}
                      {meta.note.trim() && <em>{meta.note.trim().slice(0, 36)}…</em>}
                    </span>
                  </span>
                  {slot && <span className="chapter-plan-cell">
                    <span className={`star-badge s${slot.star}`}>{'★'.repeat(slot.star)}{'☆'.repeat(5 - slot.star)}</span>
                    <small>{work ? work.complete ? formatDurationBn(work.minutes) : t('পূর্ণ সময় অজানা', 'Full duration unknown') : `${bn(slot.hours)} ${t('ঘণ্টা', 'hours')}`} · {endDate ? `${data.personalRoutine ? t('শেষ বরাদ্দ', 'last allocation') : t('শেষ','ends')} ${formatDate(endDate)}` : t('সময় বরাদ্দ নেই', 'Not scheduled')}</small>
                    <small className="plan-links">{progress.watched ? `${bn(progress.watched)}/${bn(progress.total)} ${t('ক্লাস দেখা','classes watched')}` : `${bn(progress.total)} ${t('টি সরাসরি ক্লাস','direct classes')}`}</small>
                  </span>}
                  {sIds.includes(chapter.id) ? <span className="s-category-badge" title={t('A থেকে বাছাই করা ব্যক্তিগত গুরুত্বপূর্ণ তালিকা', 'Personal important shortlist within A')}>S</span> : <span className={`priority-badge ${syllabusPriority(chapter).toLowerCase()}`}>{syllabusPriority(chapter)}</span>}
                  <span className="chapter-date">{date ? formatDate(date) : t('তারিখ নেই', 'No date')}<small>{bn(complete)}/{bn(tasks.length)} {t('ধাপ', 'steps')}</small></span>
                  <ChevronRight size={17} />
                </button>

                {links && (showFullBlocks ? <ClassBlock classes={links} compact /> : <div className="chapter-compact-links"><ClassLinkRow classes={links} /></div>)}

                {lessons && lessons.length > 0 && (
                  <div className="daily-lessons-wrap syllabus-lessons-wrap">
                    <button type="button" className="text-button daily-lessons-toggle" onClick={() => setOpenLessons(st => ({ ...st, [chapter.id]: !lessonsExpanded }))}>
                      <BookOpen size={14} />
                      {t(`পাঠভিত্তিক গদ্য/পদ্য ক্লাস (${bn(lessons.length)}টি)`, `Lesson-by-lesson classes (${lessons.length})`)}
                      <ChevronDown size={14} className={lessonsExpanded ? 'rotated' : ''} />
                    </button>
                    {lessonsExpanded && <LessonList lessons={lessons} />}
                  </div>
                )}
              </div>;
            })}
          </div>
        </div>;
      })}

      {!visible.length && <EmptyState title={t('মিলে যাওয়া অধ্যায় নেই', 'No matching chapter')} description={t('অন্য শব্দ দিয়ে খুঁজো, অগ্রাধিকার ফিল্টার বদলাও বা দুর্বল ফিল্টার বন্ধ করো।', 'Search another word, change the priority filter, or turn the weak filter off.')} />}
    </section>
    <div className="info-panel"><ArrowUpRight size={18} /><p>{syllabusNote()}</p></div>
  </div>;
}
