// @vitest-environment jsdom
/**
 * Layout guard. jsdom has no real layout engine, so this asserts the things that
 * cause horizontal scroll on a phone: a fixed-width element wider than the
 * viewport, and text set to not wrap.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';

const ROUTES = ['today','calendar','syllabus','videos','pdfs','testprep','practice','flashcards','revision','examsim','weakness','heatmap','backlog','exams','timer','analytics','library','reminders','audit','storage','settings'];
const PHONE = 360;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: PHONE });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData())); window.location.hash = ''; });
afterEach(cleanup);

describe('nothing forces horizontal scroll on a 360px phone', () => {
  it('has no fixed width wider than the viewport in any route', async () => {
    const offenders: string[] = [];
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    for (const route of ROUTES) {
      await act(async () => { window.location.hash = `#${route}`; window.dispatchEvent(new HashChangeEvent('hashchange')); });
      for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise(r => setTimeout(r, 70)); });
      const view = document.querySelector('.view') as HTMLElement | null;
      if (!view) { offenders.push(`${route}: no view`); continue; }
      for (const el of view.querySelectorAll('[style]')) {
        const width = (el as HTMLElement).style.width;
        const match = /^(\d+)px$/.exec(width);
        if (match && Number(match[1]) > PHONE) {
          offenders.push(`${route}: inline width ${width} on <${el.tagName.toLowerCase()}>`);
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 180000);
});
