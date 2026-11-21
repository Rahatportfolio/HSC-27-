import { describe, expect, it } from 'vitest';
import { addDays, freshData } from './planner';
import { hasStudyData, needsBackup } from './backup';
import { applyPersonalRoutine, personalStageSourceId, WORK_STAGES, hasFullPersonalAllocation, isPersonalTaskComplete, personalCapacity, retainPersonalHistory, weeklyWindows } from './personalRoutine';
import { buildStudyPlan } from './studyPlan';
import { setTaskCompletion } from './study';
import { parseBackup } from './storage';
import { PERSONAL_IDS, personalDataFixture } from './test/personalRoutineFixture';
import type { AppData } from './planner';

const at = '2026-11-20T10:00:00.000Z';
const loneData: [string, (data: AppData) => void][] = [
  ['availability and S shortlist', data => { data.personalRoutine = personalDataFixture().personalRoutine; }],
  ['flashcard', data => { data.flashcards = [{ id: 'only-card', subject: 'physics', front: 'Question', back: 'Answer', category: 'definition', interval: 1, dueDate: '2026-11-21', repetitions: 0, easeFactor: 2.5, createdAt: at }]; }],
  ['scanned note', data => { data.scannedNotes = [{ id: 'only-scan', subject: 'physics', title: 'Handwritten page', createdAt: at, pageCount: 1, pageKeys: ['scan:only-page'], sizeBytes: 100, pdfExported: false }]; }],
  ['class bookmark', data => { data.classBookmarks = { 'https://www.youtube.com/watch?v=abcdefghijk': at }; }],
  ['pending spaced revision', data => { data.revisions = [{ id: 'only-review', subject: 'physics', chapterId: PERSONAL_IDS[0], dueDate: '2026-11-21', interval: 1, createdAt: at }]; }],
  ['schedule lock', data => { data.lockedDates = ['2026-11-20']; }],
  ['manual task edit', data => { data.taskEdits = { 'saved-task': { title: 'My session name' } }; }],
  ['deliberately removed task', data => { data.removedTasks = ['saved-task']; }],
  ['exam retry', data => { data.retries = [{ id: 'p-001', questionId: 'p-001', subject: 'physics', chapterId: PERSONAL_IDS[0], source: 'Saved paper', schedule: '1,3,7,14', replayed: 0, cleared: false, date: '2026-11-20', at, lastAt: at }]; }],
];

