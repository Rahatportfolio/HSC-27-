import { CHAPTERS, sortChapters } from './data';
import type { Chapter, SubjectId } from './data';
import type { AppData, Day } from './planner';
import { addDays, diffDays } from './planner';
import { allQuestions, weakChapters } from './analytics';
import type { WeakChapter } from './analytics';
import { examChapterAccuracy } from './examSim';
import { retryBuckets } from './retryLoop';
import { chapterStage } from './learning';

/**
 * The weakness detector: one ranked answer to "what should I study next, and why?".
 *
 * Every signal the app already records is folded into a single explainable score —
 * no hidden model, no invented content. A chapter only appears when at least one real
 * signal fired, and every row explains itself in plain Bangla.
 */

export interface WeaknessSignal {
  /** short label shown next to the chapter, e.g. "MCQ ৪২%". */
  label: string;
  labelEn: string;
  /** how much this signal contributed (higher = more urgent). */
  weight: number;
}

export interface WeaknessRow {
  chapterId: string;
  subject: SubjectId;
  chapter: Chapter;
  priority: Chapter['priority'];
  score: number;
  signals: WeaknessSignal[];
  /** 0–100, how much of the chapter is done, so "weak but untouched" is distinguishable. */
  stagePercent: number;
  /** the single next action, already worded like a button label. */
  action: 'practice' | 'retry' | 'revise' | 'study';
  actionLabel: string;
  actionLabelEn: string;
  dueRetries: number;
}

const MCQ_MIN_SAMPLE = 3;
const CQ_MIN_SAMPLE = 1;

/** Accuracy per chapter from the stored attempt history. */
export function chapterAccuracy(data: AppData): Map<string, { total: number; correct: number; accuracy: number }> {
  const chapterOf = new Map(allQuestions(data).map(question => [question.id, question.chapterId]));
  const rows = new Map<string, { total: number; correct: number }>();
  for (const attempt of data.attempts) {
    const chapterId = chapterOf.get(attempt.questionId);
    if (!chapterId) continue;
    const row = rows.get(chapterId) || { total: 0, correct: 0 };
    row.total++;
    if (attempt.correct) row.correct++;
    rows.set(chapterId, row);
  }
  return new Map([...rows.entries()].map(([id, row]) => [id, { ...row, accuracy: row.total ? Math.round(row.correct / row.total * 100) : 0 }]));
}

/** CQ self-marking average per chapter. */
export function chapterCqMarks(data: AppData): Map<string, { total: number; marks: number; percent: number }> {
  const rows = new Map<string, { marks: number; total: number }>();
  for (const entry of data.cq) {
    if (!entry.chapterId) continue;
    const row = rows.get(entry.chapterId) || { marks: 0, total: 0 };
    row.marks += entry.marks;
    row.total += entry.total;
    rows.set(entry.chapterId, row);
  }
  return new Map([...rows.entries()].map(([id, row]) => [id, { ...row, percent: row.total ? Math.round(row.marks / row.total * 100) : 0 }]));
}

/** Weakness reason codes that already come from `weakChapters`, split into label + weight. */
function reasonSignals(item: WeakChapter): WeaknessSignal[] {
  return item.reasons.map(reason => {
    if (reason.startsWith('MCQ')) {
      const percent = Number(reason.replace(/[^\d]/g, '')) || 0;
      return { label: reason, labelEn: reason.replace('MCQ নির্ভুলতা', 'MCQ accuracy'), weight: percent < 50 ? 4 : 2 };
    }
    if (reason.startsWith('CQ')) {
      return { label: reason, labelEn: reason.replace('CQ নম্বর', 'CQ marks'), weight: 3 };
    }
    if (reason === 'নিজের মূল্যায়নে দুর্বল') return { label: reason, labelEn: 'You rated it weak', weight: 4 };
    return { label: reason, labelEn: 'Flagged as weak', weight: 3 };
  });
}

