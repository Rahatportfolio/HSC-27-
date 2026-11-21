import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { addDays } from './planner';
import { buildStudyPlan } from './studyPlan';
import { parseBackup } from './storage';
import { personalDataFixture, personalRoutineFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { applyAllChapterRoutine, applyPersonalRoutine, newPersonalRoutine, parsePersonalRoutine, personalRoutineHealth, personalSessionForStage, personalStageDone, personalStageSourceId } from './personalRoutine';

const stamp = '2026-11-20T10:00:00.000Z';
describe('all-chapter personal routine', () => {
  it('plans all 114 chapters in class, notes, practice order when enough time is available', () => {
    const data = personalDataFixture(); const routine = newPersonalRoutine('ALL');
    routine.windows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }));
    routine.dailyLimitMinutes = 600; routine.breakMinutes = 0; data.personalRoutine = parsePersonalRoutine(routine);
    data.settings.testExamDate = addDays(data.settings.startDate, 600); data.settings.examDate = addDays(data.settings.startDate, 700);
    const plan = buildStudyPlan(data, data.settings.startDate);
    for (const chapter of CHAPTERS) {
      const stages = plan.flatMap(day => day.tasks).filter(task => task.chapterIds.includes(chapter.id) && task.personalWork).map(task => personalSessionForStage(task.personalWork!.stage).id);
      expect(new Set(stages), chapter.id).toEqual(new Set(['class', 'notes', 'practice']));
      expect(stages.map(stage => ['class', 'notes', 'practice'].indexOf(stage)), chapter.id).toEqual(stages.map(stage => ['class', 'notes', 'practice'].indexOf(stage)).sort((a, b) => a - b));
    }
    expect(parseBackup(JSON.stringify(data)).personalRoutine?.chapterIds).toEqual(CHAPTERS.map(chapter => chapter.id));
    expect(() => parsePersonalRoutine({ ...routine, chapterIds: routine.chapterIds.slice(1) })).toThrow();
  });
  it('retains phase work, different speeds, source evidence and data through migration, editing and backup', () => {
    const data = personalDataFixture([PERSONAL_IDS[0]]);
    const s = data.personalRoutine!; s.playbackSpeed = 2;
    const aId = CHAPTERS.find(c => c.priority === 'A' && c.id !== PERSONAL_IDS[0])!.id;
    const a = { ...personalRoutineFixture([aId]), scope: 'A' as const, playbackSpeed: 1.25 as const, startsOn: addDays(data.settings.startDate, 5) };
    data.personalPhases = { S: s }; data.personalRoutine = a;
    const sSource = personalStageSourceId(s, PERSONAL_IDS[0], 'class'), aSource = personalStageSourceId(a, aId, 'class');
    data.completed[sSource] = stamp; data.completed[aSource] = stamp; data.notes[data.settings.startDate] = 'preserve me';
    const migrated = applyAllChapterRoutine(data, buildStudyPlan(data, data.settings.startDate));
    const routine = migrated.personalRoutine!;
    expect(routine.chapterIds).toHaveLength(114);
    expect(personalStageSourceId(routine, PERSONAL_IDS[0], 'class')).toBe(sSource);
    expect(personalStageSourceId(routine, aId, 'class')).toBe(aSource);
    expect(personalStageDone(routine, PERSONAL_IDS[0], 'class', migrated.completed)).toBe(true);
    expect(personalStageDone(routine, aId, 'class', migrated.completed)).toBe(true);
    expect(migrated.personalPhases?.S).toEqual(s); expect(migrated.personalPhases?.A).toEqual(a);
    expect(migrated.notes).toEqual(data.notes); expect(migrated.completed).toEqual(data.completed);
    expect(parseBackup(JSON.stringify(migrated))).toEqual(migrated);
    const edited = applyPersonalRoutine(migrated, { ...routine, sessionMinutes: 60 }, { plan: buildStudyPlan(migrated, data.settings.startDate) });
    expect(edited.personalPhases).toEqual(migrated.personalPhases);
    expect(personalStageSourceId(edited.personalRoutine!, PERSONAL_IDS[0], 'class')).toBe(sSource);
    expect(parseBackup(JSON.stringify(edited))).toEqual(edited);
  });
  it('reports capacity shortages and refuses migration while dates are locked', () => {
    const data = personalDataFixture(); const plan = buildStudyPlan(data, data.settings.startDate);
    data.lockedDates = [data.settings.startDate];
    expect(() => applyAllChapterRoutine(data, plan)).toThrow();
    expect(data.personalRoutine?.scope).toBe('S');
    data.lockedDates = [];
    const migrated = applyAllChapterRoutine(data, plan);
    const health = personalRoutineHealth(migrated, buildStudyPlan(migrated, data.settings.startDate));
    expect(health.issues.length).toBeGreaterThan(0);
    expect(migrated.personalRoutine?.scope).toBe('ALL');
  });
});
