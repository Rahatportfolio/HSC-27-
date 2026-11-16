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

it('lists the chapters that cannot fill a ten-question paper yet', async () => {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  await go('অডিট');
  await screen.findByRole('heading', { name: /যেসব অধ্যায়ে এখনো ১০ প্রশ্ন হয় না/ });
  const rows = document.querySelectorAll('.audit-thin-row').length;
  expect(rows).toBeGreaterThan(0);
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
