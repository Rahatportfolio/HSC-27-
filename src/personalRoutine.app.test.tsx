// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { freshTimerState, TIMER_KEY } from './hooks';
import { STORAGE_KEY } from './planner';
import { buildStudyPlan } from './studyPlan';
import { personalDataFixture } from './test/personalRoutineFixture';

beforeEach(() => {
  localStorage.clear(); window.location.hash = '#today';
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  window.scrollTo = vi.fn();
});
afterEach(cleanup);

describe('real App personal timer completion', () => {
  it.each([false, true])('saves actual minutes without certifying a source range (removed from current plan: %s)', async removed => {
    const data = personalDataFixture(); const task = buildStudyPlan(data, data.settings.startDate)[0].tasks[0];
    data.completed['legacy-unchanged'] = '2026-11-16T08:00:00Z';
    if (removed) data.removedTasks.push(task.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(TIMER_KEY, JSON.stringify({ ...freshTimerState(), mode: 'countdown', phase: 'none', durationMin: 1, running: true, startedAt: Date.now() - 61_000, taskId: task.id, subject: task.subject, chapterId: task.chapterIds[0], logging: true }));
    render(<App />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).studySessions).toHaveLength(1));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.studySessions[0]).toMatchObject({ minutes: 1, subject: task.subject, chapterId: task.chapterIds[0] });
    expect(saved.completed).toEqual(data.completed);
  });
});
