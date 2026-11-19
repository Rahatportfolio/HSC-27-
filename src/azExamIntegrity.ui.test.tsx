// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { freshData, STORAGE_KEY } from './planner';
import type { AppData } from './planner';
import { allQuestions } from './questionBank';
import { parseBackup } from './storage';

type Draft = { id: string; questionIds: string[]; answers: Record<string, number>; index: number; startedAt: number; deadline: number };
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData & { activeExam?: Draft };
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-20T03:00:00Z'));
  localStorage.clear(); window.location.hash = '#examsim';
  const data = freshData(); data.settings.language = 'en'; data.notes['2026-11-19'] = 'Do not change actual study history';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const start = async () => {
  const app = render(<App />); fireEvent.click(await screen.findByRole('button', { name: 'Start the exam' }));
  expect(document.querySelector('.exam-run-card')).toBeTruthy();
  return app;
};

describe('A–Z live simulator persistence in the real App', () => {
  it('restores the same questions, selection, index and absolute deadline without restarting time on reload', async () => {
    const app = await start();
    fireEvent.click(document.querySelectorAll('.quiz-option')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const second = document.querySelector('.quiz-question')!.textContent;
    const draft = await waitFor(() => { expect(saved().activeExam).toBeTruthy(); return saved().activeExam!; });
    expect(draft.index).toBe(1); expect(Object.values(draft.answers)).toEqual([2]);
    const known = new Set(allQuestions(saved()).map(q => q.id)); expect(draft.questionIds.every(id => known.has(id))).toBe(true);
    expect(parseBackup(JSON.stringify(saved())).notes).toEqual(saved().notes);
    app.unmount(); vi.setSystemTime(Date.now() + 30_000); render(<App />);
    await waitFor(() => expect(document.querySelector('.exam-run-card')).toBeTruthy());
    expect(document.querySelector('.quiz-question')!.textContent).toBe(second);
    expect(saved().activeExam).toEqual(draft);
    expect(document.querySelector('.exam-run-clock strong')!.textContent).toBe('09:30');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(document.querySelectorAll('.quiz-option')[2].getAttribute('aria-pressed')).toBe('true');
    expect(saved().notes['2026-11-19']).toBe('Do not change actual study history');
  });

  it('keeps a paper while viewing history, refuses silent replacement and protects its retained questions', async () => {
    render(<App />); fireEvent.click(await screen.findByRole('button', { name: 'Chapter test' }));
    fireEvent.change(screen.getByLabelText('Chapter'), { target: { value: 'physics-1-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the exam' }));
    const draft = await waitFor(() => { expect(saved().activeExam).toBeTruthy(); return saved().activeExam!; });
    expect(saved().questions.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Exam history' }));
    expect(screen.getByRole('button', { name: 'Resume saved paper' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start the exam' }));
    expect(saved().activeExam).toEqual(draft);
    expect(document.querySelector('.exam-run-card')).toBeTruthy();
    const nav = [...document.querySelectorAll('.sidebar .nav-item')].find(el => el.textContent === 'Practice')!;
    fireEvent.click(nav); await screen.findByText('Generate questions');
    const protectedRows = [...document.querySelectorAll('.my-question')].filter(row => saved().questions.filter(q => draft.questionIds.includes(q.id)).some(q => row.textContent!.includes(q.question)));
    expect(protectedRows.length).toBeGreaterThan(0);
    for (const row of protectedRows) expect(row.querySelector('button')!.disabled).toBe(true);
    expect(saved().activeExam).toEqual(draft);
  });

  it('announces the current question and whether each palette item has an answer', async () => {
    await start();
    const cells = [...document.querySelectorAll('.exam-palette-cell')];
    expect(cells.filter(cell => cell.getAttribute('aria-current') === 'step')).toEqual([cells[0]]);
    expect(cells[0].getAttribute('aria-label')).toBe('Question 1 — Unanswered');
    fireEvent.click(document.querySelector('.quiz-option')!);
    expect(cells[0].getAttribute('aria-label')).toBe('Question 1 — Answered');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(cells.filter(cell => cell.getAttribute('aria-current') === 'step')).toEqual([cells[1]]);
    expect(cells[1].getAttribute('aria-label')).toBe('Question 2 — Unanswered');
  });

  it('does not accept an answer after the absolute deadline while a delayed UI tick is still pending', async () => {
    await start();
    const draft = saved().activeExam!;
    vi.setSystemTime(draft.deadline + 1);
    fireEvent.click(document.querySelector('.quiz-option')!);
    expect(saved().activeExam?.answers || saved().examSessions[0].answers).toEqual({});
  });

  it('auto-submits an expired restored paper once, bounded to its allowed time, not the time the app was away', async () => {
    const app = await start(); fireEvent.click(document.querySelector('.quiz-option')!);
    const draft = await waitFor(() => { expect(saved().activeExam).toBeTruthy(); return saved().activeExam!; });
    app.unmount(); vi.setSystemTime(draft.deadline + 24 * 60 * 60 * 1000);
    const reloaded = render(<App />);
    await waitFor(() => expect(saved().examSessions).toHaveLength(1));
    const result = saved().examSessions[0];
    expect(result.id).toBe(draft.id); expect(result.timeTakenSec).toBe((draft.deadline - draft.startedAt) / 1000);
    expect(saved().activeExam).toBeUndefined();
    reloaded.unmount(); render(<App />); await screen.findByRole('button', { name: 'Start the exam' });
    expect(saved().examSessions).toHaveLength(1); expect(saved().attempts).toHaveLength(1);
  });
});
