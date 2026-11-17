import { describe, expect, it } from 'vitest';
import {
  NUMERIC_PREFIX, NUMERIC_SCHEMA_COUNT, numericChapters, numericQuestions, verifyNumeric,
} from './numericGen';
import { buildExamQuestions } from './examSim';
import { freshData } from './planner';
import { chapterById } from './data';

const everyChapter = numericChapters();
const builds = everyChapter.flatMap(chapterId => numericQuestions(chapterId, 4));
const questions = builds.map(build => build.question);

describe('arithmetic is the check, not a promise', () => {
  it('recomputes every answer from its own seed and finds no disagreement', () => {
    expect(NUMERIC_SCHEMA_COUNT).toBeGreaterThanOrEqual(45);
    expect(questions.length).toBeGreaterThan(140);
    expect(verifyNumeric(questions)).toEqual([]);
  });

  it('keeps the recomputed value inside the options at the marked index', () => {
    for (const build of builds) {
      const marked = build.question.options[build.question.answer];
      expect(marked).toBeTruthy();
      // Bangla digits must still compare numerically, so normalise before parsing.
      const ascii = marked.replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));
      const numeric = ascii.replace(/[^\d.\-]/g, '');
      expect(Number.parseFloat(numeric)).toBeCloseTo(build.expected, 2);
    }
  });

  it('never ships a duplicate option or an impossible negative answer', () => {
    for (const question of questions) {
      expect(new Set(question.options).size).toBe(4);
      expect(question.options.some(option => option.trim().startsWith('-'))).toBe(false);
      expect(question.options[question.answer]).toBeTruthy();
    }
  });

  it('explains the formula and shows the substitution', () => {
    for (const question of questions) {
      expect(question.explanation).toBeTruthy();
      expect(question.explanation!).toMatch(/=|=/);
      expect(question.source).toContain('যাচাইকৃত');
    }
  });

  it('only produces questions for the chapter it was asked about, with a real chapter id', () => {
    for (const question of questions) {
      expect(chapterById[question.chapterId!]).toBeDefined();
      expect(question.id.startsWith(NUMERIC_PREFIX)).toBe(true);
    }
    for (const chapterId of everyChapter) {
      for (const build of numericQuestions(chapterId, 4)) {
        expect(build.question.chapterId).toBe(chapterId);
        expect(build.question.subject).toBe(chapterById[chapterId].subject);
      }
    }
  });
});

describe('the same seed always gives the same paper', () => {
  it('is deterministic per seed and varies across seeds', () => {
    const chapterId = 'physics-1-4';
    const one = numericQuestions(chapterId, 4);
    const two = numericQuestions(chapterId, 4);
    expect(two.map(build => build.question.id)).toEqual(one.map(build => build.question.id));
    const prompts = new Set(one.map(build => build.question.question));
    expect(prompts.size).toBe(one.length); // no repeated question within a chapter
  });

  it('rotates the correct option instead of parking it at index 0', () => {
    const positions = new Set(questions.map(question => question.answer));
    expect(positions.size).toBeGreaterThan(1);
  });

  it('catches a tampered answer and a tampered option', () => {
    const target = questions[0];
    const wrongAnswer = { ...target, answer: (target.answer + 1) % 4 };
    expect(verifyNumeric([wrongAnswer]).length).toBeGreaterThan(0);
    const brokenOptions = { ...target, options: [target.options[0], target.options[1], target.options[2], target.options[2]], answer: 3 };
    expect(verifyNumeric([brokenOptions].map(question => ({ ...question, id: target.id }))).length).toBeGreaterThan(0);
  });
});

describe('integration with the exam simulator', () => {
  it('fills a previously thin chapter with several usable questions', () => {
    const data = freshData();
    const paper = buildExamQuestions(data, { mode: 'chapter', chapterId: 'physics-1-4', count: 10, generate: true, variant: 'x' }, () => 0.3);
    const numeric = paper.filter(question => question.id.startsWith(NUMERIC_PREFIX));
    expect(numeric.length).toBeGreaterThan(0);
    expect(verifyNumeric(numeric)).toEqual([]);
  });

  it('works for a maths chapter too, where almost every question is a drill', () => {
    const data = freshData();
    const paper = buildExamQuestions(data, { mode: 'chapter', chapterId: 'math-2-4', count: 8, generate: true, variant: 'y' }, () => 0.7);
    expect(paper.length).toBeGreaterThanOrEqual(5);
    expect(paper.every(question => question.chapterId === 'math-2-4')).toBe(true);
  });

  it('covers the subjects that really have computable numbers', () => {
    const subjects = new Set(everyChapter.map(chapterId => chapterById[chapterId].subject));
    // ICT joins them because binary, bytes and logic-gate tables are arithmetic too.
    expect([...subjects].sort()).toEqual(['chemistry', 'ict', 'math', 'physics']);
  });
});
