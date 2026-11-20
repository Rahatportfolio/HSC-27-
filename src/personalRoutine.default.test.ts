import { describe, expect, it } from 'vitest';
import { freshData } from './planner';
import type { AppData } from './planner';
import { buildStudyPlan } from './studyPlan';
import {
  DEFAULT_CHAPTER_MINUTES, RECOMMENDED_S_IDS, WORK_STAGES,
  chapterWorkEstimate, defaultChapterStudyPlan, estimatedChapterWorkload, newPersonalRoutine,
  parsePersonalRoutine, personalRoutineHealth, workloadFor,
} from './personalRoutine';
import type { ChapterWorkload } from './personalRoutine';

const WINDOWS = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 480, endMinute: 960 }));
const independent = (id: string) => { const plan = defaultChapterStudyPlan(id); return { reading: plan.reading, notes: plan.notes, mcqPractice: plan.mcqPractice, cqPractice: plan.cqPractice, revision: plan.revision }; };

/** A profile saved by the old build: every chapter present, every duration unknown. */
function blankRoutine() {
  const routine = newPersonalRoutine();
  routine.windows = WINDOWS;
  routine.sessionMinutes = 60;
  routine.breakMinutes = 5;
  routine.workloads = Object.fromEntries(routine.chapterIds.map(id => {
    const work = {} as ChapterWorkload;
    for (const stage of WORK_STAGES) work[stage.id] = { minutes: null, source: 'unknown' };
    return [id, work];
  }));
  return routine;
}
const tasks = (data: AppData) => buildStudyPlan(data, data.settings.startDate).flatMap(day => day.tasks);
const scheduledMinutes = (data: AppData) => tasks(data).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);

