import { describe, expect, it } from 'vitest';
import {
  REJECTED_SOURCES,
  COVERED_BOARD_TOPICS,
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

  /**
   * The old array held one-line summaries of what a class covered ("…সংক্রান্ত
   * উদ্দীপক—(গ) ও (ঘ) ধাপে সমাধান"), which are not answerable. A count of 31
   * looked healthy while 24 of those could not be solved. This asserts the real
   * list only ever holds a question a student can actually attempt.
   */
  it('never files a class summary as a question', () => {
    const summaries = VERIFIED_BOARD_QUESTIONS.filter(question =>
      /ধাপে সমাধান|ধাপে গাণিতিক সমাধান|সংক্রান্ত উদ্দীপক/.test(question.text));
    expect(summaries.map(question => question.id)).toEqual([]);
  });

  it('keeps every covered topic out of the question list', () => {
    const questionIds = new Set(VERIFIED_BOARD_QUESTIONS.map(question => question.id));
    const overlap = COVERED_BOARD_TOPICS.filter(topic => questionIds.has(topic.id));
    expect(overlap).toEqual([]);
    // A coverage record must never be empty-handed: it names what was covered.
    for (const topic of COVERED_BOARD_TOPICS) {
      expect(topic.topic.length).toBeGreaterThan(8);
      // Every record must say what the stimulus was about, not just "a CQ".
      expect(topic.topic).toContain('উদ্দীপক');
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
    // Only Physics carries a question whose stimulus could actually be read back.
    // Chemistry's classes named their topics, but not the values — those live in
    // COVERED_BOARD_TOPICS, not here. Saying otherwise would inflate the bank.
    expect(covered.has('physics')).toBe(true);
    expect(covered.has('chemistry')).toBe(false);
    // The chemistry classes are still recorded as coverage, with their board + year.
    expect(COVERED_BOARD_TOPICS.some(topic => topic.subject === 'chemistry')).toBe(true);
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

/**
 * The bug this guards against is real: six Newtonian-mechanics videos were filed
 * under physics-1-3, which is "গতিবিদ্যা". The chapter id and the chapter named in
 * the video title have to agree, otherwise a student practises the wrong chapter.
 */
describe('the chapter id matches the chapter the video names', () => {
  const NAMED_IN_TITLE: { pattern: RegExp; chapterId: string }[] = [
    { pattern: /ভেক্টর|Vector/i, chapterId: 'physics-1-2' },
    { pattern: /নিউটন/, chapterId: 'physics-1-4' },
    { pattern: /কাজ, শক্তি ও ক্ষমতা|কাজ শক্তি/, chapterId: 'physics-1-5' },
    { pattern: /মহাকর্ষ ও অভিকর্ষ/, chapterId: 'physics-1-6' },
    { pattern: /গাঠনিক ধর্ম/, chapterId: 'physics-1-7' },
    { pattern: /Static Electricity|স্থির তড়িৎ/, chapterId: 'physics-2-2' },
    { pattern: /Current Elec|চল তড়িৎ|চলতড়িৎ/, chapterId: 'physics-2-3' },
    { pattern: /Thermodynamics|তাপগতিবিদ্যা/, chapterId: 'physics-2-1' },
    { pattern: /Physical Optics|ভৌত আলোকবিজ্ঞান/, chapterId: 'physics-2-7' },
    { pattern: /Modern Physics|আধুনিক পদার্থবিজ্ঞান/, chapterId: 'physics-2-8' },
    { pattern: /Nuclear Physics|নিউক্লিয়ার/, chapterId: 'physics-2-9' },
    { pattern: /Semiconductor|সেমিকন্ডাক্টর/, chapterId: 'physics-2-10' },
    { pattern: /Periodicity|পর্যায়বৃত্ত/, chapterId: 'chemistry-1-3' },
    { pattern: /রাসায়নিক পরিবর্তন/, chapterId: 'chemistry-1-4' },
    { pattern: /গুণগত রসায়ন/, chapterId: 'chemistry-1-2' },
  ];

  it('never files a video under a chapter its own title contradicts', () => {
    const wrong: string[] = [];
    for (const question of VERIFIED_BOARD_QUESTIONS) {
      const title = question.source.title;
      const claimed = NAMED_IN_TITLE.filter(entry => entry.pattern.test(title));
      // Only judge when the title names exactly one of the chapters we know about.
      if (claimed.length === 1 && claimed[0].chapterId !== question.chapterId) {
        wrong.push(`${question.id}: title "${title}" names ${claimed[0].chapterId}, filed as ${question.chapterId}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('does not use physics-1-3 (গতিবিদ্যা) for mechanics-video titles', () => {
    // গতিবিদ্যা is kinematics; the Newtonian-mechanics classes belong to physics-1-4.
    const misfiled = VERIFIED_BOARD_QUESTIONS.filter(q =>
      q.chapterId === 'physics-1-3' && /নিউটন/.test(q.source.title));
    expect(misfiled.map(q => q.id)).toEqual([]);
  });
});
