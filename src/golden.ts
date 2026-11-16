import { SUBJECTS, SUBJECT_FULL_MARKS, subjectById } from './data';
import type { SubjectId } from './data';
import { calculateGpa, GRADE_SCALE, gradeFor } from './gpa';
import type { Grade } from './gpa';
import type { SubjectMarks } from './types';

/**
 * Golden A+ / GPA 5.00 arithmetic — deliberately not a prediction.
 *
 * The app cannot know next year's board marks, so it never estimates them. Everything
 * below is exact arithmetic on the official HSC rule that `gpa.ts` already encodes:
 * six compulsory subjects, a 4th-subject bonus of (point − 2), GPA capped at 5.00, and
 * any F collapsing the result to 0.00.
 *
 * What the student gets instead of a forecast:
 *  - the current grade point of every subject (exact, from entered marks),
 *  - the exact grade-point gap to GPA 5.00 and how many points may still be lost,
 *  - how many marks separate each subject from its *next* grade (concrete and checkable),
 *  - Golden A+ as a hard, unambiguous rule: 80% in every subject, and how far each is,
 *  - `whatIf`: change one subject's marks and see the GPA the rule produces.
 *
 * The one judgement call is stated in the UI: a "deficit budget" is shown because the
 * 4th-subject bonus is the only thing that lets a subject sit below A+ while GPA 5.00
 * still holds.
 */

export const A_PLUS_MIN = 80;
/** Six compulsory subjects must total this many grade points for GPA 5.00. */
export const GPA5_POINTS = 30;

export interface SubjectStanding {
  subject: SubjectId;
  optional: boolean;
  full: number;
  /** Marks entered, or null when the student has not entered any yet. */
  obtained: number | null;
  percentage: number | null;
  grade: Grade | null;
  point: number | null;
  /** Marks still needed to reach the next grade boundary (null at A+ or when unknown). */
  toNextGrade: number | null;
  nextGrade: Grade | null;
  /** Marks still needed to reach A+ (0 when already there, null when unknown). */
  toAPlus: number | null;
}

export interface GoldenPlan {
  /** The goal the arithmetic was solved for. */
  goal: 'gpa5' | 'golden';
  rows: SubjectStanding[];
  /** Compulsory subjects with no marks entered yet. */
  missing: SubjectId[];
  /** True when every compulsory subject has numbers entered. */
  complete: boolean;
  /** Grade points held by the six compulsory subjects. */
  compulsoryPoints: number;
  /** Bonus from the 4th subject: max(0, point − 2). */
  bonus: number;
  /** Points still missing to reach 30 (= GPA 5.00). 0 when already there. */
  pointsGap: number;
  /**
   * How many grade points may still be lost and keep GPA 5.00. With the optional
   * subject at A+ this is 3; without it, 0. Null while marks are missing.
   */
  deficitBudget: number | null;
  /** GPA the rule produces right now, or null while marks are missing. */
  gpa: number | null;
  /** True only when GPA 5.00 is already guaranteed by the entered marks. */
  gpaFive: boolean;
  /** True when every subject is already at A+ (80% or more). */
  golden: boolean;
  /** Sum of marks still needed for every subject to reach A+, over all subjects. */
  marksToGolden: number;
  /** Subjects furthest from A+, hardest first. */
  hardest: SubjectId[];
  /** True when the chosen goal is already satisfied by the marks entered. */
  reached: boolean;
  /** True only when the arithmetic can never succeed (cannot happen with the real scale). */
  blocked: boolean;
  /** One-line honest verdict, bilingual. */
  verdictBn: string;
  verdictEn: string;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const minMarkForGrade = (full: number, grade: Grade): number => Math.ceil(full * GRADE_SCALE.find(rule => rule.grade === grade)!.min / 100);

function standingFor(subjectId: SubjectId, optional: boolean, full: number, obtained: number | null): SubjectStanding {
  if (obtained === null) {
    return { subject: subjectId, optional, full, obtained: null, percentage: null, grade: null, point: null, toNextGrade: null, nextGrade: null, toAPlus: null };
  }
  const percentage = Math.round(obtained / full * 10000) / 100;
  const rule = gradeFor(percentage);
  const betterIndex = GRADE_SCALE.findIndex(entry => entry.grade === rule.grade) - 1;
  const better = betterIndex >= 0 ? GRADE_SCALE[betterIndex] : null;
  return {
    subject: subjectId,
    optional,
    full,
    obtained,
    percentage,
    grade: rule.grade,
    point: rule.point,
    nextGrade: better?.grade ?? null,
    toNextGrade: better ? Math.max(0, minMarkForGrade(full, better.grade) - obtained) : null,
    toAPlus: Math.max(0, minMarkForGrade(full, 'A+') - obtained),
  };
}

export function goldenPlan(marks: SubjectMarks, goal: GoldenPlan['goal'] = 'gpa5'): GoldenPlan {
  const rows = SUBJECTS.map(subject => {
    const full = SUBJECT_FULL_MARKS[subject.id];
    const raw = marks[subject.id];
    const obtained = typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, 0, full) : null;
    return standingFor(subject.id, !!subject.optional, full, obtained);
  });

