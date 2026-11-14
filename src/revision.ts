import { CHAPTERS, chapterById } from './data';
import type { AppData, Day } from './planner';
import { addDays, chapterTasks, todayKey } from './planner';
import type { RevisionInterval, RevisionItem } from './types';
import { newId, nowIso } from './storage';

export const REVISION_INTERVALS: RevisionInterval[] = [1, 3, 7, 14, 30];
export const INTERVAL_LABEL: Record<RevisionInterval, string> = { 1: '১ দিন', 3: '৩ দিন', 7: '৭ দিন', 14: '১৪ দিন', 30: '৩০ দিন' };

/** All parts of a chapter must be ticked; the latest tick date becomes the cycle anchor. */
export function chapterCompletionDate(plan: Day[], chapterId: string, completed: Record<string, string>): string | null {
  const tasks = chapterTasks(plan, chapterId);
  if (!tasks.length || !tasks.every(task => !!completed[task.id])) return null;
  const latest = tasks.map(task => completed[task.id]).sort().at(-1);
  return latest ? todayKey(new Date(latest)) : null;
}

/**
 * Idempotent scheduler: every completed chapter gets a 1/x3/7/14/30-day revision card.
 * If a chapter is un-ticked, only its still-pending cards are withdrawn; history stays.
 */
export function ensureRevisions(plan: Day[], data: AppData): AppData {
  if (!data.settings.revisionEnabled) return data;
  const byChapter = new Map<string, RevisionItem[]>();
  for (const item of data.revisions) {
    const list = byChapter.get(item.chapterId) || [];
    list.push(item);
    byChapter.set(item.chapterId, list);
  }
  let items = data.revisions.slice();
  let changed = false;
  const stamp = nowIso();
  for (const chapter of CHAPTERS) {
    const completedOn = chapterCompletionDate(plan, chapter.id, data.completed);
    const existing = byChapter.get(chapter.id) || [];
    if (!completedOn) {
      const pending = existing.filter(item => !item.completedAt);
      if (pending.length) {
        const pendingIds = new Set(pending.map(item => item.id));
        items = items.filter(item => !pendingIds.has(item.id));
        changed = true;
      }
      continue;
    }
    for (const interval of REVISION_INTERVALS) {
      const dueDate = addDays(completedOn, interval);
      const found = items.find(item => item.chapterId === chapter.id && item.interval === interval);
      if (!found) {
        items.push({ id: newId(), chapterId: chapter.id, subject: chapter.subject, dueDate, interval, createdAt: stamp });
        changed = true;
      } else if (!found.completedAt && found.dueDate !== dueDate) {
        items = items.map(item => item.id === found.id ? { ...item, dueDate } : item);
        changed = true;
      }
    }
  }
  // Drop cards for chapters that no longer exist in the checked-in syllabus.
  if (items.some(item => !chapterById[item.chapterId])) {
    items = items.filter(item => !!chapterById[item.chapterId]);
    changed = true;
  }
  return changed ? { ...data, revisions: items } : data;
}

export interface RevisionBuckets {
  overdue: RevisionItem[];
  today: RevisionItem[];
  upcoming: RevisionItem[];
  completed: RevisionItem[];
}
export function revisionBuckets(revisions: RevisionItem[], today: string): RevisionBuckets {
  const pending = revisions.filter(item => !item.completedAt);
  const upcomingLimit = addDays(today, 7);
  return {
    overdue: pending.filter(item => item.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    today: pending.filter(item => item.dueDate === today),
    upcoming: pending.filter(item => item.dueDate > today && item.dueDate <= upcomingLimit).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    completed: revisions.filter(item => !!item.completedAt).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')),
  };
}

export function completeRevision(data: AppData, id: string, at = nowIso()): AppData {
  return { ...data, revisions: data.revisions.map(item => item.id === id ? { ...item, completedAt: at } : item) };
}
export function reopenRevision(data: AppData, id: string): AppData {
  return { ...data, revisions: data.revisions.map(item => item.id === id ? { ...item, completedAt: undefined } : item) };
}
export function snoozeRevision(data: AppData, id: string, today: string, days = 1): AppData {
  return { ...data, revisions: data.revisions.map(item => item.id === id && !item.completedAt ? { ...item, dueDate: addDays(item.dueDate < today ? today : item.dueDate, days) } : item) };
}
export function revisionDueCount(data: AppData, today: string): number {
  return data.revisions.filter(item => !item.completedAt && item.dueDate <= today).length;
}
