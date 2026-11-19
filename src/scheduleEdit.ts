import { isValidDate } from './planner';
import { reflowPersonalPlan } from './personalReflow';
import { isPersonalTaskComplete } from './personalRoutine';
import type { AppData, Day, Task } from './planner';
import type { TaskEdit } from './types';

/**
 * Manual schedule editing on top of the deterministic generated plan.
 *
 * Design rules (regeneration safety):
 *  - `data.completed` is keyed by stable task ids, so rebuilding the plan never loses progress.
 *  - Manual edits live in `taskEdits` / `removedTasks` / `dayOverrides` and are re-applied on
 *    every build, so a settings change ("regeneration") never silently deletes them.
 *  - Locked dates are excluded from every automatic move.
 */

/** Keep durations; resequence a day whose task set changed so nothing overlaps. */
function reflowDay(tasks: Task[]): Task[] {
  if (tasks.length < 2) return tasks;
  const sorted = [...tasks].sort((a, b) => a.startMinute - b.startMinute);
  const out: Task[] = [];
  let cursor = sorted[0].startMinute;
  for (let i = 0; i < sorted.length; i++) {
    const task = sorted[i];
    const duration = Math.max(15, task.endMinute - task.startMinute);
    const start = i === 0 ? task.startMinute : cursor + 10;
    out.push({ ...task, startMinute: start, endMinute: start + duration });
    cursor = start + duration;
  }
  return out;
}

/**
 * Applies removals, date moves and subject/title/chapter edits to a freshly built plan.
 * Returns the same array untouched when there is nothing to edit (cheap common path).
 */
export function applyManualSchedule(plan: Day[], data: AppData): Day[] {
  if (data.personalRoutine) {
    // Explicit edits stay explicit. Reflowing a changed day would stretch a source
    // fragment, consume somebody else's window or move an appointment silently.
    const byDate = new Map(plan.map(day => [day.date, day]));
    const groups = new Map(plan.map(day => [day.date, [] as Task[]]));
    for (const day of plan) for (const task of day.tasks) {
      if (data.removedTasks.includes(task.id)) continue;
      const edit = data.taskEdits[task.id];
      const date = edit?.date && byDate.has(edit.date) ? edit.date : day.date;
      const target = byDate.get(date)!;
      const override = data.dayOverrides[date];
      const startMinute = override?.taskStartMinutes?.[task.id] ?? task.startMinute;
      const duration = task.personalWork ? task.endMinute - task.startMinute
        : override?.taskMinutes?.[task.id] ?? task.endMinute - task.startMinute;
      groups.get(date)!.push({ ...task, date, dayIndex: target.index, phase: target.phase,
        ...(edit?.title ? { title: edit.title } : {}),
        ...(!task.personalWork && edit?.subject ? { subject: edit.subject } : {}),
        ...(!task.personalWork && edit?.chapterIds ? { chapterIds: edit.chapterIds } : {}),
        startMinute, endMinute: startMinute + duration });
    }
    return plan.map(day => ({ ...day, tasks: groups.get(day.date)!.sort((a, b) => a.startMinute - b.startMinute) }));
  }
  const removed = new Set(data.removedTasks);
  const edits = data.taskEdits;
  if (!removed.size && !Object.keys(edits).length) return plan;
  const byDate = new Map(plan.map(day => [day.date, day]));
  const groups = new Map<string, Task[]>();
  for (const day of plan) groups.set(day.date, []);
  for (const day of plan) {
    for (const task of day.tasks) {
      if (removed.has(task.id)) continue;
      const edit = edits[task.id];
      // A move to a date outside the plan keeps the task on its original date (safe fallback).
      const targetDate = edit?.date && byDate.has(edit.date) ? edit.date : day.date;
      let moved = task;
      if (edit) {
        moved = {
          ...moved,
          ...(edit.subject ? { subject: edit.subject } : {}),
          ...(edit.title ? { title: edit.title } : {}),
          ...(edit.chapterIds ? { chapterIds: edit.chapterIds } : {}),
        };
      }
      if (targetDate !== day.date) {
        const target = byDate.get(targetDate)!;
        moved = { ...moved, date: targetDate, phase: target.phase, dayIndex: target.index };
      }
      groups.get(targetDate)!.push(moved);
    }
  }
  return plan.map(day => {
    const tasks = groups.get(day.date)!;
    const signature = (list: Task[]) => list.map(task => task.id).join('\u0001');
    // Days whose task set changed (move in/out or deletion) are resequenced so nothing overlaps;
    // untouched days — including title/subject-only edits — keep their exact times.
    if (signature(tasks) === signature(day.tasks)) return { ...day, tasks };
    return { ...day, tasks: reflowDay(tasks) };
  });
}

