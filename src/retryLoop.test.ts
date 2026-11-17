import { describe, expect, it } from 'vitest';
import {
  RETRY_INTERVALS, applyRetryResults, dueRetryIds, enqueueRetries, nextRung, retryBuckets,
  retryChapterRows, retryPlan, retryRungLabel, trimRetries,
} from './retryLoop';
import { buildExamQuestions, saveExamSession } from './examSim';
import { STARTER_QUESTIONS } from './quiz-data';
import { freshData } from './planner';
import type { AppData } from './planner';
import { LIMITS } from './storage';
import type { QuizQuestion, RetryItem } from './types';

const FIXTURE_CHAPTER = 'physics-1-2';
const question = (index: number, subject: QuizQuestion['subject'] = 'physics', chapterId = FIXTURE_CHAPTER): QuizQuestion => ({
  id: `tfixture-${index}`, subject, chapterId, question: `প্রশ্ন ${index}`,
  options: ['ক', 'খ', 'গ', 'ঘ'], answer: 0, explanation: 'ব্যাখ্যা', source: 'টেস্ট', createdAt: '2026-01-01T00:00:00.000Z',
});
/** Fresh data plus a quarantined fixture bank, so sample ids can never be confused with fixtures. */
const dataWith = (count: number): AppData => ({
  ...freshData(),
  questions: Array.from({ length: count }, (_, index) => question(index)),
});
const wrongOf = (questions: QuizQuestion[]) => questions.map(item => ({ id: item.id, subject: item.subject, ...(item.chapterId ? { chapterId: item.chapterId } : {}) }));

describe('the retry ladder', () => {
  it('mirrors the revision ladder', () => {
    expect([...RETRY_INTERVALS]).toEqual([1, 3, 7, 14, 30]);
  });

  it('promotes on a correct retry and restarts on a wrong one', () => {
    const item = { schedule: '1,3,7,14,30', replayed: 0 } as RetryItem;
    expect(nextRung(item, true)).toBe('3,7,14,30');
    expect(nextRung({ ...item, schedule: '3,7,14,30' } as RetryItem, true)).toBe('7,14,30');
    expect(nextRung({ ...item, schedule: '7,14,30' } as RetryItem, true)).toBe('14,30');
    // An empty result means every rung is done — the question is cleared.
    expect(nextRung({ ...item, schedule: '30' } as RetryItem, true)).toBe('');
    expect(nextRung(item, false)).toBe('1,3,7,14,30');
    expect(nextRung({ ...item, schedule: 'garbage' } as RetryItem, true)).toBe('1,3,7,14,30');
  });

  it('labels the rung out of five', () => {
    expect(retryRungLabel({ schedule: '1,3,7,14,30', replayed: 0 } as RetryItem)).toBe('0/5');
    expect(retryRungLabel({ schedule: '30', replayed: 4 } as RetryItem)).toBe('4/5');
    expect(retryRungLabel({ schedule: '', replayed: 9 } as RetryItem)).toBe('5/5');
  });
});

describe('queueing wrong questions', () => {
  it('queues wrong and unanswered questions for tomorrow', () => {
    const data = dataWith(3);
    const next = enqueueRetries(data, {
      source: 'পদার্থ · বিষয় পরীক্ষা', date: '2026-03-02',
      wrong: wrongOf([data.questions[0]]), unanswered: wrongOf([data.questions[1]]),
    });
    expect(next.retries).toHaveLength(2);
    expect(next.retries[0]).toMatchObject({
      id: 'tfixture-0', questionId: 'tfixture-0', subject: 'physics', chapterId: FIXTURE_CHAPTER,
      source: 'পদার্থ · বিষয় পরীক্ষা', schedule: '1,3,7,14,30', replayed: 0, cleared: false, date: '2026-03-03',
    });
  });

  it('never queues the same question twice', () => {
    const data = dataWith(2);
    const entry = { source: 'পরীক্ষা', date: '2026-03-02', wrong: wrongOf(data.questions), unanswered: [] };
    const once = enqueueRetries(data, entry);
    const twice = enqueueRetries(once, { ...entry, date: '2026-03-03' });
    expect(twice.retries).toHaveLength(2);
  });

  it('keeps an earlier due date when a question is raised again', () => {
    const data = dataWith(1);
    const first = enqueueRetries(data, { source: 'প্রথম', date: '2026-03-02', wrong: wrongOf(data.questions), unanswered: [] });
    const again = enqueueRetries(first, { source: 'দ্বিতীয়', date: '2026-03-05', wrong: wrongOf(data.questions), unanswered: [] });
    expect(again.retries[0]).toMatchObject({ date: '2026-03-03', source: 'দ্বিতীয়' });
  });

  it('does nothing for a clean paper', () => {
    const data = dataWith(2);
    expect(enqueueRetries(data, { source: 'x', date: '2026-03-02', wrong: [], unanswered: [] })).toBe(data);
  });

  it('stops queueing at the storage budget', () => {
    const crowded: AppData = {
      ...dataWith(2),
      retries: Array.from({ length: LIMITS.retries }, (_, index) => ({
        id: `old-${index}`, questionId: `old-${index}`, subject: 'physics' as const, source: 'পুরোনো', schedule: '1,3,7,14,30',
        replayed: 0, cleared: false, date: '2026-03-01', at: '2026-03-01T09:00:00.000Z', lastAt: '2026-03-01T09:00:00.000Z',
      })),
    };
    const next = enqueueRetries(crowded, { source: 'x', date: '2026-03-02', wrong: wrongOf(crowded.questions), unanswered: [] });
    expect(next.retries).toHaveLength(LIMITS.retries);
    expect(next.retries.some(item => item.id === 'tfixture-0')).toBe(false);
  });
});

