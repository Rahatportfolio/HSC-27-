import { describe, expect, it } from 'vitest';
import {
  CADENCE_SPECS, WEEKLY_TEST_WEEKDAY, cadenceSlots, cadenceStats, cadenceWeek, missedDaily,
  nextCadenceSlot, withCadence,
} from './cadence';
import { saveExamSession } from './examSim';
import { freshData } from './planner';
import type { AppData } from './planner';
import type { ExamCadence, ExamSession } from './types';
import { STARTER_QUESTIONS } from './quiz-data';
import { setLanguage } from './i18n';

const TODAY = '2026-03-13'; // a Friday
const session = (date: string, score: number, total: number, extra: Partial<ExamSession> = {}): ExamSession => ({
  id: `s-${date}-${score}-${total}-${extra.cadence ?? ''}`, mode: 'subject', title: 'টেস্ট', chapterIds: [], questionIds: ['q'],
  answers: {}, score, total, durationMin: 10, timeTakenSec: 300, date, at: `${date}T10:00:00.000Z`, breakdown: [], ...extra,
});
const withSessions = (sessions: ExamSession[]): AppData => ({ ...freshData(), examSessions: sessions });

describe('cadence slots', () => {
  it('starts with all three slots due for a new student', () => {
    const slots = cadenceSlots(freshData(), TODAY);
    expect(slots.map(slot => slot.cadence)).toEqual(['daily', 'weekly', 'monthly']);
    expect(slots.every(slot => slot.due && slot.lastDate === null && slot.daysSince === null)).toBe(true);
    expect(slots.map(slot => slot.questions)).toEqual([10, 25, 50]);
  });

  it('closes the daily slot for the rest of the day', () => {
    const slots = cadenceSlots(withSessions([session(TODAY, 7, 10, { cadence: 'daily' })]), TODAY);
    expect(slots[0]).toMatchObject({ due: false, lateDays: 0, daysSince: 0, lastScore: 70, takenLast30: 1 });
  });

  it('reopens the daily slot after one day and counts the lateness', () => {
    const data = withSessions([session('2026-03-10', 7, 10, { cadence: 'daily' })]);
    expect(cadenceSlots(data, TODAY)[0]).toMatchObject({ due: true, lateDays: 2, daysSince: 3 });
  });

  it('keeps the weekly slot quiet for seven days', () => {
    const data = withSessions([session('2026-03-09', 20, 25, { cadence: 'weekly' })]);
    expect(cadenceSlots(data, TODAY)[1]).toMatchObject({ due: false, daysSince: 4 });
    expect(cadenceSlots(data, '2026-03-17')[1]).toMatchObject({ due: true, lateDays: 1 });
  });

  it('infers the cadence of a paper that was not started from the routine', () => {
    const data = withSessions([
      session('2026-03-12', 8, 10, { mode: 'chapter' }), // chapter paper → daily
      session('2026-03-10', 18, 25, { mode: 'subject' }), // subject paper → weekly
      session('2026-03-05', 40, 50, { mode: 'full' }), // full mock → monthly
    ]);
    const slots = cadenceSlots(data, TODAY);
    expect(slots.map(slot => slot.lastDate)).toEqual(['2026-03-12', '2026-03-10', '2026-03-05']);
    // Only the two-day-old daily paper is due again; weekly and monthly are still fresh.
    expect(slots.map(slot => slot.due)).toEqual([true, false, false]);
  });

  it('picks the most important due slot: monthly before weekly before daily', () => {
    // Monthly and weekly were both taken five days ago; daily is still owed today.
    const data = withSessions([
      session('2026-03-08', 40, 50, { cadence: 'monthly' }),
      session('2026-03-08', 20, 25, { cadence: 'weekly' }),
    ]);
    expect(nextCadenceSlot(data, TODAY)?.cadence).toBe('daily');
    // Once the week has turned, the weekly slot outranks the daily one.
    expect(nextCadenceSlot(data, '2026-03-16')?.cadence).toBe('weekly');
  });

  it('returns null when every slot was just done', () => {
    const data = withSessions([
      session(TODAY, 8, 10, { cadence: 'daily' }),
      session(TODAY, 20, 25, { cadence: 'weekly' }),
      session(TODAY, 40, 50, { cadence: 'monthly' }),
    ]);
    expect(nextCadenceSlot(data, TODAY)).toBeNull();
  });
});

