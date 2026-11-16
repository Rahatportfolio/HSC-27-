import { describe, expect, it } from 'vitest';
import { CHAPTERS, SUBJECTS, chapterById } from './data';
import { STARTER_QUESTIONS } from './quiz-data';
import { BANK_QUESTIONS } from './quiz-bank';

const chapterIds = new Set(CHAPTERS.map(chapter => chapter.id));

describe('starter MCQ bank', () => {
  it('has grown well past the first sample', () => {
    expect(STARTER_QUESTIONS.length).toBeGreaterThanOrEqual(400);
    expect(BANK_QUESTIONS.length).toBeGreaterThanOrEqual(350);
  });

  it('uses unique ids and marks every shipped question as banked', () => {
    const ids = STARTER_QUESTIONS.map(question => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The "only my questions" filter reads `bank`, not an id prefix, so adding a new
    // bank range can never make a shipped question look like the student's own.
    expect(STARTER_QUESTIONS.every(question => question.bank === true)).toBe(true);
  });

  it('points every question at a real chapter of the same subject', () => {
    for (const question of STARTER_QUESTIONS) {
      expect(chapterIds.has(question.chapterId || ''), `${question.id} → ${question.chapterId}`).toBe(true);
      expect(chapterById[question.chapterId!].subject, `${question.id} subject`).toBe(question.subject);
    }
  });

  it('keeps four distinct options with the answer inside range', () => {
    for (const question of STARTER_QUESTIONS) {
      expect(question.options, question.id).toHaveLength(4);
      expect(question.options.every(option => option.trim().length > 0), question.id).toBe(true);
      expect(new Set(question.options).size, `${question.id} duplicate options`).toBe(4);
      expect(question.answer, question.id).toBeGreaterThanOrEqual(0);
      expect(question.answer, question.id).toBeLessThanOrEqual(3);
      expect(question.question.trim(), question.id).not.toHaveLength(0);
    }
  });

  it('covers every subject and both papers of the science group', () => {
    for (const subject of SUBJECTS) {
      const count = STARTER_QUESTIONS.filter(question => question.subject === subject.id).length;
      expect(count, subject.id).toBeGreaterThanOrEqual(20);
    }
    const chaptersWithQuestions = new Set(STARTER_QUESTIONS.map(question => question.chapterId));
    expect(chaptersWithQuestions.size).toBe(CHAPTERS.length); // every one of the 114 chapters has MCQs
  });

  it('explains the trickier additions so a wrong answer still teaches something', () => {
    const explained = BANK_QUESTIONS.filter(question => (question.explanation || '').trim().length > 0).length;
    expect(explained).toBeGreaterThanOrEqual(25);
  });
});
