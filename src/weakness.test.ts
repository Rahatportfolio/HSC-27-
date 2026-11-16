import { describe, expect, it } from 'vitest';
import {
  chapterAccuracy, chapterCqMarks, daysSinceTouched, markWeaknessPracticed, pullRevisionForward,
  weaknessReport, weaknessSummary, weaknessWeekPlan,
} from './weakness';
import { freshData } from './planner';
import type { AppData } from './planner';
import { buildPlan } from './planner';
import { CHAPTERS } from './data';
import type { QuizQuestion } from './types';

const TODAY = '2026-03-10';
const chapterA = CHAPTERS.find(chapter => chapter.priority === 'A')!;
const chapterB = CHAPTERS.find(chapter => chapter.priority === 'B')!;
const plan = buildPlan(freshData().settings);

const questionIn = (chapterId: string, index: number): QuizQuestion => ({
  id: `w-${index}`, subject: CHAPTERS.find(chapter => chapter.id === chapterId)!.subject, chapterId,
  question: `প্রশ্ন ${index}`, options: ['ক', 'খ', 'গ', 'ঘ'], answer: 0, explanation: 'e', source: 't', createdAt: '2026-01-01T00:00:00.000Z',
});
const attempt = (questionId: string, correct: boolean, index: number) => ({
  id: `a-${index}`, questionId, subject: 'physics' as const, chosen: correct ? 0 : 2, correct, date: '2026-03-05', at: '2026-03-05T09:00:00.000Z',
});
const withAttempts = (chapterId: string, total: number, correct: number): AppData => {
  const questions = Array.from({ length: total }, (_, index) => questionIn(chapterId, index));
  return {
    ...freshData(),
    questions,
    attempts: questions.map((question, index) => attempt(question.id, index < correct, index)),
  };
};

describe('chapter accuracy and CQ marks', () => {
  it('counts attempts per chapter', () => {
    const data = withAttempts(chapterA.id, 4, 1);
    const row = chapterAccuracy(data).get(chapterA.id)!;
    expect(row).toEqual({ total: 4, correct: 1, accuracy: 25 });
  });

  it('ignores attempts for questions that are no longer in the bank', () => {
    const data: AppData = { ...freshData(), attempts: [{ ...attempt('ghost', false, 1), questionId: 'ghost' }] };
    expect(chapterAccuracy(data).size).toBe(0);
  });

  it('averages CQ self-marking', () => {
    const data: AppData = {
      ...freshData(),
      cq: [
        { id: 'c1', subject: 'physics', chapterId: chapterA.id, question: 'ক', date: '2026-03-01', at: '2026-03-01T09:00:00.000Z', marks: 2, total: 10, note: '', parts: { c1: 1, c2: 1, c3: 0, c4: 0 } } as never,
        { id: 'c2', subject: 'physics', chapterId: chapterA.id, question: 'খ', date: '2026-03-02', at: '2026-03-02T09:00:00.000Z', marks: 8, total: 10, note: '', parts: { c1: 2, c2: 2, c3: 2, c4: 2 } } as never,
      ],
    };
    expect(chapterCqMarks(data).get(chapterA.id)).toMatchObject({ marks: 10, total: 20, percent: 50 });
  });
});

