import { CHAPTERS, PAPERS, SOURCES, SUBJECTS, SYLLABUS_NOTE, subjectById } from './data';
import { bn, chapterTasks, formatDate, formatTime, getPhases, getStats, isChapterDone, phaseName, todayKey } from './planner';
import type { AppData, Day, Task } from './planner';

export function downloadText(content: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const icsEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
export function foldICSLine(line: string): string {
  const encoder = new TextEncoder();
  let result = '', current = '', bytes = 0, first = true;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (first ? 75 : 74)) { result += `${current}\r\n`; current = ' '; bytes = 1; first = false; }
    current += char; bytes += size;
  }
  return result + current;
}
function icsLocal(date: string, minute: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + minute * 60000).toISOString().replace(/[-:]/g, '').slice(0, 15);
}
export function makeICS(tasks: Task[], data: AppData, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prostuti//HSC27 Study Planner//BN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:HSC 27 — প্রস্তুতি', 'X-WR-TIMEZONE:Asia/Dhaka',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Dhaka', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0600', 'TZOFFSETTO:+0600', 'TZNAME:+06', 'END:STANDARD', 'END:VTIMEZONE'];
  for (const task of tasks) {
    lines.push('BEGIN:VEVENT', `UID:${task.id}@hsc27.prostuti.local`, `DTSTAMP:${stamp}`, `SEQUENCE:${data.settings.calendarRevision}`,
      `DTSTART;TZID=Asia/Dhaka:${icsLocal(task.date, task.startMinute)}`, `DTEND;TZID=Asia/Dhaka:${icsLocal(task.date, task.endMinute)}`,
      `SUMMARY:${icsEscape(`${subjectById[task.subject].short} · ${task.title}`)}`,
      `DESCRIPTION:${icsEscape(`${task.detail}\nধাপ: ${phaseName(task.phase)} · দিন ${task.dayIndex}\nএটি ব্যক্তিগত পড়ার রুটিন; বোর্ড পরীক্ষার সময়সূচি নয়।\nতারিখ বদলালে নতুন ফাইল ইমপোর্ট করো; পুরোনো ক্যালেন্ডার মুছে নেওয়াই নিরাপদ।`)}`,
      `CATEGORIES:${icsEscape(subjectById[task.subject].name)}`, 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', `TRIGGER:${data.settings.reminderLead ? '-' : ''}PT${data.settings.reminderLead}M`, 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`পড়ার সময় হচ্ছে: ${task.title}`)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldICSLine).join('\r\n') + '\r\n';
}
export function exportCalendar(plan: Day[], data: AppData, range: 'day' | 'week' | 'all', date: string): number {
  const tasks = plan.flatMap(d => d.tasks).filter(t => !data.completed[t.id] && (range === 'all' || (range === 'day' ? t.date === date : t.date >= date && t.date < addDaysLocal(date, 7))));
  downloadText(makeICS(tasks, data), `prostuti-${range}-${date}.ics`, 'text/calendar;charset=utf-8');
  return tasks.length;
}
function addDaysLocal(date: string, days: number): string { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
const mdCell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function makeMarkdown(plan: Day[], data: AppData): string {
  const { settings } = data;
  const phases = getPhases(settings.startDate);
  const stats = getStats(plan, data, todayKey());
  const lines = [
    '# প্রস্তুতি — HSC 2027 বিজ্ঞান', '',
    `**শিক্ষার্থী:** ${settings.name || 'আমার প্রস্তুতি'} · **বোর্ড:** ${settings.board} · **চতুর্থ বিষয়:** উচ্চতর গণিত`,
    `**শুরু:** ${settings.startDate} · **শেষ:** ${plan[plan.length - 1].date} · **সময়:** ${bn(plan.length)} দিন (শেষ দিনসহ)`,
    `**দৈনিক পড়ার লক্ষ্য:** ${bn(settings.dailyHours)} ঘণ্টা পড়া; বিরতি আলাদা। **সময় অঞ্চল:** Asia/Dhaka (UTC+6)।`,
    '**লক্ষ্য:** A+ / GPA 5.00 / Golden — এটি লক্ষ্য, ফলের নিশ্চয়তা নয়।', '',
    '## আগে এটা পড়ো', '', SYLLABUS_NOTE, '',
    '- কোনো অধ্যায় থেকে প্রশ্ন আসা ১০০% নিশ্চিত নয়। পুরোনো প্রশ্ন অনুশীলনের সহায়ক, ভবিষ্যৎ প্রশ্নের ভবিষ্যদ্বাণী নয়।',
    '- শেষ মাসের ১৩টি পরীক্ষা ব্যক্তিগত মডেল টেস্ট। বোর্ড পরীক্ষার প্রকৃত তারিখ/সময় আলাদাভাবে যাচাই করো।',
    '- তারিখ বদলালে অ্যাপের পুরো রুটিন নতুন করে তৈরি হয়। কাজের ID একই থাকায় অগ্রগতি মুছে যায় না; Calendar ফাইল আবার ইমপোর্ট করতে হয়।',
    '- অসমাপ্ত কাজ নিজে নিজে সরে না। প্রতি ৭ম দিনের ব্যাকলগ সেশনে আগে সেগুলো শেষ করো।', '',
    '## তিনটি ধাপ', '', '| ধাপ | শুরু | শেষ | দিন | কাজ |', '|---|---|---|---:|---|',
    ...phases.map(p => `| ${p.name} | ${p.start} | ${p.end} | ${p.days} | ${p.subtitle} |`), '',
    '## প্রতিদিন যেভাবে পড়বে', '',
    '1. আগে পাঠ্যবই ও ব্যাখ্যা বুঝে পড়ো; তারপর solved example দেখো।',
    '2. বই বন্ধ করে নিজের ভাষায় নোট/সূত্র/চিত্র লেখো। শুধু ভিডিও দেখা পড়া শেষ হওয়া নয়।',
    '3. অধ্যায়ভিত্তিক সিলেট ও অন্য বোর্ডের প্রশ্ন থেকে CQ/MCQ করো। প্রতিটি ভুলের কারণ লেখো।',
    '4. পরের দিন আগের দিনের ১৫ মিনিটের রিকল; প্রতি ৭ম দিন ব্যাকলগ ও ছোট পরীক্ষা।',
    '5. ঘুমের জন্য রাতের কাজ আগে শেষ করো। ৮ ঘণ্টা পড়ার মাঝে বিরতি যোগ করলে দিনের মোট ব্যাপ্তি বাড়ে।',
    '6. ব্যবহারিক খাতা শিক্ষকের নির্ধারিত তালিকা অনুযায়ী করো; অ্যাপের প্রস্তুতি সহায়ক মাত্র।', '',
    '## বিষয়ভিত্তিক অধ্যায় ও তারিখ', '',
    'A = আগে পড়ার অধ্যায়, B = এরপর। দুই ধরনের অধ্যায়ই রুটিনে আছে। বাংলা/ইংরেজির ইউনিট দক্ষতাভিত্তিক।', '',
  ];
  for (const subject of SUBJECTS) {
    lines.push(`### ${subject.name}${subject.optional ? ' (চতুর্থ বিষয়)' : ''}`, '', '| অগ্রাধিকার | পত্র | পাঠ/অধ্যায় | পড়ার তারিখ | শেষ হয়েছে? |', '|---|---:|---|---|---|');
    for (const c of CHAPTERS.filter(c => c.subject === subject.id)) {
      const tasks = chapterTasks(plan, c.id);
      lines.push(`| ${c.priority} | ${c.paper} | ${mdCell(`${c.number}. ${c.title}`)} | ${tasks.map(t => t.date).join(', ') || 'সংস্করণ যাচাই করে ব্যাকলগ সেশনে করো'} | ${isChapterDone(plan, c.id, data.completed) ? 'হ্যাঁ' : 'না'} |`);
      if (c.note) lines.push('', `> ${c.note}`, '');
    }
    lines.push('');
  }
  lines.push('## তারিখ অনুযায়ী সম্পূর্ণ দৈনিক রুটিন', '', `অগ্রগতি: ${bn(stats.done)}/${bn(stats.total)} কাজ · ${bn(stats.chapters)}/${bn(stats.totalChapters)} অধ্যায়/ইউনিট।`, '');
  for (const day of plan) {
    const done = day.tasks.filter(t => data.completed[t.id]).length;
    lines.push(`### দিন ${bn(day.index)} — ${day.date}, ${formatDate(day.date, 'weekday')}`, '', `**${phaseName(day.phase)}**${day.isCatchup ? ' · সাপ্তাহিক ব্যাকলগ ও ছোট পরীক্ষা' : ''} · ${bn(done)}/${bn(day.tasks.length)} কাজ শেষ`, '', '| সময় | বিষয় | কী পড়বে / করবে | সম্পন্ন |', '|---|---|---|---|');
    for (const t of day.tasks) lines.push(`| ${formatTime(t.startMinute)}–${formatTime(t.endMinute)} | ${subjectById[t.subject].name} | ${mdCell(`${t.title} — ${t.detail}`)} | ${data.completed[t.id] ? '[x]' : '[ ]'} |`);
    if (data.notes[day.date]) lines.push('', `**দিনের নোট:** ${mdCell(data.notes[day.date])}`);
    lines.push('');
  }
  lines.push('## মডেল টেস্টের রেকর্ড', '', '| তারিখ | পত্র | পূর্ণমান | নম্বর | ভুল/পরবর্তী কাজ |', '|---|---|---:|---:|---|');
  for (const p of PAPERS) {
    const t = plan.flatMap(d => d.tasks).find(t => t.kind === 'exam' && t.paperId === p.id);
    const e = data.exams[p.id];
    lines.push(`| ${t?.date || '—'} | ${p.name} | ${p.maxScore} | ${e ? e.score : '—'} | ${e ? mdCell(e.mistakes) : '—'} |`);
  }
  lines.push('', '## ভুলের খাতা', '');
  if (!data.mistakes.length) lines.push('এখনও কোনো ভুল যোগ করা হয়নি। পড়ার সময় অ্যাপে যোগ করো।');
  for (const m of data.mistakes) lines.push(`- [${m.resolved ? 'x' : ' '}] **${m.date} · ${subjectById[m.subject].name}:** ${mdCell(m.text)}`);
  lines.push('', '## রিমাইন্ডার', '',
    '- অ্যাপের Reminders পেজ থেকে `.ics` ডাউনলোড করে Google Calendar / Apple Calendar-এ ইমপোর্ট করো।',
    `- প্রতিটি সেশনে ${bn(settings.reminderLead)} মিনিট আগের VALARM আছে। ক্যালেন্ডার অ্যাপ/ডিভাইসের নোটিফিকেশন অনুমতি চালু রাখো।`,
    '- ব্রাউজার নোটিফিকেশন শুধু অ্যাপ খোলা থাকা অবস্থায় কাজ করে; বন্ধ অ্যাপের ব্যাকগ্রাউন্ড পুশ সার্ভার এখানে নেই।',
    '- প্রথমবার পুরো রুটিন ইমপোর্ট করতে পারো। তারিখ/সময় বদলালে আলাদা ক্যালেন্ডার মুছে নতুন ফাইল ইমপোর্ট করো, যাতে ডুপ্লিকেট না হয়।',
    '- অগ্রগতি এই ব্রাউজারের localStorage-এ থাকে; অন্য ডিভাইসে নিজে থেকে যায় না। নিয়মিত JSON ব্যাকআপ রাখো।', '',
    '## তথ্যসূত্র ও যাচাই', '');
  SOURCES.forEach((s, i) => lines.push(`[${i + 1}](${s.url}) — ${s.name}। ${s.note}`));
  lines.push('', 'সরকারি নোটিশের মূল পাতা: https://nctb.gov.bd/pages/notices/ এবং https://sylhetboard.gov.bd/ । অ্যাপের অধ্যায়-নামগুলো সরকারিভাবে ধাপে ধাপে যাচাই করা হয়নি; পরীক্ষার বছরের নোটিশ ও নিজের পাঠ্যবইই চূড়ান্ত।', '',
    `রপ্তানি: ${new Date().toISOString()} · Prostuti / HSC-27`, '');
  return lines.join('\n');
}
