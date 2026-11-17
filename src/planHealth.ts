import { CHAPTERS, CORE, PAPERS } from './data';
import { addDays, bn, chapterStudyTasks, hasFullTaskAllocation, scheduleDateError, todayKey } from './planner';
import type { Day, Settings, Task } from './planner';
import { t } from './i18n';

export function isInitialStudyTask(task: Task): boolean {
  const id = task.originalTaskId || task.id;
  return id.includes(':part-') || id.startsWith('chap-practice-');
}

/** Missing work is reported, never hidden behind a “full syllabus” promise.
 * Split allocations must cover the entire source, including any real completed ranges.
 */
export function planHealth(plan: Day[], settings: Settings, completed: Record<string, string> = {}) {
  const tasks = plan.flatMap(day => day.tasks);
  const before = (task: Task, date: string) =>
    Date.parse(`${task.date}T00:00:00Z`) + task.endMinute * 60000 <= Date.parse(`${date}T00:00:00Z`);
  const testEvidence = Object.fromEntries(Object.entries(completed)
    .filter(([, at]) => Date.parse(at) <= Date.parse(`${settings.testExamDate}T00:00:00+06:00`)));
  let missingParts = 0;
  let missingChapters = 0;
  let missingPractice = 0;
  let syllabusEnd: string | undefined;
  for (const chapter of CHAPTERS) {
    const study = chapterStudyTasks(plan, chapter.id).filter(task => before(task, settings.testExamDate));
    let missing = 0;
    for (let part = 1; part <= chapter.effort; part++) {
      const id = `${chapter.id}:part-${part}`;
      if (!hasFullTaskAllocation(study, id, testEvidence, true)) missing++;
    }
    const practiceIds = [...new Set(study.map(task => task.originalTaskId || task.id)
      .filter(id => id.startsWith(`chap-practice-${chapter.id}-`)))];
    const requiresPractice = chapter.effort === 1 || (chapter.effort >= 4 && chapter.effort % 2 === 1);
    const practiceFits = practiceIds.length > 0 && practiceIds.every(id =>
      hasFullTaskAllocation(study, id, testEvidence, true));
    const practiceDone = Object.keys(testEvidence).some(id => id.startsWith(`chap-practice-${chapter.id}-`));
    if (requiresPractice && !practiceFits && !practiceDone) missingPractice++;
    missingParts += missing;
    if (missing) missingChapters++;
    for (const task of study) {
      const date = addDays(task.date, Math.max(0, Math.floor((task.endMinute - 0.001) / 1440)));
      if (!syllabusEnd || date > syllabusEnd) syllabusEnd = date;
    }
    if (!study.length) for (const [id, at] of Object.entries(testEvidence)) {
      if (id.startsWith(`${chapter.id}:part-`)) {
        const date = todayKey(new Date(at));
        if (!syllabusEnd || date > syllabusEnd) syllabusEnd = date;
      }
    }
  }
  if (missingParts || missingPractice) syllabusEnd = undefined;
  const revisions = tasks.filter(task => task.kind === 'revision' && before(task, settings.examDate));
  const missingRevisionPasses = CHAPTERS.filter(chapter => CORE.includes(chapter.subject)).reduce((sum, chapter) =>
    sum + [1, 2].filter(round => !revisions.some(task =>
      (task.originalTaskId || task.id).startsWith(`revision-${round}-`) && task.chapterIds.includes(chapter.id) &&
      hasFullTaskAllocation(revisions, task.originalTaskId || task.id))).length, 0);
  const mocks = new Set(tasks.filter(task => task.kind === 'exam' && task.endMinute - task.startMinute >= 180 && before(task, settings.examDate)).map(task => task.paperId));
  const missingMocks = PAPERS.filter(paper => !mocks.has(paper.id)).length;
  const deferredMinutes = plan.reduce((sum, day) => sum + (day.deferredMinutes || 0), 0);
  const deadlineOverruns = tasks.filter(task => !before(task, settings.examDate)).length;
  const pendingSlots = tasks.filter(task => !completed[task.id]).map(task => ({
    start: Date.parse(`${task.date}T00:00:00Z`) + task.startMinute * 60000,
    end: Date.parse(`${task.date}T00:00:00Z`) + task.endMinute * 60000,
  })).sort((a, b) => a.start - b.start);
  let through = -Infinity, clashingSessions = 0;
  for (const slot of pendingSlots) {
    if (slot.start < through - 1) clashingSessions++;
    through = Math.max(through, slot.end);
  }
  const warnings: string[] = [];
  const dateError = scheduleDateError(settings);
  if (dateError) warnings.push(dateError);
  else {
    if (missingParts) warnings.push(t(`টেস্ট লক্ষ্যের আগে ${bn(missingChapters)}টি অধ্যায়ের ${bn(missingParts)}টি পড়ার ধাপের সময় নেই। শুরুর তারিখ বা লক্ষ্য ঠিক করো; এগুলো শেষ হয়েছে ধরে নিও না।`, `${missingParts} learning parts across ${missingChapters} chapters do not fit before the test target. Adjust the start or target; this is not full coverage.`));
    if (missingPractice) warnings.push(t(`টেস্ট লক্ষ্যের আগে ${bn(missingPractice)}টি অধ্যায়ের সঙ্গের অনুশীলন রাখা যায়নি।`, `${missingPractice} accompanying chapter-practice blocks do not fit before the test target.`));
    if (missingRevisionPasses) warnings.push(t(`দুই রাউন্ড রিভিশনের ${bn(missingRevisionPasses)}টি অধ্যায়-পাসের সময় নেই।`, `${missingRevisionPasses} chapter-passes do not fit in the two revision rounds.`));
    if (missingMocks) warnings.push(t(`${bn(missingMocks)}টি পূর্ণ মডেল টেস্টের সময় নেই।`, `${missingMocks} full mock papers do not fit.`));
    if (deferredMinutes > 0.01) warnings.push(t(`বোর্ড লক্ষ্য পর্যন্ত সময়ে ${bn(Math.ceil(deferredMinutes))} মিনিট কাজ রাখা যায়নি।`, `${Math.ceil(deferredMinutes)} minutes of work do not fit before the board target.`));
    if (deadlineOverruns) warnings.push(t(`${bn(deadlineOverruns)}টি কাস্টম সেশন বোর্ড লক্ষ্য পেরিয়ে যাচ্ছে। সময় কমাও বা সেশন এগিয়ে আনো।`, `${deadlineOverruns} custom sessions run past the board target. Shorten or move them earlier.`));
    if (clashingSessions) warnings.push(t(`${bn(clashingSessions)}টি অসমাপ্ত সেশনের সময় অন্য সেশনের সঙ্গে মিলে যাচ্ছে। কাস্টম সময়গুলো মিলিয়ে নাও।`, `${clashingSessions} pending sessions overlap other study slots. Review your custom times.`));
  }
  return { missingParts, missingChapters, missingPractice, missingRevisionPasses, missingMocks, deferredMinutes, deadlineOverruns, clashingSessions, syllabusEnd, warnings };
}
