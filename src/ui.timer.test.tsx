// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';

/**
 * The user's own acceptance test: the digits on the Study timer screen must
 * actually tick down, hit zero and complete the session. The hook is covered by
 * `hooks.timer.test.tsx`; this checks the number a student actually looks at.
 */

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  localStorage.clear();
  window.location.hash = '';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData()));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const openTimer = async () => {
  render(<App />);
  const nav = screen.getAllByRole('button').find(b => (b.textContent || '').trim().startsWith('স্টাডি টাইমার'));
  if (!nav) throw new Error('timer nav item missing');
  await act(async () => { nav.click(); });
  const view = document.querySelector('.view.timer-view');
  if (!view) throw new Error('timer view did not mount');
  return view as HTMLElement;
};

/** The big MM:SS digits ring. */
const digits = (view: HTMLElement): string => {
  const el = view.querySelector('.timer-big-digits');
  if (!el) throw new Error('timer digits missing');
  return (el.textContent || '').trim();
};

const BN = '০১২৩৪৫৬৭৮৯';
/** The clock is rendered in Bengali numerals, so parse them, not ASCII. */
const seconds = (clock: string): number => {
  const ascii = [...clock].map(ch => (BN.includes(ch) ? String(BN.indexOf(ch)) : ch)).join('');
  const parts = ascii.split(':').map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
};

const clickStart = async (view: HTMLElement) => {
  const button = view.querySelector('.timer-main-button');
  if (!button) throw new Error('main timer button missing');
  await act(async () => { (button as HTMLButtonElement).click(); });
};

describe('study timer digits actually tick', () => {
  it('counts down second by second once started', async () => {
    const view = await openTimer();
    const initial = digits(view);
    expect(initial).toMatch(/^[০-৯]{2}:[০-৯]{2}$/);

    await clickStart(view);
    expect(digits(view)).toBe(initial);

    // jsdom fake timers drive the wall clock the hook reads via Date.now().
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(seconds(digits(view))).toBe(seconds(initial) - 1);

    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(seconds(digits(view))).toBe(seconds(initial) - 4);

    // A longer jump still tracks wall-clock time exactly, not frame count.
    await act(async () => { vi.advanceTimersByTime(56000); });
    expect(seconds(digits(view))).toBe(seconds(initial) - 60);
  });

  it('pauses without losing time and resumes from where it stopped', async () => {
    const view = await openTimer();
    const initial = seconds(digits(view));
    await clickStart(view);
    await act(async () => { vi.advanceTimersByTime(5000); });
    const afterRun = seconds(digits(view));
    expect(afterRun).toBe(initial - 5);

    await act(async () => { (view.querySelector('.timer-main-button') as HTMLButtonElement).click(); });
    const paused = digits(view);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(digits(view)).toBe(paused);

    await act(async () => { (view.querySelector('.timer-main-button') as HTMLButtonElement).click(); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(seconds(digits(view))).toBe(seconds(paused) - 2);
  });

  it('reaches zero and saves the finished session', async () => {
    const view = await openTimer();
    // Drive the shortest real preset, the same path a student taps.
    const preset = Array.from(view.querySelectorAll('.timer-presets button'))
      .find(button => (button.textContent || '').includes('২৫'));
    if (!preset) throw new Error('25-minute preset missing');
    await act(async () => { (preset as HTMLButtonElement).click(); });
    expect(seconds(digits(view))).toBe(25 * 60);

    await clickStart(view);
    expect(digits(view)).toBe('২৫:০০');

    // One second before the deadline the clock reads 1, not 0 and not 2.
    await act(async () => { vi.advanceTimersByTime(25 * 60_000 - 1000); });
    expect(seconds(digits(view))).toBe(1);

    // At the deadline the session completes: it is logged and the clock arms
    // itself for the next round at the full duration.
    await act(async () => { vi.advanceTimersByTime(1_000); });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const logged = (saved.studySessions as { minutes: number }[]) || [];
    expect(logged.some(session => session.minutes === 25)).toBe(true);
    expect(saved.focus.sessions).toBe(1);
    expect(saved.focus.minutes).toBe(25);
    // After completing, the clock re-arms at the saved default focus length
    // rather than the ad-hoc preset, ready for the next planned session.
    expect(seconds(digits(view))).toBe(5 * 60);
    expect((view.textContent || '')).not.toMatch(/NaN|undefined/);
  });
});
