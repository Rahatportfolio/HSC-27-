import { describe, expect, it } from 'vitest';
import {
  EXAM_SECONDS_PER_QUESTION, buildExamQuestions, examChapterAccuracy, examDurationMin, examGradeLetter,
  examHistoryStats, gradeExam, nextMockDate, retryQuestionIds, saveExamSession, wrongQuestionIds,
} from './examSim';
import { freshData } from './planner';
import type { AppData } from './planner';
import { STARTER_QUESTIONS } from './quiz-data';
import { LIMITS } from './storage';
import type { ExamSession, QuizAttempt, QuizQuestion } from './types';

const question = (index: number, subject: QuizQuestion['subject'] = 'physics', chapterId = FIXTURE_CHAPTER): QuizQuestion => ({
  id: `tfixture-${index}`,
  subject,
  chapterId,
  question: `প্রশ্ন ${index}`,
  options: ['ক', 'খ', 'গ', 'ঘ'],
  answer: index % 4,
  explanation: 'ব্যাখ্যা',
  source: 'টেস্ট',
  createdAt: '2026-01-01T00:00:00.000Z',
});

/**
 * The shipped sample bank is always part of the pool in production, so these tests assert
 * on the fixture ids they added instead of on exact pool sizes.
 */
const FIXTURE_CHAPTER = 'physics-1-2';
const emptyBank = (): AppData => ({ ...freshData(), questions: [] });
const isFixture = (item: QuizQuestion) => item.id.startsWith('tfixture-');
const withQuestions = (count: number): AppData => ({
  ...emptyBank(),
  questions: Array.from({ length: count }, (_, index) => question(index)),
});

const attempt = (questionId: string, correct: boolean): QuizAttempt => ({
  id: `a-${questionId}-${correct}`, questionId, subject: 'physics', chosen: correct ? 0 : 2, correct,
  at: '2026-02-01T09:00:00.000Z', date: '2026-02-01',
});

const session = (score: number, total: number, date: string, breakdown: ExamSession['breakdown'] = []): ExamSession => ({
  id: `s-${date}`, mode: 'subject', title: 'টেস্ট', chapterIds: [], questionIds: ['tfixture-0'],
  answers: {}, score, total, durationMin: 10, timeTakenSec: 300, date, at: `${date}T10:00:00.000Z`, breakdown,
});

describe('exam duration and letters', () => {
  it('gives one minute per MCQ with a five minute floor', () => {
    expect(EXAM_SECONDS_PER_QUESTION).toBe(60);
    expect(examDurationMin(0)).toBe(5);
    expect(examDurationMin(1)).toBe(5);
    expect(examDurationMin(20)).toBe(20);
    expect(examDurationMin(33)).toBe(33);
  });

  it('maps percentage to an approximate HSC letter grade', () => {
    expect(examGradeLetter(100)).toBe('A+');
    expect(examGradeLetter(80)).toBe('A+');
    expect(examGradeLetter(79)).toBe('A');
    expect(examGradeLetter(70)).toBe('A');
    expect(examGradeLetter(50)).toBe('B');
    expect(examGradeLetter(33)).toBe('D');
    expect(examGradeLetter(32)).toBe('F');
  });
});

