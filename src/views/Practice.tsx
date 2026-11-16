import { recordMcqAnswer, recordCqEntry } from '../mistakeRevision';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpen, Brain, Check, ChevronRight, CircleHelp, ListChecks, NotebookPen, Plus, RotateCcw, Search, Sparkles, Target, Trash2, X } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, sortChapters, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDate, percent, todayKey } from '../planner';
import { allQuestions, attemptStats, subjectAccuracy } from '../analytics';
import { newId, nowIso } from '../storage';
import { chapterMeta, updateChapterMeta } from '../study';
import { STARTER_QUESTIONS } from '../quiz-data';
import {
  ENGINE_LABEL, GENERATIVE_CHAPTER_COUNT, generativeChapters, generativeGap, generateQuestions, verifyGenerated,
} from '../questionGen';
import { CHAPTER_CLASSES } from '../classLinks';
import type { CqEntry, CqParts, QuizQuestion } from '../types';
import { ClassLinkRow, EmptyState, Modal, PageHeading, ProgressBar, SubjectBadge } from '../components';
import { t } from '../i18n';

type Tab = 'mcq' | 'cq' | 'mistakes';
/** Standard 10-mark CQ split: ক ১, খ ২, গ ৩, ঘ ৪. */
export const CQ_PARTS = [
  { key: 'c1' as const, label: 'ক', mark: 'জ্ঞানমূলক', max: 1, ask: 'সংজ্ঞা, সূত্র বা একটি তথ্য—এক লাইনে নির্ভুল উত্তর।', tip: 'সংজ্ঞা মুখস্থ নয়, চেনা দরকার।' },
  { key: 'c2' as const, label: 'খ', mark: 'অনুধাবন', max: 2, ask: 'কারণ/ব্যাখ্যা দুই-তিন বাক্যে, নিজের ভাষায়।', tip: '“কেন” প্রশ্নে কারণ লিখতে হবে।' },
  { key: 'c3' as const, label: 'গ' as const, mark: 'প্রয়োগ', max: 3, ask: 'উদ্দীপকের তথ্য সূত্রে বসিয়ে ধাপে ধাপে সমাধান।', tip: 'সূত্র, একক ও ধাপ দেখাও।' },
  { key: 'c4' as const, label: 'ঘ', mark: 'উচ্চতর দক্ষতা', max: 4, ask: 'সিদ্ধান্ত + যুক্তি + তুলনা; নিজের মতামত।', tip: 'শেষে সিদ্ধান্তের এক লাইন না লিখলে নম্বর কাটে।' },
];
export default function PracticeView() {
  const [tab, setTab] = useState<Tab>('mcq');
  const { data } = usePlanner();
  const stats = attemptStats(data.attempts);
  const weekStats = attemptStats(data.attempts, attempt => attempt.date >= todayKey(new Date(Date.now() - 6 * 86400000)));
  return <div className="view practice-view">
    <PageHeading eyebrow="PRACTICE, NOT JUST READING" title={t("যাচাই করো, তারপর এগোও।", "Check it, then move on.")} titleEn="Check yourself, then move on." description="অধ্যায়ভিত্তিক MCQ-তে সঙ্গে সঙ্গে উত্তর মিলাও। CQ-এর নম্বর নিজে লেখো। ভুলগুলো আলাদা করে রাখো—সেগুলোই তোমার আসল সিলেবাস।" descriptionEn="Chapter-wise MCQs with instant checking, CQ marks and a wrong-answer collection." action={<div className="practice-head-stats"><span><Target size={16} /><strong>{bn(stats.total)}</strong> MCQ</span><span><Check size={16} /><strong>{bn(stats.accuracy)}%</strong>{t("নির্ভুলতা", "Accuracy")}</span></div>} />
    <div className="segmented practice-tabs">{(['mcq', 'cq', 'mistakes'] as const).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'mcq' ? 'MCQ অনুশীলন' : item === 'cq' ? 'CQ ট্র্যাকার' : `ভুলের খাতা (${bn(data.mistakes.filter(m => !m.resolved).length)})`}</button>)}</div>
    {tab === 'mcq' && <McqPractice stats={stats} weekStats={weekStats} />}
    {tab === 'cq' && <CqPractice onShowMistakes={() => setTab('mistakes')} />}
    {tab === 'mistakes' && <MistakeBook />}
  </div>;
}

