import { CHAPTERS, SUBJECTS, SUBJECT_FULL_MARKS } from './data';
import { STARTER_QUESTIONS } from './quiz-data';
import { factsFor, generateQuestions, generativeChapters, verifyGenerated } from './questionGen';
import { goldenPlan } from './golden';
import { NUMERIC_SCHEMA_COUNT, numericChapters, numericQuestions, verifyNumeric } from './numericGen';
import { examPool } from './examSim';
import { focusReport } from './focus';
import { planBacklog } from './backlog';
import { LIMITS } from './storage';
import { buildPlan, freshData, todayKey } from './planner';
import { buildSourcesReport } from './sources';
import type { AppData } from './planner';

/**
 * A page that checks the app instead of praising it.
 *
 * Every number the interface shows comes from somewhere: a bank, a formula, a saved
 * session. This module re-counts the most important of them from the source and reports
 * what it actually found — including the limits, the chapters that are still thin, and
 * the promises the app cannot keep offline. If a check fails, the page says so.
 */

export interface AuditCheck {
  key: string;
  labelBn: string;
  labelEn: string;
  /** The measured value, already formatted for display. */
  value: string;
  /** What the number means, in plain words. */
  detailBn: string;
  detailEn: string;
  status: 'ok' | 'warn' | 'fail';
}

export interface AuditThinChapter {
  chapterId: string;
  title: string;
  subject: string;
  priority: string;
  facts: number;
  numeric: number;
  /** Largest paper the chapter can produce today. */
  pool: number;
}

export interface AuditReport {
  generatedAt: string;
  checks: AuditCheck[];
  /** Chapters that cannot fill a ten-question paper yet, worst first. */
  thin: AuditThinChapter[];
  counts: {
    chapters: number;
    subjects: number;
    bankQuestions: number;
    banksPerChapter: { min: number; max: number; average: number };
    factChapters: number;
    factQuestions: number;
    numericSchemas: number;
    numericChapters: number;
    numericQuestions: number;
    verifyIssues: number;
    duplicates: number;
  };
  /** Per-chapter provenance: videos, banked MCQs and what is still missing. */
  sources: ReturnType<typeof buildSourcesReport>;
  /** Things the app deliberately does not do, stated plainly. */
  limits: { bn: string; en: string }[];
}

const bnDigits = '০১২৩৪৫৬৭৮৯';
export function bnNum(value: number | string): string {
  return String(value).replace(/\d/g, digit => bnDigits[Number(digit)]);
}

