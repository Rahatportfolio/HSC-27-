import { describe, expect, it } from 'vitest';
import { buildSourcesReport, weakestSourcedChapters } from './sources';
import { CHAPTERS } from './data';
import { CLASS_CATALOG } from './videoCatalog';
import { STARTER_QUESTIONS } from './quiz-data';

const report = buildSourcesReport();

describe('the sources report counts what really exists', () => {
  it('covers every syllabus chapter exactly once', () => {
    expect(report.chapters).toHaveLength(CHAPTERS.length);
    expect(new Set(report.chapters.map(chapter => chapter.chapterId)).size).toBe(CHAPTERS.length);
  });

  it('agrees with the catalog and the bank on every total', () => {
    const verified = CLASS_CATALOG.filter(item => item.classType !== 'search').length;
    const search = CLASS_CATALOG.filter(item => item.classType === 'search').length;
    expect(report.totals.verifiedLinks).toBe(verified);
    expect(report.totals.searchLinks).toBe(search);
    expect(report.totals.bankQuestions).toBe(STARTER_QUESTIONS.filter(question => question.chapterId).length);
    const summed = report.chapters.reduce((sum, chapter) => sum + chapter.verifiedLinks, 0);
    expect(summed).toBe(verified);
  });

  it('never counts a search link as a class', () => {
    for (const chapter of report.chapters) {
      expect(chapter.videos.search).toBeUndefined();
      expect(chapter.verifiedLinks).toBe(
        Object.values(chapter.videos).reduce((sum, count) => sum + count, 0),
      );
    }
  });

  it('reports the board-video gap instead of hiding it', () => {
    const withBoard = report.chapters.filter(chapter => (chapter.videos.board ?? 0) > 0).length;
    expect(report.totals.chaptersWithBoardVideo).toBe(withBoard);
    expect(withBoard).toBeLessThan(CHAPTERS.length);
    // The chapters without a board playlist must carry exactly that gap.
    const missing = report.chapters.filter(chapter => !(chapter.videos.board > 0));
    expect(missing.every(chapter => chapter.gaps.includes('no-board-video'))).toBe(true);
  });

  it('says plainly that questions are not board papers', () => {
    expect(report.verdictBn).toContain('বোর্ডের মূল প্রশ্নপত্র থেকে নয়');
    expect(report.verdictEn).toContain('not from an original board paper');
    // The claim must stay true to the counts, not be a fixed sentence.
    expect(report.verdictBn).toContain(String(report.totals.chaptersWithBoardVideo));
  });

  it('orders the weakest chapters first, worst gaps at the top', () => {
    const weakest = weakestSourcedChapters(report, 8);
    expect(weakest).toHaveLength(8);
    const gapCounts = weakest.map(chapter => chapter.gaps.length);
    expect([...gapCounts].sort((a, b) => b - a)).toEqual(gapCounts);
  });

  it('does not promise a fact pool it cannot back', () => {
    for (const chapter of report.chapters) {
      expect(chapter.facts).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(chapter.bank)).toBe(true);
    }
  });
});
