import { CHAPTERS } from './data';
import type { Chapter } from './data';

/** A separate short-term study overlay, never a replacement for saved A/B/C priorities.
 * This is a provisional, coverage-oriented shortlist, NOT a measured board-frequency ranking.
 * No complete, verified multi-year board corpus is bundled with the app.
 */
const selected: Record<string, string[]> = {
  physics: ['1:2', '1:4', '1:5', '1:8', '1:10'],
  biology: ['1:1', '1:2', '1:9', '2:4', '2:8', '2:11'],
  math: ['1:1', '1:3', '1:9', '1:10', '2:3'],
  bangla: ['1:গদ্য ১', '1:পদ্য ১', '1:সহপাঠ ১', '2:ব্যাকরণ ৩', '2:নির্মিতি ৩'],
  english: ['1:Reading 1', '1:Writing 2', '2:Grammar 1', '2:Writing 1'],
  ict: ['1:3', '1:4', '1:5', '1:6'],
};
export const S_CHAPTERS = CHAPTERS.filter(c => c.subject === 'chemistry'
  ? c.priority === 'A'
  : selected[c.subject]?.includes(`${c.paper}:${c.number}`));
const ids = new Set(S_CHAPTERS.map(c => c.id));
export const isSuperChapter = (chapter: Chapter | string): boolean => ids.has(typeof chapter === 'string' ? chapter : chapter.id);
export const S_REASONS: Record<string, { bn: string; en: string }> = {
  physics: { bn: 'ভেক্টর, বল–শক্তি, পর্যাবৃত্ত গতি ও গ্যাসের গাণিতিক ভিত্তি; শুধু প্রথম পত্রের ৫ অধ্যায়।', en: 'Five first-paper chapters covering vector, force/energy, oscillation and gas calculations.' },
  chemistry: { bn: 'তোমার নির্দেশ অনুযায়ী মূল A ক্যাটাগরির সব ৬ অধ্যায়; A তালিকা অপরিবর্তিত।', en: 'All six original A chapters, as requested; the A list stays intact.' },
  biology: { bn: 'কোষ, বিভাজন, উদ্ভিদ শারীরতত্ত্ব, সঞ্চালন, নিয়ন্ত্রণ ও জিনতত্ত্ব—দুই পত্র মিলিয়ে ৬ অধ্যায়।', en: 'Six chapters across both papers: cells, division, plant physiology, circulation, control and genetics.' },
  math: { bn: 'ম্যাট্রিক্স, সরলরেখা, ক্যালকুলাস ও জটিল সংখ্যা—দুই পত্র মিলিয়ে ৫ অধ্যায়।', en: 'Five chapters across both papers: matrices, straight lines, calculus and complex numbers.' },
  bangla: { bn: 'গদ্য, পদ্য, উপন্যাস ও ভাষার দক্ষতা মিলিয়ে ৫টি বিদ্যমান ইউনিট; গদ্য/পদ্য ইউনিটে একাধিক পাঠ আছে। বইয়ের সংস্করণ ও কলেজের সিলেবাস মিলিয়ে নাও।', en: 'Five existing units across literature and language skills; prose/poetry units contain multiple lessons. Check your edition and college syllabus.' },
  english: { bn: 'ইংরেজি বাদ না দিতে ৪টি reading/writing/grammar দক্ষতা ইউনিট।', en: 'Four reading, writing and grammar units so English is not omitted.' },
  ict: { bn: 'বর্তমান A-এর ৪ অধ্যায়: সংখ্যা পদ্ধতি, HTML, C ও ডেটাবেজ।', en: 'All four current A chapters: number systems, HTML, C and databases.' },
};
export const S_REFERENCE = { title: 'ভেক্টর — উন্মুক্ত অধ্যায়ভিত্তিক প্রশ্নব্যাংক (পূর্ণ বোর্ড-ফ্রিকোয়েন্সি বিশ্লেষণ নয়)', url: 'https://sattacademy.com/academy/ভেক্টর' };