function McqPractice({ stats, weekStats }: { stats: { total: number; correct: number; accuracy: number }; weekStats: { total: number; correct: number; accuracy: number } }) {
  const { data, setData, today, notify, openMistake, confirm } = usePlanner();
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [chapterId, setChapterId] = useState('');
  const [count, setCount] = useState(10);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [quiz, setQuiz] = useState<{ ids: string[]; index: number; chosen: number | null; correct: number; wrong: string[] } | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const questions = useMemo(() => allQuestions(data), [data.questions]);
  const bankCount = STARTER_QUESTIONS.length;
  const bankChapterCount = new Set(STARTER_QUESTIONS.map(question => question.chapterId)).size;
  const latestAttempt = useMemo(() => { const map = new Map<string, boolean>(); for (const attempt of data.attempts) map.set(attempt.questionId, attempt.correct); return map; }, [data.attempts]);
  const accuracyBySubject = subjectAccuracy(data.attempts);
  const chapters = sortChapters(CHAPTERS.filter(chapter => subject === 'all' || chapter.subject === subject));
  const pool = questions.filter(question => (subject === 'all' || question.subject === subject) && (!chapterId || question.chapterId === chapterId) && (!onlyMine || !question.id.startsWith('seed-')) && (!reviewOnly || latestAttempt.get(question.id) === false));
  const active = quiz ? questions.find(question => question.id === quiz.ids[quiz.index]) : null;
  /**
   * Rule-based generation: every item comes from `questionGen`, is verified before it is
   * shown, and joins the normal quiz runner below — so answers still feed the mistake book,
   * the weak-chapter flags and the spaced retry ladder exactly like bank questions.
   */
  const startGenerated = () => {
    if (!chapterId) { notify('আগে একটি অধ্যায় বাছো—জেনারেটর অধ্যায়ভিত্তিক তথ্য থেকে প্রশ্ন বানায়।', 'info'); return; }
    const gap = generativeGap(chapterId);
    if (gap !== 'ok') { notify(gap === 'no-fact' ? 'এই অধ্যায়ের যাচাই করা তথ্য এখনো যোগ হয়নি, তাই প্রশ্ন বানানো হবে না।' : 'এই অধ্যায়ের জন্য এখনো যথেষ্ট যাচাই করা তথ্য নেই।', 'info'); return; }
    const generated = generateQuestions(chapterId, { variant: Date.now(), count });
    const issues = verifyGenerated(generated);
    if (issues.length || !generated.length) { notify('জেনারেট করা প্রশ্ন যাচাইয়ে উত্তীর্ণ হয়নি—কিছুই যোগ করা হয়নি।', 'error'); return; }
    const known = new Set(questions.map(question => question.id));
    const fresh = generated.filter(question => !known.has(question.id));
    if (!fresh.length) return;
    setData(d => ({ ...d, questions: [...d.questions, ...fresh].slice(0, 2000) }));
    setQuiz({ ids: fresh.map(question => question.id), index: 0, chosen: null, correct: 0, wrong: [] });
    setAddOpen(false);
    notify(`${bn(fresh.length)}টি প্রশ্ন পাঠ্যবই-যাচাইকৃত তথ্য থেকে তৈরি হয়েছে।`, 'success');
  };
  const start = () => {
    if (!pool.length) { notify('এই ফিল্টারে কোনো প্রশ্ন নেই। বিষয় বা অধ্যায় বদলাও।', 'info'); return; }
    const ids = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(count, 20)).map(question => question.id);
    setQuiz({ ids, index: 0, chosen: null, correct: 0, wrong: [] });
  };
  const answer = (index: number) => {
    if (!active || quiz?.chosen !== null) return;
    const correct = index === active.answer;
    setData(d => recordMcqAnswer(d, active, index, today));
    setQuiz(current => current ? { ...current, chosen: index, correct: current.correct + (correct ? 1 : 0), wrong: correct ? current.wrong : [...current.wrong, active.id] } : current);
  };
  const next = () => {
    if (!quiz) return;
    if (quiz.index + 1 >= quiz.ids.length) return;
    setQuiz({ ...quiz, index: quiz.index + 1, chosen: null });
  };
  const restart = () => setQuiz(null);
  const mine = data.questions.filter(question => question.question.toLowerCase().includes(query.toLowerCase()) || question.options.some(option => option.toLowerCase().includes(query.toLowerCase())));
  const quizDone = quiz && quiz.chosen !== null && quiz.index + 1 >= quiz.ids.length;
  return <div className="mcq-layout">
    <section className="card mcq-main">
      {active ? <div className="quiz-run">
        <div className="quiz-topline"><span>প্রশ্ন {bn((quiz?.index || 0) + 1)} / {bn(quiz?.ids.length || 0)}</span><div className="quiz-progress"><ProgressBar value={percent((quiz?.index || 0) + (quiz?.chosen !== null ? 1 : 0), quiz?.ids.length || 1)} /></div><button className="icon-button" onClick={restart} aria-label={t("কুইজ বন্ধ করো", "Close quiz")}><X size={18} /></button></div>
        <div className="quiz-question-meta"><SubjectBadge subject={active.subject} small />{active.chapterId && <span>{chapterById[active.chapterId]?.title}</span>}<span>{active.source || 'নিজের প্রশ্ন'}</span></div>
        <h2 className="quiz-question">{active.question}</h2>
        <div className="quiz-options">{[0, 1, 2, 3].map(index => {
          const chosen = quiz?.chosen === index, isAnswer = active.answer === index, revealed = quiz?.chosen !== null;
          return <button key={index} className={`quiz-option ${revealed && isAnswer ? 'correct' : ''} ${revealed && chosen && !isAnswer ? 'wrong' : ''} ${chosen ? 'chosen' : ''}`} disabled={revealed} onClick={() => answer(index)}><span className="option-letter">{['ক', 'খ', 'গ', 'ঘ'][index]}</span><span>{active.options[index]}</span>{revealed && isAnswer && <Check size={18} />}{revealed && chosen && !isAnswer && <X size={18} />}</button>;
        })}</div>
        {quiz?.chosen !== null && <div className={`quiz-feedback ${quiz?.chosen === active.answer ? 'ok' : 'bad'}`}><strong>{quiz?.chosen === active.answer ? 'সঠিক উত্তর!' : `ভুল। সঠিক উত্তর: ${['ক', 'খ', 'গ', 'ঘ'][active.answer]}`}</strong>{active.explanation && <p>{active.explanation}</p>}{quiz?.chosen !== active.answer && <div className="quiz-feedback-links"><button className="text-button" onClick={() => openMistake(active.subject, `${active.question} — সঠিক উত্তর: ${active.options[active.answer]}`)}><NotebookPen size={14} />{t("ভুলের খাতায় যোগ করো", "Add to the mistake book")}</button>{active.chapterId && CHAPTER_CLASSES[active.chapterId] && <ClassLinkRow classes={CHAPTER_CLASSES[active.chapterId]} />}</div>}</div>}
        <div className="quiz-footer"><span>{bn(quiz?.correct || 0)} সঠিক · {bn((quiz?.index || 0) + (quiz?.chosen !== null ? 1 : 0))} উত্তর দেওয়া হয়েছে</span><div className="quiz-actions">{quizDone ? <button className="button primary" onClick={restart}><RotateCcw size={16} />{t("নতুন কুইজ", "New quiz")}</button> : <button className="button primary" disabled={quiz?.chosen === null} onClick={next}>{t("পরের প্রশ্ন", "Next question")}<ArrowRight size={16} /></button>}</div></div>
        {quizDone && <div className="quiz-result"><strong>{bn(Math.round((quiz?.correct || 0) / (quiz?.ids.length || 1) * 100))}% নির্ভুলতা</strong><span>{bn(quiz?.correct || 0)} / {bn(quiz?.ids.length || 0)} সঠিক</span>{quiz?.wrong.length ? <button className="button secondary small" onClick={() => { setQuiz({ ids: quiz.wrong, index: 0, chosen: null, correct: 0, wrong: [] }); }}>{t("ভুলগুলো আবার করো", "Redo the mistakes")}</button> : <span className="quiz-perfect">{t("সব সঠিক! দারুণ।", "All correct! Nice.")}</span>}</div>}
      </div> : <div className="quiz-setup">
        <div className="quiz-setup-head"><span className="stat-icon green"><Brain size={22} /></span><div><h2>{t("একটি ছোট কুইজ শুরু করো", "Start a short quiz")}</h2><p>প্রশ্ন পড়ো, উত্তর বাছো—সঙ্গে সঙ্গে ফল দেখবে। প্রতিটি উত্তর স্থানীয়ভাবে সেভ থাকে।</p></div></div>
        <div className="quiz-setup-grid"><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId | 'all'); setChapterId(''); }}><option value="all">{t("সব বিষয়", "All subjects")}</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("সব অধ্যায়", "All chapters")}</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label>{t("প্রশ্ন সংখ্যা", "Question count")}<select value={count} onChange={e => setCount(Number(e.target.value))}>{[5, 10, 15, 20].map(value => <option key={value} value={value}>{bn(value)}টি</option>)}</select></label></div>
        <div className="quiz-filters"><label className="check-line"><input type="checkbox" checked={reviewOnly} onChange={e => setReviewOnly(e.target.checked)} />{t("শুধু আগে ভুল করা প্রশ্ন", "Only questions I got wrong")}</label><label className="check-line"><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />{t("শুধু আমার যোগ করা প্রশ্ন", "Only questions I added")}</label></div>
        <div className="pool-line"><span>{bn(pool.length)}টি প্রশ্ন পাওয়া গেছে</span><span>{bn(data.questions.length)}টি নিজের · {bn(questions.length - data.questions.length)}টি নমুনা</span></div>
        {chapterId && CHAPTER_CLASSES[chapterId] && <div className="practice-chapter-classes"><span>{t('কুইজের আগে ক্লাস ঝালাই:', 'Quick class review before quiz:')}</span><ClassLinkRow classes={CHAPTER_CLASSES[chapterId]} /></div>}
        <div className="generator-box">
          <div className="generator-head"><span className="stat-icon green"><Sparkles size={18} /></span><div><strong>{t("স্বয়ংক্রিয় প্রশ্ন তৈরি", "Generate questions")}</strong><small>{ENGINE_LABEL} · {bn(GENERATIVE_CHAPTER_COUNT)}টি অধ্যায়ের যাচাই করা তথ্য থেকে</small></div></div>
          <p className="tiny-muted">{t("নিয়মভিত্তিক ইঞ্জিন পাঠ্যবইয়ের যাচাই করা তথ্য থেকেই প্রশ্ন বানায়—প্রতিটি উত্তরের সূত্র ব্যাখ্যায় লেখা থাকে, আর জেনারেটর একটি অধ্যায়ের তথ্য না থাকলে কিছুই বানায় না।", "The rule-based engine builds questions only from verified textbook facts. Every explanation cites its source, and a chapter without facts produces nothing at all.")}</p>
          <div className="generator-actions">
            <button className="button secondary small" onClick={startGenerated} disabled={!chapterId || generativeGap(chapterId) !== 'ok'}><Sparkles size={15} />{t("এই অধ্যায় থেকে প্রশ্ন বানাও", "Generate for this chapter")}</button>
            <span className="tiny-muted">{!chapterId ? t("অধ্যায় বাছো", "Pick a chapter") : generativeGap(chapterId) === 'ok' ? t(`${bn(generateQuestions(chapterId).length)}টি প্রশ্ন তৈরি হবে`, `${generateQuestions(chapterId).length} question(s) available`) : t("যাচাই করা তথ্য নেই", "No verified facts yet")}</span>
          </div>
          <p className="tiny-muted">{t(`মোট ${bn(generativeChapters().length)}টি অধ্যায়ে জেনারেশন চালু—বাকিগুলোতে ব্যাংকের প্রশ্নই যথেষ্ট।`, `Generation is available for ${generativeChapters().length} chapters; the rest rely on the bank.`)}</p>
        </div>
        <button className="button primary wide-button" onClick={start}><Brain size={17} />{t("কুইজ শুরু করো", "Start quiz")}</button>
        <p className="tiny-muted center">নমুনা ব্যাংকে {bn(bankCount)}টি প্রশ্ন, {bn(bankChapterCount)}টি অধ্যায়/ইউনিট ঘেঁষে সাজানো—বোর্ড প্রশ্নের দাবি নয়, কিন্তু প্রতিটি বিষয়ে অনুশীলন শুরু করার জন্য যথেষ্ট।</p>
      </div>}
    </section>
    <aside className="mcq-rail">
      <section className="card accuracy-card"><div className="card-heading"><h3>{t("নির্ভুলতা", "Accuracy")}</h3><span className="tiny-muted">{t("সর্বকালীন", "All time")}</span></div><div className="accuracy-big">{bn(stats.accuracy)}<small>%</small></div><ProgressBar value={stats.accuracy} /><p>{bn(stats.correct)} / {bn(stats.total)} সঠিক · এই সপ্তাহে {bn(weekStats.accuracy)}%</p><div className="accuracy-subjects">{SUBJECTS.map(item => { const value = accuracyBySubject[item.id]; return <div key={item.id}><span>{item.short}</span><ProgressBar value={value.accuracy} color={item.color} /><small>{value.total ? `${bn(value.accuracy)}%` : '—'}</small></div>; })}</div></section>
      <section className="card wrong-collection"><div className="card-heading"><h3>{t("ভুল প্রশ্নের সংগ্রহ", "Mistake collection")}</h3><span className="tiny-muted">{bn([...latestAttempt.values()].filter(value => !value).length)}টি</span></div>{[...latestAttempt.entries()].filter(([, correct]) => !correct).slice(0, 6).map(([questionId]) => { const question = questions.find(item => item.id === questionId); if (!question) return null; return <button key={questionId} className="wrong-row" onClick={() => setQuiz({ ids: [questionId], index: 0, chosen: null, correct: 0, wrong: [] })}><CircleHelp size={16} /><span>{question.question}</span><ChevronRight size={15} /></button>; })}{![...latestAttempt.values()].some(value => !value) && <p className="tiny-muted padded">{t("এখনও কোনো ভুল নেই। কুইজ শুরু করো।", "No mistakes yet. Start a quiz.")}</p>}</section>
      <section className="card question-manage"><div className="card-heading"><h3><BookOpen size={17} />{t("আমার প্রশ্ন", "My questions")}</h3><button className="button secondary small" onClick={() => setAddOpen(true)}><Plus size={15} />{t("যোগ করো", "Add")}</button></div><label className="search-field small"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("নিজের প্রশ্ন খুঁজো…", "Search your own questions…")} aria-label={t("নিজের প্রশ্ন খুঁজো", "Search my questions")} /></label>{mine.length ? <div className="my-question-list">{mine.slice(0, 8).map(question => <div key={question.id} className="my-question"><span>{subjectById[question.subject].short}</span><p>{question.question}</p><button className="icon-button" aria-label={t("প্রশ্ন মুছো", "Delete question")} disabled={!!quiz?.ids.includes(question.id)} title={quiz?.ids.includes(question.id) ? t('কুইজ শেষ বা বন্ধ করে প্রশ্ন মুছো।', 'Close the quiz before deleting this question.') : undefined} onClick={() => confirm({ title: t('প্রশ্নটি মুছবে?', 'Delete this question?'), message: question.question, danger: true, label: t('মুছে ফেলো', 'Delete'), action: () => setData(d => ({ ...d, questions: d.questions.filter(item => item.id !== question.id) })) })}><Trash2 size={14} /></button></div>)}</div> : <p className="tiny-muted padded">{t("এখনও নিজের প্রশ্ন নেই। বইয়ের MCQ যোগ করো।", "No questions of your own yet. Add textbook MCQs.")}</p>}</section>
    </aside>
    {addOpen && <QuestionModal onClose={() => setAddOpen(false)} />}
  </div>;
}

