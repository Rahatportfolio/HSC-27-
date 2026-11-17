// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData, todayKey } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#weakness';
});
afterEach(cleanup);

const renderWeakness = async () => {
  render(<App />);
  return screen.findByRole('heading', { name: /অ্যাডাপ্টিভ রুটিন/ });
};

it('shows the adaptive routine card with the eight-hour ceiling spelled out', async () => {
  const heading = await renderWeakness();
  const card = heading.closest('section') as HTMLElement;
  expect(card.className).toContain('adaptive-card');
  expect(within(card).getByText('সর্বোচ্চ ৮ ঘণ্টা')).toBeTruthy();
  expect(within(card).getByText('আজকের সীমা')).toBeTruthy();
  expect(within(card).getByText(/বাফার ৩০ মি\./)).toBeTruthy();
  // Enabled by default, so the on-pill is shown next to the heading.
  expect(within(card).getByText('চালু')).toBeTruthy();
});

it('explains that nothing would change while the planner is switched off', async () => {
  const data = freshData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, settings: { ...data.settings, adaptiveEnabled: false, startDate: todayKey() } }));
  const heading = await renderWeakness();
  const card = heading.closest('section') as HTMLElement;
  expect(within(card).getByText('বন্ধ')).toBeTruthy();
  expect(within(card).getByText(/সেটিংসে চালু করলে/)).toBeTruthy();
});

it('never promises more swaps than the plan actually carries', async () => {
  const data = freshData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, settings: { ...data.settings, adaptiveBuffer: 60, startDate: todayKey() } }));
  const heading = await renderWeakness();
  const card = heading.closest('section') as HTMLElement;
  expect(within(card).getByText(/বাফার ৬০ মি\./)).toBeTruthy();
  // Either the honest "nothing to do" line, or real rows — never an empty container.
  const empty = within(card).queryByText(/বদলানোর দরকার নেই/);
  const rows = card.querySelectorAll('.adaptive-change');
  expect(Boolean(empty) || rows.length > 0).toBe(true);
  for (const row of Array.from(rows)) {
    expect(row.querySelector('.adaptive-date')?.textContent).toBeTruthy();
  }
});

it('keeps the hard cap visible in settings and offers only the three allowed buffers', async () => {
  window.location.hash = '#settings';
  render(<App />);
  const buffer = (await screen.findByLabelText(/অ্যাডাপ্টিভ বাফার/)) as HTMLSelectElement;
  expect(Array.from(buffer.options).map(option => option.value)).toEqual(['0', '30', '60']);
  const toggle = (await screen.findByLabelText(/অ্যাডাপ্টিভ প্ল্যানার/)) as HTMLSelectElement;
  expect(Array.from(toggle.options).map(option => option.value)).toEqual(['on', 'off']);
  expect(screen.getByText(/কখনোই ৮ ঘণ্টার বেশি নয়/)).toBeTruthy();
});
