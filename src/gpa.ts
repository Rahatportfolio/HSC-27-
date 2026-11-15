import { FOURTH_SUBJECT, SUBJECTS, SUBJECT_FULL_MARKS, subjectById } from './data';
import type { SubjectId } from './data';
import type { SubjectMarks } from './types';

export type Grade = 'A+' | 'A' | 'A-' | 'B' | 'C' | 'D' | 'F';
export interface GradeRule { grade: Grade; point: number; min: number }

/** HSC letter grades by percentage of a subject's combined marks. */
export const GRADE_SCALE: GradeRule[] = [
  { grade: 'A+', point: 5, min: 80 },
  { grade: 'A', point: 4, min: 70 },
  { grade: 'A-', point: 3.5, min: 60 },
  { grade: 'B', point: 3, min: 50 },
  { grade: 'C', point: 2, min: 40 },
  { grade: 'D', point: 1, min: 33 },
  { grade: 'F', point: 0, min: 0 },
];
export function gradeFor(percentage: number): GradeRule {
  const safe = Math.max(0, Math.min(100, percentage));
  return GRADE_SCALE.find(rule => safe >= rule.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
}
export interface SubjectResult {
  subject: SubjectId;
  full: number;
  obtained: number | null;
  percentage: number | null;
  grade: Grade | null;
  point: number | null;
  optional: boolean;
}
export interface GpaResult {
  rows: SubjectResult[];
  /** GPA of the six compulsory subjects, with the optional subject's bonus applied. */
  gpa: number | null;
  complete: boolean;
  golden: boolean;
  failed: boolean;
  missing: SubjectId[];
  bonus: number;
  totalObtained: number;
  totalFull: number;
}
/**
 * HSC GPA: six compulsory subjects + 4th subject bonus.
 * GPA = (sum of six grade points + max(0, optional point - 2)) / 6, capped at 5.00.
 * Any F makes the GPA 0.00. Golden A+ means A+ in every subject.
 */
export function calculateGpa(marks: SubjectMarks): GpaResult {
  const compulsory = SUBJECTS.filter(subject => !subject.optional);
  const optional = SUBJECTS.find(subject => subject.optional) || subjectById[FOURTH_SUBJECT];
  const rows: SubjectResult[] = [...compulsory, optional].map(subject => {
    const full = SUBJECT_FULL_MARKS[subject.id];
    const raw = marks[subject.id];
    const obtained = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(full, raw)) : null;
    const percentage = obtained === null ? null : Math.round(obtained / full * 10000) / 100;
    const rule = percentage === null ? null : gradeFor(percentage);
    return { subject: subject.id, full, obtained, percentage, grade: rule?.grade ?? null, point: rule?.point ?? null, optional: !!subject.optional };
  });
  const mainRows = rows.filter(row => !row.optional);
  const optionalRow = rows.find(row => row.optional)!;
  const missing = mainRows.filter(row => row.obtained === null).map(row => row.subject);
  const complete = missing.length === 0;
  const mainPoints = mainRows.reduce((sum, row) => sum + (row.point ?? 0), 0);
  const bonus = optionalRow.point !== null ? Math.max(0, optionalRow.point - 2) : 0;
  const failed = rows.some(row => row.point === 0);
  const gpa = complete ? Math.min(5, Math.max(0, Number(((mainPoints + bonus) / 6).toFixed(2)))) : null;
  const golden = complete && rows.every(row => row.point === 5);
  const totalObtained = rows.reduce((sum, row) => sum + (row.obtained ?? 0), 0);
  const totalFull = rows.reduce((sum, row) => sum + row.full, 0);
  return { rows, gpa: failed ? 0 : gpa, complete, golden: golden && !failed, failed, missing, bonus, totalObtained, totalFull };
}
export function gpaTargetLabel(gpa: number | null, golden: boolean): string {
  if (gpa === null) return 'নম্বর যোগ করলে GPA দেখা যাবে';
  if (golden) return 'Golden A+ এর পথে';
  if (gpa >= 5) return 'GPA 5.00 — চমৎকার';
  if (gpa >= 4.5) return 'GPA ৫-এর খুব কাছে';
  return 'যেখানে ঘাটতি, সেটাই পরের লক্ষ্য';
}