describe('full recheck: no unprotected single-feature profiles', () => {
  it.each(loneData)('reminds when the only saved information is a %s', (_name, change) => {
    const data = freshData(); change(data);
    const before = JSON.stringify(data);
    expect(hasStudyData(data)).toBe(true);
    expect(needsBackup(data, '2026-11-21')).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe('full recheck: changed source evidence', () => {
  it('never applies old completion to a replaced source, even when the new work fits on one day', () => {
    let data = personalDataFixture();
    data.personalRoutine!.windows = data.personalRoutine!.windows.map(window => ({ ...window, startMinute: 360, endMinute: 1380 }));
    data.personalRoutine!.dailyLimitMinutes = 1020;
    let plan = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, plan[0].tasks.map(task => task.id), true, plan);
    const completionHistory = { ...data.completed };
    const draft = structuredClone(data.personalRoutine!);
    for (const id of PERSONAL_IDS) for (const stage of WORK_STAGES) {
      // Every mandatory source changes. Old timestamps still belong to old work.
      if (draft.workloads[id][stage.id].minutes) draft.workloads[id][stage.id].minutes! += stage.id === 'class' ? 120 : 1;
    }
    data = applyPersonalRoutine(data, draft, { plan, asOf: '2026-11-21' });
    const before = JSON.stringify(data);
    plan = buildStudyPlan(data, '2026-11-21');
    for (const id of PERSONAL_IDS) {
      const sourceId = personalStageSourceId(data.personalRoutine!, id, 'class');
      const classes = plan.flatMap(day => day.tasks).filter(task => task.originalTaskId === sourceId);
      expect(classes.length).toBeGreaterThan(0);
      expect(classes.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0)).toBe(360);
      expect(classes.every(task => !isPersonalTaskComplete(task, data.completed))).toBe(true);
      const stages = plan.flatMap(day => day.tasks).filter(task => task.chapterIds[0] === id && task.personalWork && task.personalWork.sourceId === personalStageSourceId(data.personalRoutine!, id, task.personalWork.stage)).map(task => WORK_STAGES.findIndex(stage => stage.id === task.personalWork!.stage));
      expect(stages).toEqual([...stages].sort((a, b) => a - b));
    }
    expect(data.completed).toEqual(completionHistory);
    expect(JSON.stringify(data)).toBe(before);
    expect(parseBackup(before)).toEqual(data);
  });
});

describe('full recheck: deterministic availability/reflow matrix', () => {
  it.each(Array.from({ length: 20 }, (_, seed) => seed))('conserves all source ranges, capacity and history with varied windows, obligations, speed and partial work (seed %s)', seed => {
    const ids = [...PERSONAL_IDS, 'math-1-1', 'physics-1-4'];
    let data = personalDataFixture(ids), routine = data.personalRoutine!;
    routine.playbackSpeed = ([1, 1.25, 1.5, 2] as const)[seed % 4];
    routine.sessionMinutes = 15 * (seed % 8 + 1); routine.breakMinutes = seed % 4 * 5;
    routine.dailyLimitMinutes = 45 + seed % 7 * 15;
    routine.windows = [1, 3, 5].flatMap(weekday => [{ weekday, startMinute: 480, endMinute: 540 + seed % 4 * 20 }, { weekday, startMinute: 1080, endMinute: 1140 + seed % 3 * 20 }]);
    routine.exclusions = [1, 3, 5].map(weekday => ({ weekday, startMinute: 500, endMinute: 515 }));
    for (const id of ids) routine.workloads[id].class.minutes = 60 + seed % 6 * 30;
    let plan = buildStudyPlan(data, data.settings.startDate);
    const first = plan.flatMap(day => day.tasks).find(task => task.personalWork && task.endMinute - task.startMinute >= 2)!;
    const work = first.personalWork!, at = '2026-11-20T12:00:00.000Z';
    data.completed[`smart-part|${encodeURIComponent(work.sourceId)}|${work.from}|${work.from + 1}`] = at;
    data = retainPersonalHistory(data, plan);
    routine = data.personalRoutine!;
    const before = JSON.stringify(data), asOf = addDays(data.settings.startDate, 3 + seed % 4);
    plan = buildStudyPlan(data, asOf);
    for (const day of plan.filter(day => day.date >= asOf)) {
      expect(day.tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0)).toBeLessThanOrEqual(personalCapacity(data, day.date));
      for (let index = 0; index < day.tasks.length; index++) {
        const task = day.tasks[index];
        expect(weeklyWindows(routine, day.date).some(window => task.startMinute >= window.startMinute && task.endMinute <= window.endMinute)).toBe(true);
        expect(task.endMinute - task.startMinute).toBeLessThanOrEqual(routine.sessionMinutes);
        if (index) expect(task.startMinute).toBeGreaterThanOrEqual(day.tasks[index - 1].endMinute);
      }
    }
    for (const id of ids) expect(hasFullPersonalAllocation(data, plan, id)).toBe(true);
    const tasks = plan.flatMap(day => day.tasks);
    expect(new Set(tasks.map(task => task.id)).size).toBe(tasks.length);
    for (const source of new Set(tasks.map(task => task.originalTaskId))) {
      const ordered = tasks.filter(task => task.originalTaskId === source).sort((a, b) => a.personalWork!.from - b.personalWork!.from);
      for (let index = 1; index < ordered.length; index++) expect(ordered[index].personalWork!.from).toBeGreaterThanOrEqual(ordered[index - 1].personalWork!.to);
    }
    expect(JSON.stringify(data)).toBe(before);
    expect(parseBackup(before)).toEqual(data);
    expect(buildStudyPlan(data, asOf)).toEqual(plan);
  });
});
