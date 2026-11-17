import { describe, expect, it } from 'vitest';
import {
  BREAK_AFTER_MINUTES, SITTING_GAP_MINUTES, STREAK_FLOOR_MINUTES,
  continuousMinutesToday, dhakaHour, focusActions, focusReport, partOfDay, sittingsOf,
} from './focus';
import { addDays } from './planner';
import type { StudySession } from './types';

const TODAY = '2026-11-16';
/** Dhaka is UTC+6, so 09:00 local is 03:00Z. */
const at = (date: string, hour: number, minute = 0): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + hour * 3600000 - 6 * 3600000 + minute * 60000).toISOString();

const session = (id: string, date: string, hour: number, minutes: number, subject: StudySession['subject'] = 'physics', minute = 0): StudySession => ({
  id, date, at: at(date, hour, minute), minutes, subject, mode: 'pomodoro',
});

const report = (sessions: StudySession[], now = Date.parse(at(TODAY, 23))) => focusReport({ studySessions: sessions }, TODAY, 28, now);

describe('what counts as a sitting', () => {
  it('joins sessions that are close together and splits the ones that are not', () => {
    const sittings = sittingsOf([
      session('a', TODAY, 8, 25),
      session('b', TODAY, 8, 5, 'physics', 30),
      session('c', TODAY, 10, 25),
    ]);
    expect(sittings).toHaveLength(2);
    expect(sittings[0].minutes).toBe(30); // 25 + 5, not a guess at a rounded block
    expect(sittings[0].sessions).toBe(2);
    expect(sittings[1].minutes).toBe(25);
  });

  it('treats a gap just above the limit as a new sitting', () => {
    const first = session('a', TODAY, 8, 25);
    const second = { ...session('b', TODAY, 9, 25), at: new Date(Date.parse(at(TODAY, 8)) + (25 + SITTING_GAP_MINUTES + 1) * 60000).toISOString() };
    expect(sittingsOf([first, second])).toHaveLength(2);
  });

  it('never merges sessions across a day boundary', () => {
    const sittings = sittingsOf([session('a', addDays(TODAY, -1), 23, 25), session('b', TODAY, 0, 25)]);
    expect(sittings).toHaveLength(2);
  });
});

describe('time of day', () => {
  it('reads the hour in Dhaka, not UTC', () => {
    expect(dhakaHour(at(TODAY, 9))).toBe(9);
    expect(dhakaHour(at(TODAY, 23))).toBe(23);
    expect(dhakaHour('2026-11-16T18:30:00.000Z')).toBe(0); // 00:30 next day in Dhaka
  });

  it('treats 5am as the start of the study day and 4am as night', () => {
    expect(partOfDay(4)).toBe('night');
    expect(partOfDay(5)).toBe('morning');
    expect(partOfDay(13)).toBe('afternoon');
    expect(partOfDay(19)).toBe('evening');
    expect(partOfDay(22)).toBe('night');
  });
});

describe('honest totals', () => {
  it('reports nothing for a profile with no sessions', () => {
    const result = report([]);
    expect(result.minutes).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.insights[0].key).toBe('empty');
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it('ignores sessions outside the window', () => {
    const result = report([session('old', addDays(TODAY, -40), 9, 120), session('new', TODAY, 9, 30)]);
    expect(result.minutes).toBe(30);
    expect(result.caveats.join(' ')).toContain('1');
  });

  it('counts short and long sessions without hiding them', () => {
    const result = report([session('a', TODAY, 9, 5), session('b', TODAY, 10, 25), session('c', TODAY, 14, 180)]);
    expect(result.quality.shortSessions).toBe(1);
    expect(result.quality.longSessions).toBe(1);
    expect(result.quality.shortShare).toBe(33);
    expect(result.minutes).toBe(210);
  });
});

describe('streak', () => {
  it('only counts a day that reaches the floor', () => {
    const thin = session('thin', TODAY, 9, STREAK_FLOOR_MINUTES - 1);
    expect(report([thin]).streak).toBe(0);
    expect(report([{ ...thin, minutes: STREAK_FLOOR_MINUTES }]).streak).toBe(1);
  });

  it('does not break the run just because today is not finished yet', () => {
    const yesterday = session('y', addDays(TODAY, -1), 9, 60);
    const before = session('b', addDays(TODAY, -2), 9, 60);
    const result = report([yesterday, before]);
    expect(result.streak).toBe(2);
  });

  it('stops at a genuinely missed day', () => {
    const result = report([session('y', addDays(TODAY, -1), 9, 60), session('b', addDays(TODAY, -3), 9, 60)]);
    expect(result.streak).toBe(1);
  });

  it('reports the longest run in the window separately from the current one', () => {
    const sessions = [0, 1, 2, 3].map(offset => session(`s${offset}`, addDays(TODAY, -10 + offset), 9, 60));
    const result = report(sessions);
    expect(result.longestStreak).toBe(4);
    expect(result.streak).toBe(0);
  });
});

describe('the "break now" signal', () => {
  it('starts counting only from back-to-back sessions', () => {
    const sessions = [
      session('a', TODAY, 9, 25),
      session('b', TODAY, 9, 25, 'physics', 25),
      session('c', TODAY, 9, 25, 'physics', 50),
    ];
    // 09:00→09:25→09:50→10:15 with no gaps at all.
    const result = continuousMinutesToday(sessions, Date.parse(at(TODAY, 10, 15)), TODAY);
    expect(result).toBe(75);
    expect(result >= BREAK_AFTER_MINUTES).toBe(true);
  });

  it('forgets a chain that was broken long ago', () => {
    const now = Date.parse(at(TODAY, 13));
    expect(continuousMinutesToday([session('a', TODAY, 9, 40)], now, TODAY)).toBe(0);
  });

  it('never counts sessions from another day', () => {
    const now = Date.parse(at(TODAY, 9));
    const yesterday = session('y', addDays(TODAY, -1), 8, 120);
    expect(continuousMinutesToday([yesterday], now, TODAY)).toBe(0);
  });
});

describe('insights stay tied to the numbers', () => {
  it('names the strongest hour only when there is data for it', () => {
    const result = report([session('a', TODAY, 7, 60), session('b', TODAY, 20, 30)]);
    expect(result.bestHour?.hour).toBe(7);
    expect(result.insights.some(insight => insight.key === 'best-hour')).toBe(true);
  });

  it('warns about scattering instead of praising volume', () => {
    const sessions = Array.from({ length: 8 }, (_, index) => session(`s${index}`, TODAY, 9, 5, 'physics', index * 40));
    const result = report(sessions);
    expect(result.insights.some(insight => insight.key === 'short' || insight.key === 'scatter')).toBe(true);
  });

  it('always tells the student what the numbers cannot say', () => {
    const result = report([session('a', TODAY, 9, 60)]);
    expect(result.caveats.join(' ')).toContain('মনোযোগের গুণ নয়');
  });
});

describe('next actions', () => {
  it('suggests a break when the sitting is long', () => {
    const now = Date.parse(at(TODAY, 10, 10));
    const result = focusReport({ studySessions: [session('a', TODAY, 9, 60)] }, TODAY, 28, now);
    expect(result.breakDue).toBe(true);
    expect(focusActions(result, [])[0].key).toBe('break');
  });

  it('suggests a first block for an empty day, and never more than three actions', () => {
    const actions = focusActions(report([]), []);
    expect(actions[0].key).toBe('start');
    expect(actions.length).toBeLessThanOrEqual(3);
  });
});
