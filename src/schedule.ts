import { chapterStudyTasks } from './planner';
import type { Day } from './planner';

// Importance is editorial metadata. Hours and dates MUST come from the live plan.
import { CHAPTER_SCHEDULE } from './chapterImportance';
import type { Star } from './chapterImportance';
export { CHAPTER_SCHEDULE } from './chapterImportance';
export type { Star } from './chapterImportance';
export interface ChapterSchedule { star: Star; hours: number; start?: string; end?: string }

export function scheduleFor(id: string, plan: Day[]): ChapterSchedule | undefined {
  const meta = CHAPTER_SCHEDULE[id];
  if (!meta) return undefined;
  const tasks = chapterStudyTasks(plan, id);
  return {
    star: meta.star,
    hours: Math.round(tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) / 6) / 10,
    start: tasks.map(task => task.date).sort().at(0),
    end: tasks.map(task => task.date).sort().at(-1),
  };
}
