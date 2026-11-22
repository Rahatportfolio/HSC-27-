import { chapterById } from './data';
import { bn, formatDate, formatDurationBn, formatTime, getStats } from './planner';
import type { AppData, Day, Task } from './planner';
import { PERSONAL_SESSIONS, personalStageDone, WORK_STAGES, chapterWorkEstimate, isPersonalTaskComplete, personalBookLabel, personalChapterProgress, personalChapterSpeed, personalRoutineHealth, workloadFor } from './personalRoutine';
import { weekdayName } from './i18n';

const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const slot = (task: Task) => `${formatTime(task.startMinute)}–${task.endMinute === 1440 ? '24:00' : formatTime(task.endMinute)}`;
/** Scope-aware readable export. JSON/full backup remains the complete data backup. */
export function makePersonalMarkdown(plan: Day[], data: AppData): string {
  const routine = data.personalRoutine!, scope = routine.scope;
  const health = personalRoutineHealth(data, plan);
  const stats = getStats(plan, data, data.settings.startDate);
  const s = scope === 'S' ? routine : data.personalPhases?.S;
  const sDone = s?.chapterIds.filter(id => personalChapterProgress(s, id, data.completed).fullyComplete).length || 0;
  const lines = [
    `# প্রস্তুতি — আমার ${scope} ধাপের রুটিন`, '',
    `**শিক্ষার্থী:** ${cell(data.settings.name || 'আমার প্রস্তুতি')} · **শুরু:** ${data.settings.startDate}`,
    scope === 'ALL' ? `**লক্ষ্য:** সব ${bn(routine.chapterIds.length)}টি অধ্যায়, প্রতিটিতে তিন সেশন।` : scope === 'S'
      ? `**লক্ষ্য:** A থেকে নিজের বেছে নেওয়া ${bn(routine.chapterIds.length)}টি গুরুত্বপূর্ণ S অধ্যায়। বাকি A/B/C লাইব্রেরিতে আছে, এই রুটিনে বাধ্যতামূলক নয়।`
      : `**বর্তমান লক্ষ্য:** ${scope} ধাপের নির্বাচিত ${bn(routine.chapterIds.length)}টি অধ্যায়। S-এর সব প্রয়োজনীয় কাজ শেষ করার পর এই ধাপ বেছে নেওয়া হয়েছে।`,
    scope === 'ALL' ? `**সব অধ্যায়ের অগ্রগতি:** মোট ${bn(routine.chapterIds.length)} · সম্পন্ন ${bn(routine.chapterIds.filter(id => personalChapterProgress(routine, id, data.completed).fullyComplete).length)}।` : `**S অগ্রগতি:** মোট ${bn(s?.chapterIds.length || 0)} · সম্পন্ন ${bn(sDone)} · বাকি ${bn((s?.chapterIds.length || 0) - sDone)}।`,
    ...(scope === 'ALL' ? [] : ['**S একটি ব্যক্তিগত shortlist, সরকারি ক্যাটাগরি বা প্রশ্ন কমন পড়ার নিশ্চয়তা নয়।**']),
    `**ব্যক্তিগত টেস্ট লক্ষ্য:** ${data.settings.testExamDate} · **ব্যক্তিগত HSC প্রস্তুতির লক্ষ্য:** ${data.settings.examDate}। সরকারি/কলেজের পরীক্ষার রুটিন নয়।`,
    `**${scope} ধাপ শুরু:** ${routine.startsOn || data.settings.startDate} · **পূর্ণ কাজের শেষ বরাদ্দ:** ${health.syllabusEnd || 'অজানা/অসম্পূর্ণ বরাদ্দ'} (এটি পড়া শেষ হওয়ার প্রমাণ নয়)।`,
    `**বিরতির আগের কাজের সীমা:** ${formatDurationBn(routine.sessionMinutes)} · **বিরতি:** ${formatDurationBn(routine.breakMinutes)} · **ডিফল্ট ভিডিওর গতি:** ${routine.playbackSpeed}×${routine.chapterSpeeds ? ' (আগের ধাপের কিছু অধ্যায়ে নিজস্ব গতি রাখা আছে; নিচে দেখো)' : ''}`,
    'ভিডিওর বরাদ্দ = প্রকৃত উৎসের দৈর্ঘ্য ÷ বেছে নেওয়া গতি (মিনিটে উপরের পূর্ণসংখ্যা)। বিরতির আগের সীমা পুরো ভিডিওর দৈর্ঘ্য নয়। বই পড়া/নোট/অনুশীলন/রিভিশন ভিডিওর গতি দিয়ে কমানো হয়নি।', '',
    '## নিজের দেওয়া পড়ার সময়', '', '**সময় অঞ্চল:** Asia/Dhaka (UTC+6)। নতুন পড়া এই সময়ের বাইরে নয়।', '',
    `**দৈনিক নেট পড়ার সীমা:** ${routine.dailyLimitMinutes === undefined ? 'পুরোনো প্রোফাইলে আলাদা সীমা দেওয়া নেই; সময়সীমার বেশি নয়' : formatDurationBn(routine.dailyLimitMinutes)}। নির্দিষ্ট বিরতি/দায়িত্ব বাদ দেওয়ার পরের খালি সময় ও দৈনিক সীমার কমটিই ব্যবহার হবে।`, '',
    ...routine.windows.map(window => `- ${weekdayName(window.weekday)}: ${formatTime(window.startMinute)}–${window.endMinute === 1440 ? '24:00' : formatTime(window.endMinute)}`), '',
    '### নির্দিষ্ট বিরতি/দায়িত্ব — পড়া বসবে না', '',
    ...(routine.exclusions?.length ? routine.exclusions.map(window => `- ${weekdayName(window.weekday)}: ${formatTime(window.startMinute)}–${window.endMinute === 1440 ? '24:00' : formatTime(window.endMinute)}`) : ['দেওয়া সময়সীমার ভেতরে আলাদা নির্দিষ্ট বিরতি/দায়িত্ব রাখা হয়নি।']), '',
    '## একই দুই বই, অন্তত দুই পড়ার দিন', '',
    'প্রতি অধ্যায়ে আগে YouTube ক্লাস, তারপর নিজের নোট, শেষে CQ/MCQ সলভিং ও নিজের অনুশীলন। বই পড়া নোটের সঙ্গে এবং আগের রিভিশন অনুশীলনের সঙ্গে রাখা হয়েছে। সময় না কুলালে সেশন একাধিক দিন চলবে; ভিডিও ছোট করা হবে না।',
    'অসম্পন্ন উৎসের অংশ অসম্পন্নই থাকে। পরের খালি সময়ে সেটি জায়গা নেয়, পরের কাজ পিছায়—পূর্ণ দিনের ওপর বাড়তি ঘণ্টা যোগ হয় না। লক/ডেডলাইনের কারণে না বসলে সেই ঘাটতি আলাদা থাকবে।', '',
    '## সময়ের ঘাটতি ও অজানা তথ্য', '',
    ...(health.warnings.length ? health.warnings.map(warning => `> ${warning}`) : ['সব নির্বাচিত কাজের বরাদ্দ আছে; প্রকৃত পড়া/অনুশীলন সম্পন্ন হওয়া আলাদা।']), '',
    `## ${scope} অধ্যায় ও পৃথক কাজের সময়`, '',
  ];
  for (const id of routine.chapterIds) {
    const chapter = chapterById[id], work = workloadFor(routine, id), estimate = chapterWorkEstimate(routine, id), progress = personalChapterProgress(routine, id, data.completed);
    lines.push(`### ${scope} · ${chapter.title}`, '', `${personalBookLabel(id)} · ভিডিওর গতি ${personalChapterSpeed(routine, id)}× · ${estimate.complete ? formatDurationBn(estimate.minutes) : 'পূর্ণ কাজের সময় অজানা/প্রয়োজনীয় বাজেট অসম্পূর্ণ'}`, '',
      `**Syllabus Coverage:** ${bn(progress.coveragePercent)}% · **Exam Readiness:** ${bn(progress.readinessPercent)}% · **সম্পন্ন সেশন:** ${bn(PERSONAL_SESSIONS.filter(session => session.stages.every(stage => personalStageDone(routine, id, stage, data.completed))).length)}/3 · ${progress.fullyComplete ? 'পুরোপুরি সম্পন্ন' : 'এখনও অসমাপ্ত'}। প্রস্তুতি কোনো নম্বরের নিশ্চয়তা নয়।`, '',
      '| ধাপ | উৎসের/নিজে করার মিনিট | সময়ের উৎস ও হিসাব | লিংক |', '|---|---:|---|---|');
    for (const stage of WORK_STAGES) {
      const budget = work[stage.id], calc = budget.calculation;
      const provenance = budget.source === 'youtube-player' ? 'নির্বাচিত ভিডিওর player metadata' : budget.source === 'reference-metadata' ? 'সংরক্ষিত পৃষ্ঠার reference (যাচাইয়ের তারিখ অনিশ্চিত; বর্তমান player নয়)' : budget.source === 'student' ? 'শিক্ষার্থীর দেওয়া সময়' : budget.source === 'planned' ? 'নিজে কাজের পরিকল্পিত বাজেট' : budget.source === 'default24' ? 'ডিফল্ট অনুমান — অধ্যায়প্রতি ২০ ঘণ্টা (Settings-এ বদলানো যায়)' : 'অজানা — Duration Unavailable';
      const calculation = calc ? ` · ${calc.quantity} × ${calc.unitMinutes} মিনিট × difficulty ${calc.difficulty}${stage.id === 'revision' && calc.reviewedPercent !== undefined ? ` · আগের রিভিউ ${calc.reviewedPercent}% (সর্বোচ্চ ৫০% সময় ছাড়)` : ''}` : '';
      lines.push(`| ${stage.bn} | ${budget.minutes === null ? 'অজানা' : budget.minutes === 0 ? ['mcqClass', 'cqClass'].includes(stage.id) ? '০ — অতিরিক্ত ভিডিও বাদ; অনুশীলন প্রয়োজনীয়' : '০ — প্রয়োজনীয় কাজের বাজেট অসম্পূর্ণ' : budget.minutes} | ${provenance}${calculation}${budget.observedAt ? ` · ${budget.observedAt}` : ''} | ${cell(budget.url || '—')} |`);
    }
    lines.push('', ...PERSONAL_SESSIONS.map(session => `- [${session.stages.every(stage => personalStageDone(routine, id, stage, data.completed)) ? 'x' : ' '}] ${session.bn}`), '', '**আগের পৃথক কাজের হিসাব:**', ...progress.steps.map(step => `- [${step.done ? 'x' : ' '}] ${step.bn}`), '');
  }
  lines.push('## বরাদ্দ করা দৈনিক অংশ', '', `নির্বাচিত ${scope} অগ্রগতি: ${bn(stats.chapters)}/${bn(stats.totalChapters)} অধ্যায়। বরাদ্দের সম্পন্ন অংশ: ${bn(stats.done)}/${bn(stats.total)}।`, '');
  for (const day of plan.filter(day => day.tasks.length || day.unscheduled?.length || day.historyTasks?.length)) {
    lines.push(`### ${day.date} · ${formatDate(day.date, 'weekday')}`, '');
    if (day.tasks.length) {
      lines.push('| সময় | কাজ/উৎসের অংশ | সম্পন্ন |', '|---|---|---|');
      for (const task of day.tasks) lines.push(`| ${slot(task)} | ${cell(`${task.title} — ${task.detail}`)} | ${isPersonalTaskComplete(task, data.completed) ? '[x]' : '[ ]'} |`);
      lines.push('');
    }
    if (day.unscheduled?.length) lines.push('**সময়ে না-মেলা সংরক্ষিত কাজ — এগুলো দিনের বরাদ্দ নয়:**', '', ...day.unscheduled.map(task => `- ${slot(task)} · ${cell(task.title)} · ${isPersonalTaskComplete(task, data.completed) ? 'সম্পন্নের তথ্য আছে' : 'অসম্পন্ন; ক্যালেন্ডারে সময় ঠিক করো'}`), '');
    if (day.historyTasks?.length) lines.push('**আগের বরাদ্দের ইতিহাস — বর্তমান availability-এর বাইরে নতুন পড়া নয়:**', '', ...day.historyTasks.map(task => `- ${slot(task)} · ${cell(task.title)}`), '');
  }
  const archived = Object.values(data.personalPhases || {});
  if (archived.length) {
    lines.push('## সংরক্ষিত আগের/পুনরায় খোলার অপেক্ষায় থাকা ধাপ', '');
    for (const phase of archived) {
      lines.push(`### ${phase.scope}`, '', ...phase.chapterIds.map(id => `- ${chapterById[id].title} · ${personalChapterProgress(phase, id, data.completed).fullyComplete ? 'সব কাজ সম্পন্ন' : 'এখনও অসমাপ্ত'}`), '');
      for (const task of phase.history || []) lines.push(`- আগের বরাদ্দ: ${task.date} ${slot(task)} · ${cell(task.title)}`);
    }
  }
  lines.push('## সংরক্ষিত দিনের নোট (পুরোনো দিনসহ)', '');
  for (const [date, text] of Object.entries(data.notes).sort(([a], [b]) => a.localeCompare(b))) lines.push(`- **${date}:** ${cell(text)}`);
  lines.push('', '## সংরক্ষিত অধ্যায়ের নোট (নির্বাচিত ধাপের বাইরেরটিও)', '');
  for (const [id, meta] of Object.entries(data.chapterMeta)) if (meta.note) lines.push(`- **${chapterById[id]?.title || id}:** ${cell(meta.note)}`);
  lines.push('', 'এটি ব্যক্তিগত রুটিনের পাঠযোগ্য রপ্তানি; সব completion timestamp, স্ক্যান, media bytes ও অন্যান্য ইতিহাসের পূর্ণ ব্যাকআপ নয়। সম্পূর্ণ তথ্যের জন্য Settings-এর JSON/Full backup রাখো।', '');
  return lines.join('\n');
}
