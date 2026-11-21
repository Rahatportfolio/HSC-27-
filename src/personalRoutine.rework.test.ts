import './test/pinnedDate';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterById } from './data';
import { addDays, freshData, getStats } from './planner';
import type { AppData, Day, Task } from './planner';
import { chapterStage, learningDashboard } from './learning';
import { buildStudyPlan } from './studyPlan';
import { makeMarkdown } from './exports';
import { applyScheduleSettings } from './reschedule';
import { setTaskCompletion } from './study';
import { parseBackup } from './storage';
import { overallTaskProgress, recentTaskPace } from './prediction';
import { testPrepStats } from './testPrep';
import { planBacklog } from './backlog';
import { WORK_STAGES, applyPersonalRoutine, chapterWorkEstimate, defaultChapterWorkload, independentWorkMinutes, isPersonalChapterDone, isPersonalTaskComplete, newPersonalRoutine, nextPersonalRoutine, parsePersonalRoutine, personalCapacity, personalChapterProgress, personalRoutineHealth, personalStageSourceId, personalUnfinishedRanges, setPersonalStageCompletion, weeklyWindows } from './personalRoutine';
import type { ChapterWorkload, WorkStage } from './personalRoutine';

const IDS = ['physics-1-3', 'chemistry-1-3', 'math-1-1', 'physics-1-4'];
const total = (tasks: Task[]) => tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
function workload(video = 240): ChapterWorkload {
  const work = defaultChapterWorkload(IDS[0]);
  const budgets = { class: video, mcqClass: 0, cqClass: 0, reading: 26, notes: 17, mcqPractice: 43, cqPractice: 61, revision: 29 };
  for (const stage of WORK_STAGES) work[stage.id] = { minutes: budgets[stage.id], source: stage.media ? 'student' : 'planned', ...(stage.media ? { url: 'https://www.youtube.com/watch?v=abcdefghijk' } : {}) };
  return work;
}
function fixture(ids = IDS.slice(0, 2)): AppData {
  const data = freshData();
  data.personalRoutine = { ...newPersonalRoutine(), chapterIds: [...ids],
    windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 1080, endMinute: 1380 })),
    exclusions: [], dailyLimitMinutes: 180, sessionMinutes: 45, breakMinutes: 5,
    workloads: Object.fromEntries(ids.map(id => [id, workload()])) };
  return data;
}
function assertBoundaries(data: AppData, plan: Day[], asOf = data.settings.startDate) {
  for (const day of plan.filter(day => day.date >= asOf)) {
    expect(total(day.tasks), day.date).toBeLessThanOrEqual(personalCapacity(data, day.date));
    for (let index = 0; index < day.tasks.length; index++) {
      const task = day.tasks[index];
      expect(weeklyWindows(data.personalRoutine!, day.date).some(window => task.startMinute >= window.startMinute && task.endMinute <= window.endMinute), task.id).toBe(true);
      expect(task.endMinute).toBeLessThanOrEqual(1440);
      if (!isPersonalTaskComplete(task, data.completed)) expect(task.endMinute - task.startMinute).toBeLessThanOrEqual(data.personalRoutine!.sessionMinutes);
      if (index > 0) expect(task.startMinute, `${day.date}: ${task.id}`).toBeGreaterThanOrEqual(day.tasks[index - 1].endMinute);
    }
  }
  expect(new Set(plan.flatMap(day => day.tasks.map(task => task.id))).size).toBe(plan.flatMap(day => day.tasks).length);
}
function finish(data: AppData, id: string, except?: WorkStage): AppData {
  for (const stage of WORK_STAGES) if (stage.id !== except && !['mcqClass', 'cqClass'].includes(stage.id)) data = setPersonalStageCompletion(data, id, stage.id, true, '2026-11-23T12:00:00Z');
  return data;
}

