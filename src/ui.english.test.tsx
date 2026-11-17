// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import App from './App';
import { buildPlan, freshData, getPhases, STORAGE_KEY } from './planner';
import { CLASS_TYPES, TEACHERS } from './videoCatalog';
import { BANGLA_LESSONS, CHANNELS } from './classLinks';
import { CHAPTERS, PAPER_NAMES, SOURCES, SUBJECTS, syllabusNote } from './data';

/**
 * English mode is a real, user-selectable language, so any interface string that
 * skips `t(...)` leaks Bengali into the English UI. Source-level regex escapes
 * are noisy, so this test renders the app for real, in English, and reads the
 * rendered text out of the DOM.
 *
 * Only the *interface* is inspected: user data (chapter, subject and note text
 * from `data.ts`) is legitimately Bengali and is ignored.
 */

const NAV = [
  'Home dashboard',
  'My study plan',
  'Syllabus',
  'Video classes',
  'Study & offline',
  'Note scanner',
  'PDF library',
  'Test preparation',
  'Practice',
  'Flashcards',
  'Smart revision',
  'Exam simulator',
  'Weakness detector',
  'Syllabus heatmap',
  'Backlog manager',
  'Exams & GPA',
  'Study timer',
  'Progress & analytics',
  'Library',
  'Reminders',
  'App audit',
  'Storage',
  'Settings & backup',
];

const BANGLA = /[\u0980-\u09FF]/;

/**
 * Bengali vocabulary that is *content*, not chrome: chapter titles, subjects,
 * teacher and channel names, the generated routine text and the syllabus
 * descriptions. Those stay Bengali in both languages — they are the student's
 * actual syllabus and teachers, not interface labels.
 */
function contentVocabulary(): { whole: Set<string>; words: Set<string> } {
  const whole = new Set<string>();
  const words = new Set<string>();
  const add = (entry: string | undefined) => {
    if (!entry) return;
    whole.add(entry.trim());
    for (const part of entry.split(/[\s·—–|/,()…।]+/)) if (part) words.add(part.trim());
  };
  // `number` is a human label for language units, e.g. "পদ্য ১", and the heatmap and
  // calendar print it directly, so it is content just like the title.
  for (const c of CHAPTERS) { add(c.title); add(c.focus); add(c.note); add(c.number); }
  // Same titles with any ASCII digits written as Bengali digits, because the heatmap
  // and calendar print the numeral that way.
  const toBengaliDigits = (text: string) => text.replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
  for (const c of CHAPTERS) { add(toBengaliDigits(c.title)); add(toBengaliDigits(c.focus)); }
  // A chapter title can be rendered without its trailing numeral ("পদ্য ১" → "পদ্য"),
  // so register the title with digits stripped as content too.
  const stripDigits = (text: string) => text.replace(/[\u09E6-\u09EF\d]+/g, ' ').replace(/\s+/g, ' ').trim();
  // A chapter title may render with or without its Bengali numeral, and some screens
  // show only the leading word ("পদ্য ৪" → "পদ্য"). Register both forms by whole token,
  // never by splitting conjuncts apart.
  for (const c of CHAPTERS) {
    add(stripDigits(c.title)); add(stripDigits(c.focus));
    // The heatmap renders the numeral in Bengali digits ("পদ্য ১"), so register the
    // title with numerals converted to Bengali as well as the raw form.
    const asBengaliDigits = c.title.replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
    add(asBengaliDigits);
  }
  // Paper names ("উদ্ভিদবিজ্ঞান · প্রথম পত্র") are content from the syllabus too.
  for (const papers of Object.values(PAPER_NAMES)) for (const name of papers) add(name);
  for (const subject of SUBJECTS) { add(subject.name); add(subject.short); }
  const plan = buildPlan();
  for (const phase of getPhases(freshData().settings)) { add(phase.name); add(phase.subtitle); }
  // Teachers, channels and class-type names are proper nouns, not interface copy.
  for (const teacher of TEACHERS) { add(teacher.name); }
  for (const type of CLASS_TYPES) { add(type.bn); }
  for (const channel of CHANNELS) { add(channel.name); add(channel.note); }
  // Bangla-textbook lesson titles and the teacher honorifics the UI appends.
  for (const lessons of Object.values(BANGLA_LESSONS)) for (const lesson of lessons) add(lesson.title);
  // Honorifics the UI appends to a teacher's short name, e.g. "অপূর্ব দাদা".
  for (const honorific of ['ভাই', 'দাদা', 'স্যার', 'ভাইয়া', 'আপু', 'ডা.', 'ডা']) add(honorific);
  for (const day of plan) for (const task of day.tasks) { add(task.title); add(task.detail); }
  return { whole, words };
}

/**
 * Reference text that is Bengali *content*, not interface chrome: source names and
 * their notes in `data.ts`, and the plain number words (`০`, `১১৪`, `০৮:১৯`) that
 * `bn()` produces for statistics. Leaves of these are skipped by word, and bare
 * Bengali digits are not words at all.
 */