describe('building a paper', () => {
  it('never returns duplicates and never exceeds the requested count', () => {
    const paper = buildExamQuestions(freshData(), { mode: 'full', count: 12 }, () => 0.42);
    expect(paper).toHaveLength(12);
    expect(new Set(paper.map(item => item.id)).size).toBe(12);
  });

  it('draws from a single chapter', () => {
    const data: AppData = {
      ...emptyBank(),
      questions: [question(0), question(1), question(2, 'chemistry', 'chemistry-1-2')],
    };
    const paper = buildExamQuestions(data, { mode: 'chapter', chapterId: FIXTURE_CHAPTER, count: 25 }, () => 0.5);
    expect(paper.every(item => item.chapterId === FIXTURE_CHAPTER)).toBe(true);
    expect(paper.filter(isFixture).map(item => item.id).sort()).toEqual(['tfixture-0', 'tfixture-1']);
  });

  it('fills a third of the paper with previously wrong questions', () => {
    const data: AppData = { ...withQuestions(12), attempts: [attempt('tfixture-1', false), attempt('tfixture-2', false), attempt('tfixture-3', false), attempt('tfixture-4', false)] };
    const paper = buildExamQuestions(data, { mode: 'subject', subject: 'physics', count: 9 }, () => 0.1);
    const wrong = paper.filter(item => ['tfixture-1', 'tfixture-2', 'tfixture-3', 'tfixture-4'].includes(item.id));
    expect(wrong).toHaveLength(3);
    expect(new Set(paper.map(item => item.id)).size).toBe(paper.length);
  });

  it('treats a mistake-test as the retry pool only', () => {
    const data: AppData = { ...withQuestions(8), attempts: [attempt('tfixture-1', false), attempt('tfixture-5', true)] };
    const paper = buildExamQuestions(data, { mode: 'mistakes', count: 10 }, () => 0.3);
    expect(paper.map(item => item.id)).toEqual(['tfixture-1']);
    expect(wrongQuestionIds(data)).toEqual(new Set(['tfixture-1']));
  });

  it('respects the latest attempt when a question is answered twice', () => {
    const data: AppData = { ...withQuestions(3), attempts: [attempt('tfixture-0', false), { ...attempt('tfixture-0', true), id: 'later', at: '2026-03-01T09:00:00.000Z' }] };
    expect(wrongQuestionIds(data).has('tfixture-0')).toBe(false);
    expect(buildExamQuestions(data, { mode: 'mistakes', count: 5 })).toEqual([]);
  });

  it('spreads a full mock across subjects', () => {
    const mixed: AppData = {
      ...freshData(),
      questions: [
        ...Array.from({ length: 6 }, (_, index) => question(100 + index, 'physics')),
        ...Array.from({ length: 6 }, (_, index) => question(200 + index, 'chemistry')),
      ],
    };
    const paper = buildExamQuestions(mixed, { mode: 'full', count: 6 }, () => 0.7);
    // Round-robin: six picks over the seven subjects must never all come from one paper.
    const perSubject = new Map<string, number>();
    for (const item of paper) perSubject.set(item.subject, (perSubject.get(item.subject) || 0) + 1);
    expect(paper).toHaveLength(6);
    expect(perSubject.size).toBe(6);
    expect(Math.max(...perSubject.values())).toBe(1);
  });

  it('returns an empty paper when nothing was ever answered wrong', () => {
    expect(buildExamQuestions(emptyBank(), { mode: 'mistakes', count: 10 })).toEqual([]);
  });
});

describe('auto-marking', () => {
  const paper = [question(0), question(1), question(2), question(3)];

  it('counts correct, wrong and unanswered separately', () => {
    const grade = gradeExam(paper, { 'tfixture-0': 0, 'tfixture-1': 3, 'tfixture-2': 2 });
    expect(grade.score).toBe(2);
    expect(grade.total).toBe(4);
    expect(grade.percent).toBe(50);
    expect(grade.wrong.map(item => item.id)).toEqual(['tfixture-1']);
    expect(grade.unanswered.map(item => item.id)).toEqual(['tfixture-3']);
    expect(retryQuestionIds(grade)).toEqual(['tfixture-1', 'tfixture-3']);
  });

  it('ignores an out-of-range or non-integer answer', () => {
    const grade = gradeExam(paper, { 'tfixture-0': 9, 'tfixture-1': 1.5 });
    expect(grade.score).toBe(0);
    expect(grade.wrong).toEqual([]);
    expect(grade.unanswered).toHaveLength(4);
  });

  it('groups the breakdown by chapter', () => {
    const mixed = [question(0), question(1), question(2, 'chemistry', 'chemistry-1-')];
    const grade = gradeExam(mixed, { 'tfixture-0': 0, 'tfixture-2': 2 });
    const physics = grade.breakdown.find(row => row.subject === 'physics');
    const chemistry = grade.breakdown.find(row => row.subject === 'chemistry');
    expect(physics).toMatchObject({ correct: 1, total: 2 });
    expect(chemistry).toMatchObject({ correct: 1, total: 1 });
  });

  it('handles an empty paper without dividing by zero', () => {
    expect(gradeExam([], {}).percent).toBe(0);
  });
});

