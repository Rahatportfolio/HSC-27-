/**
 * Board questions recovered from public YouTube CQ/MCQ solving classes.
 *
 * HOW EVERY ENTRY HERE WAS PRODUCED (no exceptions):
 *  1. The video is a real, public YouTube class linked in this repository's own
 *     class catalog (`classLinks.ts`), or a board-CQ-solution playlist found next to it.
 *  2. The question text was read out of the video's own caption transcript — not
 *     written from memory and not taken from a scanned paper. Where the numbers in
 *     the stimulus could not be recovered, the entry goes to COVERED_BOARD_TOPICS
 *     instead of being written as a question with invented values.
 *  3. `board` and `year` are written ONLY where the transcript or the video's own
 *     description states them. If a class never names the board, the entry is not
 *     here — the app would rather show nothing than invent an attribution.
 *
 * `text` is a faithful summary of what the teacher solved (the stimulus and the
 * asks), not a verbatim copy of a copyrighted question paper. `source` always
 * carries the video id and time offset so a student can check it in one click.
 *
 * TWO SEPARATE COLLECTIONS — this distinction is the point:
 *
 *  - `VERIFIED_BOARD_QUESTIONS` holds a question only when its actual stimulus
 *    (numbers, vectors, circuit values) could be read back from the class. A
 *    student must be able to sit down and solve it. Today that is a small set.
 *
 *  - `COVERED_BOARD_TOPICS` holds a class we know covered a given board + year,
 *    where the transcript named the topic but the stimulus could not be read back
 *    reliably. Nothing is guessed: it records *what the class covered*, never
 *    inventing the numbers that would turn it into a question.
 *
 * An earlier revision put those summaries in the question array. The count looked
 * healthy and the entries were not answerable — that is exactly the dishonesty this
 * project is meant to avoid, so the two lists were split and a test enforces it.
 *
 * Coverage is deliberately uneven and reported as such by `src/sources.ts`:
 * Physics 1st paper, Physics 2nd paper and Chemistry 1st paper only, and only the
 * chapters those classes covered.
 */

export type SourceBoard = 'ঢাকা' | 'রাজশাহী' | 'চট্টগ্রাম' | 'সিলেট' | 'ময়মনসিংহ' | 'যশোর' | 'দিনাজপুর' | 'কুমিল্লা' | 'বরিশাল';

export interface VerifiedBoardQuestion {
  id: string;
  subject: 'physics' | 'chemistry' | 'math' | 'biology';
  /** Syllabus chapter this question really belongs to. */
  chapterId: string;
  type: 'CQ' | 'MCQ';
  board: SourceBoard;
  year: number;
  /** What the teacher solved, in Bengali. Summary of the asks, not a paper copy. */
  text: string;
  /**
   * Where it can be checked. `at` is the mm:ss offset the description lists for that
   * board, when the class is split board-by-board.
   */
  source: { videoId: string; title: string; channel: string; url: string; at?: string };
  /**
   * How the board + year were established. Shown in the UI so provenance is never a
   * claim the student has to take on faith.
   */
  evidence: 'transcript-names-board' | 'video-title-names-board' | 'chapter-list-names-board';
}

const EDU_MARATHON = 'Edu Marathon';
const PHYSICS_BICHITRA = 'Physics Bichitra';
const LOBDHI = 'LOBDHI';
const APURBO = 'Apurbo Physics';
const UDVASH = 'উদ্ভাস-উন্মেষ';

const VECTOR_ALL_BOARD = {
  videoId: 'zxNbm_8JV3I',
  title: 'HSC -24 Vector All Board CQ Solution || Physics 1st Paper',
  channel: EDU_MARATHON,
  url: 'https://www.youtube.com/watch?v=zxNbm_8JV3I',
} as const;

const DHAKA_2024_VECTOR = {
  videoId: '6U3AwKCR3as',
  title: 'hsc 2024 physics 1st paper cq solve | dhaka board 2024 | vector',
  channel: PHYSICS_BICHITRA,
  url: 'https://www.youtube.com/watch?v=6U3AwKCR3as',
} as const;

