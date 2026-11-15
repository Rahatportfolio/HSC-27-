/**
 * Regenerates CLASS-LINKS.md straight from the app's own data, so the document
 * can never drift from what the student actually sees inside the app.
 *
 *   npx tsx scripts/class-links-md.ts
 */
import { writeFileSync } from 'node:fs';
import { CHAPTERS, SUBJECTS, sortChapters } from '../src/data';
import type { Chapter } from '../src/data';
import { BANGLA_LESSONS, CHAPTER_CLASSES, CHANNELS } from '../src/classLinks';
import type { ClassOption } from '../src/classLinks';
import { buildPlan } from '../src/planner';

const plan = buildPlan();
const hours = new Map<string, number>();
for (const day of plan) {
  for (const task of day.tasks) {
    for (const id of task.chapterIds ?? []) {
      const minutes = Math.max(0, task.endMinute - task.startMinute);
      hours.set(id, (hours.get(id) ?? 0) + minutes);
    }
  }
}

const stars = (chapter: Chapter) => '★'.repeat(chapter.priority === 'A' ? 5 : chapter.priority === 'B' ? 3 : 1);
const link = (option: ClassOption) => {
  const mark = option.kind === 'search' ? '🔎' : '✅';
  return '[' + mark + ' ' + option.channel + '](' + option.url + ')';
};
const cell = (options: ClassOption[] = []) => (options.length ? options.map(link).join(' · ') : '—');
const hoursOf = (id: string) => ((hours.get(id) ?? 0) / 60).toFixed(1);

const lines: string[] = [
  '# HSC 2027 — অধ্যায়ভিত্তিক ক্লাস লিংক (One-shot · MCQ · CQ)',
  '',
  'প্রতিটি অধ্যায়ে **দুইজন শিক্ষক** — যেটা বেশি বোঝায় সেটাই খোলো।',
  '',
  '✅ = YouTube-এ খুলে যাচাই করা ক্লাস / প্লেলিস্ট (চ্যানেলের আসল নাম লেখা) · 🔎 = ওই শিক্ষকের চ্যানেলের ভেতরের সার্চ (নতুন ক্লাস উঠলে নিজেই পেয়ে যাবে)।',
  '',
  '> এই ফাইলটা `scripts/class-links-md.ts` তৈরি করে—হাতে সম্পাদনা করলে পরের বার রিজেনারেটে মুছে যাবে।',
  '',
];

const ordered = sortChapters(CHAPTERS);
for (const subject of SUBJECTS) {
  const chapters = ordered.filter(chapter => chapter.subject === subject.id);
  if (!chapters.length) continue;
  lines.push('## ' + subject.name, '', '| অধ্যায় | ★ | ঘণ্টা | ওয়ান শট | MCQ | CQ |', '|---|---|---|---|---|---|');
  for (const chapter of chapters) {
    const classes = CHAPTER_CLASSES[chapter.id];
    lines.push(
      '| ' + chapter.number + ' ' + (chapter.paper === 1 ? '১ম' : '২য়') + ' — ' + chapter.title +
      ' | ' + stars(chapter) + ' | ' + hoursOf(chapter.id) + ' | ' +
      cell(classes?.oneShot) + ' | ' + cell(classes?.mcq) + ' | ' + cell(classes?.cq) + ' |',
    );
  }
  lines.push('');
}

lines.push('## বাংলা ১ম পত্র — পাঠভিত্তিক ক্লাস', '', '| পাঠ | ক্লাস |', '|---|---|');
for (const [id, lessons] of Object.entries(BANGLA_LESSONS)) {
  const group = CHAPTERS.find(chapter => chapter.id === id);
  for (const lesson of lessons) {
    const label = (group ? group.number + ' · ' : '') + lesson.title;
    lines.push('| ' + label + ' | ' + (lesson.url ? '[✅ ' + (lesson.channel ?? 'ক্লাস') + '](' + lesson.url + ')' : '🔎 এখনো নেই') + ' |');
  }
}
lines.push('');

const cells = CHAPTERS.flatMap(chapter => {
  const classes = CHAPTER_CLASSES[chapter.id];
  return [...(classes?.oneShot ?? []), ...(classes?.mcq ?? []), ...(classes?.cq ?? [])];
});
const verified = cells.filter(option => option.kind !== 'search');
const uniqueUrls = new Set(verified.map(option => option.url));
const lessonsReady = Object.values(BANGLA_LESSONS).flat().filter(lesson => lesson.url).length;
const lessonsTotal = Object.values(BANGLA_LESSONS).flat().length;

lines.push(
  '**মোট:** ' + cells.length + 'টি ঘর — ' + verified.length + 'টি যাচাই করা লিংক (' + uniqueUrls.size + 'টি আলাদা ভিডিও/প্লেলিস্ট), ' + (cells.length - verified.length) + 'টি চ্যানেল-সার্চ।',
  '',
  '**পাঠভিত্তিক ক্লাস:** ' + lessonsReady + '/' + lessonsTotal + 'টি পাঠে সরাসরি ভিডিও।',
  '',
  '## চ্যানেল',
  '',
  ...CHANNELS.map(channel => '- [' + channel.name + '](' + channel.url + ') — ' + channel.note),
  '',
);

writeFileSync('CLASS-LINKS.md', lines.join('\n'), 'utf8');
console.log('CLASS-LINKS.md written:', CHAPTERS.length, 'chapters,', verified.length, 'verified links,', uniqueUrls.size, 'unique');