describe('routine rework: six truthful groups and safe old-data migration', () => {
  it.each(['completed', 'revisionNeeded', 'fullyRevised'] as const)('an old %s status, watched flags and checklist never bypass required sources', stage => {
    const data = fixture(); const id = IDS[0], at = '2026-11-16T09:00:00Z';
    data.chapterMeta[id] = { stage, note: 'Keep old assessment and note', weak: false, mcq: 'ready', cq: 'ready', updatedAt: at, steps: { class: true, reading: true, cqPractice: true, mcqPractice: true, revision: true } };
    data.classWatched['unchanged-video-id'] = at;
    const plan = buildStudyPlan(data, data.settings.startDate);
    expect(isPersonalChapterDone(plan, id, data.completed, data.personalRoutine)).toBe(false);
    expect(chapterStage(chapterById[id], data, plan)).not.toBe('fullyRevised');
    expect(getStats(plan, data, data.settings.startDate).chapters).toBe(0);
    expect(learningDashboard(data, plan).overall.completed).toBe(0);
    expect(parseBackup(JSON.stringify(data)).chapterMeta[id]).toEqual(data.chapterMeta[id]);
  });
  it('distinguishes coverage from readiness, and only the last required revision completes the chapter', () => {
    let data = fixture(); const id = IDS[0];
    data = setPersonalStageCompletion(data, id, 'class', true);
    expect(personalChapterProgress(data.personalRoutine!, id, data.completed)).toMatchObject({ fullyComplete: false, completedSteps: 1, coveragePercent: 33, readinessPercent: 17 });
    for (const stage of ['reading', 'notes'] as const) data = setPersonalStageCompletion(data, id, stage, true);
    expect(personalChapterProgress(data.personalRoutine!, id, data.completed)).toMatchObject({ coveragePercent: 100, readinessPercent: 50, fullyComplete: false });
    data = finish(data, id, 'revision');
    expect(isPersonalChapterDone([], id, data.completed, data.personalRoutine)).toBe(false);
    data = setPersonalStageCompletion(data, id, 'revision', true, '2026-11-23T13:00:00Z');
    expect(personalChapterProgress(data.personalRoutine!, id, data.completed)).toMatchObject({ fullyComplete: true, completedSteps: 6, coveragePercent: 100, readinessPercent: 100 });
    data = setPersonalStageCompletion(data, id, 'notes', false);
    expect(personalChapterProgress(data.personalRoutine!, id, data.completed).fullyComplete).toBe(false);
  });
  it('retains six-stage v1 profiles without inventing Notes/Revision evidence or deleting any old fields', () => {
    let data = fixture(); const at = '2026-11-20T13:00:00Z';
    const before = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, before[0].tasks.map(task => task.id), true, before);
    data.notes['2026-11-20'] = 'Old dated note'; data.chapterMeta[IDS[0]] = { note: 'Chapter note', weak: true, mcq: 'practicing', cq: 'none', updatedAt: at, stage: 'completed' };
    const raw = JSON.parse(JSON.stringify(data));
    for (const work of Object.values(raw.personalRoutine.workloads) as Record<string, unknown>[]) { delete work.notes; delete work.revision; }
    const restored = parseBackup(JSON.stringify(raw));
    expect(restored.completed).toEqual(data.completed); expect(restored.notes).toEqual(data.notes); expect(restored.chapterMeta).toEqual(data.chapterMeta);
    expect(restored.personalRoutine!.workloads[IDS[0]].notes).toEqual({ minutes: null, source: 'unknown' });
    expect(restored.personalRoutine!.workloads[IDS[0]].revision).toEqual({ minutes: null, source: 'unknown' });
    expect(restored.personalRoutine!.workloads[IDS[0]].class).toEqual(data.personalRoutine!.workloads[IDS[0]].class);
    expect(isPersonalChapterDone([], IDS[0], restored.completed, restored.personalRoutine)).toBe(false);
  });
  it('unknown or legacy zero mandatory budgets cannot be skipped/confirmed as completed', () => {
    const data = fixture(); const id = IDS[0]; data.personalRoutine!.workloads[id].notes = { minutes: 0, source: 'planned' };
    expect(() => setPersonalStageCompletion(data, id, 'notes', true)).toThrow();
    data.completed[personalStageSourceId(data.personalRoutine!, id, 'notes')] = '2026-11-23T12:00:00Z';
    expect(personalChapterProgress(data.personalRoutine!, id, data.completed).steps.find(step => step.id === 'notes')!.done).toBe(false);
    expect(chapterWorkEstimate(data.personalRoutine!, id).complete).toBe(false);
  });
});

