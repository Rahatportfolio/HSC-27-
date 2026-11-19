/** Read-only diagnostics. These summaries never turn an incomplete gate green.
 * Original reports/raw axe findings remain the source of evidence. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarizeAccessibility(report) {
  assert.ok(report && Array.isArray(report.rows), 'Accessibility report must contain rows');
  const reviews = report.rows.flatMap(row => row.reviews);
  return {
    states: report.rows.length,
    fullRouteMatrix: report.fullRouteMatrix === true,
    violationInstances: report.rows.reduce((sum, row) => sum + row.violations.reduce((n, rule) => n + rule.nodes.length, 0), 0),
    rawIncompleteInstances: report.rows.reduce((sum, row) => sum + row.incomplete.reduce((n, rule) => n + rule.nodes, 0), 0),
    supplementalVerified: reviews.filter(row => row.status === 'verified').length,
    supplementalFailed: reviews.filter(row => row.status === 'failed').length,
    supplementalUnresolved: reviews.filter(row => row.status === 'unresolved').length,
    physicalScreenReaderCertified: false,
    failures: report.rows.filter(row => row.violations.length || row.pageErrors.length || row.reviews.some(review => review.status !== 'verified')).map(row => ({
      name: row.name,
      rawFile: row.rawFile,
      pageErrors: row.pageErrors,
      violations: row.violations.map(rule => ({ id: rule.id, nodes: rule.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) })),
      reviews: row.reviews.filter(review => review.status !== 'verified'),
    })),
  };
}
export function evidenceAnnotation(level, title, value) {
  assert.ok(['notice', 'warning', 'error'].includes(level));
  const escape = text => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  return `::${level} title=${title}::${escape(JSON.stringify(value)).slice(0, 3500)}`;
}
function main(directory) {
  assert.ok(directory, 'Pass a retained built-web evidence directory');
  const read = name => { const file = join(directory, name); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; };
  const report = read('report.json');
  assert.ok(report, 'Built-web report is missing; acceptance is NOT established');
  console.log(evidenceAnnotation('notice', 'Stored exact-source built web checkpoints', { complete: report.complete, productionBuild: report.productionBuild, results: report.results.map(({ script, exitCode, signal }) => ({ script, exitCode, signal })), failure: report.failure, readOnlyInspection: true }));
  const a11y = read('accessibility/report.json');
  if (a11y) {
    const { failures, ...summary } = summarizeAccessibility(a11y);
    console.log(evidenceAnnotation('notice', 'Bounded automated accessibility evidence', summary));
    for (const [index, failure] of failures.entries()) {
      console.log(`Accessibility failing state ${index + 1}: ${JSON.stringify(failure)}`);
      // Annotation limits must not hide the exact failing selector behind a
      // successful tail. All failures remain in the ordinary log and artifact.
      if (index < 8) console.log(evidenceAnnotation('error', `Accessibility failing state ${index + 1}`, failure));
    }
  }
  const study = read('study/report.json');
  if (study) console.log(evidenceAnnotation('notice', 'Real synthetic media and offline PWA checkpoint', study));
  // A diagnostic job's successful retrieval is NOT browser acceptance. Only the
  // original build/native/web jobs can satisfy the fail-closed APK publisher.
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv[2]);
