import { describe, expect, it } from 'vitest';
import { answerAiQuestion, checkQuizAnswer, pickQuizQuestion } from './aiBrain';
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
    const answer = answerAiQuestion(`physics ${chapter.number} অধ্যায়`, data);
    expect(answer.kind).toBe('chapter');
    if (answer.kind !== 'chapter') return;
    expect(answer.chapter.id).toBe(chapter.id);
    expect(answer.text).toContain(chapter.focus);
  });

  it('lists all subjects', () => {
    const answer = answerAiQuestion('কয়টা বিষয় আছে?', data);
    expect(answer.kind).toBe('subjects');
    expect(answer.text).toContain(bn(SUBJECTS.length));
    expect(answer.text).toContain('পদার্থবিজ্ঞান');
  });

  it('returns a quiz question from the starter bank', () => {
    const answer = answerAiQuestion('কুইজ দাও', data);
    expect(answer.kind).toBe('quiz');
    if (answer.kind !== 'quiz') return;
    expect(STARTER_QUESTIONS).toContain(answer.question);
    expect(answer.question.options).toHaveLength(4);
  });

  it('filters quiz questions by subject', () => {
    const answer = answerAiQuestion('chemistry quiz দাও', data);
    expect(answer.kind).toBe('quiz');
    if (answer.kind !== 'quiz') return;
    expect(answer.question.subject).toBe('chemistry');
  });

  it('gives a study tip', () => {
    const answer = answerAiQuestion('টিপস দাও', data);
    expect(answer.kind).toBe('tip');
    expect(answer.text.length).toBeGreaterThan(10);
  });

  it('summarises saved progress', () => {
    const answer = answerAiQuestion('আমার অগ্রগতি?', data);
    expect(answer.kind).toBe('progress');
    expect(answer.text).toContain(bn(2));
    expect(answer.text).toContain(bn(75));
  });

  it('motivates', () => {
    const answer = answerAiQuestion('মোটিভেশন দাও', data);
    expect(answer.kind).toBe('motivation');
    expect(answer.text.length).toBeGreaterThan(10);
  });

  it('falls back to help for unknown text', () => {
    const answer = answerAiQuestion('xyzzy plugh', data);
    expect(answer.kind).toBe('unknown');
    expect(answer.text).toContain('কুইজ');
  });

  it('handles empty input', () => {
    expect(answerAiQuestion('   ', data).kind).toBe('unknown');
  });
});

describe('pickQuizQuestion', () => {
  it('rotates through the bank without immediate repeats', () => {
    const first = pickQuizQuestion(undefined, 0);
    const second = pickQuizQuestion(undefined, first.nextCursor);
    expect(second.question.id).not.toBe(first.question.id);
    expect(second.nextCursor).toBe(2);
  });

  it('wraps around the pool', () => {
    const pool = STARTER_QUESTIONS;
    const wrapped = pickQuizQuestion(undefined, pool.length);
    expect(wrapped.question.id).toBe(pool[0].id);
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
