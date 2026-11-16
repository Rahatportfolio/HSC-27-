import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock, ArrowLeft, ArrowRight, Award, Brain, Check, CheckCheck, ChevronRight, ClipboardList,
  Clock3, Flag, ListChecks, Play, RotateCcw, Target, Timer, TrendingUp, X,
} from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, sortChapters, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDate, percent, todayKey } from '../planner';
import {
  EXAM_COUNTS, EXAM_MODE_INFO, buildExamQuestions, examChapterAccuracy, examDurationMin,
  examGradeLetter, examHistoryStats, gradeExam, saveExamSession,
} from '../examSim';
import { retryBuckets, retryChapterRows } from '../retryLoop';
import { CADENCE_SPECS, cadenceSlots, cadenceStats, cadenceWeek, dailyTestChapter, missedDaily, nextCadenceSlot } from '../cadence';
import type { CadenceSlot } from '../cadence';
import type { ExamGrade } from '../examSim';
import { allQuestions } from '../analytics';
import type { ExamCadence, ExamMode, ExamSession, QuizQuestion } from '../types';
import { EmptyState, PageHeading, ProgressBar, ProgressRing, SubjectBadge } from '../components';
import { t } from '../i18n';

type Stage = 'setup' | 'running' | 'result';
interface ResultState {
  grade: ExamGrade;
  title: string;
  mode: ExamMode;
  durationMin: number;
  timeTakenSec: number;
  questions: QuizQuestion[];
  answers: Record<string, number>;
  cadence?: ExamCadence;
}
const LETTER_OPTION = ['ক', 'খ', 'গ', 'ঘ'];
const clock = (seconds: number): string => {
  const safe = Math.max(0, Math.round(seconds));
  const m = Math.floor(safe / 60), s = safe % 60;
  return `${bn(String(m).padStart(2, '0'))}:${bn(String(s).padStart(2, '0'))}`;
};

/** One line describing the paper, reused by the setup card, the run screen and the saved record. */
function paperTitle(mode: ExamMode, subject: SubjectId, chapterId: string): string {
  if (mode === 'chapter') return `${chapterById[chapterId]?.title || t('অধ্যায়', 'Chapter')} · ${t('অধ্যায় পরীক্ষা', 'Chapter test')}`;
  if (mode === 'subject') return `${subjectById[subject].name} · ${t('বিষয় পরীক্ষা', 'Subject test')}`;
  if (mode === 'mistakes') return t('ভুলের পরীক্ষা', 'Mistake test');
  if (mode === 'retry') return t('আজকের পুনরায় পরীক্ষা', 'Today’s retry test');
  return t('পূর্ণ মক টেস্ট', 'Full mock test');
}

