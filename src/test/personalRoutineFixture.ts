/** Synthetic workloads for regression tests only. No external video metadata was fetched. */
import { freshData } from '../planner';
import type { AppData } from '../planner';
import { WORK_STAGES, defaultChapterWorkload, newPersonalRoutine } from '../personalRoutine';
import type { ChapterWorkload, PersonalRoutine } from '../personalRoutine';
export const PERSONAL_IDS = ['physics-1-3', 'chemistry-1-3'];
export function personalWorkload(classMinutes = 240, mcq = 0, cq = 0): ChapterWorkload {
  const work = defaultChapterWorkload(PERSONAL_IDS[0]);
  for (const stage of WORK_STAGES) work[stage.id] = {
    minutes: stage.id === 'class' ? classMinutes : stage.id === 'mcqClass' ? mcq : stage.id === 'cqClass' ? cq : 1,
    source: stage.media ? 'student' : 'planned',
    ...(stage.media ? { url: 'https://www.youtube.com/watch?v=abcdefghijk' } : {}),
  };
  return work;
}
export function personalRoutineFixture(ids = PERSONAL_IDS): PersonalRoutine {
  return { ...newPersonalRoutine(), chapterIds: [...ids],
    windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 1080, endMinute: 1350 })),
    dailyLimitMinutes: 270, exclusions: [], sessionMinutes: 120, breakMinutes: 0,
    workloads: Object.fromEntries(ids.map(id => [id, personalWorkload()])), updatedAt: '2026-11-16T10:00:00.000Z' };
}
export function personalDataFixture(ids = PERSONAL_IDS): AppData {
  const data = freshData(); data.settings.language = 'en';
  // Keep the synthetic fixture deterministic and independent of the current date.
  data.settings.startDate = '2026-11-20'; data.settings.boostStartDate = '2026-12-07';
  data.personalRoutine = personalRoutineFixture(ids); return data;
}
