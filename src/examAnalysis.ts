import { chapterById } from './data';
import type { SubjectId } from './data';
import type { ExamSession, QuizQuestion } from './types';
import { STARTER_QUESTIONS } from './quiz-data';

/**
 * Describe recorded blanks, wrong answers, elapsed time and chapter samples.
 * A saved answer sheet cannot establish why an answer was wrong, whether the
 * student ran out of time, or whether a high score establishes exam readiness.
 * Suggestions are therefore bounded to the measured sample, not diagnoses.
 * Retained generated/custom definitions are supported alongside the shipped bank.
 */

/** Below this many papers the trends are shown as "not enough" rather than as facts. */
export const TREND_MIN_PAPERS = 3;
/** Below this many questions per chapter, the chapter gap is "too few to judge". */
export const CHAPTER_MIN_QUESTIONS = 4;
/** A descriptive short-time threshold, not evidence of careless reading.
 * The legacy "rushed" key is retained for callers; user-facing copy is neutral. */
export const RUSHED_SECONDS = 40;
/** A blank tail this long is reported for review, not diagnosed as a pacing problem. */
export const TAIL_BLANK_MIN = 3;

export interface ExamGapRow {
  chapterId: string;
  title: string;
  subject: SubjectId;
  asked: number;
  correct: number;
  /** Percentage of the asked questions answered correctly. */
  percent: number;
  /** False when asked < CHAPTER_MIN_QUESTIONS: reported, but not called weak. */
  judged: boolean;
  /** A question from this chapter is available to practise right now. */
  practiceable: boolean;
}

export interface MistakePattern {
  key: 'rushed' | 'unfinished' | 'knowledge' | 'careless' | 'strong';
  tone: 'warn' | 'good' | 'info';
  /** How many questions/papers support this line. */
  count: number;
  titleBn: string;
  titleEn: string;
  detailBn: string;
  detailEn: string;
}

export interface ExamTrend {
  papers: number;
  /** Papers in the same order they were taken, oldest first. */
  percents: number[];
  average: number;
  firstHalf: number;
  secondHalf: number;
  /** Percentage-points change between the two halves. */
  change: number;
  best: number;
  worst: number;
  /** True once there are enough papers to describe a trend. */
  enough: boolean;
}

export interface ExamPostmortem {
  papers: number;
  questions: number;
  answered: number;
  blank: number;
  blankRate: number;
  wrong: number;
  wrongRate: number;
  correct: number;
  percent: number;
  /** How many papers ended with an unanswered tail of >= TAIL_BLANK_MIN questions. */
  papersWithTail: number;
  /** Papers where seconds per question was at or below RUSHED_SECONDS. */
  rushedPapers: number;
  /** Seconds spent per question, from real timeTakenSec over the actual question ids. */
  secondsPerQuestion: number;
  patterns: MistakePattern[];
  gaps: ExamGapRow[];
  trend: ExamTrend;
  /** The single next thing to do, tied to the numbers above. */
  nextBn: string;
  nextEn: string;
  caveats: string[];
}

export interface ExamPaperInput {
  /** Match timing by stable session identity, not a reused question order. */
  id?: string;
  questionIds: string[];
  answers: Record<string, number>;
}

/** Question id → retained definition. The default is the shipped bank; callers
 * analysing generated/custom papers supply their retained definitions as well. */
export function questionIndex(bank: QuizQuestion[] = STARTER_QUESTIONS): Map<string, QuizQuestion> {
  const index = new Map<string, QuizQuestion>();
  for (const question of bank) index.set(question.id, question);
  return index;
}

export const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** Bengali digits for prose. Percent numbers stay Latin because they are read as data. */
export function bengaliNumber(value: number | string): string {
  return String(value).replace(/\d/g, digit => BN_DIGITS[Number(digit)]);
}

function bengaliPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Median of a list; kept here because the gap sheet reports spread, not just average. */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const validSelection = (chosen: unknown): chosen is number => typeof chosen === 'number' && Number.isInteger(chosen) && chosen >= 0 && chosen <= 3;

/**
 * Runs longest first: a burst of blanks at the end of a paper, or a run of wrong
 * answers, is more informative than the same count scattered through the paper.
 */
export function tailBlanks(questions: QuizQuestion[], answers: Record<string, number>): number {
  let count = 0;
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const chosen = answers[questions[index].id];
    if (validSelection(chosen)) break;
    count += 1;
  }
  return count;
}

