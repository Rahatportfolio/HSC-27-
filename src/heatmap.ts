import { t } from './i18n';
import { CHAPTERS, SUBJECTS, chapterById } from './data';
import type { Chapter, SubjectId } from './data';
import type { ChapterStage } from './types';
import type { AppData, Day } from './planner';
import { todayKey } from './planner';
import { readiness as readinessOf } from './advanced';
import { chapterStage } from './learning';
import { weaknessReport } from './weakness';
import type { WeaknessRow } from './weakness';

/**
 * Syllabus heatmap: one cell per chapter, coloured by *how much is left*, not by guesswork.
 *
 * Every number below is derived from data the app already stores — completed task ids,
 * chapter stage, MCQ/CQ attempts, readiness coverage and the plan's own dates — so the
 * heatmap can never disagree with the chapter sheet. A cell with no data at all is
 * reported as "no signal" instead of being painted green.
 */

export const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;
export type HeatLevel = (typeof HEAT_LEVELS)[number];

export interface HeatCell {
  chapterId: string;
  chapter: Chapter;
  subject: SubjectId;
  /** 0 = untouched/behind, 4 = exam-ready. */
  level: HeatLevel;
  /** 0–100 readiness, computed from the signals below. */
  readiness: number;
  /** Planned-but-unfinished tasks inside the horizon. */
  pending: number;
  /** Total planned tasks for this chapter, finished or not. */
  planned: number;
  /** Planned tasks already ticked off. */
  done: number;
  /** The app's own chapter stage — shown next to the colour, because it can be optimistic. */
  stage: ChapterStage;
  /** MCQ attempts recorded for this chapter. */
  attempts: number;
  /** Written CQ entries recorded for this chapter. */
  cq: number;
  /** Why this colour — the sentence the UI prints under the cell. */
  reason: string;
  reasonEn: string;
  /** Last planned date, so "next up" can be sorted. */
  nextDate?: string;
}

export interface HeatRow {
  subject: SubjectId;
  cells: HeatCell[];
  /** Weighted readiness of the subject, 0–100. */
  readiness: number;
  /** How many of the subject's chapters are still red/orange. */
  cold: number;
}

export interface SyllabusHeat {
  rows: HeatRow[];
  overall: number;
  counts: Record<HeatLevel, number>;
  /** The five coldest chapters that are *not* exam-day, in plan order. */
  focus: HeatCell[];
  /** Cells the plan has already finished but which still test badly. */
  slipped: HeatCell[];
}

export interface HeatOptions {
  /** How many days ahead count as "upcoming" (default 7). */
  horizonDays?: number;
}

const STAGE_SCORE: Record<ChapterStage, number> = {
  notStarted: 0, inProgress: 40, completed: 65, revisionNeeded: 45, fullyRevised: 90,
};

export function heatLevel(readiness: number, touched: boolean): HeatLevel {
  if (!touched) return 0;
  if (readiness >= 85) return 4;
  if (readiness >= 70) return 3;
  if (readiness >= 50) return 2;
  if (readiness >= 25) return 1;
  return 0;
}

export const HEAT_LABEL: Record<HeatLevel, { bn: string; en: string }> = {
  0: { bn: 'শুরু হয়নি', en: 'Not started' },
  1: { bn: 'পিছিয়ে', en: 'Behind' },
  2: { bn: 'চলছে', en: 'In progress' },
  3: { bn: 'প্রায় তৈরি', en: 'Nearly ready' },
  4: { bn: 'পরীক্ষার জন্য তৈরি', en: 'Exam-ready' },
};

/**
 * Readiness for one chapter — deliberately additive with a hard penalty for a failed
 * recent test, because a chapter you have "finished" but score 40% on is not ready.
 */
