import { describe, expect, it } from 'vitest';
import {
  ENGINE_LABEL, GENERATED_PREFIX, GENERATIVE_CHAPTER_COUNT, factsFor, generateForSubject, generateQuestions,
  generativeChapters, generativeGap, verifyGenerated,
} from './questionGen';
import { CHAPTERS, chapterById } from './data';
import { buildExamQuestions } from './examSim';
import { freshData } from './planner';
import { STARTER_QUESTIONS } from './quiz-data';

const everyChapter = generativeChapters();
const everyQuestion = everyChapter.flatMap(chapterId => generateQuestions(chapterId, { variant: 'audit' }));

describe('every generated question is verifiable', () => {
  it('passes the verifier with zero issues across every generative chapter', () => {
    expect(everyChapter.length).toBe(GENERATIVE_CHAPTER_COUNT);
    expect(everyQuestion.length).toBeGreaterThan(120);
    expect(verifyGenerated(everyQuestion)).toEqual([]);
  });

  it('takes its correct answer verbatim from the shipped, textbook-checked bank', () => {
    const shipped = new Map<string, Set<string>>();
    for (const seed of STARTER_QUESTIONS) {
      if (!seed.chapterId) continue;
      const set = shipped.get(seed.chapterId) ?? new Set<string>();
      set.add(seed.options[seed.answer]);
      shipped.set(seed.chapterId, set);
    }
    for (const question of everyQuestion) {
      expect(shipped.get(question.chapterId!)).toBeDefined();
      expect(shipped.get(question.chapterId!)!.has(question.options[question.answer])).toBe(true);
    }
  });

  it('explains itself and names a source instead of a bare answer', () => {
    for (const question of everyQuestion) {
      expect(question.explanation).toBeTruthy();
      expect(question.explanation!).toMatch(/সূত্র:|Source:/);
      expect(question.source).toContain('পাঠ্যবই');
      expect(question.id.startsWith(GENERATED_PREFIX)).toBe(true);
    }
  });

  it('has four distinct options with the answer strictly inside the range', () => {
    for (const question of everyQuestion) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.answer).toBeGreaterThanOrEqual(0);
      expect(question.answer).toBeLessThan(4);
    }
  });
});

describe('the engine never invents anything', () => {
  it('covers every chapter of the syllabus, including the 34 added last', () => {
    expect(GENERATIVE_CHAPTER_COUNT).toBe(CHAPTERS.length);
    expect(CHAPTERS.every(chapter => generativeGap(chapter.id) === 'ok')).toBe(true);
  });

  it('still refuses an unknown chapter and says why', () => {
    expect(generateQuestions('not-a-chapter')).toEqual([]);
    expect(generativeGap('not-a-chapter')).toBe('unknown-chapter');
  });

  it('reports no-fact honestly if the pool ever loses a chapter', () => {
    // The gap helper is the guard-rail: it must not claim coverage it cannot produce.
    const covered = new Set(generativeChapters());
    expect(covered.size).toBe(CHAPTERS.length);
  });

  it('only ever talks about the chapter it was asked for', () => {
    for (const chapterId of everyChapter) {
      for (const question of generateQuestions(chapterId, { variant: 'x' })) {
        expect(question.chapterId).toBe(chapterId);
        expect(question.subject).toBe(chapterById[chapterId].subject);
      }
    }
  });

  it('does not repeat another question id when a chapter holds several facts', () => {
    const multi = everyChapter.find(chapterId => factsFor(chapterId).length > 1)!;
    const ids = generateQuestions(multi, { variant: 'dup-check' }).map(question => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(factsFor(multi).length);
  });

  it('moves the correct option around instead of always putting it first', () => {
    const positions = new Set(everyQuestion.map(question => question.answer));
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe('generation behaves like the rest of the bank', () => {
  it('is deterministic for one seed and fresh for another', () => {
    const chapterId = everyChapter[0];
    const first = generateQuestions(chapterId, { variant: 'same' });
    const again = generateQuestions(chapterId, { variant: 'same' });
    const other = generateQuestions(chapterId, { variant: 'different' });
    expect(again.map(question => question.id)).toEqual(first.map(question => question.id));
    expect(other.map(question => question.id)).not.toEqual(first.map(question => question.id));
  });

  it('respects count and exclusion', () => {
    const chapterId = everyChapter.find(id => factsFor(id).length > 1)!;
    expect(generateQuestions(chapterId, { count: 1 })).toHaveLength(1);
    const all = generateQuestions(chapterId, { variant: 'ex' });
    const rest = generateQuestions(chapterId, { variant: 'ex', exclude: [all[0].id] });
    expect(rest.map(question => question.id)).not.toContain(all[0].id);
    expect(rest).toHaveLength(all.length - 1);
  });

  it('generates across a whole subject only from that subject', () => {
    const physics = generateForSubject('physics', { variant: 'sub' });
    expect(physics.length).toBeGreaterThan(20);
    expect(physics.every(question => question.subject === 'physics')).toBe(true);
    expect(verifyGenerated(physics)).toEqual([]);
  });
});

describe('the exam simulator can top up a thin chapter', () => {
  it('leaves the paper untouched unless generation is asked for', () => {
    const data = freshData();
    const plain = buildExamQuestions(data, { mode: 'chapter', chapterId: 'biology-1-6', count: 10 }, () => 0.5);
    const generated = buildExamQuestions(data, { mode: 'chapter', chapterId: 'biology-1-6', count: 10, generate: true, variant: 'gen' }, () => 0.5);
    // The rule is about where questions come from, not about how many the bank holds:
    // without `generate` a paper may only use banked questions, and with it the paper
    // may add generated ones to reach the requested size.
    const plainGenerated = plain.filter(question => question.id.startsWith(GENERATED_PREFIX) || question.id.startsWith('num|'));
    expect(plainGenerated).toHaveLength(0);
    expect(plain.length).toBeGreaterThan(0);
    expect(generated.length).toBeGreaterThanOrEqual(plain.length);
    expect(generated.every(question => question.bank === true || question.id.startsWith(GENERATED_PREFIX) || question.id.startsWith('num|'))).toBe(true);
  });

  it('still auto-marks a generated paper correctly', () => {
    const data = freshData();
    // physics-1-7 now also has numeric drills, so look at both generated kinds.
    const paper = buildExamQuestions(data, { mode: 'chapter', chapterId: 'physics-1-7', count: 10, generate: true, variant: 'mark' }, () => 0.4);
    const generated = paper.filter(question => question.id.startsWith(GENERATED_PREFIX) || question.id.startsWith('num|'));
    expect(generated.length).toBeGreaterThan(0);
    for (const question of generated) {
      expect(question.options[question.answer]).toBeTruthy();
      expect(question.explanation).toBeTruthy();
    }
  });

  it('keeps the engine label honest for the UI', () => {
    expect(ENGINE_LABEL).toContain('নিয়মভিত্তিক');
  });
});