/** Longest run of consecutive wrong answers in the paper, in question order. */
export function longestWrongRun(questions: QuizQuestion[], answers: Record<string, number>): number {
  let best = 0;
  let run = 0;
  for (const question of questions) {
    const chosen = answers[question.id];
    if (!validSelection(chosen)) { run = 0; continue; }
    if (chosen === question.answer) run = 0;
    else { run += 1; best = Math.max(best, run); }
  }
  return best;
}

/**
 * Pairs saved question ids back to the supplied definitions. Callers include
 * retained generated/custom questions; genuinely missing definitions remain
 * explicitly uncounted rather than having an invented answer or chapter.
 */
export function examPostmortem(sessions: ExamSession[], papers: ExamPaperInput[] = sessions, index = questionIndex()): ExamPostmortem {
  const ordered = [...sessions].sort((a, b) => a.at.localeCompare(b.at));
  const questions: QuizQuestion[] = [];
  for (const paper of papers) {
    for (const id of paper.questionIds) {
      const question = index.get(id);
      if (question) questions.push(question);
    }
  }

  let answered = 0;
  let correct = 0;
  for (const paper of papers) {
    for (const id of paper.questionIds) {
      const question = index.get(id);
      if (!question) continue;
      const chosen = paper.answers[id];
      if (!validSelection(chosen)) continue;
      answered += 1;
      if (chosen === question.answer) correct += 1;
    }
  }

  const total = questions.length;
  const wrong = Math.max(0, answered - correct);
  const blank = Math.max(0, total - answered);

  let papersWithTail = 0;
  let rushedPapers = 0;
  let timedQuestions = 0;
  let timedSeconds = 0;
  for (const paper of papers) {
    const mapped = paper.questionIds.map(id => index.get(id)).filter((item): item is QuizQuestion => !!item);
    if (!mapped.length) continue;
    if (tailBlanks(mapped, paper.answers) >= TAIL_BLANK_MIN) papersWithTail += 1;
    // A retry can use the identical question order but a different elapsed time.
    // For legacy id-less inputs, use timing only when the match is unambiguous.
    const candidates = paper.id ? sessions.filter(item => item.id === paper.id) : sessions.filter(item => item.questionIds.length === paper.questionIds.length && item.questionIds.every((id, position) => id === paper.questionIds[position]));
    const session = candidates.length === 1 ? candidates[0] : undefined;
    if (!session || !Number.isFinite(session.timeTakenSec) || session.timeTakenSec < 0) continue;
    timedQuestions += paper.questionIds.length;
    timedSeconds += session.timeTakenSec;
    if (session.timeTakenSec / paper.questionIds.length <= RUSHED_SECONDS) rushedPapers += 1;
  }
  const secondsPerQuestion = timedQuestions ? Math.round(timedSeconds / timedQuestions) : 0;

  // Chapter samples include all questions with retained definitions.
  const rows = new Map<string, { asked: number; correct: number }>();
  for (const question of questions) {
    if (!question.chapterId) continue;
    const row = rows.get(question.chapterId) ?? { asked: 0, correct: 0 };
    row.asked += 1;
    rows.set(question.chapterId, row);
  }
  for (const paper of papers) {
    for (const id of paper.questionIds) {
      const question = index.get(id);
      if (!question?.chapterId) continue;
      const chosen = paper.answers[id];
      if (validSelection(chosen) && chosen === question.answer) rows.get(question.chapterId)!.correct += 1;
    }
  }
  const gaps: ExamGapRow[] = [...rows.entries()]
    .map(([chapterId, row]) => {
      const meta = chapterById[chapterId];
      return {
        chapterId,
        title: meta?.title ?? chapterId,
        subject: (meta?.subject ?? 'physics') as SubjectId,
        asked: row.asked,
        correct: row.correct,
        percent: bengaliPercent(row.correct / Math.max(1, row.asked) * 100),
        judged: row.asked >= CHAPTER_MIN_QUESTIONS,
        practiceable: !!meta,
      };
    })
    .sort((a, b) => Number(b.judged) - Number(a.judged) || a.percent - b.percent || b.asked - a.asked)
    .slice(0, 40);

  const percents = ordered.map(session => bengaliPercent(session.total ? session.score / session.total * 100 : 0));
  const half = Math.floor(percents.length / 2);
  const meanOf = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const firstHalf = meanOf(percents.slice(0, half));
  const secondHalf = meanOf(percents.slice(half));
  const trend: ExamTrend = {
    papers: percents.length,
    percents,
    average: meanOf(percents),
    firstHalf,
    secondHalf,
    change: percents.length >= 2 ? secondHalf - firstHalf : 0,
    best: percents.length ? Math.max(...percents) : 0,
    worst: percents.length ? Math.min(...percents) : 0,
    enough: percents.length >= TREND_MIN_PAPERS,
  };

  const patterns = mistakePatterns({ total, correct, blank, blankRate: total ? blank / total : 0, wrong, wrongRate: answered ? wrong / answered * 100 : 0, percent: total ? correct / total * 100 : 0, papers: percents.length, papersWithTail, rushedPapers, secondsPerQuestion });
  const judged = gaps.filter(row => row.judged);
  // Only chapters with enough questions behind them may be called weakest.
  const weakest = judged[0];
  const blankHeavy = blank / Math.max(1, total) >= 0.15;
  const nextBn = !percents.length
    ? 'এখনো কোনো পরীক্ষা দাওনি—একটি ১০ প্রশ্নের অধ্যায়-পরীক্ষা দিলে প্রথম নমুনার ফল দেখা যাবে।'
    : blankHeavy
      ? 'কিছু প্রশ্ন উত্তরহীন—পরেরবার আগে সহজ প্রশ্নগুলো শেষ করো, আটকে গেলে এগিয়ে পরে ফিরে এসো।'
      : weakest
        ? `${weakest.title}: এই নমুনায় সর্বনিম্ন নির্ভুলতা (${weakest.percent}%)—ব্যাখ্যা দেখে এই অধ্যায়ে আবার অনুশীলন করো।`
        : 'প্রতিটি অধ্যায়ে প্রশ্ন সংখ্যা কম—আরও বড় পরীক্ষা দিয়ে নমুনা বাড়াও।';
  const nextEn = !percents.length
    ? 'No papers yet — a 10-question chapter test will provide a first sample.'
    : blankHeavy
      ? 'Some questions are unanswered — try the easier ones first, then return to skipped questions.'
      : weakest
        ? `${weakest.title}: lowest measured accuracy in this sample (${weakest.percent}%) — review the explanations and practise this chapter again.`
        : 'Too few questions per chapter — build a larger sample before judging chapter gaps.';

  return {
    papers: percents.length,
    questions: total,
    answered,
    blank,
    blankRate: bengaliPercent(blank / Math.max(1, total) * 100),
    wrong,
    wrongRate: bengaliPercent(wrong / Math.max(1, answered) * 100),
    correct,
    percent: bengaliPercent(correct / Math.max(1, total) * 100),
    papersWithTail,
    rushedPapers,
    secondsPerQuestion,
    patterns,
    gaps,
    trend,
    nextBn,
    nextEn,
    caveats: postmortemCaveats(sessions, papers, index, total),
  };
}