  const compulsory = rows.filter(row => !row.optional);
  const optionalRow = rows.find(row => row.optional)!;
  const missing = compulsory.filter(row => row.obtained === null).map(row => row.subject);
  const complete = missing.length === 0;

  const compulsoryPoints = compulsory.reduce((sum, row) => sum + (row.point ?? 0), 0);
  const bonus = optionalRow.point === null ? 0 : Math.max(0, optionalRow.point - 2);
  const gpa = calculateGpa(marks).gpa;
  // Missing marks are unknown, not zero: the gap is only meaningful once everything is in.
  const pointsGap = complete ? Math.max(0, GPA5_POINTS - (compulsoryPoints + bonus)) : null;
  const deficitBudget = complete ? compulsoryPoints + bonus - GPA5_POINTS : null;
  const failed = rows.some(row => row.point === 0);

  const golden = complete && rows.every(row => row.point === 5);
  const gpaFive = complete && gpa !== null && gpa >= 5 && !failed;
  const marksToGolden = rows.reduce((sum, row) => sum + (row.toAPlus ?? row.full), 0);
  const hardest = [...rows]
    .filter(row => row.toAPlus === null || row.toAPlus > 0)
    .sort((a, b) => {
      const left = a.obtained === null ? 100 : (a.obtained / a.full) * 100;
      const right = b.obtained === null ? 100 : (b.obtained / b.full) * 100;
      return left - right;
    })
    .map(row => row.subject);

  const verdictBn = goal === 'golden'
    ? golden
      ? 'Golden A+ নিশ্চিত—সব বিষয়েই A+ আছে।'
      : `Golden A+-এর জন্য আর কিছু নম্বর দরকার—সব বিষয়ে ৮০% বা তার বেশি লাগবে।`
    : !complete
      ? `${missing.length}টি বিষয়ের নম্বর এখনো বাকি—সেগুলো যোগ করলেই সত্যিকারের হিসাব দেখা যাবে।`
      : gpaFive
        ? 'GPA 5.00 আছে—এখন Golden A+ ধরে রাখার পালা।'
        : failed
          ? 'কোনো এক বিষয়ে F থাকায় GPA ০—আগে সেটাই ঠিক করতে হবে।'
          : `GPA 5.00-এর জন্য আর কিছু গ্রেড পয়েন্ট দরকার।`;
  const verdictEn = goal === 'golden'
    ? golden
      ? 'Golden A+ is secure — every subject is already A+.'
      : `${marksToGolden} marks short of Golden A+ — every subject needs 80% or more.`
    : !complete
      ? `${missing.length} subject(s) still have no marks; the real arithmetic appears once they are in.`
      : gpaFive
        ? 'GPA 5.00 is already there — now hold Golden A+.'
        : failed
          ? 'An F in one subject forces GPA 0 — fix that first.'
          : `${pointsGap} more grade points are needed for GPA 5.00.`;

  // "Reached" is per goal: GPA 5.00 and Golden A+ are different bars, and the UI must
  // not tell a student GPA 5.00 is done when they asked about Golden A+.
  const reached = goal === 'golden' ? golden : gpaFive;
  // Nothing on the real table can make a goal arithmetically impossible, so `blocked`
  // stays false by construction — it exists so the UI never needs a fabricated case.
  const blocked = false;

  return {
    goal,
    rows,
    reached,
    blocked,
    missing,
    complete,
    compulsoryPoints,
    bonus,
    pointsGap: pointsGap ?? 0,
    deficitBudget,
    gpa,
    gpaFive,
    golden,
    marksToGolden,
    hardest,
    verdictBn,
    verdictEn,
  };
}

/**
 * "What if I score X in this subject?" — answered by the same rule, so the GPA shown is
 * exactly what `calculateGpa` produces, never a separate estimate.
 */
export function whatIf(marks: SubjectMarks, subject: SubjectId, candidate: number) {
  const full = SUBJECT_FULL_MARKS[subject];
  const next: SubjectMarks = { ...marks, [subject]: clamp(candidate, 0, full) };
  const result = calculateGpa(next);
  const plan = goldenPlan(next);
  return {
    gpa: result.gpa,
    rows: result.rows,
    golden: result.golden,
    keepsGpaFive: result.gpa !== null && result.gpa >= 5 && !result.failed,
    /** Grade the candidate mark itself earns. */
    grade: gradeFor(clamp(candidate, 0, full) / full * 100).grade,
    plan,
  };
}

/** Subject that most limits GPA 5.00 today, or null when nothing is missing. */
export function biggestBlocker(plan: GoldenPlan): SubjectId | null {
  if (!plan.complete) return plan.missing[0] ?? null;
  if (plan.gpaFive) return null;
  const belowA = plan.rows.filter(row => !row.optional && (row.point ?? 5) < 5);
  if (!belowA.length) return plan.rows.find(row => row.optional)?.subject ?? null;
  return belowA.sort((a, b) => (a.point ?? 0) - (b.point ?? 0))[0].subject;
}

/** Human name for a subject, used in the verdict lines and the UI. */
export const subjectName = (subject: SubjectId): string => subjectById[subject].name;
