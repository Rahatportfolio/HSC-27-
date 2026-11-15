// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { CHAPTERS } from './data';
import { buildPlan, chapterTasks, freshData, STORAGE_KEY } from './planner';

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
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function go(view: string) {
  act(() => {
    window.location.hash = `#${view}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
describe('application shell', () => {
  it('renders the dashboard and every view without crashing', async () => {
    render(<App />);
    expect(await screen.findByText(/এগিয়ে যাই/)).toBeTruthy();
    const views: [string, RegExp][] = [
      ['calendar', /এক দিন। এক পদক্ষেপ।/],
      ['syllabus', /সিলেবাসটা গুছিয়ে নিই।/],
      ['revision', /ভুলে যাওয়ার আগেই ঝালাই।/],
      ['timer', /সময় গুনি, মন দিই।/],
      ['practice', /যাচাই করো, তারপর এগোও।/],
      ['exams', /ভুল হোক এখানেই।/],
      ['analytics', /নিজের সঙ্গে তুলনা।/],
      ['library', /নিজের সংগ্রহ, নিজের হাতে।/],
      ['reminders', /পড়ার কথা মনে থাকবে।/],
      ['settings', /তোমার পড়া, তোমার ছন্দে।/],
    ];
    for (const [view, heading] of views) {
      go(view);
      expect(await screen.findByText(heading), view).toBeTruthy();
    }
  });
  it('applies the chosen theme', async () => {
    render(<App />);
    go('settings');
    const dark = await screen.findByRole('button', { name: /গাঢ়/ });
    act(() => { dark.click(); });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
  it('renders the English shell when the saved language is English', async () => {
    const data = freshData();
    data.settings.language = 'en';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />);
    expect((await screen.findAllByText("Today's study")).length).toBeGreaterThan(0);
    go('calendar');
    expect(await screen.findByText('One day. One step.')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });
  it('switches the interface language from settings', async () => {
    render(<App />);
    go('settings');
    const english = await screen.findByRole('button', { name: /English/ });
    act(() => { english.click(); });
    const save = screen.getByRole('button', { name: /সেভ করো/ });
    await act(async () => { save.click(); });
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(await screen.findByText("Today's study")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings.language).toBe('en');
  });
  it('creates revision cards for a completed chapter and shows them', async () => {
    const data = freshData();
    const plan = buildPlan();
    for (const task of chapterTasks(plan, CHAPTERS[0].id)) data.completed[task.id] = '2026-11-14T08:00:00.000Z';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />);
    go('revision');
    expect(await screen.findByText(CHAPTERS[0].title)).toBeTruthy();
    expect((await screen.findAllByText(/১ দিন পরের রিভিশন/)).length).toBeGreaterThan(0);
  });
  it('adds a custom weekly routine block from the calendar', async () => {
    render(<App />);
    go('calendar');
    expect(await screen.findByText('কাস্টম সাপ্তাহিক রুটিন')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('শুরু'), { target: { value: '20:00' } });
    fireEvent.click(screen.getByRole('button', { name: /ব্লক যোগ করো/ }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(stored.routineBlocks).toHaveLength(1);
      expect(stored.routineBlocks[0]).toMatchObject({ startMinute: 1200, minutes: 60, subject: 'physics' });
    });
    expect(await screen.findByText(/২০:০০/)).toBeTruthy();
  });
  it('reorders custom routine blocks with the move buttons', async () => {
    const data = freshData();
    const at = '2026-11-01T06:00:00.000Z';
    const weekday = new Date('2026-11-14T00:00:00Z').getUTCDay();
    data.routineBlocks = [
      { id: 'block-a', weekday, startMinute: 1200, minutes: 60, subject: 'physics', title: 'পদার্থ', createdAt: at },
      { id: 'block-b', weekday, startMinute: 1260, minutes: 45, subject: 'chemistry', title: 'রসায়ন', createdAt: at },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />);
    go('calendar');
    fireEvent.click(await screen.findByRole('button', { name: 'শনি' }));
    const upButtons = await screen.findAllByRole('button', { name: 'ব্লক উপরে সরাও' });
    expect((upButtons[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(upButtons[1]);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const first = stored.routineBlocks.find((block: { id: string }) => block.id === 'block-a');
      const second = stored.routineBlocks.find((block: { id: string }) => block.id === 'block-b');
      expect(first.startMinute).toBe(1260);
      expect(second.startMinute).toBe(1200);
    });
  });
  it('adds an important date and shows it on the dashboard', async () => {
    render(<App />);
    go('calendar');
    expect(await screen.findByText('গুরুত্বপূর্ণ তারিখ')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('তারিখ'), { target: { value: '2027-01-15' } });
    fireEvent.change(screen.getByLabelText('নাম', { exact: true }), { target: { value: 'রসায়ন মডেল টেস্ট' } });
    fireEvent.click(screen.getByRole('button', { name: /তারিখ যোগ করো/ }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(stored.importantDates).toHaveLength(1);
    });
    go('today');
    expect(await screen.findByText(/রসায়ন মডেল টেস্ট/)).toBeTruthy();
  });
  it('toggles focus mode on the timer page', async () => {
    render(<App />);
    go('timer');
    const toggle = await screen.findByRole('button', { name: /ফোকাস মোড/ });
    act(() => { toggle.click(); });
    expect(document.documentElement.classList.contains('focus-mode')).toBe(true);
  });
  it('lets the Android back gesture close an open chapter sheet', async () => {
    render(<App />);
    go('syllabus');
    const row = await screen.findByRole('button', { name: new RegExp(CHAPTERS[0].title) });
    await act(async () => { row.click(); });
    expect(await screen.findByText(/এই অধ্যায়ে কতটা আত্মবিশ্বাসী/)).toBeTruthy();
    // The sheet pushed one history entry; the system back gesture pops it.
    act(() => { history.back(); });
    await waitFor(() => expect(screen.queryByText(/এই অধ্যায়ে কতটা আত্মবিশ্বাসী/)).toBeNull());
  });

  it('starts an MCQ quiz and records the answer', async () => {
    render(<App />);
    go('practice');
    const start = await screen.findByRole('button', { name: /কুইজ শুরু করো/ });
    act(() => { start.click(); });
    const options = document.querySelectorAll<HTMLButtonElement>('.quiz-option');
    expect(options.length).toBe(4);
    act(() => { options[0].click(); });
    expect(await screen.findByText(/সঠিক উত্তর!|ভুল। সঠিক উত্তর:/)).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored.attempts.length).toBe(1);
  });

  it('displays top live Test Exam + HSC 27 countdowns and inline One-Shot/CQ/MCQ class blocks on Today', async () => {
    render(<App />);
    const countdown = screen.getByRole('region', { name: /পরীক্ষার কাউন্টডাউন/ });
    expect(countdown.textContent).toContain('টেস্ট পরীক্ষা');
    expect(countdown.textContent).toContain('HSC ’২৭ পরীক্ষা');
    expect(await screen.findByText(/আজকের নির্ধারিত পড়া|এই দিনের পড়া/)).toBeTruthy();
    expect(screen.getAllByText('ওয়ান শট ক্লাস').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CQ সলভিং ক্লাস').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MCQ সলভিং ক্লাস').length).toBeGreaterThan(0);
  });
});

describe('personalized study workflows', () => {
  it('adds a task to only the selected day and persists it', async () => {
    render(<App />);
    const date = await screen.findByLabelText('পড়ার তারিখ নির্বাচন');
    fireEvent.change(date, { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'নতুন কাজ' }));
    fireEvent.change(screen.getByLabelText('কাজের নাম'), { target: { value: 'নিজের পরীক্ষা' } });
    fireEvent.change(screen.getByLabelText('কাজের সময়'), { target: { value: '19:30' } });
    fireEvent.change(screen.getByLabelText('কাজের সময়কাল মিনিট'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'যোগ করো' }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(stored.routineBlocks).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'নিজের পরীক্ষা', date: '2026-11-14', minutes: 45, startMinute: 1170 })]));
    });
    expect(screen.getAllByText('নিজের পরীক্ষা').length).toBeGreaterThan(0);
    fireEvent.change(date, { target: { value: '2026-11-21' } });
    expect(screen.queryByText('নিজের পরীক্ষা')).toBeNull();
  });
  it('marks a whole chapter complete and incomplete from its sheet', async () => {
    render(<App />);
    go('syllabus');
    const chapter = CHAPTERS[0];
    const row = await screen.findByRole('button', { name: new RegExp(chapter.title) });
    fireEvent.click(row);
    fireEvent.click(await screen.findByRole('button', { name: 'পুরো অধ্যায় সম্পন্ন করো' }));
    const taskIds = chapterTasks(buildPlan(), chapter.id).map(task => task.id);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(taskIds.every(id => !!stored.completed[id])).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'অধ্যায় অসম্পূর্ণ করো' }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(taskIds.every(id => !stored.completed[id])).toBe(true);
    });
  });
});
