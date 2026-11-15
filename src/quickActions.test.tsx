// @vitest-environment jsdom
/** The quick-action layer: always reachable, keyboard friendly, and it gets out of the way. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); window.location.hash = ''; document.documentElement.dataset.theme = 'light'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('quick actions', () => {
  it('opens from the floating button and lists every shortcut', async () => {
    render(<App />);
    const fab = await screen.findByRole('button', { name: 'দ্রুত কাজ' });
    fireEvent.click(fab);
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toBeTruthy();
    for (const label of [/ফোকাস শুরু|টাইমার দেখো/, /সব কিছু খুঁজো/, /আজকের রুটিন/, /স্মার্ট রিভিশন/, /গাঢ় থিম|উজ্জ্বল থিম/, /সেটিংস ও ব্যাকআপ/]) {
      expect(within(sheet).getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.click(within(sheet).getByRole('button', { name: /বন্ধ করো/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens with the ? key and closes with Escape', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'দ্রুত কাজ' });
    fireEvent.keyDown(window, { key: '?' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('switches the theme from the sheet', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'দ্রুত কাজ' }));
    await screen.findByRole('dialog');
    act(() => { screen.getByRole('button', { name: /গাঢ় থিম/ }).click(); });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
});
