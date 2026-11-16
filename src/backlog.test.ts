import { describe, expect, it } from 'vitest';
import {
  applyBacklogPlan, backlogBuckets, backlogBySubject, backlogItems, criticalBacklog, dropBacklog,
  itemTaskIds, mergeFragments, mergedMinutes, planBacklog, repeatedChapters,
} from './backlog';
import type { BacklogItem } from './backlog';
import { buildPlan, freshData, addDays } from './planner';
import { plannedMinutes } from './adaptive';
import type { AppData, Day, Task } from './planner';
import { CHAPTERS } from './data';

const TODAY = '2026-11-16';
const data = freshData();
/** A plan that starts six days ago, so the student "missed" a week of work. */
const latePlan = buildPlan({ ...data.settings, startDate: addDays(TODAY, -6) });

const chapterA = CHAPTERS.find(chapter => chapter.priority === 'A')!;
const chapterB = CHAPTERS.find(chapter => chapter.priority === 'B')!;

const task = (id: string, chapterId: string, start: number, end: number, date: string): Task => ({
  id, date, dayIndex: 0, phase: 'learn', subject: 'physics', kind: 'learn',
  title: `${chapterId} ${id}`, detail: '', chapterIds: [chapterId], startMinute: start, endMinute: end,
});
const day = (date: string, tasks: Task[]): Day => ({ date, index: 0, phase: 'learn', tasks, isCatchup: false });
const item = (id: string, minutes: number, chapterId = chapterB.id, daysLate = 2): BacklogItem => ({
  taskId: id, title: `task ${id}`, subject: 'physics', chapterIds: [chapterId], minutes,
  fromDate: addDays(TODAY, -daysLate), daysLate, reason: 'missed', alreadyCarried: false, carryoverIds: [],
});

describe('what counts as backlog', () => {
  it('collects missed plan work and ignores finished or removed sessions', () => {
    const items = backlogItems(latePlan, data, TODAY);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(entry => entry.daysLate > 0)).toBe(true);

    const first = latePlan[0].tasks[0];
    const done: AppData = { ...data, completed: { [first.id]: '2026-01-01T00:00:00.000Z' } };
    expect(backlogItems(latePlan, done, TODAY).some(entry => entry.taskId === first.id)).toBe(false);

    const removed: AppData = { ...data, removedTasks: [first.id] };
    expect(backlogItems(latePlan, removed, TODAY).some(entry => entry.taskId === first.id)).toBe(false);
  });

  it('never treats a future or today session as backlog', () => {
    const items = backlogItems(latePlan, data, TODAY);
    for (const entry of items) expect(entry.fromDate < TODAY).toBe(true);
  });

  it('leaves exams and video blocks out — they are not reading tasks', () => {
    const exam: Task = { ...task('exam-1', chapterB.id, 0, 120, addDays(TODAY, -3)), kind: 'exam' };
    const withExam = [day(addDays(TODAY, -3), [exam])];
    expect(backlogItems(withExam, data, TODAY)).toHaveLength(0);
  });

  it('groups items into today / yesterday / week / older', () => {
    const items = [item('a', 60, chapterB.id, 0), item('b', 60, chapterB.id, 1), item('c', 60, chapterB.id, 4), item('d', 60, chapterB.id, 20)];
    const buckets = backlogBuckets(items);
    expect(buckets.map(bucket => bucket.key)).toEqual(['today', 'yesterday', 'week', 'older']);
    expect(buckets.every(bucket => bucket.minutes === 60)).toBe(true);
  });
});

