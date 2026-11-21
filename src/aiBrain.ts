/**
 * Built-in smart brain: instant, offline, data-driven answers in Bengali,
 * Banglish and English. It reads only the app's own curriculum and question
 * bank plus the student's saved progress — it never invents syllabus facts,
 * video lengths or exam predictions. For open-ended chat, the downloadable
 * on-device model in aiModel.ts is available separately.
 */
import { CHAPTERS, SUBJECTS, chapterById, subjectById } from './data';
import type { Chapter, SubjectId } from './data';
import type { QuizQuestion } from './types';
import type { AppData } from './planner';
import { bn } from './planner';
import { t } from './i18n';

export type AiBrainAnswer =
  | { kind: 'chapters'; subject: SubjectId; paper?: 1 | 2; text: string }
  | { kind: 'chapter'; chapter: Chapter; text: string }
  | { kind: 'subjects'; text: string }
  | { kind: 'quiz'; subject?: SubjectId }
  | { kind: 'tip'; text: string }
  | { kind: 'progress'; text: string }
  | { kind: 'motivation'; text: string }
  | { kind: 'unknown'; text: string };

const SUBJECT_PATTERNS: [SubjectId, RegExp][] = [
  ['physics', /(?:\bphysics\b|পদার্থ|podartho)/u],
  ['chemistry', /(?:\bchemistry\b|রসায়ন|রসায়ন|roshayon)/u],
  ['math', /(?:\bmath(?:s)?\b|গণিত|gonit)/u],
  ['biology', /(?:\bbiology\b|জীববিজ্ঞান|jibbiggan)/u],
  ['bangla', /(?:\bbangla\b|বাংলা)/u],
  ['english', /(?:\benglish\b|ইংরেজি)/u],
  ['ict', /(?:\bict\b|আইসিটি)/u],
];

const normalize = (message: string): string => message
  .normalize('NFKC').toLowerCase()
  .replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
  .trim();

const detectSubject = (text: string): SubjectId | undefined =>
  SUBJECT_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0];

// Ordinals refer to a paper only when adjacent to "paper"/"পত্র", never
// when the student asks for a first or second *chapter*.
const detectPaper = (text: string): 1 | 2 | undefined => {
  const firstBefore = /(?:\b(?:1(?:st)?|first)|প্রথম|prothom|1ম)\s*(?:paper\b|পত্র)/u;
  const secondBefore = /(?:\b(?:2(?:nd)?|second)|দ্বিতীয়|ditiyo|2য়)\s*(?:paper\b|পত্র)/u;
  // Prefer the ordinal immediately before "paper"; the next number can be
  // the chapter (e.g. "২য় পত্র ১ম অধ্যায়"), not another paper.
  if (firstBefore.test(text)) return 1;
  if (secondBefore.test(text)) return 2;
  if (/(?:paper\b|পত্র)\s*(?:1(?:st)?\b|প্রথম|prothom)/u.test(text)) return 1;
  if (/(?:paper\b|পত্র)\s*(?:2(?:nd)?\b|দ্বিতীয়|ditiyo)/u.test(text)) return 2;
  return undefined;
};

const detectChapterNumber = (text: string): string | undefined => {
  const numeric = text.match(/(?:chapter\b|অধ্যায়|adhyay)\s*(?:no\.?|number|নং)?\s*(\d+)\b/u)?.[1]
    ?? text.match(/\b(\d+)\s*(?:তম|নং|ম|য়|st|nd|rd|th)?\s*(?:chapter\b|অধ্যায়|adhyay)/u)?.[1];
  if (numeric) return numeric;
  if (/(?:\bfirst\b|প্রথম|prothom)\s*(?:chapter\b|অধ্যায়|adhyay)/u.test(text)) return '1';
  if (/(?:\bsecond\b|দ্বিতীয়|ditiyo)\s*(?:chapter\b|অধ্যায়|adhyay)/u.test(text)) return '2';
  return undefined;
};

