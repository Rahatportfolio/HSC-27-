// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY, freshData } from './planner';
import { chapterById } from './data';
import { personalBookLabel } from './personalRoutine';
import { setLanguage } from './i18n';
import { personalDataFixture } from './test/personalRoutineFixture';

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
    expect(await screen.findByText(/নিজের মতো পড়ার সময় ঠিক করো/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /আমার বাছাই সেভ করো/ })).toBeTruthy();
    // The heavy per-stage duration editor must stay out of the first screen.
    expect(screen.queryByText(/সময় মিলিয়ে নেওয়ার অধ্যায়/)).toBeNull();
  });

  it('offers a safe website backup import before entering a new routine', async () => {
    const current = { ...freshData(), routineSetupRequired: true };
    current.notes['2026-11-20'] = 'Existing app note';
    const website = personalDataFixture(); website.notes['2026-11-20'] = 'From the website';
    website.routineSetupRequired = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'ওয়েবসাইটের ব্যাকআপ ইমপোর্ট করো' }));
    expect(await screen.findByRole('button', { name: 'Full backup import' })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes['2026-11-20']).toBe('Existing app note');
    const file = new File(['backup'], 'website.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(website) });
    fireEvent.change(screen.getByLabelText('ব্যাকআপ ফাইল'), { target: { files: [file] } });
    const dialog = await screen.findByRole('dialog', { name: 'ব্যাকআপ ফিরিয়ে আনবে?' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes['2026-11-20']).toBe('Existing app note');
    fireEvent.click(within(dialog).getByRole('button', { name: 'ব্যাকআপ ইমপোর্ট করো' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes['2026-11-20']).toBe('From the website'));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.personalRoutine.chapterIds).toEqual(website.personalRoutine!.chapterIds);
    expect(saved.routineSetupRequired).toBe(false);
  }, 30000);

  it('requires a selection and saves only selected S and B chapters', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...freshData(), routineSetupRequired: true }));
    render(<App />);
    const cta = await screen.findByRole('button', { name: /আমার বাছাই সেভ করো/ });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    const selectedIds = ['physics-1-3', 'physics-1-1'];
    for (const id of selectedIds) fireEvent.click(screen.getByLabelText(`${chapterById[id].title} · ${personalBookLabel(id)}`));
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'প্রতিদিন' }));
    fireEvent.change(screen.getByLabelText('নিজের সময়ের শুরুর মুহূর্ত'), { target: { value: '18:00' } });
    fireEvent.change(screen.getByLabelText('নিজের সময়ের শেষ মুহূর্ত'), { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: /নিজের সময় যোগ করো/ }));
    fireEvent.change(screen.getByLabelText('তোমার ঘণ্টা'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('একটানা সেশন (মিনিট)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('সেশনের মাঝে বিরতি (মিনিট)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('পরিকল্পনার শুরুর তারিখ'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('ব্যক্তিগত টেস্ট লক্ষ্য'), { target: { value: '2027-02-01' } });
    fireEvent.change(screen.getByLabelText('ব্যক্তিগত শেষ লক্ষ্য'), { target: { value: '2027-06-06' } });
    expect((cta as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cta);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.routineSetupRequired).toBe(false);
      expect(saved.personalRoutine).toBeTruthy();
      expect(saved.personalRoutine.scope).toBe('SELECTED');
      expect(new Set(saved.personalRoutine.chapterIds)).toEqual(new Set(selectedIds));
      expect(saved.personalRoutine.categories).toEqual({ 'physics-1-3': 'S', 'physics-1-1': 'B' });
      expect(saved.personalRoutine.dailyLimitMinutes).toBe(180);
      expect(saved.personalRoutine.windows.length).toBeGreaterThan(0);
      expect(saved.settings.reminderEnabled).toBe(false);
      expect(saved.personalRoutine.manualWorkloads).toBe(true);
      expect(saved.personalRoutine.workloads['physics-1-3'].class.minutes).toBeNull();
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
