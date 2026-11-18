// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { freshData, STORAGE_KEY } from './planner';
import type { AppData } from './planner';
import { beginExam } from './examSim';
import { generateForSubject } from './questionGen';
import { setLanguage } from './i18n';

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData;
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-20T03:02:00Z'));
  localStorage.clear(); window.location.hash = '#examsim'; setLanguage('en');
  const questions = generateForSubject('physics', { variant: 'result-complete-definitions', count: 5 });
  expect(questions).toHaveLength(5);
  const data = beginExam(freshData(), { mode: 'subject', subject: 'physics', title: 'Generated result fixture', questions }, Date.parse('2026-11-20T03:00:00Z'));
  data.settings.language = 'en';
  data.activeExam!.answers = { [questions[0].id]: questions[0].answer, [questions[1].id]: (questions[1].answer + 1) % 4 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
});
afterEach(() => { cleanup(); vi.useRealTimers(); setLanguage('bn'); });
const submit = async () => {
  render(<App />); await screen.findByText('Exam in progress');
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(document.querySelector('.exam-result')).toBeTruthy());
  expect(saved().examSessions).toHaveLength(1);
};

describe('A–Z the submitted paper analysis is real and keyboard reachable', () => {
  it('counts retained generated definitions and actual elapsed time in the just-submitted result, not an empty session', async () => {
    await submit();
    const stats = [...document.querySelectorAll('.exam-postmortem-stats strong')].map(el => el.textContent);
    expect(stats).toEqual(['3', '1', '24s']);
    const result = document.querySelector('.exam-postmortem')!;
    expect(result.textContent).not.toContain('No papers yet');
    expect(result.textContent).not.toContain('Nothing measured yet');
    expect(saved().examSessions[0]).toMatchObject({ score: 1, total: 5, timeTakenSec: 120 });
  });

  it('makes the scrollable mistakes region focusable and includes generated questions in history analysis', async () => {
    await submit();
    const region = screen.getByRole('region', { name: 'Exam mistakes and unanswered questions' });
    expect(region.tabIndex).toBe(0);
    region.focus(); expect(document.activeElement).toBe(region);
    fireEvent.click(screen.getByRole('button', { name: 'Exam history' }));
    expect(document.querySelector('.exam-result')).toBeNull();
    expect(document.querySelectorAll('.exam-history-row')).toHaveLength(1);
    expect(document.querySelector('.exam-trend-card')?.textContent).toContain('5 retained questions');
  });
});
