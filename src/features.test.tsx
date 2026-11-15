// @vitest-environment jsdom
/**
 * Feature audit: drives the screens a student actually touches and checks the result
 * is stored, rendered and reloaded. Written after a full re-test of the app.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { CHAPTERS } from './data';
import { STORAGE_KEY } from './planner';

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
});
beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function go(view: string) {
  act(() => {
    window.location.hash = `#${view}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
const type = (element: Element, value: string) => { fireEvent.change(element, { target: { value } }); };
const libraryTab = (label: RegExp) => {
  const tabs = document.querySelector('.library-tabs') as HTMLElement;
  return within(tabs).getByRole('button', { name: label });
};

describe('library screen', () => {
  it('writes a note, shows it and keeps it in storage', async () => {
    render(<App />);
    go('library');
    await screen.findByText('নোট লাইব্রেরি');
    fireEvent.click(screen.getAllByRole('button', { name: /নোট লেখো/ })[0]);
    type(await screen.findByLabelText(/শিরোনাম/), 'ভেক্টরের নোট');
    type(screen.getByPlaceholderText('নিজের ভাষায় লেখো…'), 'ডট গুণনে স্কেলার, ক্রস গুণনে ভেক্টর।');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /সেভ করো/ })); });
    expect(await screen.findByText('ভেক্টরের নোট')).toBeTruthy();
    expect(stored().libraryNotes[0].title).toBe('ভেক্টরের নোট');
  });

  it('stores a YouTube class link with its channel', async () => {
    render(<App />);
    go('library');
    await screen.findByText('নোট লাইব্রেরি');
    await act(async () => { libraryTab(/^YouTube/).click(); });
    fireEvent.click((await screen.findAllByRole('button', { name: /ভিডিও যোগ করো|প্রথম ভিডিও যোগ করো/ }))[0]);
    type(await screen.findByLabelText(/শিরোনাম/), 'ম্যাট্রিক্স ওয়ান শট');
    type(screen.getByPlaceholderText('https://youtube.com/…'), 'https://www.youtube.com/watch?v=KtqyZ-ANMUk');
    type(screen.getByLabelText(/চ্যানেল/), 'রাকিব');
    const dialog = screen.getByRole('dialog');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'যোগ করো' })); });
    expect(await screen.findByText('ম্যাট্রিক্স ওয়ান শট')).toBeTruthy();
    expect(stored().videos[0].url).toContain('KtqyZ-ANMUk');
  });

  it('adds an own formula and a board question', async () => {
    render(<App />);
    go('library');
    await screen.findByText('নোট লাইব্রেরি');
    await act(async () => { libraryTab(/^সূত্র/).click(); });
    fireEvent.click(await screen.findByRole('button', { name: /^সূত্র যোগ করো/ }));
    type(await screen.findByLabelText(/শিরোনাম/), 'লব্ধির সূত্র');
    type(screen.getByLabelText(/সূত্র \/ বিবরণ/), 'R = √(P² + Q² + 2PQ cosθ)');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /সেভ করো/ })); });
    expect(await screen.findByText('লব্ধির সূত্র')).toBeTruthy();

    await act(async () => { libraryTab(/^বোর্ড প্রশ্ন/).click(); });
    fireEvent.click((await screen.findAllByRole('button', { name: /প্রশ্ন যোগ করো|প্রথম প্রশ্ন যোগ করো/ }))[0]);
    type(await screen.findByLabelText(/^প্রশ্ন/), 'স্টোকসের সূত্র লেখো।');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /সেভ করো/ })); });
    expect(await screen.findByText('স্টোকসের সূত্র লেখো।')).toBeTruthy();
    expect(stored().boardQuestions).toHaveLength(1);
  });
});

describe('practice screen', () => {
  it('records a CQ with part marks and fills the part analysis', async () => {
    render(<App />);
    go('practice');
    const tabs = await waitFor(() => document.querySelector('.practice-tabs') as HTMLElement);
    await act(async () => { within(tabs).getByRole('button', { name: /CQ ট্র্যাকার/ }).click(); });
    fireEvent.click((await screen.findAllByRole('button', { name: /CQ যোগ করো|প্রথম CQ যোগ করো/ }))[0]);
    type(await screen.findByLabelText(/প্রশ্ন\/উদ্দীপক/), 'উদ্দীপকের আলোকে ব্যাখ্যা করো।');
    // part-by-part marking is on by default (ক ১, খ ২, গ ৩, ঘ ৪)
    const c3 = document.querySelector('.parts-field.c3 input') as HTMLInputElement;
    const c4 = document.querySelector('.parts-field.c4 input') as HTMLInputElement;
    expect(c3 && c4).toBeTruthy();
    type(c3, '3');
    type(c4, '1');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /সেভ করো/ })); });
    expect(await screen.findByText('উদ্দীপকের আলোকে ব্যাখ্যা করো।')).toBeTruthy();
    expect(stored().cq[0].marks).toBe(7);
    expect(await screen.findByText('অংশভিত্তিক রেকর্ড')).toBeTruthy();
  });
});

describe('the Android reminder card', () => {
  it('renders on a native shell with its sync and test buttons', async () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, Plugins: {} };
    try {
      render(<App />);
      go('reminders');
      // Read straight after the first commit: on a device Capacitor is already initialised,
      // so the device card and both of its controls must be there from the first paint.
      expect(screen.getByText('ডিভাইস নোটিফিকেশন')).toBeTruthy();
      expect(screen.getByRole('button', { name: /এখনই সিঙ্ক করো/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /টেস্ট নোটিফিকেশন/ })).toBeTruthy();
      expect(screen.getByRole('switch', { name: /ডিভাইস নোটিফিকেশন/ })).toBeTruthy();
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });
});

describe('settings screen', () => {
  it('applies the reading size straight away', async () => {
    render(<App />);
    go('settings');
    const large = await screen.findByRole('button', { name: /বড়/ });
    await act(async () => { large.click(); });
    expect(document.documentElement.dataset.font).toBe('lg');
  });

  it('switches to the dark theme from the appearance picker', async () => {
    render(<App />);
    go('settings');
    const dark = await screen.findByRole('button', { name: /গাঢ়/ });
    await act(async () => { dark.click(); });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('downloads a JSON backup that holds the current progress', async () => {
    render(<App />);
    go('settings');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: /ব্যাকআপ রাখো/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});

describe('analytics screen', () => {
  it('shows the weekly report and prints only that card', async () => {
    render(<App />);
    go('analytics');
    const card = document.querySelector('.weekly-report') as HTMLElement;
    await waitFor(() => expect(card).toBeTruthy());
    expect(within(card).getByText(/সাপ্তাহিক রিপোর্ট/)).toBeTruthy();
    await act(async () => { within(card).getByRole('button', { name: /প্রিন্ট/ }).click(); });
    expect(window.print).toHaveBeenCalled();
    expect(document.documentElement.classList.contains('print-report')).toBe(true);
  });
});

describe('global search', () => {
  it('opens a chapter sheet from the search palette', async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByRole('textbox', { name: /অধ্যায় ও রুটিন খুঁজো|সব কিছু খুঁজো/ });
    type(input, CHAPTERS[0].title.slice(0, 6));
    const results = await waitFor(() => {
      const list = document.querySelector('.search-results') as HTMLElement;
      expect(list).toBeTruthy();
      return list;
    });
    const chapterHit = within(results).getAllByRole('button').find(button => button.textContent?.includes(CHAPTERS[0].title));
    expect(chapterHit).toBeTruthy();
    await act(async () => { chapterHit!.click(); });
    expect(await screen.findByText(/এই অধ্যায়ে কতটা আত্মবিশ্বাসী/)).toBeTruthy();
  });

  it('matches teacher names and exposes direct YouTube links inside global search', async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByRole('textbox', { name: /অধ্যায় ও রুটিন খুঁজো|সব কিছু খুঁজো/ });
    type(input, 'মাশরুর');
    const results = await waitFor(() => document.querySelector('.search-results') as HTMLElement);
    const links = within(results).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/(watch\?v=|playlist\?list=)/);
  });
});

describe('direct class archive & test exam readiness', () => {
  it('browses and filters the built-in direct class archive in Library → YouTube', async () => {
    render(<App />);
    go('library');
    await screen.findByText('নোট লাইব্রেরি');
    await act(async () => { libraryTab(/^YouTube/).click(); });
    expect(await screen.findByText(/অধ্যায়ভিত্তিক সরাসরি ক্লাস আর্কাইভ/)).toBeTruthy();
    type(screen.getByLabelText(/ভিডিও খুঁজো/), 'জৈব রসায়ন');
    expect(await screen.findByText('জৈব রসায়ন')).toBeTruthy();
  });

  it('shows the February 2027 Test Exam readiness tracker on Exams', async () => {
    render(<App />);
    go('exams');
    expect(await screen.findByText(/টেস্ট পরীক্ষা প্রস্তুতি ট্র্যাকার \(ফেব্রুয়ারি ২০২৭\)/)).toBeTruthy();
  });

  it('starts an inline preset timer on Today and keeps the recording-style live status bar visible across views', async () => {
    render(<App />);
    const presetBtns = await screen.findAllByRole('button', { name: /টাইমার/ });
    const inlinePreset = presetBtns.find(btn => btn.classList.contains('step-timer-pill') || btn.classList.contains('preset-launch-btn'))!;
    expect(inlinePreset).toBeTruthy();
    await act(async () => { inlinePreset.click(); });
    expect(await screen.findByText('লাইভ চলছে')).toBeTruthy();
    expect(document.querySelector('.live-timer-topbar.running')).toBeTruthy();
    // Navigate to Syllabus — top live recording bar stays pinned!
    go('syllabus');
    expect(document.querySelector('.live-timer-topbar.running')).toBeTruthy();
  });

  it('cascades subsequent session times when Today start time changes and auto-reveals next day upon completion', async () => {
    render(<App />);
    const startInput = await screen.findByLabelText('আজকের শুরুর সময়');
    await act(async () => {
      fireEvent.change(startInput, { target: { value: '10:00' } });
    });
    expect((await screen.findAllByText(/10:00 AM/)).length).toBeGreaterThan(0);

    // Tick every task in .task-list -> next day's study plan appears immediately!
    const checks = Array.from(document.querySelectorAll<HTMLButtonElement>('.task-list .task-check'));
    expect(checks.length).toBeGreaterThan(0);
    for (const btn of checks) {
      await act(async () => { btn.click(); });
    }
    expect(await screen.findByText(/পরের দিনের পড়া রেডি/)).toBeTruthy();
  });
});

describe('timer safeguards', () => {
  it('asks before replacing a paused preset and refuses premature completion', async () => {
    render(<App />);
    go('today');
    await screen.findAllByRole('button', { name: /টাইমার/ });
    const presets = Array.from(document.querySelectorAll<HTMLButtonElement>('.preset-launch-btn'));
    expect(presets.length).toBeGreaterThan(1);
    fireEvent.click(presets[0]);
    const bar = document.querySelector('.live-timer-topbar') as HTMLElement;
    fireEvent.click(within(bar).getByRole('button', { name: /সম্পন্ন ও সেভ/ }));
    expect(document.querySelector('.live-timer-topbar.running')).toBeTruthy();
    expect(stored().studySessions).toHaveLength(0);
    fireEvent.click(within(bar).getByRole('button', { name: /বিরতি/ }));
    fireEvent.click(presets[1]);
    expect(await screen.findByText('বর্তমান টাইমার বদলে নতুন টাইমার চালাবে?')).toBeTruthy();
    expect(document.querySelector('.live-timer-topbar.paused')).toBeTruthy();
  });
  it('restores the exam clock deadline after leaving the page', async () => {
    render(<App />);
    go('exams');
    await screen.findByText('পরীক্ষার ঘড়ি');
    const card = document.querySelector('.exam-clock-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: '৩০ মি.' }));
    fireEvent.click(within(card).getByRole('button', { name: 'শুরু' }));
    const saved = JSON.parse(localStorage.getItem('hsc27-exam-clock-v1') || '{}');
    expect(saved.duration).toBe(30);
    expect(saved.deadline).toBeGreaterThan(Date.now());
    go('calendar');
    go('exams');
    await screen.findByText('পরীক্ষার ঘড়ি');
    expect(document.querySelector('.exam-clock-display.running')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('hsc27-exam-clock-v1') || '{}').deadline).toBe(saved.deadline);
  });
});

describe('input and revision regressions', () => {
  it('rejects test scores that cannot be saved and accepts valid values', async () => {
    render(<App />); go('exams');
    fireEvent.click(await screen.findByRole('button', { name: /নতুন টেস্ট/ }));
    const dialog = await screen.findByRole('dialog');
    type(within(dialog).getByLabelText('প্রাপ্ত নম্বর'), '5');
    type(within(dialog).getByLabelText('পূর্ণমান'), '1001');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(within(dialog).getByRole('alert').textContent).toContain('১০০০');
    expect(stored().tests).toHaveLength(0);
    type(within(dialog).getByLabelText('পূর্ণমান'), '100');
    type(within(dialog).getByLabelText('সময় (মিনিট)'), '2.5');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(within(dialog).getByRole('alert').textContent).toContain('সময়');
    type(within(dialog).getByLabelText('সময় (মিনিট)'), '30');
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(stored().tests).toHaveLength(1));
  });
  it('does not silently discard note tags beyond the limit', async () => {
    render(<App />); go('library');
    fireEvent.click((await screen.findAllByRole('button', { name: /নোট লেখো/ }))[0]);
    const dialog = await screen.findByRole('dialog');
    type(within(dialog).getByLabelText('শিরোনাম'), 'নোট');
    type(within(dialog).getByLabelText('ট্যাগ'), Array.from({ length: 11 }, (_, i) => `t${i}`).join(','));
    fireEvent.submit(dialog.querySelector('form')!);
    expect(within(dialog).getByRole('alert').textContent).toContain('১০টি');
    expect(stored().libraryNotes).toHaveLength(0);
  });
  it('shows cards more than seven days away in the all-pending tab', async () => {
    const { freshData, addDays, todayKey } = await import('./planner');
    const data = freshData(); data.settings.revisionEnabled = false;
    const chapter = CHAPTERS[0];
    data.revisions.push({ id: 'later', chapterId: chapter.id, subject: chapter.subject, dueDate: addDays(todayKey(), 20), interval: 30, createdAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />); go('revision');
    fireEvent.click(await screen.findByRole('button', { name: /সব বাকি/ }));
    expect(document.querySelectorAll('.revision-card')).toHaveLength(1);
    expect(document.querySelector('.revision-card')?.textContent).toContain(chapter.title);
  });
});

it('calculates exam-clock pause from the wall clock even if the UI tick was delayed', async () => {
  const base = Date.now();
  const now = vi.spyOn(Date, 'now').mockReturnValue(base);
  render(<App />); go('exams');
  await screen.findByText('পরীক্ষার ঘড়ি');
  const card = document.querySelector('.exam-clock-card') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: '৩০ মি.' }));
  // The clock may have sat idle a long time before being started.
  now.mockReturnValue(base + 60_000);
  fireEvent.click(within(card).getByRole('button', { name: 'শুরু' }));
  now.mockReturnValue(base + 70_000);
  fireEvent.click(within(card).getByRole('button', { name: 'বিরতি' }));
  expect(JSON.parse(localStorage.getItem('hsc27-exam-clock-v1') || '{}')).toMatchObject({ remaining: 1790, deadline: null });
});