function referenceText(): { whole: Set<string>; words: Set<string> } {
  const whole = new Set<string>();
  const words = new Set<string>();
  const add = (entry: string | undefined) => {
    if (!entry) return;
    whole.add(entry.trim());
    for (const part of entry.split(/[\s·—–|/,()…।]+/)) if (part) words.add(part.trim());
  };
  for (const source of SOURCES) { add(source.name); add(source.note); }
  add(syllabusNote());
  return { whole, words };
}

const CONTENT = contentVocabulary();
const REFERENCE = referenceText();

/** Bengali words made only of digits and separators are numbers, not chrome. */
const NUMERIC = /^[\u09E6-\u09EF\s:/.,·%+-]+$/;

/** Bengali runs that survive after all content vocabulary is removed. */
function leaksBengali(text: string): string[] {
  if (!BANGLA.test(text)) return [];
  let rest = text;
  for (const entry of [...CONTENT.whole, ...REFERENCE.whole].sort((a, b) => b.length - a.length)) {
    if (entry.length > 1) rest = rest.split(entry).join(' ');
  }
  const runs = rest.match(/[\u0980-\u09FF]+/g) || [];
  return [...new Set(runs)].filter(run => !CONTENT.words.has(run) && !REFERENCE.words.has(run) && !NUMERIC.test(run));
}

function go(label: string) {
  const button = screen
    .getAllByRole('button')
    .find(b => (b.textContent || '').trim().startsWith(label));
  if (!button) throw new Error(`nav item not found: ${label}`);
  act(() => button.click());
}

/**
 * Interface chrome only: the words that label controls and sections. Long prose
 * paragraphs are study content and live in the data modules, so they are covered
 * by the bilingual source test instead.
 */
function chromeStrings(): string[] {
  const view = document.querySelector('.view');
  if (!view) throw new Error('no .view mounted');
  const out: string[] = [];
  const selector = 'button, a[href], h1, h2, h3, h4, label, th, [role="tab"], [role="button"], .eyebrow, .segmented, .nav-item, .tab, .chip';
  for (const el of [view, ...Array.from(view.querySelectorAll(selector))]) {
    for (const attr of ['aria-label', 'placeholder', 'title']) {
      const value = el.getAttribute(attr);
      if (value) out.push(value);
    }
    // Only the element's own text, not its children's, so nested labels differ.
    const own = Array.from(el.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => (node.textContent || '').trim())
      .filter(Boolean)
      .join(' ');
    if (own) out.push(own);
  }
  return out;
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

describe('English mode has no Bengali leakage in the interface', () => {
  it('renders every view in English without falling back to Bengali chrome', async () => {
    const data = freshData();
    data.settings.language = 'en';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(<App />);
    await screen.findAllByText('Home dashboard');

    const failures: string[] = [];
    for (const label of NAV) {
      go(label);
      await waitFor(() => expect(document.querySelector('.view')).toBeTruthy());
      const mounted = document.querySelector('.view') as Element;
      // Wait for the view to render its own heading rather than the previous one.
      await waitFor(() => expect(mounted.textContent && mounted.textContent.length).toBeGreaterThan(40));
      // Body copy counts too: hiding long paragraphs from this sweep is exactly how
      // 51 Bangla-only sentences once survived inside English mode.
      const bodyCopy = Array.from(document.querySelectorAll('.view p, .view small, .view li, .view strong, .view span, .view h1, .view h2, .view h3, .view h4'))
        .map(el => (el.textContent || '').trim())
        .filter(text => text.length > 0);
      for (const text of [...chromeStrings(), ...bodyCopy]) {
        // Split on the separators the UI uses to glue chrome to content, so
        // "One-Shot Class · হাসনাত শুভ্র" is judged by its chrome, not the teacher name.
        const leaked = leaksBengali(text);
        if (leaked.length) failures.push(`${label} → ${leaked.join(' ')}  ⟨${text.slice(0, 60)}⟩`);
      }
    }
    expect(failures).toEqual([]);
  }, 60000);
});

describe('toast messages are translated too', () => {
  it('never ships a Bangla-only notify() call', async () => {
    // Toasts render outside `.view`, so the view sweep cannot see them. Read the
    // source and require every notify() argument to go through t().
    const { readFileSync } = await import('node:fs');
    const sources = readdirSync(join(process.cwd(), 'src'), { recursive: true })
      .filter(name => String(name).endsWith('.ts') || String(name).endsWith('.tsx'))
      .filter(name => !String(name).includes('.test.'))
      .map(name => join(process.cwd(), 'src', String(name)));
    const leaks: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/notify\(\s*'([^'\n]{2,200})'/g)) {
        if (BANGLA.test(match[1]) && !match[1].includes('${')) {
          leaks.push(`${file.split('/src/')[1]}: ${match[1].slice(0, 60)}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
