import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contrast guard.
 *
 * The muted greys in this design are easy to nudge lighter while polishing, and
 * a 3:1 grey on a near-white surface looks fine on a bright monitor but fails
 * WCAG AA for the body copy it is used for. These ratios are computed from the
 * same values the stylesheet ships.
 */

const CSS = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');

const luminance = (hex: string): number => {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16) / 255);
  const linear = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (foreground: string, background: string): number => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** Resolve semantic tokens from every applicable root block, in cascade order.
 * This is still a narrow declaration guard, not a replacement for Chromium. */
const resolveColour = (value: string, dark: boolean, seen = new Set<string>()): string => {
  const cleaned = value.replace(/\s*!important\s*$/, '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned;
  const variable = cleaned.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  expect(variable, `Unsupported colour: ${cleaned}`).not.toBeNull();
  const name = variable![1]; expect(seen.has(name), `Circular token: ${name}`).toBe(false); seen.add(name);
  const tokens = new Map<string, string>();
  const blocks = [...CSS.matchAll(/(?:^|\n)(:root|\[data-theme="dark"\])\s*\{([^}]*)\}/g)];
  for (const theme of dark ? [':root', '[data-theme="dark"]'] : [':root']) for (const block of blocks.filter(block => block[1] === theme)) {
    for (const declaration of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) tokens.set(declaration[1], declaration[2]);
  }
  const resolved = tokens.get(name) || variable![2]; expect(resolved, `Missing token: ${name}`).toBeTruthy();
  return resolveColour(resolved!, dark, seen);
};

/** Pull the last exact-selector declaration, including var() references. */
const colourOf = (selector: string, property = 'color', dark = selector.startsWith('[data-theme="dark"]')): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...CSS.matchAll(new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(matches.length, `no rule for ${selector}`).toBeGreaterThan(0);
  const declarations = matches.flatMap(match => [...match[1].matchAll(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, 'g'))]);
  const colour = declarations.at(-1);
  expect(colour, `no ${property} in ${selector}`).toBeDefined();
  return resolveColour(colour![1], dark);
};

const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#151f1a';

