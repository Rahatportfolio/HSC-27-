import { describe, expect, it } from 'vitest';
import {
  HARD_DAILY_CAP_MINUTES, adaptiveCap, adaptiveTasksFor, applyAdaptivePlan, crowdedDays,
  daysToExam, displaceableTask, plannedMinutes, roomOnDay,
} from './adaptive';
import { buildPlan, freshData } from './planner';
import type { AppData, Day, Task } from './planner';
import { CHAPTERS, chapterById } from './data';
import type { WeaknessRow } from './weakness';

const TODAY = '2026-03-10';
const plan = buildPlan({ ...freshData().settings, startDate: TODAY });

const chapterA = CHAPTERS.find(chapter => chapter.priority === 'A')!;
const chapterB = CHAPTERS.find(chapter => chapter.priority === 'B')!;
const chapterC = CHAPTERS.find(chapter => chapter.priority === 'C') ?? chapterB;
// A second priority-A chapter, so a weak target never collides with the day's own work.
const chapterA2 = CHAPTERS.find(chapter => chapter.priority === 'A' && chapter.id !== chapterA.id)!;

const row = (chapterId: string, score = 9, dueRetries = 0): WeaknessRow => {
  const chapter = chapterById[chapterId];
  return {
    chapterId, subject: chapter.subject, chapter, priority: chapter.priority, score,
    signals: [{ label: 'MCQ 30%', labelEn: 'MCQ 30%', weight: 4 }],
    stagePercent: 40, action: 'practice', actionLabel: 'MCQ অনুশীলন', actionLabelEn: 'Practise MCQ', dueRetries,
  };
};

const task = (id: string, chapterId: string, start: number, end: number, kind: Task['kind'] = 'learn'): Task => ({
  id, date: TODAY, dayIndex: 0, phase: 'learn', subject: chapterById[chapterId].subject, kind,
  title: `${chapterId} কাজ`, detail: '', chapterIds: [chapterId], startMinute: start, endMinute: end,
});
const day = (date: string, tasks: Task[]): Day => ({ date, index: 0, phase: 'learn', tasks, isCatchup: false });

describe('the 8-hour ceiling', () => {
  it('never lets a day exceed eight hours, whatever the settings say', () => {
    const data: AppData = { ...freshData(), settings: { ...freshData().settings, dailyHours: 18, boostEnabled: true, boostStartDate: '2026-01-01', boostDailyHours: 18 } };
    expect(adaptiveCap(data, TODAY, 120)).toBe(HARD_DAILY_CAP_MINUTES);
    expect(adaptiveCap(data, TODAY, 0)).toBe(HARD_DAILY_CAP_MINUTES);
  });

  it('lets a lighter day use its own target plus the buffer but never more than eight hours', () => {
    const data: AppData = { ...freshData(), settings: { ...freshData().settings, dailyHours: 4, boostEnabled: false } };
    expect(adaptiveCap(data, TODAY, 30)).toBe(270);
    // 18h target is clamped to the 8h ceiling before the buffer is ever added.
    expect(adaptiveCap(data, TODAY, 600)).toBe(360);
  });

  it('reports room without ever returning a negative number', () => {
    const full = day(TODAY, [task('a', chapterB.id, 0, 480)]);
    expect(roomOnDay(full, 480)).toBe(0);
    expect(roomOnDay(undefined, 480)).toBe(480);
    expect(plannedMinutes(full)).toBe(480);
  });
});

describe('choosing what may give up its slot', () => {
  const data = freshData();
  it('prefers C over B and never touches an A-priority block', () => {
    const mixed = day(TODAY, [task('a', chapterA.id, 0, 80), task('b', chapterB.id, 80, 160), task('c', chapterC.id, 160, 240)]);
    expect(displaceableTask(mixed, data)?.id).toBe('c');
  });

  it('returns null for a day that is all A-priority work', () => {
    expect(displaceableTask(day(TODAY, [task('a', chapterA.id, 0, 80)]), data)).toBeNull();
  });

  it('never displaces exams, videos, completed work or adaptive blocks', () => {
    const lockedDay = day(TODAY, [
      task('exam', chapterB.id, 0, 180, 'exam'),
      { ...task('video', chapterB.id, 180, 260), video: { classId: 'x', from: 0, to: 1 } },
      { ...task('adaptive|2026-03-10|x', chapterB.id, 260, 340) },
    ]);
    expect(displaceableTask(lockedDay, data)).toBeNull();
    const completed = day(TODAY, [task('done', chapterB.id, 0, 80)]);
    expect(displaceableTask(completed, { ...data, completed: { done: '2026-03-10T09:00:00.000Z' } })).toBeNull();
  });
});

