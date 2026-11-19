import { readiness } from './advanced';
import { isPersonalChapterDone, isPersonalTaskComplete, personalCompletionEvidence, personalRoutineForChapter } from './personalRoutine';
import { CHAPTERS, SUBJECTS } from './data';
import type { Chapter, Priority, SubjectId } from './data';
import { chapterStudyTasks, isChapterDone } from './planner';
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
/** Personal routines require every source group. Legacy self-assessments remain historical. */
export function chapterStage(chapter: Chapter, data: AppData, plan: Day[]): ChapterStage {
  const meta = data.chapterMeta[chapter.id];
  const personal = personalRoutineForChapter(data, chapter.id);
  if (personal) {
    // Old whole-chapter statuses are preserved as history, never a bypass of the six required steps.
    if (isPersonalChapterDone(plan, chapter.id, data.completed, personal)) return 'fullyRevised';
    return personalCompletionEvidence(data, chapter.id).length || chapterStudyTasks(plan, chapter.id).some(task => isPersonalTaskComplete(task, data.completed)) ? 'inProgress' : 'notStarted';
  }
  // New tracked chapters cannot be completed by a legacy task checkbox alone.
  if (data.advanced?.classes.some(c => c.chapterId === chapter.id) || data.advanced?.preparation[chapter.id]) {
    const progress = readiness(data, chapter.id);
    if (!progress.lectures || progress.coverage < 100) return 'inProgress';
    if (progress.readiness === 100) return 'fullyRevised';
    return 'inProgress';
  }
  if (meta?.stage) return meta.stage;
  const tasks = chapterStudyTasks(plan, chapter.id);
  if (isChapterDone(data.personalRoutine ? [] : plan, chapter.id, data.completed)) return 'completed';
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
  const scope = data.personalRoutine ? CHAPTERS.filter(c => data.personalRoutine!.chapterIds.includes(c.id)) : CHAPTERS;
  const subject = Object.fromEntries(SUBJECTS.map(s => [s.id, learningProgress(scope.filter(c => c.subject === s.id), data, plan)])) as Record<SubjectId, ProgressGroup>;
  return { overall: learningProgress(scope, data, plan), category, subject };
}
