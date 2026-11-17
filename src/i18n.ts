export type Language = 'bn' | 'en';

let current: Language = 'bn';

/** Called by the app root before rendering. Safe on the server/test environment. */
export function setLanguage(language: Language): void {
  current = language === 'en' ? 'en' : 'bn';
  if (typeof document !== 'undefined') document.documentElement.lang = current === 'en' ? 'en' : 'bn';
}

export function currentLanguage(): Language {
  return current;
}

export function isEnglish(): boolean {
  return current === 'en';
}

/** Inline bilingual label: the Bengali text is the default and the fallback. */
export function t(bengali: string, english: string): string {
  return current === 'en' ? english : bengali;
}

/** Weekday names, Sunday first, so every calendar agrees on one spelling. */
export const WEEKDAYS: { bn: string; en: string; shortBn: string; shortEn: string }[] = [
  { bn: 'রবি', en: 'Sun', shortBn: 'রবি', shortEn: 'Su' },
  { bn: 'সোম', en: 'Mon', shortBn: 'সো', shortEn: 'Mo' },
  { bn: 'মঙ্গল', en: 'Tue', shortBn: 'মঙ্গল', shortEn: 'Tu' },
  { bn: 'বুধ', en: 'Wed', shortBn: 'বু', shortEn: 'We' },
  { bn: 'বৃহঃ', en: 'Thu', shortBn: 'বৃহ', shortEn: 'Th' },
  { bn: 'শুক্র', en: 'Fri', shortBn: 'শু', shortEn: 'Fr' },
  { bn: 'শনি', en: 'Sat', shortBn: 'শনি', shortEn: 'Sa' },
];

export const weekdayName = (day: number, short = false): string => {
  const entry = WEEKDAYS[((day % 7) + 7) % 7];
  if (current === 'en') return short ? entry.shortEn : entry.en;
  return short ? entry.shortBn : entry.bn;
};
