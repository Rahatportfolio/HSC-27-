import { describe, expect, it } from 'vitest';
import {
  CHAPTER_MIN_QUESTIONS, RUSHED_SECONDS, TAIL_BLANK_MIN, TREND_MIN_PAPERS,
  examPostmortem, longestWrongRun, questionIndex, repeatedWrongOption, tailBlanks,
} from './examAnalysis';
import { STARTER_QUESTIONS } from './quiz-data';
import type { ExamSession, QuizQuestion } from './types';
import { chapterById } from './data';

const index = questionIndex();
/** A chapter that genuinely has ten or more banked questions (chemistry-1-3 has 11). */
const CHAPTER = 'chemistry-1-3';
const pool = STARTER_QUESTIONS.filter(question => question.chapterId === CHAPTER);
const ten = pool.slice(0, 10);

const session = (overrides: Partial<ExamSession> = {}): ExamSession => ({
  id: overrides.id ?? 's1', mode: 'chapter', title: 'টেস্ট', chapterIds: [CHAPTER],
  questionIds: ten.map(question => question.id), answers: {}, score: 0, total: ten.length,
  durationMin: 10, timeTakenSec: 300, date: '2026-11-16', at: '2026-11-16T10:00:00.000Z',
  breakdown: [], ...overrides,
});

/** Answer every question correctly, then break the ones at the given positions. */
const answersWith = (correctCount: number, wrongPositions: number[] = []): Record<string, number> => {
  const answers: Record<string, number> = {};
  ten.forEach((question, position) => {
    if (position >= correctCount) return;
    answers[question.id] = wrongPositions.includes(position) ? (question.answer + 1) % 4 : question.answer;
  });
  return answers;
};

describe('reading a paper', () => {
  it('knows how many questions it can actually read from the bank', () => {
    expect(ten).toHaveLength(10);
    expect(ten.every(question => index.has(question.id))).toBe(true);
    expect(index.has('gen|made-up|1')).toBe(false);
  });

  it('finds a blank tail but does not count blanks in the middle as a tail', () => {
    const tail = answersWith(6);
    expect(tailBlanks(ten, tail)).toBe(4);
    const middle = { ...answersWith(10), [ten[3].id]: undefined as unknown as number };
    expect(tailBlanks(ten, middle)).toBe(0);
  });

  it('measures the longest wrong run instead of the wrong total', () => {
    const scattered = answersWith(10, [0, 2, 4, 6]);
    expect(longestWrongRun(ten, scattered)).toBe(1);
    const burst = answersWith(10, [5, 6, 7]);
    expect(longestWrongRun(ten, burst)).toBe(3);
  });

  it('notices the same wrong option chosen twice', () => {
    const once = answersWith(10, [1, 2]);
    expect(repeatedWrongOption([session({ answers: once })])).toBe(0);
    // Two papers, same wrong option on the same question: the mixed-up pair is real.
    const same = { [ten[1].id]: (ten[1].answer + 2) % 4 };
    expect(repeatedWrongOption([
      session({ id: 'a', answers: same }),
      session({ id: 'b', answers: same }),
    ])).toBe(1);
  });
});

