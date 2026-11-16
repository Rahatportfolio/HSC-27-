import { describe, expect, it } from 'vitest';
import { CHAPTERS, CORE, PAPERS } from './data';
import {
  addDays, addMonths, applyDayOverrides, applyRoutine, buildPlan, chapterLastDate, chapterTasks,
  DEFAULT_SETTINGS, diffDays, effectiveDailyHours, formatDayOffset, freshData, getNextUnfinishedDay,
  getPhases, getStats, getUnfinishedPastTasks, isChapterDone, isDayComplete, isTaskCurrent, isValidDate,
  taskStart, todayKey,
} from './planner';

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

describe('2-subjects-per-day February 2027 Test Exam study plan', () => {
  const plan = buildPlan({ ...DEFAULT_SETTINGS, sCategoryMode: false, testExamDate: '2027-02-01' });
  const tasks = plan.flatMap(d => d.tasks);

  it('has a 2-subject routine for every date and unique task IDs', () => {
    expect(plan).toHaveLength(181);
    expect(new Set(tasks.map(t => t.id)).size).toBe(tasks.length);
    expect(plan.every((d, i) => d.date === addDays('2026-11-14', i) && d.index === i + 1)).toBe(true);
    for (const day of plan) {
      const distinctSubjects = new Set(day.tasks.map(t => t.subject));
      expect(distinctSubjects.size).toBeLessThanOrEqual(2);
      if (day.phase === 'learn') {
        const distinctChapters = new Set(day.tasks.flatMap(t => t.chapterIds));
        expect(distinctChapters.size).toBeLessThanOrEqual(2);
      }
    }
  });

  it('allocates 8h/day in Nov 2026 and boosts to 12h/day from Dec 2026, with non-overlapping sessions', () => {
    for (const day of plan) {
      const expectedMin = effectiveDailyHours(DEFAULT_SETTINGS, day.date) * 60;
      expect(day.tasks.reduce((n, t) => n + t.endMinute - t.startMinute, 0)).toBe(expectedMin);
      if (day.date < '2026-12-01') expect(expectedMin).toBe(8 * 60);
      else expect(expectedMin).toBe(12 * 60);
      for (let i = 1; i < day.tasks.length; i++) expect(day.tasks[i].startMinute).toBeGreaterThanOrEqual(day.tasks[i - 1].endMinute);
    }
  });

  it('finishes every part of all 114 chapters BEFORE the February 2027 Test Exam, A before B', () => {
    expect(DEFAULT_SETTINGS.testExamDate).toBe('2027-01-01');
    for (const c of CHAPTERS) {
      const sessions = chapterTasks(plan, c.id);
      expect(sessions, c.title).toHaveLength(c.effort);
      expect(sessions.every(t => t.phase === 'learn'), c.title).toBe(true);
      expect(chapterLastDate(plan, c.id)! < '2027-02-01', `${c.title} finishes before Feb 2027`).toBe(true);
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

  it('supports flexible 4 to 18 daily hours and preserves chapter task IDs when start date shifts', () => {
    for (const hours of [6, 8, 12, 16, 18]) {
      const customPlan = buildPlan({ ...DEFAULT_SETTINGS, dailyHours: hours, boostEnabled: false });
      expect(customPlan.every(d => d.tasks.reduce((n, t) => n + t.endMinute - t.startMinute, 0) === hours * 60)).toBe(true);
    }
    const shifted = buildPlan({ ...DEFAULT_SETTINGS, startDate: '2027-01-31' });
    const shiftedTasks = shifted.flatMap(d => d.tasks);
    expect(new Set(shiftedTasks.filter(t => t.id.includes(':part-')).map(t => t.id))).toEqual(new Set(tasks.filter(t => t.id.includes(':part-')).map(t => t.id)));
    expect(shiftedTasks.filter(t => t.kind === 'exam').map(t => t.id)).toEqual(tasks.filter(t => t.kind === 'exam').map(t => t.id));
    expect(new Set(shiftedTasks.map(t => t.id)).size).toBe(shiftedTasks.length);
    expect(shifted[0].date).toBe('2027-01-31');
  });

  it('cascades all subsequent session times automatically when start time, daily hours, or a slot changes', () => {
    const day0 = plan[0];
    const overridden = applyDayOverrides(plan, {
      [day0.date]: { startMinute: 10 * 60, dailyHours: 12 },
    }, DEFAULT_SETTINGS)[0];
    expect(overridden.tasks[0].startMinute).toBe(600);
    expect(overridden.tasks.reduce((n, t) => n + (t.endMinute - t.startMinute), 0)).toBe(12 * 60);
    for (let i = 1; i < overridden.tasks.length; i++) {
      expect(overridden.tasks[i].startMinute).toBeGreaterThan(overridden.tasks[i - 1].endMinute);
    }
    // Shifting task[1] start time to 15:00 cascades task[2] and task[3] automatically
    const slotShifted = applyDayOverrides(plan, {
      [day0.date]: { taskStartMinutes: { [day0.tasks[1].id]: 15 * 60 } },
    }, DEFAULT_SETTINGS)[0];
    expect(slotShifted.tasks[1].startMinute).toBe(900);
    expect(slotShifted.tasks[2].startMinute).toBeGreaterThan(slotShifted.tasks[1].endMinute);
  });

  it('surfaces unfinished past tasks and auto-advances to the next day upon completion', () => {
    const completed: Record<string, string> = {};
    // On day 2, day 1 tasks are unfinished
    const pastUnfinished = getUnfinishedPastTasks(plan, plan[1].date, completed);
    expect(pastUnfinished.length).toBe(plan[0].tasks.length);
    // Complete all of day 1 -> day 1 is complete, and next unfinished day is day 2
    for (const tk of plan[0].tasks) completed[tk.id] = '2026-11-14T18:00:00Z';
    expect(isDayComplete(plan[0], completed)).toBe(true);
    expect(getNextUnfinishedDay(plan, plan[0].date, completed)?.date).toBe(plan[1].date);
    expect(getUnfinishedPastTasks(plan, plan[1].date, completed)).toHaveLength(0);
  });

  it('handles late-start sessions that cross midnight', () => {
    const late = buildPlan({ ...DEFAULT_SETTINGS, startTime: '22:00', dailyHours: 10, boostEnabled: false });
    const crossing = late[0].tasks.find(t => t.startMinute >= 1440)!;
    expect(crossing).toBeTruthy();
    expect(taskStart(crossing).date).toBe(addDays(late[0].date, 1));
    expect(formatDayOffset(crossing.startMinute)).toContain('+১ দিন');
    expect(isTaskCurrent(crossing, addDays(late[0].date, 1), crossing.startMinute % 1440)).toBe(true);
    expect(isTaskCurrent(crossing, late[0].date, 23 * 60)).toBe(false);
    const data = freshData();
    expect(getStats(late, data, late[0].date).backlog).toHaveLength(0);
    expect(getStats(late, data, addDays(late[0].date, 1)).backlog.some(t => t.id === crossing.id)).toBe(false);
    expect(getStats(late, data, addDays(late[0].date, 2)).backlog.some(t => t.id === crossing.id)).toBe(true);
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

describe('custom weekly routine', () => {
  it('adds a tagged block to every matching weekday without mutating the base plan', () => {
    const plan = buildPlan();
    const date = plan[0].date;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const block = { id: 'block-1', weekday, startMinute: 20 * 60, minutes: 45, subject: 'math' as const, title: 'নিজের গণিত সেশন', createdAt: '2026-11-01T00:00:00.000Z' };
    const custom = applyRoutine(plan, [block]);
    const task = custom[0].tasks.find(item => item.id === `custom-${date}-block-1`);
    expect(task).toMatchObject({ kind: 'custom', subject: 'math', startMinute: 1200, endMinute: 1245, title: 'নিজের গণিত সেশন' });
    expect(custom[0].tasks.length).toBe(plan[0].tasks.length + 1);
    expect(plan[0].tasks.some(item => item.kind === 'custom')).toBe(false);
    const otherDay = custom.find(day => new Date(`${day.date}T00:00:00Z`).getUTCDay() !== weekday)!;
    expect(otherDay.tasks.some(item => item.kind === 'custom')).toBe(false);
  });
  it('returns the same plan when there are no blocks', () => {
    const plan = buildPlan();
    expect(applyRoutine(plan, [])).toBe(plan);
  });
});

describe('chapter and personalized task synchronization', () => {
  it('requires chapter practice as well as initial learning for progress and revision', async () => {
    const { chapterStudyTasks } = await import('./planner');
    const { chapterCompletionDate } = await import('./revision');
    const plan = buildPlan();
    const chapter = CHAPTERS.find(c => chapterStudyTasks(plan, c.id).some(task => task.id.startsWith('chap-practice-')))!;
    expect(chapter).toBeTruthy();
    const tasks = chapterStudyTasks(plan, chapter.id);
    const completed: Record<string, string> = {};
    tasks.filter(task => task.kind !== 'practice').forEach(task => { completed[task.id] = '2026-11-14T08:00:00Z'; });
    expect(isChapterDone(plan, chapter.id, completed)).toBe(false);
    expect(chapterCompletionDate(plan, chapter.id, completed)).toBeNull();
    tasks.forEach(task => { completed[task.id] = '2026-11-14T08:00:00Z'; });
    expect(isChapterDone(plan, chapter.id, completed)).toBe(true);
    expect(chapterCompletionDate(plan, chapter.id, completed)).toBe('2026-11-14');
  });
  it('applies a custom task time and duration override after merging weekly blocks', () => {
    const plan = buildPlan(), date = plan[0].date;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const routine = applyRoutine(plan, [{ id: 'block', weekday, startMinute: 1200, minutes: 45, subject: 'math', title: 'Practice', createdAt: '2026-11-01T00:00:00Z' }]);
    const id = `custom-${date}-block`;
    const overridden = applyDayOverrides(routine, { [date]: { taskStartMinutes: { [id]: 1300 }, taskMinutes: { [id]: 90 } } }, DEFAULT_SETTINGS);
    expect(overridden[0].tasks.find(task => task.id === id)).toMatchObject({ startMinute: 1300, endMinute: 1390 });
  });
  it('places one-off tasks only on their date and uses Dhaka dates for weekly block activation', () => {
    const plan = buildPlan(), date = plan[0].date;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const block = { id: 'block', weekday, startMinute: 1200, minutes: 45, subject: 'math' as const, title: 'Practice', createdAt: '2026-11-14T20:00:00Z' };
    const weekly = applyRoutine(plan, [block]);
    expect(weekly[0].tasks.some(task => task.kind === 'custom')).toBe(false);
    expect(weekly[7].tasks.some(task => task.kind === 'custom')).toBe(true);
    const oneOff = applyRoutine(plan, [{ ...block, date }]);
    expect(oneOff[0].tasks.some(task => task.kind === 'custom')).toBe(true);
    expect(oneOff[7].tasks.some(task => task.kind === 'custom')).toBe(false);
  });
});

describe('schedule override safety', () => {
  it('keeps exact unrelated durations and prevents a custom start overlapping the prior session', () => {
    const plan = buildPlan(), date = plan[0].date;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const routine = applyRoutine(plan, [{ id: 'odd', date, weekday, startMinute: 1250, minutes: 47, subject: 'math', title: 'Practice', createdAt: '2026-11-01T00:00:00Z' }]);
    const tasks = routine[0].tasks;
    const id = `custom-${date}-odd`;
    const result = applyDayOverrides(routine, { [date]: { taskStartMinutes: { [id]: 1 } } }, DEFAULT_SETTINGS)[0].tasks;
    const index = tasks.findIndex(task => task.id === id);
    expect(index).toBeGreaterThan(0);
    expect(result[index].startMinute).toBeGreaterThanOrEqual(result[index - 1].endMinute);
    expect(result[index].endMinute - result[index].startMinute).toBe(47);
  });
});
