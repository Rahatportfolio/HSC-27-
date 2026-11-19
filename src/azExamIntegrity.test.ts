import { describe, expect, it } from 'vitest';
import { freshData } from './planner';
import { parseBackup, LIMITS } from './storage';
import { beginExam, buildExamQuestions, examPool, saveExamSession } from './examSim';
import type { SaveExamInput } from './examSim';
import { generateQuestions } from './questionGen';
import { allQuestions } from './questionBank';

const question = generateQuestions('physics-1-7', { variant: 'az-persistent-exam', count: 1 })[0];
const input: SaveExamInput & { id: string } = { id: 'az-stable-paper', mode: 'chapter', title: 'Persistent generated paper', questions: [question], answers: { [question.id]: (question.answer + 1) % 4 }, durationMin: 1, timeTakenSec: 12, date: '2026-11-20' };
const atCapacity = (size: number) => {
  const data = freshData();
  data.questions = Array.from({ length: size }, (_, i) => ({ ...question, id: `capacity-${i}`, question: `Existing question ${i}` }));
  return data;
};

describe('A–Z simulator question retention and exact-once submission', () => {
  it.each([LIMITS.questions, LIMITS.questions - 1])('offers generated questions only inside the remaining storage budget at %s', size => {
    const data = atCapacity(size), known = new Set(allQuestions(data).map(q => q.id));
    const pool = examPool(data, { mode: 'chapter', chapterId: 'physics-1-7', count: 50, generate: true });
    expect(pool.filter(q => !known.has(q.id)).length).toBeLessThanOrEqual(LIMITS.questions - size);
    expect(new Set(pool.map(q => q.id)).size).toBe(pool.length);
  });

  it('retains generated questions so a saved wrong answer remains available to tomorrow’s retry paper', () => {
    const data = freshData(); data.notes['2026-11-19'] = 'Unrelated real history';
    const restored = parseBackup(JSON.stringify(saveExamSession(data, input)));
    expect(allQuestions(restored).some(q => q.id === question.id)).toBe(true);
    expect(restored.retries.some(r => r.questionId === question.id)).toBe(true);
    expect(buildExamQuestions(restored, { mode: 'retry', count: 10, today: '2026-11-21' }).map(q => q.id)).toContain(question.id);
    expect(restored.notes).toEqual(data.notes);
  });

  it('retains every live-paper definition before persisting ids and will not overwrite an ongoing paper', () => {
    const data = beginExam(freshData(), input, Date.parse('2026-11-20T03:00:00Z'));
    expect(data.questions.some(q => q.id === question.id)).toBe(true);
    expect(data.activeExam?.questionIds).toEqual([question.id]);
    expect(parseBackup(JSON.stringify(data)).activeExam).toEqual(data.activeExam);
    expect(beginExam(data, { ...input, title: 'Do not replace my paper' })).toBe(data);
    expect(beginExam(atCapacity(LIMITS.questions), input).activeExam).toBeUndefined();
  });

  it.each([
    { index: -1 }, { index: 1 }, { answers: { unknown: 0 } }, { answers: { [question.id]: 4 } },
    { deadline: 0 }, { questionIds: [question.id, question.id] }, { questionIds: ['missing-definition'] },
  ])('rejects a malformed active paper without accepting a broken resumable reference: %j', patch => {
    const data = beginExam(freshData(), input, Date.parse('2026-11-20T03:00:00Z'));
    expect(() => parseBackup(JSON.stringify({ ...data, activeExam: { ...data.activeExam, ...patch } }))).toThrow(/চলমান পরীক্ষার/);
  });

  it('does not record the same stable paper twice or double its attempts/retry effects', () => {
    const once = saveExamSession(freshData(), input), twice = saveExamSession(once, input);
    expect(once.examSessions[0].id).toBe(input.id);
    expect(twice).toBe(once);
    expect(twice.examSessions).toHaveLength(1);
    expect(twice.tests).toHaveLength(1);
    expect(twice.attempts).toHaveLength(1);
  });
});
