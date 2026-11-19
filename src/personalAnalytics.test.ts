import { describe, expect, it } from 'vitest';
import { badgeList, completedTasksBetween, completedTasksOn, weeklyReview } from './analytics';
import { weekReport } from './backup';
import { addDays } from './planner';
import { buildStudyPlan } from './studyPlan';
import { WORK_STAGES, applyPersonalRoutine, nextPersonalRoutine, personalStageSourceId, setPersonalStageCompletion } from './personalRoutine';
import { PERSONAL_IDS, personalDataFixture } from './test/personalRoutineFixture';

const stamp = '2026-11-20T18:15:00Z'; // 21 November in Bangladesh
const finish = (data: ReturnType<typeof personalDataFixture>, id: string) => {
  for (const stage of WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id))) data = setPersonalStageCompletion(data, id, stage.id, true, stamp);
  return data;
};
describe('personal analytics remain scoped and evidence-based', () => {
  it('counts canonical and old-partition range evidence once on the Bangladesh day of first full coverage', () => {
    const data = personalDataFixture(), plan = buildStudyPlan(data, data.settings.startDate), task = plan[0].tasks[0], work = task.personalWork!;
    const mid = Math.floor((work.from + work.to) / 2);
    data.completed[`smart-part|${encodeURIComponent(work.sourceId)}|${work.from}|${mid}`] = '2026-11-19T17:00:00Z';
    data.completed[`smart-part|${encodeURIComponent(work.sourceId)}|${mid}|${work.to}`] = stamp;
    data.completed[task.id] = '2026-11-22T12:00:00Z'; // redundant tick must not re-count work
    expect(completedTasksOn(plan, data, '2026-11-20')).toHaveLength(0);
    expect(completedTasksOn(plan, data, '2026-11-21').map(item => item.id)).toEqual([task.id]);
    expect(completedTasksOn(plan, data, '2026-11-22')).toHaveLength(0);
    expect(completedTasksBetween(plan, data, '2026-11-19', '2026-11-21').map(item => item.id)).toEqual([task.id]);
    expect(weekReport(data, plan, '2026-11-21').tasksDone).toBe(1);
  });
  it('uses configured availability, off-days, exclusions, net limits and the real plan horizon for weekly goals', () => {
    const data = personalDataFixture(); data.personalRoutine!.windows = data.personalRoutine!.windows.filter(window => [5, 6].includes(window.weekday));
    data.personalRoutine!.dailyLimitMinutes = 90;
    data.personalRoutine!.exclusions = [{ weekday: 5, startMinute: 1080, endMinute: 1320 }]; // Friday 30m; Saturday 90m
    const plan = buildStudyPlan(data, data.settings.startDate);
    expect(weeklyReview(plan, data, addDays(data.settings.startDate, -1)).targetMinutes).toBe(0);
    expect(weeklyReview(plan, data, '2026-11-21').targetMinutes).toBe(120);
    data.personalRoutine!.startsOn = '2026-11-21';
    expect(weeklyReview(plan, data, '2026-11-21').targetMinutes).toBe(90);
  });
  it('requires six groups for weekly completed chapters and retains completed S statistics after switching to A', () => {
    let data = personalDataFixture();
    data = setPersonalStageCompletion(data, PERSONAL_IDS[0], 'class', true, stamp);
    let plan = buildStudyPlan(data, '2026-11-21');
    expect(weeklyReview(plan, data, '2026-11-21').chaptersCompleted).toHaveLength(0);
    expect(weekReport(data, plan, '2026-11-21').chaptersDone).toBe(0);
    for (const id of PERSONAL_IDS) data = finish(data, id);
    data = applyPersonalRoutine(data, nextPersonalRoutine(data, '2026-11-24')!, { asOf: '2026-11-24' });
    plan = buildStudyPlan(data, '2026-11-24');
    expect(weeklyReview(plan, data, '2026-11-21').chaptersCompleted).toEqual(PERSONAL_IDS);
    expect(weekReport(data, plan, '2026-11-21').chaptersDone).toBe(2);
    data = setPersonalStageCompletion(data, PERSONAL_IDS[0], 'notes', false);
    expect(weeklyReview(buildStudyPlan(data, '2026-11-24'), data, '2026-11-21').chaptersCompleted).toEqual([PERSONAL_IDS[1]]);
  });
  it('does not move a previously completed chapter into a newer week because of a redundant range tick', () => {
    let data = finish(personalDataFixture(), PERSONAL_IDS[0]);
    const sourceId = personalStageSourceId(data.personalRoutine!, PERSONAL_IDS[0], 'class');
    data.completed[`smart-part|${encodeURIComponent(sourceId)}|0|1`] = '2026-11-28T08:00:00Z';
    const plan = buildStudyPlan(data, '2026-11-28');
    expect(weeklyReview(plan, data, '2026-11-28').chaptersCompleted).toHaveLength(0);
    expect(weekReport(data, plan, '2026-11-28').chaptersDone).toBe(0);
    expect(badgeList(data, plan, '2026-11-28').find(item => item.id === 'chapter-10')!.earned).toBe(false);
  });
});
