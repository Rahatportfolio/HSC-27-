import { isPersonalTaskComplete, personalSessionForStage } from './personalRoutine';
import { chapterById, subjectById } from './data';
import { isEnglish } from './i18n';
import {
  addDays,
  bn,
  formatDurationBn,
  formatTime,
  getNextUnfinishedDay,
  getUnfinishedPastTasks,
  phaseName,
} from './planner';
import type { AppData, Day, Task } from './planner';
import { nextCadenceSlot } from './cadence';

export interface DailyNotificationDigest {
  date: string;
  /** Short readable description of what subjects & chapters are scheduled today. */
  whatToStudy: string;
  /** Total scheduled minutes for the day. */
  totalMinutes: number;
  /** Total scheduled tasks/sessions for the day. */
  totalTasks: number;
  /** Completed minutes for the day. */
  doneMinutes: number;
  /** Completed tasks/sessions for the day. */
  doneTasks: number;
  /** Remaining minutes left to complete today. */
  remainingMinutes: number;
  /** Remaining tasks/sessions left to complete today. */
  remainingTasks: number;
  /** Completion percentage (0..100). */
  percentDone: number;
  /** Titles of remaining sessions today. */
  remainingTitles: string[];
  /** Number of unfinished sessions carried from earlier days. */
  pastUnfinishedCount: number;
  /** Minutes of unfinished sessions carried from earlier days. */
  pastUnfinishedMinutes: number;
  /** Formatted duration of unfinished sessions from earlier days. */
  pastUnfinishedSummary: string;
  /** True when today has scheduled tasks and all of them are completed. */
  allDone: boolean;
  /** Next unfinished day's study description (when today is 100% done). */
  nextDayWhatToStudy: string;
  /** Formatted total study text, e.g. "৮ ঘণ্টা (৪টি সেশন)". */
  totalSummary: string;
  /** Formatted completed text, e.g. "১/৪ সেশন (২ ঘণ্টা · ২৫%)". */
  completedSummary: string;
  /** Formatted remaining-to-complete text, e.g. "৩টি সেশন (৬ ঘণ্টা)". */
  remainingSummary: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
}

function describeDayStudy(day: Day | undefined): string {
  if (!day || day.tasks.length === 0) {
    return isEnglish() ? 'No scheduled study on this date' : 'এই তারিখে নির্ধারিত পড়া নেই';
  }
  const bySubject = new Map<string, string[]>();
  for (const tk of day.tasks) {
    const subShort = isEnglish() ? subjectById[tk.subject].english : subjectById[tk.subject].short;
    const list = bySubject.get(subShort) || [];
    for (const cid of tk.chapterIds) {
      const chTitle = chapterById[cid]?.title;
      if (chTitle && !list.includes(chTitle)) list.push(chTitle);
    }
    bySubject.set(subShort, list);
  }
  const parts: string[] = [];
  for (const [subName, chTitles] of bySubject.entries()) {
    if (chTitles.length > 0) {
      parts.push(`${subName} (${chTitles.join(', ')})`);
    } else {
      parts.push(`${subName} (${phaseName(day.phase)})`);
    }
  }
  return parts.join(isEnglish() ? ' + ' : ' ও ');
}

/** A logical personal session gets one reminder per date, not one per internal range.
 * Custom appointments remain independent. Choose before completion filtering so
 * ticking the first range does not schedule another reminder for the same session.
 */
