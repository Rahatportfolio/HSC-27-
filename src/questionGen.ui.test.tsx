// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#practice';
});
afterEach(cleanup);

it('offers generation only once a chapter with verified facts is chosen', async () => {
  render(<App />);
  const box = (await screen.findByText('স্বয়ংক্রিয় প্রশ্ন তৈরি')).closest('.generator-box') as HTMLElement;
  expect(box.className).toContain('generator-box');
  const button = screen.getByRole('button', { name: /এই অধ্যায় থেকে প্রশ্ন বানাও/ }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(box.textContent).toContain('অধ্যায় বাছো');
});

it('generates a verified paper for a chapter and starts the quiz with it', async () => {
  render(<App />);
  await screen.findByText('স্বয়ংক্রিয় প্রশ্ন তৈরি');
  const selects = () => Array.from(document.querySelectorAll('.quiz-setup-grid select')) as HTMLSelectElement[];
  // subject, chapter, count
  fireEvent.change(selects()[1], { target: { value: 'physics-1-7' } });
  const button = screen.getByRole('button', { name: /এই অধ্যায় থেকে প্রশ্ন বানাও/ }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  // A generated question is now on screen, tagged with the generator's own source label.
  await screen.findByText(/স্বয়ংক্রিয় · পাঠ্যবই-যাচাইকৃত তথ্যপুল/);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(stored.questions.length).toBeGreaterThan(0);
  // Both engines may contribute: fact-based (gen|) and formula drills (num|).
  expect(stored.questions.every((question: { id: string }) => /^(gen|num)\|/.test(question.id))).toBe(true);
});

it('keeps the bank untouched until a chapter is chosen', async () => {
  const data = freshData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render(<App />);
  await screen.findByText('স্বয়ংক্রিয় প্রশ্ন তৈরি');
  // With no chapter picked the generate button stays disabled — nothing is stored by accident.
  const button = screen.getByRole('button', { name: /এই অধ্যায় থেকে প্রশ্ন বানাও/ }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(stored.questions).toHaveLength(0);
});

it('now covers every subject, including English and Bangla', async () => {
  render(<App />);
  await screen.findByText('স্বয়ংক্রিয় প্রশ্ন তৈরি');
  const selects = () => Array.from(document.querySelectorAll('.quiz-setup-grid select')) as HTMLSelectElement[];
  fireEvent.change(selects()[0], { target: { value: 'english' } });
  const chapterSelect = selects()[1];
  const englishChapter = Array.from(chapterSelect.options).map(option => option.value).find(value => value.startsWith('english'))!;
  fireEvent.change(chapterSelect, { target: { value: englishChapter } });
  const button = screen.getByRole('button', { name: /এই অধ্যায় থেকে প্রশ্ন বানাও/ }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  await screen.findByText(/Auto-generated|স্বয়ংক্রিয়/);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(stored.questions.length).toBeGreaterThan(0);
});
