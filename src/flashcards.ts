import { chapterById, SUBJECTS } from './data';
import type { AppData } from './planner';
import { addDays, todayKey } from './planner';
import { t } from './i18n';
import type { Flashcard, FlashcardRating, FlashcardCategory } from './types';
import { LIMITS, newId, nowIso } from './storage';

/** SM-2 starting values. */
const START_INTERVAL = 1;
const START_REPETITIONS = 0;
const START_EASE = 2.5;
const EASE_FLOOR = 1.3;

/** Ladder the UI shows for due dates: 1/3/7/14/30 days. */
export const FLASHCARD_LADDER: number[] = [1, 3, 7, 14, 30];

export const FLASHCARD_CATEGORY_LABEL: Record<FlashcardCategory, string> = {
  formula: 'সূত্র',
  definition: 'সংজ্ঞা',
  reaction: 'প্রতিক্রিয়া',
  terminology: 'শব্দাবলি',
  identity: 'সর্বসমতা',
  vocabulary: 'শব্দার্থ',
  other: 'অন্যান্য',
};

/** Validate a playback/rating value coming from storage or UI. */
export function isFlashcardRating(value: unknown): value is FlashcardRating {
  return typeof value === 'string' && flashcardRatings.has(value as FlashcardRating);
}
const flashcardRatings = new Set<FlashcardRating>(['again', 'hard', 'good', 'easy']);

/** Chapter a card belongs to, if any. */
export function flashcardChapter(card: Flashcard) {
  return card.chapterId ? chapterById[card.chapterId] : undefined;
}

/** Cards due today or earlier, newest-due-first, capped. */
export function dueFlashcards(data: AppData, today: string): Flashcard[] {
  return [...data.flashcards]
    .filter(card => card.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.createdAt.localeCompare(a.createdAt));
}

/** Cards reviewed today (already due and dealt with). */
export function reviewedToday(data: AppData, today: string): Flashcard[] {
  return data.flashcards.filter(card => card.lastReviewed === today || !!card.lastReviewed && card.lastReviewed.includes('T') && Number.isFinite(Date.parse(card.lastReviewed)) && todayKey(new Date(card.lastReviewed)) === today);
}

/** Count of cards due right now. */
export function dueCount(data: AppData, today: string): number {
  return data.flashcards.filter(card => card.dueDate <= today).length;
}

/** Per-subject due / total counts for the dashboard. */
export function subjectFlashcardStats(data: AppData, today: string) {
  return Object.fromEntries(
    SUBJECTS.map(subject => {
      const cards = data.flashcards.filter(card => card.subject === subject.id);
      return [
        subject.id,
        { total: cards.length, due: cards.filter(card => card.dueDate <= today).length },
      ] as const;
    }),
  ) as Record<(typeof SUBJECTS)[number]['id'], { total: number; due: number }>;
}

export const FLASHCARD_TEXT_LIMITS = { front: 2000, back: 5000 } as const;
type CardContent = Pick<Flashcard, 'subject' | 'chapterId' | 'front' | 'back' | 'category'>;
/** Keep every UI/core write compatible with the backup schema. */
export function flashcardContentError(input: CardContent): string | null {
  if (!SUBJECTS.some(subject => subject.id === input.subject) || !Object.hasOwn(FLASHCARD_CATEGORY_LABEL, input.category) || (input.chapterId && chapterById[input.chapterId]?.subject !== input.subject)) return t('কার্ডের বিষয় ও অধ্যায় মিলিয়ে নাও।', 'Check that the card subject and chapter match.');
  if (!input.front.trim() || !input.back.trim()) return t('সামনা ও উত্তর দুটিই লিখলেই কার্ড তৈরি হবে।', 'Write both the front and the back to create a card.');
  if (input.front.trim().length > FLASHCARD_TEXT_LIMITS.front || input.back.trim().length > FLASHCARD_TEXT_LIMITS.back) return t('প্রশ্ন সর্বোচ্চ ২০০০ এবং উত্তর সর্বোচ্চ ৫০০০ অক্ষরের হতে পারে।', 'The front can have at most 2000 characters and the back 5000.');
  return null;
}

/** Create a new card: due immediately (interval 1), ease 2.5. */
export function createFlashcard(
  data: AppData,
  input: { subject: Flashcard['subject']; chapterId?: Flashcard['chapterId']; front: string; back: string; category: FlashcardCategory },
): AppData {
  if (data.flashcards.length >= LIMITS.flashcards || flashcardContentError(input)) return data;
  const card: Flashcard = {
    id: newId(),
    subject: input.subject,
    chapterId: input.chapterId,
    front: input.front.trim(),
    back: input.back.trim(),
    category: input.category,
    interval: START_INTERVAL,
    dueDate: todayKey(new Date(nowIso())),
    repetitions: START_REPETITIONS,
    easeFactor: START_EASE,
    createdAt: nowIso(),
  };
  return { ...data, flashcards: [...data.flashcards, card] };
}