function QuestionModal({ onClose }: { onClose: () => void }) {
  const { data, setData, notify } = usePlanner();
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [chapterId, setChapterId] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [answer, setAnswer] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (data.questions.length >= 2000) { setError('সর্বোচ্চ ২০০০টি নিজের প্রশ্ন রাখা যায়।'); return; }
    if (!question.trim() || options.some(option => !option.trim())) { setError('প্রশ্ন ও চারটি অপশনই লিখতে হবে।'); return; }
    const entry: QuizQuestion = { id: newId(), subject, chapterId: chapterId || undefined, question: question.trim(), options: options.map(option => option.trim()), answer, explanation: explanation.trim() || undefined, source: 'নিজের প্রশ্ন', createdAt: nowIso() };
    setData(d => ({ ...d, questions: [...d.questions, entry] }));
    notify('প্রশ্ন যোগ হয়েছে। এখনই কুইজে পাবে।', 'success'); onClose();
  };
  return <Modal title={t("নিজের MCQ যোগ করো", "Add your own MCQ")} onClose={onClose} wide><form onSubmit={submit} className="question-form"><div className="form-grid"><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("ঐচ্ছিক", "Optional")}</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label></div><label className="form-label">{t("প্রশ্ন", "Question")}<textarea data-autofocus rows={2} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder={t("বইয়ের/শিক্ষকের প্রশ্ন লিখো…", "Write a textbook or teacher question…")} /></label><div className="option-inputs">{options.map((option, index) => <div key={index} className={`option-input ${answer === index ? 'selected' : ''}`}><input type="radio" name="answer" checked={answer === index} onChange={() => setAnswer(index)} aria-label={`সঠিক উত্তর ${index + 1}`} /><span aria-hidden="true">{['ক', 'খ', 'গ', 'ঘ'][index]}</span><input value={option} maxLength={500} onChange={e => setOptions(current => current.map((value, i) => i === index ? e.target.value : value))} placeholder={`অপশন ${['ক', 'খ', 'গ', 'ঘ'][index]}`} /></div>)}</div><p className="tiny-muted">{t("সঠিক উত্তরের পাশের বোতামে টিক দাও।", "Tick the button beside the right answer.")}</p><label className="form-label">{t("ব্যাখ্যা (ঐচ্ছিক)", "Explanation (optional)")}<textarea rows={2} maxLength={2000} value={explanation} onChange={e => setExplanation(e.target.value)} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button type="submit" className="button primary"><Plus size={16} />{t("প্রশ্ন সেভ করো", "Save question")}</button></div></form></Modal>;
}

