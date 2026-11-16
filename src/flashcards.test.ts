import { describe, expect, it } from 'vitest';
import { freshData } from './planner';
import { addDays, todayKey } from './planner';
import { createFlashcard, deleteFlashcard, dueCount, dueFlashcards, editFlashcard, flashcardTotals, reviewFlashcard } from './flashcards';
import { FLASHCARD_LADDER } from './flashcards';

const base = (): ReturnType<typeof freshData> => freshData();
const today = todayKey(new Date());

describe('flashcards', () => {
  it('creates a card due today with the ladder interval', () => {
    const data = base();
    const next = createFlashcard(data, { subject: 'physics', front: 'ভেক্টর কী?', back: 'দিক ও বরাবর sahip রাশি', category: 'definition' });
    expect(next.flashcards).toHaveLength(1);
    const card = next.flashcards[0];
    expect(card.interval).toBe(1);
    expect(card.dueDate).toBe(today);
    expect(card.repetitions).toBe(0);
    expect(card.easeFactor).toBe(2.5);
  });

  it('respects the flashcard limit', () => {
    let data = base();
    for (let i = 0; i < 5000; i++) data = createFlashcard(data, { subject: 'physics', front: `q${i}`, back: `a${i}`, category: 'other' });
    expect(createFlashcard(data, { subject: 'physics', front: 'extra', back: 'extra', category: 'other' }).flashcards).toHaveLength(5000);
  });

  it('reviews with again resetting to day one', () => {
    let data = base();
    data = createFlashcard(data, { subject: 'physics', front: 'q', back: 'a', category: 'definition' });
    data = createFlashcard(data, { subject: 'chemistry', front: 'q2', back: 'a2', category: 'formula' });
    const card = data.flashcards[0];
    const { data: after } = reviewFlashcard(data, card.id, 'again', '2026-11-14');
    const reviewed = after.flashcards.find(c => c.id === card.id)!;
    expect(reviewed.interval).toBe(1);
    expect(reviewed.repetitions).toBe(0);
    expect(reviewed.dueDate).toBe('2026-11-15');
    expect(reviewed.lastReviewed).toBe('2026-11-14');
  });

  it('good review grows the interval along the ease ladder', () => {
    let data = base();
    data = createFlashcard(data, { subject: 'physics', front: 'q', back: 'a', category: 'definition' });
    const card = data.flashcards[0];
    let { data: after } = reviewFlashcard(data, card.id, 'good', today);
    let c = after.flashcards.find(x => x.id === card.id)!;
    expect(c.interval).toBe(3);
    expect(c.dueDate).toBe(addDays(today, 3));
    { const r = reviewFlashcard(after, card.id, 'good', addDays(today, 3)); data = r.data; c = r.card; }
    expect(c.repetitions).toBe(2);
    expect(c.dueDate).toBe(addDays(today, 11));
  });

  it('easy review grows faster than good', () => {
    let data = base();
    data = createFlashcard(data, { subject: 'physics', front: 'q', back: 'a', category: 'definition' });
    const card = data.flashcards[0];
    const good = reviewFlashcard(data, card.id, 'good', '2026-11-14');
    data = createFlashcard(data, { subject: 'physics', front: 'q2', back: 'a2', category: 'formula' });
    const card2 = data.flashcards[1];
    const easy = reviewFlashcard(data, card2.id, 'easy', '2026-11-14');
    expect(easy.card.interval).toBeGreaterThanOrEqual(good.card.interval);
  });

  it('hard review increases ease less and interval modestly', () => {
    let data = base();
    data = createFlashcard(data, { subject: 'physics', front: 'q', back: 'a', category: 'definition' });
    const card = data.flashcards[0];
    const { data: after } = reviewFlashcard(data, card.id, 'hard', '2026-11-14');
    const c = after.flashcards.find(x => x.id === card.id)!;
    expect(c.interval).toBe(2);
    expect(c.easeFactor).toBeLessThan(2.5);
  });

  it('dueFlashcards returns only due cards, oldest due first', () => {
    let data = base();
    data = createFlashcard(data, { subject: 'physics', front: 'old', back: 'a', category: 'definition' });
    data = createFlashcard(data, { subject: 'physics', front: 'new', back: 'a', category: 'definition' });
    const { data: after1 } = reviewFlashcard(data, data.flashcards[0].id, 'good', today);
    data = after1;
    const { data: after2 } = reviewFlashcard(data, data.flashcards[1].id, 'again', today);
    data = after2;
    const dueSoon = dueFlashcards(data, addDays(today, 1));
    expect(dueSoon.map(c => c.front)).toEqual(['new']);
    const dueLater = dueFlashcards(data, addDays(today, 3));
    expect(dueLater.map(c => c.front)).toEqual(['new', 'old']);
    expect(dueCount(data, addDays(today, 1))).toBe(1);
    expect(dueCount(data, today)).toBe(0);
  });

  it('editFlashcard updates content', () => {
    let data = base();
    data = createFlashcard(data, { subject: 'physics', front: 'q', back: 'a', category: 'definition' });
    data = editFlashcard(data, data.flashcards[0].id, { front: 'q-modified', category: 'formula' });
    expect(data.flashcards[0].front).toBe('q-modified');
    expect(data.flashcards[0].category).toBe('formula');
    expect(editFlashcard(data, 'missing', { front: 'x' })).toBe(data);
  });

  it('deleteFlashcard removes a card', () => {
    let data = base();
    data = createFlashcard(data, { subject: 'physics', front: 'q', back: 'a', category: 'definition' });
    data = createFlashcard(data, { subject: 'physics', front: 'q2', back: 'a2', category: 'formula' });
    data = deleteFlashcard(data, data.flashcards[0].id);
    expect(data.flashcards).toHaveLength(1);
    expect(deleteFlashcard(data, 'missing')).toBe(data);
  });

  it('flashcardTotals counts learned cards', () => {
    let data = base();
    expect(flashcardTotals(data)).toEqual({ total: 0, learned: 0 });
    data = createFlashcard(data, { subject: 'physics', front: 'q', back: 'a', category: 'definition' });
    expect(flashcardTotals(data)).toEqual({ total: 1, learned: 0 });
    data = reviewFlashcard(data, data.flashcards[0].id, 'good', '2026-11-14').data;
    expect(flashcardTotals(data).learned).toBe(1);
  });

  it('FLASHCARD_LADDER contains the expected review gaps', () => {
    expect(FLASHCARD_LADDER).toEqual([1, 3, 7, 14, 30]);
  });
});