describe('the postmortem tells the truth', () => {
  it('says nothing happened when nothing was measured', () => {
    const result = examPostmortem([]);
    expect(result.papers).toBe(0);
    expect(result.patterns[0].key).toBe('strong');
    expect(result.nextBn).toContain('কোনো পরীক্ষা দাওনি');
    expect(result.trend.enough).toBe(false);
  });

  it('does not skip generated question ids — it reports them as uncounted', () => {
    const mixed = session({ questionIds: [...ten.map(question => question.id), 'gen|fake|1'], answers: answersWith(5) });
    const result = examPostmortem([mixed]);
    expect(result.questions).toBe(10);
    expect(result.caveats.join(' ')).toContain('১টি প্রশ্ন তৈরি হওয়া');
  });

  it('blames time only when a paper really was rushed', () => {
    const slow = session({ answers: answersWith(7), timeTakenSec: 600 });
    const fast = session({ answers: answersWith(7), timeTakenSec: ten.length * (RUSHED_SECONDS - 5) });
    expect(examPostmortem([slow]).patterns.some(pattern => pattern.key === 'rushed')).toBe(false);
    expect(examPostmortem([fast]).patterns.some(pattern => pattern.key === 'rushed')).toBe(true);
  });

  it('calls a blank tail a pacing problem only when it is long enough', () => {
    const short = session({ answers: answersWith(10 - (TAIL_BLANK_MIN - 1)) });
    const long = session({ answers: answersWith(10 - TAIL_BLANK_MIN) });
    expect(examPostmortem([short]).patterns.some(pattern => pattern.key === 'unfinished' && pattern.titleBn.includes('শেষের'))).toBe(false);
    expect(examPostmortem([long]).patterns.some(pattern => pattern.key === 'unfinished' && pattern.titleBn.includes('শেষের'))).toBe(true);
  });

  it('will not call a knowledge gap from one or two wrong answers', () => {
    const tiny = examPostmortem([session({ answers: answersWith(10, [0, 1]) })]);
    expect(tiny.patterns.some(pattern => pattern.key === 'knowledge')).toBe(false);
    const real = examPostmortem([session({ answers: answersWith(10, [0, 1, 2, 3]) })]);
    expect(real.patterns.some(pattern => pattern.key === 'knowledge')).toBe(true);
  });

  it('does not invent a trend from two papers and does from three', () => {
    const one = examPostmortem([session({ id: 'a', answers: answersWith(5), score: 5 })]);
    expect(one.trend.enough).toBe(false);
    expect(one.caveats.join(' ')).toContain('3');
    const three = examPostmortem([
      session({ id: 'a', at: '2026-11-01T10:00:00.000Z', answers: answersWith(4), score: 4 }),
      session({ id: 'b', at: '2026-11-02T10:00:00.000Z', answers: answersWith(7), score: 7 }),
      session({ id: 'c', at: '2026-11-03T10:00:00.000Z', answers: answersWith(9), score: 9 }),
    ]);
    expect(three.trend.papers).toBe(TREND_MIN_PAPERS);
    expect(three.trend.enough).toBe(true);
    expect(three.trend.change).toBeGreaterThan(0);
  });

  it('reports a chapter gap with its sample size and gates the verdict', () => {
    const result = examPostmortem([session({ answers: answersWith(4) })]);
    const row = result.gaps.find(item => item.chapterId === CHAPTER)!;
    expect(row.asked).toBe(10);
    expect(row.correct).toBe(4);
    expect(row.percent).toBe(40);
    expect(row.judged).toBe(true);
    expect(row.practiceable).toBe(true);
    expect(chapterById[row.chapterId].title).toBe(row.title);
  });

  it('never claims a chapter is weak from fewer than the minimum questions', () => {
    // Three questions, all answered correctly: nothing to blame, nothing to judge.
    const three = session({ questionIds: ten.slice(0, 3).map(question => question.id), answers: answersWith(3) });
    const result = examPostmortem([three], [three]);
    const row = result.gaps.find(item => item.chapterId === CHAPTER)!;
    expect(row.asked).toBeLessThan(CHAPTER_MIN_QUESTIONS);
    expect(row.judged).toBe(false);
    expect(result.nextBn).toContain('আরও বড় পরীক্ষা');
  });

  it('gives one next step that matches the biggest measured problem', () => {
    const blankHeavy = examPostmortem([session({ answers: answersWith(5) })]);
    expect(blankHeavy.nextBn).toContain('সময় শেষে প্রশ্ন বাকি');
    const knowledge = examPostmortem([session({ answers: answersWith(10, [0, 1, 2, 3]) })]);
    expect(knowledge.nextBn).toContain('সবচেয়ে দুর্বল');
  });

  it('always says what the numbers cannot say', () => {
    const result = examPostmortem([session({ answers: answersWith(9) })]);
    expect(result.caveats.join(' ')).toContain('অনুমান নয়');
  });
});

describe('helper honesty', () => {
  it('keeps percent inside 0–100 even for a question with zero total', () => {
    const empty = examPostmortem([session({ questionIds: [], answers: {}, score: 0, total: 0 })]);
    expect(empty.percent).toBe(0);
    expect(empty.papers).toBe(1);
  });

  it('accepts a supplied bank instead of the shipped one', () => {
    const fake: QuizQuestion[] = ten.map((question, position) => ({ ...question, id: `x${position}` }));
    const custom = questionIndex(fake);
    expect(custom.has('x0')).toBe(true);
    expect(custom.has(ten[0].id)).toBe(false);
  });
});