function CqPractice({ onShowMistakes }: { onShowMistakes: () => void }) {
  const { data, setData, notify, confirm, openMistake } = usePlanner();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const entries = data.cq.filter(entry => subject === 'all' || entry.subject === subject).slice().reverse();
  const average = data.cq.length ? Math.round(data.cq.reduce((sum, entry) => sum + entry.marks / entry.total, 0) / data.cq.length * 100) : 0;
  const partRows = CQ_PARTS.map(part => {
    const scored = data.cq.filter(entry => entry.parts);
    const got = scored.reduce((sum, entry) => sum + (entry.parts?.[part.key] || 0), 0);
    const full = scored.length * part.max;
    return { ...part, got, full, percent: full ? Math.round(got / full * 100) : 0 };
  });
  const weakestPart = data.cq.some(entry => entry.parts) ? [...partRows].sort((a, b) => a.percent - b.percent)[0] : null;
  return <div className="cq-layout">
    <section className="card cq-main"><div className="card-heading"><div><h2>{t("CQ অনুশীলনের রেকর্ড", "CQ practice record")}</h2><p>প্রশ্ন, নম্বর ও কোথায় নম্বর হারালে—নিজে লিখে রাখো। শিক্ষক না থাকলেও নিজের খাতা নিজে যাচাই করো।</p></div><button className="button primary" onClick={() => setOpen(true)}><Plus size={16} />{t("CQ যোগ করো", "Add CQ")}</button></div>
      <div className="cq-summary"><span><strong>{bn(data.cq.length)}</strong>{t("টি CQ", " CQs")}</span><span><strong>{bn(average)}%</strong>{t("গড় নম্বর", "Average marks")}</span><span><strong>{bn(data.cq.filter(entry => entry.marks / entry.total < .5).length)}</strong>{t("টি দুর্বল", " weak")}</span>{weakestPart && <span className="weak-part-chip"><strong>{weakestPart.label}</strong>{t("অংশে সবচেয়ে কম", "Lowest part")}</span>}</div>
      <div className="filter-bar"><select value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">{t("সব বিষয়", "All subjects")}</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      {entries.length ? <div className="cq-list">{entries.map(entry => { const chapter = chapterById[entry.chapterId || '']; const score = Math.round(entry.marks / entry.total * 100); return <article key={entry.id} className={`cq-card ${score < 50 ? 'weak' : ''}`}><div className="cq-top"><SubjectBadge subject={entry.subject} small /><span>{formatDate(entry.date)}</span>{chapter && <span>{chapter.title}</span>}<span className={`cq-score ${score < 50 ? 'bad' : score < 65 ? 'mid' : 'good'}`}>{bn(entry.marks)}/{bn(entry.total)} · {bn(score)}%</span></div><p className="cq-question">{entry.question}</p>{entry.parts && <div className="cq-parts">{[['c1', 'ক', 1], ['c2', 'খ', 2], ['c3', 'গ', 3], ['c4', 'ঘ', 4]].map(([key, label, max]) => { const got = entry.parts?.[key as keyof CqParts] || 0; const nmax = Number(max); return <span key={key as string} className={got >= nmax ? 'full' : got === 0 ? 'zero' : 'partial'}>{label} {bn(got)}/{bn(nmax)}</span>; })}</div>}{entry.note && <p className="cq-note">{entry.note}</p>}<div className="cq-actions"><button className="text-button" onClick={() => openMistake(entry.subject, `${entry.question} — ${bn(entry.marks)}/${bn(entry.total)}`)}><NotebookPen size={14} />{t("ভুলের খাতায়", "In the mistake book")}</button>{chapter && <button className="text-button" onClick={() => setData(d => updateChapterMeta(d, chapter.id, { cq: score >= 65 ? 'ready' : 'practicing', weak: score < 50 ? true : chapterMeta(d, chapter.id).weak }))}>{t("অধ্যায়ে স্ট্যাটাস", "Status by chapter")}</button>}<button className="icon-button" aria-label={t("CQ মুছো", "Delete CQ")} onClick={() => confirm({ title: 'CQ রেকর্ড মুছে ফেলবে?', message: entry.question, label: 'মুছে ফেলো', danger: true, action: () => { setData(d => ({ ...d, cq: d.cq.filter(item => item.id !== entry.id) })); notify('CQ রেকর্ড মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={15} /></button></div></article>; })}</div> : <EmptyState title={t("এখনও CQ অনুশীলন যোগ করোনি", "No CQ practice added yet")} description="একটি সৃজনশীল প্রশ্ন লেখো, নিজের নম্বর দাও, আর ভুলের কারণ টুকে রাখো।" action={<button className="button primary" onClick={() => setOpen(true)}>{t("প্রথম CQ যোগ করো", "Add the first CQ")}</button>} />}
    </section>
    <aside className="cq-rail"><section className="card rubric-card"><h3>{t("নম্বর দেওয়ার নিয়ম", "How the marks are given")}</h3><p className="small-copy">একটি সৃজনশীল প্রশ্ন ১০ নম্বরের—ক ১, খ ২, গ ৩, ঘ ৪। কোন অংশে কী চায়, সেটা জানলে নিজের উত্তর নিজেই যাচাই করতে পারবে।</p><div className="rubric-table">{CQ_PARTS.map(part => <div key={part.key} className="rubric-row"><span className={`rubric-mark ${part.key}`}>{part.mark}</span><div><strong>{part.label} <small>· {bn(part.max)} নম্বর</small></strong><p>{part.ask}</p></div></div>)}</div><p className="tiny-muted">বিজ্ঞানে ঘ অংশে সাধারণত গাণিতিক সমাধান/সিদ্ধান্ত, বাংলায় ঘ অংশে নিজের মতামত + উদ্ধৃতি। শিক্ষকের দেওয়া রুব্রিক থাকলে সেটাই প্রাধান্য পাবে।</p>
      <details className="model-answers"><summary>{t("মডেল উত্তরের কাঠামো দেখো", "See the model-answer structure")}</summary>
        <div className="model-example"><strong>{t("বিজ্ঞান (পদার্থ/রসায়ন/জীব)", "Science (physics / chemistry / biology)")}</strong><ol><li><b>{t("ক:", "a.")}</b>{t("“X হলো …” — এক বাক্যের নির্ভুল সংজ্ঞা।", "“X is …” — one precise sentence.")}</li><li><b>{t("খ:", "b.")}</b> কারণ → ব্যাখ্যা → সূত্র/উদাহরণ, দুই-তিন বাক্য।</li><li><b>{t("গ:", "c.")}</b> প্রদত্ত মান → সূত্র → বসানো → ফল + একক, ধাপে ধাপে।</li><li><b>{t("ঘ:", "d.")}</b> উদ্দীপকের সঙ্গে সিদ্ধান্ত → যুক্তি → তুলনা → শেষে স্পষ্ট সিদ্ধান্ত।</li></ol></div>
        <div className="model-example"><strong>{t("বাংলা (গদ্য/পদ্য)", "Bangla (prose / poetry)")}</strong><ol><li><b>{t("ক:", "a.")}</b>{t("সংজ্ঞা বা তথ্য এক বাক্যে।", "Definition or fact in one sentence.")}</li><li><b>{t("খ:", "b.")}</b>{t("মূল ভাব নিজের ভাষায় ব্যাখ্যা।", "Explain the main idea in your own words.")}</li><li><b>{t("গ:", "c.")}</b>{t("প্রসঙ্গ/উদ্ধৃতি মিলিয়ে প্রয়োগ।", "Apply it with context or a quotation.")}</li><li><b>{t("ঘ:", "d.")}</b>{t("মতামত + কারণ + উদ্ধৃতি, শেষে সিদ্ধান্ত।", "Opinion + reason + quotation, a verdict at the end.")}</li></ol></div>
      </details></section>
      {data.cq.some(entry => entry.parts) && <section className="card part-analysis"><div className="card-heading"><h3>{t("কোন অংশে নম্বর কম", "Which part scored low")}</h3><span className="tiny-muted">{t("অংশভিত্তিক রেকর্ড", "Part-wise record")}</span></div>{partRows.map(row => <div key={row.key} className="part-row"><span>{row.label}</span><ProgressBar value={row.percent} /><small>{row.full ? `${bn(row.percent)}%` : '—'}</small></div>)}{weakestPart && <p className="part-tip"><strong>{weakestPart.label}</strong> অংশে সবচেয়ে বেশি নম্বর হারাচ্ছ। {weakestPart.tip}</p>}</section>}<section className="card"><h3>{t("ভুলের খাতা", "Mistake notebook")}</h3><p className="small-copy">কম নম্বর পাওয়া CQ-এর ভাষা, তথ্য ও গঠনের ভুল আলাদা করে লেখো। একই ভুল দুইবার করলে অধ্যায় দুর্বল হিসেবে চিহ্নিত হবে।</p><button className="button secondary full-width" onClick={onShowMistakes}>{t("ভুলের খাতা দেখো", "Open the mistake book")}<ChevronRight size={15} /></button></section></aside>
    {open && <CqModal onClose={() => setOpen(false)} />}
  </div>;
}

