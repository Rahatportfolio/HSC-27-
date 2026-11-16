// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { STARTER_QUESTIONS } from './quiz-data';
import type { ExamSession } from './types';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

/** Navigate through the sidebar like a student does — the shell listens to clicks. */
async function go(label: string) {
  await act(async () => {
    const button = [...document.querySelectorAll('nav button')].find(node => node.textContent?.includes(label)) as HTMLElement | undefined;
    if (!button) throw new Error(`nav button not found: ${label}`);
    button.click();
  });
}
afterEach(cleanup);

/** A chapter that really has enough banked questions to fill a paper. */
const CHAPTER = 'chemistry-1-3';
const ten = STARTER_QUESTIONS.filter(question => question.chapterId === CHAPTER).slice(0, 10);

const paper = (id: string, correctCount: number, at: string, timeTakenSec = 300): ExamSession => {
  const answers: Record<string, number> = {};
  ten.forEach((question, position) => {
    if (position < correctCount) answers[question.id] = question.answer;
  });
  return {
    id, mode: 'chapter', title: `টেস্ট ${id}`, chapterIds: [CHAPTER],
    questionIds: ten.map(question => question.id), answers, score: correctCount, total: ten.length,
    durationMin: 10, timeTakenSec, date: at.slice(0, 10), at, breakdown: [],
  };
};

const seed = (sessions: ExamSession[]) => {
  const base = freshData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, examSessions: sessions }));
};

it('shows a counted picture of past papers instead of a bare average', async () => {
  seed([paper('a', 4, '2026-11-10T10:00:00.000Z'), paper('b', 7, '2026-11-12T10:00:00.000Z'), paper('c', 9, '2026-11-14T10:00:00.000Z')]);
  render(<App />);
  await go('সিমুলেটর');
  await screen.findByRole('heading', { name: /গত পরীক্ষাগুলোর ছবি/ });
  expect(document.querySelectorAll('.exam-trend-stats > div').length).toBe(4);
  expect(screen.getByText(/৩টি পরীক্ষা/)).toBeTruthy();
});

it('does not show a trend panel before there is anything to show', async () => {
  seed([]);
  render(<App />);
  await go('সিমুলেটর');
  await screen.findByRole('heading', { name: /নতুন পরীক্ষা তৈরি করো/ });
  expect(document.querySelector('.exam-trend-card')).toBeNull();
});

it('refuses to call a trend from two papers', async () => {
  seed([paper('a', 5, '2026-11-12T10:00:00.000Z'), paper('b', 8, '2026-11-14T10:00:00.000Z')]);
  render(<App />);
  await go('সিমুলেটর');
  await screen.findByRole('heading', { name: /গত পরীক্ষাগুলোর ছবি/ });
  expect(screen.getByText(/এখনো অপর্যাপ্ত/)).toBeTruthy();
});

it('names the real problem when papers are being left blank', async () => {
  // Both papers stop after six questions: the blank tail is the honest story.
  seed([paper('a', 6, '2026-11-10T10:00:00.000Z'), paper('b', 6, '2026-11-12T10:00:00.000Z')]);
  render(<App />);
  await go('সিমুলেটর');
  await screen.findByRole('heading', { name: /গত পরীক্ষাগুলোর ছবি/ });
  expect(screen.getByText(/শেষের প্রশ্নগুলো ফাঁকা/)).toBeTruthy();
});
