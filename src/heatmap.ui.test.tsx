// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, buildPlan, freshData, todayKey } from './planner';
import { CHAPTERS } from './data';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#heatmap';
});
afterEach(cleanup);

const seed = (mutate?: (data: ReturnType<typeof freshData>) => ReturnType<typeof freshData>) => {
  const base = freshData();
  const data = { ...base, settings: { ...base.settings, startDate: todayKey() } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mutate ? mutate(data) : data));
  return data;
};

it('draws a cell for every chapter of the syllabus', async () => {
  seed();
  render(<App />);
  await screen.findByRole('heading', { name: /কোন অধ্যায়ে কতটুকু বাকি/ });
  const cells = document.querySelectorAll('.heat-cell');
  expect(cells.length).toBe(CHAPTERS.length);
  // Fresh profile: every cell is the untouched band, and the page says so.
  expect(document.querySelectorAll('.heat-cell.l0').length).toBe(CHAPTERS.length);
  expect(screen.getByText('মানচিত্র এখনো সাদা')).toBeTruthy();
});

it('never claims readiness for a chapter with no work behind it', async () => {
  seed();
  render(<App />);
  await screen.findByRole('heading', { name: /কোন অধ্যায়ে কতটুকু বাকি/ });
  expect(document.querySelectorAll('.heat-cell.l3, .heat-cell.l4')).toHaveLength(0);
  expect(screen.getAllByText('০%').length).toBeGreaterThan(0);
});

it('warms a chapter up once its planned sessions are ticked off', async () => {
  const data = seed();
  const plan = buildPlan({ ...data.settings, startDate: todayKey() });
  const target = 'physics-1-2';
  const completed = { ...data.completed };
  for (const day of plan) for (const task of day.tasks) if (task.chapterIds.includes(target)) completed[task.id] = '2026-01-01T00:00:00.000Z';
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, completed }));
  render(<App />);
  await screen.findByRole('heading', { name: /কোন অধ্যায়ে কতটুকু বাকি/ });
  const cell = Array.from(document.querySelectorAll('.heat-cell')).find(node => node.textContent?.includes('ভেক্টর')) as HTMLElement;
  expect(cell).toBeTruthy();
  expect(cell.className).toMatch(/l[1-4]/);
  // The "slipping quietly" panel appears because the work is done but no test backs it up.
  expect(screen.getByText('পিছলে যাচ্ছে')).toBeTruthy();
});

it('filters down to cold chapters only', async () => {
  seed();
  render(<App />);
  await screen.findByRole('heading', { name: /কোন অধ্যায়ে কতটুকু বাকি/ });
  const before = document.querySelectorAll('.heat-cell').length;
  fireEvent.click(screen.getByLabelText(/শুধু ঠান্ডা অধ্যায়/));
  await waitFor(() => expect(document.querySelectorAll('.heat-cell').length).toBe(before));
});

it('changes the look-ahead window without breaking the grid', async () => {
  seed();
  render(<App />);
  await screen.findByRole('heading', { name: /কোন অধ্যায়ে কতটুকু বাকি/ });
  fireEvent.change(screen.getByLabelText(/কত দিন সামনে দেখবে/), { target: { value: '30' } });
  await waitFor(() => expect(document.querySelectorAll('.heat-cell').length).toBe(CHAPTERS.length));
});