export function chapterHeat(
  data: AppData,
  plan: Day[],
  chapterId: string,
  weaknessRows: WeaknessRow[],
  options: HeatOptions = {},
): HeatCell {
  const chapter = chapterById[chapterId];
  const horizon = Math.max(1, Math.min(30, Math.round(options.horizonDays ?? 7)));
  const today = todayKey();
  const stage = chapterStage(chapter, data, plan);
  const progress = readinessOf(data, chapterId);

  let planned = 0;
  let done = 0;
  let pending = 0;
  let nextDate: string | undefined;
  const horizonEnd = new Date(`${today}T00:00:00Z`);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizon);
  const endKey = horizonEnd.toISOString().slice(0, 10);

  for (const day of plan) {
    for (const task of day.tasks) {
      if (!task.chapterIds.includes(chapterId)) continue;
      if (data.removedTasks.includes(task.id)) continue;
      planned += 1;
      if (data.completed[task.id]) done += 1;
      else if (day.date >= today) {
        if (day.date <= endKey) pending += 1;
        if (!nextDate || day.date < nextDate) nextDate = day.date;
      }
    }
  }

  const attempts = data.attempts.filter(attempt => {
    const question = chapterQuestionIds(data).get(attempt.questionId);
    return question === chapterId;
  }).length;
  const cq = data.cq.filter(entry => entry.chapterId === chapterId).length;
  const weak = weaknessRows.find(row => row.chapterId === chapterId);

  const planScore = planned ? Math.round(done / planned * 100) : 0;
  const signals: number[] = [];
  if (planned) signals.push(planScore);
  signals.push(STAGE_SCORE[stage]);
  if (progress.coverage > 0) signals.push(Math.round(progress.coverage));
  if (attempts > 0) signals.push(Math.min(100, 40 + attempts * 8));
  if (cq > 0) signals.push(Math.min(100, 45 + cq * 10));

  let readiness = signals.length ? Math.round(signals.reduce((sum, value) => sum + value, 0) / signals.length) : 0;
  // A flagged weakness is evidence, not an opinion: cap the cell at "in progress".
  if (weak) readiness = Math.min(readiness, weak.score >= 7 ? 35 : 60);
  // Finished in the plan but never tested: "ready" cannot be claimed without a test.
  // (`chapterStage` may already say "completed", so the attempt count — not the stage —
  // is what decides here.)
  if (done > 0 && attempts === 0 && cq === 0) readiness = Math.min(readiness, 65);

  const touched = planned > 0 && (done > 0 || attempts > 0 || stage !== 'notStarted');
  const level = heatLevel(readiness, touched);

  const gap = Math.max(0, (planned || 0) - done);
  const reasonEn = weak
    ? `Weakness score ${weak.score}/10 — ${weak.signals[0]?.labelEn ?? 'recent signals'}.`
    : !planned
      ? 'Not in the current plan window.'
      : done === planned
        ? 'Every planned session is finished.'
        : `${gap} of ${planned} planned session(s) still open${pending ? `, ${pending} in the next ${horizon} day(s)` : ''}.`;
  const reason = weak
    ? t(`দুর্বলতার স্কোর ${weak.score}/১০ — ${weak.signals[0]?.label ?? 'সাম্প্রতিক সংকেত'}।`, `Weakness score ${weak.score}/10 — ${weak.signals[0]?.labelEn ?? 'recent signals'}.`)
    : !planned
      ? t('বর্তমান পরিকল্পনার মধ্যে নেই।', 'Not in the current plan.')
      : done === planned
        ? t('পরিকল্পিত প্রতিটি সেশন শেষ।', 'Every planned session is done.')
        : t(`${planned}টি পরিকল্পিত সেশনের ${gap}টি এখনো বাকি${pending ? `, পরের ${horizon} দিনে ${pending}টি` : ''}।`, `${gap} of ${planned} planned sessions are still open${pending ? `, ${pending} in the next ${horizon} days` : ''}.`);

  return {
    chapterId, chapter, subject: chapter.subject, level, readiness, pending, planned, done,
    attempts, cq, stage, reason, reasonEn,
    ...(nextDate ? { nextDate } : {}),
  };
}

let questionChapterCache: { size: number; map: Map<string, string> } | null = null;
/** questionId → chapterId, rebuilt only when the question list changes. */
function chapterQuestionIds(data: AppData): Map<string, string> {
  if (questionChapterCache && questionChapterCache.size === data.questions.length) return questionChapterCache.map;
  const map = new Map<string, string>();
  for (const question of data.questions) if (question.chapterId) map.set(question.id, question.chapterId);
  questionChapterCache = { size: data.questions.length, map };
  return map;
}

/**
 * The whole map. Ordered by the syllabus order the app already uses (priority A first,
 * then chapter number), so a red block high on the page always means "fix this first".
 */
export function syllabusHeat(data: AppData, plan: Day[], options: HeatOptions = {}): SyllabusHeat {
  const weaknessRows = weaknessReport(plan, data, todayKey());
  const cells = CHAPTERS.map(chapter => chapterHeat(data, plan, chapter.id, weaknessRows, options));
  // The built-in question bank also counts as an attempt source; seed it lazily above.
  const rows: HeatRow[] = SUBJECTS.map(subject => {
    const subjectCells = cells
      .filter(cell => cell.subject === subject.id)
      .sort((a, b) => {
        const priority = (cell: HeatCell) => (cell.chapter.priority === 'A' ? 0 : cell.chapter.priority === 'B' ? 1 : 2);
        return priority(a) - priority(b) || a.chapter.number.localeCompare(b.chapter.number, 'bn');
      });
    const weight = (cell: HeatCell) => (cell.chapter.priority === 'A' ? 3 : cell.chapter.priority === 'B' ? 2 : 1);
    const total = subjectCells.reduce((sum, cell) => sum + weight(cell), 0);
    const readiness = total ? Math.round(subjectCells.reduce((sum, cell) => sum + cell.readiness * weight(cell), 0) / total) : 0;
    return { subject: subject.id, cells: subjectCells, readiness, cold: subjectCells.filter(cell => cell.level <= 1).length };
  });
  const counts: Record<HeatLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const cell of cells) counts[cell.level] += 1;
  const weightOf = (cell: HeatCell) => (cell.chapter.priority === 'A' ? 3 : cell.chapter.priority === 'B' ? 2 : 1);
  const weightTotal = cells.reduce((sum, cell) => sum + weightOf(cell), 0);
  const overall = weightTotal ? Math.round(cells.reduce((sum, cell) => sum + cell.readiness * weightOf(cell), 0) / weightTotal) : 0;
  const focus = cells
    .filter(cell => cell.planned > 0 && cell.level <= 1)
    .sort((a, b) => weightOf(b) - weightOf(a) || a.readiness - b.readiness || (a.nextDate ?? '9').localeCompare(b.nextDate ?? '9'))
    .slice(0, 5);
  // "Finished in the plan, yet still not ready" — the chapters that quietly slip.
  // Only chapters where work actually started and nothing is scheduled ahead: the plan
  // has moved on, but the chapter never became exam-ready.
  const slipped = cells.filter(cell => cell.planned > 0 && cell.pending === 0 && cell.done > 0 && cell.readiness < 70);
  return { rows, overall, counts, focus, slipped };
}

/** Which chapters the map says have no data at all — the honest "not started" list. */
export function untouchedChapters(heat: SyllabusHeat): HeatCell[] {
  return heat.rows.flatMap(row => row.cells).filter(cell => cell.level === 0 && cell.readiness === 0);
}
