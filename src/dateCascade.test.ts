import { beforeEach, describe, expect, it } from 'vitest';
import { CHAPTERS, CORE, PAPERS } from './data';
import { setLanguage } from './i18n';
import {
  addDays, applyDayOverrides, buildPlan, chapterStudyTasks, DEFAULT_SETTINGS, diffDays, freshData,
  getPhases, hasFullTaskAllocation, isChapterDone, scheduleDateError, shiftPlanStart, todayKey,
} from './planner';
import type { Settings } from './planner';
import { applyScheduleSettings } from './reschedule';
import { planHealth } from './planHealth';
import { scheduleFor } from './schedule';
import { parseBackup } from './storage';
import { emptyAdvanced } from './advanced';
import { integrateStudyPlan, remainingTaskMinutes } from './smartSchedule';
import { chapterCompletionDate, ensureRevisions } from './revision';
import { chapterStage } from './learning';
import { categoryScheduleDates } from './prediction';
import { testPrepStats } from './testPrep';
import { makeICS, makeMarkdown } from './exports';
import { buildOrdinaryStudyPlan, buildStudyPlan } from './studyPlan';
import { buildDailyNotificationDigest } from './notifications';
import { setTaskCompletion } from './study';

beforeEach(() => setLanguage('en'));
/** Pin the settings the contract assertions were written against; the shipped default is today-relative. */
const PIN = { ...DEFAULT_SETTINGS, startDate: '2026-11-20', boostStartDate: '2026-12-07' };
const base = buildPlan(PIN);
const allIds = (settings: Settings) => buildPlan(settings).flatMap(day => day.tasks.map(task => task.id));
const endAt = (task: { date: string; endMinute: number }) => Date.parse(`${task.date}T00:00:00Z`) + task.endMinute * 60000;
const midnight = (date: string) => Date.parse(`${date}T00:00:00Z`);

