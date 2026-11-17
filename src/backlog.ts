import { CHAPTERS, chapterById } from './data';
import type { SubjectId } from './data';
import { addDays, taskStart } from './planner';
import type { AppData, Day } from './planner';
import type { Carryover } from './types';
import { addCarryover } from './study';
import { adaptiveCap, displaceableTask, plannedMinutes } from './adaptive';

/**
 * Backlog manager — what happens to the study you did not do.
 *
 * The old behaviour was "pick the five newest missed sessions and dump them on today",
 * which quietly breaks the 8-hour ceiling and piles three weeks of backlog onto one day.
 * This module treats backlog as *work to be scheduled*, not a list to dump:
 *
 *  - the backlog is grouped so 40 missed minutes become one 40-minute block, never four
 *    10-minute fragments;
 *  - each upcoming day is filled only up to `adaptiveCap` (min of target+buffer and 8h);
 *  - a `minBlockMinutes` floor is respected, so a 20-minute gap never swallows a 90-minute
 *    block and hides it from the count;
 *  - whatever cannot be placed is reported (`unplaced`) instead of being silently dropped.
 */

export const BACKLOG_HORIZON_DEFAULT = 7;
export const BACKLOG_MIN_BLOCK_DEFAULT = 30;

export type BacklogReason = 'missed' | 'unfinished' | 'carried';

export interface BacklogItem {
  /** Stable key: the original task id (one item per task, however it was missed). */
  taskId: string;
  title: string;
  subject: SubjectId;
  chapterIds: string[];
  /** Minutes of work still owed. */
  minutes: number;
  /** The day it was originally planned for. */
  fromDate: string;
  /** Whole days late (0 = today). */
  daysLate: number;
  reason: BacklogReason;
  /** True when a carryover entry already exists for it. */
  alreadyCarried: boolean;
  carryoverIds: string[];
}

export interface BacklogBucket {
  key: string;
  title: { bn: string; en: string };
  items: BacklogItem[];
  minutes: number;
}

export interface BacklogDay {
  date: string;
  /** Minutes already planned on that day before the backlog. */
  before: number;
  /** The ceiling that may not be crossed. */
  cap: number;
  /** Minutes of backlog placed there. */
  added: number;
  /** How much room is still free after placing. */
  room: number;
  itemCount: number;
  /** True when the backlog was fitted by giving up a lower-priority block. */
  displaced: boolean;
  /** Title of the block that made room, when that happened. */
  displacedTitle?: string;
  /** Why this day took nothing — printed in the UI instead of a silent zero. */
  note?: string;
}

export interface BacklogMove {
  /** Key of the merged item this move belongs to. */
  itemKey: string;
  /** The original plan task that will gain a carryover row. */
  taskId: string;
  title: string;
  minutes: number;
  fromDate: string;
  toDate: string;
}

export interface BacklogPlan {
  items: BacklogItem[];
  totalMinutes: number;
  buckets: BacklogBucket[];
  days: BacklogDay[];
  moves: BacklogMove[];
  /** How many days had to give up a lower-priority block to fit the backlog. */
  displacedDays: number;
  /** One placement per merged item: where it goes and for whom (used when applying). */
  placements: { itemKey: string; taskIds: string[]; title: string; subject: SubjectId; minutes: number; toDate: string }[];
  /** Backlog that no day in the horizon could take, and no same-chapter block absorbs. */
  unplaced: MergedBacklogItem[];
  /**
   * Backlog the day is already covering: the same chapter is scheduled in the horizon,
   * so no new block is needed — the chapter gets its attention either way.
   */
  merged: { item: MergedBacklogItem; date: string }[];
  /** Minutes per day the ceiling allows — printed in the UI so the rule is visible. */
  cap: number;
  horizonDays: number;
}

const BUCKETS: { key: string; test: (daysLate: number) => boolean; bn: string; en: string }[] = [
  { key: 'today', test: daysLate => daysLate === 0, bn: 'আজকের বাকি', en: 'Left from today' },
  { key: 'yesterday', test: daysLate => daysLate === 1, bn: 'গতকাল', en: 'Yesterday' },
  { key: 'week', test: daysLate => daysLate >= 2 && daysLate <= 7, bn: 'এই সপ্তাহে', en: 'This week' },
  { key: 'older', test: daysLate => daysLate > 7, bn: 'আরও পুরোনো', en: 'Older' },
];

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * The backlog itself: missed plan work that is still unfinished, de-duplicated so one
 * task appears once even if it was missed on several days.
 */