/** How many times the same wrong option was chosen — a sign of a mixed-up pair, not ignorance. */
export function repeatedWrongOption(sessions: ExamSession[], papers: ExamPaperInput[] = sessions, index = questionIndex()): number {
  let repeats = 0;
  const seen = new Map<string, number>();
  for (const paper of papers) {
    for (const id of paper.questionIds) {
      const question = index.get(id);
      const chosen = paper.answers[id];
      if (!question || !validSelection(chosen) || chosen === question.answer) continue;
      const key = `${id}:${chosen}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  for (const count of seen.values()) if (count >= 2) repeats += 1;
  return repeats;
}

function mistakePatterns(input: {
  total: number; correct: number; blank: number; blankRate: number; wrong: number; wrongRate: number; percent: number;
  papers: number; papersWithTail: number; rushedPapers: number; secondsPerQuestion: number;
}): MistakePattern[] {
  const out: MistakePattern[] = [];
  if (!input.papers) {
    out.push({
      key: 'strong', tone: 'info', count: 0,
      titleBn: 'এখনো কোনো তথ্য নেই', titleEn: 'Nothing measured yet',
      detailBn: 'একটি পরীক্ষা দিলে উত্তরহীন প্রশ্ন, ভুল ও সময়ের হিসাব দেখানো হবে—এটি ভুলের কারণ নির্ণয় নয়।',
      detailEn: 'A paper will show recorded blanks, wrong answers and time, not diagnose their cause.',
    });
    return out;
  }
  if (input.papers >= 2 && input.blankRate >= 0.15) {
    out.push({
      key: 'unfinished', tone: 'warn', count: input.blank,
      titleBn: 'প্রশ্ন বাকি থেকে যাচ্ছে', titleEn: 'Questions are being left blank',
      detailBn: `${input.papers}টি পরীক্ষায় ${input.blank}টি প্রশ্ন (${Math.round(input.blankRate * 100)}%) উত্তরহীন—আগে সহজ প্রশ্ন শেষ করো, তারপর বাদ পড়া প্রশ্নগুলোয় ফিরো।`,
      detailEn: `${input.blank} of ${input.total} questions (${Math.round(input.blankRate * 100)}%) went unanswered — finish the easier questions first, then return to skipped ones.`,
    });
  }
  if (input.papersWithTail > 0) {
    out.push({
      key: 'unfinished', tone: 'warn', count: input.papersWithTail,
      titleBn: 'শেষের প্রশ্নগুলো ফাঁকা', titleEn: 'The end of the paper is empty',
      detailBn: `${input.papersWithTail}টি পরীক্ষার শেষ ${TAIL_BLANK_MIN}+ প্রশ্ন ফাঁকা ছিল—কেন বাদ পড়েছে দেখে পরেরবার প্রশ্নের ক্রম বা সময় ভাগ বদলাবে কি না ঠিক করো।`,
      detailEn: `${input.papersWithTail} paper(s) ended with ${TAIL_BLANK_MIN}+ blanks — review why they were skipped before changing your pacing.`,
    });
  }
  if (input.rushedPapers > 0) {
    out.push({
      key: 'rushed', tone: 'warn', count: input.rushedPapers,
      titleBn: 'কম সময় রেকর্ড হয়েছে', titleEn: 'Short recorded time',
      detailBn: `${input.rushedPapers}টি পরীক্ষায় প্রশ্নপ্রতি গড় সময় ${RUSHED_SECONDS} সেকেন্ড বা কম—এটি ভুল পড়ার প্রমাণ নয়; জমার আগে উত্তরগুলো যাচাই করতে পারো।`,
      detailEn: `${input.rushedPapers} paper(s) averaged ${RUSHED_SECONDS}s or less per paper question — this alone does not show careless reading; consider checking answers before submitting.`,
    });
  }
  // Review multiple wrong answers, but do not infer their cognitive cause.
  // Keep the legacy pattern key for callers without presenting it as a diagnosis.
  if (input.wrong >= 3 && input.wrongRate >= 25) {
    out.push({
      key: 'knowledge', tone: 'warn', count: input.wrong,
      titleBn: 'ভুল উত্তরগুলো দেখো', titleEn: 'Review wrong answers',
      detailBn: `উত্তর দেওয়া প্রশ্নের ${Math.round(input.wrongRate)}% ভুল—শুধু এই সংখ্যা ভুলের কারণ প্রমাণ করে না। ব্যাখ্যা মিলিয়ে দেখো এবং যেখানে দরকার পড়ে নাও।`,
      detailEn: `${Math.round(input.wrongRate)}% of answered questions were wrong — this does not establish why. Review the explanations and revisit relevant material if needed.`,
    });
  }
  if (input.percent >= 80 && input.blankRate < 0.1) {
    out.push({
      key: 'strong', tone: 'good', count: input.correct,
      titleBn: 'এই নমুনায় ভালো স্কোর', titleEn: 'High score in this sample',
      detailBn: `${input.total}টি প্রশ্নের ${Math.round(input.percent)}% সঠিক, ${input.blank}টি উত্তরহীন—এটি প্রস্তুতির নিশ্চয়তা নয়; ভিন্ন প্রশ্নেও অনুশীলন চালাও।`,
      detailEn: `${Math.round(input.percent)}% of ${input.total} questions correct, ${input.blank} unanswered — not a readiness guarantee; keep practising with different questions.`,
    });
  }
  return out.slice(0, 4);
}

function postmortemCaveats(sessions: ExamSession[], papers: ExamPaperInput[], index: Map<string, QuizQuestion>, total: number): string[] {
  const caveats: string[] = [];
  const unknown = papers.reduce((sum, paper) => sum + paper.questionIds.filter(id => !index.has(id)).length, 0);
  if (unknown) caveats.push(`${bengaliNumber(unknown)}টি প্রশ্নের সংরক্ষিত সংজ্ঞা পাওয়া যায়নি—সেগুলোর উত্তর বা অধ্যায় অনুমান করে হিসাবে যোগ করা হয়নি।`);
  if (sessions.length < TREND_MIN_PAPERS) caveats.push(`প্রবণতা দেখাতে অন্তত ${TREND_MIN_PAPERS}টি পরীক্ষা দরকার; এখন ${sessions.length}টি আছে—তাই “উন্নতি/অবনতি” এখনো বলা হচ্ছে না।`);
  caveats.push('ভুলের কারণ অনুমান নয়—শুধু উত্তরহীন, ভুল ও সময়ের হিসাব থেকে বলা হচ্ছে। কেন ভুল হয়েছে সেটা তুমিই জানো।');
  if (!total) caveats.push('এই পরীক্ষাগুলোর কোনো প্রশ্ন এখন ব্যাংকে নেই—হিসাব ০-এর বেশি হতে পারে না।');
  return caveats;
}
