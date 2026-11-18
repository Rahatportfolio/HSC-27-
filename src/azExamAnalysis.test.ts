import { describe, expect, it } from 'vitest';
import { examPostmortem, longestWrongRun, tailBlanks } from './examAnalysis';
import { STARTER_QUESTIONS } from './quiz-data';
import type { ExamSession } from './types';

const questions = STARTER_QUESTIONS.filter(q => q.chapterId === 'physics-1-7').slice(0, 10);
const session = (id: string, seconds: number): ExamSession => ({
  id, mode: 'chapter', title: id, chapterIds: ['physics-1-7'], questionIds: questions.map(q => q.id), answers: {},
  score: 0, total: questions.length, durationMin: 10, timeTakenSec: seconds, date: '2026-11-20',
  at: `2026-11-20T03:00:${id === 'first' ? '00' : '01'}Z`, breakdown: [],
});

describe('A–Z result analysis uses measured paper identity and complete question counts', () => {
  it('does not borrow the first attempt’s time when two sessions use exactly the same question ids', () => {
    const first = session('first', questions.length * 30), second = session('second', questions.length * 90);
    const post = examPostmortem([first, second]);
    expect(post.secondsPerQuestion).toBe(60);
    expect(post.rushedPapers).toBe(1);
  });

  it('does not guess which duplicate session a legacy id-less analysis input belongs to', () => {
    const first = session('first', 100), second = session('second', 300);
    const post = examPostmortem([first, second], [{ questionIds: first.questionIds, answers: first.answers }]);
    expect(post.secondsPerQuestion).toBe(0);
    expect(post.rushedPapers).toBe(0);
  });

  it('uses the full paper size for measured time even when an old question definition is missing', () => {
    const paper = { ...session('first', 100), questionIds: [questions[0].id, 'missing-legacy-definition'], total: 2 };
    const post = examPostmortem([paper]);
    expect(post.questions).toBe(1); // Never invent the missing chapter or correct answer.
    expect(post.secondsPerQuestion).toBe(50); // The saved paper still really had two questions.
  });

  it('treats an out-of-range selection as blank consistently with grading, not as an answered question', () => {
    const paper = { ...session('first', 100), questionIds: [questions[0].id], answers: { [questions[0].id]: 99 }, total: 1 };
    const post = examPostmortem([paper]);
    expect(post).toMatchObject({ answered: 0, wrong: 0, blank: 1 });
    expect(tailBlanks([questions[0]], paper.answers)).toBe(1);
    expect(longestWrongRun([questions[0]], paper.answers)).toBe(0);
  });

  it('does not diagnose running out of time from blanks in an early submission', () => {
    const post = examPostmortem([session('first', 2)]);
    expect(post).toMatchObject({ blank: 10, secondsPerQuestion: 0 });
    expect(post.nextEn).toContain('unanswered');
    expect(post.nextEn).not.toContain('run out of time');
    expect(post.nextBn).toContain('উত্তরহীন');
    expect(post.nextBn).not.toContain('সময় শেষে');
    const tail = post.patterns.find(p => p.key === 'unfinished')!;
    expect(tail.detailEn).not.toContain('time needs budgeting');
    expect(tail.detailBn).not.toContain('সময় ভাগ করা শিখতে হবে');
  });

  it('describes short recorded time without diagnosing careless reading and includes the forty-second boundary', () => {
    const post = examPostmortem([session('first', questions.length * 40)]);
    expect(post.rushedPapers).toBe(1);
    const short = post.patterns.find(p => p.key === 'rushed')!;
    expect(short.detailEn).toContain('40s or less');
    expect(short.detailEn).not.toContain('faster than careful reading allows');
    expect(short.detailBn).toContain('40 সেকেন্ড বা কম');
    expect(short.detailBn).not.toContain('দ্রুত পড়া মানে ভুল পড়া');
  });

  it('does not identify the cause of wrong answers without the student’s explanation', () => {
    const answers = Object.fromEntries(questions.map(q => [q.id, (q.answer + 1) % 4]));
    const post = examPostmortem([{ ...session('first', 600), answers }]);
    const wrong = post.patterns.find(p => p.key === 'knowledge')!;
    expect(wrong.titleEn).toBe('Review wrong answers');
    expect(wrong.detailEn).toContain('does not establish why');
    expect(wrong.detailBn).toContain('কারণ প্রমাণ করে না');
    expect(wrong.detailBn).not.toContain('তথ্য/সূত্র মনে নেই');
  });

  it('reports a missing custom definition without inventing a generated-question origin', () => {
    const paper = session('first', 600); paper.questionIds.push('custom-missing-definition'); paper.total += 1;
    const post = examPostmortem([paper]);
    const unknown = post.caveats.find(c => c.includes('১টি'))!;
    expect(unknown).toContain('সংজ্ঞা পাওয়া যায়নি');
    expect(unknown).not.toContain('তৈরি হওয়া (gen/num)');
  });

  it('limits high-score and lowest-accuracy advice to the actual measured sample', () => {
    const answers = Object.fromEntries(questions.map(q => [q.id, q.answer]));
    const post = examPostmortem([{ ...session('first', 600), answers, score: 10 }]);
    const high = post.patterns.find(p => p.key === 'strong')!;
    expect(high.titleEn).toBe('High score in this sample');
    expect(high.detailEn).toContain('not a readiness guarantee');
    expect(high.detailBn).toContain('প্রস্তুতির নিশ্চয়তা নয়');
    expect(post.nextEn).toContain('lowest measured accuracy in this sample');
    expect(post.nextBn).toContain('এই নমুনায়');
  });

  it('does not promise to diagnose knowledge versus time from a future single paper', () => {
    const empty = examPostmortem([]).patterns[0];
    expect(empty.detailEn).toContain('not diagnose');
    expect(empty.detailBn).toContain('কারণ নির্ণয় নয়');
  });

  it('prints a 50-percent blank rate as 50%, not the 0.5 fraction followed by a percent sign', () => {
    const answers = Object.fromEntries(questions.slice(0, 5).map(q => [q.id, q.answer]));
    const post = examPostmortem([{ ...session('first', 100), answers, score: 5 }, { ...session('second', 200), answers, score: 5 }]);
    expect(post.blankRate).toBe(50);
    const pattern = post.patterns.find(p => p.key === 'unfinished' && p.count === 10)!;
    expect(pattern.detailBn).toContain('(50%)');
    expect(pattern.detailBn).not.toContain('(0.5%)');
  });
});