export function reminderTasksForDay(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  return [...tasks].sort((a, b) => a.startMinute - b.startMinute).filter(task => {
    if (!task.personalWork || !task.chapterIds[0]) return true;
    const key = `${task.date}:${task.chapterIds[0]}:${personalSessionForStage(task.personalWork.stage).id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/**
 * Computes a complete snapshot of today's study:
 * 1) What to study today (আজ কী পড়া)
 * 2) Total amount of study (মোট কতটুকু পড়া)
 * 3) How much is completed & how much still needs to be completed (কতটুকু কমপ্লিট করা লাগবে)
 */
export function buildDailyNotificationDigest(plan: Day[], data: AppData, date: string): DailyNotificationDigest {
  const day = plan.find(d => d.date === date);
  const tasks = day?.tasks ?? [];
  const totalTasks = tasks.length;
  // A future start or an empty/deferred day is not a completed study day and
  // must not invent 8/16 hours of scheduled work from the settings target.
  const totalMinutes = tasks.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);

  const doneList = tasks.filter(tk => isPersonalTaskComplete(tk, data.completed));
  const remainingList = tasks.filter(tk => !isPersonalTaskComplete(tk, data.completed));

  const doneTasks = doneList.length;
  const doneMinutes = doneList.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);
  const remainingTasks = remainingList.length;
  const remainingMinutes = remainingList.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);
  const percentDone = totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : 0;

  const pastUnfinished = getUnfinishedPastTasks(plan, date, data.completed);
  const pastUnfinishedCount = pastUnfinished.length;
  const pastUnfinishedMinutes = pastUnfinished.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);
  const pastUnfinishedSummary = formatDurationBn(pastUnfinishedMinutes);
  const allDone = totalTasks > 0 && remainingTasks === 0;
  const nextDay = allDone ? getNextUnfinishedDay(plan, date, data.completed) : undefined;
  const nextDayWhatToStudy = nextDay ? describeDayStudy(nextDay) : '';

  const whatToStudy = describeDayStudy(day);
  const remainingTitles = remainingList.map(tk => tk.title);

  const unitEn = data.personalRoutine ? 'parts' : 'sessions';
  const unitBn = data.personalRoutine ? 'অংশ' : 'সেশন';
  const totalSummary = isEnglish()
    ? `${formatDurationBn(totalMinutes)} (${totalTasks} ${unitEn})`
    : `${formatDurationBn(totalMinutes)} (${bn(totalTasks)}টি ${unitBn})`;

  const completedSummary = isEnglish()
    ? `${doneTasks}/${totalTasks} ${unitEn} (${formatDurationBn(doneMinutes)} · ${percentDone}%)`
    : `${bn(doneTasks)}/${bn(totalTasks)}টি ${unitBn} (${formatDurationBn(doneMinutes)} · ${bn(percentDone)}%)`;

  const remainingSummary = totalTasks === 0
    ? (isEnglish() ? 'No scheduled sessions' : 'কোনো নির্ধারিত সেশন নেই')
    : remainingTasks === 0
    ? (isEnglish() ? 'All completed for today!' : 'আজকের সব পড়া সম্পন্ন!')
    : isEnglish()
      ? `${remainingTasks} ${unitEn} left (${formatDurationBn(remainingMinutes)})`
      : `${bn(remainingTasks)}টি ${unitBn} বাকি (${formatDurationBn(remainingMinutes)})`;

  return {
    date,
    whatToStudy,
    totalMinutes,
    totalTasks,
    doneMinutes,
    doneTasks,
    remainingMinutes,
    remainingTasks,
    percentDone,
    remainingTitles,
    pastUnfinishedCount,
    pastUnfinishedMinutes,
    pastUnfinishedSummary,
    allDone,
    nextDayWhatToStudy,
    totalSummary,
    completedSummary,
    remainingSummary,
  };
}

/**
 * Full daily status notification (used for morning briefing, live progress tray card, and 1-click check).
 * Explicitly includes: আজ কী পড়া + মোট কতটুকু পড়া + কতটুকু সম্পন্ন ও কতটুকু কমপ্লিট করা লাগবে।
 */
export function buildDailyStatusNotification(plan: Day[], data: AppData, date: string): NotificationPayload {
  const digest = buildDailyNotificationDigest(plan, data, date);

  if (digest.totalTasks > 0 && digest.remainingTasks === 0) {
    const nextDay = getNextUnfinishedDay(plan, date, data.completed);
    const nextStudy = nextDay ? describeDayStudy(nextDay) : '';
    if (isEnglish()) {
      return {
        title: `🎉 Today 100% Done (${digest.totalSummary})`,
        body: `Studied: ${digest.whatToStudy}${nextStudy ? `\nNext up: ${nextStudy}` : ''}${digest.pastUnfinishedCount > 0 ? `\nEarlier pending: ${digest.pastUnfinishedCount} ${data.personalRoutine ? 'parts' : 'sessions'} (${formatDurationBn(digest.pastUnfinishedMinutes)})` : ''}`,
      };
    }
    return {
      title: `🎉 আজকের সব পড়া সম্পন্ন! (${digest.totalSummary})`,
      body: `আজ পড়া হয়েছে: ${digest.whatToStudy}${nextStudy ? `\nপরের দিনের পড়া: ${nextStudy}` : ''}${digest.pastUnfinishedCount > 0 ? `\nআগের বাকি পড়া: ${bn(digest.pastUnfinishedCount)}টি ${data.personalRoutine ? 'অংশ' : 'সেশন'} (${formatDurationBn(digest.pastUnfinishedMinutes)})` : ''}`,
    };
  }

  const nextRemainingText = digest.remainingTitles.slice(0, 2).join(' · ');
  const pastLineBn = digest.pastUnfinishedCount > 0
    ? `\nআগের দিনের বাকি: ${bn(digest.pastUnfinishedCount)}টি (${formatDurationBn(digest.pastUnfinishedMinutes)})`
    : '';
  const pastLineEn = digest.pastUnfinishedCount > 0
    ? `\nEarlier pending: ${digest.pastUnfinishedCount} (${formatDurationBn(digest.pastUnfinishedMinutes)})`
    : '';

  if (isEnglish()) {
    return {
      title: `📚 Today: ${digest.remainingSummary} · Total ${formatDurationBn(digest.totalMinutes)}`,
      body: `Today's study: ${digest.whatToStudy}\nTotal: ${digest.totalSummary} · Done: ${digest.completedSummary}\nLeft to complete: ${digest.remainingSummary}${nextRemainingText ? ` (${nextRemainingText})` : ''}${pastLineEn}`,
    };
  }

  return {
    title: `📚 আজকের পড়া · কমপ্লিট করতে বাকি ${formatDurationBn(digest.remainingMinutes)} (${bn(digest.remainingTasks)}/${bn(digest.totalTasks)} ${data.personalRoutine ? 'অংশ' : 'সেশন'})`,
    body: `আজ কী পড়া: ${digest.whatToStudy}\nমোট পড়া: ${digest.totalSummary} · সম্পন্ন: ${digest.completedSummary}\nকমপ্লিট করা লাগবে: ${digest.remainingSummary}${nextRemainingText ? ` — ${nextRemainingText}` : ''}${pastLineBn}`,
  };
}

