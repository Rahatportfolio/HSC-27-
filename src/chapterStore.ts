/**
 * User-managed chapters: chapters the student adds, moves, renames or
 * re-prioritises through the AI assistant.
 *
 * Built-in chapters (data.ts) are never edited in place. Instead:
 *  - a built-in chapter's paper/title/priority/number can be overridden
 *    (chapterOverrides), and
 *  - brand-new chapters live in customChapters.
 * mergedChapters() is the single view the AI brain uses, so
 * every change the assistant makes is immediately visible to it.
 */
import { CHAPTERS, subjectById } from './data';
import type { Chapter, Priority, SubjectId } from './data';
import type { AppData } from './planner';
import { bn } from './planner';
import { t } from './i18n';

export interface ChapterOverride {
  paper?: 1 | 2;
  title?: string;
  priority?: Priority;
  number?: string;
}

export type ChapterAction =
  | { type: 'add'; chapter: Chapter }
  | { type: 'move'; chapterId: string; toPaper: 1 | 2 }
  | { type: 'delete'; chapterId: string }
  | { type: 'rename'; chapterId: string; title: string }
  | { type: 'setPriority'; chapterId: string; priority: Priority };

type ChapterData = Pick<AppData, 'customChapters' | 'chapterOverrides'>;

/** Built-in chapters with the student's overrides applied, plus custom chapters. */
export function mergedChapters(data: ChapterData): Chapter[] {
  const overrides = data.chapterOverrides ?? {};
  const builtIn = CHAPTERS.map(chapter => {
    const override = overrides[chapter.id];
    if (!override) return chapter;
    return {
      ...chapter,
      ...(override.paper !== undefined ? { paper: override.paper } : {}),
      ...(override.title !== undefined ? { title: override.title } : {}),
      ...(override.priority !== undefined ? { priority: override.priority } : {}),
      ...(override.number !== undefined ? { number: override.number } : {}),
    };
  });
  return [...builtIn, ...(data.customChapters ?? [])];
}

export function chapterByIdFor(data: ChapterData): Record<string, Chapter> {
  return Object.fromEntries(mergedChapters(data).map(chapter => [chapter.id, chapter]));
}

export function isCustomChapter(data: ChapterData, chapterId: string): boolean {
  return (data.customChapters ?? []).some(chapter => chapter.id === chapterId);
}

/** Apply one assistant action. Pure: returns a new AppData, never mutates. */
export function applyChapterAction(data: AppData, action: ChapterAction): AppData {
  switch (action.type) {
    case 'add': {
      if (isCustomChapter(data, action.chapter.id)) return data;
      return { ...data, customChapters: [...(data.customChapters ?? []), action.chapter] };
    }
    case 'delete': {
      return { ...data, customChapters: (data.customChapters ?? []).filter(chapter => chapter.id !== action.chapterId) };
    }
    case 'move':
    case 'rename':
    case 'setPriority': {
      const patch: ChapterOverride = action.type === 'move'
        ? { paper: action.toPaper }
        : action.type === 'rename'
          ? { title: action.title }
          : { priority: action.priority };
      if (isCustomChapter(data, action.chapterId)) {
        return {
          ...data,
          customChapters: (data.customChapters ?? []).map(chapter =>
            chapter.id === action.chapterId ? { ...chapter, ...patch } : chapter),
        };
      }
      const overrides = { ...(data.chapterOverrides ?? {}) };
      overrides[action.chapterId] = { ...overrides[action.chapterId], ...patch };
      return { ...data, chapterOverrides: overrides };
    }
  }
}

const paperName = (paper: 1 | 2): string => t(`${bn(paper)}ম পত্র`, `Paper ${paper}`);
const priorityName = (priority: Priority): string =>
  priority === 'A' ? t('অগ্রাধিকার A', 'Priority A') : priority === 'B' ? t('অগ্রাধিকার B', 'Priority B') : t('অগ্রাধিকার C', 'Priority C');

/** Human-readable bilingual description of what an action will do. */
export function describeChapterAction(action: ChapterAction, data: ChapterData): string {
  if (action.type === 'add') {
    const chapter = action.chapter;
    const subject = subjectById[chapter.subject];
    return t(
      `${subject.name} ${paperName(chapter.paper)}-এ নতুন অধ্যায় যোগ করবো: “${chapter.title}” (নং ${bn(chapter.number)}, ${priorityName(chapter.priority)})।`,
      `I will add a new chapter to ${subject.english} ${paperName(chapter.paper)}: “${chapter.title}” (no. ${chapter.number}, ${priorityName(chapter.priority)}).`,
    );
  }
  const chapter = chapterByIdFor(data)[action.chapterId];
  const subject = chapter ? subjectById[chapter.subject] : null;
  const label = chapter ? `“${chapter.title}” (${subject!.name} ${paperName(chapter.paper)})` : 'নির্দিষ্ট অধ্যায়টি';
  const labelEn = chapter ? `“${chapter.title}” (${subject!.english} ${paperName(chapter.paper)})` : 'that chapter';
  switch (action.type) {
    case 'move':
      return t(
        `${label} অধ্যায়টি ${paperName(action.toPaper)}-এ সরাবো।`,
        `I will move ${labelEn} to ${paperName(action.toPaper)}.`,
      );
    case 'delete':
      return t(
        `তোমার যোগ করা অধ্যায় ${label} মুছে ফেলবো।`,
        `I will delete your added chapter ${labelEn}.`,
      );
    case 'rename':
      return t(
        `${label} অধ্যায়ের নাম বদলে “${action.title}” করবো।`,
        `I will rename ${labelEn} to “${action.title}”.`,
      );
    case 'setPriority':
      return t(
        `${label} অধ্যায়ের ${priorityName(action.priority)} করবো।`,
        `I will set ${labelEn} to ${priorityName(action.priority)}.`,
      );
  }
}

/** Slug id for a custom chapter; the caller ensures uniqueness against existing ids. */
export function makeCustomChapterId(subject: SubjectId, paper: 1 | 2, title: string): string {
  const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'chapter';
  return `custom-${subject}-${paper}-${slug}`;
}

/** Next free numeric chapter number within one subject+paper (Bengali digits handled). */
export function nextChapterNumber(chapters: Chapter[], subject: SubjectId, paper: 1 | 2): string {
  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const numbers = chapters
    .filter(chapter => chapter.subject === subject && chapter.paper === paper)
    .map(chapter => chapter.number.replace(/[^\d০-৯]/g, ''))
    .filter(Boolean)
    .map(digits => Number([...digits].map(ch => (BN_DIGITS.includes(ch) ? String(BN_DIGITS.indexOf(ch)) : ch)).join('')));
  return String(numbers.length ? Math.max(...numbers) + 1 : 1);
}