function CqModal({ onClose }: { onClose: () => void }) {
  const { data, setData, today, notify } = usePlanner();
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [chapterId, setChapterId] = useState('');
  const [question, setQuestion] = useState('');
  const [marks, setMarks] = useState('0');
  const [total, setTotal] = useState('10');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [byParts, setByParts] = useState(true);
  const [parts, setParts] = useState<CqParts>({ c1: 1, c2: 2, c3: 2, c4: 2 });
  const partSum = parts.c1 + parts.c2 + parts.c3 + parts.c4;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const obtained = byParts ? partSum : Number(marks), full = byParts ? 10 : Number(total);
    if (!question.trim()) { setError('প্রশ্নটি লেখো।'); return; }
    if (!Number.isFinite(obtained) || !Number.isFinite(full) || full < 1 || full > 1000 || obtained < 0 || obtained > full) { setError('পূর্ণমান ১–১০০০ এবং প্রাপ্ত নম্বর ০ থেকে পূর্ণমানের মধ্যে হতে হবে।'); return; }
    if (byParts && CQ_PARTS.some(part => parts[part.key] > part.max || parts[part.key] < 0)) { setError('ক অংশে সর্বোচ্চ ১, খ-এ ২, গ-এ ৩, ঘ-এ ৪ নম্বর দেওয়া যায়।'); return; }
    if (data.cq.length >= 2000) { setError('সর্বোচ্চ ২০০০টি CQ রেকর্ড রাখা যায়।'); return; }
    const entry: CqEntry = { id: newId(), subject, chapterId: chapterId || undefined, question: question.trim(), marks: obtained, total: full, note: note.trim(), date: today, at: nowIso(), parts: byParts ? parts : undefined };
    setData(d => recordCqEntry(d,entry));
    notify('CQ অনুশীলন সেভ হয়েছে।', 'success'); onClose();
  };
  return <Modal title={t("CQ অনুশীলন যোগ করো", "Add CQ practice")} onClose={onClose}><form onSubmit={submit}><div className="form-grid"><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("ঐচ্ছিক", "Optional")}</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label></div><label className="form-label">{t("প্রশ্ন/উদ্দীপক", "Question / stem")}<textarea rows={3} maxLength={5000} value={question} onChange={e => setQuestion(e.target.value)} placeholder={t("প্রশ্নটি সংক্ষেপে লেখো…", "Write the question briefly…")} /></label>
      <div className="parts-toggle"><label className="check-line"><input type="checkbox" checked={byParts} onChange={e => setByParts(e.target.checked)} />{t("অংশভিত্তিক নম্বর দাও (ক/খ/গ/ঘ)", "Mark part by part (a/b/c/d)")}</label><span className="tiny-muted">{t("নিজের দুর্বল অংশ চিনতে সাহায্য করে", "Helps you spot your weak parts")}</span></div>
      {byParts ? <div className="parts-grid">{CQ_PARTS.map(part => <label key={part.key} className={`parts-field ${part.key}`}><span><strong>{part.label}</strong>{part.mark}<small>সর্বোচ্চ {bn(part.max)}</small></span><input type="number" min={0} max={part.max} step="0.5" value={parts[part.key]} onChange={e => setParts(current => ({ ...current, [part.key]: Math.max(0, Math.min(part.max, Number(e.target.value) || 0)) }))} /></label>)}<div className="parts-total"><span>{t("মোট", "Total")}</span><strong>{bn(partSum)} / {bn(10)}</strong></div></div> : <div className="form-grid"><label>{t("প্রাপ্ত নম্বর", "Marks obtained")}<input type="number" min={0} step="0.5" value={marks} onChange={e => setMarks(e.target.value)} /></label><label>{t("পূর্ণমান", "Total marks")}<input type="number" min={1} max={1000} step="0.5" value={total} onChange={e => setTotal(e.target.value)} /></label></div>}<label className="form-label">{t("নিজের মূল্যায়ন / ভুলের কারণ", "Self-assessment / why you lost marks")}<textarea rows={3} maxLength={5000} value={note} onChange={e => setNote(e.target.value)} placeholder={t("কোথায় নম্বর হারালে, পরেরবার কী করবে…", "Where you lost marks, what to do next…")} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><Check size={16} />{t("সেভ করো", "Save")}</button></div></form></Modal>;
}

