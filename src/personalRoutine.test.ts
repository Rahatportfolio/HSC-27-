import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { buildPlan, dailyTargetMinutes, freshData, isChapterDone } from './planner';
import { parseBackup } from './storage';
import { buildStudyPlan } from './studyPlan';
import { setTaskCompletion } from './study';
import { learningDashboard } from './learning';
import { RECOMMENDED_S_IDS, WORK_STAGES, applyPersonalRoutine, buildPersonalStudyProjection, chapterWorkEstimate, defaultChapterWorkload, isPersonalTaskComplete, newPersonalRoutine, parsePersonalRoutine, personalChapterPairs, personalRoutineHealth, undoPersonalRange } from './personalRoutine';
import type { ChapterWorkload, PersonalRoutine } from './personalRoutine';

const ids = ['physics-1-3', 'chemistry-1-3', 'math-1-1', 'physics-1-4'];
function workload(classMinutes = 240, mcq = 0, cq = 0): ChapterWorkload {
  const w = defaultChapterWorkload(ids[0]);
  for (const stage of WORK_STAGES) w[stage.id] = { minutes: stage.media ? stage.id === 'class' ? classMinutes : stage.id === 'mcqClass' ? mcq : cq : 1, source: stage.media ? 'student' : 'planned' };
  return w;
}
function routine(selected = ids.slice(0, 2)): PersonalRoutine {
  return { ...newPersonalRoutine(), chapterIds: selected, windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
    sessionMinutes: 120, breakMinutes: 0, workloads: Object.fromEntries(selected.map(id => [id, workload()])) };
}
function dataFor(r = routine()) { const data = freshData(); data.personalRoutine = r; return data; }
const tasksFor = (data = dataFor()) => buildStudyPlan(data, data.settings.startDate).flatMap(day => day.tasks);
const total = (tasks: ReturnType<typeof tasksFor>) => tasks.reduce((n, task) => n + task.endMinute - task.startMinute, 0);

