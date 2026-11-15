import { CHAPTERS, chapterById } from './data';
import type { AppData, Day } from './planner';
import { addDays, chapterStudyTasks, todayKey } from './planner';
import type { RecallRating, RevisionInterval, RevisionItem } from './types';
import { LIMITS, newId, nowIso } from './storage';

export const REVISION_INTERVALS: RevisionInterval[] = [1, 3, 7, 14, 30];
export const INTERVAL_LABEL: Record<RevisionInterval, string> = { 1: '১ দিন', 3: '৩ দিন', 7: '৭ দিন', 14: '১৪ দিন', 30: '৩০ দিন' };

/** All parts of a chapter must be ticked; the latest tick date becomes the cycle anchor. */
export function chapterCompletionDate(plan: Day[], chapterId: string, completed: Record<string, string>): string | null {
  const tasks = chapterStudyTasks(plan, chapterId);
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
      if (!found && items.length < LIMITS.revisions) {
        items.push({ id: newId(), chapterId: chapter.id, subject: chapter.subject, dueDate, interval, createdAt: stamp });
        changed = true;
      } else if (found && !found.completedAt && !found.adjusted && found.dueDate !== dueDate) {
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

export const RECALL_LABEL: Record<RecallRating, string> = { weak: 'ভুলে গেছি', okay: 'মোটামুটি', good: 'মনে ছিল' };
/** How many days the next card waits after a rating. `good` keeps the fixed 1/3/7/14/30 ladder. */
export const RECALL_GAP: Record<RecallRating, number> = { weak: 1, okay: 3, good: 0 };
export const RECALL_HINT: Record<RecallRating, string> = {
  weak: 'আগামীকালই আবার একবার—এই অধ্যায়টা এখনই দরকার।',
  okay: 'তিন দিন পরে আরেকবার ঝালাই হবে।',
  good: 'পরের ধাপে নিজের সময়েই আসবে।',
};
export interface RecallOutcome { data: AppData; dueDate: string | null; created: boolean; limitReached?: boolean }
/**
 * Completing a card with a rating is what makes the schedule adaptive: a weak recall
 * pulls the next card to tomorrow, an okay one to three days, and a good one leaves the
 * fixed ladder untouched. Only the next pending card moves, never future history.
 */
export function completeRevisionWithRecall(data: AppData, id: string, rating: RecallRating, today: string, at = nowIso()): RecallOutcome {
  const item = data.revisions.find(entry => entry.id === id);
  if (!item || item.completedAt) return { data, dueDate: null, created: false };
  let revisions = data.revisions.map(entry => entry.id === id ? { ...entry, completedAt: at, recall: rating } : entry);
  const gap = RECALL_GAP[rating];
  if (!gap) return { data: { ...data, revisions }, dueDate: null, created: false };
  const target = addDays(today, gap);
  const next = revisions
    .filter(entry => entry.chapterId === item.chapterId && !entry.completedAt && entry.id !== id)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (next) {
    revisions = revisions.map(entry => entry.id === next.id ? { ...entry, dueDate: target, adjusted: true } : entry);
    return { data: { ...data, revisions }, dueDate: target, created: false };
  }
  if (revisions.length >= LIMITS.revisions) return { data: { ...data, revisions }, dueDate: null, created: false, limitReached: true };
  const interval: RevisionInterval = gap <= 1 ? 1 : 3;
  revisions = [...revisions, { id: newId(), chapterId: item.chapterId, subject: item.subject, dueDate: target, interval, createdAt: at, adjusted: true, recall: undefined }];
  return { data: { ...data, revisions }, dueDate: target, created: true };
}
/** Average recall over the last 45 days, only counting rated cards. */
export function recallSummary(revisions: RevisionItem[], today: string): { weak: number; okay: number; good: number; rated: number; score: number } {
  const from = addDays(today, -45);
  const rated = revisions.filter(item => !!item.recall && !!item.completedAt && item.completedAt.slice(0, 10) >= from);
  const count = (rating: RecallRating) => rated.filter(item => item.recall === rating).length;
  const score = rated.length ? Math.round((count('good') * 100 + count('okay') * 60 + count('weak') * 20) / rated.length) : 0;
  return { weak: count('weak'), okay: count('okay'), good: count('good'), rated: rated.length, score };
}
/** Keep the latest completed card for each chapter/interval so the scheduler
 * does not recreate already-completed milestones after history is compacted. */
export function compactRevisionHistory(data: AppData): AppData {
  const latest = new Map<string, RevisionItem>();
  for (const item of data.revisions) {
    if (!item.completedAt) continue;
    const key = `${item.chapterId}:${item.interval}`;
    const existing = latest.get(key);
    if (!existing || (item.completedAt || '') > (existing.completedAt || '')) latest.set(key, item);
  }
  const keep = new Set([...latest.values()].map(item => item.id));
  return { ...data, revisions: data.revisions.filter(item => !item.completedAt || keep.has(item.id)) };
}
export function reopenRevision(data: AppData, id: string): AppData {
  return { ...data, revisions: data.revisions.map(item => item.id === id ? { ...item, completedAt: undefined } : item) };
}
export function snoozeRevision(data: AppData, id: string, today: string, days = 1): AppData {
  return { ...data, revisions: data.revisions.map(item => item.id === id && !item.completedAt ? { ...item, dueDate: addDays(item.dueDate < today ? today : item.dueDate, days), adjusted: true } : item) };
}
export function revisionDueCount(data: AppData, today: string): number {
  return data.revisions.filter(item => !item.completedAt && item.dueDate <= today).length;
}
