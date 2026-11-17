// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { COVERED_BOARD_TOPICS, VERIFIED_BOARD_QUESTIONS } from './boardQuestions';

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

it('keeps covered classes visually apart from answerable questions', async () => {
  const block = await openBoardsTab();
  const covered = [...block.querySelectorAll('.covered-board-list li')];
  expect(covered.length).toBe(COVERED_BOARD_TOPICS.length);
  // A coverage row must never look like a question card.
  expect(block.querySelectorAll('.verified-board-card .covered-board-topic').length).toBe(0);
  expect(block.querySelector('.covered-board-block')?.textContent).toContain('এগুলো প্রশ্ন নয়');
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
  // The chip row describes answerable questions only. Chemistry's classes named
  // their board and year but not the stimulus, so chemistry must NOT be advertised
  // here — it appears in the coverage list instead.
  expect(chips.some(text => text.includes('পদার্থবিজ্ঞান'))).toBe(true);
  expect(chips.some(text => text.includes('রসায়ন'))).toBe(false);
  expect(block.querySelector('.covered-board-block')?.textContent).toContain('রসায়ন');
  // A paper with no source must not be advertised as covered.
  expect(chips.some(text => text.includes('উচ্চতর গণিত'))).toBe(false);
  expect(chips.some(text => text.includes('জীববিজ্ঞান'))).toBe(false);
});

it('counts the verified questions in the tab badge, not just the saved ones', async () => {
  const block = await openBoardsTab();
  const badge = [...document.querySelectorAll('.library-tabs button')]
    .find(node => node.textContent?.includes('বোর্ড প্রশ্ন'))?.querySelector('.tab-count');
  const shown = Number((badge?.textContent ?? '0').replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d))));
  expect(shown).toBe(VERIFIED_BOARD_QUESTIONS.length);
  void block;
});

it('shows the Library tabs in English when English mode is on', async () => {
  localStorage.clear();
  const data = freshData();
  data.settings.language = 'en';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render(<App />);
  await screen.findAllByText('Home dashboard');
  const nav = [...document.querySelectorAll('nav button')]
    .find(node => node.textContent?.trim() === 'Library') as HTMLElement | undefined;
  await act(async () => { nav!.click(); });
  await waitFor(() => expect(document.querySelector('.library-tabs')).toBeTruthy());
  const labels = [...document.querySelectorAll('.library-tabs button')].map(node => node.textContent ?? '');
  expect(labels.some(label => label.includes('Board questions'))).toBe(true);
  // Bengali labels must be gone in English mode.
  expect(labels.some(label => /নোট|সূত্র|বোর্ড/.test(label))).toBe(false);
});

/**
 * EmptyState does not translate anything itself — it renders whatever string it is
 * given. Eleven call sites were passing raw Bengali, so English mode showed Bengali
 * copy. This scans the source so the leak cannot come back.
 */
it('never passes raw Bengali to EmptyState', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const files = [
    ...readdirSync('src/views').map(name => `src/views/${name}`),
    'src/components.tsx', 'src/modals.tsx', 'src/App.tsx',
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<EmptyState[\s\S]{0,400}?\/>/g)) {
      const block = match[0];
      if (/description=\{t\(/.test(block)) continue;
      const description = /description="([^"]*)"/.exec(block)?.[1] ?? '';
      if (/[\u0980-\u09FF]/.test(description)) {
        offenders.push(`${file}: "${description.slice(0, 44)}"`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
