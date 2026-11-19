import { remainingMedia } from './smartSchedule';
import { isPersonalTaskComplete, retainPersonalHistory, resumeUnfinishedPersonalPhase, undoPersonalRange } from './personalRoutine';
import type { SubjectId } from './data';
import type { AppData, Day, Mistake, Task } from './planner';
import { addDays, hasFullTaskAllocation, taskStart, todayKey } from './planner';
import type { Carryover, ChapterMeta, MistakeCategory, StudyMode, StudySession } from './types';
import { newId, nowIso } from './storage';
import { parseTaskRangeId } from './taskReferences';

export const EMPTY_META: ChapterMeta = { note: '', weak: false, cq: 'none', mcq: 'none', updatedAt: '' };
export function chapterMeta(data: AppData, chapterId: string): ChapterMeta {
  return data.chapterMeta[chapterId] || EMPTY_META;
}
export function updateChapterMeta(data: AppData, chapterId: string, patch: Partial<ChapterMeta>): AppData {
  const current = chapterMeta(data, chapterId);
  return { ...data, chapterMeta: { ...data.chapterMeta, [chapterId]: { ...current, ...patch, updatedAt: nowIso() } } };
}
export function addStudySession(data: AppData, session: Omit<StudySession, 'id' | 'date' | 'at'>): AppData {
  const at = nowIso();
  const entry: StudySession = { ...session, id: newId(), date: todayKey(new Date(at)), at };
  return {
    ...data,
    studySessions: [...data.studySessions, entry].slice(-6000),
    // `focus` stays the lifetime aggregate, including sessions logged by earlier versions.
    focus: { minutes: data.focus.minutes + entry.minutes, sessions: data.focus.sessions + 1 },
  };
}
export function deleteStudySession(data: AppData, id: string): AppData {
  const session = data.studySessions.find(item => item.id === id);
  if (!session) return data;
  return {
    ...data,
    studySessions: data.studySessions.filter(item => item.id !== id),
    focus: { minutes: Math.max(0, data.focus.minutes - session.minutes), sessions: Math.max(0, data.focus.sessions - 1) },
  };
}
export interface NewSession { minutes: number; subject: SubjectId; chapterId?: string; mode: StudyMode; label?: string }