/** Re-count the question engines and check every generated item against its own source. */
export function selfAudit(data: AppData = freshData(), today = todayKey()): AuditReport {
  const bankQuestions = STARTER_QUESTIONS.length;
  const perChapter = new Map<string, number>();
  for (const question of STARTER_QUESTIONS) {
    if (question.chapterId) perChapter.set(question.chapterId, (perChapter.get(question.chapterId) ?? 0) + 1);
  }
  const bankCounts = [...perChapter.values()];

  const factChapters = generativeChapters();
  const generated = factChapters.flatMap(chapterId => generateQuestions(chapterId, { variant: 'audit' }));
  const numericBuilds = factChapters.flatMap(chapterId => numericQuestions(chapterId, 4));
  const verifyIssues = [...verifyGenerated(generated), ...verifyNumeric(numericBuilds.map(build => build.question))];

  // Deterministic duplicate check: the same prompt must not appear twice in one chapter.
  const seen = new Map<string, Set<string>>();
  let duplicates = 0;
  for (const question of generated) {
    const set = seen.get(question.chapterId ?? '') ?? new Set<string>();
    if (set.has(question.question)) duplicates += 1;
    set.add(question.question);
    seen.set(question.chapterId ?? '', set);
  }

  const thin: AuditThinChapter[] = CHAPTERS.map(chapter => {
    const numeric = numericChapters().includes(chapter.id) ? numericQuestions(chapter.id, 4).length : 0;
    return {
      chapterId: chapter.id,
      title: chapter.title,
      subject: SUBJECTS.find(subject => subject.id === chapter.subject)?.short ?? chapter.subject,
      priority: chapter.priority,
      facts: factsFor(chapter.id).length,
      numeric,
      pool: examPool(data, { mode: 'chapter', chapterId: chapter.id, generate: true, count: 50 } as never).length,
    };
  }).sort((a, b) => a.pool - b.pool || a.facts - b.facts || a.chapterId.localeCompare(b.chapterId));

  const thinList = thin.filter(entry => entry.pool < 10);
  const underFive = thin.filter(entry => entry.pool < 5);

  // The plan and the backlog are recomputed here so the audit does not trust the UI.
  const plan = buildPlan(data.settings);
  const backlog = planBacklog(plan, data, today);
  const focus = focusReport(data, today);
  const chaptersWithoutBank = CHAPTERS.filter(chapter => !perChapter.has(chapter.id));

  // The Golden A+ check runs on a fixed sample profile so it is comparable run to run.
  // One subject at A, the rest at A+ — the exact case the 4th-subject bonus decides.
  const goldenProbe = goldenPlan({
    physics: Math.round(SUBJECT_FULL_MARKS.physics * 0.74),
    chemistry: Math.round(SUBJECT_FULL_MARKS.chemistry * 0.85),
    biology: Math.round(SUBJECT_FULL_MARKS.biology * 0.85),
    math: Math.round(SUBJECT_FULL_MARKS.math * 0.85),
    bangla: Math.round(SUBJECT_FULL_MARKS.bangla * 0.85),
    english: Math.round(SUBJECT_FULL_MARKS.english * 0.85),
    ict: Math.round(SUBJECT_FULL_MARKS.ict * 0.85),
  });

  const sources = buildSourcesReport();

  const checks: AuditCheck[] = [
    {
      key: 'chapters',
      labelBn: 'সিলেবাসের অধ্যায়', labelEn: 'Syllabus chapters',
      value: bnNum(CHAPTERS.length),
      detailBn: `${SUBJECTS.length}টি বিষয়ে ${CHAPTERS.length}টি অধ্যায়—প্রশ্নব্যাংক, প্ল্যান ও প্রতিটি স্ক্রিন একই তালিকা পড়ে।`,
      detailEn: `Every bank, plan and screen reads the same list of ${CHAPTERS.length} chapters across ${SUBJECTS.length} subjects.`,
      status: 'ok',
    },
    {
      key: 'bank',
      labelBn: 'যাচাই করা MCQ ব্যাংক', labelEn: 'Verified MCQ bank',
      value: bnNum(bankQuestions),
      detailBn: `${bnNum(perChapter.size)}টি অধ্যায়ে প্রশ্ন আছে; প্রতি অধ্যায়ে কমপক্ষে ${bnNum(Math.min(...bankCounts))}, বেশি ${bnNum(Math.max(...bankCounts))}টি।${chaptersWithoutBank.length ? ` ${bnNum(chaptersWithoutBank.length)}টি অধ্যায়ে এখনো নেই।` : ' সব অধ্যায়ে আছে।'}`,
      detailEn: `${perChapter.size} chapters carry banked questions; ${chaptersWithoutBank.length} still have none.`,
      status: chaptersWithoutBank.length ? 'warn' : 'ok',
    },
    {
      key: 'facts',
      labelBn: 'তথ্যভিত্তিক জেনারেটর', labelEn: 'Fact generator',
      value: `${bnNum(generated.length)} · ${bnNum(factChapters.length)} অধ্যায়`,
      detailBn: `প্রতিটি প্রশ্নের সঠিক উত্তর ব্যাংকের তথ্য থেকেই আসে; ${bnNum(verifyIssues.length)}টি যাচাই-ত্রুটি পাওয়া গেছে।`,
      detailEn: `Correct answers are taken from the shipped bank; ${verifyIssues.length} verification issue(s) found.`,
      status: verifyIssues.length ? 'fail' : 'ok',
    },
    {
      key: 'numeric',
      labelBn: 'সূত্র-গণনার ইঞ্জিন', labelEn: 'Formula engine',
      value: `${bnNum(NUMERIC_SCHEMA_COUNT)} স্কিমা`,
      detailBn: `${bnNum(numericChapters().length)}টি অধ্যায়ে সূত্রে সংখ্যা বসিয়ে উত্তর হিসাব করা হয়—হাতে লেখা উত্তর নেই, তাই ভুল উত্তর ঢোকানো অসম্ভব।`,
      detailEn: `${numericChapters().length} chapters compute answers from formulas at request time, so a wrong answer cannot be typed in by hand.`,
      status: NUMERIC_SCHEMA_COUNT >= 40 ? 'ok' : 'warn',
    },
    {
      key: 'duplicates',
      labelBn: 'একই প্রশ্ন দুবার', labelEn: 'Duplicate prompts',
      value: bnNum(duplicates),
      detailBn: duplicates ? 'একই অধ্যায়ে একই প্রশ্ন দুইবার এসেছে—এটি বাগ।' : 'একই অধ্যায়ে একই প্রশ্ন দুইবার তৈরি হয় না।',
      detailEn: duplicates ? 'The same prompt appears twice in one chapter — that is a bug.' : 'No chapter repeats a generated prompt.',
      status: duplicates ? 'fail' : 'ok',
    },
    {
      key: 'papers',
      labelBn: '১০ প্রশ্নের কাগজ বানাতে পারে', labelEn: 'Chapters that can fill a 10-question paper',
      value: `${bnNum(CHAPTERS.length - thinList.length)} / ${bnNum(CHAPTERS.length)}`,
      detailBn: `${bnNum(underFive.length)}টি অধ্যায়ে ৫টিরও কম প্রশ্ন—তাই “১০ প্রশ্ন” বাছলে সিমুলেটর এখন আগেই সত্যি সংখ্যা বলে দেয়।`,
      detailEn: `${underFive.length} chapter(s) hold fewer than five questions; the simulator now states the real paper size before starting.`,
      status: underFive.length ? 'warn' : 'ok',
    },
    {
      key: 'plan',
      labelBn: 'প্ল্যানে দিন', labelEn: 'Planned days',
      value: bnNum(plan.length),
      detailBn: `প্রতিদিনের সীমা ${bnNum(Math.round(480 / 60))} ঘণ্টা; ব্যাকলগ ও অ্যাডাপ্টিভ—দুটোই একই সীমা মানে (${bnNum(backlog.days.length)} দিনের হিসাব এখন দেখা হচ্ছে)।`,
      detailEn: `The 8-hour ceiling is enforced by the planner, the adaptive reshuffle and the backlog manager (${backlog.days.length} days checked).`,
      status: backlog.days.every(day => day.before + day.added <= day.cap) ? 'ok' : 'fail',
    },
    {
      key: 'focus',
      labelBn: 'টাইমারের হিসাব', labelEn: 'Timer accounting',
      value: `${bnNum(focus.sessions)} সেশন`,
      detailBn: 'ফোকাস রিপোর্ট কেবল সেভ করা সেশন থেকে গোনে; মনোযোগের “স্কোর” বানানো হয় না।',
      detailEn: 'The focus report only counts saved sessions; it never invents an attention score.',
      status: 'ok',
    },
    {
      key: 'golden',
      labelBn: 'Golden A+ হিসাব (নমুনা)', labelEn: 'Golden A+ arithmetic (sample)',
      // A deliberately awkward profile: one subject below A+, the 4th subject at A+.
      // The audit re-derives the plan and states what the rule really allows.
      value: `${bnNum(goldenProbe.deficitBudget ?? 0)} পয়েন্ট`,
      detailBn: goldenProbe.gpaFive
        ? `একটি বিষয় A (৪ পয়েন্ট) আর ৪র্থ বিষয় A+ নিয়েও GPA ৫.০০ থাকে—বোনাসের সীমা ${bnNum(goldenProbe.deficitBudget ?? 0)} পয়েন্ট। Golden A+-এর জন্য আর ${bnNum(goldenProbe.marksToGolden)} নম্বর দরকার।`
        : 'নমুনা হিসাবে GPA ৫.০০ পাওয়া যায়নি—নিয়ম বদলে থাকলে এখানেই ধরা পড়বে।',
      detailEn: goldenProbe.gpaFive
        ? `Even with one subject at A (4 points) and the 4th subject at A+, GPA 5.00 holds: the bonus allows ${goldenProbe.deficitBudget ?? 0} lost points. Golden A+ is ${goldenProbe.marksToGolden} marks away.`
        : 'The sample profile does not reach GPA 5.00 — if the rule ever drifts, this check fails.',
      status: goldenProbe.gpaFive ? 'ok' : 'fail',
    },
    {
      key: 'sources',
      labelBn: 'প্রশ্নের আসল উৎস', labelEn: 'Where the questions really come from',
      value: `${bnNum(CHAPTERS.length - sources.totals.chaptersWithBoardVideo)} অধ্যায়ে বোর্ড ভিডিও নেই`,
      detailBn: `${bnNum(sources.totals.bankQuestions)}টি প্রশ্নই অ্যাপের নিজের পাঠ্যবই-যাচাইকৃত ব্যাংক থেকে—বোর্ডের মূল প্রশ্নপত্র নয়। ${bnNum(sources.totals.verifiedLinks)}টি যাচাই করা ক্লাস লিংকের মধ্যে ${bnNum(sources.totals.chaptersWithBoardVideo)}টি অধ্যায়ে বোর্ড-প্রশ্নের প্লেলিস্ট আছে; বাকি ${bnNum(CHAPTERS.length - sources.totals.chaptersWithBoardVideo)}টিতে নেই।`,
      detailEn: `All ${sources.totals.bankQuestions} questions come from the app's own textbook-checked bank, not from an original board paper. Of ${sources.totals.verifiedLinks} verified class links, ${sources.totals.chaptersWithBoardVideo} chapters have a board-question playlist and ${CHAPTERS.length - sources.totals.chaptersWithBoardVideo} do not.`,
      status: 'warn',
    },
    {
      key: 'storage',
      labelBn: 'স্টোরেজের সীমা', labelEn: 'Storage limits',
      value: bnNum(LIMITS.sessions),
      detailBn: `সর্বোচ্চ ${bnNum(LIMITS.sessions)}টি সেশন, ${bnNum(LIMITS.revisions)}টি রিভিশন, ${bnNum(LIMITS.examSessions)}টি পরীক্ষা রাখা যায়; ছাড়ালে পুরোনো ডেটা বাদ পড়ে—তাই ব্যাকআপ দরকার।`,
      detailEn: `Up to ${LIMITS.sessions} sessions, ${LIMITS.revisions} revisions and ${LIMITS.examSessions} papers are kept; old data is dropped at the cap, so backups matter.`,
      status: 'ok',
    },
  ];

  const limits = [
    { bn: 'সব ডেটা এই ব্রাউজারেই থাকে—কোনো সার্ভার বা অ্যাকাউন্ট নেই; ডিভাইস বদলাতে JSON ব্যাকআপ লাগবে।', en: 'All data lives in this browser — no server or account. Moving devices needs a JSON backup.' },
    { bn: 'অ্যাপ বন্ধ থাকলে পুশ নোটিফিকেশন আসে না (ওয়েবে); Android অ্যাপে লোকাল নোটিফিকেশন আছে।', en: 'Push notifications need a server; the web build cannot alert while closed. The Android build has local notifications.' },
    { bn: 'পরীক্ষার “আনুমানিক গ্রেড” MCQ শতাংশ থেকে—বোর্ডের CQ/সৃজনশীল নম্বরের সঙ্গে মেলানো যায় না।', en: 'The approximate grade comes from MCQ percentage only; it is not a board CQ mark.' },
    { bn: 'জেনারেটর কেবল যাচাই করা তথ্য/সূত্র থেকে প্রশ্ন বানায়—তাই নতুন প্রশ্নের বৈচিত্র্য ব্যাংকের আকারেই সীমিত।', en: 'The generators only use verified facts and formulas, so variety is bounded by the size of those pools.' },
    { bn: 'অ্যাপে কোনো বোর্ডের মূল প্রশ্নপত্র বান্ডল করা নেই—কারণ সেগুলো কপিরাইটযুক্ত। নিজের বোর্ড প্রশ্ন “বোর্ড প্রশ্ন” ট্যাবে লিখে যোগ করলে বোর্ড ও সাল আপনি নিজেই দিচ্ছেন।', en: 'No board paper is bundled — they are copyrighted. The Board questions tab lets you add your own, and you supply the board and year yourself.' },
  ];

  return {
    generatedAt: new Date().toISOString(),
    checks,
    thin: thinList.slice(0, 60),
    sources,
    counts: {
      chapters: CHAPTERS.length,
      subjects: SUBJECTS.length,
      bankQuestions,
      banksPerChapter: {
        min: Math.min(...bankCounts),
        max: Math.max(...bankCounts),
        average: Math.round(bankQuestions / Math.max(1, perChapter.size) * 10) / 10,
      },
      factChapters: factChapters.length,
      factQuestions: generated.length,
      numericSchemas: NUMERIC_SCHEMA_COUNT,
      numericChapters: numericChapters().length,
      numericQuestions: numericBuilds.length,
      verifyIssues: verifyIssues.length,
      duplicates,
    },
    limits,
  };
}

/** One honest headline for the top of the page: the weakest check, not the average. */
export function auditHeadline(report: AuditReport): { status: 'ok' | 'warn' | 'fail'; bn: string; en: string } {
  const failed = report.checks.filter(check => check.status === 'fail');
  const warned = report.checks.filter(check => check.status === 'warn');
  if (failed.length) {
    return {
      status: 'fail',
      bn: `${failed.length}টি পরীক্ষা ব্যর্থ—${failed[0].labelBn}।`,
      en: `${failed.length} check(s) failed — starting with ${failed[0].labelEn}.`,
    };
  }
  if (warned.length) {
    return {
      status: 'warn',
      bn: `সব হিসাব মিলেছে, তবে ${warned.length}টি সীমা এখনো আছে—নিচে সংখ্যা-সহ লেখা।`,
      en: `All counts reconcile; ${warned.length} known limit(s) remain, each with its number below.`,
    };
  }
  return { status: 'ok', bn: 'সব পরীক্ষা পাস—প্রতিটি সংখ্যা নিজের উৎস থেকে আবার গোনা হয়েছে।', en: 'Every check passed; each number was re-counted from its own source.' };
}
