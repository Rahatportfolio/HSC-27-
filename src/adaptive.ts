import type { AppData, Day, Task } from './planner';
import { addDays, dailyTargetMinutes, diffDays } from './planner';
import { chapterById } from './data';
import type { WeaknessRow } from './weakness';

/**
 * The adaptive planner. When the weakness report says a chapter is leaking marks, the
 * coming days are reshuffled so that chapter gets time — while the hard cap holds.
 *
 * The honest problem: the generated routine already fills the daily target (8 hours by
 * default), so "add more" would break the cap. So adaptation **reallocates** instead:
 *
 *  - A weak chapter takes the slot of the least valuable block on a coming day —
 *    a C-priority task first, then B, never an A-priority task and never a test day.
 *  - Total minutes stay exactly the same, so the cap cannot be crossed by construction.
 *  - Completed work, locked days and past days are never touched.
 *  - If a day has genuine spare room (a lower custom target), the weak block fills it
 *    instead, still under the cap.
 */

/** The maximum a day may ever be planned to, whatever the settings say. */
export const HARD_DAILY_CAP_MINUTES = 8 * 60;

export interface AdaptiveOptions {
  /** how far ahead to reorganise (1–14 days). */
  horizonDays?: number;
  /** the smallest block worth scheduling. */
  minBlockMinutes?: number;
  /** extra minutes allowed above the base target, still under the 8-hour ceiling. */
  bufferMinutes?: number;
}

export interface AdaptiveSwap {
  date: string;
  /** the task that lost its slot. */
  replacedTaskId: string;
  replacedTitle: string;
  replacedChapterIds: string[];
  /** the new weak block. */
  taskId: string;
  title: string;
  chapterId: string;
  minutes: number;
  /** true when the weak block took free room instead of replacing something. */
  filledGap: boolean;
}

/** A block that gave up its slot and must be placed on a later day with room. */
export interface DeferredWork { from: string; task: Task }

export interface AdaptivePlanResult {
  /** the plan with weak blocks in place; identical to the input when nothing changed. */
  plan: Day[];
  swaps: AdaptiveSwap[];
  /** weak chapters the horizon had no room for, reported instead of forced. */
  unfitted: string[];
  skippedLocked: number;
  /** the cap actually applied for today. */
  capMinutes: number;
  /** the day loads after the change, for the confirmation dialog. */
  loads: { date: string; before: number; after: number }[];
  /** work that moved from a full day to a lighter one; nothing is lost. */
  moved: DeferredWork[];
  /** Replacements rolled back because displaced work found no room. Originals stay in the plan. */
  dropped: DeferredWork[];
}

export const adaptiveTaskId = (date: string, chapterId: string): string => `adaptive|${date}|${chapterId}`;

/** The ceiling for a date: the base target plus a small buffer, never above eight hours. */
export function adaptiveCap(data: AppData, date: string, bufferMinutes = 0): number {
  const buffer = Math.max(0, Math.min(120, Math.round(bufferMinutes)));
  return Math.min(HARD_DAILY_CAP_MINUTES, dailyTargetMinutes(data, date) + buffer);
}

/** Does this chapter already own a block on the day? Adaptive blocks and routine blocks both count. */
const dayCovers = (tasks: Task[], chapterId: string): boolean => tasks.some(task => task.chapterIds.includes(chapterId));

export function plannedMinutes(day: Day | undefined): number {
  return (day?.tasks ?? []).reduce((sum, task) => sum + Math.max(0, task.endMinute - task.startMinute), 0);
}

/** How much room a day still has under the cap (never negative). */
export function roomOnDay(day: Day | undefined, capMinutes: number): number {
  return Math.max(0, capMinutes - plannedMinutes(day));
}

/** Days left until the HSC exam, so urgency can be reported honestly. */
export function daysToExam(data: AppData, today: string): number {
  return Math.max(0, diffDays(today, data.settings.examDate));
}

/** The priority of the chapter a task carries, for deciding what may be displaced. */
function taskPriority(task: Task): 'A' | 'B' | 'C' | null {
  const first = task.chapterIds[0];
  const priority = first ? chapterById[first]?.priority : undefined;
  return priority ?? null;
}

/**
 * Which task may give up its slot. The rule that protects the goal: a weak chapter may
 * only displace work that the plan itself already defers — B or C priority (or an
 * untracked block) — never another A-priority chapter, and never an exam, video or
 * completed block. A day made only of A-priority work is left alone.
 */
