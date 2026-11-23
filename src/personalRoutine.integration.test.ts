import { beforeEach, describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { addDays, buildPlan, chapterStudyTasks, freshData, getStats, isChapterDone, isDayComplete } from './planner';
import { buildStudyPlan } from './studyPlan';
import { WORK_STAGES, defaultChapterWorkload, workloadFor, buildPersonalStudyProjection, hasFullPersonalAllocation, isPersonalChapterDone, isPersonalTaskComplete, personalMediaUrl, personalCompletionEvidence, personalRoutineHealth, personalScheduleDateError, personalChapterProgress } from './personalRoutine';
import { PERSONAL_IDS, personalDataFixture, personalRoutineFixture, personalWorkload } from './test/personalRoutineFixture';
import { setLanguage } from './i18n';
import { learningDashboard, chapterStage } from './learning';
import { autoCarryover, setTaskCompletion } from './study';
import { applyScheduleSettings } from './reschedule';
import { applyBacklogPlan, planBacklog } from './backlog';
import { rescheduleUnfinished } from './scheduleEdit';
import { ensureRevisions } from './revision';
import { buildDailyNotificationDigest } from './notifications';
import { estimatedFinishDate } from './prediction';
import { makeMarkdown } from './exports';
import { testPrepStats } from './testPrep';
import { parseBackup } from './storage';

beforeEach(() => setLanguage('en'));
const minutes = (tasks: ReturnType<typeof buildStudyPlan>[number]['tasks']) => tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
const planFor = (data = personalDataFixture()) => buildStudyPlan(data, data.settings.startDate);

describe('S-only routine final-projection invariants', () => {
  it('allocates every source in three-session order without discarding minutes', () => {
    const data = personalDataFixture(); const routine = data.personalRoutine!;
    routine.windows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 480, endMinute: 1320 }));
    routine.dailyLimitMinutes = 840;
    for (const id of PERSONAL_IDS) { routine.workloads[id] = personalWorkload(240, 60, 120); routine.workloads[id].reading.minutes = 20; routine.workloads[id].mcqPractice.minutes = 40; routine.workloads[id].cqPractice.minutes = 60; }
    const plan = planFor(data);
    for (const id of PERSONAL_IDS) for (const stage of WORK_STAGES) {
      const full = routine.workloads[id][stage.id].minutes!;
      expect(minutes(plan.slice(0, 2).flatMap(day => day.tasks).filter(task => task.chapterIds.includes(id) && task.personalWork?.stage === stage.id))).toBe(full);
      const ranges = plan.slice(0, 2).flatMap(day => day.tasks).filter(task => task.chapterIds.includes(id) && task.personalWork?.stage === stage.id);
      if (full) { expect(ranges[0].personalWork?.from).toBe(0); expect(ranges.at(-1)?.personalWork?.to).toBe(full); }
      for (let i = 1; i < ranges.length; i++) expect(ranges[i - 1].personalWork?.to).toBe(ranges[i].personalWork?.from);
    }
    for (const id of PERSONAL_IDS) {
      const ordered = plan.flatMap(day => day.tasks).filter(task => task.chapterIds.includes(id)).map(task => task.personalWork!.stage);
      const stages = WORK_STAGES.map(stage => stage.id);
      expect(ordered.map(stage => stages.indexOf(stage))).toEqual([...ordered.map(stage => stages.indexOf(stage))].sort((a, b) => a - b));
    }
    expect(plan.slice(2).every(day => day.tasks.length === 0)).toBe(true);
  });
  it('shares a short window between both books including the selected break, never assigning the whole first hour to one', () => {
    const data = personalDataFixture(); data.personalRoutine!.windows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 1080, endMinute: 1140 })); data.personalRoutine!.breakMinutes = 10;
    const day = planFor(data)[0];
    expect(new Set(day.tasks.flatMap(task => task.chapterIds))).toEqual(new Set(PERSONAL_IDS));
    expect(day.tasks.map(task => task.endMinute - task.startMinute)).toEqual([25, 25]);
    expect(day.tasks[1].startMinute - day.tasks[0].endMinute).toBe(10);
    expect(personalRoutineHealth(data, planFor(data)).issues.some(issue => issue.code === 'two-day-capacity')).toBe(true);
  });
  it('reserves edited and moved custom appointments at their final explicit positions without legacy reflow', () => {
    const data = personalDataFixture(); const start = data.settings.startDate, next = addDays(start, 1);
    const id = `custom-${start}-coaching`;
    data.routineBlocks = [{ id: 'coaching', weekday: 5, date: start, startMinute: 1080, minutes: 30, subject: 'math', title: 'Coaching', createdAt: '2026-11-16T08:00:00Z' }];
    data.taskEdits[id] = { date: next, title: 'Edited appointment' };
    data.dayOverrides[next] = { taskStartMinutes: { [id]: 1140 }, taskMinutes: { [id]: 60 } };
    const plan = planFor(data); const appointment = plan[1].tasks.find(task => task.id === id)!;
    expect(appointment).toMatchObject({ startMinute: 1140, endMinute: 1200, title: 'Edited appointment', date: next });
    expect(plan[0].tasks.some(task => task.id === id)).toBe(false);
    for (const task of plan[1].tasks.filter(task => task.personalWork)) expect(task.endMinute <= 1140 || task.startMinute >= 1200).toBe(true);
    expect(personalRoutineHealth(data, plan).clashingSessions).toBe(0);
  });
  it('discloses outside-window custom work and overlaps, retaining the explicit appointments for the student to resolve', () => {
    const data = personalDataFixture(); const date = data.settings.startDate;
    data.routineBlocks = [0, 1].map(index => ({ id: `outside-${index}`, date, weekday: 5, startMinute: 800, minutes: 60, subject: 'math', title: 'Keep me', createdAt: '2026-11-16T08:00:00Z' }));
    const plan = planFor(data); const health = personalRoutineHealth(data, plan);
    expect(plan[0].tasks.filter(task => task.kind === 'custom')).toHaveLength(0);
    expect(plan[0].unscheduled).toHaveLength(2);
    expect(health.issues.some(issue => issue.code === 'unscheduled')).toBe(true);
    expect(health.clashingSessions).toBe(0);
    expect(data.routineBlocks[0].startMinute).toBe(800);
  });
  it('cannot change the source chapter or shorten the source by applying an old manual task edit', () => {
    const data = personalDataFixture(); const task = planFor(data)[0].tasks[0];
    data.taskEdits[task.id] = { chapterIds: ['biology-1-1'], subject: 'biology', title: 'My label' };
    data.dayOverrides[task.date] = { taskMinutes: { [task.id]: 15 } };
    const plan = planFor(data); const edited = plan[0].tasks.find(item => item.id === task.id)!;
    expect(edited.chapterIds).toEqual(task.chapterIds); expect(edited.subject).toBe(task.subject); expect(edited.title).toBe('My label');
    expect(edited.endMinute - edited.startMinute).toBe(task.endMinute - task.startMinute);
    expect(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'source-edit')).toBe(true);
    expect(data.dayOverrides[task.date].taskMinutes![task.id]).toBe(15);
  });
  it('does not claim a finish date after a source range is removed, even if all remaining visible ranges are ticked', () => {
    let data = personalDataFixture(); const old = planFor(data); const task = old[0].tasks[0]; data.removedTasks = [task.id];
    const plan = planFor(data); data = setTaskCompletion(data, plan.flatMap(day => day.tasks).map(task => task.id), true, plan);
    expect(hasFullPersonalAllocation(data, plan, task.chapterIds[0])).toBe(false);
    expect(isChapterDone(plan, task.chapterIds[0], data.completed)).toBe(false);
    const health = personalRoutineHealth(data, plan); expect(health.syllabusEnd).toBeUndefined(); expect(health.issues.some(issue => issue.code === 'missing-allocation')).toBe(true);
  });
  it('reports every-zero work as no-work, never as an unknown duration or a completed chapter', () => {
    const data = personalDataFixture(); for (const id of PERSONAL_IDS) { data.personalRoutine!.workloads[id] = personalWorkload(0); for (const stage of WORK_STAGES) data.personalRoutine!.workloads[id][stage.id].minutes = 0; }
    const projection = buildPersonalStudyProjection(data);
    expect(projection.unknownChapters).toEqual([]); expect(projection.issues[0].code).toBe('no-work');
    expect(projection.plan.every(day => day.tasks.length === 0)).toBe(true);
    expect(learningDashboard(data, projection.plan).overall.completed).toBe(0);
  });
  it('will not extrapolate a finish date or say on-pace while some S workloads are unknown', () => {
    const data = personalDataFixture(); data.personalRoutine!.workloads[PERSONAL_IDS[1]].cqClass = { minutes: null, source: 'unknown' };
    const plan = planFor(data);
    expect(estimatedFinishDate(plan, data, data.settings.startDate)).toBeUndefined();
    expect(testPrepStats(data, plan, data.settings.startDate).onPace).toBe(false);
  });
  it('does not let a scheduled other half absorb missed real work or silently rebalance it with a legacy 45m bonus', () => {
    const data = personalDataFixture(); const plan = planFor(data); const today = plan[1].date;
    const backlog = planBacklog(plan, data, today); expect(backlog.items.length).toBeGreaterThan(0); expect(backlog.merged).toEqual([]); expect(backlog.placements.length).toBeGreaterThan(0);
    expect(backlog.days.every(day => day.before + day.added <= day.cap)).toBe(true);
    expect(applyBacklogPlan(backlog, data, plan)).toEqual({ data, placed: backlog.placements.length });
    expect(rescheduleUnfinished(plan, data, today).moved).toBeGreaterThan(0);
    data.settings.carryoverMode = 'auto'; expect(autoCarryover(plan, data, today)).toBe(data);
  });
});