/**
 * Morning briefing line for the exam routine: which paper is owed today.
 * Returns null when every slot is already closed, so the briefing never nags for nothing.
 */
export function buildExamRoutineLine(data: AppData, date: string): string | null {
  const slot = nextCadenceSlot(data, date);
  if (!slot) return null;
  const late = slot.lateDays > 0 ? (isEnglish() ? ` · ${slot.lateDays} day(s) late` : ` · ${bn(slot.lateDays)} দিন দেরি`) : '';
  return isEnglish()
    ? `📝 Today's paper: ${slot.labelEn} · ${slot.questions} MCQs · ${slot.questions} min${late}`
    : `📝 আজকের পরীক্ষা: ${slot.label} · ${bn(slot.questions)}টি MCQ · ${bn(slot.questions)} মিনিট${late}`;
}

/**
 * Pre-session notification fired right before a scheduled block starts.
 * Shows the current session + duration, PLUS today's full study & remaining work to complete!
 */
export function buildTaskReminderNotification(plan: Day[], data: AppData, task: Task): NotificationPayload {
  const digest = buildDailyNotificationDigest(plan, data, task.date);
  const taskMin = Math.max(15, task.endMinute - task.startMinute);
  if (task.personalWork) {
    const session = personalSessionForStage(task.personalWork.stage);
    const chapter = chapterById[task.chapterIds[0]]?.title || task.title;
    return isEnglish()
      ? { title: `⏰ ${session.en}: ${chapter}`, body: `Starts ${formatTime(task.startMinute)} · This session may continue across multiple slots or days. ${digest.remainingSummary}` }
      : { title: `⏰ ${session.bn}: ${chapter}`, body: `শুরু ${formatTime(task.startMinute)} · সেশনটি একাধিক সময় বা দিনে চলতে পারে। ${digest.remainingSummary}` };
  }
  const timeSlot = `${formatTime(task.startMinute)} – ${formatTime(task.endMinute)}`;

  if (isEnglish()) {
    return {
      title: `⏰ Study now: ${task.title} (${formatDurationBn(taskMin)})`,
      body: `Slot: ${timeSlot} · Today: ${digest.whatToStudy}\nTotal: ${digest.totalSummary} · Done: ${digest.doneTasks}/${digest.totalTasks} · Left to complete: ${digest.remainingSummary}`,
    };
  }

  return {
    title: `⏰ এখন পড়া: ${task.title} (${formatDurationBn(taskMin)})`,
    body: `সময়: ${timeSlot} · আজ কী পড়া: ${digest.whatToStudy}\nমোট: ${digest.totalSummary} · সম্পন্ন: ${bn(digest.doneTasks)}/${bn(digest.totalTasks)}টি · কমপ্লিট করা বাকি: ${digest.remainingSummary}`,
  };
}

