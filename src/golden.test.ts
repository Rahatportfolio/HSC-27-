import { describe, expect, it } from 'vitest';
import { SUBJECTS, SUBJECT_FULL_MARKS } from './data';
import type { SubjectId } from './data';
import { calculateGpa, gradeFor } from './gpa';
import { A_PLUS_MIN, GPA5_POINTS, biggestBlocker, goldenPlan, markGapLabel, whatIf } from './golden';
import type { SubjectMarks } from './types';

/** Builds marks from percentages so a test never hardcodes a raw mark by accident. */
function marksFrom(percents: Partial<Record<SubjectId, number>>): SubjectMarks {
  const marks: SubjectMarks = {};
  for (const subject of SUBJECTS) {
    const value = percents[subject.id];
    if (value !== undefined) marks[subject.id] = Math.round(SUBJECT_FULL_MARKS[subject.id] * value / 100);
  }
  return marks;
}

const all = (percent: number) => marksFrom({
  physics: percent, chemistry: percent, biology: percent, math: percent, bangla: percent, english: percent, ict: percent,
});

describe('the Golden A+ plan is arithmetic on the real rule, not a forecast', () => {
  it('reports no GPA at all until every compulsory subject has marks', () => {
    const plan = goldenPlan(marksFrom({ physics: 90, chemistry: 90 }));
    expect(plan.complete).toBe(false);
    expect(plan.gpa).toBeNull();
    expect(plan.gpaFive).toBe(false);
    expect(plan.missing.length).toBeGreaterThan(0);
    // The verdict must say what is missing instead of implying success.
    expect(plan.verdictBn).toMatch(/বাকি/);
  });

  it('agrees with calculateGpa for every mark it reports', () => {
    const marks = marksFrom({ physics: 84, chemistry: 79, biology: 91, math: 88, bangla: 63, english: 74, ict: 82 });
    expect(goldenPlan(marks).gpa).toBe(calculateGpa(marks).gpa);
  });

  it('shows Golden A+ only when all seven subjects are at 80% or more', () => {
    expect(goldenPlan(all(80)).golden).toBe(true);
    expect(goldenPlan(all(79)).golden).toBe(false);
  });

  it('counts the exact marks still missing for Golden A+, using the 80% line', () => {
    const plan = goldenPlan(marksFrom({ physics: 70, chemistry: 80, biology: 80, math: 80, bangla: 80, english: 80, ict: 80 }));
    // Physics full marks are 200, so 70% = 140 and 80% = 160: exactly 20 marks short.
    const physics = plan.rows.find(row => row.subject === 'physics')!;
    expect(physics.toAPlus).toBe(Math.ceil(SUBJECT_FULL_MARKS.physics * A_PLUS_MIN / 100) - 140);
    expect(plan.marksToGolden).toBe(physics.toAPlus);
  });

  it('counts a subject with no marks as fully outstanding, not as done', () => {
    const plan = goldenPlan(marksFrom({ physics: 80, chemistry: 80, biology: 80, math: 80, bangla: 80, english: 80 }));
    const ict = plan.rows.find(row => row.subject === 'ict')!;
    expect(ict.obtained).toBeNull();
    expect(plan.marksToGolden).toBe(SUBJECT_FULL_MARKS.ict);
    expect(plan.golden).toBe(false);
  });

  it('reports the deficit budget the 4th-subject bonus really allows', () => {
    // All A+ including the optional subject: 30 + 3 bonus points, so exactly GPA 5.00.
    const plan = goldenPlan(all(80));
    expect(plan.compulsoryPoints).toBe(GPA5_POINTS);
    expect(plan.bonus).toBe(3);
    expect(plan.deficitBudget).toBe(3);
    expect(plan.gpa).toBe(5);
  });

  it('lets one compulsory subject sit at A while GPA 5.00 still holds', () => {
    // Physics at 74% is an A (4 points). The A+ 4th subject brings 3 bonus points, so a
    // single lost point is covered: this is the real board rule, not a lenient one.
    const marks = marksFrom({ physics: 74, chemistry: 85, biology: 85, math: 85, bangla: 85, english: 85, ict: 85 });
    const plan = goldenPlan(marks);
    expect(plan.gpaFive).toBe(true);
    expect(plan.golden).toBe(false);
    // One point is already spent, so two remain.
    expect(plan.deficitBudget).toBe(2);
    expect(calculateGpa(marks).gpa).toBe(5);
  });

  it('still holds GPA 5.00 with two A grades, because the bonus covers three points', () => {
    const marks = marksFrom({ physics: 74, chemistry: 74, biology: 85, math: 85, bangla: 85, english: 85, ict: 85 });
    const plan = goldenPlan(marks);
    expect(plan.deficitBudget).toBe(1);
    expect(plan.gpaFive).toBe(true);
    expect(calculateGpa(marks).gpa).toBe(5);
  });

  it('drops below GPA 5.00 once more than three points are lost', () => {
    // Physics at B (3 points) loses two, chemistry at A- (3.5) loses one and a half.
    const marks = marksFrom({ physics: 50, chemistry: 62, biology: 85, math: 85, bangla: 85, english: 85, ict: 85 });
    const plan = goldenPlan(marks);
    expect(plan.gpaFive).toBe(false);
    expect(plan.gpa!).toBeLessThan(5);
    expect(plan.deficitBudget).toBeLessThan(0);
    expect(calculateGpa(marks).gpa).toBe(plan.gpa);
  });

  it('never claims a budget larger than the 4th-subject bonus can give', () => {
    // The bonus is max(0, point − 2) and the best point is 5, so 3 is the hard ceiling.
    expect(goldenPlan(all(100)).deficitBudget).toBe(3);
    expect(goldenPlan(all(90)).deficitBudget).toBe(3);
  });

  it('treats a failing subject as GPA 0 and says so', () => {
    const marks = marksFrom({ physics: 20, chemistry: 90, biology: 90, math: 90, bangla: 90, english: 90, ict: 90 });
    const plan = goldenPlan(marks);
    expect(plan.gpa).toBe(0);
    expect(plan.gpaFive).toBe(false);
    expect(plan.verdictBn).toMatch(/F/);
    expect(calculateGpa(marks).failed).toBe(true);
  });

  it('caps the GPA at 5.00 instead of showing 5.5', () => {
    const plan = goldenPlan(all(90));
    expect(plan.gpa).toBe(5);
    expect(calculateGpa(all(90)).gpa).toBe(5);
  });

  it('orders the hardest subjects first by percentage, not by raw marks', () => {
    const plan = goldenPlan(marksFrom({ physics: 60, chemistry: 90, biology: 90, math: 90, bangla: 90, english: 90, ict: 50 }));
    // ICT is 100 full marks, so 50% there is worse than 60% in physics.
    expect(plan.hardest[0]).toBe('ict');
  });
});

