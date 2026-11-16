import { chapterById, subjectById } from './data';
import type { SubjectId } from './data';
import { recordMcqAnswer } from './mistakeRevision';
import { addDays } from './planner';
import type { AppData } from './planner';
import { STARTER_QUESTIONS } from './quiz-data';
import { generateQuestions } from './questionGen';
import { numericQuestions } from './numericGen';
import { applyRetryResults, dueRetryIds, enqueueRetries, retryBuckets } from './retryLoop';
import { LIMITS, newId, nowIso } from './storage';
import type { ExamBreakdownRow, ExamCadence, ExamMode, ExamSession, QuizQuestion, TestKind } from './types';

/**
 * The exam simulator: a real timed paper built from the local question bank,
 * auto-marked the moment it is submitted. Nothing here needs a server or an API —
 * every number is computed from the student's own progress.
 *
 * Two deliberate choices:
 *  - A third of the paper is filled with questions the student previously got wrong
 *    (or ran out of time on), so mistakes keep coming back. Questions that are due on
 *    the spaced retry ladder are picked first.
 *  - Every answer is fed through `recordMcqAnswer`, which already updates the mistake
 *    book, the weak-chapter flags and tomorrow's revision card.
 */

export const EXAM_SECONDS_PER_QUESTION = 60;
export const EXAM_COUNTS = [10, 20, 25, 30, 50] as const;

export const EXAM_MODE_INFO: Record<ExamMode, { label: string; labelEn: string; hint: string; hintEn: string }> = {
  chapter: { label: 'অধ্যায় পরীক্ষা', labelEn: 'Chapter test', hint: 'এক অধ্যায়ের MCQ, সময় ধরে।', hintEn: 'One chapter, against the clock.' },
  subject: { label: 'বিষয় পরীক্ষা', labelEn: 'Subject test', hint: 'পত্রের সব অধ্যায় মিশিয়ে।', hintEn: 'All chapters of one paper.' },
  full: { label: 'পূর্ণ মক টেস্ট', labelEn: 'Full mock test', hint: 'সব বিষয় মিশিয়ে, বোর্ডের মতো।', hintEn: 'Mixed subjects, like the board paper.' },
  mistakes: { label: 'ভুলের পরীক্ষা', labelEn: 'Mistake test', hint: 'শুধু যেগুলো আগে ভুল করেছ।', hintEn: 'Only the questions you got wrong before.' },
  retry: { label: 'আজকের পুনরায়', labelEn: 'Today’s retries', hint: 'স্পেসড ল্যাডারে যেগুলো আজ ফেরত পাওয়ার কথা।', hintEn: 'Questions the spaced ladder says are due today.' },
};

export interface ExamOptions {
  mode: ExamMode;
  subject?: SubjectId;
  chapterId?: string;
  /** Desired number of questions; clamped to the pool size. */
  count: number;
  /** Today, needed by the retry mode to know which questions are due. */
  today?: string;
  /** Kept for callers that only know the storage date. */
  date?: string;
  /**
   * Top up a short pool with rule-based questions generated from the same verified
   * textbook facts. Off by default so pure-bank behaviour stays testable.
   */
  generate?: boolean;
  /** Variety seed for generated items (the UI passes a per-paper counter). */
  variant?: string | number;
}

export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Latest answer per question: `false` means the student's most recent attempt was wrong. */
export function latestAnswers(data: AppData): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const attempt of data.attempts) map.set(attempt.questionId, attempt.correct);
  return map;
}

/** Ids whose most recent answer was wrong — the retry pool for every paper. */
export function wrongQuestionIds(data: AppData): Set<string> {
  const wrong = new Set<string>();
  for (const [id, correct] of latestAnswers(data)) if (!correct) wrong.add(id);
  return wrong;
}

/**
 * The pool a paper is built from.
 *
 * `generate` only ever *adds* rule-based items for chapters that already have verified
 * facts; it never invents a chapter, a fact or an answer, and the generated items go
 * through `verifyGenerated` before they are used (see `generatedPool`).
 */
