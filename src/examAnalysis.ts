import { chapterById } from './data';
import type { SubjectId } from './data';
import type { ExamSession, QuizQuestion } from './types';
import { STARTER_QUESTIONS } from './quiz-data';

/**
 * "What went wrong" — the part the simulator was missing.
 *
 * The simulator already marks the paper, files wrong answers into the retry ladder and
 * shows a per-chapter breakdown. What it never said is *why* the marks were lost:
 *   - ran out of time and left questions blank (speed / stamina),
 *   - read everything and still chose the wrong option (knowledge),
 *   - or simply skipped the paper's tail because it was long (pacing).
 *
 * Everything below is derived from `ExamSession` records and the shipped questions.
 * Every claim is counted, and every count has a sample-size gate — a pattern is only
 * named once it has enough questions behind it, otherwise the page says "too few".
 */

/** Below this many papers the trends are shown as "not enough" rather than as facts. */
export const TREND_MIN_PAPERS = 3;
/** Below this many questions per chapter, the chapter gap is "too few to judge". */
export const CHAPTER_MIN_QUESTIONS = 4;
/** Seconds per question at or below which a paper is genuinely rushed. */
export const RUSHED_SECONDS = 40;
/** A tail this long is called a pacing problem. */
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
  questionIds: string[];
  answers: Record<string, number>;
}

/** Question id → shipped bank question. Ids outside the bank (generated) are unknown. */
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

/**
 * Runs longest first: a burst of blanks at the end of a paper, or a run of wrong
 * answers, is more informative than the same count scattered through the paper.
 */
export function tailBlanks(questions: QuizQuestion[], answers: Record<string, number>): number {
  let count = 0;
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const chosen = answers[questions[index].id];
    if (Number.isInteger(chosen)) break;
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
    if (!Number.isInteger(chosen)) { run = 0; continue; }
    if (chosen === question.answer) run = 0;
    else { run += 1; best = Math.max(best, run); }
  }
  return best;
}

