import { afterEach, describe, expect, it } from 'vitest';
import { CHAPTERS, SUBJECTS } from './data';
import { freshData } from './planner';
import { parseBackup, LIMITS } from './storage';
import { setLanguage } from './i18n';
import { factsFor, generativeChapters, generateQuestions, sourceAnswerOf, verifyGenerated } from './questionGen';
import { numericChapters, numericQuestions } from './numericGen';
import { beginExam, buildExamQuestions, saveExamSession } from './examSim';
import { STARTER_QUESTIONS } from './quiz-data';

afterEach(() => setLanguage('bn'));

describe('A–Z generated definitions survive real backup and live-paper validation', () => {
  it.each(['bn', 'en'] as const)('round-trips every generated and numeric definition in %s, with bounded unique ids', language => {
    setLanguage(language);
    const generated = generativeChapters().flatMap(id => generateQuestions(id, { variant: 'complete-restore-audit' }));
    const numeric = numericChapters().flatMap(id => numericQuestions(id, 4).map(build => build.question));
    expect(generated.length).toBeGreaterThan(language === 'bn' ? 800 : 50);
    for (const question of [...generated, ...numeric]) expect(question.id.length, question.question).toBeLessThanOrEqual(180);
    expect(new Set([...generated, ...numeric].map(q => q.id)).size).toBe(generated.length + numeric.length);
    expect(verifyGenerated(generated)).toEqual([]);
    const data = freshData(); data.questions = [...generated, ...numeric];
    expect(data.questions.length).toBeLessThanOrEqual(LIMITS.questions);
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.questions.map(q => q.id)).toEqual(data.questions.map(q => q.id));
    expect(restored.questions.map(q => q.options[q.answer])).toEqual(data.questions.map(q => q.options[q.answer]));
  });

  it('keeps legacy encoded ids traceable and rejects forged compact answer references', () => {
    const generated = generativeChapters().flatMap(id => generateQuestions(id, { variant: 'bounded-reference' }));
    for (const question of generated) {
      const answer = sourceAnswerOf(question.id)!;
      expect(factsFor(question.chapterId!).some(fact => fact.value === answer)).toBe(true);
      const parts = question.id.split('|');
      const legacy = { ...question, id: `gen|${parts[1]}|${parts[2]}|${encodeURIComponent(answer)}` };
      expect(sourceAnswerOf(legacy.id)).toBe(answer);
      expect(verifyGenerated([legacy])).toEqual([]);
    }
    const compact = generated.find(q => q.id.split('|')[3].startsWith('~'));
    expect(compact).toBeDefined();
    expect(verifyGenerated([{ ...compact!, id: compact!.id + 'forged' }]).map(issue => issue.problem)).toContain('fact-not-in-bank');
    const options = [...compact!.options]; options[compact!.answer] = 'Not a shipped answer';
    expect(verifyGenerated([{ ...compact!, options }]).map(issue => issue.problem)).toContain('fact-not-in-bank');
  });

  it.each(['bn', 'en'] as const)('can resume every chapter and subject paper in %s without random un-restorable questions', language => {
    setLanguage(language);
    const selections = [
      ...CHAPTERS.map(chapter => ({ mode: 'chapter' as const, chapterId: chapter.id })),
      ...SUBJECTS.map(subject => ({ mode: 'subject' as const, subject: subject.id })),
    ];
    for (const selection of selections) {
      const questions = buildExamQuestions(freshData(), { ...selection, count: 50, generate: true, variant: 'persist-every-paper' }, () => 0.43);
      const data = beginExam(freshData(), { ...selection, title: 'Round-trip paper', questions }, Date.parse('2026-11-20T03:00:00Z'));
      expect(data.activeExam, JSON.stringify(selection)).toBeDefined();
      expect(parseBackup(JSON.stringify(data)).activeExam).toEqual(data.activeExam);
    }
  });
});

describe('A–Z known content contradiction regression — not a complete textbook audit', () => {
  it('distinguishes muscle-to-bone tendons from bone-to-bone ligaments and joints in the bank and generator', () => {
    const rows = STARTER_QUESTIONS.filter(q => q.chapterId === 'biology-2-7' && q.question.includes('পেশি ও অস্থি'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) expect(row.options[row.answer]).toBe('টেন্ডন');
    for (const language of ['bn', 'en'] as const) {
      setLanguage(language);
      const row = generateQuestions('biology-2-7').find(q => q.question === (language === 'en' ? 'What connects a muscle to a bone?' : 'পেশি ও অস্থিকে যুক্ত করে কোনটি?'));
      expect(row).toBeDefined();
      expect(row!.options[row!.answer]).toBe(language === 'en' ? 'a tendon' : 'টেন্ডন');
      expect(verifyGenerated([row!])).toEqual([]);
    }
  });
});

describe('A–Z unanswered exam learning loop', () => {
  it('puts an unanswered generated question in the mistake book and tomorrow’s revision, without inventing a selected answer', () => {
    const question = generateQuestions('physics-1-7', { variant: 'unanswered-mistake', count: 1 })[0];
    const before = freshData(); before.notes['2026-11-19'] = 'Keep unrelated real evidence';
    const data = saveExamSession(before, { id: 'az-unanswered-paper', mode: 'chapter', title: 'Unanswered paper', questions: [question], answers: {}, durationMin: 5, timeTakenSec: 300, date: '2026-11-20' });
    expect(data.examSessions[0].answers).toEqual({});
    expect(data.examSessions[0].score).toBe(0);
    expect(data.attempts).toEqual([]); // Do not pretend a student chose an option.
    const mistake = data.mistakes.find(m => m.id === `auto-mcq:${question.id}`);
    expect(mistake).toMatchObject({ subject: 'physics', chapterId: 'physics-1-7', resolved: false, retryStatus: 'pending', date: '2026-11-20' });
    expect(data.revisions.some(r => r.sourceTaskId === mistake!.id && r.dueDate === '2026-11-21')).toBe(true);
    expect(buildExamQuestions(data, { mode: 'retry', count: 10, today: '2026-11-21' }).some(q => q.id === question.id)).toBe(true);
    expect(parseBackup(JSON.stringify(data)).notes).toEqual(before.notes);
  });
});