export function carryoversOn(data: AppData, date: string): Carryover[] {
  const items = data.carryovers.filter(item => item.date === date).sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || b.createdAt.localeCompare(a.createdAt));
  return items.filter((item, index) => items.findIndex(other => other.taskId === item.taskId) === index);
}
export function pendingCarryovers(data: AppData): Carryover[] {
  const items = data.carryovers.filter(item => !item.completedAt && !isPersonalTaskComplete({ id: item.taskId }, data.completed)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return items.filter((item, index) => items.findIndex(other => other.taskId === item.taskId) === index);
}
export function addCarryover(data: AppData, task: Pick<Task, 'id' | 'title' | 'subject' | 'endMinute' | 'startMinute' | 'date'>, date: string): AppData {
  if (data.carryovers.length >= 2000) return data;
  const exists = isPersonalTaskComplete(task, data.completed) || data.carryovers.some(item => item.taskId === task.id && !item.completedAt);
  if (exists) return data;
  const entry: Carryover = {
    id: newId(), taskId: task.id, title: task.title, subject: task.subject,
    minutes: Math.max(1, task.endMinute - task.startMinute), fromDate: taskStart(task).date, date, createdAt: nowIso(),
  };
  return { ...data, carryovers: [...data.carryovers, entry] };
}
/** One completion state for an original task and all of its carried copies. */
export function setTaskCompletion(data: AppData, ids: string[], done: boolean, plan?: Day[]): AppData {
  const selected = new Set(ids.filter(id => {
    if (!done || (!id.startsWith('smart-video|') && !id.startsWith('smart-part|'))) return true;
    const range = parseTaskRangeId(id);
    if (!range) return false;
    if (range.kind === 'part') return true;
    const c = data.advanced?.classes.find(c => c.id === range.sourceId);
    return !!c && range.to / 1000 <= c.duration + 0.01 &&
      !remainingMedia(c).some(([s, e]) => s < range.to / 1000 - 0.01 && e > range.from / 1000 + 0.01);
  }));
  let completed = { ...data.completed };
  if (!done && plan) for (const task of plan.flatMap(day => day.tasks)) {
    if (selected.has(task.id) && task.personalWork) completed = undoPersonalRange(completed, task);
  }
  const stamp = nowIso();
  const splitSources = new Set<string>();
  for (const id of selected) {
    // Regenerated sub-ranges already covered by real evidence must not acquire
    // today's synthetic tick/recall anchor when a mixed day is bulk-completed.
    if (done && isPersonalTaskComplete({ id }, completed)) continue;
    if (done) completed[id] = completed[id] || stamp;
    else {
      delete completed[id];
      if (!id.startsWith('smart-part|')) {
        const prefix = `smart-part|${encodeURIComponent(id)}|`;
        Object.keys(completed).filter(key => key.startsWith(prefix)).forEach(key => { delete completed[key]; });
      }
    }
    if (id.startsWith('smart-part|')) {
      const range = parseTaskRangeId(id);
      if (range?.kind === 'part') splitSources.add(range.sourceId);
    }
  }
  const tasks = plan?.flatMap(day => day.tasks);
  for (const source of splitSources) {
    if (!done) delete completed[source];
    // Once all fragments are actually complete, retain canonical completion across
    // future date/hour changes. A single visible fragment can never promote it.
    else if (tasks && hasFullTaskAllocation(tasks, source, completed)) completed[source] ||= stamp;
    selected.add(source);
  }
  const undoneChapters = !done && plan ? new Set(plan.flatMap(day => day.tasks).filter(task => task.personalWork && selected.has(task.id)).flatMap(task => task.chapterIds)) : new Set<string>();
  const chapterMeta = undoneChapters.size ? Object.fromEntries(Object.entries(data.chapterMeta).map(([id, meta]) => [id, undoneChapters.has(id) && ['completed', 'revisionNeeded', 'fullyRevised'].includes(meta.stage || '') ? { ...meta, stage: 'inProgress' as const, updatedAt: stamp } : meta])) : data.chapterMeta;
  const next = { ...data, completed, chapterMeta, carryovers: data.carryovers.map(entry => selected.has(entry.taskId)
    ? { ...entry, completedAt: done ? completed[entry.taskId] : undefined } : entry) };
  return resumeUnfinishedPersonalPhase(done && plan ? retainPersonalHistory(next, plan) : next);
}
export function toggleCarryover(data: AppData, id: string, plan?: Day[]): AppData {
  const item = data.carryovers.find(entry => entry.id === id);
  return item ? setTaskCompletion(data, [item.taskId], !isPersonalTaskComplete({ id: item.taskId }, data.completed), plan) : data;
}
export function removeCarryover(data: AppData, id: string): AppData {
  return { ...data, carryovers: data.carryovers.filter(item => item.id !== id) };
}
/** Optional automatic carryover: recent missed sessions, capped so the list cannot explode. */
export function autoCarryover(plan: Day[], data: AppData, today: string): AppData {
  if (data.personalRoutine || data.settings.carryoverMode !== 'auto' || data.advanced?.classes.length) return data;
  const pending = pendingCarryovers(data);
  if (pending.filter(item => item.date === today).length >= 6) return data;
  const carried = new Set(data.carryovers.filter(item => !item.completedAt).map(item => item.taskId));
  const candidates = plan.flatMap(day => day.tasks)
    .filter(task => task.kind !== 'exam' && taskStart(task).date < today && taskStart(task).date >= addDays(today, -10) && !isPersonalTaskComplete(task, data.completed) && !carried.has(task.id))
    .sort((a, b) => taskStart(a).date.localeCompare(taskStart(b).date));
  let next = data;
  for (const task of candidates.slice(0, Math.max(0, 6 - pending.filter(item => item.date === today).length))) {
    next = addCarryover(next, task, today);
  }
  return next;
}
/** Group unresolved mistakes by category so the student can practise the weakest kind first. */
export function mistakesByCategory(data: AppData): Record<MistakeCategory, Mistake[]> {
  const result = Object.fromEntries(['conceptual', 'calculation', 'memory', 'misunderstood', 'careless'].map(category => [category, [] as Mistake[]])) as Record<MistakeCategory, Mistake[]>;
  for (const mistake of data.mistakes) {
    if (!mistake.resolved) result[mistake.category].push(mistake);
  }
  return result;
}

/** Count of unresolved mistakes, optionally filtered by category. */
export function unresolvedMistakeCount(data: AppData, category?: MistakeCategory): number {
  return data.mistakes.filter(m => !m.resolved && (category === undefined || m.category === category)).length;
}

/** One-click manual plan: up to five most recent missed non-exam sessions. */
export function addBacklogToToday(plan: Day[], data: AppData, today: string, limit = 5): { data: AppData; added: number } {
  const carried = new Set(data.carryovers.filter(item => !item.completedAt).map(item => item.taskId));
  const candidates = plan.flatMap(day => day.tasks)
    .filter(task => task.kind !== 'exam' && taskStart(task).date < today && !isPersonalTaskComplete(task, data.completed) && !carried.has(task.id))
    .sort((a, b) => taskStart(b).date.localeCompare(taskStart(a).date));
  let next = data, added = 0;
  for (const task of candidates.slice(0, limit)) {
    const before = next.carryovers.length;
    next = addCarryover(next, task, today);
    if (next.carryovers.length > before) added++;
  }
  return { data: next, added };
}