const priorityLabel = (priority: Chapter['priority']): string =>
  priority === 'A' ? t('অগ্রাধিকার A', 'Priority A') : priority === 'B' ? t('অগ্রাধিকার B', 'Priority B') : t('অগ্রাধিকার C', 'Priority C');

const chapterLine = (chapter: Chapter): string =>
  `${bn(chapter.number)}. ${chapter.title} (${priorityLabel(chapter.priority)})`;

function chaptersAnswer(subject: SubjectId, paper?: 1 | 2): AiBrainAnswer {
  const subjectInfo = subjectById[subject];
  const rows = CHAPTERS.filter(chapter => chapter.subject === subject && (paper === undefined || chapter.paper === paper));
  if (!rows.length) {
    return { kind: 'chapters', subject, paper, text: t(`${subjectInfo.name}-এর এই পত্রের কোনো অধ্যায় তালিকায় নেই।`, `No chapters are listed for ${subjectInfo.english} in this paper.`) };
  }
  const title = paper ? t(`${subjectInfo.name} ${bn(paper)}ম পত্রের অধ্যায়`, `${subjectInfo.english} Paper ${paper} chapters`) : t(`${subjectInfo.name}-এর সব অধ্যায়`, `All ${subjectInfo.english} chapters`);
  return {
    kind: 'chapters', subject, paper,
    text: `${title} (${bn(rows.length)}টি):\n${rows.map(chapterLine).join('\n')}\n${t('কোনো একটি অধ্যায়ের নাম বললে তার ফোকাস ও অগ্রাধিকার বলতে পারব।', 'Name one chapter and I will tell you its focus and priority.')}`,
  };
}

function chapterAnswer(chapter: Chapter): AiBrainAnswer {
  const subjectInfo = subjectById[chapter.subject];
  return {
    kind: 'chapter', chapter,
    text: t(
      `${subjectInfo.name} ${bn(chapter.paper)}ম পত্র · অধ্যায় ${bn(chapter.number)}: ${chapter.title}\n${priorityLabel(chapter.priority)}।\nফোকাস: ${chapter.focus}${chapter.note ? `\nনোট: ${chapter.note}` : ''}`,
      `${subjectInfo.english} Paper ${chapter.paper} · Chapter ${chapter.number}: ${chapter.title}\n${priorityLabel(chapter.priority)}.\nFocus: ${chapter.focus}${chapter.note ? `\nNote: ${chapter.note}` : ''}`,
    ),
  };
}

function subjectsAnswer(): AiBrainAnswer {
  const rows = SUBJECTS.map(subject => {
    const count = CHAPTERS.filter(chapter => chapter.subject === subject.id).length;
    return `${subject.name} (${subject.english}) — ${bn(count)}টি অধ্যায়`;
  });
  return {
    kind: 'subjects',
    text: t(`অ্যাপে ${bn(SUBJECTS.length)}টি বিষয় আছে:\n${rows.join('\n')}\nকোনো বিষয়ের অধ্যায় জানতে চাইলে বিষয়ের নাম বলো, যেমন “পদার্থের অধ্যায়গুলো কী?”`, `The app includes ${SUBJECTS.length} subjects:\n${rows.join('\n')}\nName a subject to see its chapters, for example “What are the Physics chapters?”`),
  };
}

let quizCursor = 0;
/**
 * Load one quiz question from the starter bank. The bank (quiz-data) is
 * dynamically imported so the Brain route never eagerly pulls the full
 * question engine — it loads only when a quiz is actually requested.
 * Rotating pick so consecutive quizzes differ.
 */
export async function loadQuizQuestion(subject?: SubjectId): Promise<QuizQuestion> {
  const { STARTER_QUESTIONS } = await import('./quiz-data');
  const pool = subject ? STARTER_QUESTIONS.filter(question => question.subject === subject) : STARTER_QUESTIONS;
  const list = pool.length ? pool : STARTER_QUESTIONS;
  const question = list[quizCursor % list.length];
  quizCursor += 1;
  return question;
}

