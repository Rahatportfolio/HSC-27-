import { isSuperChapter } from './superCategory';
import { CHAPTERS } from './data';
import type { Priority } from './data';
import { chapterPriority, chapterStage, isLearningComplete } from './learning';
import { addDays, diffDays, percent } from './planner';
import type { AppData, Day } from './planner';

/**
 * Test Examination preparation mode: can all A-category chapters realistically be
 * finished before the college Test Exam? All numbers come from the student's own
 * data — nothing here is a guarantee about the exam.
 */

export interface TestPrepStats {
  testDate: string;
  daysLeft: number;
  totalA: number;
  doneA: number;
  remainingA: number;
  percentA: number;
  /** Incomplete A-category tasks still on the plan. */
  remainingATasks: number;
  /** Tasks per day needed to finish A-category work before the test exam. */
  requiredTasksPerDay: number;
  /** Chapters per day needed (remaining chapters ÷ remaining days). */
  requiredChaptersPerDay: number;
  /** A-category tasks actually completed per day over the last 14 days. */
  paceTasksPerDay: number;
  dailyTarget: number;
  /** True when the recent pace covers the requirement (or the requirement is tiny). */
  onPace: boolean;
  warning: 'overdue' | 'behind' | null;
}

const PACE_WINDOW = 14;

export function testPrepStats(data: AppData, plan: Day[], today: string, category: 'A' | 'S' = 'A'): TestPrepStats {
  const testDate = data.settings.testExamDate;
  const daysLeft = Math.max(0, diffDays(today, testDate));
  const aChapters = CHAPTERS.filter(chapter => category === 'S' ? isSuperChapter(chapter) : chapterPriority(chapter, data) === 'A');
  const doneA = aChapters.filter(chapter => isLearningComplete(chapterStage(chapter, data, plan))).length;
  const remainingA = aChapters.length - doneA;

  const aIds = new Set(aChapters.map(chapter => chapter.id));
  const aTaskIds = new Set<string>();
  for (const day of plan) {
    for (const task of day.tasks) {
      if (day.date <= testDate && task.chapterIds.some(id => aIds.has(id))) aTaskIds.add(task.id);
    }
  }
  const remainingIds = new Set<string>();
  for (const day of plan) {
    for (const task of day.tasks) {
      if (day.date <= testDate && aTaskIds.has(task.id) && !data.completed[task.id] && !data.removedTasks.includes(task.id)) remainingIds.add(task.id);
    }
  }

  const remainingATasks = remainingIds.size;
  const elapsedDays = Math.max(0, diffDays(data.settings.startDate, today) + 1);
  const paceWindow = Math.min(PACE_WINDOW, elapsedDays);
  const windowFrom = addDays(today, -(Math.max(1, paceWindow) - 1));
  let paceDone = 0;
  for (const id of aTaskIds) {
    const at = data.completed[id];
    if (!at) continue;
    const day = at.slice(0, 10);
    if (paceWindow > 0 && day >= windowFrom && day <= today && day <= testDate) paceDone++;
  }
  const paceTasksPerDay = paceWindow ? paceDone / paceWindow : 0;

  const divisor = Math.max(1, daysLeft);
  const requiredTasksPerDay = remainingATasks / divisor;
  const requiredChaptersPerDay = remainingA / divisor;
  const dailyTarget = Math.max(remainingA > 0 ? 1 : 0, Math.ceil(requiredTasksPerDay));
  // A small daily requirement is reachable even after a slow fortnight; otherwise the
  // recent 14-day pace must at least cover what the calendar demands.
  const onPace = remainingA === 0 || (remainingATasks > 0 && (requiredTasksPerDay <= 0.25 || paceTasksPerDay >= requiredTasksPerDay));
  const warning: TestPrepStats['warning'] = remainingA === 0 ? null
    : daysLeft === 0 ? 'overdue'
      : onPace ? null
        : 'behind';

  return {
    testDate, daysLeft,
    totalA: aChapters.length, doneA, remainingA, percentA: percent(doneA, aChapters.length),
    remainingATasks, requiredTasksPerDay: Math.round(requiredTasksPerDay * 100) / 100,
    requiredChaptersPerDay: Math.round(requiredChaptersPerDay * 100) / 100,
    paceTasksPerDay: Math.round(paceTasksPerDay * 100) / 100,
    dailyTarget, onPace, warning,
  };
}

/** A-category chapters ordered by plan date, with completion state, for the prep checklist. */
export function aCategoryChecklist(data: AppData, plan: Day[], category: 'A' | 'S' = 'A'): { id: string; title: string; subject: string; done: boolean; date?: string; priority: Priority }[] {
  const dateById = new Map<string, string>();
  for (const day of plan) {
    for (const task of day.tasks) {
      for (const chapterId of task.chapterIds) {
        const existing = dateById.get(chapterId);
        if (!existing || day.date < existing) dateById.set(chapterId, day.date);
      }
    }
  }
  return CHAPTERS
    .filter(chapter => category === 'S' ? isSuperChapter(chapter) : chapterPriority(chapter, data) === 'A')
    .map(chapter => ({
      id: chapter.id,
      title: chapter.title,
      subject: chapter.subject,
      done: isLearningComplete(chapterStage(chapter, data, plan)),
      date: dateById.get(chapter.id),
      priority: 'A' as Priority,
    }))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.date || '9999').localeCompare(b.date || '9999'));
}