describe('the weakness report', () => {
  it('is empty when nothing has been practised', () => {
    expect(weaknessReport(plan, freshData(), TODAY)).toEqual([]);
  });

  it('flags a chapter with low MCQ accuracy and explains why', () => {
    const rows = weaknessReport(plan, withAttempts(chapterA.id, 4, 1), TODAY);
    const row = rows.find(item => item.chapterId === chapterA.id)!;
    expect(row).toBeTruthy();
    expect(row.signals.some(signal => signal.label.includes('MCQ'))).toBe(true);
    expect(row.action).toBe('practice');
    expect(row.actionLabel).toBe('MCQ অনুশীলন');
    expect(row.score).toBeGreaterThanOrEqual(4);
  });

  it('ranks priority-A chapters above an equivalent B chapter', () => {
    const data: AppData = {
      ...withAttempts(chapterA.id, 4, 1),
      questions: [...withAttempts(chapterA.id, 4, 1).questions, ...Array.from({ length: 4 }, (_, index) => questionIn(chapterB.id, 100 + index))],
      attempts: [
        ...withAttempts(chapterA.id, 4, 1).attempts,
        ...Array.from({ length: 4 }, (_, index) => ({ ...attempt(`w-${100 + index}`, index < 1, 100 + index), subject: chapterB.subject })),
      ],
    };
    const rows = weaknessReport(plan, data, TODAY);
    const a = rows.find(row => row.chapterId === chapterA.id)!;
    const b = rows.find(row => row.chapterId === chapterB.id)!;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a.score).toBeGreaterThanOrEqual(b.score);
  });

  it('puts due retry questions first and offers the retry action', () => {
    const data = withAttempts(chapterA.id, 3, 0);
    const withRetry: AppData = {
      ...data,
      retries: [questionIn(chapterA.id, 1), questionIn(chapterA.id, 2)].map(question => ({
        id: question.id, questionId: question.id, subject: question.subject, chapterId: chapterA.id,
        source: 'পরীক্ষা', schedule: '1,3,7,14,30', replayed: 0, cleared: false,
        date: TODAY, at: '2026-03-09T09:00:00.000Z', lastAt: '2026-03-09T09:00:00.000Z',
      })),
    };
    const row = weaknessReport(plan, withRetry, TODAY).find(item => item.chapterId === chapterA.id)!;
    expect(row.action).toBe('retry');
    expect(row.dueRetries).toBe(2);
    expect(row.signals.some(signal => signal.label.includes('ফেরত'))).toBe(true);
    expect(weaknessSummary(plan, withRetry, TODAY).dueRetries).toBe(2);
  });

  it('surfaces an untouched priority-A chapter as a low-weight nudge and nothing else', () => {
    const data: AppData = { ...freshData(), chapterMeta: { [chapterA.id]: { note: '', weak: false, cq: 'none', mcq: 'none', updatedAt: `${TODAY}T00:00:00.000Z`, priority: 'A' } } };
    const rows = weaknessReport(plan, data, TODAY);
    const row = rows.find(item => item.chapterId === chapterA.id)!;
    expect(row.signals.map(signal => signal.label)).toEqual(['A-অধ্যায়, এখনো শুরু হয়নি']);
    expect(row.action).toBe('study');
    expect(row.score).toBeLessThan(5);
  });

  it('uses the exam simulator snapshot as a signal', () => {
    const data: AppData = {
      ...freshData(),
      examSessions: [{
        id: 's1', mode: 'chapter', title: 'পরীক্ষা', chapterIds: [chapterA.id], questionIds: ['x'], answers: {},
        score: 1, total: 5, durationMin: 5, timeTakenSec: 100, date: '2026-03-06', at: '2026-03-06T09:00:00.000Z',
        breakdown: [{ chapterId: chapterA.id, subject: chapterA.subject, correct: 1, total: 5 }],
      }],
    };
    const row = weaknessReport(plan, data, TODAY).find(item => item.chapterId === chapterA.id)!;
    expect(row.signals.some(signal => signal.label.includes('পরীক্ষায়'))).toBe(true);
  });

  it('summarises by subject and keeps the top three as focus', () => {
    const data = withAttempts(chapterA.id, 4, 1);
    const summary = weaknessSummary(plan, data, TODAY);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.focus.length).toBeLessThanOrEqual(3);
    expect(summary.bySubject[0].count).toBeGreaterThan(0);
    expect(summary.bySubject[0].subject).toBe(chapterA.subject);
  });
});

describe('actions', () => {
  it('records a practice promise without clearing the flag', () => {
    const data = freshData();
    const next = markWeaknessPracticed(data, chapterA.id, TODAY);
    expect(next.chapterMeta[chapterA.id]).toMatchObject({ weak: true, cq: 'practicing', mcq: 'practicing', updatedAt: `${TODAY}T00:00:00.000Z` });
  });

  it('pulls a distant revision card forward to tomorrow', () => {
    const data: AppData = {
      ...freshData(),
      revisions: [
        { id: 'r1', chapterId: chapterA.id, subject: chapterA.subject, dueDate: '2026-04-01', interval: 30, createdAt: '2026-03-01T00:00:00.000Z' },
        { id: 'r2', chapterId: chapterB.id, subject: chapterB.subject, dueDate: '2026-04-01', interval: 30, createdAt: '2026-03-01T00:00:00.000Z' },
      ],
    };
    const next = pullRevisionForward(data, chapterA.id, TODAY);
    expect(next.revisions[0]).toMatchObject({ dueDate: '2026-03-11', adjusted: true });
    expect(next.revisions[1].dueDate).toBe('2026-04-01');
    // Already-soon cards are untouched and nothing changes when there is nothing to pull.
    expect(pullRevisionForward({ ...data, revisions: [{ ...data.revisions[0], dueDate: '2026-03-11' }] }, chapterA.id, TODAY)).toEqual({ ...data, revisions: [{ ...data.revisions[0], dueDate: '2026-03-11' }] });
  });

  it('measures how long ago a chapter was touched', () => {
    const data: AppData = { ...freshData(), chapterMeta: { [chapterA.id]: { note: '', weak: false, cq: 'none', mcq: 'none', updatedAt: '2026-03-04T10:00:00.000Z' } } };
    expect(daysSinceTouched(data, chapterA.id, TODAY)).toBe(6);
    expect(daysSinceTouched(data, chapterB.id, TODAY)).toBeNull();
  });
});

describe('week plan', () => {
  it('spreads flagged chapters across the days, two per day', () => {
    const chapters = CHAPTERS.slice(1, 7);
    const questions = chapters.flatMap((chapter, chapterIndex) => Array.from({ length: 3 }, (_, index) => questionIn(chapter.id, chapterIndex * 10 + index)));
    const data: AppData = {
      ...freshData(),
      questions,
      attempts: questions.map((question, index) => ({ id: `x${index}`, questionId: question.id, subject: question.subject, chosen: 3, correct: false, date: '2026-03-05', at: '2026-03-05T09:00:00.000Z' })),
    };
    const week = weaknessWeekPlan(plan, data, TODAY);
    expect(week.length).toBeGreaterThan(0);
    expect(week[0].date).toBe(TODAY);
    expect(week.every(day => day.rows.length > 0 && day.rows.length <= 2)).toBe(true);
    expect(week.length).toBeLessThanOrEqual(7);
    expect(weaknessWeekPlan(plan, freshData(), TODAY)).toEqual([]);
  });
});
