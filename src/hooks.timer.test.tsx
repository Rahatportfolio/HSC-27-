// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudyTimer } from './hooks';
import { DEFAULT_SETTINGS } from './planner';

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('study timer transitions', () => {
  it('logs a pomodoro focus session after changing mode', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: { ...DEFAULT_SETTINGS, pomodoroFocus: 1 }, onComplete, notify: vi.fn() }));
    act(() => { result.current.setMode('countdown'); result.current.setMode('pomodoro'); });
    expect(result.current.logging).toBe(true);
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(60_500));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ minutes: 1, mode: 'pomodoro' });
    expect(result.current.phase).toBe('short');
    expect(result.current.logging).toBe(false);
  });

  it('does not count a paused and resumed break as study', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => result.current.startBreak(1));
    act(() => vi.advanceTimersByTime(30_000));
    act(() => result.current.pause());
    expect(result.current.logging).toBe(false);
    act(() => result.current.start());
    expect(result.current.logging).toBe(false);
    act(() => vi.advanceTimersByTime(30_500));
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it('preserves a paused timer even if it was paused within its first second', () => {
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete: vi.fn(), notify: vi.fn() }));
    act(() => result.current.start());
    act(() => result.current.pause());
    expect(result.current.running).toBe(false);
    expect(result.current.accumulatedMs).toBeGreaterThan(0);
    const persisted = JSON.parse(localStorage.getItem('hsc27-study-timer-v2') || '{}');
    expect(persisted.accumulatedMs).toBeGreaterThan(0);
  });
});

describe('timer completion safety', () => {
  it('clears the finished countdown so it cannot be saved twice and can start a new session', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', durationMin: 1, taskId: 'task-1' }));
    act(() => vi.advanceTimersByTime(60_500));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.accumulatedMs).toBe(0);
    expect(result.current.taskId).toBe('');
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(60_500));
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls[1][0].taskId).toBe('');
  });
  it('resets a pomodoro break back to a loggable focus session', () => {
    const { result } = renderHook(() => useStudyTimer({ settings: { ...DEFAULT_SETTINGS, pomodoroFocus: 1 }, onComplete: vi.fn(), notify: vi.fn() }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(60_500));
    expect(result.current.phase).toBe('short');
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ phase: 'focus', durationMin: 1, logging: true, running: false });
  });
});

it('never writes an invalid over-12-hour stopwatch session', () => {
  const onComplete = vi.fn(), notify = vi.fn();
  const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify }));
  act(() => result.current.setMode('stopwatch'));
  act(() => result.current.start());
  vi.setSystemTime(new Date('2026-11-16T01:00:00Z'));
  act(() => result.current.saveStopwatch());
  expect(onComplete.mock.calls[0][0].minutes).toBe(720);
  expect(notify.mock.calls[0][0]).toContain('বাকি সময় আলাদা');
});

it('completes a countdown instead of losing it when paused just after its deadline', () => {
  const onComplete = vi.fn();
  const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
  act(() => result.current.startPreset({ subject: 'physics', durationMin: 1, taskId: 'task' }));
  vi.setSystemTime(new Date('2026-11-15T12:01:00.100Z'));
  act(() => result.current.pause());
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].taskId).toBe('task');
  expect(result.current.running).toBe(false);
});

describe('adjusting the duration mid-session', () => {
  it('keeps elapsed progress and pauses instead of wiping the session', () => {
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete: vi.fn(), notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', durationMin: 30 }));
    act(() => vi.advanceTimersByTime(5 * 60_000));
    act(() => result.current.pause());
    act(() => result.current.adjustDuration(10));
    expect(result.current).toMatchObject({ durationMin: 10, running: false, accumulatedMs: 5 * 60_000 });
    expect(result.current.remainingSec).toBe(5 * 60);
  });

  it('clamps elapsed time when the new length is shorter than the elapsed time', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', durationMin: 30 }));
    act(() => vi.advanceTimersByTime(5 * 60_000));
    act(() => result.current.pause());
    act(() => result.current.adjustDuration(3));
    expect(result.current).toMatchObject({ durationMin: 3, running: false, accumulatedMs: 3 * 60_000 });
    expect(result.current.remainingSec).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('detaches the planned task when the length really changes, like setDuration', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', durationMin: 30, taskId: 'planned' }));
    act(() => vi.advanceTimersByTime(60_000));
    act(() => result.current.pause());
    act(() => result.current.adjustDuration(1));
    expect(result.current.taskId).toBe('');
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(60_000));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].taskId).toBe('');
  });

  it('keeps the task link when the chosen length is unchanged', () => {
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete: vi.fn(), notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', durationMin: 30, taskId: 'planned' }));
    act(() => vi.advanceTimersByTime(60_000));
    act(() => result.current.pause());
    act(() => result.current.adjustDuration(30));
    expect(result.current.taskId).toBe('planned');
    expect(result.current.accumulatedMs).toBe(60_000);
  });

  it('clamps to 1..720 minutes and ignores stopwatch mode', () => {
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete: vi.fn(), notify: vi.fn() }));
    act(() => result.current.adjustDuration(9999));
    expect(result.current.durationMin).toBe(720);
    act(() => result.current.adjustDuration(-5));
    expect(result.current.durationMin).toBe(1);
    act(() => result.current.setMode('stopwatch'));
    act(() => result.current.adjustDuration(25));
    expect(result.current.durationMin).toBe(0);
  });
});