/** Prompt text shown above the quiz options. */
export function quizMessage(question: QuizQuestion): string {
  const subjectInfo = subjectById[question.subject];
  return t(
    `কুইজ · ${subjectInfo.name}${question.chapterId ? ` · ${chapterById[question.chapterId]?.title ?? ''}` : ''}\n${question.question}\nনিচের অপশনগুলো থেকে একটা বেছে নাও।`,
    `Quiz · ${subjectInfo.english}${question.chapterId ? ` · ${chapterById[question.chapterId]?.title ?? ''}` : ''}\n${question.question}\nPick one of the options below.`,
  );
}

function quizAnswer(subject?: SubjectId): AiBrainAnswer {
  return { kind: 'quiz', subject };
}

export function checkQuizAnswer(question: QuizQuestion, picked: number): { correct: boolean; text: string } {
  const correct = picked === question.answer;
  const explanation = question.explanation ? `\n${t('ব্যাখ্যা', 'Explanation')}: ${question.explanation}` : '';
  return {
    correct,
    text: correct
      ? t(`ঠিক উত্তর!${explanation}\nআরেকটা কুইজ চাইলে “কুইজ দাও” বলো।`, `Correct!${explanation}\nSay “give me a quiz” for another one.`)
      : t(`ভুল হয়েছে। সঠিক উত্তর: ${question.options[question.answer]}।${explanation}\nআরেকটা কুইজ চাইলে “কুইজ দাও” বলো।`, `Not quite. The correct answer is: ${question.options[question.answer]}.${explanation}\nSay “give me a quiz” for another one.`),
  };
}

const TIPS: [string, string][] = [
  ['প্রতিদিন একই সময়ে পড়ো; অভ্যাস হলে মন বসাতে কম সময় লাগে।', 'Study at the same time every day; habit makes it easier to settle down.'],
  ['নতুন অধ্যায় শুরু করার আগে আগের অধ্যায়ের ভুলগুলো ঝালিয়ে নাও।', 'Before starting a new chapter, review the mistakes from the previous one.'],
  ['একবার পড়ে উৎস বন্ধ করে নিজের ভাষায় মূল ধারণাটি বলো — এটাই আসল শেখা।', 'Read once, close the source, then explain the main idea in your own words — that is real learning.'],
  ['MCQ প্র্যাকটিসের সময় উত্তরের পেছনের নিয়মটি নিজেকে জিজ্ঞেস করো।', 'During MCQ practice, ask yourself which rule the answer uses.'],
  ['কঠিন অধ্যায়কে ছোট ছোট অংশে ভাগ করে প্রতিটা শেষে এক বাক্যে সারাংশ লেখো।', 'Split hard chapters into small parts and write a one-sentence summary after each.'],
  ['পরীক্ষার আগে শুধু নতুন পড়া নয়, পুরোনো ঝালাইকেও সময় দাও।', 'Before the exam, give time to old revisions too, not only new reading.'],
  ['মনোযোগে সমস্যা হলে ফোন দূরে বা নীরব মোডে রাখো।', 'If your phone distracts you, keep it away or put it on silent.'],
  ['ঘুম কমিয়ে পড়লে মনে রাখা কমে; নিয়মিত ঘুম HSC-এর সবচেয়ে বড় অস্ত্র।', 'Cutting sleep to study reduces memory; regular sleep is your biggest HSC weapon.'],
  ['প্রতিটা সেশনের শেষে কী শিখলে এক বাক্যে মনে করো — পরের সেশনে এটাই ভিত্তি।', 'At the end of each session, recall one thing you learned — it becomes the base of the next session.'],
  ['দুর্বল অধ্যায় এড়িয়ে যেও না; প্রতিদিন অল্প করে হলেও ওই অধ্যায়ে ফিরে যাও।', 'Do not avoid weak chapters; return to them a little every day.'],
];

