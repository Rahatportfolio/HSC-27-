// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { VERIFIED_BOARD_QUESTIONS } from './boardQuestions';

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

async function openBoardsTab() {
  render(<App />);
  await screen.findByText(/এগিয়ে যাই/);
  const nav = [...document.querySelectorAll('nav button')]
    // Must match exactly: "পিডিএফ লাইব্রেরি" also contains "লাইব্রেরি".
    .find(node => node.textContent?.trim() === 'লাইব্রেরি') as HTMLElement | undefined;
  expect(nav).toBeTruthy();
  await act(async () => { nav!.click(); });
  const tab = await waitFor(() => {
    const found = [...document.querySelectorAll('.library-tabs button')]
      .find(node => node.textContent?.includes('বোর্ড প্রশ্ন')) as HTMLElement | undefined;
    expect(found).toBeTruthy();
    return found!;
  });
  await act(async () => { tab.click(); });
  await waitFor(() => expect(document.querySelector('.verified-board-block')).toBeTruthy());
  return document.querySelector('.verified-board-block') as HTMLElement;
}

it('shows the board questions recovered from the classes', async () => {
  const block = await openBoardsTab();
  const cards = block.querySelectorAll('.verified-board-card');
  expect(cards.length).toBe(VERIFIED_BOARD_QUESTIONS.length);
  expect(block.textContent).toContain('ঢাকা বোর্ড');
});

it('never shows one without a checkable source on the card', async () => {
  const block = await openBoardsTab();
  const cards = [...block.querySelectorAll('.verified-board-card')];
  for (const card of cards) {
    const link = card.querySelector('a.verified-board-source') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
    // The board and year are printed on the same card as the citation.
    expect(card.textContent).toMatch(/বোর্ড\s*·\s*[০-৯]{4}/);
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toContain('noopener');
  }
});

it('states how many chapters still have no board question', async () => {
  const block = await openBoardsTab();
  expect(block.textContent).toMatch(/বাকি\s*[০-৯]+\s*টিতে এখনো নেই/);
});

it('lists which papers have board questions instead of implying full coverage', async () => {
  const block = await openBoardsTab();
  const chips = [...block.querySelectorAll('.verified-paper-chip')].map(chip => chip.textContent ?? '');
  expect(chips.length).toBeGreaterThan(0);
  // Physics and Chemistry 1st paper are the only papers with evidence today.
  expect(chips.some(text => text.includes('পদার্থবিজ্ঞান'))).toBe(true);
  expect(chips.some(text => text.includes('রসায়ন'))).toBe(true);
  // A paper with no source must not be advertised as covered.
  expect(chips.some(text => text.includes('উচ্চতর গণিত'))).toBe(false);
  expect(chips.some(text => text.includes('জীববিজ্ঞান'))).toBe(false);
});
