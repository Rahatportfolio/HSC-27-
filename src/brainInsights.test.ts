import { describe, expect, it } from 'vitest';
import { addDays, freshData } from './planner';
import type { AppData } from './planner';
import { buildStudyPlan } from './studyPlan';
import { personalDataFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { STARTER_QUESTIONS } from './quiz-data';
import { newStudyBrain } from './studyBrain';
import { interpretBrainMessage } from './studyBrainIntents';
import { brainConsistency, brainEnergyOutput, brainPaceProjection, brainPreflight, brainTimeOfDay } from './brainInsights';

const now = new Date('2026-11-20T12:05:00.000Z'); // 18:05 Bangladesh
const today = '2026-11-20';
function fixture() { const data = personalDataFixture(); data.studyBrain = newStudyBrain(); return data; }
function session(data: AppData, date: string, minutes: number, chapterId = PERSONAL_IDS[0], stamp = `${date}T08:00:00Z`) {
  data.studySessions.push({ id: `${date}-${data.studySessions.length}`, date, at: stamp, minutes, subject: 'physics', chapterId, mode: 'countdown' });
}

describe('28-day consistency picture', () => {
  it('returns a truthful empty picture with no saved S sessions', () => {
    const data = fixture();
    expect(brainConsistency(data, now)).toEqual({ windowDays: 28, activeDays: 0, minutes: 0, bestWeekday: null, bestWeekdayMinutes: 0, currentStreak: 0, longestStreak: 0, enough: false });
  });
  it('counts selected-chapter days only, excludes today and future, tracks best weekday and streaks', () => {
    const data = fixture();
    session(data, '2026-11-12', 30); // Thursday
    session(data, '2026-11-19', 10); // Thursday
    session(data, '2026-11-16', 50); // Monday
    session(data, '2026-11-20', 25); // today counts as a study day and toward its weekday
    session(data, '2026-11-20', 999, 'unselected-chapter'); // never counted
    session(data, '2026-11-25', 40); // future — never counted
    session(data, '2026-10-20', 40); // older than 28 days — never counted
    const result = brainConsistency(data, now);
    expect(result.activeDays).toBe(4);
    expect(result.minutes).toBe(115);
    expect(result.bestWeekday).toBe(1); // Monday 50 min beats Thursday 40 and Friday 25
    expect(result.bestWeekdayMinutes).toBe(50);
  });
  it('keeps an open today from breaking the current streak and reports the longest run', () => {
    const data = fixture();
    session(data, '2026-11-18', 10); session(data, '2026-11-19', 10); // current run: yesterday + day before = 2, today open
    session(data, '2026-11-10', 10); session(data, '2026-11-11', 10); session(data, '2026-11-12', 10); session(data, '2026-11-13', 10);
    const result = brainConsistency(data, now);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(4);
  });
});

describe('time-of-day pattern on the Dhaka clock', () => {
  it('buckets sessions by Bangladesh local time and stays silent below five sessions', () => {
    const data = fixture();
    session(data, '2026-11-19', 20, PERSONAL_IDS[0], '2026-11-19T02:30:00Z'); // 08:30 Dhaka — morning
    expect(brainTimeOfDay(data, now).enough).toBe(false);
    session(data, '2026-11-18', 20, PERSONAL_IDS[0], '2026-11-18T08:30:00Z'); // 14:30 Dhaka — afternoon
    session(data, '2026-11-17', 30, PERSONAL_IDS[0], '2026-11-17T12:30:00Z'); // 18:30 Dhaka — evening
    session(data, '2026-11-16', 20, PERSONAL_IDS[0], '2026-11-16T18:30:00Z'); // 00:30 Dhaka 11-17 — night
    session(data, '2026-11-15', 40, PERSONAL_IDS[1], '2026-11-15T03:00:00Z'); // 09:00 Dhaka — morning
    const result = brainTimeOfDay(data, now);
    expect(result.enough).toBe(true);
    expect(result.rows.find(row => row.bucket === 'morning')).toMatchObject({ minutes: 60, sessions: 2 });
    expect(result.rows.find(row => row.bucket === 'night')).toMatchObject({ minutes: 20, sessions: 1 });
    expect(result.best).toBe('morning');
  });
});

describe('energy versus logged output', () => {
  it('joins check-ins to the same day sessions, needs four joined days, never invents one', () => {
    const data = fixture();
    const push = (date: string, energy: 'low' | 'okay' | 'fresh', minutes: number) => {
      data.studyBrain!.checkIns.push({ energy, availableMinutes: null, obstacle: 'none', date, at: `${date}T08:00:00Z` });
      session(data, date, minutes);
    };
    push('2026-11-17', 'low', 10); push('2026-11-18', 'low', 20); push('2026-11-19', 'fresh', 80);
    const three = brainEnergyOutput(data, now);
    expect(three.enough).toBe(false); expect(three.joinedDays).toBe(3);
    push('2026-11-13', 'okay', 40);
    const result = brainEnergyOutput(data, now);
    expect(result.enough).toBe(true); expect(result.joinedDays).toBe(4);
    expect(result.rows.find(row => row.energy === 'low')).toMatchObject({ days: 2, minutes: 30, avgMinutes: 15 });
    expect(result.rows.find(row => row.energy === 'fresh')).toMatchObject({ days: 1, minutes: 80, avgMinutes: 80 });
    expect(result.rows.find(row => row.energy === 'okay')).toMatchObject({ days: 1, minutes: 40, avgMinutes: 40 });
  });
  it('ignores future check-ins and sessions outside the window', () => {
    const data = fixture();
    data.studyBrain!.checkIns.push({ energy: 'fresh', availableMinutes: null, obstacle: 'none', date: '2026-11-25', at: '2026-11-25T08:00:00Z' });
    expect(brainEnergyOutput(data, now).joinedDays).toBe(0);
  });
});

describe('pace projection (estimate, never a promise)', () => {
  it('says not enough data without full-day history and never projects from today alone', () => {
    const data = fixture();
    session(data, today, 120); // today is open — excluded from the full-day window
    const result = brainPaceProjection(data, buildStudyPlan(data, today), now);
    expect(result.enough).toBe(false); expect(result.minutesPerDay).toBeNull(); expect(result.projectedFinish).toBeNull();
    expect(result.neededAfterToday).toBeGreaterThan(0);
  });
  it('projects from 28 full days of logged work only, excluding today and unselected chapters', () => {
    const data = fixture();
    for (const offset of [27, 23, 19, 15, 11, 7, 3]) session(data, addDays(today, -offset), 140);
    session(data, today, 999); session(data, addDays(today, -5), 999, 'unselected-chapter');
    const result = brainPaceProjection(data, buildStudyPlan(data, today), now);
    expect(result.enough).toBe(true);
    expect(result.minutesPerDay).toBe(35); // 7 × 140 / 28
    expect(result.projectedDays).toBe(Math.ceil(result.neededAfterToday / 35));
    expect(result.projectedFinish).toBe(addDays(today, result.projectedDays!));
  });
});

describe('recall pre-flight merge (mistakes, recurring MCQ misses, overdue revision)', () => {
  it('returns nothing without a personal routine and never invents urgency', () => {
    const data = freshData();
    expect(brainPreflight(data, buildStudyPlan(data, today), now)).toEqual([]);
  });
  it('ranks a two-week recurring MCQ miss above open mistakes and overdue revision, capped at six rows', () => {
    const data = fixture();
    const question = STARTER_QUESTIONS.find(item => item.chapterId === PERSONAL_IDS[0])!;
    const wrong = { id: 'before', questionId: question.id, correct: false, chosen: 0, subject: 'physics' as const, date: '2026-11-13', at: '2026-11-13T11:00:00Z' };
    data.attempts.push(wrong, { ...wrong, id: 'after', date: today, at: `${today}T11:00:00Z` });
    data.mistakes.push({ id: 'm1', subject: 'chemistry', text: 'গড় ভুল', date: '2026-11-15', category: 'careless', retryStatus: 'pending', resolved: false, chapterId: PERSONAL_IDS[1] });
    data.revisions.push({ id: 'r1', chapterId: PERSONAL_IDS[1], subject: 'chemistry', dueDate: '2026-11-10', interval: 7, createdAt: '2026-11-03T08:00:00Z' } as never);
    data.revisions.push({ id: 'r2', chapterId: PERSONAL_IDS[0], subject: 'physics', dueDate: addDays(today, 5), interval: 14, createdAt: '2026-11-18T08:00:00Z' } as never); // future — not overdue
    const rows = brainPreflight(data, buildStudyPlan(data, today), now);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]).toMatchObject({ kind: 'recurring', chapterId: PERSONAL_IDS[0], route: 'practice' });
    expect(rows.map(row => row.kind)).toContain('mistakes');
    expect(rows.map(row => row.kind)).toContain('revision-due');
    expect(rows.find(row => row.kind === 'revision-due')).toMatchObject({ count: 1, route: 'revision', dueDate: '2026-11-10' });
    expect(rows.every(row => ['practice', 'weakness', 'revision'].includes(row.route))).toBe(true);
  });
  it('drops resolved mistakes and completed revisions entirely', () => {
    const data = fixture();
    data.mistakes.push({ id: 'm1', subject: 'physics', text: 'done', date: '2026-11-15', category: 'careless', retryStatus: 'mastered', resolved: true, chapterId: PERSONAL_IDS[0] });
    data.revisions.push({ id: 'r1', chapterId: PERSONAL_IDS[0], subject: 'physics', dueDate: '2026-11-10', interval: 7, createdAt: '2026-11-03T08:00:00Z', completedAt: '2026-11-09T08:00:00Z' } as never);
    expect(brainPreflight(data, buildStudyPlan(data, today), now)).toEqual([]);
  });
});

