// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { CHAPTERS } from './data';
import { buildPlan, chapterTasks, freshData, STORAGE_KEY } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function go(view: string) {
  act(() => {
    window.location.hash = `#${view}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
describe('application shell', () => {
  it('renders the dashboard and every view without crashing', async () => {
    render(<App />);
    expect(await screen.findByText(/এগিয়ে যাই/)).toBeTruthy();
    const views: [string, RegExp][] = [
      ['calendar', /এক দিন। এক পদক্ষেপ।/],
      ['syllabus', /সিলেবাসটা গুছিয়ে নিই।/],
      ['revision', /ভুলে যাওয়ার আগেই ঝালাই।/],
      ['timer', /সময় গুনি, মন দিই।/],
      ['practice', /যাচাই করো, তারপর এগোও।/],
      ['exams', /ভুল হোক এখানেই।/],
      ['analytics', /নিজের সঙ্গে তুলনা।/],
      ['library', /নিজের সংগ্রহ, নিজের হাতে।/],
      ['reminders', /পড়ার কথা মনে থাকবে।/],
      ['settings', /তোমার পড়া, তোমার ছন্দে।/],
    ];
    for (const [view, heading] of views) {
      go(view);
      expect(await screen.findByText(heading), view).toBeTruthy();
    }
  });
  it('applies the chosen theme', async () => {
    render(<App />);
    go('settings');
    const dark = await screen.findByRole('button', { name: /গাঢ়/ });
    act(() => { dark.click(); });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
  it('creates revision cards for a completed chapter and shows them', async () => {
    const data = freshData();
    const plan = buildPlan();
    for (const task of chapterTasks(plan, CHAPTERS[0].id)) data.completed[task.id] = '2026-11-14T08:00:00.000Z';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />);
    go('revision');
    expect(await screen.findByText(CHAPTERS[0].title)).toBeTruthy();
    expect((await screen.findAllByText(/১ দিন পরের রিভিশন/)).length).toBeGreaterThan(0);
  });
  it('starts an MCQ quiz and records the answer', async () => {
    render(<App />);
    go('practice');
    const start = await screen.findByRole('button', { name: /কুইজ শুরু করো/ });
    act(() => { start.click(); });
    const options = document.querySelectorAll<HTMLButtonElement>('.quiz-option');
    expect(options.length).toBe(4);
    act(() => { options[0].click(); });
    expect(await screen.findByText(/সঠিক উত্তর!|ভুল। সঠিক উত্তর:/)).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored.attempts.length).toBe(1);
  });
});