export function weaknessReport(plan: Day[], data: AppData, today: string): WeaknessRow[] {
  const base = new Map(weakChapters(plan, data).map(item => [item.chapterId, item]));
  const accuracy = chapterAccuracy(data);
  const cq = chapterCqMarks(data);
  const retries = retryBuckets(data, today);
  const retryDueByChapter = new Map<string, number>();
  for (const item of retries.due) {
    if (item.chapterId) retryDueByChapter.set(item.chapterId, (retryDueByChapter.get(item.chapterId) || 0) + 1);
  }
  const examAccuracy = new Map<string, number>();
  for (const row of examChapterAccuracy(data.examSessions)) {
    if (row.chapterId && row.total) examAccuracy.set(row.chapterId, row.percent);
  }

  const rows: WeaknessRow[] = [];
  for (const chapter of sortChapters([...CHAPTERS])) {
    const signals: WeaknessSignal[] = [];
    const fromBase = base.get(chapter.id);
    if (fromBase) signals.push(...reasonSignals(fromBase));

    const mcq = accuracy.get(chapter.id);
    if (mcq && mcq.total >= MCQ_MIN_SAMPLE && !signals.some(signal => signal.label.startsWith('MCQ'))) {
      if (mcq.accuracy < 70) {
        signals.push({ label: `MCQ ${mcq.accuracy}% · ${mcq.total}টি`, labelEn: `MCQ ${mcq.accuracy}% · ${mcq.total} attempts`, weight: mcq.accuracy < 50 ? 4 : 2 });
      }
    }
    const cqRow = cq.get(chapter.id);
    if (cqRow && cqRow.total >= CQ_MIN_SAMPLE && cqRow.percent < 65 && !signals.some(signal => signal.label.startsWith('CQ'))) {
      signals.push({ label: `CQ ${cqRow.percent}%`, labelEn: `CQ ${cqRow.percent}%`, weight: 2 });
    }
    const due = retryDueByChapter.get(chapter.id) || 0;
    if (due > 0) signals.push({ label: `${due}টি ভুল প্রশ্ন ফেরত বাকি`, labelEn: `${due} retry question(s) due`, weight: 3 + Math.min(due, 4) });
    const exam = examAccuracy.get(chapter.id);
    if (exam !== undefined && exam < 60) signals.push({ label: `পরীক্ষায় ${exam}%`, labelEn: `Exam ${exam}%`, weight: 3 });
    // A chapter that is still unread cannot be "weak" in a quiz sense, but it is still the
    // biggest score risk in July — surface it last, never first.
    const stage = chapterStage(chapter, data, plan);
    const stagePercent = stage === 'notStarted' ? 0 : stage === 'fullyRevised' ? 100 : stage === 'completed' || stage === 'revisionNeeded' ? 60 : 40;
    if (stage === 'notStarted' && data.chapterMeta[chapter.id]?.priority === 'A' && !signals.length) {
      signals.push({ label: 'A-অধ্যায়, এখনো শুরু হয়নি', labelEn: 'Priority A, not started', weight: 1 });
    }
    if (!signals.length) continue;

    const score = signals.reduce((sum, signal) => sum + signal.weight, 0) + (chapter.priority === 'A' ? 2 : chapter.priority === 'B' ? 1 : 0);
    const action: WeaknessRow['action'] = due > 0 ? 'retry'
      : mcq && mcq.accuracy < 70 && mcq.total >= MCQ_MIN_SAMPLE ? 'practice'
        : stage === 'notStarted' ? 'study' : 'revise';
    const actionLabels: Record<WeaknessRow['action'], [string, string]> = {
      retry: ['ভুল প্রশ্নের পরীক্ষা', 'Retry the wrong questions'],
      practice: ['MCQ অনুশীলন', 'Practise MCQ'],
      study: ['অধ্যায় খুলে পড়া', 'Open the chapter'],
      revise: ['রিভিশন কার্ড', 'Revision card'],
    };
    rows.push({
      chapterId: chapter.id,
      subject: chapter.subject,
      chapter,
      priority: chapter.priority,
      score,
      signals,
      stagePercent,
      action,
      actionLabel: actionLabels[action][0],
      actionLabelEn: actionLabels[action][1],
      dueRetries: due,
    });
  }
  return rows.sort((a, b) => b.score - a.score || a.chapter.id.localeCompare(b.chapter.id));
}

export interface WeaknessSummary {
  total: number;
  critical: WeaknessRow[];
  bySubject: { subject: SubjectId; count: number; averageScore: number }[];
  /** The three chapters worth touching today, in order. */
  focus: WeaknessRow[];
  dueRetries: number;
}

export function weaknessSummary(plan: Day[], data: AppData, today: string): WeaknessSummary {
  const rows = weaknessReport(plan, data, today);
  const bySubjectMap = new Map<SubjectId, number[]>();
  for (const row of rows) {
    const list = bySubjectMap.get(row.subject) || [];
    list.push(row.score);
    bySubjectMap.set(row.subject, list);
  }
  return {
    total: rows.length,
    critical: rows.filter(row => row.score >= 8),
    bySubject: [...bySubjectMap.entries()]
      .map(([subject, scores]) => ({ subject, count: scores.length, averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
      .sort((a, b) => b.count - a.count || b.averageScore - a.averageScore),
    focus: rows.slice(0, 3),
    dueRetries: rows.reduce((sum, row) => sum + row.dueRetries, 0),
  };
}

/**
 * A student saying "I know, I'll practise this" keeps the chapter on the list but
 * records the promise date, so the report can show when it was last acknowledged.
 */
export function markWeaknessPracticed(data: AppData, chapterId: string, today: string): AppData {
  const current = data.chapterMeta[chapterId];
  return {
    ...data,
    chapterMeta: {
      ...data.chapterMeta,
      [chapterId]: { ...current, note: current?.note ?? '', weak: true, cq: current?.cq ?? 'practicing', mcq: current?.mcq ?? 'practicing', updatedAt: `${today}T00:00:00.000Z` },
    },
  };
}

/** Re-sorts a chapter's next revision card to tomorrow — the "study this now" action. */
export function pullRevisionForward(data: AppData, chapterId: string, today: string): AppData {
  const dueDate = addDays(today, 1);
  let changed = false;
  const revisions = data.revisions.map(item => {
    if (item.chapterId !== chapterId || item.completedAt || item.dueDate <= dueDate) return item;
    changed = true;
    return { ...item, dueDate, adjusted: true };
  });
  return changed ? { ...data, revisions } : data;
}

/** A dated plan of which weak chapter to attack on which day. */
export interface WeaknessDayPlan { date: string; rows: WeaknessRow[] }

export function weaknessWeekPlan(plan: Day[], data: AppData, today: string, perDay = 2): WeaknessDayPlan[] {
  const rows = weaknessReport(plan, data, today).filter(row => row.action !== 'study');
  const days: WeaknessDayPlan[] = [];
  let cursor = 0;
  for (let day = 0; day < 7 && cursor < rows.length; day++) {
    const date = addDays(today, day);
    const batch = rows.slice(cursor, cursor + perDay);
    cursor += perDay;
    days.push({ date, rows: batch });
  }
  return days;
}

/** Days since a chapter was last touched, or null when it never was. */
export function daysSinceTouched(data: AppData, chapterId: string, today: string): number | null {
  const meta = data.chapterMeta[chapterId];
  const stamp = meta?.updatedAt?.slice(0, 10) || data.completed[`${chapterId}-reading`]?.slice(0, 10);
  if (!stamp) return null;
  return Math.max(0, diffDays(stamp, today));
}
