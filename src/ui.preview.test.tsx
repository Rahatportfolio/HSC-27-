// @vitest-environment jsdom
/**
 * Everything the live preview depends on: the entry point mounts, the app boots
 * from empty storage without a saved profile, and every route is reachable from
 * the sidebar the way a first-time visitor reaches it.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
afterEach(cleanup);

const settle = async (n = 5) => { for (let i = 0; i < n; i += 1) await act(async () => { await new Promise(r => setTimeout(r, 70)); }); };

describe('the app a first-time visitor sees', () => {
  it('boots from completely empty storage and writes a profile', async () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    await settle();
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!).version).toBeGreaterThanOrEqual(1);
    // A new student must be asked for availability, never silently given 8/16h.
    expect(JSON.parse(saved!).routineSetupRequired).toBe(true);
    expect(screen.getByRole('heading', { name: /অ্যাপ খুলে পড়া শুরু করো/ })).toBeTruthy();
    expect(document.querySelector('.task-card')).toBeNull();
    const view = document.querySelector('.view') as HTMLElement;
    expect((view.textContent ?? '').length).toBeGreaterThan(500);
  }, 60000);

  it('reaches every screen from the sidebar, as a visitor would', { timeout: 180000 }, async () => {
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    await settle();
    const items = [...document.querySelectorAll('.nav-item')];
    expect(items.length).toBeGreaterThanOrEqual(21);
    const blank: string[] = [];
    for (const item of items) {
      await act(async () => { fireEvent.click(item); });
      // Wait for the lazily loaded chunk to mount instead of a fixed settle time.
      let view: HTMLElement | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        view = document.querySelector('.view') as HTMLElement | null;
        if (view && (view.textContent ?? '').length >= 40) break;
        await settle(1);
      }
      if (!view || (view.textContent ?? '').length < 40) blank.push((item.textContent ?? '').trim().slice(0, 24));
    }
    expect(blank).toEqual([]);
  });
});
