// @vitest-environment jsdom
import './test/pinnedDate';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY } from './planner';
import { buildStudyPlan } from './studyPlan';
import { personalDataFixture, PERSONAL_IDS, personalWorkload } from './test/personalRoutineFixture';

beforeEach(() => {
  localStorage.clear(); window.location.hash = '#today';
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  window.scrollTo = vi.fn();
});
afterEach(cleanup);

describe('capacity messages on the actual app', () => {
  it('does not show a warning just because a pair continues after two days', async () => {
    const data = personalDataFixture();
    for (const id of PERSONAL_IDS) data.personalRoutine!.workloads[id] = personalWorkload(480);
    data.notes['2026-11-20'] = 'Keep my note';
    data.completed['old-evidence'] = '2026-11-19T10:00:00Z';
    const before = buildStudyPlan(data, '2026-11-20');
    expect(before.filter(day => day.tasks.some(task => task.personalWork)).length).toBeGreaterThan(2);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />);
    await screen.findByRole('heading', { name: 'Only the chapters you choose' });
    await waitFor(() => expect(screen.queryByRole('alert', { name: 'Schedule capacity warning' })).toBeNull());
    expect(screen.queryByRole('region', { name: 'Actual duration and capacity gaps' })).toBeNull();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.notes['2026-11-20']).toBe('Keep my note');
    expect(saved.completed['old-evidence']).toBe('2026-11-19T10:00:00Z');
    expect(saved.personalRoutine.chapterIds).toEqual(data.personalRoutine!.chapterIds);
  }, 30000);

  it('still warns when required work does not fit before the target', async () => {
    const data = personalDataFixture();
    data.settings.testExamDate = '2026-11-21'; data.settings.examDate = '2026-11-22';
    for (const id of PERSONAL_IDS) data.personalRoutine!.workloads[id] = personalWorkload(480);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />);
    const warning = await screen.findByRole('alert', { name: 'Schedule capacity warning' });
    expect(within(warning).getByText(/does not fit before the target/)).toBeTruthy();
    expect(warning.textContent).not.toContain('SAME pair continues');
  }, 30000);
});
