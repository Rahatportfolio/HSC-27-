// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData, todayKey } from './planner';
import type { StudySession } from './types';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#timer';
});
afterEach(cleanup);

const at = (hour: number, minute = 0): string =>
  new Date(Date.parse(`${todayKey()}T00:00:00Z`) + hour * 3600000 - 6 * 3600000 + minute * 60000).toISOString();

const session = (id: string, hour: number, minutes: number, minute = 0): StudySession => ({
  id, date: todayKey(), at: at(hour, minute), minutes, subject: 'physics', mode: 'pomodoro',
});

const seed = (sessions: StudySession[]) => {
  const base = freshData();
  const data = {
    ...base,
    settings: { ...base.settings, startDate: todayKey() },
    studySessions: sessions,
    focus: { minutes: sessions.reduce((sum, item) => sum + item.minutes, 0), sessions: sessions.length },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
};

it('shows the measured focus picture on the timer screen', async () => {
  seed([session('a', 7, 60), session('b', 20, 30)]);
  render(<App />);
  await screen.findByRole('heading', { name: /ফোকাসের আসল ছবি/ });
  // Two sessions, 90 measured minutes — the panel must show both honestly.
  expect(document.querySelectorAll('.focus-kpis > div').length).toBe(4);
  expect(document.querySelectorAll('.focus-hour').length).toBe(24);
  // 90 minutes = 1h 30m, split across separate <small> nodes inside one KPI.
  const total = document.querySelector('.focus-kpis > div')?.textContent ?? '';
  expect(total).toContain('১');
  expect(total).toContain('৩০');
});

it('marks the strongest hour only when there is data for it', async () => {
  seed([session('a', 7, 45), session('b', 20, 15)]);
  render(<App />);
  await screen.findByRole('heading', { name: /ফোকাসের আসল ছবি/ });
  const best = document.querySelector('.focus-hour.best') as HTMLElement;
  expect(best).toBeTruthy();
  expect(best.getAttribute('title')).toContain('৭');
});

it('never invents numbers for a profile with no sessions', async () => {
  seed([]);
  render(<App />);
  await screen.findByRole('heading', { name: /ফোকাসের আসল ছবি/ });
  expect(screen.getByText(/এখনো কোনো মাপা সময় নেই/)).toBeTruthy();
  expect(document.querySelector('.focus-hour.best')).toBeNull();
  expect(screen.getByText(/মনোযোগের গুণ নয়/)).toBeTruthy();
});

it('warns about a long unbroken sitting instead of praising it', async () => {
  // Two hours with no gap, ending at the moment the test runs. Seeding fixed clock
  // hours made this test pass only inside a 30-minute window after the last
  // session — "continuous up to now" is 0 once the run is over, which is correct.
  const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();
  seed([
    { id: 'a', date: todayKey(), at: minutesAgo(120), minutes: 60, subject: 'physics', mode: 'pomodoro' },
    { id: 'b', date: todayKey(), at: minutesAgo(60), minutes: 60, subject: 'physics', mode: 'pomodoro' },
  ]);
  render(<App />);
  await screen.findByRole('heading', { name: /ফোকাসের আসল ছবি/ });
  const chip = document.querySelector('.break-chip');
  expect(chip?.textContent).toMatch(/একটানা/);
});

it('suggests a concrete next block when nothing is measured today', async () => {
  seed([]);
  render(<App />);
  await screen.findByText('এখন কী করবে');
  const first = document.querySelector('.focus-action');
  expect(first?.textContent).toMatch(/শুরু করো/);
  expect(document.querySelectorAll('.focus-action').length).toBeLessThanOrEqual(3);
});
