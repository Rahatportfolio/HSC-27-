import { BANGLA_LESSONS, CHAPTER_CLASSES } from './classLinks';
import type { ChapterClasses, ClassOption, LessonLink } from './classLinks';
import type { AppData } from './planner';
import { nowIso } from './storage';

/** Keys are either a YouTube url or `lesson:<title>` for a Bangla lesson row. */
export const WATCHED_LIMIT = 1000;
export const lessonKey = (title: string): string => `lesson:${title}`;

/** Every option of a chapter, in the order the UI shows them. */
export function allOptions(classes: ChapterClasses): ClassOption[] {
  return [...classes.oneShot, ...classes.mcq, ...classes.cq];
}
/** Only the links that open a real class (video/playlist), not a channel search. */
export function realOptions(classes: ChapterClasses): ClassOption[] {
  return allOptions(classes).filter(option => option.kind !== 'search');
}
export const isWatched = (data: Pick<AppData, 'classWatched'>, key: string): boolean => !!data.classWatched[key];

export interface ClassProgress { total: number; watched: number; percent: number }
const progressOf = (keys: string[], watched: Record<string, string>): ClassProgress => {
  const unique = [...new Set(keys)];
  const done = unique.filter(key => !!watched[key]).length;
  return { total: unique.length, watched: done, percent: unique.length ? Math.round(done / unique.length * 100) : 0 };
};

/** Real class links of one chapter (search rows are not countable), plus its Bangla lessons. */
export function chapterClassProgress(data: Pick<AppData, 'classWatched'>, chapterId: string): ClassProgress {
  const classes = CHAPTER_CLASSES[chapterId];
  const keys: string[] = [];
  if (classes) for (const option of realOptions(classes)) keys.push(option.url);
  for (const lesson of BANGLA_LESSONS[chapterId] || []) if (lesson.url) keys.push(lesson.url);
  return progressOf(keys, data.classWatched);
}
/** Whole-library progress across all 7 subjects. */
export function classProgress(data: Pick<AppData, 'classWatched'>): ClassProgress {
  const keys: string[] = [];
  for (const classes of Object.values(CHAPTER_CLASSES)) for (const option of realOptions(classes)) keys.push(option.url);
  for (const lessons of Object.values(BANGLA_LESSONS)) for (const lesson of lessons) if (lesson.url) keys.push(lesson.url);
  return progressOf(keys, data.classWatched);
}
/** How many chapters of a subject still have an unwatched direct class. */
export function unwatchedChapters(data: Pick<AppData, 'classWatched'>, chapterIds: string[]): string[] {
  return chapterIds.filter(id => { const progress = chapterClassProgress(data, id); return progress.total > 0 && progress.watched < progress.total; });
}

export function toggleClassWatched(data: AppData, key: string, at = nowIso()): AppData {
  const next = { ...data.classWatched };
  if (next[key]) delete next[key];
  else {
    next[key] = at;
    const keys = Object.keys(next);
    if (keys.length > WATCHED_LIMIT) {
      // Drop the least recent marks instead of refusing the newest one.
      for (const old of keys.sort((a, b) => next[a].localeCompare(next[b])).slice(0, keys.length - WATCHED_LIMIT)) delete next[old];
    }
  }
  return { ...data, classWatched: next };
}
/** A Bangla lesson row that still has no direct video is only a search helper. */
export const countableLesson = (lesson: LessonLink): boolean => !!lesson.url;