describe('what-if uses the same rule, never a second estimate', () => {
  it('matches calculateGpa exactly for the changed marks', () => {
    const base = marksFrom({ physics: 70, chemistry: 85, biology: 85, math: 85, bangla: 85, english: 85, ict: 85 });
    const trial = whatIf(base, 'physics', 160);
    const expected = calculateGpa({ ...base, physics: 160 });
    expect(trial.gpa).toBe(expected.gpa);
  });

  it('states the grade the candidate mark itself earns', () => {
    const base = all(80);
    expect(whatIf(base, 'physics', 160).grade).toBe('A+');
    expect(whatIf(base, 'physics', 140).grade).toBe('A');
    expect(whatIf(base, 'physics', 100).grade).toBe('B');
  });

  it('never accepts a mark outside the subject total', () => {
    const base = all(80);
    expect(whatIf(base, 'ict', 500).gpa).toBe(whatIf(base, 'ict', SUBJECT_FULL_MARKS.ict).gpa);
    expect(whatIf(base, 'ict', -20).gpa).toBe(whatIf(base, 'ict', 0).gpa);
  });
});

describe('the plan names the subject to fix, and admits when there is none', () => {
  it('points at the lowest graded compulsory subject when GPA 5.00 is not secured', () => {
    const marks = marksFrom({ physics: 50, chemistry: 62, biology: 85, math: 85, bangla: 85, english: 85, ict: 85 });
    expect(goldenPlan(marks).gpaFive).toBe(false);
    expect(biggestBlocker(goldenPlan(marks))).toBe('physics');
  });

  it('does not blame a subject when the bonus already covers its lost point', () => {
    const marks = marksFrom({ physics: 74, chemistry: 85, biology: 85, math: 85, bangla: 85, english: 85, ict: 85 });
    expect(biggestBlocker(goldenPlan(marks))).toBeNull();
  });

  it('returns null once GPA 5.00 is secure', () => {
    expect(biggestBlocker(goldenPlan(all(85)))).toBeNull();
  });

  it('points at a missing subject instead of silently ignoring it', () => {
    const plan = goldenPlan(marksFrom({ physics: 90 }));
    expect(biggestBlocker(plan)).toBe(plan.missing[0]);
  });
});

describe('mark-gap labels are presentation, never a grade input', () => {
  it.each([[0, '0'], [20, '20'], [.5, '0.5'], [160 - 159.99, '≈0.01'], [.014, '≈0.01'], [.000001, '<0.01']] as const)('formats %s as %s', (gap, expected) => {
    expect(markGapLabel(gap)).toBe(expected);
  });

  it.each([NaN, Infinity, -1])('never presents invalid gap %s as a mark', gap => {
    expect(markGapLabel(gap)).toBe('—');
  });

  it('does not promote a near-boundary raw mark when its displayed gap rounds', () => {
    const marks = { ...all(85), physics: 159.999999 };
    const plan = goldenPlan(marks, 'golden');
    const row = plan.rows.find(row => row.subject === 'physics')!;
    expect(row.grade).toBe('A'); expect(plan.golden).toBe(false);
    expect(markGapLabel(row.toAPlus!)).toBe('<0.01');
    expect(plan.verdictEn).toContain('<0.01 marks short');
    expect(marks.physics).toBe(159.999999);
  });
});

describe('grade boundaries come from one shared table', () => {
  it('keeps A+ at the documented 80% line', () => {
    expect(gradeFor(A_PLUS_MIN).grade).toBe('A+');
    expect(gradeFor(A_PLUS_MIN - 0.5).grade).toBe('A');
  });
});
