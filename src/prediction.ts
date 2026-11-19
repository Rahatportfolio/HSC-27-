import { hasFullPersonalAllocation, isPersonalTaskComplete } from './personalRoutine';
import { addDays, diffDays, percent, todayKey } from './planner';
import type { AppData, Day, Task } from './planner';
import { isInitialStudyTask } from './planHealth';
import { parseTaskRangeId } from './taskReferences';

/**
 * Honest progress forecasting from the student's own completed tasks.
 * Everything is derived from local data — no guaranteed predictions, only
 * "at your current pace" estimates that are clearly labelled in the UI.
 */

export interface TaskProgress { done: number; total: number; percent: number }

/** Completed vs scheduled tasks up to and including `date` (effective plan). */
export function tasksDueBy(plan: Day[], data: AppData, date: string): TaskProgress {
  let total = 0;
  let done = 0;
  for (const day of plan) {
    if (day.date > date) break;
    for (const task of day.tasks) {
      if (data.removedTasks.includes(task.id)) continue;
      total++;
      if (isPersonalTaskComplete(task, data.completed)) done++;
    }
  }
  return { done, total, percent: percent(done, total) };
}

/** Whole-plan task completion. */
export function overallTaskProgress(plan: Day[], data: AppData): TaskProgress {
  return tasksDueBy(plan, data, plan[plan.length - 1]?.date || '9999-12-31');
}

/**
 * Effective tasks first fully covered during the last `window` Bangladesh days.
 * Stable personal source/range evidence survives repartitioning: a regenerated
 * visible id needs no duplicate tick, partial work is not a finished task, and
 * a redundant newer tick cannot re-count work already covered before the window.
 */
export function tasksFirstCompletedBetween(plan: Day[], data: AppData, from: string, to: string): Task[] {
  if (from > to) return [];
  const evidence = new Map<string, { throughToday: Record<string, string>; beforeWindow: Record<string, string> }>();
  for (const [id, at] of Object.entries(data.completed)) {
    if (!Number.isFinite(Date.parse(at))) continue;
    const day = todayKey(new Date(at));
    if (day > to) continue;
    const source = parseTaskRangeId(id)?.sourceId || id;
    let group = evidence.get(source);
    if (!group) { group = { throughToday: {}, beforeWindow: {} }; evidence.set(source, group); }
    group.throughToday[id] = at;
    if (day < from) group.beforeWindow[id] = at;
  }
  const removed = new Set(data.removedTasks), seen = new Set<string>();
  const done: Task[] = [];
  for (const task of plan.flatMap(day => day.tasks)) {
    if (removed.has(task.id) || seen.has(task.id)) continue;
    seen.add(task.id);
    const source = task.personalWork?.sourceId || parseTaskRangeId(task.id)?.sourceId || task.id;
    const group = evidence.get(source);
    if (group && isPersonalTaskComplete(task, group.throughToday) && !isPersonalTaskComplete(task, group.beforeWindow)) done.push(task);
  }
  return done;
}
export function recentTaskPace(plan: Day[], data: AppData, today: string, window = 14): number {
  if (!Number.isInteger(window) || window <= 0) return 0;
  return tasksFirstCompletedBetween(plan, data, addDays(today, -(window - 1)), today).length / window;
}

/** Where the student should be by `targetDate` if today's pace holds. Clamped to 0–100. */
export function expectedPercentBy(plan: Day[], data: AppData, today: string, targetDate: string): number {
  const overall = overallTaskProgress(plan, data);
  if (!overall.total) return 0;
  const days = Math.max(0, diffDays(today, targetDate));
  const pace = recentTaskPace(plan, data, today);
  return Math.max(0, Math.min(100, percent(overall.done + pace * days, overall.total)));
}

/** Extrapolated finish date at the current pace; undefined without recent activity. */
export function estimatedFinishDate(plan: Day[], data: AppData, today: string): string | undefined {
  if (data.personalRoutine?.chapterIds.some(id => !hasFullPersonalAllocation(data, plan, id))) return undefined;
  const overall = overallTaskProgress(plan, data);
  const remaining = overall.total - overall.done;
  if (remaining <= 0) return today;
  const pace = recentTaskPace(plan, data, today);
  if (pace <= 0.001) return undefined;
  const days = Math.ceil(remaining / pace);
  return addDays(today, Math.min(days, 1500));
}

export type ScheduleStatus = 'ahead' | 'ontrack' | 'behind';

/**
 * Compares work finished against work the plan had scheduled by today.
 * `ahead` = finished more than scheduled so far, `behind` = more than 10% of the
 * due work is still pending, `ontrack` = within that band.
 */
export function scheduleStatus(plan: Day[], data: AppData, today: string): {
  status: ScheduleStatus; dueDone: number; dueTotal: number; outstanding: number; gapPercent: number;
} {
  const due = tasksDueBy(plan, data, today);
  const overall = overallTaskProgress(plan, data);
  // Finished work may live on future dates (moved forward then done early).
  const outstanding = Math.max(0, due.total - overall.done);
  const gapPercent = due.total ? Math.round((outstanding / due.total) * 1000) / 10 : 0;
  const status: ScheduleStatus = outstanding === 0 ? 'ahead'
    : gapPercent <= 10 ? 'ontrack'
      : 'behind';
  return { status, dueDone: overall.done, dueTotal: due.total, outstanding, gapPercent };
}

/** Estimated dates when the last chapter of each priority category is scheduled (plan order). */
export function categoryScheduleDates(plan: Day[], chapterIdsByPriority: Record<'A' | 'B' | 'C', Set<string>>): Record<'A' | 'B' | 'C', string | undefined> {
  const out: Record<'A' | 'B' | 'C', string | undefined> = { A: undefined, B: undefined, C: undefined };
  for (const day of plan) {
    for (const task of day.tasks) {
      if (!isInitialStudyTask(task)) continue;
      for (const key of ['A', 'B', 'C'] as const) {
        if (task.chapterIds.some(id => chapterIdsByPriority[key].has(id))) out[key] = day.date;
      }
    }
  }
  return out;
}
