// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { examDurationMin } from './examSim';

/**
 * Exam simulator clock. The user asked specifically whether countdowns tick, so
 * this watches the rendered clock, confirms it counts down against wall-clock
 * time, and that time-up submits the paper on its own.
 */

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], shouldAdvanceTime: false });
  localStorage.clear();
  window.location.hash = '';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData()));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const BN = '০১২৩৪৫৬৭৮৯';
const toAscii = (text: string) =>
  [...text].map(ch => (BN.includes(ch) ? String(BN.indexOf(ch)) : ch)).join('');

const seconds = (clock: string): number => {
  const parts = toAscii(clock).split(':').map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
};

const startExam = async () => {
  render(<App />);
  const nav = screen.getAllByRole('button').find(b => (b.textContent || '').trim().startsWith('পরীক্ষা সিমুলেটর'));
  if (!nav) throw new Error('simulator nav item missing');
  await act(async () => { nav.click(); });

  const start = await screen.findByRole('button', { name: /পরীক্ষা শুরু করো/ });
  await act(async () => { start.click(); });

  const clockEl = document.querySelector('.exam-run-clock strong');
  if (!clockEl) throw new Error('exam clock missing');
  return clockEl as HTMLElement;
};

describe('exam simulator countdown', () => {
  it('counts down and auto-submits when the clock runs out', async () => {
    const clockEl = await startExam();
    const initial = seconds(clockEl.textContent || '');
    // One minute per question, never below five.
    expect(initial).toBeGreaterThanOrEqual(300);

    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(seconds(clockEl.textContent || '')).toBe(initial - 1);

    await act(async () => { vi.advanceTimersByTime(29_000); });
    expect(seconds(clockEl.textContent || '')).toBe(initial - 30);

    // Run the clock out: the paper must be graded and saved without a click.
    await act(async () => { vi.advanceTimersByTime(initial * 1000); });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect((saved.examSessions as unknown[])?.length || 0).toBeGreaterThan(0);
    expect(document.querySelector('.exam-run-clock')).toBeNull();
  }, 30000);

  it('keeps the reported duration in step with the question count', async () => {
    // Guard the shared rule the clock depends on.
    expect(examDurationMin(0)).toBe(5);
    expect(examDurationMin(5)).toBe(5);
    expect(examDurationMin(10)).toBe(10);
    expect(examDurationMin(25)).toBe(25);
  });
});
