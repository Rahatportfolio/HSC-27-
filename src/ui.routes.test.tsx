// @vitest-environment jsdom
/**
 * Route sweep: every view is opened through the real router and checked for the
 * three things a student would actually notice — a crash, a blank screen, and
 * React/console errors that the other tests only see if they happen to touch
 * that view.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';

const ROUTES = [
  'today', 'calendar', 'syllabus', 'videos', 'scanner', 'pdfs', 'testprep',
  'practice', 'flashcards', 'revision', 'examsim', 'weakness', 'heatmap',
  'backlog', 'exams', 'timer', 'analytics', 'library', 'reminders', 'audit',
  'storage', 'settings',
] as const;

let errors: string[] = [];
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation((...args) => { errors.push(args.map(String).join(' ')); });
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData()));
  window.location.hash = '';
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise(r => setTimeout(r, 90)); });
};

describe('every route renders something real', () => {
  it('opens all 22 routes without crashing or rendering a blank screen', async () => {
    const failures: string[] = [];
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');

    for (const route of ROUTES) {
      errors = [];
      await act(async () => { window.location.hash = `#${route}`; window.dispatchEvent(new HashChangeEvent('hashchange')); });
      await settle();

      const view = document.querySelector('.view') as HTMLElement | null;
      if (!view) { failures.push(`${route}: no .view mounted`); continue; }
      const text = (view.textContent ?? '').trim();
      // A real screen has a heading and a meaningful body; a broken one is blank
      // or still shows the previous screen.
      const hasHeading = !!view.querySelector('h1, h2, h3');
      if (!hasHeading) failures.push(`${route}: no heading`);
      if (text.length < 40) failures.push(`${route}: body only ${text.length} chars`);
      const reactError = errors.find(e => /Warning|error|Invalid|Cannot|undefined is not|is not a function/i.test(e));
      if (reactError) failures.push(`${route}: console -> ${reactError.slice(0, 120)}`);
      if (/Something went wrong|ErrorBoundary/i.test(text)) failures.push(`${route}: error boundary caught a crash`);
    }

    expect(failures).toEqual([]);
  }, 180000);
});