describe('routine rework: workload and actual video time', () => {
  it('calculates reading, notes, MCQ, CQ and revision from volume/rate/difficulty and prior review, never playback speed', () => {
    expect(independentWorkMinutes('reading', { quantity: 12, unitMinutes: 2, difficulty: 'hard' })).toBe(34);
    expect(independentWorkMinutes('notes', { quantity: 8, unitMinutes: 4, difficulty: 'normal' })).toBe(32);
    expect(independentWorkMinutes('mcqPractice', { quantity: 60, unitMinutes: 1.5, difficulty: 'hard' })).toBe(126);
    expect(independentWorkMinutes('cqPractice', { quantity: 5, unitMinutes: 12, difficulty: 'normal' })).toBe(60);
    expect(independentWorkMinutes('revision', { quantity: 10, unitMinutes: 5, difficulty: 'normal', reviewedPercent: 50 })).toBe(38);
    expect(() => independentWorkMinutes('class', { quantity: 4, unitMinutes: 80, difficulty: 'normal' })).toThrow();
    expect(() => independentWorkMinutes('reading', { quantity: Infinity, unitMinutes: 2, difficulty: 'normal' })).toThrow();
  });
  it('treats a changed count/volume as different work even if its rounded minute estimate is equal', () => {
    const routine = fixture().personalRoutine!, id = IDS[0];
    const first = { quantity: 4, unitMinutes: 2, difficulty: 'normal' as const };
    routine.workloads[id].notes = { minutes: 8, source: 'planned', calculation: first };
    const original = personalStageSourceId(routine, id, 'notes');
    routine.workloads[id].notes.calculation = { ...first, quantity: 8, unitMinutes: 1 };
    expect(personalStageSourceId(routine, id, 'notes')).not.toBe(original);
    expect(parsePersonalRoutine(routine).workloads[id].notes).toEqual(routine.workloads[id].notes);
    routine.workloads[id].notes.minutes = 99;
    expect(() => parsePersonalRoutine(routine)).toThrow();
  });
  it.each([1, 1.25, 1.5, 2] as const)('preserves 4/7/8-hour lecture/MCQ/CQ video totals at %s× across as many days as required', speed => {
    const data = fixture(IDS); const routine = data.personalRoutine!; routine.playbackSpeed = speed;
    for (const id of IDS) { routine.workloads[id].class.minutes = 240; routine.workloads[id].mcqClass.minutes = 420; routine.workloads[id].cqClass.minutes = 480; }
    const plan = buildStudyPlan(data, data.settings.startDate), tasks = plan.flatMap(day => day.tasks);
    assertBoundaries(data, plan);
    for (const id of IDS) for (const [stage, minutes] of Object.entries({ class: 240, mcqClass: 420, cqClass: 480, reading: 26, notes: 17, mcqPractice: 43, cqPractice: 61, revision: 29 })) {
      const selected = tasks.filter(task => task.chapterIds[0] === id && task.personalWork!.stage === stage);
      expect(total(selected), `${id}:${stage}`).toBe(Math.ceil(minutes / (['class', 'mcqClass', 'cqClass'].includes(stage) ? speed : 1)));
      if (['class', 'mcqClass', 'cqClass'].includes(stage)) expect(selected.at(-1)!.personalWork!.mediaToSec).toBe(minutes * 60);
    }
    const firstPairLast = tasks.filter(task => IDS.slice(0, 2).includes(task.chapterIds[0])).at(-1)!;
    expect(firstPairLast.date > addDays(data.settings.startDate, 1)).toBe(true);
    expect(tasks.find(task => IDS.slice(2).includes(task.chapterIds[0]))!.date > firstPairLast.date).toBe(true);
    expect(plan[0].tasks.every(task => ['class', 'reading', 'notes'].includes(task.personalWork!.stage))).toBe(true);
  });
  it('uses the lower daily net cap, subtracts fixed obligations and honours multiple windows/off weekdays', () => {
    const data = fixture(); const routine = data.personalRoutine!;
    routine.windows = [5, 6].flatMap(weekday => [{ weekday, startMinute: 480, endMinute: 600 }, { weekday, startMinute: 1200, endMinute: 1320 }]);
    routine.exclusions = [{ weekday: 5, startMinute: 510, endMinute: 570 }, { weekday: 5, startMinute: 1240, endMinute: 1260 }];
    routine.dailyLimitMinutes = 75;
    const plan = buildStudyPlan(data, data.settings.startDate);
    expect(personalCapacity(data, data.settings.startDate)).toBe(75);
    expect(personalCapacity(data, addDays(data.settings.startDate, 2))).toBe(0);
    assertBoundaries(data, plan);
    expect(plan.every(day => day.tasks.every(task => weeklyWindows(routine, day.date).some(window => task.startMinute >= window.startMinute && task.endMinute <= window.endMinute)))).toBe(true);
  });
});