describe('the week strip', () => {
  it('starts on Monday and marks the Friday slot as weekly', () => {
    const week = cadenceWeek(freshData(), TODAY);
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe('2026-03-09');
    expect(week[6].date).toBe('2026-03-15');
    expect(new Date('2026-03-13T00:00:00Z').getUTCDay()).toBe(WEEKLY_TEST_WEEKDAY);
    expect(week.find(day => day.date === '2026-03-13')?.cadence).toBe('weekly');
    expect(week.find(day => day.date === '2026-03-14')?.cadence).toBe('daily');
    expect(week[0].cadence).toBe('daily');
    expect(week.every(day => !day.done)).toBe(true);
  });

  it.each(['2026-11-16', '2026-11-20', '2026-11-22', '2027-01-01', '2028-03-01'])('marks only the actual Friday, not Saturday or today’s most overdue slot (%s)', today => {
    for (const language of ['bn', 'en'] as const) {
      setLanguage(language);
      try {
        const week = cadenceWeek(freshData(), today);
        expect(week.filter(day => day.cadence === 'weekly')).toHaveLength(1);
        for (const day of week) {
          const isFriday = new Date(`${day.date}T00:00:00Z`).getUTCDay() === 5;
          expect(day.cadence, day.date).toBe(isFriday ? 'weekly' : 'daily');
          if (isFriday) expect(day.weekday).toBe(language === 'en' ? 'Fri' : 'শুক্র');
        }
      } finally { setLanguage('bn'); }
    }
  });

  it('marks days that already have a paper', () => {
    const week = cadenceWeek(withSessions([session('2026-03-11', 6, 10, { cadence: 'daily' })]), TODAY);
    expect(week.find(day => day.date === '2026-03-11')?.done).toBe(true);
    expect(week.filter(day => day.done)).toHaveLength(1);
  });
});

describe('routine statistics', () => {
  it('counts papers in the last week and month and measures consistency', () => {
    const stats = cadenceStats(withSessions([
      session('2026-03-13', 8, 10, { cadence: 'daily' }),
      session('2026-03-12', 6, 10, { cadence: 'daily' }),
      session('2026-02-20', 30, 50, { cadence: 'monthly' }),
      session('2026-01-01', 3, 10, { cadence: 'daily' }), // outside the window
    ]), TODAY);
    expect(stats.taken7).toBe(2);
    expect(stats.taken30).toBe(3);
    expect(stats.average30).toBe(Math.round((80 + 60 + 60) / 3));
    expect(stats.consistency).toBe(Math.round(3 / 30 * 100));
    expect(stats.bestCadence).toBe('daily');
  });

  it('is empty and safe before the first paper', () => {
    expect(cadenceStats(freshData(), TODAY)).toEqual({ taken7: 0, taken30: 0, average30: 0, consistency: 0, bestCadence: null });
  });
});

describe('missed daily nudge', () => {
  it('stays quiet for a brand-new student', () => {
    expect(missedDaily(freshData(), TODAY)).toBeNull();
  });

  it('stays quiet after a paper today or yesterday', () => {
    expect(missedDaily(withSessions([session('2026-03-12', 5, 10, { cadence: 'daily' })]), TODAY)).toBeNull();
    expect(missedDaily(withSessions([session(TODAY, 5, 10, { cadence: 'daily' })]), TODAY)).toBeNull();
  });

  it('nudges after two clear days', () => {
    expect(missedDaily(withSessions([session('2026-03-11', 5, 10, { cadence: 'daily' })]), TODAY)).toEqual({ date: '2026-03-12', days: 2 });
  });
});

describe('storing the cadence', () => {
  it('saves which routine slot a paper closed', () => {
    const data = freshData();
    const questions = STARTER_QUESTIONS.slice(0, 2);
    expect(questions).toHaveLength(2);
    const next = saveExamSession(data, {
      mode: 'chapter', title: 'দৈনিক', questions, answers: {}, durationMin: 5, timeTakenSec: 30,
      date: TODAY, cadence: 'daily' as ExamCadence,
    });
    expect(next.examSessions[0].cadence).toBe('daily');
    expect(cadenceSlots(next, TODAY)[0].due).toBe(false);
  });

  it('leaves the cadence off when a paper was taken from the free setup', () => {
    const data = freshData();
    const questions = STARTER_QUESTIONS.slice(0, 2);
    expect(questions).toHaveLength(2);
    const next = saveExamSession(data, { mode: 'chapter', title: 'নিজের', questions, answers: {}, durationMin: 5, timeTakenSec: 30, date: TODAY });
    expect(next.examSessions[0].cadence).toBeUndefined();
  });

  it('withCadence only touches sessions it is given a cadence for', () => {
    const base = session(TODAY, 1, 2);
    expect(withCadence(base, undefined)).toBe(base);
    expect(withCadence(base, 'weekly')).toMatchObject({ cadence: 'weekly', id: base.id });
  });

  it('documents the three specs in one place', () => {
    expect(CADENCE_SPECS.map(spec => spec.cadence)).toEqual(['daily', 'weekly', 'monthly']);
    expect(CADENCE_SPECS.every(spec => spec.questions > 0 && spec.everyDays > 0)).toBe(true);
  });
});

describe('morning briefing line', () => {
  it('names the owed paper and never nags when everything is closed', async () => {
    const { buildExamRoutineLine } = await import('./notifications');
    const empty = buildExamRoutineLine(freshData(), TODAY);
    expect(empty).toContain('আজকের পরীক্ষা');
    expect(empty).toContain('৫০');
    const closed = withSessions([
      session(TODAY, 8, 10, { cadence: 'daily' }),
      session(TODAY, 20, 25, { cadence: 'weekly' }),
      session(TODAY, 40, 50, { cadence: 'monthly' }),
    ]);
    expect(buildExamRoutineLine(closed, TODAY)).toBeNull();
  });
});
