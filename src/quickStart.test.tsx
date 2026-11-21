// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { CHAPTERS } from './data';
import { setLanguage } from './i18n';

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#today';
  setLanguage('bn');
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  window.scrollTo = vi.fn();
});
afterEach(cleanup);

describe('first-run quick start', () => {
  it('shows the 3-question quick start instead of the full 4-step wizard', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...freshData(), routineSetupRequired: true }));
    render(<App />);
    expect(await screen.findByText(/অ্যাপ খুলে পড়া শুরু করো/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /এই সময় দিয়েই রুটিন বানাও/ })).toBeTruthy();
    // The heavy per-stage duration editor must stay out of the first screen.
    expect(screen.queryByText(/সময় মিলিয়ে নেওয়ার অধ্যায়/)).toBeNull();
  });

  it('one tap builds the all-chapter routine, keeps the defaults and turns reminders on', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...freshData(), routineSetupRequired: true }));
    render(<App />);
    const cta = await screen.findByRole('button', { name: /এই সময় দিয়েই রুটিন বানাও/ });
    // Pick 3 net hours instead of the default 4.
    fireEvent.click(screen.getByRole('button', { name: /৩ ঘণ্টা/ }));
    fireEvent.click(cta);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.routineSetupRequired).toBe(false);
      expect(saved.personalRoutine).toBeTruthy();
      expect(saved.personalRoutine.scope).toBe('ALL');
      expect(saved.personalRoutine.chapterIds).toEqual(CHAPTERS.map(chapter => chapter.id));
      expect(saved.personalRoutine.dailyLimitMinutes).toBe(180);
      expect(saved.personalRoutine.windows.length).toBeGreaterThan(0);
      expect(saved.settings.reminderEnabled).toBe(true);
    });
    // The daily work list is now the first thing on Home.
    expect(await screen.findByText(/তিন সেশনে অধ্যায় শেষ করো/)).toBeTruthy();
  });

  it('still offers the full wizard behind one tap for students who want it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...freshData(), routineSetupRequired: true }));
    render(<App />);
    const advanced = await screen.findByRole('button', { name: /সব আমি নিজে সাজিয়ে নিতে চাই/ });
    fireEvent.click(advanced);
    expect(await screen.findByText('আগে বলো, কখন পড়তে পারবে?', { exact: false })).toBeTruthy();
  });
});
