import { describe, expect, it } from 'vitest';
import { STARTER_QUESTIONS } from './quiz-data';
import { BUILTIN_QUESTION_COUNTS, BUILTIN_QUESTION_IDS, BUILTIN_QUESTION_META, questionChapters } from './questionBankIndex';
import { freshData } from './planner';
import { beginExam } from './examSim';
import { parseBackup } from './storage';

describe('small startup question metadata is exact, not an ID-prefix guess', () => {
  it('matches every full-bank ID, chapter and subject, without shipping prompt/answer text', () => {
    expect(new Set(BUILTIN_QUESTION_META.map(q => q.id))).toEqual(new Set(STARTER_QUESTIONS.map(q => q.id)));
    const full = new Map(STARTER_QUESTIONS.map(q => [q.id, q]));
    for (const meta of BUILTIN_QUESTION_META) { const question = full.get(meta.id)!; expect(meta).toEqual({ id: question.id, subject: question.subject, chapterId: question.chapterId }); expect(Object.keys(meta).sort()).toEqual(['chapterId', 'id', 'subject']); }
    expect(BUILTIN_QUESTION_IDS.size).toBe(STARTER_QUESTIONS.length);
  });
  it('keeps exact chapter counts for the chapter sheet', () => {
    const counts: Record<string, number> = {};
    for (const question of STARTER_QUESTIONS) if (question.chapterId) counts[question.chapterId] = (counts[question.chapterId] || 0) + 1;
    expect(BUILTIN_QUESTION_COUNTS).toEqual(counts);
  });
  it('retains custom-question override and missing-question semantics', () => {
    const data = freshData(), seed = STARTER_QUESTIONS[0];
    data.questions = [{ ...seed, chapterId: 'physics-1-3' }, { ...seed, id: 'my-local-question', chapterId: 'physics-1-5' }];
    const map = questionChapters(data);
    expect(map.get(seed.id)).toBe('physics-1-3'); expect(map.get('my-local-question')).toBe('physics-1-5'); expect(map.get('deleted-question')).toBeUndefined(); expect(map.has('deleted-question')).toBe(false);
  });
  it('restores real builtin active-paper references while rejecting lookalike invented IDs', () => {
    const questions = STARTER_QUESTIONS.slice(0, 5), data = beginExam(freshData(), { title: 'Builtin paper', mode: 'chapter', questions }, Date.parse('2026-11-20T03:00:00Z'));
    expect(data.activeExam).toBeTruthy(); expect(parseBackup(JSON.stringify(data)).activeExam).toEqual(data.activeExam);
    for (const id of ['seed-999999', `${questions[0].id}-fake`, '__proto__']) expect(() => parseBackup(JSON.stringify({ ...data, activeExam: { ...data.activeExam, questionIds: [id] } }))).toThrow(/চলমান পরীক্ষার/);
  });
});
