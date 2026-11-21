import { describe, expect, it } from 'vitest';
import { answerAiQuestion, checkQuizAnswer, loadQuizQuestion, quizMessage } from './aiBrain';
import { CHAPTERS, SUBJECTS } from './data';
import { STARTER_QUESTIONS } from './quiz-data';
import { bn } from './planner';
import type { AppData } from './planner';

const data = {
  studySessions: [
    { date: '2026-11-20', at: '2026-11-20T10:00:00.000Z', minutes: 30, chapterId: 'physics-1-2' },
    { date: '2026-11-20', at: '2026-11-20T11:00:00.000Z', minutes: 45, chapterId: 'physics-1-2' },
  ],
  personalRoutine: { chapterIds: ['physics-1-2', 'chemistry-1-1'] },
  completed: { 'task-1': '2026-11-20' },
} as unknown as AppData;

describe('answerAiQuestion', () => {
  it('lists chapters for a subject in Bengali', () => {
    const answer = answerAiQuestion('পদার্থের অধ্যায়গুলো কী?', data);
    expect(answer.kind).toBe('chapters');
    if (answer.kind !== 'chapters') return;
    expect(answer.subject).toBe('physics');
    const expected = CHAPTERS.filter(chapter => chapter.subject === 'physics').length;
    expect(answer.text).toContain(bn(expected));
    expect(answer.text).toContain(CHAPTERS.find(chapter => chapter.subject === 'physics')!.title);
  });

  it('filters chapters by paper', () => {
    const answer = answerAiQuestion('chemistry 1st paper chapters', data);
    expect(answer.kind).toBe('chapters');
    if (answer.kind !== 'chapters') return;
    expect(answer.paper).toBe(1);
    expect(answer.text).toContain('রসায়ন');
  });

  it('details a named chapter', () => {
    const chapter = CHAPTERS.find(item => item.subject === 'physics')!;
    const answer = answerAiQuestion(`physics 1st paper ${chapter.number} অধ্যায়`, data);
    expect(answer.kind).toBe('chapter');
    if (answer.kind !== 'chapter') return;
    expect(answer.chapter.id).toBe(chapter.id);
    expect(answer.text).toContain(chapter.focus);
  });

  it('does not confuse paper numbers with chapter numbers', () => {
    const list = answerAiQuestion('physics paper 2 chapters', data);
    expect(list.kind).toBe('chapters');
    if (list.kind === 'chapters') expect(list.paper).toBe(2);
    const detail = answerAiQuestion('physics 2nd paper chapter 2', data);
    expect(detail.kind).toBe('chapter');
    if (detail.kind === 'chapter') expect(detail.chapter.id).toBe('physics-2-2');
    const first = answerAiQuestion('physics paper 2 chapter 1', data);
    expect(first.kind).toBe('chapter');
    if (first.kind === 'chapter') expect(first.chapter.id).toBe('physics-2-1');
  });

  it('asks for a paper instead of guessing an ambiguous chapter number', () => {
    const answer = answerAiQuestion('পদার্থ অধ্যায় ২', data);
    expect(answer.kind).toBe('unknown');
    if (answer.kind === 'unknown') expect(answer.text).toContain('পত্র');
  });

  it('recognises a named chapter with its subject', () => {
    const answer = answerAiQuestion('পদার্থের ভেক্টর অধ্যায়ের ফোকাস কী?', data);
    expect(answer.kind).toBe('chapter');
    if (answer.kind === 'chapter') expect(answer.chapter.id).toBe('physics-1-2');
  });

  it('does not guess a named chapter shared by subjects', () => {
    expect(answerAiQuestion('ভেক্টর অধ্যায়ের ফোকাস কী?', data).kind).toBe('unknown');
  });

  it('lists all subjects', () => {
    const answer = answerAiQuestion('কয়টা বিষয় আছে?', data);
    expect(answer.kind).toBe('subjects');
    if (answer.kind !== 'subjects') return;
    expect(answer.text).toContain(bn(SUBJECTS.length));
    expect(answer.text).toContain('পদার্থবিজ্ঞান');
  });

  it('requests a quiz question', () => {
    const answer = answerAiQuestion('কুইজ দাও', data);
    expect(answer.kind).toBe('quiz');
    if (answer.kind !== 'quiz') return;
    expect(answer.subject).toBeUndefined();
  });

  it('requests a quiz filtered by subject', () => {
    const answer = answerAiQuestion('chemistry quiz দাও', data);
    expect(answer.kind).toBe('quiz');
    if (answer.kind !== 'quiz') return;
    expect(answer.subject).toBe('chemistry');
  });

  it('gives a study tip', () => {
    const answer = answerAiQuestion('টিপস দাও', data);
    expect(answer.kind).toBe('tip');
    if (answer.kind !== 'tip') return;
    expect(answer.text.length).toBeGreaterThan(10);
  });

  it('summarises saved progress', () => {
    const answer = answerAiQuestion('আমার অগ্রগতি?', data);
    expect(answer.kind).toBe('progress');
    if (answer.kind !== 'progress') return;
    expect(answer.text).toContain(bn(2));
    expect(answer.text).toContain(bn(75));
  });

  it('motivates', () => {
    const answer = answerAiQuestion('মোটিভেশন দাও', data);
    expect(answer.kind).toBe('motivation');
    if (answer.kind !== 'motivation') return;
    expect(answer.text.length).toBeGreaterThan(10);
  });

  it('falls back to help for unknown text', () => {
    const answer = answerAiQuestion('xyzzy plugh', data);
    expect(answer.kind).toBe('unknown');
    if (answer.kind !== 'unknown') return;
    expect(answer.text).toContain('কুইজ');
  });

  it('handles empty input', () => {
    expect(answerAiQuestion('   ', data).kind).toBe('unknown');
  });
});