let tipCursor = 0;
function tipAnswer(): AiBrainAnswer {
  const [bnText, enText] = TIPS[tipCursor % TIPS.length];
  tipCursor += 1;
  return { kind: 'tip', text: t(`পড়ার টিপস: ${bnText}`, `Study tip: ${enText}`) };
}

function progressAnswer(data: AppData): AiBrainAnswer {
  const sessions = data.studySessions.length;
  const minutes = data.studySessions.reduce((sum, session) => sum + (session.minutes || 0), 0);
  const selected = data.personalRoutine?.chapterIds.length ?? 0;
  const completed = Object.keys(data.completed ?? {}).length;
  return {
    kind: 'progress',
    text: t(
      `তোমার সেভ করা অগ্রগতি:\n· ${bn(sessions)}টি পড়ার সেশন, মোট ≈${bn(minutes)} মিনিট\n· রুটিনে নির্বাচিত ${bn(selected)}টি অধ্যায়\n· সম্পন্ন কাজের রেকর্ড ${bn(completed)}টি\nএগুলো তোমার নিজের লগ থেকে; পরীক্ষার সম্ভাবনার হিসাব নয়।`,
      `Your saved progress:\n· ${sessions} study sessions, about ${minutes} minutes in total\n· ${selected} chapters selected in your routine\n· ${completed} completed-work records\nThese come from your own logs; they are not exam-probability estimates.`,
    ),
  };
}

const MOTIVATION: [string, string][] = [
  ['আজকের ছোট ফোকাসটাই কালকের বড় ফল। শুরু করো, নিখুঁত হওয়ার অপেক্ষা কোরো না।', 'Today\'s small focus is tomorrow\'s big result. Start; do not wait to be perfect.'],
  ['সবার দিন একরকম যায় না। ক্লান্ত লাগলে ছোট করে পড়ো, তবু থেমো না।', 'Not every day feels the same. If tired, study a little — just do not stop.'],
  ['ভুল মানেই পিছিয়ে পড়া নয়; প্রতিটা ভুল একটা ধাপ এগিয়ে দেয়।', 'A mistake is not falling behind; every mistake moves you one step forward.'],
  ['তুমি ইতিমধ্যে শুরু করেছ — এটাই সবচেয়ে কঠিন অংশ। এখন ধারাবাহিকতাই জয়।', 'You have already started — that was the hardest part. Now consistency wins.'],
  ['অন্যের গতির সঙ্গে নিজেকে মেলিও না; তোমার রুটিন, তোমার গতি।', 'Do not measure yourself against others\' pace; your routine, your pace.'],
  ['একটা অধ্যায় শেষ মানেই একটা দরজা খুলে গেল। পরেরটা তোমার জন্য অপেক্ষা করছে।', 'Finishing one chapter opens one door. The next one is waiting for you.'],
  ['মোটিভেশন আসে-যায়, কিন্তু অভ্যাস থেকে যায়। আজকের সেশনটাই অভ্যাস গড়ে।', 'Motivation comes and goes, but habit stays. Today\'s session builds the habit.'],
  ['পরীক্ষা দূরে মনে হলেও প্রতিদিনের ছোট প্রচেষ্টাই তোমাকে সেখানে পৌঁছে দেবে।', 'The exam may feel far, but small daily efforts will take you there.'],
];

let motivationCursor = 0;
function motivationAnswer(): AiBrainAnswer {
  const [bnText, enText] = MOTIVATION[motivationCursor % MOTIVATION.length];
  motivationCursor += 1;
  return { kind: 'motivation', text: t(bnText, enText) };
}

