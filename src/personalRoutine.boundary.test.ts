import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from './i18n';
import { addDays, shiftPlanStart } from './planner';
import { applyScheduleSettings } from './reschedule';
import { buildStudyPlan } from './studyPlan';
import { parseBackup } from './storage';
import { WORK_STAGES, applyPersonalRoutine, hasFullPersonalAllocation, isPersonalTaskComplete, nextPersonalRoutine, setPersonalStageCompletion } from './personalRoutine';
import { PERSONAL_IDS, personalDataFixture, personalWorkload } from './test/personalRoutineFixture';
import type { AppData } from './planner';

beforeEach(() => setLanguage('en'));
function finishS(data: AppData): AppData {
  for (const id of PERSONAL_IDS) for (const stage of WORK_STAGES) {
    if (!['mcqClass', 'cqClass'].includes(stage.id)) data = setPersonalStageCompletion(data, id, stage.id, true, '2026-11-23T12:00:00Z');
  }
  return data;
}
function laterPhase(startsOn = '2026-11-24'): AppData {
  let data = finishS(personalDataFixture());
  const next = nextPersonalRoutine(data, startsOn)!;
  next.chapterIds = next.chapterIds.slice(0, 2);
  next.workloads = Object.fromEntries(next.chapterIds.map(id => [id, personalWorkload(60)]));
  data = applyPersonalRoutine(data, next, { asOf: startsOn });
  return data;
}

describe('personal phase date boundaries', () => {
  it('rejects a Settings deadline before the active phase can start without changing any saved data', () => {
    const data = laterPhase(), before = JSON.stringify(data);
    expect(() => applyScheduleSettings(data, { ...data.settings, testExamDate: '2026-11-21', examDate: '2026-11-23' })).toThrow(/phase start/i);
    expect(JSON.stringify(data)).toBe(before);
    expect(parseBackup(before)).toEqual(data);
  });

  it('keeps the confirmed phase/archive dates and real evidence when linked planning dates move', () => {
    const data = laterPhase(), before = JSON.stringify(data), dates = shiftPlanStart(data.settings, '2026-12-01');
    data.notes['2026-11-23'] = 'Actual note date';
    const next = applyScheduleSettings(data, dates), plan = buildStudyPlan(next, dates.startDate);
    expect(next.personalRoutine!.startsOn).toBe('2026-11-24');
    expect(next.personalPhases).toBe(data.personalPhases);
    expect(next.completed).toBe(data.completed);
    expect(next.notes).toBe(data.notes);
    expect(plan.flatMap(day => day.tasks).filter(task => !isPersonalTaskComplete(task, next.completed)).every(task => task.date >= dates.startDate)).toBe(true);
    expect(parseBackup(JSON.stringify(next))).toEqual(next);
    expect(JSON.parse(before).personalRoutine).toEqual(data.personalRoutine);
  });

  it('does not backdate a retained later phase when an undone prerequisite is re-completed', () => {
    let data = laterPhase('2026-11-26');
    data = setPersonalStageCompletion(data, PERSONAL_IDS[0], 'revision', false);
    data = setPersonalStageCompletion(data, PERSONAL_IDS[0], 'revision', true, '2026-11-24T12:00:00Z');
    const retained = data.personalPhases!.A!, next = nextPersonalRoutine(data, '2026-11-24')!;
    expect(next.startsOn).toBe(retained.startsOn);
    data = applyPersonalRoutine(data, next, { asOf: '2026-11-24' });
    expect(data.personalRoutine!.startsOn).toBe('2026-11-26');
    expect(buildStudyPlan(data, '2026-11-24').flatMap(day => day.tasks).every(task => task.date >= '2026-11-26')).toBe(true);
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });

  it('does not skip a retained out-of-horizon A phase to offer B after reopening S', () => {
    let data = laterPhase('2026-11-26');
    data = setPersonalStageCompletion(data, PERSONAL_IDS[0], 'revision', false);
    data = setPersonalStageCompletion(data, PERSONAL_IDS[0], 'revision', true, '2026-11-24T12:00:00Z');
    data = applyScheduleSettings(data, { ...data.settings, testExamDate: '2026-11-22', examDate: '2026-11-25' });
    const before = JSON.stringify(data);
    expect(nextPersonalRoutine(data, '2026-11-24')).toBeUndefined();
    expect(JSON.stringify(data)).toBe(before);
    expect(data.personalPhases!.A!.startsOn).toBe('2026-11-26');
    expect(parseBackup(before)).toEqual(data);
  });
});

describe('personal session breaks around retained reservations', () => {
  it.each([0, 2])('honours the selected break around a fixed custom appointment, with reflow offset %s', offset => {
    const data = personalDataFixture(), routine = data.personalRoutine!, date = addDays(data.settings.startDate, offset);
    routine.sessionMinutes = 30; routine.breakMinutes = 10;
    data.routineBlocks = [{ id: 'fixed-session', date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), startMinute: 1140, minutes: 30, subject: 'physics', title: 'Fixed study appointment', createdAt: '2026-11-16T10:00:00Z' }];
    const before = JSON.stringify(data), plan = buildStudyPlan(data, date), day = plan.find(day => day.date === date)!;
    const custom = day.tasks.find(task => task.kind === 'custom')!;
    expect(custom).toMatchObject({ startMinute: 1140, endMinute: 1170 });
    expect(day.tasks.some(task => task.personalWork)).toBe(true);
    for (let i = 1; i < day.tasks.length; i++) expect(day.tasks[i].startMinute - day.tasks[i - 1].endMinute).toBeGreaterThanOrEqual(routine.breakMinutes);
    for (const id of PERSONAL_IDS) expect(hasFullPersonalAllocation(data, plan, id)).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('keeps an explicit unpaid source pin and its clock time while leaving breaks on both sides', () => {
    const data = personalDataFixture(), routine = data.personalRoutine!;
    routine.sessionMinutes = 30; routine.breakMinutes = 10;
    const baseline = buildStudyPlan(data, data.settings.startDate), pinned = baseline[0].tasks[0], date = addDays(data.settings.startDate, 2);
    data.taskEdits[pinned.id] = { date };
    data.dayOverrides[date] = { taskStartMinutes: { [pinned.id]: 1140 } };
    const before = JSON.stringify(data), plan = buildStudyPlan(data, date), day = plan.find(day => day.date === date)!;
    expect(day.tasks.find(task => task.id === pinned.id)).toMatchObject({ startMinute: 1140, endMinute: 1170 });
    for (let i = 1; i < day.tasks.length; i++) expect(day.tasks[i].startMinute - day.tasks[i - 1].endMinute).toBeGreaterThanOrEqual(routine.breakMinutes);
    for (const id of PERSONAL_IDS) expect(hasFullPersonalAllocation(data, plan, id)).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
  });
});