describe('range evidence, undo, history and downstream integrations', () => {
  it('counts retained old range evidence in cards, daily digests, calendar completion and S-only statistics', () => {
    let data = personalDataFixture(); const oldPlan = planFor(data);
    data = setTaskCompletion(data, oldPlan[0].tasks.map(task => task.id), true, oldPlan);
    data.personalRoutine!.sessionMinutes = 30;
    const plan = planFor(data); expect(plan[0].tasks.map(task => task.id)).toEqual(oldPlan[0].tasks.map(task => task.id));
    expect(plan[0].tasks.every(task => isPersonalTaskComplete(task, data.completed))).toBe(true);
    expect(isDayComplete(plan[0], data.completed)).toBe(true);
    expect(buildDailyNotificationDigest(plan, data, plan[0].date).doneMinutes).toBe(minutes(plan[0].tasks));
    expect(getStats(plan, data, plan[0].date)).toMatchObject({ done: plan[0].tasks.length, totalChapters: 2, chapters: 0 });
    expect(learningDashboard(data, plan).overall).toMatchObject({ total: 2, completed: 0 });
  });
  it('cannot fall back to legacy all-parts completion when every personal task for a selected S chapter disappears', () => {
    const data = personalDataFixture(); const legacy = buildPlan(); const id = PERSONAL_IDS[0];
    for (const task of chapterStudyTasks(legacy, id)) data.completed[task.id] = '2026-11-16T08:00:00Z';
    const current = planFor(data); data.removedTasks = current.flatMap(day => day.tasks).filter(task => task.chapterIds.includes(id)).map(task => task.id);
    const plan = planFor(data); expect(isChapterDone(plan, id, data.completed)).toBe(false); expect(chapterStage(CHAPTERS.find(c => c.id === id)!, data, plan)).not.toBe('completed');
  });
  it('retains true full-source evidence even when later availability cannot allocate a visible session', () => {
    let data = personalDataFixture(); const plan = planFor(data);
    data = setTaskCompletion(data, plan.flatMap(day => day.tasks).map(task => task.id), true, plan);
    data.settings.examDate = addDays(data.settings.startDate, 1); data.personalRoutine!.windows = [{ weekday: 0, startMinute: 480, endMinute: 540 }];
    const empty = planFor(data); expect(empty.every(day => !day.tasks.length)).toBe(true);
    expect(isPersonalChapterDone(empty, PERSONAL_IDS[0], data.completed, data.personalRoutine)).toBe(true);
    expect(learningDashboard(data, empty).overall.completed).toBe(2);
  });
  it('explicitly undoing a source fragment clears only the affected manual-complete assertion, preserving other records and stamps', () => {
    let data = personalDataFixture(); const old = planFor(data);
    const at = '2026-11-16T08:00:00Z'; data.completed[old[0].tasks[0].id] = at;
    data.chapterMeta[PERSONAL_IDS[0]] = { note: 'Keep', weak: false, mcq: 'none', cq: 'none', updatedAt: at, stage: 'completed' };
    data.chapterMeta[PERSONAL_IDS[1]] = { note: 'Other', weak: false, mcq: 'none', cq: 'none', updatedAt: at, stage: 'fullyRevised' };
    data.personalRoutine!.sessionMinutes = 60; const plan = planFor(data); const task = plan[0].tasks[0];
    data = setTaskCompletion(data, [task.id], false, plan);
    expect(data.chapterMeta[PERSONAL_IDS[0]].stage).toBe('inProgress'); expect(data.chapterMeta[PERSONAL_IDS[0]].note).toBe('Keep');
    expect(data.chapterMeta[PERSONAL_IDS[1]].stage).toBe('fullyRevised');
    expect(isPersonalTaskComplete(task, data.completed)).toBe(false);
    const rest = plan[0].tasks.find(item => item.personalWork?.sourceId === task.personalWork?.sourceId && item.personalWork?.from === 60)!;
    expect(isPersonalTaskComplete(rest, data.completed)).toBe(true); expect(Object.values(data.completed)).toContain(at);
  });
  it('does not withdraw existing recall/history on migration, and uses actual source completion timestamps for new S cards', () => {
    let data = personalDataFixture(); const plan = planFor(data); const at = '2026-11-16T08:00:00Z';
    data.revisions = [PERSONAL_IDS[0], 'physics-1-2'].map((chapterId, index) => ({ id: `old-${index}`, chapterId, subject: 'physics', dueDate: '2026-11-30', interval: 1, createdAt: at }));
    expect(ensureRevisions(plan, data).revisions).toEqual(data.revisions);
    data = setTaskCompletion(data, plan.flatMap(day => day.tasks).map(task => task.id), true, plan);
    for (const key of Object.keys(data.completed)) data.completed[key] = at;
    data = ensureRevisions(plan, data);
    expect(data.revisions.filter(item => item.sourceTaskId?.startsWith('personal-chapter:'))).toHaveLength(10);
    expect(data.revisions.find(item => item.id === 'old-0')?.dueDate).toBe('2026-11-30');
    expect(data.revisions.filter(item => item.sourceTaskId?.startsWith('personal-chapter:') && item.interval === 1).every(item => item.dueDate === '2026-11-17')).toBe(true);
    data = setTaskCompletion(data, [plan[0].tasks[0].id], false, plan); data = ensureRevisions(plan, data);
    expect(data.revisions.some(item => item.id === 'old-0')).toBe(true); expect(data.revisions.some(item => item.id === 'old-1')).toBe(true);
  });
  it('does not use a separate advanced-media readiness overlay to complete S or rewrite recall dates', () => {
    const data = personalDataFixture(); data.advanced = { classes: [], preparation: { [PERSONAL_IDS[0]]: { lecture: true, textbook: true, notes: true, cq: true, mcq: true, revision1: true, revision2: true, modelTest: true, examReady: true } }, targets: {}, subjectMinutes: 90 };
    const plan = planFor(data); expect(chapterStage(CHAPTERS.find(c => c.id === PERSONAL_IDS[0])!, data, plan)).not.toBe('completed');
    expect(ensureRevisions(plan, data).revisions).toEqual([]);
  });
  it('cascades personal dates without inventing compulsory mock days, shifting availability clocks or changing source identities/timestamps', () => {
    const data = personalDataFixture(); const old = planFor(data); const task = old[0].tasks[0]; const stamp = '2026-11-16T08:00:00Z'; data.completed[task.id] = stamp; data.notes['2026-11-16'] = 'Real date';
    const settings = { ...data.settings, startDate: '2026-11-21', testExamDate: '2026-11-22', examDate: '2026-11-23' };
    const next = applyScheduleSettings(data, settings); const plan = planFor(next);
    expect(next.personalRoutine!.windows).toEqual(data.personalRoutine!.windows); expect(next.completed[task.id]).toBe(stamp); expect(next.notes).toBe(data.notes);
    expect(plan[0].tasks[0].originalTaskId).toBe(task.originalTaskId); expect(plan[0].tasks[0].date).toBe('2026-11-21');
    expect(plan.flatMap(day => day.tasks).some(task => task.kind === 'exam')).toBe(false);
  });
  it('exports only S goals and actual duration provenance, never an imposed 8/16h or compulsory 13-mock plan', () => {
    const data = personalDataFixture(); data.personalRoutine!.workloads[PERSONAL_IDS[0]].class.minutes = 480;
    data.notes['2026-11-16'] = 'Old note'; const md = makeMarkdown(planFor(data), data);
    expect(md).toContain('S'); expect(md).toContain('480'); expect(md).toContain('শিক্ষার্থীর দেওয়া সময়'); expect(md).toContain('Old note');
    expect(md).not.toContain('দৈনিক ১৬ ঘণ্টা'); expect(md).not.toContain('শেষ মাসের ১৩টি পরীক্ষা'); expect(md).not.toContain('## তিনটি ধাপ');
    expect(md).not.toContain('player metadata');
  });
  it('does not seek a fictitious aggregate offset into a playlist, but seeks an exact single-video source', () => {
    expect(new URL(personalMediaUrl({ url: 'https://www.youtube.com/playlist?list=PLexample1234', mediaFromSec: 3600 })!).searchParams.has('t')).toBe(false);
    expect(personalMediaUrl({ url: 'https://www.youtube.com/watch?v=abcdefghijk', mediaFromSec: 3600 })).toContain('t=3600s');
    expect(personalMediaUrl({ url: 'javascript:alert(1)', mediaFromSec: 1 })).toBeUndefined();
    expect(personalMediaUrl({ url: 'https://user:pass@youtube.com/watch?v=abcdefghijk' })).toBeUndefined();
  });
  it('round-trips midnight availability and measured seconds/provenance without altering scans or manual history', () => {
    const data = personalDataFixture(); data.personalRoutine!.windows = [{ weekday: 5, startMinute: 1320, endMinute: 1440 }];
    data.personalRoutine!.workloads[PERSONAL_IDS[0]].class = { minutes: 721 / 60, source: 'youtube-player', url: 'https://www.youtube.com/watch?v=abcdefghijk', observedAt: '2026-11-16T08:00:00Z' };
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    expect(personalRoutineFixture().chapterIds.every(id => CHAPTERS.find(chapter => chapter.id === id)?.priority === 'A')).toBe(true);
    expect(freshData().personalRoutine).toBeUndefined();
  });
});


