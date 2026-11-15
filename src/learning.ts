import { CHAPTERS, SUBJECTS } from './data';
import type { Chapter, Priority, SubjectId } from './data';
import { chapterStudyTasks } from './planner';
import type { AppData, Day } from './planner';
import type { ChapterStage, ChapterStep } from './types';

export const STAGES: { id: ChapterStage; bn: string; en: string }[] = [
  { id: 'notStarted', bn: 'শুরু হয়নি', en: 'Not started' },
  { id: 'inProgress', bn: 'চলছে', en: 'In progress' },
  { id: 'completed', bn: 'সম্পন্ন', en: 'Completed' },
  { id: 'revisionNeeded', bn: 'রিভিশন দরকার', en: 'Revision needed' },
  { id: 'fullyRevised', bn: 'রিভিশন সম্পন্ন', en: 'Fully revised' },
];
export const STEPS: { id: ChapterStep; bn: string; en: string }[] = [
  { id: 'class', bn: 'ক্লাস', en: 'Class' }, { id: 'reading', bn: 'পড়া', en: 'Reading' },
  { id: 'cqPractice', bn: 'CQ অনুশীলন', en: 'CQ practice' }, { id: 'mcqPractice', bn: 'MCQ অনুশীলন', en: 'MCQ practice' },
  { id: 'boardPractice', bn: 'বোর্ড প্রশ্ন', en: 'Board questions' }, { id: 'revision', bn: 'রিভিশন', en: 'Revision' },
];
export function chapterPriority(chapter: Chapter, data: AppData): Priority {
  return data.chapterMeta[chapter.id]?.priority || chapter.priority;
}
/** Explicit personal status overrides the legacy task-derived status; watching a video alone never completes a chapter. */
export function chapterStage(chapter: Chapter, data: AppData, plan: Day[]): ChapterStage {
  const meta = data.chapterMeta[chapter.id];
  if (meta?.stage) return meta.stage;
  const tasks = chapterStudyTasks(plan, chapter.id);
  if (tasks.length && tasks.every(task => !!data.completed[task.id])) return 'completed';
  if (tasks.some(task => !!data.completed[task.id]) || Object.values(meta?.steps || {}).some(Boolean) || meta?.cq === 'ready' || meta?.mcq === 'ready') return 'inProgress';
  return 'notStarted';
}
export function isLearningComplete(stage: ChapterStage): boolean {
  return stage === 'completed' || stage === 'revisionNeeded' || stage === 'fullyRevised';
}
export interface ProgressGroup { total: number; completed: number; inProgress: number; remaining: number; percent: number }
export function learningProgress(chapters: Chapter[], data: AppData, plan: Day[]): ProgressGroup {
  let completed = 0, inProgress = 0;
  for (const chapter of chapters) {
    const stage = chapterStage(chapter, data, plan);
    if (isLearningComplete(stage)) completed++;
    else if (stage === 'inProgress') inProgress++;
  }
  return { total: chapters.length, completed, inProgress, remaining: chapters.length - completed, percent: chapters.length ? Math.round(completed / chapters.length * 1000) / 10 : 0 };
}
export function learningDashboard(data: AppData, plan: Day[]) {
  const category = Object.fromEntries((['A', 'B', 'C'] as const).map(priority => [priority, learningProgress(CHAPTERS.filter(c => chapterPriority(c, data) === priority), data, plan)])) as Record<Priority, ProgressGroup>;
  const subject = Object.fromEntries(SUBJECTS.map(s => [s.id, learningProgress(CHAPTERS.filter(c => c.subject === s.id), data, plan)])) as Record<SubjectId, ProgressGroup>;
  return { overall: learningProgress(CHAPTERS, data, plan), category, subject };
}