describe('loadQuizQuestion', () => {
  it('returns a question from the starter bank', async () => {
    const question = await loadQuizQuestion();
    expect(STARTER_QUESTIONS).toContain(question);
    expect(question.options).toHaveLength(4);
  });

  it('filters by subject', async () => {
    const question = await loadQuizQuestion('chemistry');
    expect(question.subject).toBe('chemistry');
  });

  it('rotates without immediate repeats', async () => {
    const first = await loadQuizQuestion();
    const second = await loadQuizQuestion();
    expect(second.id).not.toBe(first.id);
  });

  it('composes a prompt with the question text', async () => {
    const question = await loadQuizQuestion();
    expect(quizMessage(question)).toContain(question.question);
  });
});

describe('checkQuizAnswer', () => {
  it('confirms a correct pick with the explanation', () => {
    const question = STARTER_QUESTIONS[0];
    const result = checkQuizAnswer(question, question.answer);
    expect(result.correct).toBe(true);
    expect(result.text).toContain('ঠিক');
  });

  it('reveals the correct option on a wrong pick', () => {
    const question = STARTER_QUESTIONS[0];
    const wrong = (question.answer + 1) % question.options.length;
    const result = checkQuizAnswer(question, wrong);
    expect(result.correct).toBe(false);
    expect(result.text).toContain(question.options[question.answer]);
  });
});

describe('paper and chapter wording', () => {
  it.each(['physics second chapter', 'পদার্থ দ্বিতীয় অধ্যায়', 'পদার্থ ২য় অধ্যায়'])('does not mistake %s for a paper selection', question => {
    const answer = answerAiQuestion(question, data);
    expect(answer.kind).toBe('unknown');
    if (answer.kind === 'unknown') expect(answer.text).toContain('পত্র');
  });
  it.each(['পদার্থ প্রথম পত্র দ্বিতীয় অধ্যায়', 'physics first paper second chapter', 'পদার্থ ১ম পত্র ২য় অধ্যায়'])('resolves %s with both paper and chapter', question => {
    const answer = answerAiQuestion(question, data);
    expect(answer.kind).toBe('chapter');
    if (answer.kind === 'chapter') expect(answer.chapter.id).toBe('physics-1-2');
  });
  it('does not use a following chapter ordinal as the paper number', () => {
    const answer = answerAiQuestion('পদার্থ ২য় পত্র ১ম অধ্যায়', data);
    expect(answer.kind).toBe('chapter');
    if (answer.kind === 'chapter') expect(answer.chapter.id).toBe('physics-2-1');
  });
  it('recognizes the common paper-number suffix notation', () => {
    const answer = answerAiQuestion('পদার্থ ২ পত্রের অধ্যায়গুলো', data);
    expect(answer.kind).toBe('chapters');
    if (answer.kind === 'chapters') expect(answer.paper).toBe(2);
  });
});