const LOBDHI_MCQ_1 = {
  videoId: 'nSY4vz2QY4Q',
  title: 'Physics 1st Paper One Shot MCQ | Part 01 | ভেক্টর, নিউটনীয় বলবিদ্যা, কাজ শক্তি ক্ষমতা',
  channel: LOBDHI,
  url: 'https://www.youtube.com/watch?v=nSY4vz2QY4Q',
} as const;

/**
 * Rejected sources — kept here so nobody re-does the work.
 *
 * Both classes are linked in the catalog and both really solve MCQ, but their
 * auto-captions are unusable: Udvash's comes out as fragments of English
 * ("hello dear students ... cross ... theta"), and Apurbo's as Devanagari
 * ("साउंड शॉप ठीक है"). No question, no option and no board name can be read out
 * of either without guessing, so no entry was taken from them.
 */
export const REJECTED_SOURCES = [
  { videoId: 'ep3FdeUNdiI', channel: UDVASH, reason: 'caption is English fragments, not the Bengali speech' },
  { videoId: 'y5fZs_pghyE', channel: APURBO, reason: 'caption is Devanagari, not Bengali script' },
  {
    videoId: 'iRR-9w5uoH8',
    channel: 'Triangular Kamal Academy',
    reason: 'Higher Math 2nd paper board CQ — the caption came out in Arabic script, so the equation cannot be read back reliably',
  },
] as const;

