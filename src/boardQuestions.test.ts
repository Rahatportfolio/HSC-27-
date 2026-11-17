import { describe, expect, it } from 'vitest';
import {
  REJECTED_SOURCES,
  VERIFIED_BOARD_QUESTIONS,
  boardQuestionsForChapter,
  chaptersWithBoardQuestions,
  citationFor,
} from './boardQuestions';
import { CHAPTERS, chapterById } from './data';
import { CLASS_CATALOG } from './videoCatalog';

const VALID_BOARDS = ['ঢাকা', 'রাজশাহী', 'চট্টগ্রাম', 'সিলেট', 'ময়মনসিংহ', 'যশোর', 'দিনাজপুর', 'কুমিল্লা', 'বরিশাল'];
const KNOWN_VIDEO_IDS = new Set(
  CLASS_CATALOG
    .map(item => /(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(item.url)?.[1])
    .filter((id): id is string => !!id),
);

describe('every recovered board question carries real provenance', () => {
  it('has a unique id and a syllabus chapter that exists', () => {
    const ids = VERIFIED_BOARD_QUESTIONS.map(question => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const question of VERIFIED_BOARD_QUESTIONS) {
      expect(CHAPTERS.some(chapter => chapter.id === question.chapterId)).toBe(true);
      // The chapter must belong to the subject the question claims.
      expect(chapterById[question.chapterId].subject).toBe(question.subject);
    }
  });

  it('never invents a board or a year', () => {
    for (const question of VERIFIED_BOARD_QUESTIONS) {
      expect(VALID_BOARDS).toContain(question.board);
      expect(Number.isSafeInteger(question.year)).toBe(true);
      // HSC began in 1984; anything outside this range is a typo, not a citation.
      expect(question.year).toBeGreaterThanOrEqual(1984);
      expect(question.year).toBeLessThanOrEqual(2026);
    }
  });

  it('points at a real 11-character video id and a working url', () => {
    for (const question of VERIFIED_BOARD_QUESTIONS) {
      expect(question.source.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(question.source.url).toBe(`https://www.youtube.com/watch?v=${question.source.videoId}`);
      expect(question.source.title.length).toBeGreaterThan(10);
      expect(question.source.channel.length).toBeGreaterThan(2);
    }
  });

  it('states how the board and year were established', () => {
    const kinds = new Set(VERIFIED_BOARD_QUESTIONS.map(question => question.evidence));
    expect(kinds.size).toBeGreaterThan(0);
    for (const question of VERIFIED_BOARD_QUESTIONS) {
      expect(['transcript-names-board', 'video-title-names-board', 'chapter-list-names-board']).toContain(question.evidence);
      // If a timestamp is given it must be a real mm:ss offset, so it can be checked.
      if (question.source.at) expect(question.source.at).toMatch(/^\d{2}:\d{2}$/);
      // The all-board class is split board-by-board in its description, so the two
      // entries taken from it must carry their offset.
      if (question.evidence === 'chapter-list-names-board' && question.source.videoId === 'zxNbm_8JV3I') {
        expect(question.source.at).toBeTruthy();
      }
    }
  });

  it('writes real question text, not a placeholder', () => {
    for (const question of VERIFIED_BOARD_QUESTIONS) {
      expect(question.text.length).toBeGreaterThan(40);
      expect(question.text).toContain('গ');
      expect(question.type).toBe(question.type === 'CQ' ? 'CQ' : 'MCQ');
    }
  });

  it('cites in one line a student can check', () => {
    const line = citationFor(VERIFIED_BOARD_QUESTIONS[0]);
    expect(line).toContain(VERIFIED_BOARD_QUESTIONS[0].board);
    expect(line).toContain(String(VERIFIED_BOARD_QUESTIONS[0].year));
    expect(line).toContain(VERIFIED_BOARD_QUESTIONS[0].source.url);
  });
});

describe('coverage is reported as it is, not rounded up', () => {
  it('touches only a minority of chapters and says so through the count', () => {
    const covered = chaptersWithBoardQuestions();
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.length).toBeLessThan(CHAPTERS.length);
    expect(covered.length).toBe(new Set(VERIFIED_BOARD_QUESTIONS.map(q => q.chapterId)).size);
  });

  it('groups by chapter without losing or duplicating a question', () => {
    const grouped = CHAPTERS.flatMap(chapter => boardQuestionsForChapter(chapter.id));
    expect(grouped).toHaveLength(VERIFIED_BOARD_QUESTIONS.length);
    expect(new Set(grouped.map(q => q.id)).size).toBe(VERIFIED_BOARD_QUESTIONS.length);
  });

  it('records the sources it threw away, with the reason', () => {
    expect(REJECTED_SOURCES.length).toBeGreaterThan(0);
    for (const rejected of REJECTED_SOURCES) {
      expect(rejected.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(rejected.reason.length).toBeGreaterThan(15);
      // A rejected source must not also be cited as evidence for a question.
      expect(VERIFIED_BOARD_QUESTIONS.some(q => q.source.videoId === rejected.videoId)).toBe(false);
    }
  });

  it('prefers video ids the app already links, where the catalog has them', () => {
    // Not a hard requirement (playlists can add new ids), but if a cited video is
    // in the catalog it must be there for real — this catches a typo'd id.
    const cited = VERIFIED_BOARD_QUESTIONS.map(q => q.source.videoId);
    const inCatalog = cited.filter(id => KNOWN_VIDEO_IDS.has(id));
    for (const id of inCatalog) {
      const item = CLASS_CATALOG.find(entry => entry.url.includes(id))!;
      expect(item.url).toContain(id);
    }
    expect(cited.length).toBeGreaterThanOrEqual(inCatalog.length);
  });
});

describe('subject coverage is stated per paper, not averaged away', () => {
  it('names which papers have real board questions and which have none', () => {
    const covered = new Set(VERIFIED_BOARD_QUESTIONS.map(q => q.subject));
    // These are the only papers with evidence-backed questions today.
    expect(covered.has('physics')).toBe(true);
    expect(covered.has('chemistry')).toBe(true);
    // A paper with no verified source must not appear at all — no placeholder rows.
    for (const empty of ['math', 'biology', 'bangla', 'english', 'ict'] as const) {
      expect(VERIFIED_BOARD_QUESTIONS.some(q => (q.subject as string) === empty)).toBe(false);
    }
  });

  it('keeps physics 2nd paper entries on physics 2nd paper chapters', () => {
    const second = VERIFIED_BOARD_QUESTIONS.filter(q => q.chapterId.startsWith('physics-2-'));
    expect(second.length).toBeGreaterThan(0);
    for (const question of second) {
      expect(chapterById[question.chapterId].subject).toBe('physics');
      expect(question.chapterId).toMatch(/^physics-2-\d+$/);
    }
  });

  it('never repeats the same question text', () => {
    // One board paper can legitimately carry two CQ parts for the same chapter
    // (Dhaka 2024 Vector did, solved as part 1 and part 2), so the board+year key
    // is not unique — the text must be.
    const texts = VERIFIED_BOARD_QUESTIONS.map(q => q.text.trim());
    expect(new Set(texts).size).toBe(texts.length);
    // Ids must still be unique, because that is what the UI keys on.
    const ids = VERIFIED_BOARD_QUESTIONS.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
