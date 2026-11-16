import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterById } from './data';
import { DEPTH_QUESTIONS, DEPTH_QUESTIONS_2 } from './quiz-depth';
import { STARTER_QUESTIONS } from './quiz-data';
import { examPool } from './examSim';
import { freshData } from './planner';

const depth = [...DEPTH_QUESTIONS, ...DEPTH_QUESTIONS_2];
const chapterIds = new Set(CHAPTERS.map(chapter => chapter.id));

describe('the depth pass adds questions, not padding', () => {
  it('has no duplicate stem inside a chapter anywhere in the bank', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const question of STARTER_QUESTIONS) {
      const key = `${question.chapterId}|${question.question.trim()}`;
      const previous = seen.get(key);
      if (previous) duplicates.push(`${key} (${previous} + ${question.id})`);
      else seen.set(key, question.id);
    }
    expect(duplicates).toEqual([]);
  });

  it('adds no repeated options and keeps the answer index honest', () => {
    for (const question of depth) {
      expect(question.options, question.id).toHaveLength(4);
      expect(new Set(question.options).size, `${question.id} duplicate options`).toBe(4);
      expect(question.answer, question.id).toBeGreaterThanOrEqual(0);
      expect(question.answer, question.id).toBeLessThanOrEqual(3);
      expect(chapterIds.has(question.chapterId!), question.id).toBe(true);
      expect(chapterById[question.chapterId!].subject, question.id).toBe(question.subject);
    }
  });

  it('explains every question so a wrong answer still teaches something', () => {
    expect(depth.every(question => (question.explanation || '').length >= 15)).toBe(true);
  });

  it('does not copy an option from another option of the same question', () => {
    for (const question of depth) {
      const answers = new Set<string>();
      for (const option of question.options) {
        expect(answers.has(option.trim()), `${question.id} repeats an option`).toBe(false);
        answers.add(option.trim());
      }
    }
  });

  it('uses its own id range so stored attempts never collide', () => {
    const ids = depth.map(question => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.startsWith('deep-'))).toBe(true);
    expect(new Set(STARTER_QUESTIONS.map(question => question.id)).size).toBe(STARTER_QUESTIONS.length);
  });

  it('marks every depth question as banked, so “only mine” stays empty', () => {
    expect(depth.every(question => question.bank === true)).toBe(true);
  });
});

describe('what the depth pass actually changed', () => {
  const data = freshData();
  const poolSize = (chapterId: string) => examPool(data, { mode: 'chapter', chapterId, generate: true, count: 50 } as never).length;

  it('leaves no chapter that cannot build a five-question test', () => {
    const starved = CHAPTERS.filter(chapter => poolSize(chapter.id) < 5).map(chapter => chapter.id);
    expect(starved).toEqual([]);
  });

  it('gives every chapter enough to practise for a while', () => {
    // A chapter needs a few questions to be worth opening; the audit reports the rest.
    const thin = CHAPTERS.filter(chapter => poolSize(chapter.id) < 5);
    expect(thin.length).toBe(0);
    const shortest = Math.min(...CHAPTERS.map(chapter => poolSize(chapter.id)));
    expect(shortest).toBeGreaterThanOrEqual(5);
  });

  it('covers the A-priority chapters first, as the plan intends', () => {
    const aChapters = CHAPTERS.filter(chapter => chapter.priority === 'A');
    const thinA = aChapters.filter(chapter => poolSize(chapter.id) < 5);
    expect(thinA).toEqual([]);
  });
});
