import { describe, expect, it } from 'vitest';
import { freshData } from './planner';
import { parseBackup } from './storage';
import { createFlashcard, editFlashcard, reviewFlashcard, reviewedToday } from './flashcards';
import { calculateGpa, GRADE_SCALE } from './gpa';
import { goldenPlan } from './golden';
import { SUBJECTS, SUBJECT_FULL_MARKS } from './data';

const cardInput = { subject: 'physics' as const, chapterId: 'physics-1-7', front: 'What is elasticity?', back: 'Recovery after deforming force is removed.', category: 'definition' as const };
const excellent = { physics: 160, chemistry: 160, biology: 160, bangla: 160, english: 160, ict: 80, math: 160 };

describe('A–Z flashcard and backup integrity', () => {
  it.each(['again', 'hard', 'good', 'easy'] as const)('round-trips the entire profile after a %s review', rating => {
    const original = createFlashcard(freshData(), cardInput);
    original.notes['2026-11-19'] = 'Actual study history must survive reload';
    original.completed['past-real-task'] = '2026-11-19T07:30:00Z';
    const reviewed = reviewFlashcard(original, original.flashcards[0].id, rating, '2026-11-20').data;
    const restored = parseBackup(JSON.stringify(reviewed));
    expect(restored.flashcards).toEqual(reviewed.flashcards);
    expect(restored.notes).toEqual(original.notes);
    expect(restored.completed).toEqual(original.completed);
    expect(reviewedToday(restored, '2026-11-20')).toHaveLength(1);
  });

  it('preserves legacy review timestamps and counts their Bangladesh day', () => {
    const data = createFlashcard(freshData(), cardInput);
    data.flashcards[0].lastReviewed = '2026-11-19T20:00:00Z';
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.flashcards[0].lastReviewed).toBe('2026-11-19T20:00:00Z');
    expect(reviewedToday(restored, '2026-11-20')).toHaveLength(1);
    expect(reviewedToday(restored, '2026-11-19')).toHaveLength(0);
  });

  it('rejects flashcard content that cannot survive the backup schema', () => {
    for (const patch of [{ front: '' }, { back: '   ' }, { front: 'x'.repeat(2001) }, { back: 'x'.repeat(5001) }, { chapterId: 'chemistry-1-2' }]) {
      const data = freshData();
      expect(createFlashcard(data, { ...cardInput, ...patch }), JSON.stringify(patch).slice(0, 50)).toBe(data);
    }
    const boundary = createFlashcard(freshData(), { ...cardInput, front: 'x'.repeat(2000), back: 'y'.repeat(5000) });
    expect(boundary.flashcards).toHaveLength(1);
    expect(parseBackup(JSON.stringify(boundary)).flashcards).toEqual(boundary.flashcards);
  });

  it('does not edit a valid flashcard into an un-restorable record', () => {
    const data = createFlashcard(freshData(), cardInput), id = data.flashcards[0].id;
    for (const patch of [{ front: ' ' }, { back: 'x'.repeat(5001) }, { subject: 'chemistry' as const }]) {
      expect(editFlashcard(data, id, patch)).toBe(data);
    }
    expect(parseBackup(JSON.stringify(editFlashcard(data, id, { back: 'New valid answer' }))).flashcards[0].back).toBe('New valid answer');
  });
});

describe('A–Z compulsory-versus-optional GPA arithmetic', () => {
  it('does not turn an optional F into an overall failure', () => {
    const result = calculateGpa({ ...excellent, math: 0 });
    expect(result.rows.find(row => row.optional)?.grade).toBe('F');
    expect(result.bonus).toBe(0);
    expect(result.failed).toBe(false);
    expect(result.gpa).toBe(5);
    expect(result.golden).toBe(false);
    const plan = goldenPlan({ ...excellent, math: 0 });
    expect(plan.gpaFive).toBe(true);
    expect(plan.reached).toBe(true);
    expect(plan.golden).toBe(false);
  });

  it('keeps the GPA unknown while compulsory marks are missing, even with a known F', () => {
    const result = calculateGpa({ physics: 0 });
    expect(result.failed).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.gpa).toBeNull();
    expect(goldenPlan({ physics: 0 }).gpa).toBeNull();
  });

  it('never promotes a mark just below a grade threshold by rounding the percentage', () => {
    for (const subject of SUBJECTS) for (const rule of GRADE_SCALE.filter(rule => rule.min > 0)) {
      const threshold = SUBJECT_FULL_MARKS[subject.id] * rule.min / 100;
      const below = calculateGpa({ ...excellent, [subject.id]: threshold - .001 }).rows.find(row => row.subject === subject.id)!;
      const exact = calculateGpa({ ...excellent, [subject.id]: threshold }).rows.find(row => row.subject === subject.id)!;
      expect(below.point, `${subject.id} just below ${rule.min}%`).toBeLessThan(rule.point);
      expect(exact.point).toBe(rule.point);
      expect(goldenPlan({ ...excellent, [subject.id]: threshold - .001 }).rows.find(row => row.subject === subject.id)?.grade).toBe(below.grade);
    }
  });

  it('agrees with an independent compulsory-plus-bonus reference over 1000 deterministic samples', () => {
    let seed = 27112026;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const points = (percentage: number): number => percentage >= 80 ? 5 : percentage >= 70 ? 4 : percentage >= 60 ? 3.5 : percentage >= 50 ? 3 : percentage >= 40 ? 2 : percentage >= 33 ? 1 : 0;
    for (let i = 0; i < 1000; i++) {
      const marks = Object.fromEntries(SUBJECTS.map(subject => [subject.id, Math.floor(random() * (SUBJECT_FULL_MARKS[subject.id] + 1))]));
      const main = SUBJECTS.filter(subject => !subject.optional).map(subject => points(marks[subject.id] / SUBJECT_FULL_MARKS[subject.id] * 100));
      const bonus = Math.max(0, points(marks.math / SUBJECT_FULL_MARKS.math * 100) - 2);
      const expected = main.includes(0) ? 0 : Math.min(5, Number(((main.reduce((sum, point) => sum + point, 0) + bonus) / 6).toFixed(2)));
      const actual = calculateGpa(marks);
      expect(actual.gpa, `sample ${i}`).toBe(expected);
      expect(actual.failed).toBe(main.includes(0));
      expect(goldenPlan(marks).gpa).toBe(expected);
    }
  });
});