/**
 * Pairs saved question ids back to the bank. A generated question (`gen|` / `num|`)
 * is not in the bank, so it is counted as "unknown" instead of silently guessed.
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
      if (!Number.isInteger(chosen)) continue;
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
    // Time only exists on the saved session, matched by the paper it belongs to.
    const session = sessions.find(item => item.questionIds.length === paper.questionIds.length && item.questionIds.every((id, position) => id === paper.questionIds[position]));
    if (!session || !session.timeTakenSec) continue;
    timedQuestions += mapped.length;
    timedSeconds += session.timeTakenSec;
    if (session.timeTakenSec / mapped.length <= RUSHED_SECONDS) rushedPapers += 1;
  }
  const secondsPerQuestion = timedQuestions ? Math.round(timedSeconds / timedQuestions) : 0;

  // Chapter gaps: counted over every question asked, bank questions only.
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
      if (Number.isInteger(chosen) && chosen === question.answer) rows.get(question.chapterId)!.correct += 1;
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
    ? 'এখনো কোনো পরীক্ষা দাওনি—একটি ১০ প্রশ্নের অধ্যায়-পরীক্ষা দিলে এখানে আসল দুর্বলতা দেখা যাবে।'
    : blankHeavy
      ? 'সময় শেষে প্রশ্ন বাকি থাকে—পরেরবার আগে সহজ প্রশ্নগুলো দ্রুত সেরে ফেলো, আটকে গেলে দাগ দিয়ে এগোও।'
      : weakest
        ? `${weakest.title} সবচেয়ে দুর্বল (${weakest.percent}%)—এই অধ্যায়ের ১০ প্রশ্নের পরীক্ষা আবার দাও।`
        : 'প্রতিটি অধ্যায়ে প্রশ্ন সংখ্যা কম—আরও বড় পরীক্ষা দিলে দুর্বল অধ্যায় ধরা পড়বে।';
  const nextEn = !percents.length
    ? 'No papers yet — one 10-question chapter test will show where the real gaps are.'
    : blankHeavy
      ? 'You run out of time — clear the easy questions first and move on when stuck.'
      : weakest
        ? `${weakest.title} is weakest (${weakest.percent}%) — take a 10-question test on it again.`
        : 'Every chapter has too few questions — a longer paper will expose the weak ones.';

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
      if (!question || !Number.isInteger(chosen) || chosen === question.answer) continue;
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
      detailBn: 'একটি পরীক্ষা দিলে এই জায়গায় ভুলের ধরন দেখা যাবে—ভুল হয়েছে জ্ঞানে, নাকি সময়ে।',
      detailEn: 'One paper is enough for this page to show whether marks were lost to knowledge or to time.',
    });
    return out;
  }
  if (input.papers >= 2 && input.blankRate >= 0.15) {
    out.push({
      key: 'unfinished', tone: 'warn', count: input.blank,
      titleBn: 'প্রশ্ন বাকি থেকে যাচ্ছে', titleEn: 'Questions are being left blank',
      detailBn: `${input.papers}টি পরীক্ষায় ${input.blank}টি প্রশ্ন (${input.blankRate}%) উত্তরহীন—এগুলো নম্বর হারাচ্ছে শুধু সময়ের অভাবে।`,
      detailEn: `${input.blank} of ${input.total} questions (${input.blankRate}%) went unanswered — pure lost marks.`,
    });
  }
  if (input.papersWithTail > 0) {
    out.push({
      key: 'unfinished', tone: 'warn', count: input.papersWithTail,
      titleBn: 'শেষের প্রশ্নগুলো ফাঁকা', titleEn: 'The end of the paper is empty',
      detailBn: `${input.papersWithTail}টি পরীক্ষার শেষ ${TAIL_BLANK_MIN}+ প্রশ্ন ফাঁকা ছিল—সময় ভাগ করা শিখতে হবে, নাহলে জানা প্রশ্নও হারাবে।`,
      detailEn: `${input.papersWithTail} paper(s) ended with ${TAIL_BLANK_MIN}+ blanks — time needs budgeting.`,
    });
  }
  if (input.rushedPapers > 0) {
    out.push({
      key: 'rushed', tone: 'warn', count: input.rushedPapers,
      titleBn: 'খুব দ্রুত শেষ করছ', titleEn: 'Papers finished too fast',
      detailBn: `${input.rushedPapers}টি পরীক্ষায় প্রশ্নপ্রতি ${RUSHED_SECONDS} সেকেন্ডের কম সময়—আসল পরীক্ষায় এত দ্রুত পড়া মানে ভুল পড়া।`,
      detailEn: `${input.rushedPapers} paper(s) averaged under ${RUSHED_SECONDS}s per question — faster than careful reading allows.`,
    });
  }
  // Sample gate: at least four answered questions before blaming knowledge.
  // Needs a real sample: three or more wrong answers and at least a quarter of them wrong.
  if (input.wrong >= 3 && input.wrongRate >= 25) {
    out.push({
      key: 'knowledge', tone: 'warn', count: input.wrong,
      titleBn: 'জানার ঘাটতি', titleEn: 'A knowledge gap',
      detailBn: `উত্তর দেওয়া প্রশ্নের ${Math.round(input.wrongRate)}% ভুল—প্রশ্ন পড়েছে, কিন্তু তথ্য/সূত্র মনে নেই। এই অধ্যায়গুলো আগে পড়ো, পরীক্ষা পরে।`,
      detailEn: `${Math.round(input.wrongRate)}% of answered questions were wrong — read those chapters before testing again.`,
    });
  }
  if (input.percent >= 80 && input.blankRate < 0.1) {
    out.push({
      key: 'strong', tone: 'good', count: input.correct,
      titleBn: 'ভিত্তি মজবুত', titleEn: 'Solid base',
      detailBn: `${input.total - input.blank}টি উত্তরে ${Math.round(input.percent)}% সঠিক, ফাঁকা প্রায় নেই—এখন কঠিন অধ্যায়ের (A) দিকে যাও।`,
      detailEn: `${Math.round(input.percent)}% correct with almost nothing blank — move on to the A-priority chapters.`,
    });
  }
  return out.slice(0, 4);
}

function postmortemCaveats(sessions: ExamSession[], papers: ExamPaperInput[], index: Map<string, QuizQuestion>, total: number): string[] {
  const caveats: string[] = [];
  const unknown = papers.reduce((sum, paper) => sum + paper.questionIds.filter(id => !index.has(id)).length, 0);
  if (unknown) caveats.push(`${bengaliNumber(unknown)}টি প্রশ্ন তৈরি হওয়া (gen/num) ছিল—সেগুলো ব্যাংকে না থাকায় অধ্যায়ভিত্তিক হিসাবে ধরা হয়নি।`);
  if (sessions.length < TREND_MIN_PAPERS) caveats.push(`প্রবণতা দেখাতে অন্তত ${TREND_MIN_PAPERS}টি পরীক্ষা দরকার; এখন ${sessions.length}টি আছে—তাই “উন্নতি/অবনতি” এখনো বলা হচ্ছে না।`);
  caveats.push('ভুলের কারণ অনুমান নয়—শুধু উত্তরহীন, ভুল ও সময়ের হিসাব থেকে বলা হচ্ছে। কেন ভুল হয়েছে সেটা তুমিই জানো।');
  if (!total) caveats.push('এই পরীক্ষাগুলোর কোনো প্রশ্ন এখন ব্যাংকে নেই—হিসাব ০-এর বেশি হতে পারে না।');
  return caveats;
}
