import { describe, expect, it } from 'vitest';
import { appendBrowserLog, BROWSER_LOG_TAIL_LIMIT, browserFailureAnnotation, requireFullBrowserEnvironment } from '../scripts/builtWebPolicy';

describe('full built-web acceptance cannot silently become a subset or fault run', () => {
  it.each([
    'A11Y_ROUTES', 'A11Y_SCENARIOS', 'A11Y_DIALOGS', 'A11Y_EXAM_STATES_ONLY', 'A11Y_FAULT',
    'RESPONSIVE_ROUTES', 'RESPONSIVE_PROFILES', 'RESPONSIVE_SCENARIOS', 'RESPONSIVE_FAULT',
    'MOBILE_CASE', 'MOBILE_VIEWPORT', 'MOBILE_MUTATION', 'DATE_SHORTCUT_ONLY', 'DATE_SHORTCUT_FAULT',
    'INPUT_A11Y_SCENARIOS', 'INPUT_A11Y_ROUTES', 'INPUT_A11Y_CHECKS', 'INPUT_A11Y_FAULT',
    'FOLLOWUP_SCENARIOS', 'FOLLOWUP_REVIEW_ONLY', 'FOLLOWUP_BROWSER_FAULT',
  ])('rejects %s before starting the preview', key => {
    expect(() => requireFullBrowserEnvironment({ [key]: '320' })).toThrow(`Remove subset/fault filter ${key}`);
    expect(() => requireFullBrowserEnvironment({ [key]: '' })).toThrow(`Remove subset/fault filter ${key}`);
  });
  it('allows normal runtime, evidence and explicit supplemental-review settings', () => {
    expect(() => requireFullBrowserEnvironment({ CHROMIUM_PATH: '/installed/chrome', WEB_BROWSER_OUTPUT: '.cache/test', REVIEW_INCOMPLETE: '1', A11Y_REVIEW_INCOMPLETE: '1', A11Y_SCREENSHOTS: '1' })).not.toThrow();
  });
});

describe('bounded Actions failure evidence', () => {
  it('retains the most recent child output, not an unbounded in-memory log', () => {
    let tail = appendBrowserLog('', 'x'.repeat(BROWSER_LOG_TAIL_LIMIT * 2));
    tail = appendBrowserLog(tail, '\nAssertion: actual expected\n');
    expect(tail).toHaveLength(BROWSER_LOG_TAIL_LIMIT);
    expect(tail.endsWith('\nAssertion: actual expected\n')).toBe(true);
  });
  it('preserves a child assertion and escapes line breaks and percent commands', () => {
    const result = browserFailureAnnotation('test:personal-browser failed', '50%\r\n::warning::not a command');
    expect(result).toContain('test:personal-browser failed');
    expect(result).toContain('50%25%0D%0A::warning::not a command');
    expect(result).not.toMatch(/[\r\n]/);
    expect(result.startsWith('::error title=Built web acceptance failed::')).toBe(true);
  });
  it('cannot exceed the workflow annotation cap even for escape-heavy output', () => {
    const result = browserFailureAnnotation('failure', '\n%'.repeat(10_000));
    expect(result.length).toBeLessThan(4096);
    expect(result).not.toMatch(/[\r\n]/);
  });
});