export function displaceableTask(day: Day, data: AppData): Task | null {
  const candidates = day.tasks.filter(task =>
    !data.completed[task.id]
    && !task.video
    && task.kind !== 'exam'
    && !task.id.startsWith('adaptive|')
    && taskPriority(task) !== 'A');
  if (!candidates.length) return null;
  const rank = (task: Task) => (taskPriority(task) === 'C' ? 0 : 1);
  candidates.sort((a, b) => rank(a) - rank(b) || (a.endMinute - a.startMinute) - (b.endMinute - b.startMinute));
  return candidates[0] ?? null;
}

function slotFor(day: Day, minutes: number, startFrom?: number): { start: number; end: number } {
  const start = startFrom ?? (day.tasks.reduce((end, task) => Math.max(end, task.endMinute), 0) || 8 * 60);
  return { start, end: start + minutes };
}

function makeTask(row: WeaknessRow, day: Day, minutes: number, start: number): Task {
  return {
    id: adaptiveTaskId(day.date, row.chapterId),
    date: day.date,
    dayIndex: day.index,
    phase: day.phase,
    subject: row.subject,
    kind: 'practice',
    title: row.chapter.title,
    detail: row.signals.map(signal => signal.label).join(' · '),
    chapterIds: [row.chapterId],
    startMinute: start,
    endMinute: start + minutes,
  };
}

/** Rebalances one day: fills spare room first, then reallocates one low-value block per weak chapter. */
function balanceDay(day: Day, rows: WeaknessRow[], cap: number, minBlock: number, data: AppData): { day: Day; swaps: AdaptiveSwap[]; unfitted: string[]; deferred: DeferredWork[] } {
  const covered = new Set(day.tasks.flatMap(task => task.chapterIds));
  const swaps: AdaptiveSwap[] = [];
  const unfitted: string[] = [];
  const deferred: DeferredWork[] = [];
  let tasks = [...day.tasks];
  let room = roomOnDay(day, cap);
  for (const row of rows) {
    if (covered.has(row.chapterId)) continue;
    if (dayCovers(day.tasks, row.chapterId)) { covered.add(row.chapterId); continue; }
    const slotStart = slotFor({ ...day, tasks }, 0).start;
    const available = Math.min(room, diffDays(day.date, data.settings.examDate) * 1440 - slotStart);
    if (available >= minBlock) {
      const minutes = Math.min(available, Math.max(minBlock, 45));
      const slot = slotFor({ ...day, tasks }, minutes);
      tasks = [...tasks, makeTask(row, day, minutes, slot.start)];
      swaps.push({
        date: day.date, replacedTaskId: '', replacedTitle: '', replacedChapterIds: [],
        taskId: adaptiveTaskId(day.date, row.chapterId), title: row.chapter.title, chapterId: row.chapterId,
        minutes, filledGap: true,
      });
      room -= minutes;
      covered.add(row.chapterId);
      continue;
    }
    const victim = displaceableTask({ ...day, tasks: tasks.filter(task => task.endMinute - task.startMinute >= minBlock) }, data);
    if (!victim) { unfitted.push(row.chapterId); continue; }
    const minutes = victim.endMinute - victim.startMinute;
    tasks = tasks.filter(task => task.id !== victim.id);
    tasks = [...tasks, makeTask(row, day, minutes, victim.startMinute)];
    deferred.push({ from: day.date, task: victim });
    swaps.push({
      date: day.date, replacedTaskId: victim.id, replacedTitle: victim.title, replacedChapterIds: victim.chapterIds,
      taskId: adaptiveTaskId(day.date, row.chapterId), title: row.chapter.title, chapterId: row.chapterId,
      minutes, filledGap: false,
    });
    covered.add(row.chapterId);
  }
  return { day: { ...day, tasks: tasks.sort((a, b) => a.startMinute - b.startMinute) }, swaps, unfitted, deferred };
}

/**
 * Reorganises the coming days towards the weakest chapters.
 * Pure: returns a new plan and never writes to storage.
 */
