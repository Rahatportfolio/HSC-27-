import { isEnglish } from './i18n';

export interface MotivationLine {
  bn: string;
  en: string;
}

/** Original short lines written for this planner — no borrowed quotes, no attribution needed. */
export const MOTIVATION_LINES: MotivationLine[] = [
  { bn: 'আজকের ছোট পড়াটাই কালকের আত্মবিশ্বাস।', en: 'Today’s small session is tomorrow’s confidence.' },
  { bn: 'পুরো সিলেবাস এক দিনে নয়—এক অধ্যায়, এক দিন।', en: 'The whole syllabus is not one day’s work — one chapter, one day.' },
  { bn: 'মন না চাইলেও শুরু করো; শুরু করলে মন বসে যায়।', en: 'Start even when the mood is missing; the mood follows the start.' },
  { bn: 'ভুল করা মানে শেখা হচ্ছে, থেমে থাকা মানে নয়।', en: 'Making mistakes means learning; standing still does not.' },
  { bn: 'আজ যে অধ্যায়টা কঠিন লাগছে, কাল সেটাই সহজ হবে।', en: 'The chapter that feels hard today will feel easy tomorrow.' },
  { bn: 'প্রতিদিন এক ঘণ্টা, সপ্তাহে সাত ঘণ্টা—এই হিসাবেই এগিয়ে যাবে প্রস্তুতি।', en: 'One hour a day is seven hours a week — that is how preparation moves.' },
  { bn: 'রিভিশন মিস করলেও আত্মবিশ্বাস মিস করো না; আবার শুরু করো।', en: 'If you miss a revision, do not lose confidence; begin again.' },
  { bn: 'তোমার গতি তোমার নিজের; কারও সঙ্গে তুলনা নয়।', en: 'Your pace is your own; comparison is not required.' },
  { bn: 'ঘুম, বিশ্রাম আর পড়া—তিনটাই পরিকল্পনার অংশ।', en: 'Sleep, rest and study are all part of the plan.' },
  { bn: 'আজ একটি ছোট টার্গেট শেষ করো, বাকিটা কাল।', en: 'Finish one small target today; the rest can wait for tomorrow.' },
  { bn: 'লিখে রাখলে মনে থাকে; মনে থাকলে নম্বর আসে।', en: 'Writing helps remembering; remembering brings marks.' },
  { bn: 'কঠিন প্রশ্নে থেমো না—ছোট ভাগে ভাগ করে নাও।', en: 'Do not stop at a hard question — break it into smaller parts.' },
  { bn: 'এক দিনের ব্যাকলগ সারা জীবনের ব্যাকলগ নয়।', en: 'One day’s backlog is not a lifetime’s backlog.' },
  { bn: 'তোমার প্রস্তুতি তোমার হাতেই; আজ এক ধাপ এগোও।', en: 'Your preparation is in your hands; take one step today.' },
];

/** Same line for the same date, rotating through the list as days pass. */
export function motivationFor(date: string): MotivationLine {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) return MOTIVATION_LINES[0];
  return MOTIVATION_LINES[((day % MOTIVATION_LINES.length) + MOTIVATION_LINES.length) % MOTIVATION_LINES.length];
}

export function motivationText(date: string): string {
  const line = motivationFor(date);
  return isEnglish() ? line.en : line.bn;
}