describe('routine rework: bounded unpaid-range rolling calendar', () => {
  it('replaces future work with owed source ranges, delays the next pair and never invents hours or completion timestamps', () => {
    const data = fixture(IDS), start = data.settings.startDate, today = addDays(start, 4);
    const baseline = buildStudyPlan(data, start), original = baseline.flatMap(day => day.tasks), old = original[0];
    const at = '2026-11-20T12:00:00Z';
    data.completed[`smart-part|${encodeURIComponent(old.originalTaskId!)}|0|15`] = at;
    const before = JSON.stringify(data), plan = buildStudyPlan(data, today), tasks = plan.flatMap(day => day.tasks);
    expect(JSON.stringify(data)).toBe(before);
    expect(tasks.some(task => task.rescheduledFrom && task.rescheduledFrom < today && task.date >= today)).toBe(true);
    expect(tasks.filter(task => task.date < today).every(task => isPersonalTaskComplete(task, data.completed))).toBe(true);
    assertBoundaries(data, plan, today);
    for (const sourceId of new Set(original.map(task => task.originalTaskId!))) {
      const source = original.find(task => task.originalTaskId === sourceId)!;
      const mask = { ...data.completed, ...Object.fromEntries(tasks.filter(task => task.originalTaskId === sourceId).map(task => [task.id, 'allocated-only'])) };
      expect(personalUnfinishedRanges({ id: '', personalWork: { ...source.personalWork!, from: 0, to: source.sourceMinutes! } }, mask)).toEqual([]);
      const pending = tasks.filter(task => task.originalTaskId === sourceId && !isPersonalTaskComplete(task, data.completed));
      for (let i = 1; i < pending.length; i++) expect(pending[i].personalWork!.from).toBeGreaterThanOrEqual(pending[i - 1].personalWork!.to);
    }
    expect(tasks.find(task => IDS.slice(2).includes(task.chapterIds[0]))!.date >= original.find(task => IDS.slice(2).includes(task.chapterIds[0]))!.date).toBe(true);
    expect(planBacklog(plan, data, today).placements.length).toBeGreaterThan(0);
    expect(data.completed).toEqual({ [`smart-part|${encodeURIComponent(old.originalTaskId!)}|0|15`]: at });
    expect(buildStudyPlan(data, today)).toEqual(plan);
  });
  it('retains real first-day completion when all work fits on one day', () => {
    let data = fixture(); data.personalRoutine!.dailyLimitMinutes = 1440; data.personalRoutine!.windows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 360, endMinute: 1380 }));
    const first = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, first[0].tasks.map(task => task.id), true, first);
    const plan = buildStudyPlan(data, data.settings.startDate);
    expect(plan[0].tasks.every(task => isPersonalTaskComplete(task, data.completed))).toBe(true);
    expect(plan.flatMap(day => day.tasks).every(task => isPersonalTaskComplete(task, data.completed))).toBe(true);
    expect(learningDashboard(data, plan).overall.completed).toBe(2);
    assertBoundaries(data, plan);
  });
  it('keeps real completion slots/ranges through carry-forward, repartitioning, availability edits and backup round-trip', () => {
    let data = fixture(); const today = addDays(data.settings.startDate, 2);
    let plan = buildStudyPlan(data, today), task = plan.find(day => day.date === today)!.tasks[0];
    data = setTaskCompletion(data, [task.id], true, plan); const completed = { ...data.completed };
    const originalSlot = { date: task.date, start: task.startMinute, end: task.endMinute };
    const draft = structuredClone(data.personalRoutine!); draft.sessionMinutes = 20; draft.windows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 480, endMinute: 600 })); draft.dailyLimitMinutes = 90;
    data = applyPersonalRoutine(data, draft, { plan, asOf: today }); plan = buildStudyPlan(data, today);
    expect(data.completed).toEqual(completed); assertBoundaries(data, plan, today);
    const historical = plan.flatMap(day => [...day.tasks, ...(day.historyTasks || [])]).find(item => item.id === task.id)!;
    expect({ date: historical.date, start: historical.startMinute, end: historical.endMinute }).toEqual(originalSlot);
    const restored = parseBackup(JSON.stringify(data)); expect(restored).toEqual(data);
    expect(isPersonalTaskComplete(task, restored.completed)).toBe(true);
  });
  it.each(['locked', 'explicitly edited'] as const)('preserves a partially confirmed future %s slot without moving its unpaid portion or counting the done range twice', mode => {
    const data = fixture(), start = data.settings.startDate;
    const baseline = buildStudyPlan(data, start), original = baseline[1].tasks[0], work = original.personalWork!;
    const through = work.from + 10;
    data.completed[`smart-part|${encodeURIComponent(work.sourceId)}|${work.from}|${through}`] = '2026-11-20T12:00:00Z';
    if (mode === 'locked') data.lockedDates = [original.date];
    else data.taskEdits[original.id] = { date: original.date };
    // Retaining the actual done fragment exercises the same path used by App saves.
    data.personalRoutine!.history = [{ ...original, id: Object.keys(data.completed)[0], endMinute: original.startMinute + 10, personalWork: { ...work, to: through, ...(work.mediaToSec !== undefined ? { mediaToSec: through / original.sourceMinutes! * work.rawMinutes * 60 } : {}) } }];
    const plan = buildStudyPlan(data, start);
    const retained = plan.find(day => day.date === original.date)!.tasks.filter(task => task.originalTaskId === original.originalTaskId);
    expect(retained.some(task => task.personalWork!.from === through && task.personalWork!.to === work.to && task.startMinute === original.startMinute + 10 && task.endMinute === original.endMinute)).toBe(true);
    const scheduled = plan.flatMap(day => day.tasks).filter(task => task.originalTaskId === original.originalTaskId);
    expect(total(scheduled)).toBe(total(baseline.flatMap(day => day.tasks).filter(task => task.originalTaskId === original.originalTaskId)));
    assertBoundaries(data, plan);
  });
  it('does not double-book a preserved old-source completion with a newly configured video', () => {
    let data = fixture(), plan = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, plan[0].tasks.map(task => task.id), true, plan);
    data.personalRoutine!.workloads[IDS[0]].class.minutes = 360;
    plan = buildStudyPlan(data, data.settings.startDate);
    assertBoundaries(data, plan);
    expect(personalChapterProgress(data.personalRoutine!, IDS[0], data.completed).fullyComplete).toBe(false);
  });
  it('does not resurrect a deliberately removed source range during a later reflow', () => {
    const data = fixture(); let plan = buildStudyPlan(data, data.settings.startDate), task = plan[0].tasks[0];
    data.removedTasks = [task.id]; plan = buildStudyPlan(data, addDays(data.settings.startDate, 1));
    expect(plan.flatMap(day => day.tasks).filter(item => item.originalTaskId === task.originalTaskId).every(item => item.personalWork!.from >= task.personalWork!.to || item.personalWork!.to <= task.personalWork!.from)).toBe(true);
    expect(personalRoutineHealth(data, plan).syllabusEnd).toBeUndefined();
  });
  it('does not double-count the done part of a partially completed locked past allocation', () => {
    const data = fixture(), start = data.settings.startDate;
    const baseline = buildStudyPlan(data, start), original = baseline[0].tasks[0];
    data.completed[`smart-part|${encodeURIComponent(original.originalTaskId!)}|0|15`] = '2026-11-20T12:15:00Z';
    data.lockedDates = [start];
    const plan = buildStudyPlan(data, addDays(start, 1)), day = plan.find(day => day.date === start)!;
    expect(total(day.tasks)).toBe(total(baseline[0].tasks));
    const source = day.tasks.filter(task => task.originalTaskId === original.originalTaskId);
    expect(total(source)).toBe(total(baseline[0].tasks.filter(task => task.originalTaskId === original.originalTaskId)));
    expect(source.find(task => !isPersonalTaskComplete(task, data.completed))!.personalWork!.from).toBe(15);
    expect(source.find(task => isPersonalTaskComplete(task, data.completed))!.personalWork!.to).toBe(15);
    expect(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'locked-work')).toBe(true);
  });
  it('preserves locked overdue work, does not jump to another pair, and discloses a full/expired deadline', () => {
    const data = fixture(IDS), start = data.settings.startDate; data.lockedDates = [start];
    let plan = buildStudyPlan(data, addDays(start, 1));
    expect(plan[0].tasks.some(task => !isPersonalTaskComplete(task, data.completed))).toBe(true);
    expect(plan.flatMap(day => day.tasks).some(task => IDS.slice(2).includes(task.chapterIds[0]))).toBe(false);
    expect(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'locked-work')).toBe(true);
    data.lockedDates = []; data.settings.examDate = addDays(start, 2);
    plan = buildStudyPlan(data, addDays(start, 1)); assertBoundaries(data, plan, addDays(start, 1));
    expect(plan.at(-1)!.deferredMinutes).toBeGreaterThan(0);
    expect(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'deadline')).toBe(true);
  });
});