export function examPool(data: AppData, options: ExamOptions): QuizQuestion[] {
  const all = [...STARTER_QUESTIONS, ...data.questions, ...(options.generate ? generatedPool(options) : [])];
  switch (options.mode) {
    case 'chapter':
      return options.chapterId ? all.filter(question => question.chapterId === options.chapterId) : [];
    case 'subject':
      return options.subject ? all.filter(question => question.subject === options.subject) : all;
    case 'mistakes': {
      const wrong = latestAnswers(data);
      return all.filter(question => wrong.get(question.id) === false);
    }
    case 'retry': {
      // Only questions the ladder says are due today — that is what makes this a "today" paper.
      const today = options.today || options.date || '';
      const due = new Set(retryBuckets(data, today).due.map(item => item.questionId));
      return all.filter(question => due.has(question.id));
    }
    default:
      return all;
  }
}

/**
 * Generated items for exactly the chapter/subject the paper asks for.
 *
 * Two engines feed this: fact-based items (`questionGen`) and computed numeric drills
 * (`numericGen`). Both are verifiable — the fact engine against the shipped bank, the
 * numeric engine by recomputing the arithmetic from the same seed.
 */
function generatedPool(options: ExamOptions): QuizQuestion[] {
  const variant = options.variant ?? 0;
  const forChapter = (chapterId: string): QuizQuestion[] => [
    ...generateQuestions(chapterId, { variant }),
    ...numericQuestions(chapterId, 4).map(built => built.question),
  ];
  if (options.mode === 'chapter') return options.chapterId ? forChapter(options.chapterId) : [];
  if (options.mode === 'subject') {
    if (!options.subject) return [];
    return chapterIdsForSubject(options.subject).flatMap(forChapter);
  }
  return [];
}

function chapterIdsForSubject(subject: SubjectId): string[] {
  return [...new Set(STARTER_QUESTIONS.filter(question => question.subject === subject && question.chapterId).map(question => question.chapterId!))];
}

/** Round-robin across subjects so a full mock does not become a single-subject quiz. */
function spreadBySubject(items: QuizQuestion[], count: number, rng: Rng): QuizQuestion[] {
  const groups = new Map<SubjectId, QuizQuestion[]>();
  for (const question of items) {
    const list = groups.get(question.subject) || [];
    list.push(question);
    groups.set(question.subject, list);
  }
  const queues = [...groups.values()].map(group => shuffle(group, rng));
  const picked: QuizQuestion[] = [];
  let progress = true;
  while (picked.length < count && progress) {
    progress = false;
    for (const queue of queues) {
      if (picked.length >= count) break;
      const next = queue.shift();
      if (next) {
        picked.push(next);
        progress = true;
      }
    }
  }
  return picked;
}

/**
 * Builds one paper. With the default injectable RNG this is deterministic for tests;
 * the screen passes `Math.random` so every exam is a fresh paper.
 */
export function buildExamQuestions(data: AppData, options: ExamOptions, rng: Rng = Math.random): QuizQuestion[] {
  const pool = examPool(data, options);
  if (!pool.length) return [];
  const count = Math.max(1, Math.min(Math.round(options.count) || 1, Math.min(pool.length, 200)));
  const wrong = wrongQuestionIds(data);
  // Due questions (spaced ladder) come first; the rest of the quota is filled by any old mistake.
  const due = new Set(options.mode === 'retry' ? [] : dueRetryIds(data, options.today || options.date || ''));
  const previous = pool.filter(question => wrong.has(question.id));
  const retryQuota = options.mode === 'mistakes' || options.mode === 'retry' ? count : Math.min(Math.floor(count / 3), previous.length);
  const dueFirst = shuffle(previous.filter(question => due.has(question.id)), rng);
  const olderFirst = shuffle(previous.filter(question => !due.has(question.id)), rng);
  const picked = [...dueFirst, ...olderFirst].slice(0, retryQuota);
  const taken = new Set(picked.map(question => question.id));
  const remaining = count - picked.length;
  if (remaining <= 0) return picked;
  const rest = pool.filter(question => !taken.has(question.id));
  const filler = options.mode === 'full'
    ? spreadBySubject(rest, remaining, rng)
    : shuffle(rest, rng).slice(0, remaining);
  return [...picked, ...filler];
}

/** One minute per MCQ, rounded up, never below five minutes. */
export function examDurationMin(questionCount: number): number {
  return Math.max(5, Math.ceil(Math.max(0, questionCount) * EXAM_SECONDS_PER_QUESTION / 60));
}

export interface ExamGrade {
  score: number;
  total: number;
  percent: number;
  wrong: QuizQuestion[];
  unanswered: QuizQuestion[];
  breakdown: ExamBreakdownRow[];
}