describe('merging fragments', () => {
  it('turns several small pieces of one chapter into a single block', () => {
    const merged = mergeFragments([item('a', 10), item('b', 10), item('c', 20)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].minutes).toBe(40);
    expect(merged[0].sourceTaskIds).toHaveLength(3);
    expect(itemTaskIds(merged[0]).sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps different chapters separate', () => {
    const merged = mergeFragments([item('a', 30, chapterA.id), item('b', 30, chapterB.id)]);
    expect(merged).toHaveLength(2);
  });

  it('keeps the oldest date when fragments merge', () => {
    const merged = mergeFragments([item('a', 20, chapterB.id, 3), item('b', 20, chapterB.id, 8)]);
    expect(merged[0].daysLate).toBe(8);
  });
});

describe('spreading the backlog', () => {
  it('never puts more on a day than the ceiling allows', () => {
    const sparse: Day[] = [day(TODAY, [task('x', chapterB.id, 0, 120, TODAY)])];
    const backlog = planBacklog(sparse, data, TODAY, { horizonDays: 7, bufferMinutes: 0 });
    expect(backlog.days[0].cap).toBeLessThanOrEqual(480);
    expect(backlog.days[0].before).toBe(120);
    for (const entry of backlog.days) {
      expect(entry.before + entry.added).toBeLessThanOrEqual(entry.cap);
    }
  });

  it('reports a full day instead of silently writing it off', () => {
    const backlog = planBacklog(latePlan, data, TODAY, { horizonDays: 3 });
    expect(backlog.days.every(entry => entry.before >= entry.cap)).toBe(true);
    expect(backlog.days.every(entry => entry.note === 'full')).toBe(true);
    expect(backlog.unplaced.length).toBeGreaterThan(0);
  });

  it('never lets a total exceed the daily ceiling in a realistic week', () => {
    const backlog = planBacklog(latePlan, data, TODAY, { horizonDays: 14 });
    for (const entry of backlog.days) {
      expect(entry.before + entry.added).toBeLessThanOrEqual(entry.cap);
    }
    expect(backlog.cap).toBeLessThanOrEqual(480);
  });

  it('skips locked days entirely', () => {
    const locked: AppData = { ...data, lockedDates: [TODAY, addDays(TODAY, 1)] };
    const backlog = planBacklog(latePlan, locked, TODAY, { horizonDays: 3 });
    expect(backlog.days[0].note).toBe('locked');
    expect(backlog.days[0].room).toBe(0);
  });

  it('flags the work the student must not skip', () => {
    const items = [item('a', 60, chapterA.id), item('b', 30, chapterB.id)];
    const critical = criticalBacklog(items, data);
    expect(critical.map(entry => entry.taskId)).toEqual(['a']);
  });

  it('summarises the backlog by subject, worst first', () => {
    const summary = backlogBySubject(backlogItems(latePlan, data, TODAY));
    expect(summary.length).toBeGreaterThan(0);
    for (let index = 1; index < summary.length; index += 1) {
      expect(summary[index - 1].minutes).toBeGreaterThanOrEqual(summary[index].minutes);
    }
  });
});

describe('honest resolutions when there is no room', () => {
  it('marks backlog as covered when the same chapter is already scheduled', () => {
    const backlog = planBacklog(latePlan, data, TODAY, { horizonDays: 7 });
    expect(backlog.merged.length).toBeGreaterThan(0);
    expect(mergedMinutes(backlog)).toBeGreaterThan(0);
  });

  it('applying creates carryovers only for placed work', () => {
    const backlog = planBacklog(latePlan, data, TODAY, { horizonDays: 7 });
    const applied = applyBacklogPlan(backlog, data, latePlan);
    expect(applied.placed).toBe(backlog.placements.reduce((sum, placement) => sum + placement.taskIds.length, 0));
    expect(applied.data.carryovers).toHaveLength(applied.placed);
  });

  it('letting go removes the work from the backlog for good', () => {
    const backlog = planBacklog(latePlan, data, TODAY, { horizonDays: 7 });
    const ids = backlog.unplaced.flatMap(itemTaskIds);
    expect(ids.length).toBeGreaterThan(0);
    const dropped = dropBacklog(data, ids);
    expect(dropped.removedTasks.length).toBe(ids.length);
    const after = planBacklog(latePlan, dropped, TODAY, { horizonDays: 7 });
    expect(after.items.length).toBeLessThan(backlog.items.length);
    // Dropping the same ids twice must not duplicate them.
    expect(dropBacklog(dropped, ids).removedTasks).toHaveLength(ids.length);
  });

  it('finds repeated chapters but not one-off misses', () => {
    const items = [item('a', 30, chapterB.id), item('b', 30, chapterB.id), item('c', 30, chapterA.id)];
    const repeated = repeatedChapters(items);
    expect(repeated.map(entry => entry.chapterId)).toEqual([chapterB.id]);
    expect(repeated[0].count).toBe(2);
  });
});

describe('it never breaks the existing plan', () => {
  it('does not change the plan days it was given', () => {
    const before = latePlan.map(entry => plannedMinutes(entry));
    planBacklog(latePlan, data, TODAY);
    expect(latePlan.map(entry => plannedMinutes(entry))).toEqual(before);
  });

  it('reports zero backlog for a plan that starts today and is untouched', () => {
    const fresh = buildPlan({ ...data.settings, startDate: TODAY });
    expect(backlogItems(fresh, data, TODAY)).toHaveLength(0);
  });
});