describe('routine rework: S first and later-phase planning', () => {
  it('offers A only after all S groups are complete, excludes S, and archives S data/history without backdating A', () => {
    let data = fixture(); expect(nextPersonalRoutine(data, '2026-11-24')).toBeUndefined();
    const prematurely = { ...data.personalRoutine!, scope: 'A' as const, chapterIds: CHAPTERS.filter(c => c.priority === 'A' && !IDS.slice(0, 2).includes(c.id)).map(c => c.id) };
    expect(() => applyPersonalRoutine(data, prematurely)).toThrow();
    for (const id of data.personalRoutine!.chapterIds) data = finish(data, id);
    const next = nextPersonalRoutine(data, '2026-11-24')!;
    expect(next.scope).toBe('A'); expect(next.chapterIds.every(id => chapterById[id].priority === 'A' && !IDS.slice(0, 2).includes(id))).toBe(true);
    next.chapterIds = next.chapterIds.slice(0, 2); next.workloads = Object.fromEntries(next.chapterIds.map(id => [id, workload(60)]));
    const old = data.personalRoutine!; data = applyPersonalRoutine(data, next, { asOf: '2026-11-24' });
    expect(data.personalPhases!.S!.workloads).toEqual(old.workloads);
    expect(personalChapterProgress(data.personalPhases!.S!, IDS[0], data.completed).fullyComplete).toBe(true);
    const plan = buildStudyPlan(data, '2026-11-24');
    expect(plan.flatMap(day => day.tasks).every(task => next.chapterIds.includes(task.chapterIds[0]) && task.date >= '2026-11-24')).toBe(true);
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    data = setPersonalStageCompletion(data, IDS[0], 'revision', false);
    expect(data.personalRoutine!.scope).toBe('S'); expect(data.personalPhases!.A!.chapterIds).toEqual(next.chapterIds);
    expect(buildStudyPlan(data, '2026-11-24').flatMap(day => day.tasks).every(task => IDS.slice(0, 2).includes(task.chapterIds[0]))).toBe(true);
  });
  it('rejects moving an archived later-phase chapter into an edited S shortlist before writing an unrestorable overlapping profile', () => {
    let data = fixture(); for (const id of data.personalRoutine!.chapterIds) data = finish(data, id);
    data = applyPersonalRoutine(data, nextPersonalRoutine(data, '2026-11-24')!, { asOf: '2026-11-24' });
    data = setPersonalStageCompletion(data, IDS[0], 'revision', false);
    data.notes['2026-11-20'] = 'Keep notes and both phase definitions';
    const before = JSON.stringify(data), next = structuredClone(data.personalRoutine!);
    const archivedId = data.personalPhases!.A!.chapterIds[0];
    next.chapterIds.push(archivedId); next.workloads[archivedId] = workload();
    expect(() => applyPersonalRoutine(data, next, { asOf: '2026-11-24' })).toThrow(/retained|সংরক্ষিত/);
    expect(JSON.stringify(data)).toBe(before);
    expect(parseBackup(before)).toEqual(data);
    expect(data.personalPhases!.A!.chapterIds).toContain(archivedId);
  });
  it('never infers a later phase from a legacy completed status or from calendar allocation alone', () => {
    const data = fixture(); for (const id of data.personalRoutine!.chapterIds) data.chapterMeta[id] = { note: '', weak: false, cq: 'ready', mcq: 'ready', updatedAt: '2026-11-16T08:00:00Z', stage: 'completed' };
    expect(nextPersonalRoutine(data, '2026-11-24')).toBeUndefined();
    expect(buildStudyPlan(data, '2026-11-24').flatMap(day => day.tasks).every(task => IDS.slice(0, 2).includes(task.chapterIds[0]))).toBe(true);
    expect(newPersonalRoutine().windows).toEqual([]);
    expect(newPersonalRoutine().dailyLimitMinutes).toBeUndefined();
  });
});


