import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { buildPlan, chapterTasks, freshData } from './planner';
import { attemptStats, currentStreak, longestStreak, minutesBetween, minutesOn, startOfWeek, subjectMinutes, weakChapters, weeklyReview } from './analytics';

const plan = buildPlan();
const physics = CHAPTERS[0];
function session(date: string, minutes: number, subject: 'physics' | 'chemistry' = 'physics') {
  return { id: `${date}-${minutes}`, date, at: `${date}T08:00:00.000Z`, minutes, subject, mode: 'pomodoro' as const };
}
describe('study analytics', () => {
  it('sums measured minutes by day, range and subject', () => {
    const sessions = [session('2026-11-14', 25), session('2026-11-14', 30, 'chemistry'), session('2026-11-15', 50)];
    expect(minutesOn(sessions, '2026-11-14')).toBe(55);
    expect(minutesBetween(sessions, '2026-11-14', '2026-11-15')).toBe(105);
    expect(subjectMinutes(sessions, '2026-11-14', '2026-11-15')).toMatchObject({ physics: 75, chemistry: 30, biology: 0 });
  });
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-11-14')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16');
  });
  it('counts streaks with a grace day for yesterday', () => {
    const data = freshData();
    data.studySessions.push(session('2026-11-12', 30), session('2026-11-13', 30), session('2026-11-14', 30));
    expect(currentStreak(data, '2026-11-15')).toBe(3);
    expect(longestStreak(data)).toBe(3);
  });
  it('computes accuracy from attempts', () => {
    const attempts = [true, true, false, true].map((correct, index) => ({ id: `a${index}`, questionId: `seed-00${index}`, subject: 'physics' as const, chosen: 0, correct, date: '2026-11-14', at: '2026-11-14T08:00:00.000Z' }));
    expect(attemptStats(attempts)).toEqual({ total: 4, correct: 3, accuracy: 75 });
    expect(attemptStats(attempts, attempt => !attempt.correct).accuracy).toBe(0);
  });
  it('marks confidence and low CQ scores as weak chapters', () => {
    const data = freshData();
    data.confidence[physics.id] = 'weak';
    const weak = weakChapters(plan, data);
    expect(weak[0].chapterId).toBe(physics.id);
    expect(weak[0].reasons.join(' ')).toContain('দুর্বল');
  });
  it('builds a weekly review and the next seven days', () => {
    const data = freshData();
    data.studySessions.push(session('2026-11-14', 60));
    const review = weeklyReview(plan, data, '2026-11-14');
    expect(review.weekStart).toBe('2026-11-09');
    expect(review.minutes).toBe(60);
    expect(review.nextWeek).toHaveLength(7);
    expect(review.targetMinutes).toBe(data.settings.dailyHours * 60 * 6);
    const first = chapterTasks(plan, physics.id)[0];
    data.completed[first.id] = '2026-11-14T08:00:00.000Z';
    expect(weeklyReview(plan, data, '2026-11-14').tasksCompleted).toBe(1);
  });
});

it('excludes future records from the current weekly review so far', () => {
  const data = freshData();
  data.studySessions.push(session('2026-11-16', 30), session('2026-11-18', 120));
  data.tests.push({ id: 'future', kind: 'subject', title: 'Future', subject: 'physics', chapterIds: [], score: 80, total: 100, durationMin: 60, date: '2026-11-18', at: '2026-11-16T08:00:00Z', notes: '' });
  data.attempts.push({ id: 'future', questionId: 'q', subject: 'physics', chosen: 0, correct: true, date: '2026-11-18', at: '2026-11-16T08:00:00Z' });
  const review = weeklyReview(plan, data, '2026-11-16');
  expect(review.minutes).toBe(30);
  expect(review.bySubject.physics).toBe(30);
  expect(review.daysStudied).toBe(1);
  expect(review.tests).toBe(0);
  expect(review.mcq.total).toBe(0);
});
