// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalNote } from './components';
import { PlannerContext } from './context';
import type { PlannerContextValue } from './context';
import type { AppData } from './planner';
import { personalDataFixture } from './test/personalRoutineFixture';
import { setLanguage } from './i18n';

afterEach(cleanup);
describe('notes under delayed React state updates', () => {
  it('captures the text at the input event, not the later reset DOM value', () => {
    setLanguage('en'); const data = personalDataFixture(); let queued: ((data: AppData) => AppData) | undefined;
    const setData = vi.fn((next: unknown) => { queued = next as (data: AppData) => AppData; });
    render(<PlannerContext.Provider value={{ data, setData, selectedDate: data.settings.startDate, storageOk: true } as unknown as PlannerContextValue}><LocalNote /></PlannerContext.Provider>);
    const input = screen.getByRole('textbox', { name: 'Day note' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Keep this exact note' } });
    // React can restore the controlled input before it applies/replays the updater.
    input.value = '';
    expect(queued).toBeDefined();
    expect(queued!(data).notes[data.settings.startDate]).toBe('Keep this exact note');
    expect(queued!(data).notes[data.settings.startDate]).toBe('Keep this exact note');
  });
});
