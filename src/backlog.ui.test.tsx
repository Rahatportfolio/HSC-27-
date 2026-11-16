// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, addDays, freshData, todayKey } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#backlog';
});
afterEach(cleanup);

/** A profile whose plan began two weeks ago and whose work was never finished. */
const seedLate = () => {
  const base = freshData();
  const data = { ...base, settings: { ...base.settings, startDate: addDays(todayKey(), -14) } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
};

it('shows the backlog page with real pending work', async () => {
  seedLate();
  render(<App />);
  await screen.findByRole('heading', { name: /জমে থাকা পড়ার হিসাব/ });
  expect(document.querySelectorAll('.backlog-row').length).toBeGreaterThan(0);
  expect(document.querySelectorAll('.backlog-day').length).toBeGreaterThanOrEqual(3);
});

it('says there is no backlog for a brand-new profile instead of inventing rows', async () => {
  const base = freshData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, settings: { ...base.settings, startDate: todayKey() } }));
  render(<App />);
  await screen.findByRole('heading', { name: /জমে থাকা পড়ার হিসাব/ });
  await waitFor(() => expect(document.querySelectorAll('.backlog-row').length).toBe(0));
  expect(screen.getByText('ব্যাকলগ নেই।')).toBeTruthy();
});

it('never shows a day beyond its daily ceiling', async () => {
  seedLate();
  render(<App />);
  await screen.findByRole('heading', { name: /জমে থাকা পড়ার হিসাব/ });
  const labels = [...document.querySelectorAll('.backlog-day small')].map(node => node.textContent ?? '');
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    const [used, cap] = label.replace(/[^\d/]/g, '').split('/').map(Number);
    expect(used).toBeLessThanOrEqual(cap);
  }
});

it('offers the honest "let go" action when a day is full', async () => {
  seedLate();
  render(<App />);
  await screen.findByRole('heading', { name: /জমে থাকা পড়ার হিসাব/ });
  // A fresh profile's plan is already at the cap every day, so the page must explain
  // that instead of pretending it found room.
  expect(screen.getByText(/জায়গা নেই—সৎ উত্তর/)).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /ছেড়ে দাও/ }).length).toBeGreaterThan(0);
  const place = screen.getByRole('button', { name: /খালি জায়গায় ভাগ করে বসাও/ }) as HTMLButtonElement;
  expect(place.disabled).toBe(true);
});
