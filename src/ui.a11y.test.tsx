// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';

/**
 * Runtime accessibility/UX audit.
 *
 * Static regexes guess; this renders the real app and asks the DOM the questions a
 * screen-reader user would hit: does every interactive control have a name, are ids
 * unique, and is anything an unlabeled graphic that silently swallows clicks?
 */

// The nav renders the full label, so these must match it exactly — matching a short
// name silently clicked `পরীক্ষা ও GPA` when the test meant the simulator.
const VIEWS = [
  'হোম ড্যাশবোর্ড', 'আমার স্টাডি প্ল্যান', 'সিলেবাস', 'ভিডিও ক্লাস', 'স্টাডি ও অফলাইন',
  'নোট স্ক্যানার', 'পিডিএফ লাইব্রেরি', 'টেস্ট প্রস্তুতি', 'অনুশীলন', 'ফ্ল্যাশকার্ড',
  'স্মার্ট রিভিশন', 'পরীক্ষা সিমুলেটর', 'দুর্বলতা ডিটেক্টর', 'সিলেবাস হিটম্যাপ',
  'ব্যাকলগ ম্যানেজার', 'পরীক্ষা ও GPA', 'স্টাডি টাইমার', 'অগ্রগতি ও বিশ্লেষণ',
  'লাইব্রেরি', 'রিমাইন্ডার', 'অ্যাপ অডিট', 'স্টোরেজ', 'সেটিংস ও ব্যাকআপ',
] as const;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData()));
});
afterEach(() => cleanup());

const go = async (label: string) => {
  const nav = screen.getAllByRole('button').find(button => button.textContent?.trim().startsWith(label));
  if (!nav) throw new Error(`nav button not found: ${label}`);
  await act(async () => { nav.click(); });
};

/** The view actually mounted, so an empty audit result cannot pass by accident. */
const mountedView = (): boolean => !!document.querySelector('.view');

/** Every control the user can operate must expose a name the reader can announce. */
function unnamedControls(): string[] {
  const problems: string[] = [];
  for (const element of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
    if (element.closest('[aria-hidden="true"]')) continue;
    const style = window.getComputedStyle(element as HTMLElement);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const name = (
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.getAttribute('placeholder') ||
      element.textContent ||
      (element as HTMLInputElement).value ||
      ''
    ).trim();
    const labelled = element.id && document.querySelector(`label[for="${element.id}"]`);
    const wrapped = element.closest('label');
    if (!name && !labelled && !wrapped) {
      problems.push(`${element.tagName.toLowerCase()}.${(element.className || '').toString().split(' ')[0]}`);
    }
  }
  return problems;
}

/** Duplicate ids break label/for pairs and aria references; they are always a bug. */
function duplicateIds(): string[] {
  const seen = new Map<string, number>();
  for (const element of document.querySelectorAll('[id]')) {
    const id = element.id;
    if (!id) continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([id, count]) => `${id}×${count}`);
}

describe('every view is operable with a screen reader', () => {
  it.each(VIEWS)('gives %s controls an accessible name', async navLabel => {
    render(<App />);
    await screen.findByText(/এগিয়ে যাই/);
    await go(navLabel);
    expect(mountedView()).toBe(true);
    expect(unnamedControls()).toEqual([]);
  });

  it.each(VIEWS)('keeps element ids unique on %s', async navLabel => {
    render(<App />);
    await screen.findByText(/এগিয়ে যাই/);
    await go(navLabel);
    expect(mountedView()).toBe(true);
    expect(duplicateIds()).toEqual([]);
  });
});