describe('personal target dates and historical conflicts', () => {
  it('allows a short personal timeline without imposing legacy mock/revision/boost phases', () => {
    const data = personalDataFixture(); data.settings.testExamDate = addDays(data.settings.startDate, 1); data.settings.examDate = addDays(data.settings.startDate, 2);
    expect(personalScheduleDateError(data.settings)).toBeNull();
    expect(personalScheduleDateError({ ...data.settings, examDate: addDays(data.settings.startDate, 730) })).toBeNull();
    expect(personalScheduleDateError({ ...data.settings, examDate: addDays(data.settings.startDate, 731) })).toMatch(/730/);
    expect(personalScheduleDateError({ ...data.settings, testExamDate: data.settings.startDate })).toMatch(/order/);
    expect(personalScheduleDateError({ ...data.settings, testExamDate: data.settings.examDate })).toMatch(/order/);
    expect(personalScheduleDateError({ ...data.settings, startDate: '2026-02-30' })).toMatch(/valid/);
  });
  it('does not show a completed historical custom appointment as a pending overlap/outside-window conflict', () => {
    const data = personalDataFixture(); const date = data.settings.startDate;
    data.routineBlocks = [0, 1].map(index => ({ id: `history-${index}`, date, weekday: 5, startMinute: 800, minutes: 60, subject: 'math', title: 'Historical work', createdAt: '2026-11-16T08:00:00Z' }));
    const plan = planFor(data); for (const task of plan[0].unscheduled || []) data.completed[task.id] = '2026-11-16T08:00:00Z';
    const health = personalRoutineHealth(data, plan);
    expect(health.clashingSessions).toBe(0); expect(health.issues.some(issue => ['custom-outside', 'overlap'].includes(issue.code))).toBe(false);
    expect(data.routineBlocks).toHaveLength(2); expect(Object.keys(data.completed)).toHaveLength(2);
  });
});

