import { describe, expect, it } from 'vitest';
import { parseStudyTimer } from './hooks';

describe('study timer persistence', () => {
  it('resets a running timer that has no real start time', () => {
    const timer = parseStudyTimer(JSON.stringify({ mode: 'pomodoro', durationMin: 25, running: true, startedAt: null }));
    expect(timer.running).toBe(false);
    expect(timer.durationMin).toBe(25);
    expect(timer.phase).toBe('focus');
  });
  it('keeps a valid running pomodoro and its phase', () => {
    const startedAt = Date.now() - 60_000;
    const timer = parseStudyTimer(JSON.stringify({ mode: 'pomodoro', phase: 'short', durationMin: 5, accumulatedMs: 0, running: true, startedAt, subject: 'chemistry', chapterId: 'chemistry-1-2', logging: false, focusCount: 4 }));
    expect(timer.running).toBe(true);
    expect(timer.startedAt).toBe(startedAt);
    expect(timer.phase).toBe('short');
    expect(timer.subject).toBe('chemistry');
    expect(timer.chapterId).toBe('chemistry-1-2');
    expect(timer.logging).toBe(false);
    expect(timer.focusCount).toBe(4);
  });
  it('falls back safely for malformed JSON, impossible durations and unknown chapters', () => {
    expect(parseStudyTimer('{').mode).toBe('pomodoro');
    const timer = parseStudyTimer(JSON.stringify({ mode: 'countdown', durationMin: 999, accumulatedMs: -4, running: false, chapterId: 'not-a-chapter' }));
    expect(timer.durationMin).toBe(25);
    expect(timer.accumulatedMs).toBe(0);
    expect(timer.chapterId).toBe('');
  });
  it('honours a configured pomodoro length for fresh state', () => {
    expect(parseStudyTimer(null, { pomodoroFocus: 50 }).durationMin).toBe(50);
  });
});
