// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { freshTimerState, TIMER_KEY } from './hooks';
import { STORAGE_KEY } from './planner';
import { buildStudyPlan } from './studyPlan';
import { parseBackup } from './storage';
import { newStudyBrain } from './studyBrain';
import { personalDataFixture } from './test/personalRoutineFixture';

const now = new Date('2026-11-20T12:05:00.000Z');
beforeEach(() => {
  localStorage.clear(); window.location.hash = '#brain';
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  window.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const read = () => parseBackup(localStorage.getItem(STORAGE_KEY)!);

describe('real App local Study Brain persistence and timer boundaries', () => {
  it('persists only confirmed choices across remount and preserves original planner data', async () => {
    const data = personalDataFixture(); data.notes['2026-11-20'] = 'Keep my private dated note';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); let view = render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'A little context. A better next step.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable local Study Brain' }));
    fireEvent.change(screen.getByLabelText('Say it briefly (Bengali / Banglish / English)'), { target: { value: 'aj 30 min ache, tired' } });
    fireEvent.click(screen.getByRole('button', { name: 'Interpret' }));
    expect(read().studyBrain!.checkIns).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Remember check-in' }));
    await waitFor(() => expect(read().studyBrain!.checkIns).toHaveLength(1));
    const before = read(); expect(before.studyBrain!.checkIns[0]).toMatchObject({ energy: 'low', availableMinutes: 30 });
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('aj 30 min ache');
    view.unmount(); view = render(<App />);
    expect((await screen.findByLabelText('Time for this focus (minutes)') as HTMLInputElement).value).toBe('30');
    expect(read().notes).toEqual(data.notes); expect(read().personalRoutine).toEqual(data.personalRoutine); expect(read().completed).toEqual(data.completed);
    view.unmount();
  });
  it('a shorter brain timer that is not a whole visible task logs time, never completes its source', async () => {
    const data = personalDataFixture(); data.studyBrain = newStudyBrain(); data.completed['legacy-keep'] = '2026-11-16T08:00:00Z';
    const task = buildStudyPlan(data, data.settings.startDate)[0].tasks[0];
    const part = `smart-part|${encodeURIComponent(task.personalWork!.sourceId)}|0|1`;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(TIMER_KEY, JSON.stringify({ ...freshTimerState(), mode: 'countdown', phase: 'none', durationMin: 1, running: true,
      startedAt: Date.now() - 61_000, taskId: part, subject: task.subject, chapterId: task.chapterIds[0], label: 'Brain focus', logging: true }));
    render(<App />);
    await waitFor(() => expect(read().studySessions).toHaveLength(1));
    expect(read().studySessions[0]).toMatchObject({ minutes: 1, chapterId: task.chapterIds[0] });
    expect(read().completed).toEqual(data.completed); expect(read().studyBrain).toEqual(data.studyBrain);
  });
  it('turning off the brain keeps memory on disk and never re-enables it on reload', async () => {
    const data = personalDataFixture(); data.studyBrain = newStudyBrain(); localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    let view = render(<App />); fireEvent.click(await screen.findByRole('button', { name: 'Pause, keep memory' }));
    await waitFor(() => expect(read().studyBrain!.enabled).toBe(false)); view.unmount(); view = render(<App />);
    expect(await screen.findByRole('button', { name: 'Resume Study Brain' })).toBeTruthy();
    expect(read().studyBrain!.enabled).toBe(false); expect(read().personalRoutine).toEqual(data.personalRoutine); view.unmount();
  });
});