describe('text keeps WCAG AA contrast', () => {
  it('page heading descriptions are readable on the light surface', () => {
    expect(contrast(colourOf('.page-heading p'), LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf('.page-heading p', 'color', true), DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it('empty-state body copy is readable on the light surface', () => {
    expect(contrast(colourOf('.empty-state p'), LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf('.empty-state p', 'color', true), DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it('placeholders are readable in both themes', () => {
    // The base rule is the one that does not start with a theme prefix.
    const lightBlocks = [...CSS.matchAll(/(?:^|\n)([^{}\n]*(?:input|textarea)::placeholder[^{}]*)\{([^}]*)\}/g)]
      .filter(match => !match[1].includes('data-theme'));
    expect(lightBlocks.length, 'no base placeholder rule').toBeGreaterThan(0);
    const light = lightBlocks[lightBlocks.length - 1][2].match(/color:(#[0-9a-fA-F]{6})/)![1];
    expect(contrast(light, LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
    // Cascade: the last matching declaration is the one that actually paints.
    const darkRules = [...CSS.matchAll(/\[data-theme="dark"\][^{}]*input::placeholder[^{}]*\{color:(#[0-9a-fA-F]{6})/g)];
    expect(darkRules.length).toBeGreaterThan(0);
    const dark = darkRules[darkRules.length - 1][1];
    expect(contrast(dark, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it('the dark-theme secondary tokens clear AA on their surfaces', () => {
    for (const name of ['--ink', '--ink-2', '--muted', '--soft']) {
      expect(contrast(resolveColour(`var(${name})`, true), DARK_SURFACE), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the HSC countdown number readable in both themes', () => {
    const background = colourOf('.exam-pill-days', 'background');
    expect(contrast(colourOf('.exam-countdown-pill.hsc strong'), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf('[data-theme="dark"] .exam-countdown-pill.hsc strong'), background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps answered quiz feedback and completion copy readable', () => {
    for (const [selector, background] of [['.quiz-feedback.ok', '#f2f8ea'], ['.quiz-result', '#f5f9ee'], ['.quiz-result strong', '#f5f9ee'], ['.quiz-perfect', '#f5f9ee']]) {
      expect(contrast(colourOf(selector), background), selector).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(colourOf('.quiz-result strong', 'color', true), '#1c2d21')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf('.quiz-perfect', 'color', true), '#1c2d21')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps result guidance readable against its actual light and dark background', () => {
    for (const dark of [false, true]) expect(contrast(colourOf('.exam-postmortem-next', 'color', dark), colourOf('.exam-postmortem-next', 'background', dark))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([false, true])('keeps every wrong-answer detail readable on its actual surface (dark=%s)', dark => {
    const background = colourOf('.exam-wrong-row', 'background', dark);
    // Body copy inherits the theme's ink; feedback, explanation and action have
    // their own foregrounds. Check each pair, not just the question heading.
    const foregrounds = [
      ['question and answer label', resolveColour('var(--ink)', dark)],
      ['explanation', colourOf('.exam-wrong-row small', 'color', dark)],
      ['selected wrong answer', colourOf('.exam-wrong-row p em', 'color', dark)],
      ['correct answer', colourOf('.exam-wrong-row p.correct', 'color', dark)],
      ['chapter action', colourOf('.text-button', 'color', dark)],
      ['hovered chapter action', colourOf('.text-button:hover', 'color', dark)],
    ];
    for (const [copy, foreground] of foregrounds) expect(contrast(foreground, background), copy).toBeGreaterThanOrEqual(4.5);
  });

  it.each([false, true])('keeps unanswered-question copy and explanation readable (dark=%s)', dark => {
    const background = colourOf('.exam-wrong-row.unanswered', 'background', dark);
    expect(contrast(resolveColour('var(--ink)', dark), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf('.exam-wrong-row small', 'color', dark), background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps light shell secondary labels readable when desktop and landscape expose them', () => {
    const labels = '.breadcrumb,.global-search,.nav-section-label,.sidebar-profile div>span,.brand small';
    expect(contrast(colourOf(labels), '#fcfdfa')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the desktop sidebar encouragement readable on its pale card', () => {
    const background = colourOf('.dream-card', 'background');
    expect(contrast(colourOf('.dream-card p'), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf('.dream-card>span'), background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps wide Golden next-grade guidance readable in both themes', () => {
    for (const dark of [false, true]) {
      const background = colourOf(dark ? '[data-theme="dark"] .golden-strip' : '.golden-strip', 'background');
      expect(contrast(colourOf('.golden-next', 'color', dark), background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the mistake-book tip readable on its white card', () => {
    expect(contrast(colourOf('.mistake-tip p'), LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps inactive library tab counts readable on their light badge', () => {
    expect(contrast(colourOf('.tab-count'), colourOf('.tab-count', 'background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a single profile initial readable even when axe cannot classify short text', () => {
    for (const selector of ['.avatar,.topbar-avatar', '[data-theme="dark"] .avatar,[data-theme="dark"] .topbar-avatar']) {
      expect(contrast(colourOf(selector), colourOf(selector, 'background'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps single-digit syllabus summary totals readable in the dark theme', () => {
    // The summary’s surface is grouped with several dark cards. Match that
    // selector explicitly instead of accidentally testing the white card below.
    const darkSurface = CSS.match(/\[data-theme="dark"\] \.syllabus-summary[^{}]*\{background:(#[0-9a-fA-F]{6})/)!;
    expect(darkSurface).not.toBeNull();
    expect(contrast(colourOf('.syllabus-summary strong', 'color', true), darkSurface[1])).toBeGreaterThanOrEqual(4.5);
  });

  it.each([false, true])('keeps the day-note placeholder readable despite its more specific override (dark=%s)', dark => {
    // The generic input::placeholder guard cannot detect a more specific rule.
    const background = dark ? '#151f1a' : '#fbfcf8';
    expect(contrast(colourOf('.note-card textarea::placeholder', 'color', dark), background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([false, true])('keeps the shared keyboard focus outline distinguishable from the adjacent surface (dark=%s)', dark => {
    const selector = 'button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible';
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    expect(rule).not.toBeNull();
    const outline = rule![1].match(/outline:\s*([\d.]+)px\s+solid\s+([^;]+)/);
    expect(outline).not.toBeNull();
    expect(Number(outline![1])).toBeGreaterThanOrEqual(2);
    expect(contrast(resolveColour(outline![2], dark), dark ? DARK_SURFACE : LIGHT_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it.each([false, true])('keeps native form controls on the selected theme rather than the operating-system theme (dark=%s)', dark => {
    const blocks = [...CSS.matchAll(/(?:^|\n)(:root|\[data-theme="dark"\])\s*\{([^}]*)\}/g)];
    let scheme: string | undefined;
    for (const theme of dark ? [':root', '[data-theme="dark"]'] : [':root']) {
      for (const block of blocks.filter(block => block[1] === theme)) {
        for (const declaration of block[2].matchAll(/(?:^|;)\s*color-scheme:\s*([^;{}]+)/g)) scheme = declaration[1].trim();
      }
    }
    expect(scheme).toBe(dark ? 'dark' : 'light');
  });

  it('never leaves text, focus rings or card surfaces on unresolved CSS tokens', () => {
    const declared = new Set([...CSS.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
    // Only these are supplied by per-component inline styles rather than a theme.
    const componentTokens = new Set(['--subject', '--subject-tint', '--phase-color']);
    const missing = [...CSS.matchAll(/var\((--[\w-]+)\s*\)/g)].map(match => match[1]).filter(name => !declared.has(name) && !componentTokens.has(name));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('never ships an outline:none without a visible focus ring', () => {
    // Every `outline:none` must be paired with a box-shadow ring in the same rule.
    for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*outline:(?:none|0)[^{}]*)\}/g)) {
      expect(rule[2], `focus ring missing in ${rule[1].trim().slice(0, 60)}`).toMatch(/box-shadow|border-color/);
    }
  });
});
