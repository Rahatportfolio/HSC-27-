// @vitest-environment jsdom
import { useLayoutEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlannerContext } from './context';
import type { PlannerContextValue } from './context';
import { buildPlan, freshData } from './planner';
import { setLanguage } from './i18n';
vi.mock('./components/FullBackup', () => ({ default: () => null }));
vi.mock('./components/PersonalRoutineSetup', () => ({ PersonalRoutineSettings: () => null }));
import SettingsView from './views/Settings';
afterEach(cleanup);

function EarlyDateChange() {
  useLayoutEffect(() => {
    const input = screen.getByLabelText(/^Routine start date/) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-12-01');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, []);
  return null;
}

it('preserves a date edit and its linked dates if it happens before the initial sync effect', async () => {
  setLanguage('en');
  const data = freshData();
  data.settings = { ...data.settings, startDate: '2026-11-20', boostStartDate: '2026-12-07', examDatePolicy: 'shift' };
  const context = { data, plan: buildPlan(data.settings), today: '2026-11-20', setData: vi.fn(), notify: vi.fn(), confirm: vi.fn(), setSelectedDate: vi.fn(), setTheme: vi.fn(), setFontScale: vi.fn(), timer: { reset: vi.fn() } } as unknown as PlannerContextValue;
  await act(async () => { render(<PlannerContext.Provider value={context}><SettingsView /><EarlyDateChange /></PlannerContext.Provider>); });
  expect((screen.getByLabelText(/^Routine start date/) as HTMLInputElement).value).toBe('2026-12-01');
  expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('2026-12-18');
});