export default function ExamSimView() {
  const { data, setData, today, notify, confirm, openChapter } = usePlanner();
  const [stage, setStage] = useState<Stage>('setup');
  const [mode, setMode] = useState<ExamMode>('subject');
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [chapterId, setChapterId] = useState('');
  const [count, setCount] = useState(10);
  const [paper, setPaper] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [result, setResult] = useState<ResultState | null>(null);
  const [cadence, setCadence] = useState<ExamCadence | undefined>(undefined);
  const submitted = useRef(false);

  const sessions = useMemo(() => [...data.examSessions].sort((a, b) => b.at.localeCompare(a.at)), [data.examSessions]);
  const stats = useMemo(() => examHistoryStats(data.examSessions), [data.examSessions]);
  const weak = useMemo(() => examChapterAccuracy(data.examSessions).slice(0, 5), [data.examSessions]);
  const retries = useMemo(() => retryBuckets(data, today), [data, today]);
  const slots = useMemo(() => cadenceSlots(data, today), [data, today]);
  const routine = useMemo(() => cadenceStats(data, today), [data, today]);
  const week = useMemo(() => cadenceWeek(data, today), [data, today]);
  const missed = useMemo(() => missedDaily(data, today), [data, today]);
  const nextSlot = useMemo(() => nextCadenceSlot(data, today), [data, today]);
  const retryRows = useMemo(() => retryChapterRows(data, today).slice(0, 5), [data, today]);
  const dueRetryCount = retries.due.length + retries.upcoming.length;
  const subjectChapters = useMemo(() => sortChapters(CHAPTERS.filter(chapter => chapter.subject === subject)), [subject]);
  const remaining = stage === 'running' ? Math.max(0, Math.ceil((deadline - tick) / 1000)) : 0;
  const active = paper[index];
  const answeredCount = paper.filter(question => Object.hasOwn(answers, question.id)).length;

  useEffect(() => {
    if (stage !== 'running') return;
    const id = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [stage]);

  const start = (questions: QuizQuestion[], nextMode: ExamMode, cadence?: ExamCadence) => {
    if (!questions.length) {
      notify(t('এই বাছাইয়ে কোনো প্রশ্ন নেই। বিষয়, অধ্যায় বা সংখ্যা বদলাও।', 'No questions in this selection. Change the subject, chapter or count.'), 'info');
      return;
    }
    submitted.current = false;
    const minutes = examDurationMin(questions.length);
    const now = Date.now();
    setMode(nextMode);
    setPaper(questions);
    setAnswers({});
    setIndex(0);
    setStartedAt(now);
    setDeadline(now + minutes * 60 * 1000);
    setTick(now);
    setResult(null);
    setCadence(cadence);
    setStage('running');
    notify(t(`${bn(questions.length)}টি প্রশ্ন · ${bn(minutes)} মিনিটের পরীক্ষা শুরু হলো।`, `${questions.length} questions · ${minutes}-minute exam started.`), 'success');
  };

  /** Starts the routine slot: daily = today's weakest chapter, weekly = a subject, monthly = all. */
  const startSlot = (slot: CadenceSlot) => {
    if (slot.cadence === 'monthly') {
      const questions = buildExamQuestions(data, { mode: 'full', count: slot.questions, today, generate: true, variant: Date.now() });
      start(questions, 'full', 'monthly');
      return;
    }
    if (slot.cadence === 'weekly') {
      // The weekly paper follows the weakest subject the report knows; otherwise the chosen one.
      const weakestSubject = weak[0]?.subject ?? subject;
      setSubject(weakestSubject);
      const questions = buildExamQuestions(data, { mode: 'subject', subject: weakestSubject, count: slot.questions, today, generate: true, variant: Date.now() });
      start(questions, 'subject', 'weekly');
      return;
    }
    // A daily short test stays on one chapter: the weakest one that still has questions.
    const target = chapterId || dailyTestChapter(data, weak.map(row => row.chapterId).filter((id): id is string => !!id));
    const questions = buildExamQuestions(data, { mode: 'chapter', chapterId: target, count: slot.questions, today, generate: true, variant: Date.now() });
    start(questions, 'chapter', 'daily');
  };

  const startConfigured = () => {
    const questions = buildExamQuestions(data, { mode, subject, chapterId: chapterId || undefined, count, today, generate: mode === 'chapter' || mode === 'subject', variant: Date.now() });
    start(questions, mode);
  };

  const finish = () => {
    if (submitted.current) return;
    submitted.current = true;
    const grade = gradeExam(paper, answers);
    const title = paperTitle(mode, subject, chapterId || paper[0]?.chapterId || '');
    const timeTakenSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    setData(current => saveExamSession(current, {
      mode, title, ...(mode === 'subject' ? { subject } : {}), questions: paper, answers,
      durationMin: examDurationMin(paper.length), timeTakenSec, date: todayKey(), ...(cadence ? { cadence } : {}),
    }));
    setResult({ grade, title, mode, durationMin: examDurationMin(paper.length), timeTakenSec, questions: paper, answers, ...(cadence ? { cadence } : {}) });
    setStage('result');
    notify(grade.percent >= 50
      ? t(`পরীক্ষা সেভ হয়েছে · ${bn(grade.score)}/${bn(grade.total)} সঠিক।`, `Exam saved · ${grade.score}/${grade.total} correct.`)
      : t(`পরীক্ষা সেভ হয়েছে · ${bn(grade.score)}/${bn(grade.total)}। ভুলগুলো রিভিশন কার্ডে যোগ হয়েছে।`, `Exam saved · ${grade.score}/${grade.total}. Mistakes were added to your revision cards.`),
    grade.percent >= 50 ? 'success' : 'info');
  };

  const submit = () => {
    const left = paper.length - answeredCount;
    if (left > 0) {
      confirm({
        title: t('অসম্পূর্ণ উত্তরপত্র জমা দেবে?', 'Submit an incomplete paper?'),
        message: t(`${bn(left)}টি প্রশ্নের উত্তর দেওয়া হয়নি—সেগুলো ভুল হিসেবে গণ্য হবে এবং ভুলের খাতায় যাবে।`, `${left} question(s) are unanswered — they count as wrong and go to your mistake book.`),
        label: t('জমা দাও', 'Submit'),
        action: finish,
      });
      return;
    }
    finish();
  };

  // Time up: auto-submit exactly what is on the answer sheet.
  useEffect(() => {
    if (stage !== 'running' || !deadline) return;
    if (remaining > 0) return;
    notify(t('সময় শেষ! উত্তরপত্র নিজে থেকে জমা হলো।', 'Time is up. The paper was submitted automatically.'), 'info');
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, stage, deadline]);

  const retrySession = (session: ExamSession) => {
    const byId = new Map(allQuestions(data).map(question => [question.id, question]));
    const questions = session.questionIds.map(id => byId.get(id)).filter((question): question is QuizQuestion => !!question);
    setMode('mistakes');
    start(questions, 'mistakes');
  };

  return <div className="view examsim-view">
    <PageHeading
      eyebrow="EXAM SIMULATOR"
      title="সময় ধরে পরীক্ষা, সঙ্গে সঙ্গে ফল।"
      titleEn="A timed paper, marked instantly."
      description="নমুনা ব্যাংক ও নিজের প্রশ্ন থেকে স্বয়ংক্রিয়ভাবে প্রশ্নপত্র তৈরি হয়। সময় শেষে উত্তরপত্র নিজে থেকেই জমা হয়, প্রতিটি ভুল ভুলের খাতা ও রিভিশনে যায়—আর আগের ভুলগুলোই পরের পরীক্ষায় ফিরে আসে।"
      descriptionEn="A paper is built automatically from the sample bank and your own questions. It submits itself when the clock hits zero, every mistake feeds the mistake book and revision, and previous mistakes come back in the next paper."
      action={<button className="button secondary" onClick={() => setStage('setup')}><ListChecks size={17} />{t('পরীক্ষার তালিকা', 'Exam history')}</button>}
    />

    {stage === 'setup' && <>
      <div className="exam-stat-row">
        <div className="card exam-stat"><span className="stat-icon green"><ClipboardList size={20} /></span><div><span>{t('মোট পরীক্ষা', 'Papers taken')}</span><strong>{bn(stats.count)}</strong><p>{t('সিমুলেটরে', 'In the simulator')}</p></div></div>
        <div className="card exam-stat"><span className="stat-icon lavender"><Target size={20} /></span><div><span>{t('গড় ফল', 'Average score')}</span><strong>{stats.count ? `${bn(stats.average)}%` : '—'}</strong><p>{t('সব পরীক্ষায়', 'Across all papers')}</p></div></div>
        <div className="card exam-stat"><span className="stat-icon peach"><Award size={20} /></span><div><span>{t('সেরা ফল', 'Best score')}</span><strong>{stats.count ? `${bn(stats.best)}%` : '—'}</strong><p>{t('সর্বকালীন', 'All time')}</p></div></div>
        <div className="card exam-stat"><span className="stat-icon blue"><TrendingUp size={20} /></span><div><span>{t('এখন কী দাঁড়ায়', 'Recent trend')}</span><strong className={stats.trend !== null && stats.trend < 0 ? 'down' : ''}>{stats.trend === null ? '—' : `${stats.trend > 0 ? '+' : ''}${bn(stats.trend)}%`}</strong><p>{t('শেষ ৩ বনাম আগের ৩', 'Last 3 vs previous 3')}</p></div></div>
      </div>

      <section className="card exam-routine-card">
        <div className="card-heading"><div><h2><AlarmClock size={19} />{t('পরীক্ষার রুটিন', 'Exam routine')}</h2><p>{t('প্রতিদিন ১০টি MCQ, প্রতি শুক্রবার ২৫টি, মাসে একবার ৫০টির পূর্ণ মক। মিস হলে সিস্টেম মনে করিয়ে দেয়।', 'Ten MCQs daily, twenty-five every Friday, a fifty-question mock once a month. Missed slots stay visible.')}</p></div>
          <span className={`retry-pill ${nextSlot ? 'due' : ''}`}>{nextSlot ? `${t('এখনই দরকার', 'Due now')}: ${t(CADENCE_SPECS.find(spec => spec.cadence === nextSlot.cadence)!.label, CADENCE_SPECS.find(spec => spec.cadence === nextSlot.cadence)!.labelEn)}` : t('সব শেষ', 'All done')}</span>
        </div>
        {missed && <div className="exam-missed"><Flag size={16} /><span>{t(`গত ${bn(missed.days)} দিনে কোনো পরীক্ষা দেওয়া হয়নি। আজকের ছোট পরীক্ষাটা দিয়ে শুরু করো।`, `No paper in the last ${missed.days} day(s). Start with today’s short test.`)}</span></div>}
        <div className="exam-routine-grid">{slots.map(slot => <article className={`exam-routine-slot ${slot.due ? 'due' : ''}`} key={slot.cadence}>
          <div className="exam-routine-head"><span className={`exam-cadence-dot ${slot.cadence}`} /><strong>{t(slot.label, slot.labelEn)}</strong></div>
          <p>{t(slot.hint, slot.hintEn)}</p>
          <div className="exam-routine-meta">
            <span>{slot.lastDate ? t(`${bn(slot.daysSince ?? 0)} দিন আগে`, `${slot.daysSince ?? 0} day(s) ago`) : t('এখনো দেওয়া হয়নি', 'never taken')}</span>
            <span>{bn(slot.takenLast30)} {t('টি / ৩০ দিন', 'in 30 days')}</span>
            {slot.lastScore !== null && <span>{t('শেষ ফল', 'Last')}: {bn(slot.lastScore)}%</span>}
          </div>
          <button className={`button small ${slot.due ? 'primary' : 'secondary'}`} onClick={() => startSlot(slot)}><Play size={14} />{slot.due ? t('এখনই দাও', 'Take it now') : t('আবার দাও', 'Take again')}</button>
        </article>)}</div>
        <div className="exam-week-strip">
          <span className="tiny-muted">{t('এই সপ্তাহ', 'This week')}</span>
          {week.map(day => <div key={day.date} className={`exam-week-day ${day.done ? 'done' : ''} ${day.date === today ? 'today' : ''} ${day.cadence === 'weekly' ? 'weekly' : ''}`}>
            <strong>{day.weekday}</strong><small>{day.weekday === 'শুক্র' ? t('সাপ্তাহিক', 'weekly') : day.done ? <Check size={12} /> : '·'}</small>
          </div>)}
          <span className="tiny-muted">{t(`${bn(routine.taken7)}টি / ৭ দিন · ধারাবাহিকতা ${bn(routine.consistency)}%`, `${routine.taken7} in 7 days · consistency ${routine.consistency}%`)}</span>
        </div>
      </section>
      <div className="exam-setup-grid">
        <section className="card exam-setup-card">
          <div className="card-heading"><div><h2><Play size={19} />{t('নতুন পরীক্ষা তৈরি করো', 'Build a new paper')}</h2><p>{t('প্রশ্ন, সময় ও পূর্ণমান নিজে থেকেই ঠিক হয়ে যাবে।', 'Questions, time and marks are set automatically.')}</p></div></div>
          <div className="segmented exam-mode-tabs">
            {(Object.keys(EXAM_MODE_INFO) as ExamMode[]).map(item => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{t(EXAM_MODE_INFO[item].label, EXAM_MODE_INFO[item].labelEn)}</button>)}
          </div>
          <p className="exam-mode-hint">{t(EXAM_MODE_INFO[mode].hint, EXAM_MODE_INFO[mode].hintEn)}</p>
          <div className="quiz-setup-grid">
            {(mode === 'subject' || mode === 'full') && <label>{t('বিষয়', 'Subject')}<select value={subject} onChange={event => { setSubject(event.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            {mode === 'chapter' && <>
              <label>{t('বিষয়', 'Subject')}<select value={subject} onChange={event => { setSubject(event.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>{t('অধ্যায়', 'Chapter')}<select value={chapterId} onChange={event => setChapterId(event.target.value)}><option value="">{t('বাছো', 'Choose')}</option>{subjectChapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
            </>}
            <label>{t('প্রশ্ন সংখ্যা', 'Question count')}<select value={count} onChange={event => setCount(Number(event.target.value))}>{EXAM_COUNTS.map(value => <option key={value} value={value}>{bn(value)} {t('টি', '')}</option>)}</select></label>
            {(mode === 'retry' || mode === 'mistakes') && <label>{t('পুল', 'Pool')}<span className="exam-pool-count">{bn(dueRetryCount)} {t('টি প্রশ্ন অপেক্ষায়', 'questions waiting')}</span></label>}
          </div>
          <div className="exam-paper-preview">
            <Clock3 size={17} />
            <span>{t('সময়', 'Time')}: <strong>{bn(examDurationMin(Math.min(count, 50)))} {t('মিনিট', 'min')}</strong> · {t('প্রতি MCQ ১ মিনিট', '1 minute per MCQ')}</span>
          </div>
          <button className="button primary wide-button" onClick={startConfigured}><Brain size={17} />{t('পরীক্ষা শুরু করো', 'Start the exam')}</button>
        </section>

        <aside className="exam-setup-rail">
          <section className="card exam-retry-card">
            <div className="card-heading"><div><h3><RotateCcw size={18} />{t('পুনরায় পরীক্ষার তালিকা', 'Retry queue')}</h3><p>{t('ভুল প্রশ্ন ১ → ৩ → ৭ → ১৪ → ৩০ দিনের ল্যাডারে ফিরে আসে।', 'Wrong questions return on a 1 → 3 → 7 → 14 → 30 day ladder.')}</p></div><span className="tiny-muted">{bn(retries.pending.length)}</span></div>
            <div className="exam-retry-stats">
              <div><span>{t('আজ দরকার', 'Due today')}</span><strong>{bn(retries.due.length)}</strong></div>
              <div><span>{t('সামনে', 'Upcoming')}</span><strong>{bn(retries.upcoming.length)}</strong></div>
              <div><span>{t('ঝালাই হয়েছে', 'Cleared')}</span><strong>{bn(retries.cleared.length)}</strong></div>
            </div>
            {retries.due.length > 0
              ? <button className="button primary wide-button" onClick={() => start(buildExamQuestions(data, { mode: 'retry', count: Math.min(EXAM_COUNTS[EXAM_COUNTS.length - 1], Math.max(10, retries.due.length)), today }), 'retry')}><Play size={16} />{t(`${bn(Math.min(retries.due.length, 50))}টি ফেরত পাওয়া প্রশ্ন দাও`, `Answer ${Math.min(retries.due.length, 50)} due question(s)`)}</button>
              : <p className="tiny-muted padded">{t('এখন কোনো প্রশ্ন ফেরত পাওয়ার কথা নয় — নতুন পরীক্ষা দিলে ভুলগুলো এখানে জমা হবে।', 'Nothing is due right now — take a paper and the mistakes will queue here.')}</p>}
            {retryRows.length > 0 && <div className="exam-retry-chapters">{retryRows.map(row => <div key={row.chapterId || row.subject}>
              <span>{row.chapterId ? (chapterById[row.chapterId]?.title || row.subject) : subjectById[row.subject]?.short}</span>
              <small>{bn(row.due)} {t('আজ', 'due')} · {bn(row.total)} {t('মোট', 'total')}</small>
            </div>)}</div>}
          </section>
          <section className="card exam-weak-card">
            <div className="card-heading"><div><h3><Target size={18} />{t('পরীক্ষার ফল থেকে দুর্বলতা', 'Weakness from exams')}</h3><p>{t('সব সিমুলেটেড পরীক্ষার অধ্যায়ভিত্তিক নির্ভুলতা।', 'Chapter accuracy across every simulated paper.')}</p></div></div>
            {weak.length ? <div className="accuracy-subjects">{weak.map(row => <div key={row.chapterId || row.subject}>
              <span>{row.chapterId ? (chapterById[row.chapterId]?.title || row.subject) : subjectById[row.subject]?.short}</span>
              <ProgressBar value={row.percent} color={row.percent < 50 ? '#b54238' : undefined} />
              <small>{bn(row.percent)}%</small>
            </div>)}</div> : <p className="tiny-muted padded">{t('প্রথম পরীক্ষা দিলে এখানে দুর্বল অধ্যায় দেখাবে।', 'Take your first paper to see weak chapters here.')}</p>}
          </section>
          <section className="card exam-history-card">
            <div className="card-heading"><div><h3><ClipboardList size={18} />{t('পরীক্ষার ইতিহাস', 'Exam history')}</h3><p>{t('আগের ফল তুলনা করো।', 'Compare your earlier papers.')}</p></div><span className="tiny-muted">{bn(sessions.length)}</span></div>
            {sessions.length ? <div className="exam-history-list">{sessions.slice(0, 8).map(session => {
              const value = percent(session.score, session.total);
              return <div className="exam-history-row" key={session.id}>
                <div className="exam-history-main">
                  <strong>{session.title}</strong>
                  <span>{formatDate(session.date)} · {t(EXAM_MODE_INFO[session.mode].label, EXAM_MODE_INFO[session.mode].labelEn)} · {clock(session.timeTakenSec)}</span>
                  <ProgressBar value={value} color={value < 50 ? '#b54238' : undefined} />
                </div>
                <div className="exam-history-score"><strong>{bn(value)}%</strong><small>{bn(session.score)}/{bn(session.total)}</small><button className="text-button" onClick={() => retrySession(session)}><RotateCcw size={13} />{t('আবার', 'Retry')}</button></div>
              </div>;
            })}</div> : <EmptyState title={t('এখনও কোনো পরীক্ষা দাওনি', 'No paper yet')} description={t('উপরের কার্ড থেকে প্রথম পরীক্ষা শুরু করো।', 'Start your first paper from the card above.')} />}
          </section>
        </aside>
      </div>
    </>}

    {stage === 'running' && active && <div className="exam-run-grid">
      <section className="card exam-run-card">
        <div className="exam-run-top">
          <div><span className="eyebrow">{t('চলমান পরীক্ষা', 'Exam in progress')}</span><h2>{t(EXAM_MODE_INFO[mode].label, EXAM_MODE_INFO[mode].labelEn)}</h2></div>
          <div className={`exam-run-clock ${remaining <= 60 ? 'urgent' : ''}`} role="timer" aria-live="off"><Timer size={18} /><strong>{clock(remaining)}</strong><small>{t('বাকি সময়', 'left')}</small></div>
        </div>
        <div className="exam-run-progress"><ProgressBar value={percent(answeredCount, paper.length)} /><span>{bn(answeredCount)} / {bn(paper.length)} {t('উত্তর দেওয়া হয়েছে', 'answered')}</span></div>
        <div className="quiz-question-meta">
          <SubjectBadge subject={active.subject} small />
          {active.chapterId && <span>{chapterById[active.chapterId]?.title}</span>}
          <span>{t('প্রশ্ন', 'Question')} {bn(index + 1)} / {bn(paper.length)}</span>
        </div>
        <h2 className="quiz-question">{active.question}</h2>
        <div className="quiz-options">{active.options.map((option, optionIndex) => {
          const chosen = answers[active.id] === optionIndex;
          return <button key={optionIndex} className={`quiz-option ${chosen ? 'chosen' : ''}`} aria-pressed={chosen} onClick={() => setAnswers(current => ({ ...current, [active.id]: optionIndex }))}>
            <span className="option-letter">{LETTER_OPTION[optionIndex]}</span><span>{option}</span>{chosen && <Check size={18} />}
          </button>;
        })}</div>
        <div className="exam-run-actions">
          <button className="button secondary" disabled={index === 0} onClick={() => setIndex(current => Math.max(0, current - 1))}><ArrowLeft size={16} />{t('আগের', 'Previous')}</button>
          <button className="text-button" disabled={!Object.hasOwn(answers, active.id)} onClick={() => setAnswers(current => { const copy = { ...current }; delete copy[active.id]; return copy; })}><X size={14} />{t('উত্তর মুছো', 'Clear')}</button>
          {index + 1 < paper.length
            ? <button className="button primary" onClick={() => setIndex(current => Math.min(paper.length - 1, current + 1))}>{t('পরের প্রশ্ন', 'Next')}<ArrowRight size={16} /></button>
            : <button className="button primary" onClick={submit}><CheckCheck size={16} />{t('জমা দাও', 'Submit')}</button>}
        </div>
        <div className="exam-palette" role="group" aria-label={t('প্রশ্নে যাও', 'Jump to a question')}>
          {paper.map((question, questionIndex) => <button key={question.id} className={`exam-palette-cell ${Object.hasOwn(answers, question.id) ? 'answered' : ''} ${questionIndex === index ? 'current' : ''}`} onClick={() => setIndex(questionIndex)} aria-label={`${t('প্রশ্ন', 'Question')} ${bn(questionIndex + 1)}`}>{bn(questionIndex + 1)}</button>)}
        </div>
        <div className="exam-run-footer">
          <span className="tiny-muted">{t('উত্তর দেওয়া মাত্র সেভ থাকে; সময় শেষে অথবা “জমা দাও” চাপলে ফল তৈরি হবে।', 'Answers are kept as you go; the result is created on submit or when time runs out.')}</span>
          <button className="button secondary" onClick={submit}><Flag size={16} />{t('শেষ করো', 'Finish')}</button>
        </div>
      </section>
      <aside className="exam-run-rail">
        <section className="card exam-run-summary">
          <div className="card-heading"><h3><AlarmClock size={18} />{t('পরীক্ষার হিসাব', 'Paper summary')}</h3></div>
          <div className="exam-summary-row"><span>{t('প্রশ্ন', 'Questions')}</span><strong>{bn(paper.length)}</strong></div>
          <div className="exam-summary-row"><span>{t('উত্তর দেওয়া', 'Answered')}</span><strong>{bn(answeredCount)}</strong></div>
          <div className="exam-summary-row"><span>{t('বাকি', 'Left')}</span><strong>{bn(paper.length - answeredCount)}</strong></div>
          <div className="exam-summary-row"><span>{t('সময়', 'Time')}</span><strong>{bn(examDurationMin(paper.length))} {t('মিনিট', 'min')}</strong></div>
          <p className="tiny-muted">{t('এক পূর্ণ পত্রে ১ নম্বর MCQ-এর মতো, প্রতি প্রশ্নে ১ মিনিট।', 'Like a 1-mark MCQ paper: one minute per question.')}</p>
        </section>
      </aside>
    </div>}

    {stage === 'result' && result && <ExamResult
      result={result}
      onRetryWrong={() => start(result.grade.wrong.length + result.grade.unanswered.length
        ? [...result.grade.wrong, ...result.grade.unanswered]
        : result.questions, 'mistakes')}
      onNew={() => setStage('setup')}
      onOpenChapter={(id) => { const chapter = chapterById[id]; if (chapter) openChapter(chapter); }}
    />}
  </div>;
}

function ExamResult({ result, onRetryWrong, onNew, onOpenChapter }: {
  result: ResultState;
  onRetryWrong: () => void;
  onNew: () => void;
  onOpenChapter: (chapterId: string) => void;
}) {
  const { grade } = result;
  const rows = [...grade.breakdown].sort((a, b) => (a.correct / a.total) - (b.correct / b.total));
  const letter = examGradeLetter(grade.percent);
  const worst = rows[0];
  const dueAfter = grade.wrong.length + grade.unanswered.length;
  return <div className="exam-result">
    <section className="card exam-result-hero">
      <ProgressRing value={grade.percent} size={132}><strong>{bn(grade.percent)}%</strong><span>{bn(grade.score)}/{bn(grade.total)}</span></ProgressRing>
      <div className="exam-result-copy">
        <span className="eyebrow">{t('ফলাফল', 'Result')}</span>
        <h2>{result.title}</h2>
        <p>{t(`সময় লেগেছে ${clock(result.timeTakenSec)} · নির্ধারিত ছিল ${bn(result.durationMin)} মিনিট · ${bn(grade.wrong.length)}টি ভুল · ${bn(grade.unanswered.length)}টি উত্তর দেওয়া হয়নি।`, `Took ${clock(result.timeTakenSec)} of ${result.durationMin} minutes · ${grade.wrong.length} wrong · ${grade.unanswered.length} unanswered.`)}</p>
        <div className="exam-result-chips">
          {result.cadence && <span><AlarmClock size={14} />{t('রুটিন স্লট সম্পন্ন', 'Routine slot closed')}</span>}
          <span className={`exam-grade grade-${letter.replace('+', 'plus').replace('-', 'minus')}`}>{t('আনুমানিক গ্রেড', 'Approx. grade')} <strong>{letter}</strong></span>
          <span><Target size={14} />{grade.total ? `${bn(Math.round(grade.score / grade.total * 100))}% ${t('নির্ভুলতা', 'accuracy')}` : '—'}</span>
          {worst && <span><Flag size={14} />{t('সবচেয়ে দুর্বল', 'Weakest')}: {worst.chapterId ? (chapterById[worst.chapterId]?.title || '—') : subjectById[worst.subject]?.name}</span>}
        </div>
      </div>
      <div className="exam-result-actions">
        {dueAfter ? <p className="tiny-muted">{t(`ভুল ${bn(dueAfter)}টি প্রশ্ন আগামীকাল থেকে পুনরায় তালিকায় ঢুকবে।`, `${dueAfter} wrong question(s) join the retry queue from tomorrow.`)}</p> : null}
        <button className="button primary" onClick={onRetryWrong}><RotateCcw size={16} />{t('ভুল প্রশ্নগুলো আবার', 'Retry the mistakes')}</button>
        <button className="button secondary" onClick={onNew}><Play size={16} />{t('নতুন পরীক্ষা', 'New paper')}</button>
      </div>
    </section>

    <div className="exam-result-grid">
      <section className="card exam-breakdown-card">
        <div className="card-heading"><div><h2><Target size={19} />{t('অধ্যায়ভিত্তিক ফল', 'Result by chapter')}</h2><p>{t('যেখানে নির্ভুলতা কম, সেটাই পরের পড়ার জায়গা।', 'The lowest accuracy is where the next study block goes.')}</p></div></div>
        <div className="exam-breakdown-list">{rows.map(row => {
          const value = percent(row.correct, row.total);
          const chapter = row.chapterId ? chapterById[row.chapterId] : undefined;
          return <div className="exam-breakdown-row" key={row.chapterId || row.subject}>
            <div className="exam-breakdown-title">
              <SubjectBadge subject={row.subject} small />
              <span>{chapter?.title || subjectById[row.subject]?.name}</span>
            </div>
            <ProgressBar value={value} color={value < 50 ? '#b54238' : undefined} />
            <small>{bn(row.correct)}/{bn(row.total)}</small>
            {chapter && <button className="icon-button" aria-label={t('অধ্যায় খুলো', 'Open chapter')} onClick={() => onOpenChapter(chapter.id)}><ChevronRight size={16} /></button>}
          </div>;
        })}</div>
      </section>

      <section className="card exam-wrong-card">
        <div className="card-heading"><div><h2><X size={19} />{t('ভুলের তালিকা', 'What went wrong')}</h2><p>{t('সঠিক উত্তর ও ব্যাখ্যা দেখে নাও; এগুলোই পরের পরীক্ষায় ফিরে আসবে।', 'Check the right answer and the explanation — these return in your next paper.')}</p></div><span className="tiny-muted">{bn(grade.wrong.length + grade.unanswered.length)}</span></div>
        {grade.wrong.length + grade.unanswered.length === 0
          ? <div className="exam-perfect"><CheckCheck size={26} /><strong>{t('সব প্রশ্ন সঠিক! এই অধ্যায়গুলো এখন ঝালাই।', 'Everything correct! Those chapters are sharp now.')}</strong></div>
          : <div className="exam-wrong-list">
            {grade.wrong.map(question => <article className="exam-wrong-row" key={question.id}>
              <strong>{question.question}</strong>
              <p>{t('তোমার উত্তর', 'Your answer')}: <em>{question.options[result.answers[question.id]] ?? '—'}</em></p>
              <p className="correct">{t('সঠিক উত্তর', 'Correct')}: {question.options[question.answer]}</p>
              {question.explanation && <small>{question.explanation}</small>}
              {question.chapterId && <button className="text-button" onClick={() => onOpenChapter(question.chapterId!)}><ChevronRight size={13} />{t('অধ্যায়ে যাও', 'Open chapter')}</button>}
            </article>)}
            {grade.unanswered.map(question => <article className="exam-wrong-row unanswered" key={question.id}>
              <strong>{question.question}</strong>
              <p>{t('উত্তর দেওয়া হয়নি', 'Not answered')} · {t('সঠিক উত্তর', 'Correct')}: {question.options[question.answer]}</p>
              {question.explanation && <small>{question.explanation}</small>}
            </article>)}
          </div>}
      </section>
    </div>
  </div>;
}
