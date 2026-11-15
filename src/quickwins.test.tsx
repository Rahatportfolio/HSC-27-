// @vitest-environment jsdom
/**
 * v2.15 "sohoj" round: home test-prep snapshot, continue-classes deep link
 * into the class player, calendar lock markers, and the web install button.
 */
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
  window.print = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:prostuti');
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(window, 'indexedDB', { writable: true, value: undefined });
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('home test-prep snapshot', () => {
  it('shows countdown + A-category progress on Home and opens test mode', async () => {
    render(<App />);
    const strip = await screen.findByLabelText('টেস্ট প্রস্তুতি সংক্ষিপ্ত');
    expect(within(strip).getByRole('heading', { name: /টেস্ট প্রস্তুতি/ })).toBeTruthy();
    expect(within(strip).getByText(/দিন বাকি/)).toBeTruthy();
    expect(within(strip).getByText(/A ক্যাটাগরি শেষ/)).toBeTruthy();
    expect(within(strip).getByRole('button', { name: /টেস্ট মোডে যাও/ })).toBeTruthy();

    fireEvent.click(within(strip).getByRole('button', { name: /টেস্ট মোডে যাও/ }));
    expect(await screen.findByRole('heading', { name: /A ক্যাটাগরি চেকলিস্ট/ })).toBeTruthy();
  });
});

describe('continue-classes deep link', () => {
  it('opens the next unwatched class player straight from the Home chip', async () => {
    render(<App />);
    const chip = await screen.findByRole('button', { name: /ক্লাস দেখা চালিয়ে যাও/ });
    fireEvent.click(chip);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    // The handoff flag is consumed exactly once.
    expect(sessionStorage.getItem('prostuti.openClass')).toBeNull();
  });
});

describe('calendar lock marker', () => {
  it('draws a lock dot on locked days in the month grid', async () => {
    window.location.hash = '#calendar';
    render(<App />);
    expect(document.querySelector('.cell-lock')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'দিনটি লক করো' }));
    await waitFor(() => { expect(document.querySelector('.cell-lock')).toBeTruthy(); });

    // The accessible label now says the day is locked too.
    const lockedCell = document.querySelector('.cell-lock')?.closest('button');
    expect(lockedCell?.getAttribute('aria-label')).toMatch(/লক করা/);
  });
});

describe('web install button', () => {
  type InstallEvt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

  it('stays hidden until the browser offers an install prompt', async () => {
    render(<App />);
    expect(document.querySelector('.install-app-btn')).toBeNull();

    const evt = new Event('beforeinstallprompt') as InstallEvt;
    const prompt = vi.fn().mockResolvedValue(undefined);
    evt.prompt = prompt;
    evt.userChoice = Promise.resolve({ outcome: 'accepted' as const });
    act(() => { window.dispatchEvent(evt); });

    const btn = await screen.findByRole('button', { name: 'অ্যাপ ইনস্টল করো' });
    fireEvent.click(btn);
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    // One-shot: the button disappears after the prompt is consumed.
    await waitFor(() => expect(document.querySelector('.install-app-btn')).toBeNull());
  });
});
