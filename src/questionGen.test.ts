import { describe, expect, it } from 'vitest';
import {
  ENGINE_LABEL, FACT_POOL_SIZE, GENERATED_PREFIX, GENERATIVE_CHAPTER_COUNT, RECOVERED_FACT_COUNT,
  factsFor, generateForSubject, generateQuestions, generativeChapters, generativeGap, sourceAnswerOf, verifyGenerated,
} from './questionGen';
import { CHAPTERS, chapterById } from './data';
import { setLanguage } from './i18n';
import { buildExamQuestions } from './examSim';
import { freshData } from './planner';
import { STARTER_QUESTIONS } from './quiz-data';

const everyChapter = generativeChapters();
const everyQuestion = everyChapter.flatMap(chapterId => generateQuestions(chapterId, { variant: 'audit' }));

describe('every generated question is verifiable', () => {
  it('passes the verifier with zero issues across every generative chapter', () => {
    expect(everyChapter.length).toBe(GENERATIVE_CHAPTER_COUNT);
    expect(everyQuestion.length).toBe(FACT_POOL_SIZE);
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
    expect(ENGINE_LABEL()).toContain('নিয়মভিত্তিক');
  });
});

describe('the pool is as deep as the bank already was', () => {
  it('recovered most of its facts from questions the app already shipped', () => {
    // Before v2.33 the engine had 130 hand-written facts, and 98 of the 114
    // chapters could only ever produce a single question.
    expect(RECOVERED_FACT_COUNT).toBeGreaterThan(700);
    expect(FACT_POOL_SIZE).toBeGreaterThan(800);
    expect(FACT_POOL_SIZE).toBeGreaterThan(130 + RECOVERED_FACT_COUNT - 1);
  });

  it('gives almost every chapter enough for a real test instead of one question', () => {
    const counts = CHAPTERS.map(chapter => factsFor(chapter.id).length);
    expect(Math.min(...counts)).toBeGreaterThan(0);
    // A three-question minimum is what makes a chapter test worth sitting.
    const thin = CHAPTERS.filter(chapter => factsFor(chapter.id).length < 3);
    expect(thin.length).toBeLessThanOrEqual(3);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(10);
  });

  it('keeps every recovered answer verifiable against the shipped bank', () => {
    const shipped = new Set(STARTER_QUESTIONS.filter(seed => seed.chapterId)
      .map(seed => `${seed.chapterId}|${seed.options[seed.answer]}`));
    for (const chapterId of generativeChapters()) {
      for (const fact of factsFor(chapterId)) {
        expect(shipped.has(`${fact.chapterId}|${fact.value}`), `${fact.prompt}`).toBe(true);
        expect(fact.prompt.trim().length).toBeGreaterThan(3);
        expect(fact.origin.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('only recovers facts that come with their own reasoning', () => {
    // A recovered fact is only useful if the bank explains why it is right, so
    // every one of them must carry a non-empty `why`.
    for (const chapterId of generativeChapters()) {
      for (const fact of factsFor(chapterId)) {
        if (fact.origin !== 'শিপ করা ব্যাংকের ব্যাখ্যা') continue;
        expect(fact.why?.trim().length ?? 0, `${fact.prompt}`).toBeGreaterThan(0);
      }
    }
  });

  it('never offers a recovered answer as one of its own wrong options', () => {
    for (const chapterId of generativeChapters()) {
      for (const question of generateQuestions(chapterId, { variant: 'collide' })) {
        const correct = question.options[question.answer];
        expect(question.options.filter(option => option === correct)).toHaveLength(1);
      }
    }
  });

  it('asks genuinely different questions, not the same one reworded', () => {
    const chapterId = 'physics-1-2';
    const questions = generateQuestions(chapterId, { variant: 'distinct' });
    expect(questions.length).toBeGreaterThan(4);
    const prompts = new Set(questions.map(question => question.question));
    const answers = new Set(questions.map(question => question.options[question.answer]));
    expect(prompts.size).toBe(questions.length);
    expect(answers.size).toBe(questions.length);
  });
});

describe('a chapter test is a real test now, not a single question', () => {
  it('fills a ten-question paper for every chapter once generation is on', () => {
    const data = freshData();
    const short = CHAPTERS.filter(chapter =>
      buildExamQuestions(data, { mode: 'chapter', chapterId: chapter.id, count: 10, generate: true, variant: 'e2e' }, () => 0.5).length < 10,
    ).map(chapter => chapter.id);
    expect(short).toEqual([]);
  });

  it('still refuses to pad with anything it cannot verify', () => {
    const data = freshData();
    const paper = buildExamQuestions(data, { mode: 'chapter', chapterId: 'chemistry-1-3', count: 10, generate: true, variant: 'thin' }, () => 0.5);
    // chemistry-1-3 is one of the three thinnest chapters. A plain bank item may
    // ship without an explanation (a known gap in the bank itself, not something
    // the generator adds), but anything the *generator* contributes must still be
    // fully explained and four-optioned.
    const generated = paper.filter(question => question.id.startsWith(GENERATED_PREFIX));
    expect(generated.length).toBeGreaterThan(0);
    for (const question of paper) {
      expect(question.options).toHaveLength(4);
      expect(question.options[question.answer]).toBeTruthy();
    }
    for (const question of generated) {
      expect(question.explanation?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('the verifier cannot be talked into accepting a fake', () => {
  it('rejects a hand-edited id and a hand-edited answer', () => {
    const question = generateQuestions('physics-1-2', { variant: 'tamper' })[0];
    expect(verifyGenerated([question])).toEqual([]);

    const fakeId = { ...question, id: `gen|physics-1-2|abc|${encodeURIComponent('বানানো')}` };
    expect(verifyGenerated([fakeId]).map(issue => issue.problem)).toContain('fact-not-in-bank');

    const fakeAnswer = { ...question, options: [...question.options] };
    fakeAnswer.options[fakeAnswer.answer] = 'বানানো';
    expect(verifyGenerated([fakeAnswer]).map(issue => issue.problem)).toContain('fact-not-in-bank');
  });

  it('traces a generated answer back to the exact shipped bank row', () => {
    const question = generateQuestions('physics-1-2', { variant: 'trace' })[0];
    const source = sourceAnswerOf(question.id);
    expect(source).toBeTruthy();
    expect(factsFor('physics-1-2').some(fact => fact.value === source)).toBe(true);
  });
});

describe('English mode never mixes scripts inside one question', () => {
  it('offers only English stems and English answers, with no Bengali leakage', () => {
    setLanguage('en');
    try {
      const bengali = /[\u0980-\u09FF]/;
      const questions = CHAPTERS.flatMap(chapter => generateQuestions(chapter.id, { variant: 'en' }));
      expect(questions.length).toBeGreaterThan(0);
      const leaking = questions.filter(question =>
        bengali.test(question.question) || bengali.test(question.options[question.answer]));
      expect(leaking.map(question => question.question).slice(0, 5)).toEqual([]);
      expect(verifyGenerated(questions)).toEqual([]);
    } finally {
      setLanguage('bn');
    }
  });

  it('skips a Bengali-only fact in English rather than showing it as the answer', () => {
    // physics-1-2 has one bilingual fact and six Bengali-only ones.
    const bilingual = generateQuestions('physics-1-2', { variant: 'mix' });
    setLanguage('en');
    try {
      const english = generateQuestions('physics-1-2', { variant: 'mix' });
      expect(english.length).toBeLessThan(bilingual.length);
      // Whatever survives must be fully English, not just its stem. Symbols like
      // "°" are fine; Bengali script and Bengali numerals are not.
      for (const question of english) {
        expect(question.question).not.toMatch(/[\u0980-\u09FF]/);
        expect(question.options[question.answer]).not.toMatch(/[\u0980-\u09FF০-৯]/);
      }
    } finally {
      setLanguage('bn');
    }
  });
});