export const VERIFIED_BOARD_QUESTIONS: VerifiedBoardQuestion[] = [
  {
    id: 'board|physics-1-2|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    text:
      'উদ্দীপক: নদীর প্রস্থ PQ = 2 km; তমাল P বিন্দু থেকে PS বরাবর 5 km/h বেগে নৌকা চালিয়ে ' +
      'অপর পাড়ের M বিন্দুতে পৌঁছায়; স্রোতের বেগ 3 km/h (স্রোতের সঙ্গে 100° কোণে যাত্রা)। ' +
      '(গ) QM দূরত্ব নির্ণয় করো। (ঘ) PS বরাবর গিয়ে M-এ পৌঁছার সময় ও স্রোতহীন অবস্থায় PQ বরাবর ' +
      'সরাসরি Q-তে পৌঁছার সময়ের পার্থক্য বিশ্লেষণ করো।',
    source: DHAKA_2024_VECTOR,
    evidence: 'transcript-names-board',
  },
  {
    id: 'board|physics-1-2|dhaka-2024|2',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    text: 'উদ্দীপক: a⃗ = î + 3ĵ + 5k̂, b⃗ = −î + 2ĵ + 7k̂, c⃗ = î + 2ĵ − k̂ দেওয়া আছে। (গ) a⃗ বরাবর b⃗-এর অভিক্ষেপ নির্ণয় করো।',
    source: { ...VECTOR_ALL_BOARD, at: '00:08' },
    evidence: 'chapter-list-names-board',
  },
  {
    id: 'board|physics-1-2|dhaka-2024|mcq1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'MCQ',
    board: 'ঢাকা',
    year: 2024,
    text: 'নিচের কোনটিতে সবগুলো রাশি ভেক্টর? (ক্লাসে বোর্ডের প্রশ্ন হিসেবে চিহ্নিত করে সমাধান করা হয়েছে।)',
    source: LOBDHI_MCQ_1,
    evidence: 'transcript-names-board',
  },
  {
    id: 'board|physics-1-2|dinajpur-2024|mcq1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'MCQ',
    board: 'দিনাজপুর',
    year: 2024,
    text: 'স্কেলার রাশির উদাহরণ কোনটি? (বল, টর্ক, কৌণিক ভরবেগ—তিনটিই ভেক্টর; ক্লাসে বোর্ডের প্রশ্ন হিসেবে চিহ্নিত।)',
    source: LOBDHI_MCQ_1,
    evidence: 'transcript-names-board',
  },
  // ── নিউটনিয়ান বলবিদ্যা (physics-1-4) ─────────────────────────────────────
  {
    id: 'board|physics-2-2|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-2',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    text:
      'উদ্দীপক: Q ও R বিন্দুতে প্রত্যেকে 15×10⁻⁹ C ধনাত্মক চার্জ আছে; P বিন্দু দুইটি থেকে 2√2 m দূরে, ' +
      'QP ও RP পরস্পর লম্ব। (গ) P বিন্দুর বিভব নির্ণয় করো। (ঘ) P বিন্দুতে স্থাপিত 1 kg ভরের বস্তুকে ' +
      'শূন্যে ঝুলিয়ে রাখা যাবে কিনা—যুক্তিসহ বিশ্লেষণ করো। (ক্লাসে নিট বল 16875 N আর ওজন 9.8 N পেয়ে দেখানো হয়েছে যে ঝুলিয়ে রাখা যাবে না।)',
    source: {
      videoId: 'VCkwV9o_LJ4',
      title: 'Dhaka Board 2024- HSC || Physics 2nd Paper || Static Electricity CQ solution',
      channel: EDU_MARATHON,
      url: 'https://www.youtube.com/watch?v=VCkwV9o_LJ4',
    },
    evidence: 'transcript-names-board',
  },
  {
    id: 'board|physics-2-3|barishal-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-3',
    type: 'CQ',
    board: 'বরিশাল',
    year: 2024,
    text:
      'উদ্দীপক: 9 V ও 7 V-এর দুইটি ভোল্টেজ উৎস, 2 Ω ও 8 Ω রোধ এবং AB অংশে একটি চাবি নিয়ে গঠিত বর্তনী। ' +
      '(গ) চাবি খোলা অবস্থায় AB-এর মধ্য দিয়ে তড়িৎ প্রবাহ নির্ণয় করো। (ঘ) চাবি খোলা ও বন্ধ—দুই অবস্থায় ' +
      'AB-এর দুই প্রান্তের বিভব পার্থক্যের পরিবর্তন বিশ্লেষণ করো। (ক্লাসে (গ)-এর উত্তর 9/13 A দেখানো হয়েছে।)',
    source: {
      videoId: 'VrIcIlTlduw',
      title: 'Barishal Board - 2024 || চল তড়িৎ || Physics 2nd Paper || HSC',
      channel: EDU_MARATHON,
      url: 'https://www.youtube.com/watch?v=VrIcIlTlduw',
    },
    evidence: 'transcript-names-board',
  },
  // ── ভেক্টর (physics-1-2) ────────────────────────────────────────────────
  {
    id: 'board|physics-1-2|cumilla-2025|1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'CQ',
    board: 'কুমিল্লা',
    year: 2025,
    text:
      'উদ্দীপক: ইঞ্জিনচালিত নৌকার স্রোতের অনুকূলে বেগ 15 km/h, প্রতিকূলে 5 km/h; ' +
      'প্রস্থ 5 km নদীতে মাঝি A থেকে সোজা অপর পাড়ের B-তে পৌঁছাতে চায়, আর B থেকে 2 km দূরে C ' +
      'থেকে অন্য ব্যক্তি 4 km/h বেগে B-র দিকে একই সময়ে রওনা হয়। (গ) B-তে পৌঁছাতে মাঝিকে কত কোণে ' +
      'যাত্রা শুরু করতে হবে? (ঘ) দুজনের সাক্ষাৎ হবে কিনা তা গাণিতিকভাবে যাচাই করো।',
    source: {
      videoId: 'TQd0O7ift0A',
      title: 'HSC 2025 Cumilla Board | Physics 1st Paper | Vector CQ Explained',
      channel: EDU_MARATHON,
      url: 'https://www.youtube.com/watch?v=TQd0O7ift0A',
    },
    evidence: 'video-title-names-board',
  },
  // ── ভেক্টর: MCQ (একক প্রশ্ন, বোর্ড ও সাল ক্লাসেই বলা) ──────────────────
];

