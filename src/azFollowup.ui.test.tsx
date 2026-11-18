// @vitest-environment jsdom
/** Synthetic profiles only: missing question definitions must never silently
 * turn a saved paper into a smaller retry or masquerade as zero blank answers. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { freshData, STORAGE_KEY } from './planner';
import type { AppData } from './planner';
import { saveExamSession } from './examSim';
import { parseBackup } from './storage';
import { setLanguage } from './i18n';
import { SUBJECT_FULL_MARKS } from './data';

const saved = (): AppData => parseBackup(localStorage.getItem(STORAGE_KEY)!);
const historyFixture = (retained = 5) => {
  const data = freshData(); data.settings.language = 'en';
  data.notes['2026-11-19'] = 'Preserve actual study history';
  const questions = Array.from({ length: 5 }, (_, index) => ({
    id: `followup-history-${index}`, subject: 'physics' as const, chapterId: 'physics-1-7',
    question: `Saved history question ${index}`, options: ['A', 'B', 'C', 'D'], answer: 0,
    explanation: 'Synthetic question for history safety.', createdAt: '2026-11-19T03:00:00.000Z',
  }));
  const complete = saveExamSession(data, { id: 'followup-saved-paper', mode: 'subject', subject: 'physics', title: 'Original five-question paper', questions, answers: Object.fromEntries(questions.map(question => [question.id, 0])), durationMin: 5, timeTakenSec: 120, date: '2026-11-19' });
  return { ...complete, questions: complete.questions.slice(0, retained) };
};
const mount = async (data: AppData, route = 'examsim') => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = `#${route}`;
  const app = render(<App />);
  await screen.findByText(route === 'practice' ? 'Generate questions' : 'Build a new paper');
  return app;
};
const retry = () => fireEvent.click(within(document.querySelector('.exam-history-row') as HTMLElement).getByRole('button', { name: 'Retry' }));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-20T03:00:00Z')); localStorage.clear(); setLanguage('en'); });
afterEach(() => { cleanup(); vi.useRealTimers(); setLanguage('bn'); });

describe('follow-up saved-paper retry and deletion safety', () => {
  it('retries a fully retained saved paper in its original order without changing its score or notes', async () => {
    const original = historyFixture(); await mount(original); retry();
    expect(saved().activeExam?.questionIds).toEqual(original.examSessions[0].questionIds);
    expect(document.querySelectorAll('.exam-palette-cell')).toHaveLength(5);
    expect(saved().examSessions).toEqual(original.examSessions);
    expect(saved().notes).toEqual(original.notes);
  });

  it('asks before a shortened retry and Cancel changes no saved data or setup mode', async () => {
    await mount(historyFixture(3));
    const before = saved(); const mode = document.querySelector('.exam-mode-tabs .active')?.textContent;
    retry();
    const dialog = screen.getByRole('dialog', { name: 'Some saved questions are unavailable' });
    expect(dialog.textContent).toContain('2 of 5');
    expect(dialog.textContent).toContain('3 retained question(s)');
    expect(saved().activeExam).toBeUndefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(saved()).toEqual(before);
    expect(document.querySelector('.exam-mode-tabs .active')?.textContent).toBe(mode);
    expect(document.querySelector('.exam-run-card')).toBeNull();
  });

  it('starts only the disclosed retained subset after explicit shortened-retry confirmation and restores it on reload', async () => {
    const original = historyFixture(3); const app = await mount(original); retry();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry 3 question(s)' }));
    const draft = saved().activeExam!;
    expect(draft.questionIds).toEqual(original.questions.map(question => question.id));
    expect(document.querySelectorAll('.exam-palette-cell')).toHaveLength(3);
    expect(saved().examSessions).toEqual(original.examSessions);
    app.unmount(); render(<App />); await screen.findByText('Exam in progress');
    expect(saved().activeExam).toEqual(draft);
    expect(document.querySelector('.quiz-question')?.textContent).toBe(original.questions[0].question);
    expect(saved().notes).toEqual(original.notes);
  });

  it('explains an entirely unavailable retry without starting an empty paper or altering history', async () => {
    await mount(historyFixture(0)); const before = saved(); retry();
    expect(document.querySelector('.toast')?.textContent).toContain('None of the 5 saved questions are available');
    expect(saved()).toEqual(before);
    expect(document.querySelector('.exam-run-card')).toBeNull();
  });

  it.each([3, 0])('visibly discloses missing history definitions instead of counting them as answers or blanks (retained=%s)', async retained => {
    const original = historyFixture(retained); await mount(original);
    const warning = screen.getByRole('status', { name: 'Unavailable saved questions' });
    expect(warning.textContent).toContain(`${5 - retained} saved question definition(s) are unavailable`);
    expect(warning.textContent).toContain('Saved scores are unchanged');
    expect(document.querySelector('.exam-trend-card')?.textContent).toContain(`${retained} retained questions`);
    if (!retained) {
      expect(document.querySelectorAll('.exam-trend-stats strong')[2].textContent).toBe('—');
      expect(document.querySelector('.exam-trend-card .exam-postmortem-next')).toBeNull();
    }
    expect(saved().examSessions).toEqual(original.examSessions);
  });

  it('warns that confirmed question deletion affects saved-paper retries but never erases the saved score', async () => {
    const original = historyFixture(); await mount(original, 'practice');
    const remove = () => fireEvent.click(within(document.querySelector('.my-question') as HTMLElement).getByRole('button', { name: 'Delete question' }));
    remove();
    const dialog = screen.getByRole('dialog', { name: 'Delete this question?' });
    expect(dialog.textContent).toContain('used in 1 saved paper(s)');
    expect(dialog.textContent).toContain('analysis and retries');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(saved().questions).toEqual(original.questions);
    remove(); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(saved().questions.map(question => question.id)).toEqual(original.questions.slice(1).map(question => question.id));
    expect(saved().examSessions).toEqual(original.examSessions);
    expect(saved().tests).toEqual(original.tests);
    expect(saved().notes).toEqual(original.notes);
  });
});

describe('follow-up Golden mark-gap presentation', () => {
  it.each([
    ['en', 159.99, '≈0.01'], ['bn', 159.99, '≈০.০১'],
    ['en', 159.999999, '<0.01'], ['bn', 159.999999, '<০.০১'],
    ['en', 160, 'A+ reached'], ['bn', 160, 'A+ আছে'],
  ] as const)('formats the gap for %s marks %s without changing the raw grade or saved marks', async (language, mark, expected) => {
    const data = freshData(); data.settings.language = language;
    data.gpaMarks = Object.fromEntries(Object.entries(SUBJECT_FULL_MARKS).map(([subject, full]) => [subject, full * .85]));
    data.gpaMarks.physics = mark;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#exams';
    render(<App />); await screen.findByText(language === 'en' ? 'GPA & Golden A+ tracker' : 'GPA ও Golden A+ ট্র্যাকার');
    const row = document.querySelector('[data-golden-row="physics"]')!;
    expect(row.querySelector('.golden-next')?.textContent).toContain(expected);
    expect(document.querySelector('.gpa-row .gpa-grade')?.textContent).toBe(mark < 160 ? 'A' : 'A+');
    fireEvent.click(screen.getByRole('button', { name: 'Golden A+' }));
    expect(row.querySelector('.golden-next')?.textContent).toContain(expected);
    const verdict = document.querySelector('[data-golden-verdict]')!;
    if (mark < 160) expect(verdict.querySelector('.golden-verdict-nums')?.textContent).toContain(expected);
    expect(verdict.textContent).not.toMatch(/[০-৯0-9]\\.[০-৯0-9]{6}/);
    expect(saved().gpaMarks).toEqual(data.gpaMarks);
  });
});

describe('follow-up weekly strip localisation', () => {
  it.each(['bn', 'en'] as const)('labels the actual Friday as weekly in %s, even when a monthly slot is overdue today', async language => {
    const data = freshData(); data.settings.language = language;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#examsim';
    render(<App />); await screen.findByText(language === 'en' ? 'Build a new paper' : 'নতুন পরীক্ষা তৈরি করো');
    expect(document.querySelector('.exam-routine-card .card-heading p')?.textContent).toContain(language === 'en' ? 'Due slots use elapsed days' : 'কটা দিন গেছে');
    const days = [...document.querySelectorAll('.exam-week-day')];
    const friday = days.find(day => day.querySelector('strong')?.textContent === (language === 'en' ? 'Fri' : 'শুক্র'))!;
    const saturday = days.find(day => day.querySelector('strong')?.textContent === (language === 'en' ? 'Sat' : 'শনি'))!;
    expect(friday.classList.contains('weekly')).toBe(true);
    expect(friday.querySelector('small')?.textContent).toBe(language === 'en' ? 'weekly' : 'সাপ্তাহিক');
    expect(saturday.classList.contains('weekly')).toBe(false);
    expect(saturday.querySelector('small')?.textContent).not.toBe(language === 'en' ? 'weekly' : 'সাপ্তাহিক');
  });
});
