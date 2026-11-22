import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { addDays } from './planner';
import { personalDataFixture, personalRoutineFixture, personalWorkload } from './test/personalRoutineFixture';
import { activePersonalCategory, buildPersonalStudyProjection, personalCategory, personalChapterPairs, personalRoutineHealth, personalStageSourceId, WORK_STAGES } from './personalRoutine';
import { buildStudyPlan } from './studyPlan';
import { actionableReminderPlan } from './notifications';

const ids = ['physics-1-3', 'physics-1-2', 'physics-1-1', 'biology-2-12'];
const stamp = '2026-11-20T10:00:00.000Z';
function sample() {
  const data = personalDataFixture(ids);
  data.personalPhases = { S: personalRoutineFixture([ids[0]]) };
  data.personalRoutine = { ...personalRoutineFixture([...ids].reverse()), scope: 'ALL', workloads: Object.fromEntries(ids.map(id => [id, personalWorkload(1)])), windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })), dailyLimitMinutes: 1440, breakMinutes: 0 };
  data.settings.examDate = addDays(data.settings.startDate, 30);
  return data;
}
function complete(data: ReturnType<typeof sample>, id: string) {
  for (const stage of WORK_STAGES) if (data.personalRoutine!.workloads[id][stage.id].minutes) data.completed[personalStageSourceId(data.personalRoutine!, id, stage.id)] = stamp;
}
const pendingOn = (data: ReturnType<typeof sample>, date: string) => buildStudyPlan(data, date).find(day => day.date === date)?.tasks.filter(task => task.personalWork && !data.completed[task.id]) || [];

describe('all-chapter category order', () => {
  it('uses the saved S shortlist once, honours custom priority, and pairs within categories', () => {
    const data = sample();
    data.chapterMeta[ids[1]] = { note: '', weak: false, cq: 'none', mcq: 'none', updatedAt: stamp, priority: 'B' };
    const pairs = personalChapterPairs(data.personalRoutine!, data);
    expect(pairs.flat()).toHaveLength(ids.length);
    expect(new Set(pairs.flat()).size).toBe(ids.length);
    expect(pairs.map(pair => pair.map(id => personalCategory(data, id)))).toEqual([['S'], ['B'], ['B'], ['C']]);
    expect(personalCategory(data, ids[0])).toBe('S');
  });
  it('projects categories in order, but unlocks today only after all prior work is actually complete, including after undo', () => {
    const data = sample(), start = data.settings.startDate;
    const snapshot = JSON.stringify(data);
    const plan = buildStudyPlan(data, start);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(plan.flatMap(day => day.tasks).filter(t => t.personalWork).map(t => ['S', 'A', 'B', 'C'].indexOf(personalCategory(data, t.chapterIds[0])))).toEqual(expect.arrayContaining([0, 1, 2, 3]));
    const order = plan.flatMap(day => day.tasks).filter(t => t.personalWork).map(t => ['S', 'A', 'B', 'C'].indexOf(personalCategory(data, t.chapterIds[0])));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(pendingOn(data, start).every(t => t.chapterIds[0] === ids[0])).toBe(true);
    expect(activePersonalCategory(data)).toBe('S');
    expect(actionableReminderPlan(plan, data).flatMap(d => d.tasks).filter(t => t.personalWork).every(t => t.chapterIds[0] === ids[0])).toBe(true);
    complete(data, ids[0]);
    expect(activePersonalCategory(data)).toBe('A');
    expect(pendingOn(data, addDays(start, 1)).some(t => t.chapterIds[0] === ids[1])).toBe(true);
    complete(data, ids[1]); expect(activePersonalCategory(data)).toBe('B');
    complete(data, ids[2]); expect(activePersonalCategory(data)).toBe('C');
    delete data.completed[personalStageSourceId(data.personalRoutine!, ids[0], 'class')];
    expect(activePersonalCategory(data)).toBe('S');
    expect(pendingOn(data, addDays(start, 5)).every(t => t.chapterIds[0] === ids[0])).toBe(true);
  });
  it('never advances past unknown or inadequate work and reports a real shortfall', () => {
    const data = sample();
    data.personalRoutine!.workloads[ids[0]].class.minutes = null;
    const projected = buildPersonalStudyProjection(data);
    expect(projected.unknownChapters).toContain(ids[0]);
    expect(buildStudyPlan(data, data.settings.startDate).flatMap(d => d.tasks).filter(t => t.personalWork).map(t => t.chapterIds[0])).not.toContain(ids[1]);
    data.personalRoutine!.workloads[ids[0]] = personalWorkload(300);
    data.settings.examDate = addDays(data.settings.startDate, 1);
    data.personalRoutine!.dailyLimitMinutes = 30;
    const plan = buildStudyPlan(data, data.settings.startDate);
    expect(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'deadline' || issue.code === 'missing-allocation')).toBe(true);
    expect(data.personalRoutine!.chapterIds).toEqual([...ids].reverse());
  });
  it('holds a manually moved later-category task without deleting the edit or prior evidence', () => {
    const data = sample(), start = data.settings.startDate;
    const later = buildPersonalStudyProjection(data).plan.flatMap(d => d.tasks).find(t => t.chapterIds[0] === ids[1])!;
    data.taskEdits[later.id] = { date: start };
    data.notes[start] = 'keep this note';
    const plan = buildStudyPlan(data, start);
    expect(plan.find(d => d.date === start)?.unscheduled?.some(t => t.id === later.id)).toBe(true);
    expect(plan.find(d => d.date === start)?.tasks.some(t => t.personalWork && t.chapterIds[0] === ids[1])).toBe(false);
    expect(data.taskEdits[later.id].date).toBe(start);
    expect(data.notes[start]).toBe('keep this note');
  });
  it('uses the recommended S shortlist without dropping any chapter', () => {
    const data = sample(); data.personalPhases = {};
    data.personalRoutine!.chapterIds = CHAPTERS.map(c => c.id);
    const pairs = personalChapterPairs(data.personalRoutine!, data);
    expect(pairs.flat()).toHaveLength(CHAPTERS.length);
    expect(new Set(pairs.flat()).size).toBe(CHAPTERS.length);
    const ranks = pairs.flat().map(id => ['S', 'A', 'B', 'C'].indexOf(personalCategory(data, id)));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
