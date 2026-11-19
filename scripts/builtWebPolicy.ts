/** Fail-closed full-browser acceptance inputs and bounded public diagnostics. */
import assert from 'node:assert/strict';

export function requireFullBrowserEnvironment(env: NodeJS.ProcessEnv): void {
  // A present-but-empty selector is rejected too: the command must be clearly
  // unfiltered, not depend on each child's interpretation of an empty string.
  for (const key of Object.keys(env)) {
    assert(!/^(?:A11Y_(?:ROUTES|SCENARIOS|DIALOGS|EXAM_STATES_ONLY|FAULT)|RESPONSIVE_(?:ROUTES|PROFILES|SCENARIOS|FAULT)|MOBILE_(?:CASE|VIEWPORT|MUTATION))$/.test(key), `Remove subset/fault filter ${key} for full built-web acceptance`);
  }
}

export const BROWSER_LOG_TAIL_LIMIT = 16_384;
export const appendBrowserLog = (tail: string, text: string): string => (tail + text).slice(-BROWSER_LOG_TAIL_LIMIT);

export function browserFailureAnnotation(failure: string, logTail = ''): string {
  // Only synthetic test output; keep annotations below GitHub's message cap.
  // Escape command delimiters before emitting a child's text into Actions.
  const message = `${failure}${logTail ? `\nChild output:\n${logTail.slice(-2400)}` : ''}`
    .replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A').slice(0, 3500);
  return `::error title=Built web acceptance failed::${message}`;
}