/** Pure marking: no state, no side effects. */
export function gradeExam(questions: QuizQuestion[], answers: Record<string, number>): ExamGrade {
  const wrong: QuizQuestion[] = [];
  const unanswered: QuizQuestion[] = [];
  const rows = new Map<string, ExamBreakdownRow>();
  let score = 0;
  for (const question of questions) {
    const chosen = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
    const answered = typeof chosen === 'number' && Number.isInteger(chosen) && chosen >= 0 && chosen <= 3;
    const correct = answered && chosen === question.answer;
    if (correct) score++;
    else if (answered) wrong.push(question);
    else unanswered.push(question);
    const key = question.chapterId ? `c:${question.chapterId}` : `s:${question.subject}`;
    const row = rows.get(key) || { ...(question.chapterId ? { chapterId: question.chapterId } : {}), subject: question.subject, correct: 0, total: 0 };
    row.total++;
    if (correct) row.correct++;
    rows.set(key, row);
  }
  const total = questions.length;
  return {
    score,
    total,
    percent: total ? Math.round(score / total * 100) : 0,
    wrong,
    unanswered,
    breakdown: [...rows.values()],
  };
}

/** HSC-style letter grade for an MCQ percentage — labelled as approximate in the UI. */
export function examGradeLetter(percent: number): 'A+' | 'A' | 'A-' | 'B' | 'C' | 'D' | 'F' {
  if (percent >= 80) return 'A+';
  if (percent >= 70) return 'A';
  if (percent >= 60) return 'A-';
  if (percent >= 50) return 'B';
  if (percent >= 40) return 'C';
  if (percent >= 33) return 'D';
  return 'F';
}

export interface SaveExamInput {
  mode: ExamMode;
  title: string;
  subject?: SubjectId;
  questions: QuizQuestion[];
  answers: Record<string, number>;
  durationMin: number;
  timeTakenSec: number;
  date: string;
  /** set when the paper was started from the daily/weekly/monthly routine. */
  cadence?: ExamCadence;
}

const TEST_KIND: Record<ExamMode, TestKind> = { chapter: 'chapter', subject: 'subject', full: 'model', mistakes: 'model', retry: 'chapter' };

/**
 * Stores the result and folds every answered question into the existing study loop
 * (attempt history → mistake book → weak chapter → tomorrow's revision card).
 * Returns the data unchanged when there is nothing to save.
 */
export function saveExamSession(data: AppData, input: SaveExamInput): AppData {
  if (!input.questions.length) return data;
  const grade = gradeExam(input.questions, input.answers);
  const at = nowIso();
  let afterAnswers = data;
  const paperAnswers: { questionId: string; correct: boolean }[] = [];
  for (const question of input.questions) {
    const chosen = input.answers[question.id];
    if (!Number.isInteger(chosen) || chosen < 0 || chosen > 3) continue;
    afterAnswers = recordMcqAnswer(afterAnswers, question, chosen, input.date);
    paperAnswers.push({ questionId: question.id, correct: chosen === question.answer });
  }
  const chapterIds = [...new Set(input.questions.map(question => question.chapterId).filter((id): id is string => !!id))].slice(0, 40);
  // Settle questions that were already owed BEFORE queueing this paper's fresh mistakes,
  // otherwise a new wrong answer would be settled twice and lose its ladder.
  const settledRetries = applyRetryResults(afterAnswers, paperAnswers, input.date);
  const settled = enqueueRetries(settledRetries, {
    source: input.title,
    date: input.date,
    wrong: grade.wrong.map(question => ({ id: question.id, subject: question.subject, ...(question.chapterId ? { chapterId: question.chapterId } : {}) })),
    unanswered: grade.unanswered.map(question => ({ id: question.id, subject: question.subject, ...(question.chapterId ? { chapterId: question.chapterId } : {}) })),
  });
  const session: ExamSession = {
    id: newId(),
    mode: input.mode,
    title: input.title.slice(0, 200),
    ...(input.subject ? { subject: input.subject } : {}),
    chapterIds,
    questionIds: input.questions.map(question => question.id),
    answers: Object.fromEntries(input.questions
      .filter(question => Number.isInteger(input.answers[question.id]) && input.answers[question.id] >= 0 && input.answers[question.id] <= 3)
      .map(question => [question.id, input.answers[question.id]])),
    score: grade.score,
    total: grade.total,
    durationMin: Math.max(1, Math.round(input.durationMin)),
    timeTakenSec: Math.max(0, Math.round(input.timeTakenSec)),
    date: input.date,
    at,
    breakdown: grade.breakdown,
    ...(input.cadence ? { cadence: input.cadence } : {}),
  };
  const weakest = [...grade.breakdown]
    .filter(row => row.total > 0)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
  const weakestTitle = weakest?.chapterId ? chapterById[weakest.chapterId]?.title : weakest ? subjectById[weakest.subject]?.name : undefined;
  const notes = [
    `সিমুলেটর · ${grade.score}/${grade.total} (${grade.percent}%)`,
    grade.unanswered.length ? `${grade.unanswered.length}টি উত্তর দেওয়া হয়নি` : 'সব প্রশ্নের উত্তর দেওয়া হয়েছে',
    weakestTitle && weakest && weakest.correct / weakest.total < 0.7 ? `দুর্বল: ${weakestTitle}` : '',
  ].filter(Boolean).join(' · ').slice(0, 5000);
  const record = {
    id: session.id,
    kind: TEST_KIND[input.mode],
    title: session.title,
    ...(input.subject ? { subject: input.subject } : {}),
    chapterIds,
    score: grade.score,
    total: grade.total,
    durationMin: session.durationMin,
    date: input.date,
    at,
    notes,
  };
  return {
    ...settled,
    examSessions: [...settled.examSessions, session].slice(-LIMITS.examSessions),
    tests: [...settled.tests, record].slice(-LIMITS.tests),
  };
}