describe('settling retries', () => {
  const queued = (): AppData => enqueueRetries(dataWith(4), {
    source: 'পরীক্ষা', date: '2026-03-02', wrong: wrongOf([question(0), question(1), question(2), question(3)]), unanswered: [],
  });

  it('schedules a correct retry three days out', () => {
    const next = applyRetryResults(queued(), [{ questionId: 'tfixture-0', correct: true }], '2026-03-03');
    expect(next.retries[0]).toMatchObject({ schedule: '3,7,14,30', replayed: 1, cleared: false, date: '2026-03-06' });
  });

  it('restarts a wrong retry at day one', () => {
    const promoted = applyRetryResults(queued(), [{ questionId: 'tfixture-0', correct: true }], '2026-03-03');
    const failed = applyRetryResults(promoted, [{ questionId: 'tfixture-0', correct: false }], '2026-03-06');
    expect(failed.retries[0]).toMatchObject({ schedule: '1,3,7,14,30', replayed: 0, cleared: false, date: '2026-03-07' });
  });

  it('clears a question after every rung of the ladder', () => {
    let data = queued();
    const days = ['2026-03-03', '2026-03-06', '2026-03-13', '2026-03-27', '2026-04-26'];
    for (const date of days) data = applyRetryResults(data, [{ questionId: 'tfixture-0', correct: true }], date);
    const item = data.retries.find(entry => entry.id === 'tfixture-0')!;
    expect(item).toMatchObject({ cleared: true, replayed: 5 });
    expect(retryBuckets(data, '2026-04-27').cleared.map(entry => entry.id)).toEqual(['tfixture-0']);
  });

  it('ignores questions that were not queued', () => {
    const data = queued();
    expect(applyRetryResults(data, [{ questionId: 'never-seen', correct: true }], '2026-03-03')).toBe(data);
    expect(applyRetryResults(data, [], '2026-03-03')).toBe(data);
  });
});

describe('what is due', () => {
  const data = (): AppData => enqueueRetries(dataWith(3), {
    source: 'পরীক্ষা', date: '2026-03-02', wrong: wrongOf([question(0), question(1), question(2)]), unanswered: [],
  });

  it('separates due, upcoming and cleared', () => {
    const buckets = retryBuckets(data(), '2026-03-03');
    expect(buckets.due.map(item => item.questionId)).toEqual(['tfixture-0', 'tfixture-1', 'tfixture-2']);
    expect(buckets.upcoming).toHaveLength(0);
    expect(retryBuckets(data(), '2026-03-01').due).toHaveLength(0);
    expect(retryBuckets(data(), '2026-03-01').upcoming).toHaveLength(3);
  });

  it('returns due ids first for the next paper', () => {
    const settled = applyRetryResults(data(), [{ questionId: 'tfixture-0', correct: true }], '2026-03-03');
    // The promoted question is scheduled three days out, so it still shows (correctly) as upcoming.
    expect(dueRetryIds(settled, '2026-03-03').slice(0, 2)).toEqual(['tfixture-1', 'tfixture-2']);
    expect(dueRetryIds(settled, '2026-03-03', 1)).toEqual(['tfixture-1']);
    expect(dueRetryIds(settled, '2026-03-06')).toContain('tfixture-0');
  });

  it('groups the queue by chapter for the weakness rail', () => {
    const rows = retryChapterRows(data(), '2026-03-03');
    expect(rows[0]).toMatchObject({ chapterId: FIXTURE_CHAPTER, subject: 'physics', due: 3, total: 3 });
  });
});

