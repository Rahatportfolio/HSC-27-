import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAccessibility, evidenceAnnotation } from './summarize-browser-evidence.mjs';

const row = overrides => ({ name: '320-light-en/question', rawFile: 'raw/question.json', violations: [], incomplete: [{ id: 'color-contrast', nodes: 1 }], pageErrors: [], reviews: [{ rule: 'color-contrast', target: ['.quiz-option span'], status: 'verified', method: 'measured' }], ...overrides });
test('summarizes all original counts without treating incomplete findings as violations', () => {
  const summary = summarizeAccessibility({ fullRouteMatrix: true, rows: [row({})] });
  assert.equal(summary.states, 1); assert.equal(summary.rawIncompleteInstances, 1);
  assert.equal(summary.supplementalVerified, 1); assert.equal(summary.violationInstances, 0);
  assert.deepEqual(summary.failures, []); assert.equal(summary.fullRouteMatrix, true);
  assert.equal(summary.physicalScreenReaderCertified, false);
});
test('preserves an unresolved target, reason and all geometry instead of reporting only the final passing states', () => {
  const unresolved = { rule: 'color-contrast', target: ['.quiz-option span'], status: 'unresolved', method: 'clipped text', detail: { text: 'Actual long answer', clipped: true, blocker: '.footer', points: [{ x: 1, exposed: false }] } };
  const report = { rows: [row({ reviews: [unresolved] }), row({})] }, original = JSON.stringify(report);
  const summary = summarizeAccessibility(report);
  assert.equal(summary.supplementalUnresolved, 1); assert.equal(summary.supplementalVerified, 1);
  assert.deepEqual(summary.failures[0].reviews, [unresolved]);
  assert.equal(summary.failures[0].rawFile, 'raw/question.json');
  assert.equal(JSON.stringify(report), original);
});
test('includes contrast failures, raw violations and page exceptions independently', () => {
  const summary = summarizeAccessibility({ rows: [row({ reviews: [{ status: 'failed', target: ['.faint'] }], violations: [{ id: 'label', nodes: [{ target: ['input'], failureSummary: 'Needs label' }] }], pageErrors: ['Actual exception'] })] });
  assert.equal(summary.supplementalFailed, 1); assert.equal(summary.violationInstances, 1);
  assert.deepEqual(summary.failures[0].pageErrors, ['Actual exception']);
  assert.deepEqual(summary.failures[0].violations[0].nodes[0].target, ['input']);
});
test('does not label a filtered matrix full and rejects a missing original report', () => {
  assert.equal(summarizeAccessibility({ rows: [] }).fullRouteMatrix, false);
  assert.throws(() => summarizeAccessibility(null), /must contain rows/);
});
test('bounds and escapes GitHub diagnostic commands without granting acceptance', () => {
  const annotation = evidenceAnnotation('error', 'Accessibility failing state 1', { target: ['x%\n::notice::no'], detail: 'a'.repeat(6000) });
  assert.ok(annotation.length < 3600); assert.ok(annotation.includes('%25'));
  assert.equal(annotation.split('\n').length, 1); assert.ok(annotation.startsWith('::error '));
  assert.throws(() => evidenceAnnotation('success', 'bad', {}));
});
