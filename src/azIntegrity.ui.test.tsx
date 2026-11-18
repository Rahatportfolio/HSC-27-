// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { freshData, STORAGE_KEY } from './planner';
import { LIMITS, parseBackup } from './storage';
import type { AppData } from './planner';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const fixture = () => {
  const data = freshData(); data.settings.language = 'en';
  data.notes['2026-11-19'] = 'Keep real history at every capacity boundary';
  return data;
};
const saved = (): AppData => parseBackup(localStorage.getItem(STORAGE_KEY)!);
const question = (index: number): AppData['questions'][number] => ({ id: `capacity-${index}`, subject: 'physics', chapterId: 'physics-1-7', question: `Saved textbook question ${index}`, options: ['A', 'B', 'C', 'D'], answer: 0, createdAt: '2026-11-16T01:00:00Z' });

async function generateAtCapacity(count: number) {
  const data = fixture(); data.questions = Array.from({ length: count }, (_, i) => question(i));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#practice';
  render(<App />);
  await screen.findByText('Generate questions');
  const chapter = document.querySelectorAll('.quiz-setup-grid select')[1];
  fireEvent.change(chapter, { target: { value: 'physics-1-7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate for this chapter' }));
  return data;
}

describe('A–Z visible capacity and reload flows', () => {
  it('does not report a generated quiz when the question library is already full', async () => {
    const original = await generateAtCapacity(LIMITS.questions);
    expect(document.querySelector('.quiz-run')).toBeNull();
    expect(document.querySelector('.toast')?.textContent).toMatch(/2000|2,000/);
    expect(saved().questions).toEqual(original.questions);
    expect(saved().notes).toEqual(original.notes);
  });

  it('starts a partial-capacity quiz using only the new questions that were actually kept', async () => {
    const original = await generateAtCapacity(LIMITS.questions - 2);
    const stored = saved();
    expect(stored.questions).toHaveLength(LIMITS.questions);
    expect(stored.questions.slice(0, original.questions.length)).toEqual(original.questions);
    expect(document.querySelector('.quiz-topline')?.textContent).toMatch(/1\s*\/\s*2/);
    expect(document.querySelectorAll('.quiz-option')).toHaveLength(4);
    expect(stored.notes).toEqual(original.notes);
    fireEvent.click(document.querySelector('.quiz-option')!);
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(document.querySelector('.quiz-topline')?.textContent).toMatch(/2\s*\/\s*2/);
    expect(document.querySelectorAll('.quiz-option')).toHaveLength(4);
    fireEvent.click(document.querySelector('.quiz-option')!);
    expect(screen.getByRole('button', { name: 'New quiz' })).toBeTruthy();
    expect(saved().attempts).toHaveLength(2);
  });

  it('keeps the flashcard editor and user text when the card limit blocks creation', async () => {
    const data = fixture();
    data.flashcards = Array.from({ length: LIMITS.flashcards }, (_, i) => ({ id: `card-capacity-${i}`, subject: 'physics', front: `Stored card ${i}`, back: 'Stored answer', category: 'definition', interval: 1, dueDate: '2027-12-01', repetitions: 0, easeFactor: 2.5, createdAt: '2026-11-16T01:00:00Z' }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#flashcards';
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a new card' }));
    const modal = screen.getByRole('dialog');
    fireEvent.change(within(modal).getByLabelText('Front / question'), { target: { value: 'Do not silently lose this typed question' } });
    fireEvent.change(within(modal).getByLabelText('Back / answer'), { target: { value: 'My answer must remain editable' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Add card' }));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(within(screen.getByRole('dialog')).getByLabelText('Front / question')).toHaveProperty('value', 'Do not silently lose this typed question');
    expect(screen.getByRole('alert').textContent).toMatch(/5000|5,000/);
    expect(saved().flashcards).toEqual(data.flashcards);
    expect(saved().notes).toEqual(data.notes);
  });


  it('keeps a valid manually typed question editable when the question library is already full', async () => {
    const data = fixture(); data.questions = Array.from({ length: LIMITS.questions }, (_, i) => question(i));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#practice';
    render(<App />); await screen.findByText('Generate questions');
    fireEvent.click(document.querySelector('.question-manage .button')!);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Question'), { target: { value: 'Keep my typed question' } });
    dialog.querySelectorAll('.option-input input:not([type=radio])').forEach((input, index) => fireEvent.change(input, { target: { value: `Option ${index}` } }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save question' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(dialog).getByLabelText('Question')).toHaveProperty('value', 'Keep my typed question');
    expect(screen.getByRole('alert').textContent).toContain('2000');
    expect(saved().questions).toEqual(data.questions);
  });

  it.each(['question', 'option', 'explanation'] as const)('rejects an oversized %s without closing or losing typed text', async field => {
    const data = fixture(); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#practice';
    render(<App />); await screen.findByText('Generate questions');
    fireEvent.click(document.querySelector('.question-manage .button')!);
    const dialog = screen.getByRole('dialog');
    const questionInput = within(dialog).getByLabelText('Question');
    const explanation = within(dialog).getByLabelText('Explanation (optional)');
    fireEvent.change(questionInput, { target: { value: field === 'question' ? 'Q'.repeat(2001) : 'Preserve this question' } });
    const options = dialog.querySelectorAll('.option-input input:not([type=radio])');
    options.forEach((option, index) => fireEvent.change(option, { target: { value: field === 'option' && index === 0 ? 'A'.repeat(501) : `Choice ${index}` } }));
    if (field === 'explanation') fireEvent.change(explanation, { target: { value: 'E'.repeat(2001) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save question' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/2000|500/);
    expect(saved().questions).toHaveLength(0);
    expect(saved().notes).toEqual(data.notes);
  });

  it('bounds flashcard form fields to the reload schema', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture())); window.location.hash = '#flashcards';
    render(<App />); fireEvent.click(await screen.findByRole('button', { name: 'Add a new card' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Front / question').getAttribute('maxlength')).toBe('2000');
    expect(within(dialog).getByLabelText('Back / answer').getAttribute('maxlength')).toBe('5000');
  });

  it('shows optional F honestly and keeps a missing compulsory result unknown in the GPA screen', async () => {
    const data = fixture(); data.gpaMarks = { physics: 160, chemistry: 160, biology: 160, bangla: 160, english: 160, ict: 80, math: 0 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#exams';
    render(<App />); await screen.findByText('GPA & Golden A+ tracker');
    expect(document.querySelector('.gpa-badge strong')?.textContent).toBe('5.00');
    expect(document.querySelector('.gpa-flags .bad')).toBeNull();
    expect(document.querySelector('[data-golden-verdict]')?.className).toContain('ok');
    fireEvent.change(screen.getByLabelText('পদার্থবিজ্ঞান প্রাপ্ত নম্বর'), { target: { value: '' } });
    expect(document.querySelector('.gpa-badge strong')?.textContent).toBe('—');
    expect(saved().gpaMarks.physics).toBeNull();
    expect(saved().notes).toEqual(data.notes);
  });

  it('keeps rated flashcards and unrelated history through a real App unmount/reload', async () => {
    const data = fixture();
    data.flashcards = [{ id: 'review-roundtrip', subject: 'physics', front: 'Roundtrip card', back: 'The saved answer', category: 'definition', interval: 1, dueDate: '2026-01-01', repetitions: 0, easeFactor: 2.5, createdAt: '2026-01-01T00:00:00Z' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); window.location.hash = '#flashcards';
    const app = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Answer & rate' }));
    fireEvent.click(screen.getByRole('button', { name: /ভালো|Good/ }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).flashcards[0].repetitions).toBe(1));
    app.unmount(); render(<App />);
    await screen.findByText('Flashcard revision');
    expect(saved().flashcards).toHaveLength(1);
    expect(saved().flashcards[0].repetitions).toBe(1);
    expect(saved().notes).toEqual(data.notes);
    expect(document.querySelector('.storage-warning')).toBeNull();
  });
});