describe('default 20-hour chapter budget', () => {
  it('spends exactly 1200 minutes per chapter, identical for every priority', () => {
    expect(DEFAULT_CHAPTER_MINUTES).toBe(1200);
    for (const id of RECOMMENDED_S_IDS) {
      const plan = defaultChapterStudyPlan(id);
      expect(WORK_STAGES.reduce((sum, stage) => sum + plan[stage.id], 0)).toBe(DEFAULT_CHAPTER_MINUTES);
      expect(estimatedChapterWorkload(id).class).toMatchObject({ minutes: 480, source: 'default24' });
    }
    expect(independent(RECOMMENDED_S_IDS[0])).toEqual({ reading: 240, notes: 120, mcqPractice: 120, cqPractice: 180, revision: 60 });
  });

  it('marks every stage of the estimate as a default, never as measured student data', () => {
    const workload = estimatedChapterWorkload(RECOMMENDED_S_IDS[0]);
    for (const stage of WORK_STAGES) expect(workload[stage.id].source).toBe('default24');
    expect(WORK_STAGES.filter(stage => workload[stage.id].minutes === null)).toEqual([]);
    expect(chapterWorkEstimate(newPersonalRoutine(), RECOMMENDED_S_IDS[0]).complete).toBe(true);
  });

  it('a brand-new routine with no duration entry still yields real scheduled work', () => {
    const data = freshData();
    data.personalRoutine = { ...newPersonalRoutine(), windows: WINDOWS, sessionMinutes: 60, breakMinutes: 5 };
    const plan = tasks(data);
    expect(plan.length).toBeGreaterThan(0);
    expect(scheduledMinutes(data)).toBe(RECOMMENDED_S_IDS.length * DEFAULT_CHAPTER_MINUTES);
    const health = personalRoutineHealth(data, buildStudyPlan(data, data.settings.startDate));
    // No chapter is blocked on unknown durations any more. The only remaining
    // note is the honest capacity one: 20 h per chapter needs extra days.
    expect(health.missingDurations).toBe(false);
    expect(health.issues.map(issue => issue.code)).toEqual(['two-day-capacity']);
  });

  it('a saved all-unknown profile becomes scheduled instead of rendering blank', () => {
    const data = freshData();
    const restored = parsePersonalRoutine(blankRoutine());
    data.personalRoutine = restored;
    for (const id of restored.chapterIds) expect(workloadFor(restored, id).class).toMatchObject({ minutes: 480, source: 'default24' });
    const plan = tasks(data);
    expect(plan.length).toBeGreaterThan(0);
    expect(scheduledMinutes(data)).toBe(restored.chapterIds.length * DEFAULT_CHAPTER_MINUTES);
  });

  it('never overwrites a duration the student or a probe already provided', () => {
    const routine = blankRoutine();
    routine.workloads[routine.chapterIds[0]].class = { minutes: 150, source: 'student', url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    const restored = parsePersonalRoutine(routine);
    expect(restored.workloads[routine.chapterIds[0]].class).toMatchObject({ minutes: 150, source: 'student', url: 'https://www.youtube.com/watch?v=abcdefghijk' });
    // the rest of a partly-known chapter is untouched: filling is all-or-nothing
    expect(restored.workloads[routine.chapterIds[0]].reading).toEqual({ minutes: null, source: 'unknown' });
    // chapters with nothing known are filled
    expect(restored.workloads[routine.chapterIds[1]].reading.source).toBe('default24');
  });

  it('keeps an explicit zero-minute optional stage a valid choice', () => {
    const routine = blankRoutine();
    for (const stage of WORK_STAGES) routine.workloads[routine.chapterIds[0]][stage.id] = { minutes: 0, source: 'student' };
    routine.workloads[routine.chapterIds[0]].reading = { minutes: 600, source: 'student' };
    const restored = parsePersonalRoutine(routine);
    expect(restored.workloads[routine.chapterIds[0]].mcqClass).toMatchObject({ minutes: 0, source: 'student' });
    expect(restored.workloads[routine.chapterIds[0]].reading).toEqual({ minutes: 600, source: 'student' });
  });

  it('round-trips the defaults through save and reload unchanged', () => {
    const routine = parsePersonalRoutine(blankRoutine());
    const again = parsePersonalRoutine(JSON.parse(JSON.stringify(routine)));
    expect(again).toEqual(routine);
    expect(again.workloads[again.chapterIds[0]].class.source).toBe('default24');
  });

  it('replaces the estimate when the student later raises it in settings', () => {
    const routine = parsePersonalRoutine(blankRoutine());
    const id = routine.chapterIds[0];
    routine.workloads[id].class = { minutes: 900, source: 'student' };
    const saved = parsePersonalRoutine(JSON.parse(JSON.stringify(routine)));
    expect(saved.workloads[id].class.minutes).toBe(900);
    const data = freshData();
    data.personalRoutine = saved;
    const chapterTotal = (chapter: string) => WORK_STAGES.reduce((sum, stage) => sum + (saved.workloads[chapter][stage.id].minutes || 0), 0);
    expect(scheduledMinutes(data)).toBe(saved.chapterIds.reduce((sum, chapter) => sum + chapterTotal(chapter), 0));
    expect(chapterTotal(id)).toBe(1620);
  });

  it('still rejects genuinely invalid durations', () => {
    const routine = blankRoutine();
    routine.workloads[routine.chapterIds[0]].class.minutes = -1;
    expect(() => parsePersonalRoutine(routine)).toThrow();
    const unknownDisguised = blankRoutine();
    unknownDisguised.workloads[unknownDisguised.chapterIds[0]].class = { minutes: null, source: 'student' };
    expect(() => parsePersonalRoutine(unknownDisguised)).toThrow();
  });

  it('collapses the "needs extra days" fact into one warning, not one per chapter pair', () => {
    const data = freshData();
    data.personalRoutine = { ...newPersonalRoutine(), windows: WINDOWS, sessionMinutes: 60, breakMinutes: 5,
      workloads: Object.fromEntries(newPersonalRoutine().chapterIds.map(id => [id, estimatedChapterWorkload(id)])) };
    const plan = buildStudyPlan(data, data.settings.startDate);
    const spill = plan.flatMap(day => day.tasks).length ? personalRoutineHealth(data, plan) : null;
    expect(spill!.issues.filter(issue => issue.code === 'two-day-capacity')).toHaveLength(1);
    expect(spill!.warnings).toHaveLength(1);
    // Everything is still scheduled and finishable — nothing was dropped.
    expect(plan.flatMap(day => day.tasks).length).toBeGreaterThan(0);
    expect(spill!.missingDurations).toBe(false);
    expect(spill!.syllabusEnd).toBeDefined();
  });

  it('survives a save/reload with the estimate already in the completed history', () => {
    // The 2026-11-20 Android reload failure: saved tasks carried
    // durationSource 'default24' but the history parser only knew the old four,
    // so the whole AppData was rejected and the home screen never appeared.
    const data = freshData();
    data.personalRoutine = { ...newPersonalRoutine(), windows: WINDOWS, sessionMinutes: 60, breakMinutes: 5 };
    const first = buildStudyPlan(data, data.settings.startDate).flatMap(day => day.tasks).slice(0, 40);
    expect(first.every(task => task.personalWork!.durationSource === 'default24')).toBe(true);
    data.personalRoutine.history = first.map(task => ({ ...task, sourceMinutes: task.personalWork!.rawMinutes }));
    const restored = parsePersonalRoutine(JSON.parse(JSON.stringify(data.personalRoutine)));
    expect(restored.history).toHaveLength(first.length);
    expect(restored.history!.every(task => task.personalWork!.durationSource === 'default24')).toBe(true);
    const again = buildStudyPlan({ ...data, personalRoutine: restored }, data.settings.startDate).flatMap(day => day.tasks);
    expect(again).toHaveLength(933);
    expect(again.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0)).toBe(RECOMMENDED_S_IDS.length * DEFAULT_CHAPTER_MINUTES);
  });
});
