import type { SubjectId } from './data';
import type { AppData, Day, Task } from './planner';
import { addDays, taskStart, todayKey } from './planner';
import type { Carryover, ChapterMeta, StudyMode, StudySession } from './types';
import { newId, nowIso } from './storage';

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
  return data.carryovers.filter(item => item.date === date).sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || a.createdAt.localeCompare(b.createdAt));
}
export function pendingCarryovers(data: AppData): Carryover[] {
  return data.carryovers.filter(item => !item.completedAt).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}
export function addCarryover(data: AppData, task: Pick<Task, 'id' | 'title' | 'subject' | 'endMinute' | 'startMinute' | 'date'>, date: string): AppData {
  if (data.carryovers.length >= 2000) return data;
  const exists = data.carryovers.some(item => item.taskId === task.id && item.date === date && !item.completedAt);
  if (exists) return data;
  const entry: Carryover = {
    id: newId(), taskId: task.id, title: task.title, subject: task.subject,
    minutes: Math.max(1, task.endMinute - task.startMinute), fromDate: taskStart(task).date, date, createdAt: nowIso(),
  };
  return { ...data, carryovers: [...data.carryovers, entry] };
}
export function toggleCarryover(data: AppData, id: string): AppData {
  const item = data.carryovers.find(entry => entry.id === id);
  if (!item) return data;
  const completedAt = item.completedAt ? undefined : nowIso();
  const completed = { ...data.completed };
  // Completing the carried copy is the same achievement as completing the original session.
  if (completedAt && !completed[item.taskId]) completed[item.taskId] = completedAt;
  return { ...data, completed, carryovers: data.carryovers.map(entry => entry.id === id ? { ...entry, completedAt } : entry) };
}
export function removeCarryover(data: AppData, id: string): AppData {
  return { ...data, carryovers: data.carryovers.filter(item => item.id !== id) };
}
/** Optional automatic carryover: recent missed sessions, capped so the list cannot explode. */
export function autoCarryover(plan: Day[], data: AppData, today: string): AppData {
  if (data.settings.carryoverMode !== 'auto') return data;
  const pending = pendingCarryovers(data);
  if (pending.filter(item => item.date === today).length >= 6) return data;
  const carried = new Set(data.carryovers.filter(item => !item.completedAt).map(item => item.taskId));
  const candidates = plan.flatMap(day => day.tasks)
    .filter(task => task.kind !== 'exam' && taskStart(task).date < today && taskStart(task).date >= addDays(today, -10) && !data.completed[task.id] && !carried.has(task.id))
    .sort((a, b) => taskStart(a).date.localeCompare(taskStart(b).date));
  let next = data;
  for (const task of candidates.slice(0, Math.max(0, 6 - pending.filter(item => item.date === today).length))) {
    next = addCarryover(next, task, today);
  }
  return next;
}
/** One-click manual plan: up to five most recent missed non-exam sessions. */
export function addBacklogToToday(plan: Day[], data: AppData, today: string, limit = 5): { data: AppData; added: number } {
  const carried = new Set(data.carryovers.filter(item => !item.completedAt).map(item => item.taskId));
  const candidates = plan.flatMap(day => day.tasks)
    .filter(task => task.kind !== 'exam' && taskStart(task).date < today && !data.completed[task.id] && !carried.has(task.id))
    .sort((a, b) => taskStart(b).date.localeCompare(taskStart(a).date));
  let next = data, added = 0;
  for (const task of candidates.slice(0, limit)) {
    const before = next.carryovers.length;
    next = addCarryover(next, task, today);
    if (next.carryovers.length > before) added++;
  }
  return { data: next, added };
}