export function backlogItems(plan: Day[], data: AppData, today: string): BacklogItem[] {
  const items = new Map<string, BacklogItem>();
  const carriedByTask = new Map<string, Carryover[]>();
  for (const carryover of data.carryovers) {
    if (data.completed[carryover.taskId]) continue;
    carriedByTask.set(carryover.taskId, [...(carriedByTask.get(carryover.taskId) ?? []), carryover]);
  }

  for (const day of plan) {
    for (const task of day.tasks) {
      if (data.completed[task.id] || data.removedTasks.includes(task.id)) continue;
      const start = taskStart(task);
      if (start.date >= today) continue;
      const chapterWork = task.chapterIds.length > 0;
      // Exams and video blocks are deliberately excluded: re-running a missed mock is a
      // scheduling decision for the exam screen, and a video is not a reading task.
      if (task.kind === 'exam' || task.video || !chapterWork) continue;
      const existing = items.get(task.id);
      if (existing) continue;
      const minutes = Math.max(10, Math.round(task.endMinute - task.startMinute));
      const carried = carriedByTask.get(task.id) ?? [];
      items.set(task.id, {
        taskId: task.id,
        title: task.title,
        subject: task.subject,
        chapterIds: task.chapterIds,
        minutes,
        fromDate: start.date,
        daysLate: dayDiff(start.date, today),
        reason: carried.length ? 'carried' : 'missed',
        alreadyCarried: carried.length > 0,
        carryoverIds: carried.map(entry => entry.id),
      });
    }
  }
  // Oldest first: the longest-ignored work is the most dangerous.
  return [...items.values()].sort((a, b) => b.daysLate - a.daysLate || a.title.localeCompare(b.title, 'bn'));
}

/** Grouping used by the UI: today's leftovers, yesterday, this week, older. */
export function backlogBuckets(items: BacklogItem[]): BacklogBucket[] {
  return BUCKETS.map(bucket => {
    const list = items.filter(item => bucket.test(item.daysLate));
    return {
      key: bucket.key,
      title: { bn: bucket.bn, en: bucket.en },
      items: list,
      minutes: list.reduce((sum, item) => sum + item.minutes, 0),
    };
  }).filter(bucket => bucket.items.length > 0);
}

/**
 * Merge fragments of the same chapter so a day receives "৪০ মিনিট ফিজিক্স" instead of four
 * 10-minute scraps. Grouping is by chapter when a task covers exactly one chapter.
 */
export interface MergedBacklogItem extends BacklogItem {
  /** Stable key of the merged block (chapter, or the task itself). */
  key: string;
  /** All original task ids behind this merged block. */
  sourceTaskIds: string[];
}

