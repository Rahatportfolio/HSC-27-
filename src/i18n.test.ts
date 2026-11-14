// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { currentLanguage, isEnglish, setLanguage, t } from './i18n';
import { DEFAULT_SETTINGS, bn, formatDate } from './planner';
import { sanitizeSettings } from './storage';

beforeEach(() => setLanguage('bn'));

describe('i18n labels', () => {
  it('defaults to Bangla and returns the Bengali label', () => {
    expect(currentLanguage()).toBe('bn');
    expect(isEnglish()).toBe(false);
    expect(t('আজকের পড়া', "Today's study")).toBe('আজকের পড়া');
  });

  it('switches to English and updates the document language', () => {
    setLanguage('en');
    expect(currentLanguage()).toBe('en');
    expect(isEnglish()).toBe(true);
    expect(t('আজকের পড়া', "Today's study")).toBe("Today's study");
    expect(document.documentElement.lang).toBe('en');
    setLanguage('bn');
    expect(document.documentElement.lang).toBe('bn');
  });

  it('falls back to Bangla for an unknown language value', () => {
    setLanguage('en');
    setLanguage('fr' as never);
    expect(currentLanguage()).toBe('bn');
  });
});

describe('locale-aware formatting', () => {
  it('uses Bengali digits in Bangla mode and ASCII digits in English mode', () => {
    expect(bn(2027)).toBe('২০২৭');
    setLanguage('en');
    expect(bn(2027)).toBe('2027');
  });

  it('formats dates with the active locale', () => {
    expect(formatDate('2026-11-14', 'long')).toContain('নভেম্বর');
    expect(formatDate('2026-11-14', 'long')).toMatch(/[০-৯]/);
    setLanguage('en');
    expect(formatDate('2026-11-14', 'long')).toBe('14 November 2026');
  });
});

describe('language setting persistence', () => {
  it('keeps a valid language through sanitizeSettings', () => {
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, language: 'en' });
    expect(settings.language).toBe('en');
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS }).language).toBe('bn');
  });

  it('rejects an unsupported language', () => {
    expect(() => sanitizeSettings({ ...DEFAULT_SETTINGS, language: 'fr' })).toThrow('ভাষার সেটিংস সঠিক নয়।');
    expect(() => sanitizeSettings({ ...DEFAULT_SETTINGS, language: 7 })).toThrow('ভাষার সেটিংস সঠিক নয়।');
  });
});
