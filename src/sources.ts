import { CHAPTERS, SUBJECTS } from './data';
import { CLASS_CATALOG } from './videoCatalog';
import { STARTER_QUESTIONS } from './quiz-data';
import { factsFor } from './questionGen';
import { COVERED_BOARD_TOPICS, VERIFIED_BOARD_QUESTIONS, chaptersWithBoardQuestions } from './boardQuestions';

/**
 * Where every chapter's material actually comes from.
 *
 * The student's question was blunt and fair: *are these real board questions, taken
 * from the MCQ-solving classes and question banks on YouTube?* The honest answer is
 * "no, and the app should say so per chapter" — so this module counts what a chapter
 * really holds instead of implying a board paper.
 *
 * Three separate things are counted, never merged into one number:
 *  1. `videos`   — verified YouTube resources (direct class / playlist / search).
 *  2. `bank`     — textbook-checked MCQs shipped with the app.
 *  3. `generated`— MCQs the engine can build from those verified answers.
 *
 * A chapter is only "well sourced" when it has a direct video *and* enough banked
 * answers to practise. Everything else is reported as the gap it is.
 */

export interface ChapterSources {
  chapterId: string;
  title: string;
  subject: string;
  subjectEn: string;
  priority: string;
  /** Verified links by class type. `search` is excluded: it is not a class. */
  videos: Record<string, number>;
  /** Every verified, non-search link for this chapter. */
  verifiedLinks: number;
  /** True when the chapter has at least one direct class or playlist. */
  hasDirectClass: boolean;
  /** Banked MCQs shipped for this chapter. */
  bank: number;
  /** Facts the generator can turn into MCQs (bank + hand-written). */
  facts: number;
  /** Real board questions recovered from class transcripts for this chapter. */
  boardQuestions: number;
  /** Letters: what this chapter still lacks, said plainly. */
  gaps: ('no-direct-class' | 'no-board-video' | 'few-mcqs' | 'no-board-question')[];
}

export interface SourcesReport {
  chapters: ChapterSources[];
  totals: {
    /** Board questions recovered in full, with board + year stated in the video. */
    boardQuestions: number;
    chaptersWithBoardQuestion: number;
    /** Classes with a known board + year whose stimulus was not readable in full. */
    coveredBoardTopics: number;
    verifiedLinks: number;
    searchLinks: number;
    bankQuestions: number;
    chaptersWithDirectClass: number;
    chaptersWithBoardVideo: number;
    chaptersWithTenMcqs: number;
    averageBank: number;
  };
  /** The plain-language verdict shown at the top of the report. */
  verdictBn: string;
  verdictEn: string;
}

const PRIORITY_GAP_MCQS = 6;

