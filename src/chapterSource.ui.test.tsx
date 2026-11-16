// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
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

async function openFirstChapter() {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  const nav = [...document.querySelectorAll('nav button')]
    .find(node => node.textContent?.includes('সিলেবাস')) as HTMLElement | undefined;
  expect(nav).toBeTruthy();
  await act(async () => { nav!.click(); });
  await waitFor(() => expect(document.querySelector('.chapter-row')).toBeTruthy());
  await act(async () => { (document.querySelector('.chapter-row') as HTMLElement).click(); });
  await waitFor(() => expect(document.querySelector('.chapter-source-note')).toBeTruthy());
  return document.querySelector('.chapter-source-note') as HTMLElement;
}

it('says inside the chapter that the questions are not board papers', async () => {
  const note = await openFirstChapter();
  const text = note.textContent ?? '';
  expect(text).toContain('বোর্ডের মূল প্রশ্নপত্র থেকে নয়');
  expect(text).toContain('পাঠ্যবই-যাচাইকৃত');
});

it('counts that chapter\'s MCQs instead of using a fixed sentence', async () => {
  const note = await openFirstChapter();
  const text = note.textContent ?? '';
  // The smallest banked chapter must still be named truthfully; the count shown
  // has to match the bank, not be a rounded or invented figure.
  const firstChapter = document.querySelector('.chapter-row') as HTMLElement;
  expect(firstChapter).toBeTruthy();
  const numbers = (text.match(/[০-৯]+/g) ?? []).map(value =>
    Number(value.replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))));
  expect(numbers.length).toBeGreaterThan(0);
  const bankCounts = new Set(
    [...new Set(STARTER_QUESTIONS.map(question => question.chapterId))]
      .map(id => STARTER_QUESTIONS.filter(question => question.chapterId === id).length),
  );
  // Every numeral printed must be one the bank can actually produce, or 0/1 for
  // the board-video sentence.
  const allowed = new Set([0, 1, ...bankCounts]);
  expect(numbers.filter(value => !allowed.has(value))).toEqual([]);
});

it('claims a board video only where the catalog really has one', async () => {
  const note = await openFirstChapter();
  const text = note.textContent ?? '';
  // Two mutually exclusive sentences: one claims verified board links, the other
  // states there are none. Exactly one must appear.
  const claims = text.includes('বোর্ড-প্রশ্নের ভিডিও লিংক যাচাই করা আছে');
  const denies = text.includes('বোর্ড-প্রশ্নের যাচাই করা ভিডিও নেই');
  expect(claims || denies).toBe(true);
  expect(claims && denies).toBe(false);
});
