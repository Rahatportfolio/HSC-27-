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