export function buildSourcesReport(): SourcesReport {
  const linksByChapter = new Map<string, Record<string, number>>();
  let verifiedLinks = 0;
  let searchLinks = 0;
  for (const item of CLASS_CATALOG) {
    if (item.classType === 'search') {
      searchLinks += 1;
      continue;
    }
    verifiedLinks += 1;
    const counts = linksByChapter.get(item.chapterId) ?? {};
    counts[item.classType] = (counts[item.classType] ?? 0) + 1;
    linksByChapter.set(item.chapterId, counts);
  }

  const bankByChapter = new Map<string, number>();
  for (const question of STARTER_QUESTIONS) {
    if (!question.chapterId) continue;
    bankByChapter.set(question.chapterId, (bankByChapter.get(question.chapterId) ?? 0) + 1);
  }

  const chapters: ChapterSources[] = CHAPTERS.map(chapter => {
    const videos = linksByChapter.get(chapter.id) ?? {};
    const verified = Object.values(videos).reduce((sum, count) => sum + count, 0);
    const bank = bankByChapter.get(chapter.id) ?? 0;
    const subject = SUBJECTS.find(item => item.id === chapter.subject);
    const boardQuestions = VERIFIED_BOARD_QUESTIONS.filter(item => item.chapterId === chapter.id).length;
    const gaps: ChapterSources['gaps'] = [];
    if (!Object.keys(videos).some(type => type !== 'search' && videos[type] > 0)) gaps.push('no-direct-class');
    if (!(videos.board > 0)) gaps.push('no-board-video');
    if (bank < PRIORITY_GAP_MCQS) gaps.push('few-mcqs');
    if (!boardQuestions) gaps.push('no-board-question');
    return {
      chapterId: chapter.id,
      title: chapter.title,
      subject: subject?.short ?? chapter.subject,
      subjectEn: subject?.english ?? chapter.subject,
      priority: chapter.priority,
      videos,
      verifiedLinks: verified,
      hasDirectClass: Object.keys(videos).some(type => type !== 'search'),
      bank,
      boardQuestions,
      facts: factsFor(chapter.id).length,
      gaps,
    };
  });

  const bankTotal = chapters.reduce((sum, chapter) => sum + chapter.bank, 0);
  const withBoard = chapters.filter(chapter => chapter.videos.board > 0).length;
  const withTen = chapters.filter(chapter => chapter.bank >= 10).length;
  const noBoard = chapters.length - withBoard;

  return {
    chapters,
    totals: {
      boardQuestions: VERIFIED_BOARD_QUESTIONS.length,
      chaptersWithBoardQuestion: chaptersWithBoardQuestions().length,
      coveredBoardTopics: COVERED_BOARD_TOPICS.length,
      verifiedLinks,
      searchLinks,
      bankQuestions: bankTotal,
      chaptersWithDirectClass: chapters.filter(chapter => chapter.hasDirectClass).length,
      chaptersWithBoardVideo: withBoard,
      chaptersWithTenMcqs: withTen,
      averageBank: Math.round((bankTotal / Math.max(1, chapters.length)) * 10) / 10,
    },
    verdictBn:
      `প্রতিটি প্রশ্ন অ্যাপের নিজের পাঠ্যবই-যাচাইকৃত ব্যাংক থেকে আসে—বোর্ডের মূল প্রশ্নপত্র থেকে নয়। ` +
      `${withBoard}/${chapters.length}টি অধ্যায়ে বোর্ড-প্রশ্নের যাচাই করা প্লেলিস্ট আছে; বাকি ${noBoard}টিতে নেই, এবং অ্যাপ সেটাই দেখায়। ` +
      `ইউটিউবের CQ/MCQ ক্লাস থেকে পুরোপুরি পড়ে নেওয়া গেছে এমন ${VERIFIED_BOARD_QUESTIONS.length}টি বোর্ড প্রশ্ন (${chaptersWithBoardQuestions().length}টি অধ্যায়ে)—বোর্ড ও সাল ভিডিওতেই বলা, তাই যাচাই করা যায়। ` +
      `আরও ${COVERED_BOARD_TOPICS.length}টি ক্লাসে বোর্ড ও সাল জানা গেছে কিন্তু উদ্দীপকের সংখ্যা এতটা পরিষ্কার নয় যে হুবহু প্রশ্ন বানানো যায়; সেগুলো "কোন ক্লাসে কী পড়ানো হয়েছে" হিসেবে আলাদা রাখা, প্রশ্ন হিসেবে গোনা হয় না।`,
    verdictEn:
      `Every question comes from the app's own textbook-checked bank, not from an original board paper. ` +
      `${withBoard}/${chapters.length} chapters have a verified board-question playlist; the other ${noBoard} do not, and the app says so. ` +
      `${VERIFIED_BOARD_QUESTIONS.length} board questions were recovered in full from YouTube CQ/MCQ classes (${chaptersWithBoardQuestions().length} chapters), each with its board and year stated in the video so it can be checked. ` +
      `A further ${COVERED_BOARD_TOPICS.length} classes have a known board and year but no cleanly readable stimulus; they are recorded as coverage, never counted as questions.`,
  };
}

/** Chapters with the least material, worst first — the honest study-order hint. */
export function weakestSourcedChapters(report: SourcesReport, limit = 10): ChapterSources[] {
  return [...report.chapters]
    .sort((a, b) =>
      b.gaps.length - a.gaps.length
      || a.bank - b.bank
      || a.verifiedLinks - b.verifiedLinks
      || a.chapterId.localeCompare(b.chapterId))
    .slice(0, limit);
}
