// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { freshData, STORAGE_KEY } from './planner';

let mediaChange: ((event: { matches: boolean }) => void) | undefined;
beforeEach(() => {
  const data = freshData(); data.settings.language = 'en'; localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#today';
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn((query: string) => ({ matches: query === '(max-width: 800px)', media: query,
    addEventListener: (_: string, callback: (event: { matches: boolean }) => void) => { if (query === '(max-width: 800px)') mediaChange = callback; },
    removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  })) });
  window.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); mediaChange = undefined; });

describe('mobile navigation drawer', () => {
  it('hides the closed drawer from focus and assistive technology; traps and returns focus while open', () => {
    const view = render(<App />), region = view.container.querySelector('#app-navigation')!;
    expect(region.hasAttribute('inert')).toBe(true); expect(region.getAttribute('aria-hidden')).toBe('true');
    const opener = screen.getByRole('button', { name: 'More pages' }); opener.focus(); fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'All pages' });
    expect(dialog.contains(document.activeElement)).toBe(true); expect(document.body.style.overflow).toBe('hidden');
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(region.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe(''); expect(document.activeElement).toBe(opener);
  });
  it('releases isolation on desktop resize without hiding desktop navigation or changing saved data', () => {
    const view = render(<App />), before = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('dialog')).toBeTruthy(); act(() => mediaChange?.({ matches: false }));
    const region = view.container.querySelector('#app-navigation')!;
    expect(screen.queryByRole('dialog')).toBeNull(); expect(region.hasAttribute('inert')).toBe(false); expect(region.hasAttribute('aria-hidden')).toBe(false);
    expect(within(region as HTMLElement).getByRole('button', { name: 'Home dashboard' })).toBeTruthy();
    expect(document.body.style.overflow).toBe(''); expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).completed).toEqual(before.completed);
    act(() => mediaChange?.({ matches: true })); expect(region.hasAttribute('inert')).toBe(true);
  });
});