const HELP_TEXT = (): string => t(
  'আমি এই প্রশ্নগুলোর উত্তর দিতে পারি:\n· “পদার্থের অধ্যায়গুলো কী?” — বিষয়ের অধ্যায় তালিকা\n· “পদার্থের ভেক্টর অধ্যায়ের ফোকাস কী?” — একটি অধ্যায়ের বিস্তারিত\n· “কুইজ দাও” — MCQ কুইজ\n· “টিপস দাও” — পড়ার টিপস\n· “আমার অগ্রগতি?” — তোমার সেভ করা অগ্রগতি\n· “মোটিভেশন দাও” — উৎসাহ\nখোলামেলা প্রশ্নের জন্য “AI মডেল” মোড ব্যবহার করো (প্রায় ১৪০ MB ডাউনলোড লাগবে)।',
  'I can answer:\n· “What are the Physics chapters?” — chapter lists by subject\n· “What is the focus of the Physics Vector chapter?” — one chapter in detail\n· “Give me a quiz” — MCQ quiz\n· “Give me tips” — study tips\n· “My progress?” — your saved progress\n· “Motivate me” — encouragement\nFor open-ended questions, use “AI model” mode (approximately 140 MB download).',
);

/** Answer a study question from the app's own data. Pure and testable. */
export function answerAiQuestion(message: string, data: AppData): AiBrainAnswer {
  const text = normalize(message);
  if (!text) return { kind: 'unknown', text: HELP_TEXT() };
  const subject = detectSubject(text);
  const paper = detectPaper(text);

  if (/(?:কুইজ|quiz|প্রশ্ন দাও|পরীক্ষা দাও|test me|give me a (?:quiz|question))/u.test(text)) {
    return quizAnswer(subject);
  }
  if (/(?:টিপস|tips?|পরামর্শ|কীভাবে পড়ব|kivabe porbo|how (?:should|do) i (?:study|read)|study tip)/u.test(text)) {
    return tipAnswer();
  }
  if (/(?:মোটিভেশন|motivat|উৎসাহ|utsaho|মন খারাপ|mon kharap|encourag)/u.test(text)) {
    return motivationAnswer();
  }
  if (/(?:অগ্রগতি|progress|কেমন চলছে|kemon cholche|আমার রিপোর্ট|my report|how am i doing)/u.test(text)) {
    return progressAnswer(data);
  }
  if (/(?:বিষয়|bishoy|subjects?|কয়টা বিষয়|koyta bishoy)/u.test(text) && !subject) {
    return subjectsAnswer();
  }
  // Resolve a chapter name even when the student did not name a subject.
  // Titles are compared in the same Unicode form as the question, and a
  // repeated title is never guessed across different papers or subjects.
  const candidates = CHAPTERS.filter(chapter => (!subject || chapter.subject === subject) && (paper === undefined || chapter.paper === paper));
  const titleMatches = candidates.filter(chapter => text.includes(normalize(chapter.title)));
  if (titleMatches.length === 1) return chapterAnswer(titleMatches[0]);
  if (titleMatches.length > 1) return { kind: 'unknown', text: t('একই নামে একাধিক অধ্যায় আছে। বিষয় ও পত্র বলো।', 'More than one chapter has that name. Specify the subject and paper.') };

  if (subject) {
    // Only count numbers adjacent to an explicit chapter label; a paper number
    // in "physics paper 2 chapters" is not chapter 2.
    const chapterNumber = detectChapterNumber(text);
    if (chapterNumber) {
      const matches = candidates.filter(chapter => chapter.number === chapterNumber);
      if (matches.length === 1) return chapterAnswer(matches[0]);
      if (matches.length > 1) return { kind: 'unknown', text: t('এই নম্বর একাধিক পত্রে আছে। প্রথম না দ্বিতীয় পত্র বলো।', 'This chapter number appears in multiple papers. Specify the paper.') };
      return { kind: 'unknown', text: t('এই বিষয় ও পত্রে ওই নম্বরের অধ্যায় পাইনি।', 'No chapter with that number was found for this subject and paper.') };
    }
    if (/(?:অধ্যায়|adhyay|chapters?|list)/u.test(text)) return chaptersAnswer(subject, paper);
  }
  if (/(?:help|সাহায্য|কী পারো|ki paro|what can you do)/u.test(text)) {
    return { kind: 'unknown', text: HELP_TEXT() };
  }
  return { kind: 'unknown', text: HELP_TEXT() };
}
