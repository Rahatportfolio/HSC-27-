// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { ClassLinkRow, LessonList, ProgressBar } from './components';
import { CHAPTER_CLASSES } from './classLinks';
import { freshData, STORAGE_KEY } from './planner';
import { setLanguage } from './i18n';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); setLanguage('en'); });
afterEach(cleanup);

describe('A–Z accessible names and honest control semantics', () => {
  it.each([-3, 180, NaN])('names and clamps a progress bar given %s', value => {
    render(<ProgressBar value={value} />);
    const bar = screen.getByRole('progressbar', { name: 'Progress' });
    expect(Number(bar.getAttribute('aria-valuenow'))).toBe(Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0);
  });

  it.each(['bn', 'en'] as const)('includes the entire visible class-link text in the accessible name in %s', language => {
    setLanguage(language);
    const { container } = render(<ClassLinkRow classes={CHAPTER_CLASSES['physics-1-7']} />);
    const links = container.querySelectorAll('a'); expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const visible = link.textContent!.replace(/\s+/g, ' ').trim();
      expect(link.getAttribute('aria-label')).toContain(visible);
    }
  });

  it.each(['bn', 'en'] as const)('keeps visible lesson titles, teacher and state in the link name in %s', language => {
    setLanguage(language);
    const { container } = render(<LessonList lessons={[{ title: 'জীবন ও বৃক্ষ', channel: 'সাকিব স্যার', url: 'https://www.youtube.com/watch?v=7taAlu8mXrU' }, { title: 'Revision search' }]} />);
    for (const link of container.querySelectorAll('a')) expect(screen.getByRole('link', { name: link.textContent!.replace(/\s+/g, ' ').trim() })).toBe(link);
  });

  it.each(['bn', 'en'] as const)('keeps desktop header text in the button names in %s', async language => {
    const data = freshData(); data.settings.language = language;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#calendar';
    const { container } = render(<App />); await screen.findByRole('region', { name: language === 'en' ? 'Plan milestones' : 'পরিকল্পনার মাইলফলক' });
    for (const selector of ['.brand', '.global-search']) {
      const button = container.querySelector(selector)!;
      const visible = button.textContent!.replace(/\s+/g, ' ').trim();
      expect(screen.getByRole('button', { name: visible, hidden: true })).toBe(button);
    }
    const more = container.querySelector('.mobile-bottom-nav button:last-child')!;
    expect(more.getAttribute('aria-label')).toContain(more.textContent!.trim());
    for (const cell of container.querySelectorAll('.calendar-cell')) expect(cell.getAttribute('aria-label')).toContain(cell.textContent!.replace(/\s+/g, ' ').trim());
  });

  it.each(['bn', 'en'] as const)('gives completion filters a named group and the chapter rating a localised image role in %s', async language => {
    const data = freshData(); data.settings.language = language;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#syllabus';
    render(<App />); await screen.findByLabelText(language === 'en' ? 'Search chapters' : 'অধ্যায় খুঁজো');
    const group = screen.getByRole('group', { name: language === 'en' ? 'Completion status' : 'সম্পন্ন অবস্থা' });
    const pending = within(group).getByRole('button', { name: language === 'en' ? 'Pending' : 'বাকি' });
    fireEvent.click(pending); expect(pending.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(document.querySelector('.chapter-row')!);
    const dialog = screen.getByRole('dialog');
    const rating = within(dialog).getByRole('img', { name: language === 'en' ? /^Importance: [135] of 5 stars$/ : /^গুরুত্ব: [১৩৫]\/৫ স্টার$/ });
    expect(rating.classList.contains('star-badge')).toBe(true);
  });

  it.each(['bn', 'en'] as const)('gives every MCQ option and correct-answer control a localised name and saves the selected answer in %s', async language => {
    const data = freshData(); data.settings.language = language;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#practice';
    render(<App />); await screen.findByText(language === 'en' ? 'Generate questions' : 'স্বয়ংক্রিয় প্রশ্ন তৈরি');
    fireEvent.click(document.querySelector('.question-manage .button')!);
    const dialog = within(screen.getByRole('dialog', { name: language === 'en' ? 'Add your own MCQ' : 'নিজের MCQ যোগ করো' }));
    fireEvent.change(dialog.getByRole('textbox', { name: language === 'en' ? 'Question' : 'প্রশ্ন' }), { target: { value: 'Synthetic four-option question' } });
    for (let index = 0; index < 4; index++) {
      const letter = (language === 'en' ? ['A', 'B', 'C', 'D'] : ['ক', 'খ', 'গ', 'ঘ'])[index];
      const name = language === 'en' ? `Option ${letter}` : `অপশন ${letter}`;
      const input = dialog.getByRole('textbox', { name });
      expect(input.getAttribute('placeholder')).toBe(name);
      fireEvent.change(input, { target: { value: `Answer ${index}` } });
      const radio = dialog.getByRole('radio', { name: language === 'en' ? `Correct answer ${letter}` : `সঠিক উত্তর ${letter}` });
      expect((radio as HTMLInputElement).checked).toBe(index === 0);
      if (index === 2) fireEvent.click(radio);
    }
    fireEvent.click(dialog.getByRole('button', { name: language === 'en' ? 'Save question' : 'প্রশ্ন সেভ করো' }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.questions.at(-1)).toMatchObject({ question: 'Synthetic four-option question', options: ['Answer 0', 'Answer 1', 'Answer 2', 'Answer 3'], answer: 2 });
  });

  it('hides the decorative profile icon from the accessible button name without hiding the button', async () => {
    const data = freshData(); data.settings.language = 'en'; data.settings.name = 'রাহাত';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#calendar';
    render(<App />); await screen.findByRole('region', { name: 'Plan milestones' });
    const profile = screen.getByRole('button', { name: 'Profile & settings' });
    expect(profile.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(profile.textContent).toBe(''); // No ambiguous initial for short-text name matching.
    fireEvent.click(profile); expect(await screen.findByText('Your study, your rhythm.')).toBeTruthy();
  });

  it.each(['cq', 'formulas', 'boards'] as const)('names the subject selector in the %s tab', async tab => {
    const data = freshData(); data.settings.language = 'en';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = tab === 'cq' ? '#practice' : '#library';
    render(<App />);
    await screen.findByText(tab === 'cq' ? 'Generate questions' : 'Notes library');
    fireEvent.click(document.querySelectorAll(tab === 'cq' ? '.practice-tabs button' : '.library-tabs button')[tab === 'cq' ? 1 : tab === 'formulas' ? 2 : 3]);
    const selectors = document.querySelectorAll('main .filter-bar select'); expect(selectors.length).toBeGreaterThan(0);
    for (const select of selectors) expect(select.getAttribute('aria-label')?.trim()).toBeTruthy();
  });

  it.each([true, false])('respects reduced-motion navigation without disabling the normal preference (reduced=%s)', async reduced => {
    const media = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    try {
      const data = freshData(); data.settings.language = 'en';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#today';
      render(<App />); await screen.findByRole('main');
      vi.mocked(window.scrollTo).mockClear();
      fireEvent.click(document.querySelectorAll('.mobile-bottom-nav button')[1]);
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    } finally { media.mockRestore(); }
  });

  it('names heatmap cells with both their visible chapter number and title', async () => {
    const data = freshData(); data.settings.language = 'en';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#heatmap';
    render(<App />); await screen.findByText('Syllabus map');
    for (const cell of document.querySelectorAll('.heat-cell')) expect(cell.getAttribute('aria-label')).toContain(cell.textContent!.replace(/\s+/g, ' ').trim());
  });

  it('uses pressed filter buttons rather than an invalid tablist, and names the language toggle with its text', async () => {
    const data = freshData(); data.settings.language = 'en';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#calendar';
    render(<App />);
    expect(await screen.findByRole('button', { name: /বাং.*Switch language/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Plan milestones' }).getAttribute('tabindex')).toBe('0');
    fireEvent.click(document.querySelector('.global-search')!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('tablist')).toBeNull();
    const filters = within(dialog).getByRole('group', { name: 'Filter by subject' });
    expect(within(filters).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(filters).getByRole('button', { name: 'পদার্থ' }));
    expect(within(filters).getByRole('button', { name: 'পদার্থ' }).getAttribute('aria-pressed')).toBe('true');
  });
});