describe('coach understanding of pace, pre-flight and consistency', () => {
  it.each([['pace', 'pace'], ['kobe shesh hobe?', 'pace'], ['গতি কেমন', 'pace'], ['what is my finish date', 'pace'], ['how fast am I going', 'pace']] as const)('routes "%s" to pace', (message, kind) => {
    expect(interpretBrainMessage(message, PERSONAL_IDS).kind).toBe(kind);
  });
  it.each([['ki age thik korbo', 'preflight'], ['আগে কী ঠিক করব', 'preflight'], ['what should I fix first', 'preflight'], ['revise first please', 'preflight'], ['ভুল আগে', 'preflight']] as const)('routes "%s" to preflight', (message, kind) => {
    expect(interpretBrainMessage(message, PERSONAL_IDS).kind).toBe(kind);
  });
  it.each([['streak', 'consistency'], ['consistency', 'consistency'], ['ধারাবাহিকতা কেমন', 'consistency'], ['কত দিন পড়ি', 'consistency']] as const)('routes "%s" to consistency', (message, kind) => {
    expect(interpretBrainMessage(message, PERSONAL_IDS).kind).toBe(kind);
  });
  it('keeps destructive text fail-closed even when it mentions a new intent', () => {
    expect(interpretBrainMessage('delete all notes pace', PERSONAL_IDS).kind).toBe('unsupported');
    expect(interpretBrainMessage('mark complete and fix priority', PERSONAL_IDS).kind).toBe('unsupported');
  });
});