describe('routine rework: tight capacity, retained appointments and readable history', () => {
  it('shares a small net cap between BOTH books even when the wall-clock window and session limit are much longer', () => {
    const data = fixture(); data.personalRoutine!.dailyLimitMinutes = 30; data.personalRoutine!.sessionMinutes = 120;
    for (const asOf of [data.settings.startDate, addDays(data.settings.startDate, 2)]) {
      const plan = buildStudyPlan(data, asOf), day = plan.find(day => day.date === asOf)!;
      expect(new Set(day.tasks.filter(task => !isPersonalTaskComplete(task, data.completed)).map(task => task.chapterIds[0]))).toEqual(new Set(IDS.slice(0, 2)));
      expect(total(day.tasks)).toBe(30); assertBoundaries(data, plan, asOf);
    }
  });
  it('keeps the chosen session break across contiguous/small-gap windows in both baseline and reflow', () => {
    const data = fixture(); data.personalRoutine!.windows = Array.from({ length: 7 }, (_, weekday) => [
      { weekday, startMinute: 1080, endMinute: 1110 }, { weekday, startMinute: 1110, endMinute: 1200 },
    ]).flat();
    data.personalRoutine!.dailyLimitMinutes = 120; data.personalRoutine!.breakMinutes = 10;
    for (const asOf of [data.settings.startDate, addDays(data.settings.startDate, 2)]) {
      const plan = buildStudyPlan(data, asOf), day = plan.find(day => day.date === asOf)!;
      for (let i = 1; i < day.tasks.length; i++) expect(day.tasks[i].startMinute - day.tasks[i - 1].endMinute).toBeGreaterThanOrEqual(10);
      assertBoundaries(data, plan, asOf);
    }
  });
  it('retains an outside-window appointment with its id, supports an explicit completion, and never adds it on top of the daily cap', () => {
    let data = fixture();
    data.routineBlocks = [{ id: 'late-appointment', date: data.settings.startDate, weekday: 5, startMinute: 900, minutes: 60, subject: 'physics', title: 'Retain me', createdAt: '2026-11-16T12:00:00Z' }];
    let plan = buildStudyPlan(data, data.settings.startDate);
    const retained = plan[0].unscheduled![0];
    expect(retained.title).toBe('Retain me'); expect(plan[0].tasks.some(task => task.id === retained.id)).toBe(false);
    expect(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'unscheduled')).toBe(true);
    data = setTaskCompletion(data, [retained.id], true, plan); plan = buildStudyPlan(data, data.settings.startDate);
    expect(isPersonalTaskComplete(plan[0].unscheduled![0], data.completed)).toBe(true);
    expect(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'unscheduled')).toBe(false);
    expect(parseBackup(JSON.stringify(data))).toEqual(data); assertBoundaries(data, plan);
  });
  it('preserves historical source slots and actual timestamps when linked planning dates move; undo cannot revive on restore', () => {
    let data = fixture(); let plan = buildStudyPlan(data, data.settings.startDate); const task = plan[0].tasks[0];
    data = setTaskCompletion(data, [task.id], true, plan); const stamps = { ...data.completed };
    data.notes[task.date] = 'Actual dated note';
    data = applyScheduleSettings(data, { ...data.settings, startDate: '2026-11-24', testExamDate: '2027-02-05', examDate: '2027-06-10' });
    plan = buildStudyPlan(data, '2026-11-24');
    expect(data.completed).toEqual(stamps); expect(data.notes[task.date]).toBe('Actual dated note');
    expect(plan.flatMap(day => [...day.tasks, ...(day.historyTasks || [])]).find(item => item.id === task.id)?.date).toBe(task.date);
    data = setTaskCompletion(data, [task.id], false, plan);
    const restored = parseBackup(JSON.stringify(data));
    expect(isPersonalTaskComplete(task, restored.completed)).toBe(false);
    expect(buildStudyPlan(restored, '2026-11-24').flatMap(day => [...day.tasks, ...(day.historyTasks || [])]).filter(item => item.date < '2026-11-24')).toEqual([]);
  });
  it('rejects an imported later phase without retained S and reopens a retained S whose evidence has been undone', () => {
    let data = fixture(); for (const id of IDS.slice(0, 2)) data = finish(data, id);
    const next = nextPersonalRoutine(data, '2026-11-24')!;
    data = applyPersonalRoutine(data, next, { asOf: '2026-11-24' });
    const noS = structuredClone(data); delete noS.personalPhases;
    expect(() => parseBackup(JSON.stringify(noS))).toThrow(/S prerequisite/);
    delete data.completed[personalStageSourceId(data.personalPhases!.S!, IDS[0], 'notes')];
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.personalRoutine!.scope).toBe('S'); expect(restored.personalPhases!.A!.chapterIds).toEqual(next.chapterIds);
  });
  it('does not offer a later phase beyond the end target or accept an out-of-horizon phase start', () => {
    let data = fixture(); for (const id of IDS.slice(0, 2)) data = finish(data, id);
    expect(nextPersonalRoutine(data, data.settings.examDate)).toBeUndefined();
    expect(nextPersonalRoutine(data, addDays(data.settings.examDate, 1))).toBeUndefined();
    const raw = { ...data.personalRoutine!, startsOn: data.settings.examDate }, before = JSON.stringify(data);
    expect(() => applyPersonalRoutine(data, raw)).toThrow(/phase start|ধাপের শুরু/i);
    expect(JSON.stringify(data)).toBe(before); expect(parseBackup(before)).toEqual(data);
  });
  it('does not let a caller-supplied next-phase draft backdate new A work before the transition date', () => {
    let data = fixture(); for (const id of IDS.slice(0, 2)) data = finish(data, id);
    const next = nextPersonalRoutine(data, '2026-11-24')!; next.startsOn = data.settings.startDate;
    data = applyPersonalRoutine(data, next, { asOf: '2026-11-24' });
    expect(data.personalRoutine!.startsOn).toBe('2026-11-24');
  });
  it('exports the current phase, net cap, obligations, six groups and preserved notes without promising half of every stage or all-syllabus completion', () => {
    let data = fixture(); data.notes['2026-11-16'] = 'Keep old note';
    data.personalRoutine!.exclusions = [{ weekday: 5, startMinute: 1140, endMinute: 1170 }];
    const md = makeMarkdown(buildStudyPlan(data, data.settings.startDate), data);
    expect(md).toContain('Syllabus Coverage'); expect(md).toContain('Exam Readiness'); expect(md).toContain('নোট তৈরি');
    expect(md).toContain('দৈনিক নেট'); expect(md).toContain('নির্দিষ্ট বিরতি/দায়িত্ব'); expect(md).toContain('Keep old note');
    for (const id of IDS.slice(0, 2)) data = finish(data, id);
    data = applyPersonalRoutine(data, nextPersonalRoutine(data, '2026-11-24')!, { asOf: '2026-11-24' });
    const phase = makeMarkdown(buildStudyPlan(data, '2026-11-24'), data);
    expect(phase).toContain('# প্রস্তুতি — আমার A ধাপের রুটিন'); expect(phase).toContain('## সংরক্ষিত আগের/পুনরায় খোলার অপেক্ষায় থাকা ধাপ');
    expect(phase).not.toContain('### S ·'); expect(phase).toContain('Keep old note');
  });
});

