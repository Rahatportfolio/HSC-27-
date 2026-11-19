import { weekdayName } from './i18n';
import type { AppData } from './planner';
import { addDays, diffDays } from './planner';
import type { ExamCadence, ExamSession } from './types';
import { BUILTIN_QUESTION_META } from './questionBankIndex';

/**
 * The exam cadence: a daily short test, a weekly paper and a monthly full mock.
 *
 * Nothing is scheduled behind the student's back — each slot simply says whether it
 * is due, what it would ask, and how many days late it is. Taking a paper of that
 * cadence closes the slot, and the stored session remembers which slot it filled.
 */

export interface CadenceSpec {
  cadence: ExamCadence;
  label: string;
  labelEn: string;
  hint: string;
  hintEn: string;
  /** how many questions the slot asks for. */
  questions: number;
  /** the usual gap between papers. */
  everyDays: number;
}

export const CADENCE_SPECS: CadenceSpec[] = [
  { cadence: 'daily', label: 'দৈনিক ছোট পরীক্ষা', labelEn: 'Daily short test', hint: 'এক অধ্যায়ের ১০টি MCQ, ১০ মিনিট।', hintEn: 'Ten MCQs from one chapter, ten minutes.', questions: 10, everyDays: 1 },
  { cadence: 'weekly', label: 'সাপ্তাহিক পরীক্ষা', labelEn: 'Weekly paper', hint: 'এক বিষয়ের ২৫টি MCQ, ২৫ মিনিট।', hintEn: 'Twenty-five MCQs from one subject, twenty-five minutes.', questions: 25, everyDays: 7 },
  { cadence: 'monthly', label: 'মাসিক পূর্ণ মক', labelEn: 'Monthly full mock', hint: 'সব বিষয় মিলিয়ে ৫০টি MCQ, ৫০ মিনিট।', hintEn: 'Fifty mixed MCQs, fifty minutes.', questions: 50, everyDays: 30 },
];

/** Suggested weekly practice day, expressed as a JavaScript weekday (Sunday = 0).
 * Due cards still use elapsed days since the last paper, not a fixed board date. */
export const WEEKLY_TEST_WEEKDAY = 5;

export interface CadenceSlot extends CadenceSpec {
  lastDate: string | null;
  lastScore: number | null;
  /** how many days since the last paper of this cadence; null when never taken. */
  daysSince: number | null;
  due: boolean;
  /** days past due; 0 when due today or not due. */
  lateDays: number;
  /** how many papers of this cadence were taken in the last 30 days. */
  takenLast30: number;
}

/** Sessions that belong to a cadence: explicit cadence, else inferred from the paper shape. */
function cadenceOf(session: ExamSession): ExamCadence | null {
  if (session.cadence) return session.cadence;
  if (session.mode === 'full' && session.total >= 25) return 'monthly';
  if (session.mode === 'subject' && session.total >= 15) return 'weekly';
  if (session.mode === 'chapter' || session.mode === 'retry') return 'daily';
  return null;
}

export function cadenceSlots(data: AppData, today: string): CadenceSlot[] {
  return CADENCE_SPECS.map(spec => {
    const sessions = data.examSessions.filter(session => cadenceOf(session) === spec.cadence);
    const last = [...sessions].sort((a, b) => a.at.localeCompare(b.at)).at(-1) || null;
    const daysSince = last ? Math.max(0, diffDays(last.date, today)) : null;
    const due = daysSince === null ? true : daysSince >= spec.everyDays;
    return {
      ...spec,
      lastDate: last?.date ?? null,
      lastScore: last && last.total ? Math.round(last.score / last.total * 100) : null,
      daysSince,
      due,
      lateDays: due && daysSince !== null ? Math.max(0, daysSince - spec.everyDays) : 0,
      takenLast30: data.examSessions.filter(session => cadenceOf(session) === spec.cadence && session.date >= addDays(today, -30) && session.date <= today).length,
    };
  });
}

/**
 * Which chapter a daily short test should cover: a chapter the student has questions for,
 * preferring one already flagged weak, then the one with the deepest question bank.
 */