/** Migrates a task's duration/start overrides along with the task when it changes date. */
function migrateOverride(map: AppData['dayOverrides'], fromDate: string, toDate: string, taskId: string): AppData['dayOverrides'] {
  const source = map[fromDate];
  if (!source) return map;
  const minutes = source.taskMinutes?.[taskId];
  const startMinutes = source.taskStartMinutes?.[taskId];
  if (minutes === undefined && startMinutes === undefined) return map;
  const next = { ...map };
  const cleanedSource: NonNullable<AppData['dayOverrides'][string]> = { ...source };
  if (source.taskMinutes) {
    const copy = { ...source.taskMinutes };
    delete copy[taskId];
    cleanedSource.taskMinutes = copy;
  }
  if (source.taskStartMinutes) {
    const copy = { ...source.taskStartMinutes };
    delete copy[taskId];
    cleanedSource.taskStartMinutes = copy;
  }
  next[fromDate] = cleanedSource;
  const target = { ...(next[toDate] || {}) };
  if (minutes !== undefined) target.taskMinutes = { ...(target.taskMinutes || {}), [taskId]: minutes };
  if (startMinutes !== undefined) target.taskStartMinutes = { ...(target.taskStartMinutes || {}), [taskId]: startMinutes };
  next[toDate] = target;
  return next;
}

/** Move one task to another date, carrying its custom duration/start time along. */
export function moveTask(data: AppData, taskId: string, fromDate: string, toDate: string): AppData {
  if (!isValidDate(toDate) || toDate === fromDate) return data;
  const current = data.taskEdits[taskId] || {};
  const taskEdits: Record<string, TaskEdit> = { ...data.taskEdits, [taskId]: { ...current, date: toDate } };
  return { ...data, taskEdits, dayOverrides: migrateOverride(data.dayOverrides, fromDate, toDate, taskId) };
}

