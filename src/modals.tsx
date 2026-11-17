import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, BellRing, BookOpen, CalendarDays, Check, ChevronRight, Clock3, FolderOpen, List, NotebookPen, Play, Search, Timer } from 'lucide-react';
import { CHAPTERS, PAPERS, SUBJECTS, subjectById } from './data';
import type { Chapter, SubjectId } from './data';
import { bn, chapterStudyTasks, formatDate, formatDayOffset, formatTime, percent, phaseName } from './planner';
import { MISTAKE_LIMIT, newId, nowIso } from './storage';
import { chapterMeta, setTaskCompletion, updateChapterMeta } from './study';
import { scheduleFor } from './schedule';
import { BANGLA_LESSONS, CHAPTER_CLASSES, classLinksFor } from './classLinks';
import { INTERVAL_LABEL } from './revision';
import { dueFlashcards } from './flashcards';
import { usePlanner } from './context';
import { ClassBlock, ClassLinkRow, EmptyState, LessonList, Modal, ProgressBar, SubjectBadge } from './components';
import { STARTER_QUESTIONS } from './quiz-data';
import { CLASS_CATALOG } from './videoCatalog';
import { bnNum } from './selfAudit';
import { t } from './i18n';
import { chapterPriority, chapterStage, isLearningComplete, STAGES, STEPS } from './learning';
import type { ChapterStage, MistakeCategory } from './types';

const PRIORITY_LABEL: Record<string, string> = { A: 'আগে পড়ো', B: 'এরপর পড়ো', C: 'পরে পড়ো' };
const PREP_LABEL = { none: 'শুরু হয়নি', practicing: 'অনুশীলনে', ready: 'প্রস্তুত' } as const;

