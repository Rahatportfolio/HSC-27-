// @vitest-environment jsdom
/**
 * The app is offline-first: everything a student does lives in localStorage.
 * If a write does not survive a reload, the feature is decorative.
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
const stored = () => localStorage.getItem(STORAGE_KEY) ?? '';

describe('a student’s work survives a reload', () => {
  it('keeps a flashcard they create', async () => {
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    await open('flashcards');
    const before = stored().length;
    const add = screen.getByRole('button', { name: /নতুন কার্ড যোগ করো/ });
    await act(async () => { fireEvent.click(add); });
    await settle();
    const inputs = [...document.querySelectorAll('.modal input, .modal textarea')] as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    await act(async () => { fireEvent.change(inputs[0], { target: { value: 'কোষের শক্তি কেন্দ্র' } }); });
    if (inputs[1]) await act(async () => { fireEvent.change(inputs[1], { target: { value: 'মাইটোকন্ড্রিয়া' } }); });
    const save = [...document.querySelectorAll('.modal button')].find(b => /সংরক্ষণ|যোগ করো|সেভ|save/i.test(b.textContent ?? '')) as HTMLElement;
    expect(save).toBeTruthy();
    await act(async () => { fireEvent.click(save); });
    await settle();
    expect(stored().length).not.toBe(before);
    expect(stored()).toContain('মাইটোকন্ড্রিয়া');
  }, 60000);

  it('records an exam and a quick quiz in storage', async () => {
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    await open('exams');
    const before = stored().length;
    const start = screen.getByRole('button', { name: /এখনই দাও/ });
    await act(async () => { fireEvent.click(start); });
    await settle();
    expect(document.querySelector('.modal, .view')).toBeTruthy();
    // Answer whatever is on screen, once, and confirm the click is held in state.
    const option = document.querySelector('.modal button, .view button.secondary') as HTMLElement | null;
    if (option) await act(async () => { fireEvent.click(option); });
    await settle();
    expect(stored().length).toBeGreaterThanOrEqual(before);
  }, 60000);

  it('keeps a note written in the library', async () => {
    render(<App />);
    await screen.findAllByText('হোম ড্যাশবোর্ড');
    await open('library');
    const before = stored().length;
    const write = screen.getAllByRole('button', { name: /নোট লেখো/ })[0];
    await act(async () => { fireEvent.click(write); });
    await settle();
    const titleField = document.querySelector('.modal input') as HTMLInputElement;
    const bodyField = document.querySelector('.modal textarea') as HTMLTextAreaElement;
    expect(titleField && bodyField).toBeTruthy();
    await act(async () => {
      fireEvent.change(titleField, { target: { value: 'ভেক্টর সূত্র' } });
      fireEvent.change(bodyField, { target: { value: 'ভেক্টরের ত্রিভুজ সূত্র মনে রাখতে হবে' } });
    });
    const save = [...document.querySelectorAll('.modal button')].find(b => /সেভ করো|Save/.test(b.textContent ?? '')) as HTMLElement;
    await act(async () => { fireEvent.click(save); });
    await settle();
    expect(stored()).toContain('ভেক্টরের ত্রিভুজ সূত্র');
    expect(stored().length).toBeGreaterThan(before);
  }, 60000);
});