describe('papers use the queue', () => {
  it('builds a retry-only paper from due questions', () => {
    const data = dataWith(4);
    const queued = enqueueRetries(data, { source: 'পরীক্ষা', date: '2026-03-02', wrong: wrongOf([data.questions[0], data.questions[1]]), unanswered: [] });
    const paper = buildExamQuestions(queued, { mode: 'retry', count: 10, today: '2026-03-03' });
    expect(paper.map(item => item.id).sort()).toEqual(['tfixture-0', 'tfixture-1']);
    expect(buildExamQuestions(queued, { mode: 'retry', count: 10, today: '2026-03-01' })).toEqual([]);
  });

  it('prefers due questions when filling the third-of-paper quota', () => {
    // Two old mistakes, one of them already due.
    const data: AppData = {
      ...dataWith(12),
      attempts: [
        { id: 'a1', questionId: 'tfixture-0', subject: 'physics', chosen: 2, correct: false, date: '2026-03-01', at: '2026-03-01T09:00:00.000Z' },
        { id: 'a2', questionId: 'tfixture-1', subject: 'physics', chosen: 2, correct: false, date: '2026-03-01', at: '2026-03-01T09:00:00.000Z' },
      ],
    };
    const queued = enqueueRetries(data, { source: 'পুরোনো পরীক্ষা', date: '2026-03-01', wrong: wrongOf([data.questions[0]]), unanswered: [] });
    const paper = buildExamQuestions(queued, { mode: 'chapter', chapterId: FIXTURE_CHAPTER, count: 3, today: '2026-03-02' });
    expect(paper.map(item => item.id)).toContain('tfixture-0');
  });

  it('saves a paper, queues its mistakes and settles any due retry', () => {
    const data = dataWith(3);
    // Every fixture's correct option is 0, so two wrong choices mean two owed questions.
    const first = saveExamSession(data, {
      mode: 'subject', title: 'প্রথম', subject: 'physics', questions: data.questions,
      answers: { 'tfixture-0': 1, 'tfixture-1': 0, 'tfixture-2': 1 }, durationMin: 3, timeTakenSec: 60, date: '2026-03-02',
    });
    expect(first.retries.map(item => item.questionId).sort()).toEqual(['tfixture-0', 'tfixture-2']);
    expect(first.retries.every(item => item.date === '2026-03-03')).toBe(true);

    // Next day, retry both owed questions: one still wrong (ladder restarts), one correct (ladder advances).
    const retryPaper = first.questions.filter(item => item.id !== 'tfixture-1');
    const second = saveExamSession(first, {
      mode: 'retry', title: 'পুনরায়', questions: retryPaper,
      answers: { 'tfixture-0': 0, 'tfixture-2': 3 }, durationMin: 2, timeTakenSec: 40, date: '2026-03-03',
    });
    const failed = second.retries.find(item => item.questionId === 'tfixture-2')!;
    const passed = second.retries.find(item => item.questionId === 'tfixture-0')!;
    // `schedule` holds the rungs still to come, so a restart is the whole ladder again.
    expect(failed.schedule).toBe('1,3,7,14,30');
    expect(failed.replayed).toBe(0);
    expect(failed.date).toBe('2026-03-04');
    expect(second.retries.some(item => item.cleared)).toBe(false);
    expect(passed.schedule).toBe('3,7,14,30');
    expect(passed.replayed).toBe(1);
    expect(passed.date).toBe('2026-03-06');
    expect(second.examSessions).toHaveLength(2);
  });
});

describe('housekeeping', () => {
  it('plans the coming days of retries from stored papers', () => {
    expect(retryPlan([], '2026-03-03')).toEqual([]);
    const plan = retryPlan([
      { id: 's1', mode: 'subject', title: 'x', chapterIds: [], questionIds: [], answers: {}, score: 2, total: 5, durationMin: 5, timeTakenSec: 30, date: '2026-03-02', at: '2026-03-02T09:00:00.000Z', breakdown: [] },
    ], '2026-03-03');
    expect(plan).toEqual([{ date: '2026-03-03', count: 3 }]);
  });

  it('drops cleared rows older than a month and keeps everything else', () => {
    const cleared = (id: string, lastAt: string): RetryItem => ({
      id, questionId: id, subject: 'physics', source: 'x', schedule: '30', replayed: 5, cleared: true,
      date: '2026-01-01', at: '2026-01-01T00:00:00.000Z', lastAt,
    });
    const data: AppData = {
      ...freshData(),
      retries: [cleared('old', '2026-02-01T00:00:00.000Z'), cleared('recent', '2026-03-10T00:00:00.000Z')],
    };
    expect(trimRetries(data, '2026-03-15').retries.map(item => item.id)).toEqual(['recent']);
    expect(trimRetries({ ...data, retries: [] }, '2026-03-15')).toEqual({ ...data, retries: [] });
  });

  it('ships a bank big enough for a retry paper', () => {
    expect(STARTER_QUESTIONS.length).toBeGreaterThan(50);
  });
});
