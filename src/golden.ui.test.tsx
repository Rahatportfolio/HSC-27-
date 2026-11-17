// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { SUBJECT_FULL_MARKS } from './data';
import type { AppData } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

// Each test renders the whole app; leaving the previous tree mounted lets a stale page
// answer the next test's query, which is exactly how these assertions went wrong.
afterEach(() => {
  cleanup();
});

/** Seeds the stored profile, then boots the app fresh so it reads those marks. */
const boot = async (marks: Record<string, number>) => {
  const data: AppData = { ...freshData(), gpaMarks: marks };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  const nav = screen.getAllByRole('button').find(button => button.textContent?.includes('পরীক্ষা ও GPA'));
  expect(nav, 'nav button').toBeTruthy();
  await act(async () => { nav!.click(); });
  // The page paints once with the fresh profile and again with the stored marks, so the
  // helper waits for the settled numbers and then reads the node fresh — holding on to
  // a node from the first paint is how a test ends up asserting on stale markup.
  await waitFor(() => {
    expect(document.querySelector('[data-golden-row]')).toBeTruthy();
    const points = document.querySelector('.golden-facts strong')?.textContent ?? '';
    // A fresh profile has zero points; every test here seeds real marks.
    expect(points).toMatch(/[১-৯]/);
  });
  return document.querySelector('[data-golden-verdict]') as HTMLElement;
};

const everything = (percent: number) => {
  const marks: Record<string, number> = {};
  for (const [subject, full] of Object.entries(SUBJECT_FULL_MARKS)) marks[subject] = Math.round(full * percent / 100);
  return marks;
};

describe('the GPA page shows the arithmetic, not a promise', () => {
  it('says marks are still missing instead of pretending a GPA', async () => {
    const verdict = await boot({});
    expect(verdict.textContent).toMatch(/বাকি/);
    expect(verdict.className).not.toContain('ok');
    // Seven subjects are always listed, so the student sees where each stands.
    expect(document.querySelectorAll('[data-golden-row]').length).toBe(7);
  });

  it('turns the verdict positive only when GPA 5.00 really holds', async () => {
    const verdict = await boot(everything(85));
    expect(verdict.className).toContain('ok');
    expect(verdict.textContent).toMatch(/5\.00/);
  });

  it('shows Golden A+ as unmet when one subject sits below 80%', async () => {
    const marks = everything(85);
    marks.physics = Math.round(SUBJECT_FULL_MARKS.physics * 0.7);
    const before = await boot(marks);
    // The default goal is GPA 5.00 and the bonus still covers it...
    expect(before.className).toContain('ok');
    // ...but switching to Golden A+ must state the exact shortfall: 200 × 80% = 160,
    // and 140 is entered, so exactly 20 marks are missing.
    const goldenTab = screen.getAllByRole('button').find(button => button.textContent === 'Golden A+');
    expect(goldenTab).toBeTruthy();
    await act(async () => { goldenTab!.click(); });
    const verdict = await waitFor(() => {
      const node = document.querySelector('[data-golden-verdict]') as HTMLElement;
      expect(node.className).not.toContain('ok');
      return node;
    });
    expect(verdict.textContent).toContain('২০');
  });

  it('writes computed numbers in Bengali digits, never Latin', async () => {
    const marks = everything(85);
    marks.physics = Math.round(SUBJECT_FULL_MARKS.physics * 0.7);
    await boot(marks);
    const goldenTab = screen.getAllByRole('button').find(button => button.textContent === 'Golden A+');
    await act(async () => { goldenTab!.click(); });
    await waitFor(() => {
      expect((document.querySelector('[data-golden-verdict]') as HTMLElement).textContent).toContain('২০');
    });
    // "GPA 5.00" is the goal's own name and stays as written everywhere else in the app;
    // every *computed* number (points, bonus, marks, shortfalls) must go through bn().
    const computed = [
      ...document.querySelectorAll('.golden-facts, [data-golden-verdict] .golden-verdict-nums, [data-golden-row]'),
    ].map(node => node.textContent ?? '').join(' ').replace(/GPA 5\.00/g, '');
    expect(computed).not.toMatch(/[0-9]/);
  });

  it('never counts a missing subject as zero marks, it reports it as missing', async () => {
    const marks = everything(90);
    delete marks.ict;
    const verdict = await boot(marks);
    expect(verdict.textContent).toMatch(/বাকি/);
    const ictRow = document.querySelector('[data-golden-row="ict"]') as HTMLElement;
    expect(ictRow.textContent).toMatch(/নম্বর নেই/);
  });
});