/** Edit an existing card's content. */
export function editFlashcard(
  data: AppData,
  id: string,
  patch: { front?: string; back?: string; category?: FlashcardCategory; chapterId?: Flashcard['chapterId']; subject?: Flashcard['subject'] },
): AppData {
  const card = data.flashcards.find(item => item.id === id);
  if (!card) return data;
  if (patch.chapterId !== undefined && patch.chapterId !== null && !chapterById[patch.chapterId]) return data;
  const next: Flashcard = {
    ...card,
    ...(patch.front !== undefined ? { front: patch.front.trim() } : {}),
    ...(patch.back !== undefined ? { back: patch.back.trim() } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.chapterId !== undefined ? { chapterId: patch.chapterId } : {}),
    ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
  };
  if (flashcardContentError(next)) return data;
  return { ...data, flashcards: data.flashcards.map(item => (item.id === id ? next : item)) };
}

/** Delete a card and its review history is implicit (reviews are summarized into card state). */
export function deleteFlashcard(data: AppData, id: string): AppData {
  const exists = data.flashcards.some(item => item.id === id);
  if (!exists) return data;
  return { ...data, flashcards: data.flashcards.filter(item => item.id !== id) };
}

/**
 * Review a card with SM-2:
 *   again  → interval resets to 1, repetitions to 0, ease down
 *   hard   → interval × 1.2, ease slightly down
 *   good   → interval × ease, ease unchanged
 *   easy   → interval × ease × 1.3, ease up
 * Cards rated 'again' come back tomorrow — forgotten cards appear more often.
 */
export function reviewFlashcard(
  data: AppData,
  id: string,
  rating: FlashcardRating,
  today: string,
): { data: AppData; card: Flashcard; nextDueDate: string } {
  const index = data.flashcards.findIndex(item => item.id === id);
  if (index < 0) throw new Error('ফ্ল্যাশকার্ডটি পাওয়া যায়নি।');
  if (!isFlashcardRating(rating)) throw new Error('রিভিউর রেটিং সঠিক নয়।');

  const card = data.flashcards[index];
  let { interval, repetitions, easeFactor } = card;

  if (rating === 'again') {
    interval = START_INTERVAL;
    repetitions = START_REPETITIONS;
    easeFactor = Math.max(EASE_FLOOR, easeFactor - 0.2);
  } else if (rating === 'hard') {
    interval = Math.max(1, Math.ceil(interval * 1.2));
    repetitions += 1;
    easeFactor = Math.max(EASE_FLOOR, easeFactor - 0.15);
  } else if (rating === 'good') {
    interval = Math.max(1, Math.ceil(interval * easeFactor));
    repetitions += 1;
  } else {
    // easy
    interval = Math.max(1, Math.ceil(interval * easeFactor * 1.3));
    repetitions += 1;
    easeFactor = easeFactor + 0.15;
  }

  interval = Math.min(interval, 365);
  easeFactor = Math.min(easeFactor, 3.0);

  const next: Flashcard = {
    ...card,
    interval,
    dueDate: addDays(today, interval),
    lastReviewed: today,
    repetitions,
    easeFactor,
  };
  const nextData = { ...data, flashcards: [...data.flashcards.slice(0, index), next, ...data.flashcards.slice(index + 1)] };
  return { data: nextData, card: next, nextDueDate: next.dueDate };
}

/** Move a due card's due date forward by `days` (snooze). */
export function snoozeFlashcard(data: AppData, id: string, today: string, days = 1): AppData {
  const index = data.flashcards.findIndex(item => item.id === id && item.dueDate <= today);
  if (index < 0) return data;
  const card = data.flashcards[index];
  const next = { ...card, dueDate: addDays(card.dueDate, days) };
  return { ...data, flashcards: [...data.flashcards.slice(0, index), next, ...data.flashcards.slice(index + 1)] };
}

/** Mark every card due today as reviewed-without-rating is not possible here; keep as no-op helper for UI. */
export function resetCard(data: AppData, id: string): AppData {
  const index = data.flashcards.findIndex(item => item.id === id);
  if (index < 0) return data;
  const card = data.flashcards[index];
  const next = { ...card, interval: START_INTERVAL, repetitions: START_REPETITIONS, easeFactor: START_EASE, dueDate: todayKey(new Date(nowIso())) };
  return { ...data, flashcards: [...data.flashcards.slice(0, index), next, ...data.flashcards.slice(index + 1)] };
}

/** Total cards and cards learned (repetitions > 0). */
export function flashcardTotals(data: AppData) {
  const total = data.flashcards.length;
  const learned = data.flashcards.filter(card => card.repetitions > 0).length;
  return { total, learned };
}
