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

/** Pull the declared colour out of the last rule matching `selector`. */
const colourOf = (selector: string, property = 'color'): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...CSS.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(matches.length, `no rule for ${selector}`).toBeGreaterThan(0);
  const body = matches[matches.length - 1][1];
  const colour = body.match(new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`));
  expect(colour, `no ${property} in ${selector}`).not.toBeNull();
  return colour![1];
};

const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#151f1a';

describe('text keeps WCAG AA contrast', () => {
  it('page heading descriptions are readable on the light surface', () => {
    expect(contrast(colourOf('.page-heading p'), LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it('empty-state body copy is readable on the light surface', () => {
    expect(contrast(colourOf('.empty-state p'), LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
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
    const tokens = CSS.match(/\[data-theme="dark"\]\{([^}]*)\}/);
    expect(tokens).not.toBeNull();
    const body = tokens![1];
    for (const name of ['--ink', '--ink-2', '--muted', '--soft']) {
      const found = body.match(new RegExp(`${name}:(#[0-9a-fA-F]{6})`));
      expect(found, `${name} missing`).not.toBeNull();
      expect(contrast(found![1], DARK_SURFACE), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the HSC countdown number readable in both themes', () => {
    const background = colourOf('.exam-pill-days', 'background');
    expect(contrast(colourOf('.exam-countdown-pill.hsc strong'), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf('[data-theme="dark"] .exam-countdown-pill.hsc strong'), background)).toBeGreaterThanOrEqual(4.5);
  });

  it('never ships an outline:none without a visible focus ring', () => {
    // Every `outline:none` must be paired with a box-shadow ring in the same rule.
    for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*outline:(?:none|0)[^{}]*)\}/g)) {
      expect(rule[2], `focus ring missing in ${rule[1].trim().slice(0, 60)}`).toMatch(/box-shadow|border-color/);
    }
  });
});
