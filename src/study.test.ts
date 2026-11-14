import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { buildPlan, freshData } from './planner';
import { addBacklogToToday, addCarryover, addStudySession, autoCarryover, chapterMeta, deleteStudySession, pendingCarryovers, toggleCarryover, updateChapterMeta } from './study';

const plan = buildPlan();
const firstTask = plan[0].tasks[0];
describe('study sessions and carryover', () => {
  it('adds and removes a measured session without double-counting', () => {
    let data = freshData();
    data = addStudySession(data, { minutes: 30, subject: 'physics', mode: 'pomodoro' });
    expect(data.studySessions).toHaveLength(1);
    expect(data.focus).toEqual({ minutes: 30, sessions: 1 });
    const id = data.studySessions[0].id;
    data = deleteStudySession(data, id);
    expect(data.studySessions).toHaveLength(0);
    expect(data.focus).toEqual({ minutes: 0, sessions: 0 });
  });
  it('keeps chapter metadata and adds a carryover once per task/day', () => {
    let data = freshData();
    expect(chapterMeta(data, CHAPTERS[0].id).note).toBe('');
    data = updateChapterMeta(data, CHAPTERS[0].id, { note: 'সূত্র লিখলাম', weak: true });
    expect(chapterMeta(data, CHAPTERS[0].id)).toMatchObject({ note: 'সূত্র লিখলাম', weak: true });
    data = addCarryover(data, firstTask, '2026-11-20');
    const again = addCarryover(data, firstTask, '2026-11-20');
    expect(again).toBe(data);
    expect(pendingCarryovers(data)).toHaveLength(1);
    expect(pendingCarryovers(data)[0]).toMatchObject({ taskId: firstTask.id, minutes: firstTask.endMinute - firstTask.startMinute, fromDate: firstTask.date });
  });
  it('marks the original task complete when the carried copy is ticked', () => {
    let data = addCarryover(freshData(), firstTask, '2026-11-20');
    const carried = pendingCarryovers(data)[0];
    data = toggleCarryover(data, carried.id);
    expect(data.completed[firstTask.id]).toBeTruthy();
    expect(pendingCarryovers(data)).toHaveLength(0);
  });
  it('auto-carries at most six recent non-exam sessions per day', () => {
    const data = freshData();
    data.settings.carryoverMode = 'auto';
    const next = autoCarryover(plan, data, '2026-11-20');
    const today = next.carryovers.filter(item => item.date === '2026-11-20');
    expect(today.length).toBeGreaterThan(0);
    expect(today.length).toBeLessThanOrEqual(6);
    expect(today.every(item => item.fromDate < '2026-11-20' && item.fromDate >= '2026-11-10')).toBe(true);
    expect(autoCarryover(plan, next, '2026-11-20')).toBe(next);
  });
  it('adds up to five backlog sessions on demand', () => {
    const data = freshData();
    const result = addBacklogToToday(plan, data, '2026-11-20', 5);
    expect(result.added).toBe(5);
    expect(result.data.carryovers).toHaveLength(5);
    expect(result.data.carryovers.every(item => item.date === '2026-11-20')).toBe(true);
  });
});