describe('personal S-only routine', () => {
  it('recommends an important strict subset of A, never relabels every A chapter or claims an official category', () => {
    expect(RECOMMENDED_S_IDS.length).toBeGreaterThan(0);
    expect(RECOMMENDED_S_IDS.length).toBeLessThan(CHAPTERS.filter(c => c.priority === 'A').length);
    expect(RECOMMENDED_S_IDS.every(id => CHAPTERS.find(c => c.id === id)?.priority === 'A')).toBe(true);
    expect(newPersonalRoutine().windows).toEqual([]);
  });
  it('uses the SAME two chapters across two days, halves teaching first and keeps practice/revision for later', () => {
    const data = dataFor(routine(ids)); const plan = buildStudyPlan(data, data.settings.startDate);
    for (const day of plan.slice(0, 2)) {
      expect(new Set(day.tasks.flatMap(task => task.chapterIds))).toEqual(new Set(ids.slice(0, 2)));
      for (const id of ids.slice(0, 2)) {
        expect(total(day.tasks.filter(task => task.chapterIds.includes(id) && task.personalWork?.stage === 'class'))).toBe(120);
        expect(total(day.tasks.filter(task => task.chapterIds.includes(id)))).toBe(day.index === 1 ? 122 : 123);
      }
    }
    expect(new Set(plan[2].tasks.flatMap(task => task.chapterIds))).toEqual(new Set(ids.slice(2)));
    expect(plan[0].tasks.every(task => task.personalWork?.pairDay === 1)).toBe(true);
    expect(plan[1].tasks.every(task => task.personalWork?.pairDay === 2)).toBe(true);
  });
  it('does not fill unused time with other chapters, B/C, automatic 13 mocks or the whole syllabus', () => {
    const data = dataFor(); const plan = buildStudyPlan(data, data.settings.startDate); const tasks = plan.flatMap(day => day.tasks);
    expect(new Set(tasks.flatMap(task => task.chapterIds))).toEqual(new Set(ids.slice(0, 2)));
    expect(plan.slice(2).every(day => !day.tasks.length)).toBe(true);
    expect(tasks.some(task => task.kind === 'exam')).toBe(false);
    expect(tasks.filter(task => task.kind === 'revision').every(task => task.personalWork?.stage === 'revision')).toBe(true);
    expect(learningDashboard(data, plan).overall.total).toBe(2);
  });
  it('keeps chapter class, MCQ class, CQ class and independent work durations distinct', () => {
    const r = routine(); for (const id of r.chapterIds) { r.workloads[id] = workload(240, 90, 420); r.workloads[id].reading.minutes = 30; r.workloads[id].mcqPractice.minutes = 45; r.workloads[id].cqPractice.minutes = 60; }
    const tasks = tasksFor(dataFor(r));
    for (const id of r.chapterIds) for (const [stage, minutes] of Object.entries({ class: 240, mcqClass: 90, cqClass: 420, reading: 30, mcqPractice: 45, cqPractice: 60 }))
      expect(total(tasks.filter(task => task.chapterIds.includes(id) && task.personalWork?.stage === stage))).toBe(minutes);
  });
  it('preserves every minute of 7/8-hour videos, keeps the pair longer, and explains a missed two-day target', () => {
    const r = routine(ids); for (const id of ids) r.workloads[id] = workload(480, 240, 420);
    const data = dataFor(r); const projection = buildPersonalStudyProjection(data); const tasks = projection.plan.flatMap(day => day.tasks);
    expect(projection.issues.some(issue => issue.code === 'two-day-capacity' && issue.minutes > 0)).toBe(true);
    const firstPairLast = tasks.filter(task => ids.slice(0, 2).includes(task.chapterIds[0])).at(-1)!;
    const nextPairFirst = tasks.find(task => ids.slice(2).includes(task.chapterIds[0]))!;
    expect(firstPairLast.date > projection.plan[1].date).toBe(true);
    expect(nextPairFirst.date > firstPairLast.date).toBe(true);
    for (const id of ids) expect(total(tasks.filter(task => task.chapterIds.includes(id)))).toBe(1145);
  });
  it('reads playback speed as an explicit choice, preserves the source range, and does not speed up practice', () => {
    const r = routine(); r.playbackSpeed = 2; r.workloads[ids[0]].reading.minutes = 30;
    const tasks = tasksFor(dataFor(r)).filter(task => task.chapterIds.includes(ids[0]));
    expect(total(tasks.filter(task => task.personalWork?.stage === 'class'))).toBe(120);
    expect(total(tasks.filter(task => task.personalWork?.stage === 'reading'))).toBe(30);
    expect(tasks.filter(task => task.personalWork?.stage === 'class').at(-1)?.personalWork?.mediaToSec).toBe(240 * 60);
  });
  it('never uses a default 80 minutes or invents completion dates for an unknown class/playlist', () => {
    const r = routine(ids); r.workloads[ids[1]].class = { minutes: null, source: 'unknown', url: 'https://www.youtube.com/playlist?list=PLexample123456' };
    const projection = buildPersonalStudyProjection(dataFor(r));
    expect(projection.unknownChapters).toEqual([ids[1]]);
    // The unknown chapter is never scheduled or given a finish date, but the
    // chapter with real durations must still appear (an empty whole plan was the bug).
    const tasks = projection.plan.flatMap(day => day.tasks);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some(task => task.chapterIds.includes(ids[1]))).toBe(false);
    expect(tasks.every(task => task.personalWork && task.personalWork.rawMinutes > 0)).toBe(true);
    const health = personalRoutineHealth(dataFor(r), projection.plan);
    expect(health.syllabusEnd).toBeUndefined();
    expect(health.missingDurations).toBe(true);
    expect(health.issues.find(issue => issue.code === 'unknown-duration')?.chapterIds).toEqual([ids[1]]);
  });
  it('honours short availability instead of legacy 8h/16h defaults and leaves off days empty', () => {
    const r = routine(); r.windows = [{ weekday: 5, startMinute: 1200, endMinute: 1260 }, { weekday: 6, startMinute: 600, endMinute: 660 }];
    const data = dataFor(r); const plan = buildStudyPlan(data, data.settings.startDate);
    expect(dailyTargetMinutes(data, plan[0].date)).toBe(60);
    expect(dailyTargetMinutes(data, plan[2].date)).toBe(0);
    for (const day of plan) {
      const windows = r.windows.filter(window => window.weekday === new Date(`${day.date}T00:00:00Z`).getUTCDay());
      for (const task of day.tasks) expect(windows.some(window => task.startMinute >= window.startMinute && task.endMinute <= window.endMinute)).toBe(true);
      expect(total(day.tasks)).toBeLessThanOrEqual(60);
    }
  });
  it('stays inside split morning/evening windows and reserves breaks inside them', () => {
    const r = routine(); r.windows = Array.from({ length: 7 }, (_, weekday) => [{ weekday, startMinute: 480, endMinute: 540 }, { weekday, startMinute: 1200, endMinute: 1290 }]).flat(); r.sessionMinutes = 40; r.breakMinutes = 10;
    const plan = buildStudyPlan(dataFor(r), '2026-11-20');
    for (const day of plan) for (const task of day.tasks) { expect(task.endMinute - task.startMinute).toBeLessThanOrEqual(40); expect((task.startMinute >= 480 && task.endMinute <= 540) || (task.startMinute >= 1200 && task.endMinute <= 1290)).toBe(true); }
  });
  it('reserves recurring/one-off appointments rather than double-booking them', () => {
    const data = dataFor(); data.routineBlocks = [{ id: 'appointment', subject: 'math', title: 'Coaching', weekday: 5, date: data.settings.startDate, startMinute: 510, minutes: 60, createdAt: '2026-11-16T10:00:00Z' }];
    const plan = buildStudyPlan(data, data.settings.startDate); const tasks = plan[0].tasks;
    expect(tasks.filter(task => task.kind === 'custom')).toHaveLength(1);
    for (const task of tasks.filter(task => task.personalWork)) expect(task.endMinute <= 510 || task.startMinute >= 570).toBe(true);
  });
  it('does not apply the legacy media overlay or adaptive chapter substitutions a second time', () => {
    const data = dataFor(); data.advanced = { classes: [{ id: 'other', chapterId: 'biology-1-1', duration: 8 * 3600, watched: 0, position: 0, speed: 1, permitted: false, url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Other chapter', teacher: '', note: '' }], preparation: {}, targets: {}, subjectMinutes: 90 };
    expect(tasksFor(data).every(task => ids.slice(0, 2).includes(task.chapterIds[0]))).toBe(true);
  });
  it('never schedules past the personal deadline or claims later chapters fit', () => {
    const data = dataFor(routine(ids)); data.settings.examDate = '2026-11-21';
    const projection = buildPersonalStudyProjection(data);
    expect(projection.issues.some(issue => issue.code === 'deadline')).toBe(true);
    expect(projection.plannedChapterIds).toEqual([]);
    expect(projection.plan.flatMap(day => day.tasks).every(task => task.date < data.settings.examDate && task.endMinute <= 1440)).toBe(true);
  });
  it('pairs different books and prefers different subjects; a single remaining book is not duplicated', () => {
    const r = routine(['physics-1-3', 'physics-1-4', 'physics-2-1', 'chemistry-1-3']);
    const pairs = personalChapterPairs(r); expect(pairs[0]).toEqual(['physics-1-3', 'chemistry-1-3']);
    for (const pair of pairs) expect(new Set(pair.map(id => id.split('-').slice(0, 2).join('-'))).size).toBe(pair.length);
  });
});

describe('personal routine evidence and backup safety', () => {
  it('a first-day half is not a completed class or chapter, and all six required sources must fit and be completed', () => {
    let data = dataFor(); const plan = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, plan[0].tasks.map(task => task.id), true, plan);
    expect(isChapterDone(plan, ids[0], data.completed)).toBe(false);
    data = setTaskCompletion(data, plan[1].tasks.map(task => task.id), true, plan);
    expect(isChapterDone(plan, ids[0], data.completed)).toBe(true);
  });
  it('an unallocated source is never certified complete by the visible fragment', () => {
    let data = dataFor(); data.settings.examDate = '2026-11-21'; const plan = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, plan[0].tasks.map(task => task.id), true, plan);
    expect(isChapterDone(plan, ids[0], data.completed)).toBe(false);
  });
  it('keeps source identities across dates/windows, reads retained range evidence and undoes only the requested range', () => {
    const data = dataFor(); const old = tasksFor(data)[0]; const at = '2026-11-20T08:00:00Z';
    data.completed[old.id] = at;
    data.personalRoutine!.sessionMinutes = 60; const next = tasksFor(data)[0];
    expect(next.originalTaskId).toBe(old.originalTaskId); expect(isPersonalTaskComplete(next, data.completed)).toBe(true);
    const undone = undoPersonalRange(data.completed, next);
    expect(isPersonalTaskComplete(next, undone)).toBe(false);
    const rest = tasksFor(data).find(task => task.originalTaskId === old.originalTaskId && task.personalWork?.from === 60)!;
    expect(isPersonalTaskComplete(rest, undone)).toBe(true);
    expect(Object.values(undone)).toEqual([at]);
  });
  it('cannot inherit completion from a different video/duration/speed', () => {
    const data = dataFor(); const old = tasksFor(data)[0]; data.completed[old.id] = '2026-11-20T08:00:00Z';
    data.personalRoutine!.workloads[ids[0]].class.minutes = 480;
    const next = tasksFor(data)[0]; expect(next.originalTaskId).not.toBe(old.originalTaskId); expect(isPersonalTaskComplete(next, data.completed)).toBe(false);
  });
  it('round-trips S selection, availability and duration provenance without losing old study/media/history', () => {
    const data = dataFor(); data.notes['2026-11-16'] = 'Keep this'; data.completed['physics-1-2:part-1'] = '2026-11-16T08:00:00Z';
    const parsed = parseBackup(JSON.stringify(data)); expect(parsed.personalRoutine).toEqual(data.personalRoutine); expect(parsed.notes).toEqual(data.notes); expect(parsed.completed).toEqual(data.completed);
    const legacy = freshData(); expect(parseBackup(JSON.stringify(legacy)).personalRoutine).toBeUndefined(); expect(buildStudyPlan(legacy, legacy.settings.startDate)).toEqual(buildPlan());
  });
  it('requires explicit migration consent and unlocks, preserves original profile identity/records', () => {
    const data = freshData(); data.settings.name = 'Student'; data.notes['2026-11-16'] = 'Old note'; data.lockedDates = [data.settings.startDate];
    expect(() => applyPersonalRoutine(data, routine())).toThrow(/লক|Unlock/);
    data.lockedDates = []; const next = applyPersonalRoutine(data, routine()); expect(next.settings).toEqual({ ...data.settings, calendarRevision: data.settings.calendarRevision + 1 }); expect(next.notes).toBe(data.notes); expect(next.completed).toBe(data.completed); expect(data.personalRoutine).toBeUndefined();
  });
  it('does not mutate profile data while projecting a preview', () => {
    const data = dataFor(); const before = JSON.stringify(data); buildStudyPlan(data, data.settings.startDate); personalRoutineHealth(data, buildStudyPlan(data, data.settings.startDate)); expect(JSON.stringify(data)).toBe(before);
  });
});