export function dailyTestChapter(data: AppData, weakChapterIds: string[] = []): string {
  const counts = new Map<string, number>();
  for (const question of [...BUILTIN_QUESTION_META, ...data.questions]) {
    if (question.chapterId) counts.set(question.chapterId, (counts.get(question.chapterId) || 0) + 1);
  }
  for (const chapterId of weakChapterIds) if (counts.has(chapterId)) return chapterId;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** The most urgent slot: monthly before weekly before daily, then the latest first. */
export function nextCadenceSlot(data: AppData, today: string): CadenceSlot | null {
  const order: Record<ExamCadence, number> = { monthly: 3, weekly: 2, daily: 1 };
  return cadenceSlots(data, today)
    .filter(slot => slot.due)
    .sort((a, b) => order[b.cadence] - order[a.cadence] || b.lateDays - a.lateDays)[0] ?? null;
}

/** A week view of the routine, Monday-first, with the Friday slot marked. */
export interface CadenceDay { date: string; weekday: string; cadence: ExamCadence | null; done: boolean }

export function cadenceWeek(data: AppData, today: string): CadenceDay[] {
  const start = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  // Same table as the rest of the app, so English mode does not get Bengali weekdays.
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map(day => weekdayName(day));
  const takenOn = new Map<string, ExamCadence>();
  for (const session of data.examSessions) {
    const cadence = cadenceOf(session);
    if (cadence && !takenOn.has(session.date)) takenOn.set(session.date, cadence);
  }
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    // A Monday-first array index is not a JavaScript weekday. Keep this
    // suggested calendar strip separate from the overdue-slot recommendation.
    const cadence = new Date(`${date}T00:00:00Z`).getUTCDay() === WEEKLY_TEST_WEEKDAY ? 'weekly' : 'daily';
    return {
      date,
      weekday: weekdays[index],
      cadence,
      done: takenOn.has(date),
    };
  });
}

export interface CadenceStats {
  taken7: number;
  taken30: number;
  average30: number;
  /** percentage of the last 30 days that had at least one paper. */
  consistency: number;
  bestCadence: ExamCadence | null;
}

export function cadenceStats(data: AppData, today: string): CadenceStats {
  const from7 = addDays(today, -6);
  const from30 = addDays(today, -29);
  const last30 = data.examSessions.filter(session => session.date >= from30 && session.date <= today && session.total > 0);
  const days = new Set(last30.map(session => session.date));
  const byCadence = new Map<ExamCadence, number[]>();
  for (const session of last30) {
    const cadence = cadenceOf(session);
    if (!cadence) continue;
    const list = byCadence.get(cadence) || [];
    list.push(session.score / session.total * 100);
    byCadence.set(cadence, list);
  }
  const best = [...byCadence.entries()]
    .map(([cadence, scores]) => ({ cadence, average: scores.reduce((a, b) => a + b, 0) / scores.length }))
    .sort((a, b) => b.average - a.average)[0];
  return {
    taken7: data.examSessions.filter(session => session.date >= from7 && session.date <= today).length,
    taken30: last30.length,
    average30: last30.length ? Math.round(last30.reduce((sum, session) => sum + session.score / session.total * 100, 0) / last30.length) : 0,
    consistency: Math.round(days.size / 30 * 100),
    bestCadence: best?.cadence ?? null,
  };
}

/** Marks a stored session as belonging to a cadence (used when a paper is started from a slot). */
export function withCadence(session: ExamSession, cadence: ExamCadence | undefined): ExamSession {
  if (!cadence) return session;
  return { ...session, cadence };
}

/**
 * Whether yesterday's daily test was skipped — the one nudge that keeps the habit.
 * Returns null until there is at least one paper, so a new user is not scolded.
 */
export function missedDaily(data: AppData, today: string): { date: string; days: number } | null {
  if (!data.examSessions.length) return null;
  const yesterday = addDays(today, -1);
  const taken = data.examSessions.some(session => session.date === yesterday && cadenceOf(session) === 'daily');
  if (taken) return null;
  const last = [...data.examSessions].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
  const gap = diffDays(last.date, today);
  return gap >= 2 ? { date: yesterday, days: gap } : null;
}