export function ChapterModal({ chapter: c, onClose }: { chapter: Chapter; onClose: () => void }) {
  const { plan, data, setData, navigate, toggleTask, startTimer } = usePlanner();
  const tasks = chapterStudyTasks(plan, c.id), done = tasks.filter(task => data.completed[task.id]).length;
  const meta = chapterMeta(data, c.id);
  const priority = chapterPriority(c, data);
  const stage = chapterStage(c, data, plan);
  const revisions = data.revisions.filter(item => item.chapterId === c.id && !item.completedAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return <Modal title={c.title} onClose={onClose} wide>
    <div className="chapter-modal-meta"><SubjectBadge subject={c.subject} /><span>পত্র {bn(c.paper)} · পাঠ/অধ্যায় {bn(c.number)}</span><span className={`priority-badge ${priority.toLowerCase()}`}>{priority} · {PRIORITY_LABEL[priority]}</span>{meta.weak && <span className="weak-pill">{t("দুর্বল", "Weak")}</span>}</div>
    <p className="modal-description">{c.focus}</p>
    <div className="form-grid">
      <label>{t('নিজের অগ্রাধিকার', 'Personal priority')}<select value={priority} onChange={e => setData(d => updateChapterMeta(d, c.id, { priority: e.target.value as 'A' | 'B' | 'C' }))}>{(['A','B','C'] as const).map(p => <option key={p} value={p}>{p} · {PRIORITY_LABEL[p]}</option>)}</select></label>
      <label>{t('অধ্যায়ের অবস্থা', 'Chapter status')}<select value={meta.stage || 'auto'} onChange={e => setData(d => updateChapterMeta(d, c.id, { stage: e.target.value === 'auto' ? undefined : e.target.value as ChapterStage }))}><option value="auto">{t('সেশন থেকে স্বয়ংক্রিয়', 'Automatic from sessions')}</option>{STAGES.map(item => <option key={item.id} value={item.id}>{t(item.bn, item.en)}</option>)}</select></label>
    </div>
    <p className="tiny-muted">{t('অগ্রাধিকার পড়ার ক্রমের পরামর্শ, পরীক্ষার পূর্বাভাস নয়। C অধ্যায়ও পড়তে হবে। অগ্রাধিকার বদলালে বর্তমান রুটিনের ক্রম বদলায় না। নিজে অবস্থা বাছলে সেশন টিক তার বদলে গণনা হবে না।', 'Priority suggests study order, not exam predictions. C chapters remain in the syllabus. Changing priority does not reorder the current plan. A chosen status overrides session-derived completion.')}</p>
    <div className="prep-grid">{STEPS.map(step => <label className="check-line" key={step.id}><input type="checkbox" checked={!!meta.steps?.[step.id]} onChange={e => { const checked = e.target.checked; setData(d => updateChapterMeta(d, c.id, { steps: { ...chapterMeta(d, c.id).steps, [step.id]: checked } })); }} />{t(step.bn, step.en)}</label>)}</div>
    {(() => { const sch = scheduleFor(c.id); const links = classLinksFor(c.id); const lastDate = tasks[tasks.length - 1]?.date || sch?.end; return <>
      {sch && <div className="chapter-plan-strip"><span className={`star-badge s${sch.star}`} aria-label={`গুরুত্ব ${sch.star} স্টার`}>{'★'.repeat(sch.star)}{'☆'.repeat(5 - sch.star)}</span><span><Clock3 size={14} />{bn(sch.hours)} ঘণ্টা</span>{lastDate && <span>{t("রুটিনে শেষ", "Target finish")} <strong>{formatDate(lastDate)}</strong></span>}</div>}
      {links && <ClassBlock classes={links} hint={t("প্রতিটি অংশে সরাসরি ক্লাস ও প্লেলিস্টের পাশাপাশি শিক্ষকদের চ্যানেলে খোঁজার লিংক সাজানো আছে।", "Direct classes and playlists are paired with quick searches on favourite teachers’ channels.")} />}
    {BANGLA_LESSONS[c.id] && <LessonList lessons={BANGLA_LESSONS[c.id]} />}
    </>; })()}
    {c.note && <div className="notice-box"><BookOpen size={18} /><p>{c.note}</p></div>}
    <div className="chapter-modal-progress"><span>{bn(done)}/{bn(tasks.length)} ধাপ শেষ · {isLearningComplete(stage) ? 'অধ্যায় সম্পন্ন' : 'প্রতিটি ধাপ আলাদাভাবে টিক দাও'}</span><ProgressBar value={percent(done, tasks.length)} /></div>
    <div className="chapter-session-list">{tasks.map((t, index) => <div key={t.id} className="chapter-session"><button className={`task-check ${data.completed[t.id] ? 'checked' : ''}`} aria-pressed={!!data.completed[t.id]} aria-label={`${formatDate(t.date)} ধাপ সম্পন্ন`} onClick={() => toggleTask(t.id)}>{data.completed[t.id] && <Check size={16} />}</button><div><strong>{formatDate(t.date, 'long')} · ধাপ {bn(index + 1)}</strong><span>{formatTime(t.startMinute)}{formatDayOffset(t.startMinute)} – {formatTime(t.endMinute)}{formatDayOffset(t.endMinute)}</span><p>{t.detail}</p></div></div>)}</div>
    {!tasks.length && <EmptyState title={t("এই ইউনিটের তারিখ পাওয়া যায়নি", "No date found for this unit")} description={t('সেটিংস থেকে শুরুর তারিখ যাচাই করো।', 'Check the start date in Settings.')} />}
    <div className="chapter-tool-row">
      {tasks.length > 0 && <button className="button secondary" onClick={() => setData(d => { const finish = !isLearningComplete(chapterStage(c, d, plan)); return updateChapterMeta(setTaskCompletion(d, tasks.map(task => task.id), finish), c.id, { stage: finish ? 'completed' : 'inProgress' }); })}><Check size={16} />{isLearningComplete(stage) ? t('অধ্যায় অসম্পূর্ণ করো', 'Mark chapter incomplete') : t('পুরো অধ্যায় সম্পন্ন করো', 'Mark chapter complete')}</button>}
      <button className="button secondary" onClick={() => { startTimer(c.subject, c.id); onClose(); }}><Timer size={16} />{t("এই অধ্যায়ে টাইমার", "Timer for this chapter")}</button>
      <button className={`button secondary ${meta.weak ? 'selected' : ''}`} aria-pressed={meta.weak} onClick={() => setData(d => updateChapterMeta(d, c.id, { weak: !meta.weak }))}><NotebookPen size={16} />{meta.weak ? 'দুর্বল তালিকা থেকে সরাও' : 'দুর্বল হিসেবে রাখো'}</button>
      {tasks[0] && <button className="button secondary" onClick={() => { navigate('today', tasks[0].date); onClose(); }}>{t("রুটিনে দেখো", "See it in the routine")}<ArrowRight size={16} /></button>}
    </div>
    {(() => {
      // The student asked whether these are real board questions. They are not,
      // and this line says so per chapter, with the real counts behind it.
      // The class block above reads the older per-chapter list, which has no board
      // group; the verified catalog does, so the board count comes from there.
      const boardLinks = CLASS_CATALOG.filter(item => item.chapterId === c.id && item.classType === 'board').length;
      const bank = STARTER_QUESTIONS.filter(question => question.chapterId === c.id).length;
      return <div className="chapter-source-note">
        <p><strong>{t('প্রশ্নের উৎস', 'Where the questions come from')}</strong>{' '}
          {t(
            `এই অধ্যায়ের ${bnNum(bank)}টি MCQ অ্যাপের নিজের পাঠ্যবই-যাচাইকৃত ব্যাংক থেকে—বোর্ডের মূল প্রশ্নপত্র থেকে নয়।`,
            `This chapter's ${bank} MCQs come from the app's own textbook-checked bank, not an original board paper.`,
          )}</p>
        <p className="tiny-muted">{boardLinks > 0
          ? t(`এই অধ্যায়ে ${bnNum(boardLinks)}টি বোর্ড-প্রশ্নের ভিডিও লিংক যাচাই করা আছে।`, `${boardLinks} board-question video link(s) are verified for this chapter.`)
          : t('এই অধ্যায়ে বোর্ড-প্রশ্নের যাচাই করা ভিডিও নেই—তাই অ্যাপ কোনো বোর্ড প্রশ্নের দাবি করে না।', 'No verified board-question video exists for this chapter, so the app makes no board-paper claim here.')}</p>
      </div>;
    })()}
    <div className="prep-grid">
      {(['mcq', 'cq'] as const).map(kind => <div className="prep-row" key={kind}><strong>{kind === 'mcq' ? 'MCQ প্রস্তুতি' : 'CQ প্রস্তুতি'}</strong><div className="segmented small">{(['none', 'practicing', 'ready'] as const).map(level => <button key={level} className={meta[kind] === level ? 'active' : ''} aria-pressed={meta[kind] === level} onClick={() => setData(d => updateChapterMeta(d, c.id, { [kind]: level }))}>{PREP_LABEL[level]}</button>)}</div></div>)}
    </div>
    <label className="form-label">{t("অধ্যায়ের নিজের নোট", "Your notes on this chapter")}<textarea rows={4} maxLength={5000} value={meta.note} onChange={e => setData(d => updateChapterMeta(d, c.id, { note: e.target.value }))} placeholder={t("মূল সূত্র, বোঝার কৌশল, যেখানে আটকাও…", "Main formula, how to grasp it, where you get stuck…")} /></label>
    {revisions.length > 0 && <div className="chapter-revisions"><strong>{t("এই অধ্যায়ের রিভিশন", "Revision for this chapter")}</strong>{revisions.map(item => <span key={item.id}>{INTERVAL_LABEL[item.interval]} · {formatDate(item.dueDate)}</span>)}</div>}
    <div className="confidence-section"><strong>{t("এই অধ্যায়ে কতটা আত্মবিশ্বাসী?", "How confident are you in this chapter?")}</strong><div>{(['weak', 'okay', 'confident'] as const).map((level, i) => <button key={level} className={`button secondary ${data.confidence[c.id] === level ? 'selected' : ''}`} aria-pressed={data.confidence[c.id] === level} onClick={() => setData(d => ({ ...d, confidence: { ...d.confidence, [c.id]: level } }))}>{['আবার দেখব', 'মোটামুটি বুঝি', 'আত্মবিশ্বাসী'][i]}</button>)}</div><small>{t('এটি নিজের মূল্যায়ন; সম্পন্ন ধাপ বা MCQ স্কোর বদলায় না।', 'This is your own assessment; it does not change completed steps or MCQ scores.')}</small></div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>{t("বন্ধ করো", "Close")}</button></div>
  </Modal>;
}

export function ExamModal({ paperId, onClose }: { paperId: string; onClose: () => void }) {
  const { data, setData, plan, notify } = usePlanner();
  const paper = PAPERS.find(p => p.id === paperId)!;
  const existing = data.exams[paperId];
  const [score, setScore] = useState(existing ? String(existing.score) : '');
  const [mistakes, setMistakes] = useState(existing?.mistakes || '');
  const [error, setError] = useState('');
  const task = plan.flatMap(d => d.tasks).find(t => t.kind === 'exam' && t.paperId === paperId);
  const submit = (e: FormEvent) => {
    e.preventDefault(); const n = Number(score);
    if (!score.trim() || !Number.isFinite(n) || n < 0 || n > paper.maxScore) { setError(`০ থেকে ${bn(paper.maxScore)}-এর মধ্যে নম্বর লেখো।`); return; }
    setData(d => { const updated = { ...d, exams: { ...d.exams, [paperId]: { score: n, total: paper.maxScore, at: nowIso(), mistakes: mistakes.trim() } } }; return task ? setTaskCompletion(updated, [task.id], true) : updated; });
    notify(t('মডেল টেস্টের নম্বর সেভ হয়েছে। ভুলগুলো থেকে শেখা চালিয়ে যাও।', 'Model test score saved. Keep learning from the mistakes.')); onClose();
  };
  return <Modal title={`${paper.name} · নম্বর`} onClose={onClose}><div className="chapter-modal-meta"><SubjectBadge subject={paper.subject} /><span>{task && formatDate(task.date, 'long')}</span></div><p className="modal-description">{t('নিজে মূল্যায়ন করা তত্ত্বীয় নম্বর লেখো। এটি বোর্ডের ফল বা GPA হিসাব নয়।', 'Enter the theory mark you assessed yourself. This is not a board result or GPA calculation.')}</p><form onSubmit={submit}><div className="score-input-row"><label>{t("তোমার নম্বর", "Your marks")}<input data-autofocus type="number" min={0} max={paper.maxScore} step="0.5" required value={score} onChange={e => { setScore(e.target.value); setError(''); }} placeholder={t("যেমন ৭২", "e.g. 72")} /></label><span>/ {bn(paper.maxScore)}</span></div>{error && <p className="field-error" role="alert">{error}</p>}<label className="form-label">{t("কোথায় নম্বর হারালে?", "Where did you lose marks?")}<textarea value={mistakes} maxLength={5000} rows={5} onChange={e => setMistakes(e.target.value)} placeholder={t("অধ্যায়/টপিক, ভুলের কারণ, পরেরবার কী করবে…", "Chapter/topic, why it went wrong, what to do next…")} /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button type="submit" className="button primary"><Check size={16} />{t("নম্বর সেভ করো", "Save marks")}</button></div></form></Modal>;
}

const MISTAKE_CATEGORY_LABEL: Record<MistakeCategory, string> = {
  conceptual: 'ধারণা-ভিত্তিক',
  calculation: 'হিসাব-ভুল',
  memory: 'স্মৃতি-ভুল',
  misunderstood: 'প্রশ্ন বুঝতে ভুল',
  careless: 'অবহেলা',
};

export function MistakeModal({ subject, initialText, onClose }: { subject: SubjectId; initialText: string; onClose: () => void }) {
  const { data, setData, today, notify } = usePlanner();
  const [s, setS] = useState(subject), [textValue, setTextValue] = useState(initialText), [category, setCategory] = useState<MistakeCategory>('careless'), [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!textValue.trim()) { setError(t('কী ভুল হয়েছে, ছোট করে লেখো।', 'Describe what went wrong, briefly.')); return; }
    if (data.mistakes.length >= MISTAKE_LIMIT) { setError(`ভুলের খাতায় সর্বোচ্চ ${MISTAKE_LIMIT}টি নোট রাখা যায়। আগে কিছু নোট মুছে নাও।`); return; }
    setData(d => ({ ...d, mistakes: [...d.mistakes, { id: newId(), subject: s, text: textValue.trim(), date: today, category, retryStatus: 'pending', resolved: false }] }));
    notify(t('ভুলের খাতায় যোগ হয়েছে। পরে শুধরে নিও।', 'Added to the mistake book. Fix it later.')); onClose();
  };
  return <Modal title={t("ভুল থেকেই শেখা", "Learning from mistakes")} onClose={onClose}><p className="modal-description">{t('একটি ভুল, তার কারণ, বিভাগ আর পরেরবার কী করবে—লিখে রাখো। পরীক্ষার আগে এটি পুনরায়', 'Record a mistake, its cause, the topic and what you will do next time. Review it again before')} সমাধান করো।</p><form onSubmit={submit}><label className="form-label">{t("বিষয়", "Subject")}<select value={s} onChange={e => setS(e.target.value as SubjectId)}>{SUBJECTS.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}</select></label><label className="form-label">{t("ভুলের বিভাগ", "Mistake category")}<select value={category} onChange={e => setCategory(e.target.value as MistakeCategory)}>{(['conceptual', 'calculation', 'memory', 'misunderstood', 'careless'] as const).map(cat => <option key={cat} value={cat}>{MISTAKE_CATEGORY_LABEL[cat]}</option>)}</select></label><label className="form-label">{t("আমার নোট", "My notes")}<textarea data-autofocus rows={5} maxLength={5000} value={textValue} onChange={e => { setTextValue(e.target.value); setError(''); }} placeholder={t("যেমন: ভেক্টরের ক্রস গুণে দিক ভুল করেছি। ডান হাতের নিয়ম আবার অনুশীলন করব।", "e.g. I got the cross-product direction wrong. Practise the right-hand rule again.")} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><NotebookPen size={16} />{t("যোগ করো", "Add")}</button></div></form></Modal>;
}

