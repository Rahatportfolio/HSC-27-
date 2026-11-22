import { t } from './i18n';
import type { AppData, Day } from './planner';
import { applyPersonalRoutine } from './personalRoutine';

/** A small allow-list of local actions. Model output is never executed as code. */
export interface RoutineCommand { type: 'daily-limit' | 'session' | 'break'; minutes: number }
export function parseRoutineCommand(message: string): RoutineCommand | undefined {
  const text = message.normalize('NFKC').toLowerCase().replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));
  // These commands are changes, not questions or requests to erase/reset data.
  if (!/(?:set|change|update|make|করো|করুন|রাখো|দাও|বদলাও|koro|kor|rakho|dao)/u.test(text)
      || /(?:delete|reset|remove|don't|do not|never|not|মুছ|বাদ|ডিলিট|করো না|করবেন না|না কর|নয়|না দাও)/u.test(text)
      || (text.match(/\d+(?:\.\d+)?/g) || []).length !== 1) return undefined;
  const number = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(ঘণ্টা|ঘন্টা|hour|hours|hr|hrs|minute|minutes|min|মিনিট)/u);
  if (!number) return undefined;
  const minutes = Number(number[1]) * (/^(?:ঘণ্টা|ঘন্টা|hour|hours|hr|hrs)$/u.test(number[2]) ? 60 : 1);
  if (!Number.isSafeInteger(minutes)) return undefined;
  const kind = /(?:break|বিরতি|break er|biroti)/u.test(text) ? 'break'
    : /(?:session|সেশন|seson)/u.test(text) ? 'session'
    : /(?:daily|প্রতিদিন|দৈনিক|দিনে|daily|dine)/u.test(text) ? 'daily-limit' : undefined;
  if (!kind) return undefined;
  if (kind === 'daily-limit' && (minutes < 1 || minutes > 1440)
      || kind === 'session' && (minutes < 15 || minutes > 120)
      || kind === 'break' && (minutes < 0 || minutes > 60)) return undefined;
  return { type: kind, minutes };
}
export function describeRoutineCommand(action: RoutineCommand): string {
  const label = action.type === 'daily-limit' ? t('দৈনিক নেট পড়ার সীমা', 'Daily net study limit')
    : action.type === 'session' ? t('একটানা সেশনের সীমা', 'Continuous session limit') : t('সেশনের মাঝে বিরতি', 'Break between sessions');
  return `${label}: ${action.minutes} ${t('মিনিট', 'minutes')}`;
}
export function applyRoutineCommand(data: AppData, action: RoutineCommand, plan: Day[], today: string): AppData {
  if (!data.personalRoutine) throw new Error(t('আগে নিজের রুটিন তৈরি করো।', 'Set up your personal routine first.'));
  const field = action.type === 'daily-limit' ? 'dailyLimitMinutes' : action.type === 'session' ? 'sessionMinutes' : 'breakMinutes';
  return applyPersonalRoutine(data, { ...data.personalRoutine, [field]: action.minutes, updatedAt: new Date().toISOString() }, { plan, asOf: today });
}
