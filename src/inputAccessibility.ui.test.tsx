// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { freshData, STORAGE_KEY } from './planner';
import { setLanguage } from './i18n';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); setLanguage('en'); });
afterEach(cleanup);

describe('native-field accessibility follow-up', () => {
  it.each(['bn', 'en'] as const)('keeps a permanent localised flashcard search name after typing in %s', async language => {
    const data = freshData(); data.settings.language = language;
    data.flashcards = ['Alpha synthetic front', 'Beta synthetic front'].map((front, index) => ({
      id: `input-guard-card-${index}`, subject: 'physics', chapterId: 'physics-1-7',
      front, back: `Synthetic answer ${index}`, category: 'definition', interval: 1,
      dueDate: '2020-01-01', repetitions: 0, easeFactor: 2.5, createdAt: '2020-01-01T03:00:00Z',
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#flashcards';
    render(<App />);
    await screen.findByText('Alpha synthetic front');
    const name = language === 'en' ? 'Search flashcards' : 'ফ্ল্যাশকার্ড খুঁজো';
    const search = screen.getByRole('textbox', { name });
    expect(search.getAttribute('aria-label')).toBe(name);
    fireEvent.change(search, { target: { value: 'Alpha' } });
    expect(screen.getByRole('textbox', { name })).toBe(search);
    expect(screen.queryByText('Beta synthetic front')).toBeNull();
    expect(screen.getByText('Alpha synthetic front')).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('Beta synthetic front')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).flashcards).toEqual(data.flashcards);
  });

  it.each(['bn', 'en'] as const)('keeps the JSON proxy file input out of the keyboard path while its visible button works in %s', async language => {
    const data = freshData(); data.settings.language = language;
    data.notes['2026-11-19'] = 'Do not alter saved study history';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#settings';
    render(<App />);
    const button = await screen.findByRole('button', { name: language === 'en' ? 'Choose file' : 'ফাইল নির্বাচন' });
    const input = screen.getByLabelText(language === 'en' ? 'Backup file' : 'ব্যাকআপ ফাইল') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.hidden || input.tabIndex < 0, 'An invisible file picker must not become a keyboard stop').toBe(true);
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes).toEqual(data.notes);
  });
});