export interface ExamHistoryStats {
  count: number;
  average: number;
  best: number;
  latest: number | null;
  /** Last three papers minus the three before them, in percentage points. */
  trend: number | null;
  totalQuestions: number;
  totalCorrect: number;
}

export function examHistoryStats(sessions: ExamSession[]): ExamHistoryStats {
  const list = sessions.filter(session => session.total > 0);
  const pct = (session: ExamSession) => Math.round(session.score / session.total * 100);
  const average = list.length ? Math.round(list.reduce((sum, session) => sum + pct(session), 0) / list.length) : 0;
  const recent = list.slice(-3).map(pct);
  const earlier = list.slice(-6, -3).map(pct);
  const trend = recent.length && earlier.length
    ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) - Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length)
    : null;
  return {
    count: list.length,
    average,
    best: list.reduce((best, session) => Math.max(best, pct(session)), 0),
    latest: list.length ? pct(list[list.length - 1]) : null,
    trend,
    totalQuestions: list.reduce((sum, session) => sum + session.total, 0),
    totalCorrect: list.reduce((sum, session) => sum + session.score, 0),
  };
}

export interface ExamChapterAccuracy { chapterId?: string; subject: SubjectId; correct: number; total: number; percent: number }

/** Aggregates every stored paper's chapter snapshot — the simulator's weakness detector. */
export function examChapterAccuracy(sessions: ExamSession[]): ExamChapterAccuracy[] {
  const rows = new Map<string, ExamChapterAccuracy>();
  for (const session of sessions) {
    for (const row of session.breakdown) {
      const key = row.chapterId ? `c:${row.chapterId}` : `s:${row.subject}`;
      const target = rows.get(key) || { ...(row.chapterId ? { chapterId: row.chapterId } : {}), subject: row.subject, correct: 0, total: 0, percent: 0 };
      target.correct += row.correct;
      target.total += row.total;
      rows.set(key, target);
    }
  }
  return [...rows.values()]
    .map(row => ({ ...row, percent: row.total ? Math.round(row.correct / row.total * 100) : 0 }))
    .filter(row => row.total > 0)
    .sort((a, b) => a.percent - b.percent || b.total - a.total);
}

/** The questions to re-test after a paper: wrong ones first, then the unattempted ones. */
export function retryQuestionIds(grade: ExamGrade): string[] {
  return [...grade.wrong, ...grade.unanswered].map(question => question.id);
}

/** Date the next weekly mock is suggested for, based on the last stored paper. */
export function nextMockDate(sessions: ExamSession[], today: string): string {
  const last = [...sessions].map(session => session.date).sort().at(-1);
  if (!last) return today;
  const candidate = addDays(last, 7);
  return candidate > today ? candidate : today;
}