/**
 * Evening check-in notification (when today's study is still incomplete).
 */
export function buildEveningCheckinNotification(plan: Day[], data: AppData, date: string): NotificationPayload | null {
  const digest = buildDailyNotificationDigest(plan, data, date);
  if (digest.remainingTasks === 0 && digest.pastUnfinishedCount === 0) return null;

  if (digest.remainingTasks === 0 && digest.pastUnfinishedCount > 0) {
    return isEnglish()
      ? {
          title: `🌙 Today done! ${digest.pastUnfinishedCount} earlier ${data.personalRoutine ? 'parts' : 'sessions'} pending`,
          body: `Today's ${formatDurationBn(digest.totalMinutes)} is 100% complete. If you have time, finish 1 pending ${data.personalRoutine ? 'part' : 'session'} (${formatDurationBn(digest.pastUnfinishedMinutes)} total).`,
        }
      : {
          title: `🌙 আজকের পড়া শেষ! আগের ${bn(digest.pastUnfinishedCount)}টি পড়া বাকি`,
          body: `আজকের ${formatDurationBn(digest.totalMinutes)} সম্পূর্ণ শেষ। হাতে সময় থাকলে আগের বাকি পড়া থেকে ১টি ${data.personalRoutine ? 'অংশ' : 'সেশন'} শেষ করে নাও।`,
        };
  }

  const remItems = digest.remainingTitles.slice(0, 2).join(' · ');
  if (isEnglish()) {
    return {
      title: `🌙 Study check-in · ${digest.remainingSummary}`,
      body: `Today's study: ${digest.whatToStudy} (Total ${digest.totalSummary})\nDone: ${digest.completedSummary} · Still to complete: ${digest.remainingSummary}${remItems ? ` — ${remItems}` : ''}`,
    };
  }

  return {
    title: `🌙 রাতের রিমাইন্ডার · আজ কমপ্লিট করতে বাকি ${formatDurationBn(digest.remainingMinutes)}`,
    body: `আজ কী পড়া: ${digest.whatToStudy} (মোট ${digest.totalSummary})\nসম্পন্ন: ${digest.completedSummary} · বাকি আছে: ${digest.remainingSummary}${remItems ? ` — ${remItems}` : ''}`,
  };
}

/**
 * Evening preview of the NEXT study day: which subjects/chapters, the first
 * session time and the total planned minutes. Sent in the evening so the
 * student knows what tomorrow holds before sleeping. Returns null when
 * tomorrow has no scheduled work.
 */
export function buildTomorrowPreviewNotification(plan: Day[], data: AppData, date: string): NotificationPayload | null {
  const tomorrow = addDays(date, 1);
  const day = plan.find(d => d.date === tomorrow);
  if (!day || day.tasks.length === 0) return null;
  const open = day.tasks.filter(tk => !isPersonalTaskComplete(tk, data.completed));
  const tasks = open.length ? open : day.tasks;
  const totalMinutes = tasks.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);
  const sessions = data.personalRoutine ? reminderTasksForDay(tasks).length : tasks.length;
  const firstStart = Math.min(...tasks.map(tk => tk.startMinute));
  const what = describeDayStudy(day);

  if (isEnglish()) {
    return {
      title: `📅 Tomorrow: ${formatDurationBn(totalMinutes)} · ${sessions} session(s)`,
      body: `Tomorrow's classes: ${what}\nFirst session: ${formatTime(firstStart)} · Total: ${formatDurationBn(totalMinutes)} (${sessions} sessions)`,
    };
  }

  return {
    title: `📅 আগামীকালের ক্লাস · ${formatDurationBn(totalMinutes)} (${bn(sessions)}টি সেশন)`,
    body: `আগামীকাল কী পড়া: ${what}\nপ্রথম সেশন: ${formatTime(firstStart)} · মোট: ${formatDurationBn(totalMinutes)} (${bn(sessions)}টি সেশন)`,
  };
}