export function SearchModal({ onClose, onChapter }: { onClose: () => void; onChapter: (c: Chapter) => void }) {
  const { plan, data, today, navigate, selectedDate, startPresetTimer, startTimer, openMistake, sendStudyStatusNotification } = usePlanner();
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<'all' | SubjectId>('all');
  const q = query.trim().toLowerCase();
  const baseChapters = subjectFilter === 'all' ? CHAPTERS : CHAPTERS.filter(c => c.subject === subjectFilter);
  const chapters = (q ? baseChapters.filter(c => {
    const links = CHAPTER_CLASSES[c.id];
    const teachers = links ? [...links.oneShot, ...links.cq, ...links.mcq].map(o => o.channel).join(' ') : '';
    const lessons = (BANGLA_LESSONS[c.id] || []).map(l => `${l.title} ${l.channel || ''}`).join(' ');
    return `${c.title} ${c.number} ${c.focus} ${subjectById[c.subject].name} ${subjectById[c.subject].english} ${teachers} ${lessons}`.toLowerCase().includes(q);
  }) : (subjectFilter === 'all' ? baseChapters.filter(c => c.priority === 'A') : baseChapters)).slice(0, 8);
  const tasks = (q ? plan.flatMap(d => d.tasks).filter(tk => (subjectFilter === 'all' || tk.subject === subjectFilter) && `${tk.title} ${tk.date} ${subjectById[tk.subject].name}`.toLowerCase().includes(q)) : (plan.find(d => d.date === selectedDate)?.tasks || []).filter(tk => subjectFilter === 'all' || tk.subject === subjectFilter)).slice(0, 8);
  const notes = (q ? data.libraryNotes.filter(note => `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(q)) : []).slice(0, 5);
  const videos = (q ? data.videos.filter(video => `${video.title} ${video.channel || ''}`.toLowerCase().includes(q)) : []).slice(0, 4);
  const questions = (q ? data.questions.filter(question => question.question.toLowerCase().includes(q)) : []).slice(0, 4);
  const formulas = (q ? data.formulas.filter(formula => `${formula.title} ${formula.body}`.toLowerCase().includes(q)) : []).slice(0, 4);
  const flashcardsResult = (q ? dueFlashcards(data, today).filter(card => `${card.front} ${card.back} ${subjectById[card.subject].name}`.toLowerCase().includes(q)) : []).slice(0, 4);
  const nothing = !chapters.length && !tasks.length && !notes.length && !videos.length && !questions.length && !formulas.length && !flashcardsResult.length;

  const launchChapterQuickTimer = (c: Chapter) => {
    if (startPresetTimer) {
      startPresetTimer({ subject: c.subject, chapterId: c.id, durationMin: 45, label: c.title });
    } else {
      startTimer(c.subject, c.id);
    }
    onClose();
  };

  return <Modal title={t("কী খুঁজছ?", "What are you looking for?")} onClose={onClose} wide>
    <label className="search-field modal-search">
      <Search size={20} />
      <input data-autofocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t("অধ্যায়, শিক্ষক, বিষয় বা তারিখ (যেমন: ভেক্টর, মাশরুর, জৈব)…", "Chapter, teacher, subject or date…")} aria-label={t("অধ্যায় ও রুটিন খুঁজো", "Search chapters & routine")} />
      <kbd>ESC</kbd>
    </label>

    <div className="search-subject-pills" role="tablist" aria-label={t('বিষয় ফিল্টার', 'Filter by subject')}>
      <button type="button" className={`search-sub-pill ${subjectFilter === 'all' ? 'active' : ''}`} onClick={() => setSubjectFilter('all')}>
        {t('সব বিষয়', 'All')}
      </button>
      {SUBJECTS.map(sub => (
        <button key={sub.id} type="button" className={`search-sub-pill ${subjectFilter === sub.id ? 'active' : ''}`} onClick={() => setSubjectFilter(sub.id)}>
          {sub.short}
        </button>
      ))}
    </div>

    {!q && (
      <div className="search-quick-actions">
        <button type="button" className="search-quick-chip" onClick={() => { if (startPresetTimer) startPresetTimer({ subject: subjectFilter === 'all' ? 'physics' : subjectFilter, durationMin: 25, label: t('২৫ মি. ফোকাস সেশন', '25m focus session') }); else navigate('timer'); onClose(); }}>
          <Play size={13} fill="currentColor" />{t('২৫ মি. কুইক টাইমার', '25m quick timer')}
        </button>
        <button type="button" className="search-quick-chip" onClick={() => { onClose(); setTimeout(() => openMistake(subjectFilter === 'all' ? 'physics' : subjectFilter), 30); }}>
          <NotebookPen size={13} />{t('দ্রুত ভুল নোট', 'Log mistake')}
        </button>
        <button type="button" className="search-quick-chip" onClick={() => { void sendStudyStatusNotification?.(selectedDate); onClose(); }}>
          <BellRing size={13} />{t('নোটিফিকেশন পাঠাও', 'Send digest')}
        </button>
        <button type="button" className="search-quick-chip" onClick={() => { navigate('library'); onClose(); }}>
          <FolderOpen size={13} />{t('ক্লাস ও নোট লাইব্রেরি', 'Class & note library')}
        </button>
      </div>
    )}

    <div className="search-results">
      {chapters.length > 0 && <><div className="search-group-label">{t("অধ্যায় ও সরাসরি ক্লাস", "Chapters & direct classes")}</div>{chapters.map(c => {
        const links = CHAPTER_CLASSES[c.id];
        return <div className="search-chapter-entry" key={c.id}>
          <div className="search-chapter-head">
            <button className="search-result" onClick={() => onChapter(c)}><span className="search-result-icon" style={{ color: subjectById[c.subject].color, background: subjectById[c.subject].tint } as CSSProperties}><BookOpen size={18} /></span><span><strong>{c.title}</strong><small>{subjectById[c.subject].name} · {t('পত্র', 'Paper')} {bn(c.paper)} · {t('অগ্রাধিকার', 'Priority')} {c.priority}</small></span><ChevronRight size={17} /></button>
            <button type="button" className="search-chapter-timer-btn" onClick={() => launchChapterQuickTimer(c)} title={t('এই অধ্যায়ের ৪৫ মিনিট টাইমার চালু করো', 'Start 45m timer for this chapter')}>
              <Play size={11} fill="currentColor" />{t('টাইমার', 'Timer')}
            </button>
          </div>
          {links && <div className="search-chapter-classes"><ClassLinkRow classes={links} /></div>}
        </div>;
      })}</>}
      {tasks.length > 0 && <><div className="search-group-label">{q ? t('রুটিনের সেশন', 'Scheduled sessions') : `${formatDate(selectedDate)} · ${t('রুটিন', 'Routine')}`}</div>{tasks.map(tk => <button className="search-result" key={tk.id} onClick={() => { navigate('today', tk.date); onClose(); }}><span className="search-result-icon"><CalendarDays size={18} /></span><span><strong>{tk.title}</strong><small>{formatDate(tk.date)} · {formatTime(tk.startMinute)}{formatDayOffset(tk.startMinute)} · {phaseName(tk.phase)}{data.completed[tk.id] ? ` · ${t('সম্পন্ন', 'Done')}` : ''}</small></span><ArrowUpRight size={17} /></button>)}</>}
      {notes.length > 0 && <><div className="search-group-label">{t("নোট লাইব্রেরি", "Notes library")}</div>{notes.map(note => <button className="search-result" key={note.id} onClick={() => { navigate('library'); onClose(); }}><span className="search-result-icon"><NotebookPen size={18} /></span><span><strong>{note.title}</strong><small>{note.body.slice(0, 90)}</small></span><ChevronRight size={17} /></button>)}</>}
      {questions.length > 0 && <><div className="search-group-label">{t("প্রশ্নব্যাংক", "Question bank")}</div>{questions.map(question => <button className="search-result" key={question.id} onClick={() => { navigate('practice'); onClose(); }}><span className="search-result-icon"><BookOpen size={18} /></span><span><strong>{question.question}</strong><small>{subjectById[question.subject].name}</small></span><ChevronRight size={17} /></button>)}</>}
      {videos.length > 0 && <><div className="search-group-label">{t("ভিডিও", "Video")}</div>{videos.map(video => <a className="search-result" key={video.id} href={video.url} target="_blank" rel="noreferrer"><span className="search-result-icon"><Clock3 size={18} /></span><span><strong>{video.title}</strong><small>{video.channel || 'YouTube'} · {subjectById[video.subject].name}</small></span><ArrowUpRight size={17} /></a>)}</>}
      {formulas.length > 0 && <><div className="search-group-label">{t("সূত্র", "Formulas")}</div>{formulas.map(formula => <button className="search-result" key={formula.id} onClick={() => { navigate('library'); onClose(); }}><span className="search-result-icon"><BookOpen size={18} /></span><span><strong>{formula.title}</strong><small>{subjectById[formula.subject].name}</small></span><ChevronRight size={17} /></button>)}</>}
      {flashcardsResult.length > 0 && <><div className="search-group-label">{t("ফ্ল্যাশকার্ড", "Flashcards")}</div>{flashcardsResult.map(card => <button className="search-result" key={card.id} onClick={() => { navigate('flashcards'); onClose(); }}><span className="search-result-icon"><List size={18} /></span><span><strong>{card.front}</strong><small>{subjectById[card.subject].name}</small></span><ChevronRight size={17} /></button>)}</>}
      {nothing && <EmptyState title={t("কিছু পাওয়া যায়নি", "Nothing found")} description={t('বিষয়ের নাম, শিক্ষকের নাম, অধ্যায়ের শব্দ বা তারিখ দিয়ে আবার খুঁজো।', 'Search again by subject, teacher, chapter word or date.')} />}
    </div>
    <div className="search-footer"><span>{bn(CHAPTERS.length)} {t('অধ্যায়/ইউনিট', 'chapters')} · {bn(plan.length)} {t('দিন', 'days')} · <kbd>/</kbd> {t('বা', 'or')} <kbd>Ctrl+K</kbd></span><button className="text-button" onClick={() => { navigate('calendar', today); onClose(); }}>{t("ক্যালেন্ডার দেখো", "Open the calendar")}<ArrowRight size={14} /></button></div>
  </Modal>;
}