function MistakeBook() {
  const { data, setData, confirm, openMistake, notify } = usePlanner();
  const sorted = [...data.mistakes].sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.date.localeCompare(a.date));
  const unresolved = data.mistakes.filter(mistake => !mistake.resolved).length;
  return <section className="card mistakes-card"><div className="card-heading"><div><h2><NotebookPen size={20} />{t("ভুলের খাতা", "Mistake book")}</h2><p>যে ভুলটা বুঝে শুধরেছ, সেটাই পরের পরীক্ষায় নম্বর বাঁচাবে। {bn(unresolved)}টি এখনও অমীমাংসিত।</p></div><button className="button secondary" onClick={() => openMistake()}><Plus size={16} />{t("ভুল যোগ করো", "Add a mistake")}</button></div>{sorted.length ? <div className="mistake-list">{sorted.map(mistake => <div className={`mistake-row ${mistake.resolved ? 'resolved' : ''}`} key={mistake.id}><button className={`task-check ${mistake.resolved ? 'checked' : ''}`} aria-label={mistake.resolved ? 'আবার অনুশীলন করো' : 'শুধরেছি হিসেবে চিহ্নিত করো'} aria-pressed={mistake.resolved} onClick={() => setData(d => ({ ...d, mistakes: d.mistakes.map(item => item.id === mistake.id ? { ...item, resolved: !item.resolved } : item) }))}>{mistake.resolved && <Check size={16} />}</button><div><span className="mistake-meta">{subjectById[mistake.subject].name} · {formatDate(mistake.date)}</span><p>{mistake.text}</p></div><button className="text-button" onClick={() => openMistake(mistake.subject, '')}><RotateCcw size={14} />{t("আবার", "Again")}</button><button className="icon-button delete-button" aria-label={t("ভুলের নোট মুছো", "Delete the mistake note")} onClick={() => confirm({ title: 'নোটটি মুছে ফেলবে?', message: mistake.text, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, mistakes: d.mistakes.filter(item => item.id !== mistake.id) })); notify('নোটটি মুছে ফেলা হয়েছে।'); } })}><Trash2 size={16} /></button></div>)}</div> : <EmptyState title={t("এখানে ভুলগুলো শেখার সুযোগ হবে", "This is where mistakes turn into learning")} description="পড়া বা মডেল টেস্টের সময় যেখানে আটকে গেছ, বিষয়সহ ছোট করে লিখে রাখো।" />}<div className="mistake-tip"><ListChecks size={17} /><p>প্রতিটি ভুলের সঙ্গে কারণ লেখো—তথ্য ভুল, ধারণা ভুল, নাকি সময়ের চাপ। কারণ আলাদা করলে সংশোধনও সহজ হয়।</p></div></section>;
}
