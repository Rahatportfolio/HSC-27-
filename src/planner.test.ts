import { describe, expect, it } from 'vitest';
import { CHAPTERS, CORE, PAPERS } from './data';
import { addDays, addMonths, buildPlan, chapterTasks, DEFAULT_SETTINGS, diffDays, freshData, getPhases, getStats, isChapterDone, isValidDate, todayKey } from './planner';

describe('Bangladesh date helpers', () => {
  it('uses Dhaka calendar dates at an UTC boundary', () => { expect(todayKey(new Date('2026-11-13T20:00:00Z'))).toBe('2026-11-14'); });
  it('clamps month addition and handles leap years', () => { expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); expect(addMonths('2026-11-14', 6)).toBe('2027-05-14'); });
  it('rejects invalid and out-of-range dates', () => { expect(isValidDate('2026-02-30')).toBe(false); expect(isValidDate('2026-11-14')).toBe(true); expect(isValidDate('1999-01-01')).toBe(false); });
  it('builds the agreed 3 + 2 + 1 calendar-month phases inclusively', () => {
    const phases = getPhases(DEFAULT_SETTINGS.startDate);
    expect(phases.map(p => [p.start, p.end, p.days])).toEqual([
      ['2026-11-14', '2027-02-13', 92], ['2027-02-14', '2027-04-13', 59], ['2027-04-14', '2027-05-13', 30],
    ]);
    expect(phases.reduce((n, p) => n + p.days, 0)).toBe(181);
  });
});
describe('complete study plan', () => {
  const plan = buildPlan();
  const tasks = plan.flatMap(d => d.tasks);
  it('has a routine for every date and unique task IDs', () => {
    expect(plan).toHaveLength(181);
    expect(new Set(tasks.map(t => t.id)).size).toBe(tasks.length);
    expect(plan.every((d, i) => d.date === addDays('2026-11-14', i) && d.index === i + 1)).toBe(true);
    expect(plan.every(d => d.tasks.length >= 5 && d.tasks.length <= 6)).toBe(true);
  });
  it('allocates exactly eight net study hours per day, with ordered non-overlapping sessions', () => {
    for (const day of plan) {
      expect(day.tasks.reduce((n, t) => n + t.endMinute - t.startMinute, 0)).toBe(480);
      for (let i = 1; i < day.tasks.length; i++) expect(day.tasks[i].startMinute).toBeGreaterThanOrEqual(day.tasks[i - 1].endMinute);
    }
  });
  it('schedules every part of every chapter in the syllabus phase, A before B', () => {
    for (const c of CHAPTERS) {
      const sessions = chapterTasks(plan, c.id);
      expect(sessions, c.title).toHaveLength(c.effort);
      expect(sessions.every(t => t.phase === 'learn'), c.title).toBe(true);
    }
    for (const subject of [...CORE, 'bangla', 'english', 'ict']) for (const paper of [1, 2]) {
      const a = CHAPTERS.filter(c => c.subject === subject && c.paper === paper && c.priority === 'A');
      const b = CHAPTERS.filter(c => c.subject === subject && c.paper === paper && c.priority === 'B');
      if (a.length && b.length) expect(Math.max(...a.flatMap(c => chapterTasks(plan, c.id).map(t => t.dayIndex)))).toBeLessThan(Math.min(...b.flatMap(c => chapterTasks(plan, c.id).map(t => t.dayIndex))));
    }
  });
  it('revisits every science chapter in both revision rounds', () => {
    for (const c of CHAPTERS.filter(c => CORE.includes(c.subject))) {
      expect(tasks.filter(t => t.kind === 'revision' && t.id.startsWith('revision-1-') && t.chapterIds.includes(c.id)), c.title).toHaveLength(1);
      expect(tasks.filter(t => t.kind === 'revision' && t.id.startsWith('revision-2-') && t.chapterIds.includes(c.id)), c.title).toHaveLength(1);
    }
  });
  it('includes 13 distinct full model tests only in the final phase', () => {
    const exams = tasks.filter(t => t.kind === 'exam');
    expect(exams).toHaveLength(13);
    expect(new Set(exams.map(t => t.paperId)).size).toBe(PAPERS.length);
    expect(exams.every(t => t.phase === 'exam' && t.endMinute - t.startMinute === 180)).toBe(true);
  });
  it('supports six or ten hours and preserves task IDs when the start changes', () => {
    for (const hours of [6, 10]) expect(buildPlan({ ...DEFAULT_SETTINGS, dailyHours: hours }).every(d => d.tasks.reduce((n, t) => n + t.endMinute - t.startMinute, 0) === hours * 60)).toBe(true);
    const shifted = buildPlan({ ...DEFAULT_SETTINGS, startDate: '2027-01-31' });
    const shiftedTasks = shifted.flatMap(d => d.tasks);
    expect(shiftedTasks.filter(t => t.id.includes(':part-')).map(t => t.id)).toEqual(tasks.filter(t => t.id.includes(':part-')).map(t => t.id));
    expect(shiftedTasks.filter(t => t.kind === 'exam').map(t => t.id)).toEqual(tasks.filter(t => t.kind === 'exam').map(t => t.id));
    expect(new Set(shiftedTasks.map(t => t.id)).size).toBe(shiftedTasks.length);
    expect(shifted[0].date).toBe('2027-01-31');
  });
  it('counts a chapter only after all its parts, and counts active-day streaks', () => {
    const data = freshData(), c = CHAPTERS[0], sessions = chapterTasks(plan, c.id);
    data.completed[sessions[0].id] = '2026-11-14T08:00:00Z';
    expect(isChapterDone(plan, c.id, data.completed)).toBe(false);
    for (const t of sessions) data.completed[t.id] = '2026-11-14T08:00:00Z';
    expect(isChapterDone(plan, c.id, data.completed)).toBe(true);
    data.completed['extra'] = '2026-11-13T08:00:00Z';
    expect(getStats(plan, data, '2026-11-14').streak).toBe(2);
    expect(getStats(plan, data, '2026-11-16').streak).toBe(0);
    expect(diffDays(plan[0].date, plan[plan.length - 1].date)).toBe(180);
  });
});
