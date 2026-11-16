import { describe, expect, it } from 'vitest';
import { buildPlan, freshData } from './planner';
import type { Day, Task } from './planner';
import { testPrepStats } from './testPrep';
import { S_CHAPTERS } from './superCategory';

function fixture() {
  const data = freshData();
  data.settings.startDate = '2026-12-01';
  data.settings.testExamDate = '2026-12-10';
  const template = buildPlan(data.settings)[0];
  const task = template.tasks[0];
  const day = (date: string, id: string): Day => ({ ...template, date, tasks: [{ ...task, id, date, chapterIds: [S_CHAPTERS[0].id] } as Task] });
  return { data, plan: [day('2026-12-09', 'before'), day('2026-12-10', 'boundary'), day('2026-12-11', 'late:part-1')] };
}
describe('test prep deadline and observed pace', () => {
  for (const category of ['A', 'S'] as const) {
    it(`${category}: includes deadline day and excludes later tasks, even part IDs`, () => {
      const { data, plan } = fixture();
      expect(testPrepStats(data, plan, '2026-12-02', category).remainingATasks).toBe(2);
      data.completed['late:part-1'] = '2026-12-02T10:00:00Z';
      expect(testPrepStats(data, plan, '2026-12-02', category).paceTasksPerDay).toBe(0);
    });
  }
  it('uses one observed day on day one, then elapsed days up to fourteen', () => {
    const { data, plan } = fixture();
    data.completed.before = '2026-12-01T10:00:00Z';
    expect(testPrepStats(data, plan, '2026-12-01').paceTasksPerDay).toBe(1);
    expect(testPrepStats(data, plan, '2026-12-02').paceTasksPerDay).toBe(0.5);
    expect(testPrepStats(data, plan, '2026-11-30').paceTasksPerDay).toBe(0);
    data.settings.testExamDate = '2027-01-01';
    data.completed.before = '2026-12-15T10:00:00Z';
    expect(testPrepStats(data, plan, '2026-12-15').paceTasksPerDay).toBe(0.07);
  });
  it('does not count future or post-deadline completion timestamps', () => {
    const { data, plan } = fixture();
    data.completed.before = '2026-12-03T10:00:00Z';
    expect(testPrepStats(data, plan, '2026-12-02').paceTasksPerDay).toBe(0);
    data.completed.before = '2026-12-11T10:00:00Z';
    expect(testPrepStats(data, plan, '2026-12-12').paceTasksPerDay).toBe(0);
  });
});