describe('rebalancing a full day', () => {
  // A day built entirely from A work: nothing may be displaced, so it must be reported.
  const fullA = plan.find(entry => entry.tasks.length > 0 && entry.tasks.every(item => chapterById[item.chapterIds[0]]?.priority === 'A')) ?? plan[0];

  it('never adds minutes to an already full day', () => {
    const result = applyAdaptivePlan(plan, [row(chapterA.id)], freshData(), TODAY, { horizonDays: 1 });
    const after = result.plan.find(entry => entry.date === TODAY)!;
    expect(plannedMinutes(after)).toBeLessThanOrEqual(HARD_DAILY_CAP_MINUTES);
    expect(plannedMinutes(after)).toBeLessThanOrEqual(result.capMinutes);
  });

  it('reports a weak chapter honestly when every block on the day is A-priority', () => {
    const data = freshData();
    const result = applyAdaptivePlan([fullA], [row(chapterC.id)], data, fullA.date, { horizonDays: 1 });
    expect(result.swaps).toHaveLength(0);
    expect(result.unfitted).toEqual([chapterC.id]);
    expect(plannedMinutes(result.plan[0])).toBe(plannedMinutes(fullA));
  });

  it('reallocates a B/C block on a full mixed day and keeps the total identical', () => {
    const data = freshData();
    // Filled right up to the 8h ceiling: there is no spare room, only a lower-value block to trade.
    const mixed = day(TODAY, [
      task('a', chapterA.id, 0, 160),
      task('b', chapterB.id, 160, 320),
      task('c', chapterC.id, 320, 480),
    ]);
    const result = applyAdaptivePlan([mixed], [row(chapterA2.id)], data, TODAY, { horizonDays: 1, minBlockMinutes: 45 });
    expect(result.swaps).toHaveLength(1);
    const swap = result.swaps[0];
    expect(swap.filledGap).toBe(false);
    expect(swap.replacedChapterIds).toEqual([chapterC.id]);
    expect(plannedMinutes(result.plan[0])).toBe(480);
    // The weak chapter now owns a block; the displaced work moved to a later day or is reported.
    expect(adaptiveTasksFor(result.plan, TODAY)).toHaveLength(1);
    expect(result.moved.length + result.dropped.length).toBe(1);
  });

  it('fills genuine spare room instead of displacing anything', () => {
    const data: AppData = { ...freshData(), settings: { ...freshData().settings, dailyHours: 4, boostEnabled: false } };
    const light = day(TODAY, [task('b', chapterB.id, 0, 200)]);
    const result = applyAdaptivePlan([light], [row(chapterA.id)], data, TODAY, { horizonDays: 1, bufferMinutes: 30 });
    expect(result.swaps[0]).toMatchObject({ filledGap: true, replacedTaskId: '' });
    expect(plannedMinutes(result.plan[0])).toBe(200 + result.swaps[0].minutes);
    expect(plannedMinutes(result.plan[0])).toBeLessThanOrEqual(adaptiveCap(data, TODAY, 30));
  });

  it('leaves locked days untouched', () => {
    const data: AppData = { ...freshData(), lockedDates: [TODAY] };
    const mixed = day(TODAY, [task('b', chapterB.id, 0, 120), task('c', chapterC.id, 120, 240)]);
    const result = applyAdaptivePlan([mixed], [row(chapterA.id)], data, TODAY, { horizonDays: 1 });
    expect(result.plan).toEqual([mixed]);
    expect(result.skippedLocked).toBe(1);
  });

  it('does nothing when the weakness score is below the threshold', () => {
    const light = day(TODAY, [task('b', chapterB.id, 0, 120)]);
    const result = applyAdaptivePlan([light], [row(chapterA.id, 4)], freshData(), TODAY, { horizonDays: 1 });
    expect(result.plan).toEqual([light]);
    expect(result.swaps).toHaveLength(0);
  });

  it('never schedules two blocks for the same chapter on the same day', () => {
    const mixed = day(TODAY, [task('b', chapterB.id, 0, 120), task('c', chapterC.id, 120, 240)]);
    const result = applyAdaptivePlan([mixed], [row(chapterA.id), row(chapterA.id)], freshData(), TODAY, { horizonDays: 1 });
    expect(adaptiveTasksFor(result.plan, TODAY)).toHaveLength(1);
  });

  it('gives every weak chapter a block without ever pushing a day past the cap', () => {
    const data = freshData();
    const days = [0, 1, 2].map(offset => {
      const date = `2026-03-${String(10 + offset).padStart(2, '0')}`;
      return day(date, [task(`b-${offset}`, chapterB.id, 0, 240), task(`c-${offset}`, chapterC.id, 240, 480)]);
    });
    const result = applyAdaptivePlan(days, [row(chapterA.id, 9), row(chapterA2.id, 8)], data, TODAY, { horizonDays: 3 });
    const placed = result.swaps.map(swap => swap.chapterId);
    expect(placed).toContain(chapterA.id);
    expect(placed).toContain(chapterA2.id);
    for (const entry of result.plan) {
      expect(plannedMinutes(entry)).toBeLessThanOrEqual(HARD_DAILY_CAP_MINUTES);
    }
    // Adaptive blocks and reported swaps always agree, so the card can never over-report.
    for (const entry of result.plan) {
      expect(adaptiveTasksFor(result.plan, entry.date)).toHaveLength(
        result.swaps.filter(swap => swap.date === entry.date).length,
      );
    }
  });
});

describe('reporting', () => {
  it('counts how many of the next seven days are already full', () => {
    expect(crowdedDays(plan, freshData(), TODAY)).toBe(7);
    const empty = plan.map(entry => ({ ...entry, tasks: [] }));
    expect(crowdedDays(empty, freshData(), TODAY)).toBe(0);
  });

  it('measures the days to the exam from the settings', () => {
    const data: AppData = { ...freshData(), settings: { ...freshData().settings, examDate: '2026-06-01' } };
    expect(daysToExam(data, TODAY)).toBe(83);
    expect(daysToExam({ ...data, settings: { ...data.settings, examDate: '2026-01-01' } }, TODAY)).toBe(0);
  });
});