it('does not invent new completion times by bulk-ticking already-covered regenerated ranges', () => {
  let data = personalDataFixture(); let plan = planFor(data);
  data = setTaskCompletion(data, plan.flatMap(day => day.tasks).map(task => task.id), true, plan);
  for (const key of Object.keys(data.completed)) data.completed[key] = '2026-11-16T08:00:00Z';
  const original = { ...data.completed };
  data.personalRoutine!.sessionMinutes = 30; plan = planFor(data);
  data = setTaskCompletion(data, plan.flatMap(day => day.tasks).map(task => task.id), true, plan);
  expect(data.completed).toEqual(original);
  expect(new Set(personalCompletionEvidence(data, PERSONAL_IDS[0]))).toEqual(new Set(['2026-11-16T08:00:00Z']));
});

describe('missing durations never blank out the whole plan', () => {
  beforeEach(() => setLanguage('bn'));
  // Reproduces the 2026-11-20 report: every selected chapter still on the
  // default unknown workload produced "0/0 tasks done" and "No work left".
  // The fix is a visible, editable 20-hour estimate — never a blank plan and
  // never a fabricated measured duration.
  const unknownData = (knownIds: string[] = []) => {
    const data = personalDataFixture(['physics-1-3', 'chemistry-1-3']);
    const routine = data.personalRoutine!;
    for (const id of routine.chapterIds) if (!knownIds.includes(id)) routine.workloads[id] = defaultChapterWorkload(id);
    return data;
  };
  it('gives an all-unknown chapter the 20-hour estimate instead of no work at all', () => {
    const data = unknownData();
    expect(workloadFor(data.personalRoutine!, 'chemistry-1-3').class).toMatchObject({ minutes: 480, source: 'default24' });
    const plan = planFor(data), health = personalRoutineHealth(data, plan);
    expect(minutes(plan.flatMap(day => day.tasks))).toBeGreaterThan(0);
    expect(health.missingDurations).toBe(false);
    expect(plan.flatMap(day => day.tasks).some(task => task.chapterIds.includes('chemistry-1-3'))).toBe(true);
  });
  it('keeps a configured chapter exactly as entered while the unknown one gets the estimate', () => {
    const data = unknownData(['physics-1-3']);
    expect(data.personalRoutine!.workloads['physics-1-3'].class).toEqual(personalWorkload(240).class);
    expect(workloadFor(data.personalRoutine!, 'chemistry-1-3').class.source).toBe('default24');
    const plan = planFor(data);
    expect(minutes(plan.flatMap(day => day.tasks).filter(task => task.chapterIds.includes('physics-1-3')))).toBeGreaterThan(0);
    expect(minutes(plan.flatMap(day => day.tasks).filter(task => task.chapterIds.includes('chemistry-1-3')))).toBeGreaterThan(0);
  });
  it('fills a mixed pair so the missing chapter is scheduled, not silently dropped', () => {
    const data = personalDataFixture(['physics-1-3']);
    const routine = data.personalRoutine!;
    // Same book, so both chapters form one pair: one known, one still unknown.
    routine.chapterIds = ['physics-1-3', 'physics-1-1'];
    routine.workloads = { 'physics-1-3': personalWorkload(240), 'physics-1-1': defaultChapterWorkload('physics-1-1') };
    const plan = planFor(data); const health = personalRoutineHealth(data, plan);
    expect(health.issues.find(issue => issue.code === 'unknown-duration')).toBeUndefined();
    expect(plan.flatMap(day => day.tasks).some(task => task.chapterIds.includes('physics-1-1'))).toBe(true);
    expect(plan.flatMap(day => day.tasks).some(task => task.chapterIds.includes('physics-1-3'))).toBe(true);
  });
  it('reports the extra days the 20-hour default needs instead of inventing a finish date', () => {
    const data = unknownData();
    const health = personalRoutineHealth(data, planFor(data));
    expect(health.issues.filter(issue => issue.code === 'two-day-capacity')).toHaveLength(1);
    expect(health.warnings.join(' ')).not.toContain('বাড়তি দিনে চলবে');
  });
});

describe('a changed source is reported instead of silently dropping progress', () => {
  it('names the chapter when a replaced video no longer counts old ticks', () => {
    let data = personalDataFixture(['physics-1-3']);
    const plan = planFor(data);
    data = setTaskCompletion(data, plan.flatMap(day => day.tasks).map(task => task.id), true, plan);
    expect(personalChapterProgress(data.personalRoutine!, 'physics-1-3', data.completed).readinessPercent).toBe(100);
    data.personalRoutine!.workloads['physics-1-3'].class.url = 'https://www.youtube.com/watch?v=replacedvid1';
    const health = personalRoutineHealth(data, planFor(data));
    const stale = health.issues.find(issue => issue.code === 'stale-evidence');
    expect(stale?.chapterIds).toEqual(['physics-1-3']);
    expect(health.warnings.some(warning => /ভিডিও\/গণনার উৎস|video\/calculation source/.test(warning))).toBe(true);
    // The old timestamp is retained as history, never deleted behind the student's back.
    expect(Object.keys(data.completed).length).toBeGreaterThan(0);
  });
});