for (const [name, mutate] of Object.entries({
  'no windows': (r: PersonalRoutine) => { r.windows = []; },
  'overlapping windows': (r: PersonalRoutine) => { r.windows.push({ ...r.windows[0] }); },
  'backwards window': (r: PersonalRoutine) => { r.windows[0].endMinute = 300; },
  'no chapters': (r: PersonalRoutine) => { r.chapterIds = []; },
  'B chapter as S': (r: PersonalRoutine) => { r.chapterIds = ['physics-1-1']; },
  'duplicate chapter': (r: PersonalRoutine) => { r.chapterIds.push(r.chapterIds[0]); },
  'infinite duration': (r: PersonalRoutine) => { r.workloads[ids[0]].class.minutes = Infinity; },
  'negative duration': (r: PersonalRoutine) => { r.workloads[ids[0]].class.minutes = -1; },
  'unknown disguised as measured': (r: PersonalRoutine) => { r.workloads[ids[0]].class.minutes = null; },
  'fabricated video estimate': (r: PersonalRoutine) => { r.workloads[ids[0]].class.source = 'planned'; },
  'unsafe URL': (r: PersonalRoutine) => { r.workloads[ids[0]].class.url = 'javascript:alert(1)'; },
})) it(`rejects invalid personal routine: ${name}`, () => { const r = routine(); mutate(r); expect(() => parsePersonalRoutine(r)).toThrow(); });

it('default videos and independent workloads stay unknown until explicitly configured, never fixed 30/45/60 guesses', () => {
  const r = newPersonalRoutine(); const w = defaultChapterWorkload(RECOMMENDED_S_IDS[0]); expect(w.class.minutes).toBeNull(); expect(w.mcqClass.minutes).toBeNull(); expect(w.cqClass.minutes).toBeNull();
  expect([w.reading.minutes, w.notes.minutes, w.mcqPractice.minutes, w.cqPractice.minutes, w.revision.minutes]).toEqual([null, null, null, null, null]); expect(chapterWorkEstimate(r, RECOMMENDED_S_IDS[0]).complete).toBe(false);
});