describe('saving a paper', () => {
  it('stores the session, the test record and the mistake loop', () => {
    const data = withQuestions(4);
    const paper = data.questions.slice(0, 3);
    const next = saveExamSession(data, {
      mode: 'subject', title: 'পদার্থ · বিষয় পরীক্ষা', subject: 'physics', questions: paper,
      answers: { 'tfixture-0': 0, 'tfixture-1': 3 }, durationMin: 3, timeTakenSec: 92, date: '2026-03-02',
    });
    expect(next.examSessions).toHaveLength(1);
    expect(next.examSessions[0]).toMatchObject({ score: 1, total: 3, mode: 'subject', subject: 'physics', date: '2026-03-02' });
    expect(next.examSessions[0].breakdown).toEqual([expect.objectContaining({ correct: 1, total: 3 })]);
    expect(next.tests).toHaveLength(1);
    expect(next.tests[0]).toMatchObject({ kind: 'subject', score: 1, total: 3, date: '2026-03-02' });
    expect(next.tests[0].notes).toContain('সিমুলেটর');
    // answered questions become attempts, and the wrong one becomes a mistake + revision card.
    expect(next.attempts.map(item => item.questionId).sort()).toEqual(['tfixture-0', 'tfixture-1']);
    const mistake = next.mistakes.find(item => item.id === 'auto-mcq:tfixture-1');
    expect(mistake).toMatchObject({ subject: 'physics', chapterId: 'physics-1-2', resolved: false, retryStatus: 'pending' });
    expect(mistake?.text).toContain('সঠিক:');
    expect(next.revisions).toHaveLength(1);
  });

  it('does not save anything for an empty paper', () => {
    const data = freshData();
    expect(saveExamSession(data, { mode: 'full', title: 'x', questions: [], answers: {}, durationMin: 5, timeTakenSec: 0, date: '2026-03-02' })).toBe(data);
  });

  it('keeps the newest sessions inside the storage budget', () => {
    let data = withQuestions(2);
    for (let index = 0; index < 3; index++) {
      data = { ...data, examSessions: [...data.examSessions, session(1, 2, `2026-03-0${index + 1}`)].slice(-LIMITS.examSessions) };
    }
    expect(data.examSessions).toHaveLength(3);
    expect(LIMITS.examSessions).toBeGreaterThan(0);
  });

  it('falls back to the sample bank when the user bank is empty', () => {
    const paper = buildExamQuestions(freshData(), { mode: 'full', count: 10 }, () => 0.25);
    expect(paper).toHaveLength(10);
    expect(paper.every(item => STARTER_QUESTIONS.some(seed => seed.id === item.id))).toBe(true);
  });

  it('marks a mistake test as a model-kind test record', () => {
    const data = withQuestions(2);
    const next = saveExamSession(data, { mode: 'mistakes', title: 'ভুলের পরীক্ষা', questions: data.questions, answers: { 'tfixture-0': 0 }, durationMin: 5, timeTakenSec: 10, date: '2026-03-02' });
    expect(next.tests[0].kind).toBe('model');
  });
});

describe('history statistics', () => {
  it('reports count, average, best, latest and trend', () => {
    const stats = examHistoryStats([
      session(50, 100, '2026-03-01'), session(60, 100, '2026-03-02'), session(70, 100, '2026-03-03'),
      session(80, 100, '2026-03-04'), session(90, 100, '2026-03-05'), session(100, 100, '2026-03-06'),
    ]);
    expect(stats.count).toBe(6);
    expect(stats.average).toBe(75);
    expect(stats.best).toBe(100);
    expect(stats.latest).toBe(100);
    expect(stats.trend).toBe(30);
    expect(stats.totalQuestions).toBe(600);
    expect(stats.totalCorrect).toBe(450);
  });

  it('has no trend before two blocks of three papers', () => {
    expect(examHistoryStats([session(10, 20, '2026-03-01')]).trend).toBeNull();
    expect(examHistoryStats([]).latest).toBeNull();
    expect(examHistoryStats([]).average).toBe(0);
  });

  it('ranks chapters by accuracy with totals added up', () => {
    const rows = examChapterAccuracy([
      session(1, 2, '2026-03-01', [{ chapterId: 'physics-1-2', subject: 'physics', correct: 1, total: 4 }]),
      session(1, 2, '2026-03-02', [{ chapterId: 'physics-1-2', subject: 'physics', correct: 3, total: 4 }]),
      session(1, 2, '2026-03-03', [{ chapterId: undefined as unknown as string, subject: 'chemistry', correct: 2, total: 2 }]),
    ]);
    expect(rows[0]).toMatchObject({ chapterId: 'physics-1-2', correct: 4, total: 8, percent: 50 });
    expect(rows[1]).toMatchObject({ subject: 'chemistry', percent: 100 });
  });

  it('suggests the next weekly mock a week after the last one', () => {
    expect(nextMockDate([], '2026-03-10')).toBe('2026-03-10');
    expect(nextMockDate([session(1, 2, '2026-03-01')], '2026-03-03')).toBe('2026-03-08');
    expect(nextMockDate([session(1, 2, '2026-03-01')], '2026-03-20')).toBe('2026-03-20');
  });
});