export function mergeFragments(items: BacklogItem[], minBlockMinutes = BACKLOG_MIN_BLOCK_DEFAULT): MergedBacklogItem[] {
  const grouped = new Map<string, MergedBacklogItem>();
  for (const item of items) {
    const key = item.chapterIds.length === 1 ? `c:${item.chapterIds[0]}` : `t:${item.taskId}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...item, key, carryoverIds: [...item.carryoverIds], sourceTaskIds: [item.taskId] });
      continue;
    }
    existing.minutes += item.minutes;
    existing.daysLate = Math.max(existing.daysLate, item.daysLate);
    existing.fromDate = existing.fromDate < item.fromDate ? existing.fromDate : item.fromDate;
    existing.carryoverIds.push(...item.carryoverIds);
    existing.sourceTaskIds.push(item.taskId);
    existing.alreadyCarried = existing.alreadyCarried || item.alreadyCarried;
    // A block shorter than the floor is not worth its own slot; it stays merged with the
    // chapter it belongs to rather than becoming a separate fragment.
    if (existing.minutes < minBlockMinutes) continue;
  }
  return [...grouped.entries()]
    .map(([, value]) => value)
    .sort((a, b) => b.daysLate - a.daysLate || b.minutes - a.minutes);
}

/**
 * Spread the backlog across the next days without ever breaking the daily ceiling.
 * A greedy fill is correct here because the order is fixed by urgency: the oldest,
 * most-overdue work is placed first on the earliest day that can hold it.
 */
export function planBacklog(
  plan: Day[],
  data: AppData,
  today: string,
  options: { horizonDays?: number; minBlockMinutes?: number; bufferMinutes?: number } = {},
): BacklogPlan {
  const horizonDays = Math.max(1, Math.min(30, Math.round(options.horizonDays ?? BACKLOG_HORIZON_DEFAULT)));
  const minBlock = Math.max(15, Math.min(90, Math.round(options.minBlockMinutes ?? BACKLOG_MIN_BLOCK_DEFAULT)));
  const buffer = options.bufferMinutes ?? data.settings.adaptiveBuffer ?? 30;
  const items = mergeFragments(backlogItems(plan, data, today), minBlock);
  const cap = adaptiveCap(data, today, buffer);

  const days: BacklogDay[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addDays(today, offset);
    const day = plan.find(entry => entry.date === date);
    const before = day ? plannedMinutes(day) : 0;
    const dayCap = adaptiveCap(data, date, buffer);
    const locked = data.lockedDates.includes(date);
    const room = locked ? 0 : Math.max(0, dayCap - before);
    // A day with no free room is not automatically written off: if it holds a
    // lower-priority block, that block can give up its slot for older backlog.
    const victim = !locked && room === 0 && day ? displaceableTask(day, data) : null;
    days.push({
      date, before, cap: dayCap, added: 0, room: room || (victim ? Math.max(0, victim.endMinute - victim.startMinute) : 0),
      itemCount: 0, displaced: false,
      ...(locked ? { note: 'locked' } : victim ? {} : room === 0 ? { note: 'full' } : {}),
    });
  }

  const moves: BacklogMove[] = [];
  const placements: BacklogPlan['placements'] = [];
  const unplaced: MergedBacklogItem[] = [];
  const merged: { item: MergedBacklogItem; date: string }[] = [];
  const chaptersByDate = new Map<string, Set<string>>();
  for (const day of plan) chaptersByDate.set(day.date, new Set(day.tasks.flatMap(task => task.chapterIds)));
  for (const item of items) {
    // A block needs room for its own minutes or the floor, whichever is larger — that is
    // what stops a long block slipping into a 20-minute gap and disappearing.
    const need = Math.max(item.minutes, minBlock);
    const target = days.find(day => day.room >= need);
    if (!target) {
      // No room anywhere. If the chapter is already scheduled inside the horizon, the
      // backlog is not lost work — it is the same chapter, so we say so instead of
      // stacking a duplicate block on an already-full day.
      const absorbing = days.find(day => item.chapterIds.some(id => chaptersByDate.get(day.date)?.has(id)));
      if (absorbing && item.chapterIds.length) { merged.push({ item, date: absorbing.date }); }
      else unplaced.push(item);
      continue;
    }
    if (!target.displaced && target.added === 0 && target.before >= target.cap) {
      const day = plan.find(entry => entry.date === target.date);
      const victim = day ? displaceableTask(day, data) : null;
      if (victim) { target.displaced = true; target.displacedTitle = victim.title; }
    }
    // One move per original task, so the UI can name exactly what moved.
    for (const taskId of item.sourceTaskIds) {
      moves.push({
        itemKey: item.key, taskId, title: item.title,
        minutes: Math.round(item.minutes / item.sourceTaskIds.length),
        fromDate: item.fromDate, toDate: target.date,
      });
    }
    placements.push({
      itemKey: item.key, taskIds: item.sourceTaskIds, title: item.title,
      subject: item.subject, minutes: item.minutes, toDate: target.date,
    });
    target.added += item.minutes;
    target.room = Math.max(0, target.room - item.minutes);
    target.itemCount += 1;
  }

  return {
    items,
    totalMinutes: items.reduce((sum, item) => sum + item.minutes, 0),
    buckets: backlogBuckets(items),
    days,
    moves,
    placements,
    merged,
    displacedDays: days.filter(day => day.displaced).length,
    unplaced,
    cap,
    horizonDays,
  };
}

/**
 * Apply a backlog plan to the stored data: create the carryover entries so the work shows
 * up on the target days. Nothing is deleted — an unplaced item simply stays in the backlog
 * and is reported.
 */
export function applyBacklogPlan(plan: BacklogPlan, data: AppData, sourcePlan: Day[]): { data: AppData; placed: number } {
  let next = data;
  let placed = 0;
  const taskById = new Map<string, { title: string; subject: SubjectId; chapterIds: string[]; minutes: number; date: string }>();
  for (const day of sourcePlan) {
    for (const task of day.tasks) {
      taskById.set(task.id, {
        title: task.title, subject: task.subject, chapterIds: task.chapterIds,
        minutes: Math.max(10, Math.round(task.endMinute - task.startMinute)), date: taskStart(task).date,
      });
    }
  }
  for (const placement of plan.placements) {
    const list = placement.taskIds.map(id => taskById.get(id)).filter((task): task is NonNullable<typeof task> => !!task);
    const share = Math.max(10, Math.round(placement.minutes / Math.max(1, list.length)));
    for (const task of list) {
      // Reuse the app's own carryover machinery, so completion state, dedupe and storage
      // validation behave exactly like a manual carryover.
      const before = next.carryovers.length;
      next = addCarryover(next, {
        id: placement.taskIds[list.indexOf(task)],
        title: task.title,
        subject: task.subject,
        startMinute: 0,
        endMinute: share,
        date: task.date,
      }, placement.toDate);
      if (next.carryovers.length > before) placed += 1;
    }
  }
  return { data: next, placed };
}

/**
 * Letting go is a real action, not a failure: a past task the student decides not to do is
 * recorded in the existing `removedTasks` list, so it stops counting as backlog and stops
 * appearing in the plan — without inventing a new stored collection.
 */
export function dropBacklog(data: AppData, taskIds: string[]): AppData {
  const already = new Set(data.removedTasks);
  const fresh = taskIds.filter(id => !already.has(id));
  if (!fresh.length) return data;
  return { ...data, removedTasks: [...data.removedTasks, ...fresh] };
}

/**
 * Every stored task id behind an item. Merged blocks stand for several original tasks, so
 * dropping or carrying one must handle all of them or the fragments come straight back.
 */
export function itemTaskIds(item: BacklogItem): string[] {
  const withSources = item as MergedBacklogItem;
  return withSources.sourceTaskIds?.length ? withSources.sourceTaskIds : [item.taskId];
}

/** Backlog the plan already covers by studying the same chapter — reported, never duplicated. */
export function mergedMinutes(plan: BacklogPlan): number {
  return plan.merged.reduce((sum, entry) => sum + entry.item.minutes, 0);
}

/** How much backlog is critical (A-priority chapter) — the number that should worry a student. */
export function criticalBacklog(items: BacklogItem[], data: AppData): BacklogItem[] {
  return items.filter(item => item.chapterIds.some(id => {
    const chapter = chapterById[id];
    if (!chapter) return false;
    return (data.chapterMeta[id]?.priority ?? chapter.priority) === 'A';
  }));
}

/** Subjects with the largest backlog, worst first. */
export function backlogBySubject(items: BacklogItem[]): { subject: SubjectId; minutes: number; count: number }[] {
  const map = new Map<SubjectId, { minutes: number; count: number }>();
  for (const item of items) {
    const entry = map.get(item.subject) ?? { minutes: 0, count: 0 };
    entry.minutes += item.minutes;
    entry.count += 1;
    map.set(item.subject, entry);
  }
  return [...map.entries()]
    .map(([subject, value]) => ({ subject, ...value }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Chapters that keep coming back — the same three chapters missed repeatedly. */
export function repeatedChapters(items: BacklogItem[]): { chapterId: string; count: number; minutes: number }[] {
  const map = new Map<string, { count: number; minutes: number }>();
  for (const item of items) {
    for (const chapterId of item.chapterIds) {
      const entry = map.get(chapterId) ?? { count: 0, minutes: 0 };
      entry.count += 1;
      entry.minutes += item.minutes;
      map.set(chapterId, entry);
    }
  }
  return [...map.entries()]
    .map(([chapterId, value]) => ({ chapterId, ...value }))
    .filter(entry => entry.count > 1)
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
    .slice(0, 5);
}

/** Chapters in the backlog that the syllabus also flags as priority A. */
export function backlogChapters(items: BacklogItem[]): string[] {
  return [...new Set(items.flatMap(item => item.chapterIds))].filter(id => !!CHAPTERS.find(chapter => chapter.id === id));
}