describe('routine rework: truthful pace after source-range regeneration', () => {
  it('counts complete effective tasks from canonical stage evidence, without requiring a duplicate visible-id tick', () => {
    let data = fixture(); data = setPersonalStageCompletion(data, IDS[0], 'class', true, '2026-11-23T12:00:00Z');
    const plan = buildStudyPlan(data, data.settings.startDate), completedCount = overallTaskProgress(plan, data).done;
    expect(completedCount).toBeGreaterThan(0);
    expect(recentTaskPace(plan, data, '2026-11-24')).toBe(completedCount / 14);
    expect(testPrepStats(data, plan, '2026-11-24').paceTasksPerDay).toBe(Math.round(completedCount / 14 * 100) / 100);
    expect(data.completed).toEqual({ [personalStageSourceId(data.personalRoutine!, IDS[0], 'class')]: '2026-11-23T12:00:00Z' });
  });
  it('uses the actual first full range coverage within Bangladesh days, not newer duplicate ticks or partial work', () => {
    const data = fixture(), task = buildStudyPlan(data, data.settings.startDate)[0].tasks[0], work = task.personalWork!;
    const plan = [{ date: task.date, index: 1, phase: 'learn' as const, isCatchup: false, tasks: [task] }];
    const middle = work.from + 10, encoded = encodeURIComponent(work.sourceId);
    data.completed[`smart-part|${encoded}|${work.from}|${middle}`] = '2026-11-09T12:00:00Z';
    expect(recentTaskPace(plan, data, '2026-11-23')).toBe(0);
    // This UTC-evening confirmation belongs to 23 November in Bangladesh.
    data.completed[`smart-part|${encoded}|${middle}|${work.to}`] = '2026-11-22T19:00:00Z';
    expect(recentTaskPace(plan, data, '2026-11-22', 1)).toBe(0);
    expect(recentTaskPace(plan, data, '2026-11-23', 1)).toBe(1);
    // A later redundant canonical tick must not re-count work finished before the window.
    data.completed[work.sourceId] = '2026-12-09T12:00:00Z';
    expect(recentTaskPace(plan, data, '2026-12-09', 14)).toBe(0);
    expect(recentTaskPace(plan, data, '2026-12-09', 0)).toBe(0);
    expect(recentTaskPace(plan, data, '2026-12-09', Infinity)).toBe(0);
  });
});