describe('date-cascade contract', () => {
  it('starts on 20 November and fits all promised work before the two personal targets', () => {
    expect(DEFAULT_SETTINGS.startDate).toBe(todayKey());
    expect(DEFAULT_SETTINGS.boostStartDate).toBe(addDays(todayKey(), 17));
    expect(PIN.startDate).toBe('2026-11-20');
    expect(PIN.boostStartDate).toBe('2026-12-07');
    expect(base).toHaveLength(198);
    expect(base.at(-1)?.date).toBe('2027-06-05');
    expect(planHealth(base, PIN)).toMatchObject({
      syllabusEnd: '2027-01-29', missingParts: 0, missingMocks: 0, missingRevisionPasses: 0, warnings: [],
    });
  });

  it('moves all linked targets and every generated task by the same calendar-day offset', () => {
    const shifted = shiftPlanStart(PIN, '2026-11-26');
    expect(shifted).toMatchObject({ boostStartDate: '2026-12-13', testExamDate: '2027-02-07', examDate: '2027-06-12' });
    const plan = buildPlan(shifted);
    const md = makeMarkdown(plan, { ...freshData(), settings: shifted });
    expect(md).toContain(`**বাড়তি পর্যায়:** ${shifted.boostStartDate}`);
    expect(md).toContain(shifted.testExamDate);
    expect(md).toContain(shifted.examDate);
    expect(plan.flatMap(day => day.tasks.map(task => task.id))).toEqual(allIds(PIN));
    base.forEach((day, i) => expect(plan[i]).toMatchObject({ date: addDays(day.date, 6), phase: day.phase, index: day.index }));
  });

  it('cascades a global session-time change through every ordinary slot and its calendar export', () => {
    const data = freshData(); data.settings.adaptiveEnabled = false;
    const next = applyScheduleSettings(data, { ...data.settings, startTime: '05:30' });
    const original = buildStudyPlan(data, '2026-11-16');
    const plan = buildStudyPlan(next, '2026-11-16');
    expect(plan).toHaveLength(original.length);
    plan.forEach((day, i) => day.tasks.forEach((task, k) => {
      expect(task.startMinute).toBe(original[i].tasks[k].startMinute - 60);
      expect(task.endMinute).toBe(original[i].tasks[k].endMinute - 60);
    }));
    expect(makeICS(plan[0].tasks, next)).toContain('DTSTART;TZID=Asia/Dhaka:20261120T053000');
    expect(next.settings.calendarRevision).toBe(1);
  });

  it('does not invent study hours or claim completion before a future start', () => {
    const data = freshData();
    const digest = buildDailyNotificationDigest(buildStudyPlan(data, '2026-11-16'), data, '2026-11-16');
    expect(digest).toMatchObject({ totalMinutes: 0, totalTasks: 0, doneMinutes: 0, allDone: false });
    expect(digest.remainingSummary).toBe('No scheduled sessions');
    expect(digest.whatToStudy).toContain('No scheduled study');
  });

  it('keeps externally set exam deadlines fixed while moving the boost and recomputing phases', () => {
    const fixed = shiftPlanStart({ ...PIN, examDatePolicy: 'fixed' }, '2026-12-01');
    expect(fixed).toMatchObject({ boostStartDate: '2026-12-18', testExamDate: '2027-02-01', examDate: '2027-06-06' });
    const phases = getPhases(fixed);
    expect(phases[0]).toMatchObject({ start: '2026-12-01', end: '2027-01-31', days: 62 });
    expect(buildPlan(fixed).at(-1)?.date).toBe('2027-06-05');
    expect(planHealth(buildPlan(fixed), fixed).missingParts).toBeGreaterThan(0);
  });

  it.each(['2020-01-01', '2024-01-31', '2024-02-29', '2026-12-31', '2028-02-29', '2040-12-31'])(
    'keeps a contiguous, unique, complete plan across month/year/leap boundaries: %s', start => {
      const settings = shiftPlanStart(PIN, start);
      const phases = getPhases(settings);
      const plan = buildPlan(settings);
      expect(phases.reduce((n, phase) => n + phase.days, 0)).toBe(plan.length);
      expect(plan).toHaveLength(198);
      phases.forEach((phase, i) => {
        expect(diffDays(phase.start, phase.end) + 1).toBe(phase.days);
        if (i) expect(phase.start).toBe(addDays(phases[i - 1].end, 1));
      });
      expect(plan.every((day, i) => day.date === addDays(start, i) && day.index === i + 1)).toBe(true);
      const ids = plan.flatMap(day => day.tasks.map(task => task.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(allIds(PIN));
      expect(planHealth(plan, settings).warnings).toEqual([]);
    },
  );

  it('keeps exact daily minutes and all task instants before the test/board cutoffs, including late starts', () => {
    for (const hours of [4, 8, 12, 16, 18]) for (const startTime of ['00:00', '04:55', '06:30', '22:00', '23:59']) {
      const settings = { ...PIN, startTime, dailyHours: hours, boostEnabled: false };
      const plan = buildPlan(settings);
      expect(plan.length, `${hours}h ${startTime}`).toBeGreaterThan(0);
      for (const day of plan) {
        expect(day.tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0)).toBe(hours * 60);
        day.tasks.forEach((task, i) => {
          expect(task.endMinute).toBeGreaterThan(task.startMinute);
          expect(endAt(task)).toBeLessThanOrEqual(midnight(settings.examDate));
          if (task.phase === 'learn') expect(endAt(task)).toBeLessThanOrEqual(midnight(settings.testExamDate));
          if (i) expect(task.startMinute).toBeGreaterThanOrEqual(day.tasks[i - 1].endMinute);
        });
      }
      expect(planHealth(plan, settings).warnings).toEqual([]);
    }
  });

  it.each([
    { startDate: '2026-02-30' }, { startDate: '2027-02-01' }, { testExamDate: '2027-06-06' },
    { examDate: '2026-12-01' }, { boostStartDate: '2026-11-19' }, { boostStartDate: '2027-06-06' },
    { examDate: '2030-01-01' }, { startTime: '' }, { dailyHours: 99 },
  ])('rejects an invalid or reversed schedule without fabricating dates: %j', patch => {
    const settings = { ...PIN, ...patch };
    expect(scheduleDateError(settings)).toBeTruthy();
    expect(buildPlan(settings)).toEqual([]);
    expect(() => applyScheduleSettings(freshData(), settings)).toThrow();
  });

  it('allows clearing a dependent draft field without crashing a subsequent start-date edit', () => {
    expect(shiftPlanStart({ ...PIN, boostStartDate: '' }, '2026-11-21').boostStartDate).toBe('');
    expect(() => shiftPlanStart(PIN, '')).toThrow();
  });
});

describe('safe date transactions', () => {
  it('moves all scheduled customisations together while retaining real history and one-off task references', () => {
    const data = freshData();
    const date = '2026-11-22', moved = '2026-11-28';
    const at = '2026-11-20T20:00:00.000Z';
    const chapterTask = base[0].tasks[0];
    const customId = `custom-${date}-one`;
    data.routineBlocks = [
      { id: 'one', date, weekday: 0, startMinute: 900, minutes: 30, subject: 'physics', title: 'Pending', createdAt: at },
      { id: 'done', date, weekday: 0, startMinute: 950, minutes: 30, subject: 'physics', title: 'Completed', createdAt: at },
      { id: 'weekly', weekday: 4, startMinute: 1000, minutes: 30, subject: 'math', title: 'Class', createdAt: at },
    ];
    data.completed = { [chapterTask.id]: at, [`custom-${date}-done`]: at };
    data.notes[date] = 'Actual note';
    data.studySessions.push({ id: 'logged', date, at, minutes: 30, subject: 'physics', mode: 'stopwatch' });
    data.revisions.push({ id: 'recall', chapterId: CHAPTERS[0].id, subject: CHAPTERS[0].subject, dueDate: date, interval: 1, createdAt: at, adjusted: true });
    data.importantDates.push({ id: 'official', date, title: 'Absolute appointment', note: '', notify: true, createdAt: at });
    data.dayOverrides[date] = { startMinute: 500, dailyHours: 5, taskMinutes: { [customId]: 45 }, taskStartMinutes: { [customId]: 950 } };
    data.taskEdits = { [chapterTask.id]: { date: '2026-11-23', title: 'Done history' }, [customId]: { date: '2026-11-23', title: 'Move me' } };
    data.removedTasks = [customId];
    data.carryovers = [{ id: 'carry', taskId: customId, date, fromDate: '2026-11-21', title: 'Pending', subject: 'physics', minutes: 30, createdAt: at }];
    data.advanced = { ...emptyAdvanced(), targets: { [date]: 300 }, dailyGoals: { [date]: { mcq: 20, cq: 2, revision: 1, locked: false } }, coverageDates: { [CHAPTERS[0].id]: date }, activityDates: [date] };
    const before = JSON.stringify(data);
    const next = applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'));
    const nextId = `custom-${moved}-one`;
    expect(next.dayOverrides[moved]).toEqual({ startMinute: 500, dailyHours: 5, taskMinutes: { [nextId]: 45 }, taskStartMinutes: { [nextId]: 950 } });
    expect(next.dayOverrides[date]).toBeUndefined();
    expect(next.routineBlocks[0]).toMatchObject({ date: moved, weekday: 6 });
    expect(next.routineBlocks[1]).toEqual(data.routineBlocks[1]);
    expect(next.routineBlocks[2]).toEqual(data.routineBlocks[2]);
    expect(next.taskEdits[nextId]).toMatchObject({ date: '2026-11-29' });
    expect(next.taskEdits[chapterTask.id].date).toBe('2026-11-23');
    expect(next.removedTasks).toEqual([nextId]);
    expect(next.carryovers[0]).toMatchObject({ taskId: nextId, date: moved, fromDate: '2026-11-27', createdAt: at });
    expect(next.advanced?.targets).toEqual({ [moved]: 300 });
    expect(next.advanced?.dailyGoals?.[moved]).toEqual(data.advanced.dailyGoals?.[date]);
    for (const key of ['completed', 'notes', 'studySessions', 'revisions', 'importantDates', 'exams'] as const) expect(next[key]).toBe(data[key]);
    expect(next.advanced?.coverageDates).toBe(data.advanced.coverageDates);
    expect(next.advanced?.activityDates).toBe(data.advanced.activityDates);
    expect(parseBackup(JSON.stringify(next))).toEqual(next);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('retains partial one-off task evidence under the new id, and leaves fully completed split work on its real date', () => {
    const data = freshData();
    const date = '2026-11-22', source = `custom-${date}-one`;
    data.routineBlocks = [{ id: 'one', date, weekday: 0, title: 'Own task', startMinute: 1200, minutes: 60, subject: 'physics', createdAt: '2026-11-16T06:00:00Z' }];
    data.dayOverrides[date] = { taskMinutes: { [source]: 60 } };
    const first = `smart-part|${encodeURIComponent(source)}|0|30`;
    const last = `smart-part|${encodeURIComponent(source)}|30|60`;
    const at = '2026-11-22T14:00:00Z';
    data.completed[first] = at;
    const next = applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'));
    const moved = 'custom-2026-11-28-one';
    expect(next.completed[first]).toBeUndefined();
    expect(next.completed).toEqual({ [`smart-part|${encodeURIComponent(moved)}|0|30`]: at });
    const task = buildOrdinaryStudyPlan(next).flatMap(day => day.tasks).find(task => task.id === moved)!;
    expect(remainingTaskMinutes(task, next).reduce((sum, range) => sum + range.to - range.from, 0)).toBe(30);
    expect(data.completed).toEqual({ [first]: at });
    expect(parseBackup(JSON.stringify(next)).completed).toEqual(next.completed);
    data.completed[last] = at;
    data.carryovers = [{ id: 'legacy-done', taskId: source, date, fromDate: date, title: 'Own task', subject: 'physics', minutes: 60, createdAt: at }];
    const full = applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'));
    expect(full.routineBlocks[0].date).toBe(date);
    expect(full.completed).toBe(data.completed);
    expect(full.carryovers[0]).toBe(data.carryovers[0]);
  });

  it('keeps the completion-entry count reload-safe even at the evidence limit', () => {
    const data = freshData();
    const source = 'custom-2026-11-22-one';
    const at = '2026-11-22T14:00:00Z';
    data.routineBlocks = [{ id: 'one', date: '2026-11-22', weekday: 0, title: 'Own task', startMinute: 1200, minutes: 60, subject: 'physics', createdAt: '2026-11-16T06:00:00Z' }];
    data.completed = Object.fromEntries(Array.from({ length: 9999 }, (_, i) => [`old-${i}`, at]));
    data.completed[`smart-part|${encodeURIComponent(source)}|0|30`] = at;
    const next = applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'));
    expect(Object.keys(next.completed)).toHaveLength(10000);
    expect(Object.values(next.completed)).toEqual(Object.values(data.completed));
    expect(parseBackup(JSON.stringify(next)).completed).toEqual(next.completed);
    expect(data.completed[`smart-part|${encodeURIComponent(source)}|0|30`]).toBe(at);
  });

  it('cannot resurrect an undone partial task after shifting the start back and reloading', () => {
    const data = freshData();
    const source = 'custom-2026-11-22-one';
    data.routineBlocks = [{ id: 'one', date: '2026-11-22', weekday: 0, title: 'Own task', startMinute: 1200, minutes: 60, subject: 'physics', createdAt: '2026-11-16T06:00:00Z' }];
    data.completed[`smart-part|${encodeURIComponent(source)}|0|30`] = '2026-11-22T14:00:00Z';
    const shifted = applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'));
    const moved = 'custom-2026-11-28-one';
    const undone = setTaskCompletion(shifted, [`smart-part|${encodeURIComponent(moved)}|0|30`], false);
    const back = parseBackup(JSON.stringify(applyScheduleSettings(undone, shiftPlanStart(undone.settings, data.settings.startDate))));
    expect(back.completed).toEqual({});
    const task = buildOrdinaryStudyPlan(back).flatMap(day => day.tasks).find(task => task.id === source)!;
    expect(remainingTaskMinutes(task, back)).toEqual([{ from: 0, to: 60 }]);
  });

  it('rejects remapped task-id collisions rather than overwriting saved edits', () => {
    const data = freshData();
    data.routineBlocks = [{ id: 'one', date: '2026-11-22', weekday: 0, title: 'Own task', startMinute: 1200, minutes: 60, subject: 'physics', createdAt: '2026-11-16T06:00:00Z' }];
    data.taskEdits = { 'custom-2026-11-22-one': { title: 'First' }, 'custom-2026-11-28-one': { title: 'Second' } };
    const before = JSON.stringify(data);
    expect(() => applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'))).toThrow(/collide/);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('rejects a completion-evidence id collision without touching either timestamp', () => {
    const data = freshData();
    data.routineBlocks = [{ id: 'one', date: '2026-11-22', weekday: 0, title: 'Own task', startMinute: 1200, minutes: 60, subject: 'physics', createdAt: '2026-11-16T06:00:00Z' }];
    data.completed = {
      'smart-part|custom-2026-11-22-one|0|30': '2026-11-22T14:00:00Z',
      'smart-part|custom-2026-11-28-one|0|30': '2026-11-23T14:00:00Z',
    };
    const before = JSON.stringify(data);
    expect(() => applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'))).toThrow(/completion evidence/);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('refuses to regenerate a locked routine rather than silently moving locked work', () => {
    const data = freshData();
    data.lockedDates = [data.settings.startDate];
    const before = JSON.stringify(data);
    expect(() => applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'))).toThrow(/Unlock/);
    expect(JSON.stringify(data)).toBe(before);
    expect(applyScheduleSettings(data, { ...data.settings, name: 'Student' }).settings.name).toBe('Student');
  });

  it('rejects collisions and customisations falling outside a shortened horizon without losing either record', () => {
    const data = freshData();
    data.dayOverrides['2027-06-05'] = { dailyHours: 5 };
    data.dayOverrides['2027-06-11'] = { dailyHours: 7 };
    const before = JSON.stringify(data);
    expect(() => applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'))).toThrow(/collide/);
    expect(JSON.stringify(data)).toBe(before);
    expect(() => applyScheduleSettings(data, { ...data.settings, examDate: '2027-06-01' })).toThrow(/outside/);
    expect(JSON.stringify(data)).toBe(before);
  });

  it.each(['testExamDate', 'examDate'] as const)('regenerates exports and increments the calendar sequence when only %s changes', key => {
    const data = freshData();
    const settings = { ...data.settings, [key]: addDays(data.settings[key], 1) };
    const next = applyScheduleSettings(data, settings);
    expect(next.settings.calendarRevision).toBe(1);
    const plan = buildPlan(next.settings);
    const phases = getPhases(next.settings);
    expect(key === 'testExamDate' ? phases[0].end : phases[2].end).toBe(addDays(settings[key], -1));
    expect(makeICS(plan.at(-1)!.tasks, next)).toContain('SEQUENCE:1\r\n');
    const md = makeMarkdown(plan, next);
    expect(md).toContain(settings[key]);
    expect(md).toContain(phases[2].end);
    expect(applyScheduleSettings(next, { ...next.settings, name: 'Other' }).settings.calendarRevision).toBe(1);
  });

  it('restores legacy dates exactly and retains an inconsistent old profile for repair instead of resetting it', () => {
    const data = freshData();
    const raw = { ...data, settings: { ...data.settings, startDate: '2026-11-14', boostStartDate: '2026-12-01', examDatePolicy: undefined } };
    const legacy = parseBackup(JSON.stringify(raw));
    expect(legacy.settings).toMatchObject({ startDate: '2026-11-14', boostStartDate: '2026-12-01', testExamDate: '2027-02-01', examDate: '2027-06-06', examDatePolicy: 'shift' });
    raw.settings.startDate = '2027-05-01';
    raw.notes['2026-11-14'] = 'Do not erase me';
    const repairable = parseBackup(JSON.stringify(raw));
    expect(repairable.notes['2026-11-14']).toBe('Do not erase me');
    expect(buildPlan(repairable.settings)).toEqual([]);
  });
});

describe('date-dependent progress and metadata', () => {
  it('does not mark a partly allocated chapter complete or create recall cards for its missing parts', () => {
    const data = freshData();
    data.settings = { ...data.settings, startDate: '2027-01-20', boostEnabled: false };
    const plan = buildPlan(data.settings);
    const chapter = CHAPTERS.find(c => {
      const parts = chapterStudyTasks(plan, c.id).filter(task => task.id.includes(':part-'));
      return parts.length > 0 && parts.length < c.effort;
    })!;
    expect(chapter).toBeTruthy();
    chapterStudyTasks(plan, chapter.id).forEach(task => { data.completed[task.id] = '2027-01-31T08:00:00Z'; });
    expect(isChapterDone(plan, chapter.id, data.completed)).toBe(false);
    expect(chapterStage(chapter, data, plan)).toBe('inProgress');
    expect(chapterCompletionDate(plan, chapter.id, data.completed)).toBeNull();
    expect(ensureRevisions(plan, data).revisions.filter(item => item.chapterId === chapter.id)).toEqual([]);
    const health = planHealth(plan, data.settings);
    expect(health.missingParts).toBeGreaterThan(0);
    expect(health.syllabusEnd).toBeUndefined();
    expect(health.warnings.join(' ')).toContain('not full coverage');
  });

  it('does not treat a visible fragment, duplicate range or a gap as a complete learning part', () => {
    const task = base[0].tasks[0];
    const total = task.endMinute - task.startMinute;
    const half = total / 2;
    const segment = (from: number, to: number) => ({
      ...task, id: `smart-part|${encodeURIComponent(task.id)}|${from}|${to}`, originalTaskId: task.id,
      sourceMinutes: total, endMinute: task.startMinute + to - from,
    });
    const first = segment(0, half);
    const partial = base.map(day => ({ ...day, tasks: day.tasks.map(item => item.id === task.id ? first : item) }));
    const completed = Object.fromEntries(partial.flatMap(day => day.tasks).map(item => [item.id, '2026-11-26T08:00:00Z']));
    expect(hasFullTaskAllocation([first], task.id)).toBe(false);
    expect(hasFullTaskAllocation([first, first], task.id)).toBe(false);
    expect(hasFullTaskAllocation([segment(0, half - 1), segment(half, total)], task.id)).toBe(false);
    expect(isChapterDone(partial, task.chapterIds[0], completed)).toBe(false);
    expect(planHealth(partial, PIN, completed).missingParts).toBe(1);
    const last = segment(half, total);
    expect(hasFullTaskAllocation([first, last], task.id)).toBe(true);
    expect(hasFullTaskAllocation([last], task.id, { [first.id]: completed[first.id] }, true)).toBe(true);
    expect(hasFullTaskAllocation([last], task.id, { [first.id]: completed[first.id] })).toBe(false);
  });

  it('promotes only fully finished split work to stable completion and can undo it without resurrecting old ranges', () => {
    const task = base[0].tasks[0];
    const total = task.endMinute - task.startMinute;
    const segment = (from: number, to: number) => ({ ...task,
      id: `smart-part|${encodeURIComponent(task.id)}|${from}|${to}`, originalTaskId: task.id,
      sourceMinutes: total, startMinute: task.startMinute + from, endMinute: task.startMinute + to,
    });
    const first = segment(0, total / 2), last = segment(total / 2, total);
    const plan = [{ ...base[0], tasks: [first, last] }];
    let data = setTaskCompletion(freshData(), [first.id], true, plan);
    expect(data.completed[task.id]).toBeUndefined();
    data = setTaskCompletion(data, [last.id], true, plan);
    expect(data.completed[task.id]).toBeTruthy();
    const shifted = applyScheduleSettings(data, { ...shiftPlanStart(data.settings, '2026-11-26'), dailyHours: 12 });
    expect(shifted.completed[task.id]).toBe(data.completed[task.id]);
    expect(remainingTaskMinutes({ ...task, endMinute: task.startMinute + total * 2 }, shifted)).toEqual([]);
    const undone = setTaskCompletion(shifted, [last.id], false, plan);
    expect(undone.completed[task.id]).toBeUndefined();
    expect(undone.completed[first.id]).toBeTruthy();
    const allUndone = setTaskCompletion(data, [task.id], false, base);
    expect(allUndone.completed[first.id]).toBeUndefined();
    expect(allUndone.completed[last.id]).toBeUndefined();
  });

  it('warns about removed chapter practice even when every learning part remains allocated', () => {
    const chapter = CHAPTERS.find(item => item.effort === 1)!;
    const plan = base.map(day => ({ ...day, tasks: day.tasks.filter(task => !task.id.startsWith(`chap-practice-${chapter.id}-`)) }));
    const health = planHealth(plan, PIN);
    expect(health.missingParts).toBe(0);
    expect(health.missingPractice).toBe(1);
    expect(health.syllabusEnd).toBeUndefined();
    expect(health.warnings.join(' ')).toContain('chapter-practice');
  });

  it('does not complete a chapter when its required accompanying practice was omitted', () => {
    const chapter = CHAPTERS.find(chapter => chapter.effort === 1)!;
    const tasks = chapterStudyTasks(base, chapter.id);
    const practice = tasks.find(task => task.id.startsWith('chap-practice-'))!;
    expect(practice).toBeTruthy();
    const data = freshData();
    tasks.filter(task => task.id !== practice.id).forEach(task => { data.completed[task.id] = '2027-01-30T08:00:00Z'; });
    const shortened = base.map(day => ({ ...day, tasks: day.tasks.filter(task => task.id !== practice.id) }));
    expect(isChapterDone(shortened, chapter.id, data.completed)).toBe(false);
    expect(ensureRevisions(shortened, data).revisions.filter(card => card.chapterId === chapter.id)).toEqual([]);
    data.completed[practice.id] = '2027-01-30T09:00:00Z';
    expect(isChapterDone(shortened, chapter.id, data.completed)).toBe(true);
  });

  it('preserves completed canonical work and its real recall anchor when a shorter plan no longer contains it', () => {
    let data = freshData();
    const chapter = CHAPTERS.at(-1)!;
    const at = '2026-11-26T20:00:00Z'; // Dhaka date is the 27th, not the 26th.
    chapterStudyTasks(base, chapter.id).forEach(task => { data.completed[task.id] = at; });
    data = ensureRevisions(base, data);
    expect(data.revisions.filter(item => item.chapterId === chapter.id)).toHaveLength(5);
    const shorter = buildPlan({ ...data.settings, startDate: '2027-01-31', boostEnabled: false });
    expect(chapterStudyTasks(shorter, chapter.id)).toHaveLength(0);
    expect(isChapterDone(shorter, chapter.id, data.completed)).toBe(true);
    expect(chapterCompletionDate(shorter, chapter.id, data.completed)).toBe('2026-11-27');
    expect(ensureRevisions(shorter, data).revisions).toEqual(data.revisions);
  });

  it('derives chapter hours/dates and category completion from live initial study, not the old static schedule or later revision', () => {
    const settings = { ...shiftPlanStart(PIN, '2026-12-01'), dailyHours: 6, boostEnabled: false };
    const plan = buildPlan(settings);
    const chapter = CHAPTERS[0];
    const tasks = chapterStudyTasks(plan, chapter.id);
    const slot = scheduleFor(chapter.id, plan)!;
    expect(slot.start).toBe(tasks[0].date);
    expect(slot.hours).toBe(Math.round(tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) / 6) / 10);
    expect(scheduleFor(chapter.id, [])).toMatchObject({ hours: 0, start: undefined, end: undefined });
    const category = categoryScheduleDates(plan, { A: new Set(CHAPTERS.map(c => c.id)), B: new Set(), C: new Set() });
    expect(category.A).toBe(planHealth(plan, settings).syllabusEnd);
    expect(category.A! < settings.testExamDate).toBe(true);
    expect(plan.flatMap(day => day.tasks).filter(task => task.kind === 'revision').some(task => task.date > category.A!)).toBe(true);
  });

  it('calculates test-prep demand from initial A-study only, and counts missing allocations instead of reporting zero work', () => {
    const data = freshData();
    const initial = CHAPTERS.filter(c => c.priority === 'A').flatMap(chapter => chapterStudyTasks(base, chapter.id));
    expect(testPrepStats(data, base, '2026-11-16').remainingATasks).toBe(initial.length);
    expect(testPrepStats(data, base, '2026-11-16').daysLeft).toBe(73);
    expect(testPrepStats(data, [], '2026-11-20').remainingATasks).toBeGreaterThan(0);
    expect(testPrepStats(data, base, '2027-02-02').warning).toBe('overdue');
    expect(CORE.length).toBe(4);
    expect(PAPERS.length).toBe(13);
  });

  it('does not re-count completed A-learning as fresh demand when a shorter plan no longer contains it', () => {
    const data = freshData(); data.settings = { ...data.settings, startDate: '2027-01-31', boostEnabled: false };
    const plan = buildPlan(data.settings);
    const chapter = CHAPTERS.find(chapter => chapter.priority === 'A' && !chapterStudyTasks(plan, chapter.id).length)!;
    const before = testPrepStats(data, plan, '2027-01-31').remainingATasks;
    for (let part = 1; part <= chapter.effort; part++) data.completed[`${chapter.id}:part-${part}`] = '2027-01-30T08:00:00Z';
    expect(testPrepStats(data, plan, '2027-01-31').remainingATasks).toBe(before - chapter.effort);
  });

  it('does not call a customised plan conflict-free when a personal block overlaps another session', () => {
    const data = freshData(); data.settings.adaptiveEnabled = false;
    data.routineBlocks = [{ id: 'clash', date: base[0].date, weekday: 5, title: 'Personal work', subject: 'physics', startMinute: base[0].tasks[0].startMinute, minutes: 60, createdAt: '2026-11-16T06:00:00Z' }];
    const plan = buildStudyPlan(data, '2026-11-16');
    const health = planHealth(plan, data.settings, data.completed);
    expect(health.clashingSessions).toBeGreaterThan(0);
    expect(health.warnings.join(' ')).toContain('sessions overlap');
  });

  it('shows an explicit warning when a manual time override spills past the board target', () => {
    const plan = applyDayOverrides(base, { '2027-06-05': { startMinute: 1430 } }, PIN);
    expect(planHealth(plan, PIN).deadlineOverruns).toBeGreaterThan(0);
    expect(planHealth(plan, PIN).warnings.join(' ')).toContain('past the board target');
  });

  it('reports missing model tests and revision passes in a genuinely short final preparation window', () => {
    const settings = { ...PIN, examDate: '2027-02-04' };
    const health = planHealth(buildPlan(settings), settings);
    expect(health.missingRevisionPasses).toBeGreaterThan(0);
    expect(health.missingMocks).toBeGreaterThan(0);
    expect(health.warnings.join(' ')).toContain('mock papers do not fit');
  });
});

describe('integrated lecture deadline', () => {
  it('defers a whole mock paper instead of turning its last available hour into a false full exam', () => {
    const data = freshData();
    data.settings = { ...data.settings, startTime: '23:00', boostEnabled: false, testExamDate: '2026-11-21', examDate: '2026-11-25' };
    data.advanced = { ...emptyAdvanced(), classes: [{
      id: 'watched', title: 'Done', url: 'https://example.org/a.mp4', chapterId: CHAPTERS[0].id,
      teacher: 'T', duration: 60, position: 60, watched: 60, speed: 1, permitted: true, note: '',
    }] };
    const paper = base.flatMap(day => day.tasks).find(task => task.kind === 'exam')!;
    const date = '2026-11-24';
    const plan = integrateStudyPlan([{ ...base[0], date, tasks: [{ ...paper, date }] }], data, date);
    expect(plan.flatMap(day => day.tasks).filter(task => task.kind === 'exam')).toEqual([]);
    expect(plan.reduce((sum, day) => sum + (day.deferredMinutes || 0), 0)).toBe(180);
  });

  it('never begins before the chosen start, never extends past the board target, and accounts for every deferred minute', () => {
    const data = freshData();
    data.settings.adaptiveEnabled = false;
    data.advanced = { ...emptyAdvanced(), classes: [{
      id: 'huge', title: 'Long course', url: 'https://example.org/a.mp4', chapterId: CHAPTERS[0].id,
      teacher: 'T', duration: 2_000_000, position: 0, watched: 0, speed: 1, permitted: true, note: '',
    }] };
    const original = buildPlan(data.settings);
    const plan = integrateStudyPlan(original, data, '2026-11-16');
    expect(plan[0].date).toBe('2026-11-20');
    expect(plan.at(-1)!.date < data.settings.examDate).toBe(true);
    expect(plan.flatMap(day => day.tasks).every(task => endAt(task) <= midnight(data.settings.examDate))).toBe(true);
    const scheduled = plan.flatMap(day => day.tasks).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
    const requested = original.flatMap(day => day.tasks).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) + 2_000_000 / 60 * 1.5;
    const deferred = plan.reduce((sum, day) => sum + (day.deferredMinutes || 0), 0);
    expect(deferred).toBeGreaterThan(0);
    expect(scheduled + deferred).toBeCloseTo(requested, 4);
    expect(planHealth(plan, data.settings).warnings.join(' ')).toContain('do not fit before the board target');
  });
});