/** Patch a task's subject / title / chapter list (or clear a previous date move with `date: undefined`). */
export function editTask(data: AppData, taskId: string, patch: Partial<TaskEdit>): AppData {
  const current: TaskEdit = { ...(data.taskEdits[taskId] || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete (current as Record<string, unknown>)[key];
    else (current as Record<string, unknown>)[key] = value;
  }
  const taskEdits = { ...data.taskEdits };
  if (Object.keys(current).length === 0) delete taskEdits[taskId];
  else taskEdits[taskId] = current;
  return { ...data, taskEdits };
}

/** Delete a generated task from the schedule. Completed work is never erased. */
export function removeTask(data: AppData, taskId: string): AppData {
  if (data.removedTasks.includes(taskId)) return data;
  if (data.removedTasks.length >= 4000) return data;
  return { ...data, removedTasks: [...data.removedTasks, taskId] };
}

export function restoreTask(data: AppData, taskId: string): AppData {
  if (!data.removedTasks.includes(taskId)) return data;
  return { ...data, removedTasks: data.removedTasks.filter(id => id !== taskId) };
}

export const isDateLocked = (data: Pick<AppData, 'lockedDates'>, date: string): boolean => data.lockedDates.includes(date);

export function toggleLockDate(data: AppData, date: string): AppData {
  if (!isValidDate(date)) return data;
  const locked = data.lockedDates.includes(date);
  return { ...data, lockedDates: locked ? data.lockedDates.filter(item => item !== date) : [...data.lockedDates, date].sort() };
}

export interface RescheduleResult {
  data: AppData;
  /** Unfinished tasks moved forward to a free slot. */
  moved: number;
  /** Tasks left in place because their current date is locked. */
  skippedLocked: number;
  /** Tasks left in place because no future day had spare capacity. */
  skippedBudget: number;
}

/**
 * "Regenerate / rebalance": moves unfinished tasks from days before `today` forward to the
 * first day that still has spare capacity. Never touches completed tasks, never writes to a
 * locked date, and never schedules more than `maxExtraMinutesPerDay` extra work per day.
 * The returned edits persist, so a later settings regeneration keeps them.
 */
export function rescheduleUnfinished(
  plan: Day[],
  data: AppData,
  today: string,
  options: { maxExtraMinutesPerDay?: number } = {},
): RescheduleResult {
  if (data.personalRoutine) {
    // Personal plans roll forward as a pure source-range projection. Regenerating
    // replaces future work, never applies the legacy +45-minute daily bonus.
    const effective = reflowPersonalPlan(data, plan, today);
    const pending = effective.flatMap(day => day.tasks).filter(task => !isPersonalTaskComplete(task, data.completed));
    return { data, moved: pending.filter(task => task.date >= today && task.rescheduledFrom && task.rescheduledFrom < task.date).length,
      skippedLocked: pending.filter(task => task.date < today && data.lockedDates.includes(task.date)).length,
      skippedBudget: pending.filter(task => task.date < today && !data.lockedDates.includes(task.date)).length + Number(effective.some(day => (day.deferredMinutes || 0) > 0)) };
  }
  const maxExtra = options.maxExtraMinutesPerDay ?? 45;
  const locked = new Set(data.lockedDates);
  const added = new Map<string, number>();
  const taskEdits: Record<string, TaskEdit> = { ...data.taskEdits };
  let moved = 0;
  let skippedLocked = 0;
  let skippedBudget = 0;
  const candidates: Task[] = [];
  for (const day of plan) {
    if (day.date >= today) break;
    for (const task of day.tasks) {
      if (data.completed[task.id] || data.removedTasks.includes(task.id)) continue;
      if (taskEdits[task.id]?.date && taskEdits[task.id].date! >= today) continue; // already moved forward
      candidates.push(task);
    }
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
  for (const task of candidates) {
    if (locked.has(task.date)) { skippedLocked++; continue; }
    const duration = Math.max(15, task.endMinute - task.startMinute);
    // Generated days are already filled to the daily target, so carried-over work gets a small,
    // explicit per-day buffer (default 45 min) instead of silently inflating the whole schedule.
    const target = plan.find(day => {
      if (day.date < today || locked.has(day.date)) return false;
      return (added.get(day.date) || 0) + duration <= maxExtra;
    });
    if (!target) { skippedBudget++; continue; }
    added.set(target.date, (added.get(target.date) || 0) + duration);
    const current = taskEdits[task.id] || {};
    taskEdits[task.id] = { ...current, date: target.date };
    moved++;
  }
  return { data: { ...data, taskEdits }, moved, skippedLocked, skippedBudget };
}

/** Counts shown in the "regenerate safely" dialog. */
export function regenerationSummary(data: AppData): {
  completedPreserved: number; editedTasks: number; removedTasks: number; lockedDates: number; overrides: number;
} {
  return {
    completedPreserved: Object.keys(data.completed).length,
    editedTasks: Object.keys(data.taskEdits).length,
    removedTasks: data.removedTasks.length,
    lockedDates: data.lockedDates.length,
    overrides: Object.keys(data.dayOverrides).length,
  };
}

/** Dates covered by the plan, inclusive. */
export function planRange(plan: Day[]): { start: string; end: string } | null {
  if (!plan.length) return null;
  return { start: plan[0].date, end: plan[plan.length - 1].date };
}

/** First/last scheduled date of any task touching the given chapters. */
export function chapterDateSpan(plan: Day[], chapterIds: Set<string>): { first?: string; last?: string } {
  let first: string | undefined;
  let last: string | undefined;
  for (const day of plan) {
    for (const task of day.tasks) {
      if (!task.chapterIds.some(id => chapterIds.has(id))) continue;
      if (!first || day.date < first) first = day.date;
      if (!last || day.date > last) last = day.date;
    }
  }
  return { first, last };
}