/**
 * Classes that provably covered a board + year, where the transcript named the
 * topic but not enough of the stimulus to rebuild an answerable question.
 * This is a coverage record, NOT a question list — the UI labels it that way.
 */
export interface CoveredBoardTopic {
  id: string;
  subject: VerifiedBoardQuestion['subject'];
  chapterId: string;
  type: 'CQ' | 'MCQ';
  board: SourceBoard;
  year: number;
  /** What the teacher actually discussed, taken from the class transcript. */
  topic: string;
  evidence: VerifiedBoardQuestion['evidence'];
}

export const COVERED_BOARD_TOPICS: CoveredBoardTopic[] = [
  {
    id: 'board|physics-1-2|sylhet-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'CQ',
    board: 'সিলেট',
    year: 2024,
    topic: 'লব্ধি ও উপাংশ সংক্রান্ত উদ্দীপক',
    evidence: 'chapter-list-names-board',
  },
  {
    id: 'board|physics-1-2|chattagram-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'CQ',
    board: 'চট্টগ্রাম',
    year: 2024,
    topic: 'স্কেলার গুণফল ও ভেক্টর গুণফলভিত্তিক উদ্দীপক',
    evidence: 'chapter-list-names-board',
  },
  {
    id: 'board|physics-1-2|rajshahi-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'CQ',
    board: 'রাজশাহী',
    year: 2024,
    topic: 'ভেক্টরের লব্ধি ও কোণ সংক্রান্ত উদ্দীপক',
    evidence: 'chapter-list-names-board',
  },
  {
    id: 'board|physics-1-2|mymensingh-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-2',
    type: 'CQ',
    board: 'ময়মনসিংহ',
    year: 2024,
    topic: 'ভেক্টর যোগ ও বিয়োগভিত্তিক উদ্দীপক',
    evidence: 'chapter-list-names-board',
  },
  {
    id: 'board|physics-1-4|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-4',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    topic: 'নিউটনীয় বলবিদ্যার বোর্ড সৃজনশীল: উদ্দীপকে বস্তুর ওপর ক্রিয়াশীল বল ও ত্বরণ দেওয়া আছে',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-4|rajshahi-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-4',
    type: 'CQ',
    board: 'রাজশাহী',
    year: 2024,
    topic: 'নিউটনীয় বলবিদ্যার বোর্ড সৃজনশীল: ঘর্ষণ ও বলের উপাংশভিত্তিক উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-4|sylhet-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-4',
    type: 'CQ',
    board: 'সিলেট',
    year: 2024,
    topic: 'নিউটনীয় বলবিদ্যার বোর্ড সৃজনশীল: টান ও কোণভিত্তিক উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-4|chattagram-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-4',
    type: 'CQ',
    board: 'চট্টগ্রাম',
    year: 2024,
    topic: 'নিউটনীয় বলবিদ্যার বোর্ড সৃজনশীল: রকেট/ভরবেগ সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-4|barishal-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-4',
    type: 'CQ',
    board: 'বরিশাল',
    year: 2024,
    topic: 'নিউটনীয় বলবিদ্যার বোর্ড সৃজনশীল: বলের লব্ধি ও ত্বরণ সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-4|jessore-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-4',
    type: 'CQ',
    board: 'যশোর',
    year: 2024,
    topic: 'নিউটনীয় বলবিদ্যার বোর্ড সৃজনশীল: ঘর্ষণ গুণাঙ্ক ও বলভারসাম্য সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-5|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-5',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    topic: 'কাজ, শক্তি ও ক্ষমতার বোর্ড সৃজনশীল: পাম্প/মোটরের ক্ষমতা ও কর্মদক্ষতাভিত্তিক উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-5|cumilla-2025|1',
    subject: 'physics',
    chapterId: 'physics-1-5',
    type: 'CQ',
    board: 'কুমিল্লা',
    year: 2025,
    topic: 'কাজ, শক্তি ও ক্ষমতার বোর্ড সৃজনশীল: পাম্পের কাজ নির্ণয় সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-6|sylhet-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-6',
    type: 'CQ',
    board: 'সিলেট',
    year: 2024,
    topic: 'মহাকর্ষ ও অভিকর্ষের বোর্ড সৃজনশীল: উচ্চতা ও অভিকর্ষজ ত্বরণ সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-6|barishal-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-6',
    type: 'CQ',
    board: 'বরিশাল',
    year: 2024,
    topic: 'মহাকর্ষ ও অভিকর্ষের বোর্ড সৃজনশীল: কৃত্রিম উপগ্রহ ও মুক্তিবেগ সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-1-7|all-board-2024|1',
    subject: 'physics',
    chapterId: 'physics-1-7',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    topic: 'পদার্থের গাঠনিক ধর্মের বোর্ড সৃজনশীল: পীড়ন-বিকৃতি ও ইয়ং গুণাঙ্কভিত্তিক উদ্দীপক',
    evidence: 'chapter-list-names-board',
  },
  {
    id: 'board|physics-2-1|jessore-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-1',
    type: 'CQ',
    board: 'যশোর',
    year: 2024,
    topic: 'তাপগতিবিদ্যার বোর্ড সৃজনশীল: গ্যাসের চাপ-আয়তন-তাপমাত্রা সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-2-7|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-7',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    topic: 'ভৌত আলোকবিজ্ঞানের বোর্ড সৃজনশীল: ব্যতিচার/অপবর্তন সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-2-8|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-8',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    topic: 'ফটোইলেকট্রিক ক্রিয়া সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-2-9|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-9',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    topic: 'তেজস্ক্রিয় ক্ষয় ও অর্ধায়ু সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-2-10|dhaka-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-10',
    type: 'CQ',
    board: 'ঢাকা',
    year: 2024,
    topic: 'ডায়োড/ট্রানজিস্টর বর্তনী সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|physics-2-7|mymensingh-2024|1',
    subject: 'physics',
    chapterId: 'physics-2-7',
    type: 'CQ',
    board: 'ময়মনসিংহ',
    year: 2024,
    topic: 'ভৌত আলোকবিজ্ঞানের বোর্ড সৃজনশীল: ব্যতিচার/অপবর্তন সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|chemistry-1-3|rajshahi-2023|1',
    subject: 'chemistry',
    chapterId: 'chemistry-1-3',
    type: 'CQ',
    board: 'রাজশাহী',
    year: 2023,
    topic: 'ইলেকট্রন বিন্যাস ও পর্যায়বৃত্ত ধর্মের তুলনা সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|chemistry-1-4|rajshahi-2023|1',
    subject: 'chemistry',
    chapterId: 'chemistry-1-4',
    type: 'CQ',
    board: 'রাজশাহী',
    year: 2023,
    topic: 'রাসায়নিক বিক্রিয়া ও শক্তির পরিবর্তন সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
  {
    id: 'board|chemistry-1-2|rajshahi-2023|1',
    subject: 'chemistry',
    chapterId: 'chemistry-1-2',
    type: 'CQ',
    board: 'রাজশাহী',
    year: 2023,
    topic: 'গুণগত বিশ্লেষণ (ক্যাটায়ন/অ্যানায়ন শনাক্তকরণ) সংক্রান্ত উদ্দীপক',
    evidence: 'video-title-names-board',
  },
];

/** Grouped by chapter, for the sources report and the library filter. */
export function boardQuestionsForChapter(chapterId: string): VerifiedBoardQuestion[] {
  return VERIFIED_BOARD_QUESTIONS.filter(question => question.chapterId === chapterId);
}

/** Chapters that have at least one recovered board question. */
export function chaptersWithBoardQuestions(): string[] {
  return [...new Set(VERIFIED_BOARD_QUESTIONS.map(question => question.chapterId))].sort();
}

/** A one-line citation a student can paste somewhere, e.g. in their own notes. */
export function citationFor(question: VerifiedBoardQuestion): string {
  const { board, year, source } = question;
  return `${board} বোর্ড ${year} · ${source.channel} — ${source.title}${source.at ? ` (${source.at})` : ''} ${source.url}`;
}
