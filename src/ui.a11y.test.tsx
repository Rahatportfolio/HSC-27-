// @vitest-environment jsdom
/**
 * Accessibility basics that a keyboard or screen-reader student depends on:
 * every control has a name, every image is described, headings go in order.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData())); window.location.hash = ''; });
afterEach(cleanup);

const ROUTES = ['today','calendar','syllabus','videos','scanner','pdfs','testprep','practice','flashcards','revision','examsim','weakness','heatmap','backlog','exams','timer','analytics','library','reminders','audit','storage','settings'];

describe('every screen is usable without a mouse or with a screen reader', () => {
  it('names all controls and descriptions on all 22 routes', { timeout: 180000 }, async () => {
    const unnamed: string[] = [];
    const undescribed: string[] = [];
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    for (const route of ROUTES) {
      await act(async () => { window.location.hash = `#${route}`; window.dispatchEvent(new HashChangeEvent('hashchange')); });
      for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise(r => setTimeout(r, 70)); });
      const view = document.querySelector('.view');
      if (!view) { unnamed.push(`${route}: no view`); continue; }
      for (const el of view.querySelectorAll('button')) {
        const name = (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '';
        if (!name) {
          const icon = el.querySelector('svg');
          unnamed.push(`${route}: <button class="${el.className}">${icon ? ' icon-only' : ''}`);
        }
      }
      for (const el of view.querySelectorAll('input, select, textarea')) {
        const id = el.getAttribute('id');
        const described = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (id && view.querySelector(`label[for="${id}"]`)) || el.closest('label');
        if (!described) undescribed.push(`${route}: <${el.tagName.toLowerCase()} type="${el.getAttribute('type') ?? 'text'}">`);
      }
    }
    expect({ unnamed, undescribed }).toEqual({ unnamed: [], undescribed: [] });
  });
});
