// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshTimerState, TIMER_KEY, useStudyTimer } from './hooks';
import { CHAPTERS } from './data';
import { DEFAULT_SETTINGS, freshData } from './planner';
import { addStudySession, setTaskCompletion } from './study';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T08:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('a measured session cannot silently complete different or unfinished work', () => {
  it('saves an early finish as actual study time without marking the entire planned task complete', () => {
    let data = freshData();
    const onComplete = vi.fn((session) => {
      data = addStudySession(data, { ...session, chapterId: session.chapterId || undefined });
      if (session.taskId) data = setTaskCompletion(data, [session.taskId], true);
    });
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', durationMin: 30, taskId: 'planned-half-hour' }));
    act(() => vi.advanceTimersByTime(2 * 60_000));
    act(() => result.current.finishNow());
    expect(data.studySessions).toHaveLength(1);
    expect(data.studySessions[0].minutes).toBe(2);
    expect(data.completed).toEqual({});
    expect(result.current.running).toBe(false);
  });

  it('keeps genuine full-duration completion when the student finishes between the final display ticks', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', durationMin: 1, taskId: 'finished' }));
    vi.setSystemTime(new Date('2026-11-20T08:01:00.100Z'));
    act(() => result.current.finishNow());
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ taskId: 'finished', minutes: 1 });
    act(() => vi.advanceTimersByTime(1000));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it.each(['subject', 'chapter', 'duration'] as const)('detaches a task when its timer %s is changed', (field) => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', chapterId: CHAPTERS[0].id, durationMin: 30, taskId: 'original' }));
    act(() => {
      if (field === 'subject') result.current.setSubject('chemistry');
      if (field === 'chapter') result.current.setChapter(CHAPTERS.find(c => c.subject === 'physics' && c.id !== CHAPTERS[0].id)!.id);
      if (field === 'duration') result.current.setDuration(1);
    });
    expect(result.current.taskId).toBe('');
    if (!result.current.running) act(() => result.current.start());
    act(() => vi.advanceTimersByTime(result.current.durationMin * 60_000));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].taskId).toBe('');
  });

  it('does not turn a legacy stopwatch task association into full planned-task completion', () => {
    localStorage.setItem(TIMER_KEY, JSON.stringify({ ...freshTimerState(), mode: 'stopwatch', accumulatedMs: 120_000, taskId: 'old-preset' }));
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete, notify: vi.fn() }));
    act(() => { result.current.saveStopwatch(); });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ minutes: 2, taskId: '' }));
  });

  it('retains the task association for unchanged chapter and subject values', () => {
    const { result } = renderHook(() => useStudyTimer({ settings: DEFAULT_SETTINGS, onComplete: vi.fn(), notify: vi.fn() }));
    act(() => result.current.startPreset({ subject: 'physics', chapterId: CHAPTERS[0].id, durationMin: 30, taskId: 'unchanged' }));
    act(() => result.current.setChapter(CHAPTERS[0].id));
    expect(result.current.taskId).toBe('unchanged');
    act(() => result.current.setSubject('physics'));
    expect(result.current.taskId).toBe('unchanged');
    expect(result.current.chapterId).toBe(CHAPTERS[0].id);
  });
});