export function applyAdaptivePlan(
  plan: Day[],
  weaknessRows: WeaknessRow[],
  data: AppData,
  today: string,
  options: AdaptiveOptions = {},
): AdaptivePlanResult {
  const horizon = Math.max(1, Math.min(14, Math.round(options.horizonDays ?? 3)));
  const capMinutes = adaptiveCap(data, today, options.bufferMinutes ?? 0);
  const minBlock = Math.max(15, Math.min(60, Math.round(options.minBlockMinutes ?? 45)));
  const locked = new Set(data.lockedDates);
  const targets = weaknessRows
    .filter(row => row.score >= 5)
    .filter(row => !data.removedTasks.includes(adaptiveTaskId(today, row.chapterId)))
    .slice(0, horizon * 2);

  const swaps: AdaptiveSwap[] = [];
  const unfitted: string[] = [];
  const loads: AdaptivePlanResult['loads'] = [];
  let skippedLocked = 0;
  let next = plan;
  const deferredQueue: DeferredWork[] = [];

  for (let offset = 0; offset < horizon; offset++) {
    const date = addDays(today, offset);
    const current = next.find(entry => entry.date === date);
    if (!current || date >= data.settings.examDate) continue;
    if (locked.has(date)) { skippedLocked++; continue; }
    const before = plannedMinutes(current);
    // A manually boosted day is not permission to add even more. Full exam days
    // and any existing overruns also remain intact for the student to review.
    if (before > adaptiveCap(data, date, options.bufferMinutes ?? 0) || current.tasks.some(task =>
      task.kind === 'exam' || task.endMinute > diffDays(date, data.settings.examDate) * 1440)) continue;
    const balanced = balanceDay(current, targets.filter(row =>
      !swaps.some(swap => swap.chapterId === row.chapterId) && !dayCovers(current.tasks, row.chapterId)), adaptiveCap(data, date, options.bufferMinutes ?? 0), minBlock, data);
    unfitted.push(...balanced.unfitted);
    if (!balanced.swaps.length) continue;
    next = next.map(entry => entry.date === date ? balanced.day : entry);
    swaps.push(...balanced.swaps);
    deferredQueue.push(...balanced.deferred);
    loads.push({ date, before, after: plannedMinutes(balanced.day) });
  }

  // Place every displaced block on a later day that still has room, so no study is lost.
  const moved: DeferredWork[] = [];
  const dropped: DeferredWork[] = [];
  for (const item of deferredQueue) {
    let placed = false;
    for (let offset = 1; offset <= horizon && !placed; offset++) {
      const date = addDays(today, offset);
      const target = next.find(entry => entry.date === date);
      if (!target || date <= item.from || locked.has(date) || target.tasks.some(task => task.kind === 'exam')) continue;
      const minutes = item.task.endMinute - item.task.startMinute;
      if (roomOnDay(target, adaptiveCap(data, date, options.bufferMinutes ?? 0)) < minutes) continue;
      const slot = slotFor(target, minutes);
      const sourceId = item.task.originalTaskId || item.task.id;
      const initial = sourceId.includes(':part-') || sourceId.startsWith('chap-practice-');
      const deadline = initial ? data.settings.testExamDate : data.settings.examDate;
      if (slot.end > diffDays(date, deadline) * 1440) continue;
      // A move is still the same task: do not detach its completion evidence by inventing a new id.
      const task: Task = { ...item.task, date, dayIndex: target.index, phase: target.phase, startMinute: slot.start, endMinute: slot.end };
      next = next.map(entry => entry.date === date ? { ...target, tasks: [...target.tasks, task] } : entry);
      moved.push(item);
      placed = true;
    }
    if (!placed) dropped.push(item);
  }

  // A failed relocation is not permission to lose a learning/revision block.
  // Roll back just that replacement; successful, fully accounted-for moves remain.
  for (const item of dropped) {
    const index = swaps.findIndex(swap => swap.date === item.from && swap.replacedTaskId === item.task.id);
    if (index < 0) continue;
    const swap = swaps[index];
    next = next.map(day => day.date === item.from
      ? { ...day, tasks: day.tasks.map(task => task.id === swap.taskId ? item.task : task).sort((a, b) => a.startMinute - b.startMinute) } : day);
    swaps.splice(index, 1);
    unfitted.push(swap.chapterId);
  }
  const actualLoads = loads.filter(load => swaps.some(swap => swap.date === load.date))
    .map(load => ({ ...load, after: plannedMinutes(next.find(day => day.date === load.date)) }));
  return { plan: next, swaps, unfitted, skippedLocked, capMinutes, loads: actualLoads, moved, dropped };
}

/** The adaptive blocks already on a date. */
export function adaptiveTasksFor(plan: Day[], date: string): Task[] {
  return (plan.find(day => day.date === date)?.tasks ?? []).filter(task => task.id.startsWith('adaptive|'));
}

/** How many of the next seven days have no room left for a new block. */
export function crowdedDays(plan: Day[], data: AppData, today: string, bufferMinutes = 0): number {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index))
    .filter(date => roomOnDay(plan.find(day => day.date === date), adaptiveCap(data, date, bufferMinutes)) < 30).length;
}
