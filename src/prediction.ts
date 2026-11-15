import { addDays, diffDays, percent } from './planner';
import type { AppData, Day } from './planner';

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
      if (data.completed[task.id]) done++;
    }
  }
  return { done, total, percent: percent(done, total) };
}

/** Whole-plan task completion. */
export function overallTaskProgress(plan: Day[], data: AppData): TaskProgress {
  return tasksDueBy(plan, data, plan[plan.length - 1]?.date || '9999-12-31');
}

/**
 * Tasks completed per day over the last `window` days, based on completion timestamps.
 * Zero when the student has not finished anything recently (callers must handle that).
 */
export function recentTaskPace(plan: Day[], data: AppData, today: string, window = 14): number {
  if (window <= 0) return 0;
  const from = addDays(today, -(window - 1));
  const taskIds = new Set(plan.flatMap(day => day.tasks.map(task => task.id)));
  let done = 0;
  for (const [id, at] of Object.entries(data.completed)) {
    if (!taskIds.has(id)) continue;
    const day = at.slice(0, 10);
    if (day >= from && day <= today) done++;
  }
  return done / window;
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
      for (const key of ['A', 'B', 'C'] as const) {
        if (task.chapterIds.some(id => chapterIdsByPriority[key].has(id))) out[key] = day.date;
      }
    }
  }
  return out;
}
