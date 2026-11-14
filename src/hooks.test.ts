import { describe, expect, it } from 'vitest';
import { parseTimerState } from './hooks';

describe('focus timer persistence', () => {
  it('does not instantly complete a corrupt running timer with endAt=0', () => {
    const t = parseTimerState(JSON.stringify({ duration: 25, remaining: 10, running: true, endAt: 0 }));
    expect(t.running).toBe(false);
    expect(t.remaining).toBe(1500);
    expect(t.endAt).toBe(0);
  });
  it('keeps a valid running timer and gives legacy timers a stable completion id', () => {
    const endAt = Date.now() + 60000;
    const t = parseTimerState(JSON.stringify({ duration: 50, remaining: 60, running: true, endAt }));
    expect(t.running).toBe(true);
    expect(t.endAt).toBe(endAt);
    expect(t.id).toBe(`legacy-${endAt}`);
  });
  it('falls back safely for malformed JSON and impossible remaining values', () => {
    expect(parseTimerState('{').running).toBe(false);
    expect(parseTimerState(JSON.stringify({ duration: 25, remaining: 99999, running: false, endAt: 0 })).remaining).toBe(1500);
  });
});
