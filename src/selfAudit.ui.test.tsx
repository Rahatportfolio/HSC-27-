// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { CHAPTERS } from './data';
import { STARTER_QUESTIONS } from './quiz-data';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData()));
  window.location.hash = '';
});
afterEach(cleanup);

async function go(label: string) {
  await act(async () => {
    const button = [...document.querySelectorAll('nav button')].find(node => node.textContent?.includes(label)) as HTMLElement | undefined;
    if (!button) throw new Error(`nav button not found: ${label}`);
    button.click();
  });
}

it('re-counts the app from the source and shows each check', async () => {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  await go('অডিট');
  await screen.findByRole('heading', { name: /প্রতিটি সংখ্যা আবার গোনা হয়েছে/ });
  expect(document.querySelectorAll('.audit-check').length).toBeGreaterThanOrEqual(8);
  // The banked count on screen must equal the bank itself, not a rounded label.
  // The bank count appears twice on purpose (check card + engine counts): same number.
  const expected = String(STARTER_QUESTIONS.length).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)]);
  expect(screen.getAllByText(expected).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(String(CHAPTERS.length).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)])).length).toBeGreaterThan(0);
});

it('states the limits instead of pretending there are none', async () => {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  await go('অডিট');
  await screen.findByRole('heading', { name: /যা এই অ্যাপ ইচ্ছে করে করে না/ });
  expect(document.querySelectorAll('.audit-limits li').length).toBeGreaterThanOrEqual(3);
  expect(screen.getByText(/কোনো সার্ভার বা অ্যাকাউন্ট নেই/)).toBeTruthy();
});

it('shows the thin-chapter list only when some chapter really is thin', async () => {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  await go('অডিট');
  await screen.findByRole('heading', { name: /প্রতিটি সংখ্যা আবার গোনা হয়েছে/ });
  // The rule, not the old count: the section exists exactly when the audit
  // names a chapter under the ten-question line, and never above 24 rows.
  const thinHeading = screen.queryByRole('heading', { name: /যেসব অধ্যায়ে এখনো ১০ প্রশ্ন হয় না/ });
  const rows = document.querySelectorAll('.audit-thin-row').length;
  if (thinHeading) {
    expect(rows).toBeGreaterThan(0);
  } else {
    expect(rows).toBe(0);
  }
  expect(rows).toBeLessThanOrEqual(24);
});

it('lets the headline turn green only when every check passes', async () => {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  await go('অডিট');
  const headline = document.querySelector('.audit-headline') as HTMLElement;
  await screen.findByRole('heading', { name: /প্রতিটি সংখ্যা আবার গোনা হয়েছে/ });
  // The rule under test: the headline mirrors the weakest check, whatever it is.
  const warned = document.querySelectorAll('.audit-check.warn, .audit-check.fail').length;
  expect(headline.classList.contains('ok')).toBe(warned === 0);
  if (warned > 0) expect(headline.textContent).toMatch(/সীমা|ব্যর্থ/);
});

it('shows where the questions come from, and says they are not board papers', async () => {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  await go('অডিট');
  await screen.findByRole('heading', { name: /প্রশ্ন কোথা থেকে আসছে/ });
  const panel = document.querySelector('.audit-sources') as HTMLElement;
  expect(panel).toBeTruthy();
  // The verdict must be the honest one, and it must name the board-paper limit.
  expect(panel.textContent).toContain('বোর্ডের মূল প্রশ্নপত্র থেকে নয়');
  // Search-only links must never be counted as classes.
  const labels = [...panel.querySelectorAll('.audit-count-grid span')].map(node => node.textContent ?? '');
  expect(labels.some(label => label.includes('সার্চ-লিংক'))).toBe(true);
  // Every listed chapter carries at least one stated gap; none is silently clean.
  const rows = panel.querySelectorAll('.audit-source-row').length;
  expect(rows).toBeGreaterThan(0);
  // Each row names its own gaps, so no chapter can look fully sourced by omission.
  expect(panel.querySelectorAll('.audit-source-gaps small').length).toBeGreaterThanOrEqual(rows);
  // The board-video shortfall is stated as a number, not implied.
  expect(panel.textContent).toMatch(/বোর্ড ভিডিও\s*[০-৯]+\s*\/\s*[০-৯]+/);
});
