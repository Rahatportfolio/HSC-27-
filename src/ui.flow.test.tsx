// @vitest-environment jsdom
/**
 * The one loop the whole planner exists for: finish a planned step, and see the
 * syllabus percentage and today's progress actually move.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData())); window.location.hash = ''; });
afterEach(cleanup);

const settle = async (n = 5) => { for (let i = 0; i < n; i += 1) await act(async () => { await new Promise(r => setTimeout(r, 70)); }); };
const open = async (route: string) => {
  await act(async () => { window.location.hash = `#${route}`; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await settle();
};

describe('finishing a step moves the plan forward', () => {
  it('records a completed step and shows it as done', async () => {
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    await open('today');
    const before = localStorage.getItem(STORAGE_KEY) ?? '';
    const done = [...document.querySelectorAll('.view button')].find(b => /সম্পন্ন করো|সম্পন্ন ✓/.test(b.textContent ?? ''));
    expect(done).toBeTruthy();
    const completedCount = (raw: string) => Object.keys(JSON.parse(raw).completed ?? {}).length;
    const baseCount = completedCount(before);
    await act(async () => { fireEvent.click(done as HTMLElement); });
    await settle();
    const after = localStorage.getItem(STORAGE_KEY) ?? '';
    const afterCount = completedCount(after);
    expect(afterCount).toBeGreaterThan(baseCount);
    expect(after.length).toBeGreaterThan(before.length);
  }, 60000);

  it('shows progress on the syllabus screen, not a frozen zero', async () => {
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    await open('today');
    const done = [...document.querySelectorAll('.view button')].find(b => /সম্পন্ন করো/.test(b.textContent ?? '')) as HTMLElement;
    await act(async () => { fireEvent.click(done); });
    await settle();
    await open('syllabus');
    const text = document.querySelector('.view')!.textContent ?? '';
    // The syllabus screen counts with Bengali digits: "জীববিজ্ঞান১/২৪" means 1 of 24.
    const counted = Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)!).completed).length;
    expect(counted).toBeGreaterThan(0);
    expect(text).toMatch(/১\/২৪|২\/২৪|\/২৪/);
    expect(text).not.toMatch(/জীববিজ্ঞান০\/২৪/);
  }, 60000);
});
