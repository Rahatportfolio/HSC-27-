import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workflow = () => read('.github/workflows/android-apk.yml');

function collectFixture(tag: boolean, withRelease = true) {
  const step = workflow().split('      - name: Collect artifacts\n')[1]?.split('\n      - name:')[0];
  const script = step?.split('        run: |\n')[1]?.split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
  expect(script).toBeTruthy();
  const root = mkdtempSync(join(tmpdir(), 'prostuti-artifact-control-'));
  const files: Record<string, string> = { 'debug/app-debug.apk': 'debug-only' };
  if (withRelease) files['release/app-release.apk'] = 'signed-release';
  try {
    for (const [path, bytes] of Object.entries(files)) {
      const full = join(root, 'android/app/build/outputs/apk', path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, bytes);
    }
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script!], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, GITHUB_REF: tag ? 'refs/tags/v2.44.0' : 'refs/heads/arena/test', GITHUB_REF_NAME: tag ? 'v2.44.0' : 'arena/test' },
    });
    if (result.error) throw result.error;
    const assets = Object.fromEntries(readdirSync(join(root, 'artifacts')).map(name => [name, readFileSync(join(root, 'artifacts', name), 'utf8')]));
    return { status: result.status, assets, diagnostics: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('release metadata and publication safety', () => {
  it('keeps the Android, package and lockfile versions aligned', () => {
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    const android = read('android/app/build.gradle');
    expect(android.match(/versionName\s+"([^"]+)"/)?.[1]).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  it('increments the Android version code beyond the published v2.43.0 code', () => {
    const code = Number(read('android/app/build.gradle').match(/versionCode\s+(\d+)/)?.[1]);
    expect(Number.isSafeInteger(code)).toBe(true);
    expect(code).toBeGreaterThan(23);
  });

  it('attaches tagged APKs as drafts rather than publishing before dependent device checks', () => {
    const workflow = read('.github/workflows/android-apk.yml');
    const attach = workflow.split('      - name: Attach APK to GitHub Release\n')[1]?.split('\n  device-checks:')[0];
    expect(attach).toBeTruthy();
    expect(attach).toMatch(/\n          draft: true(?:\n|$)/);
    expect(workflow).toMatch(/device-checks:[\s\S]*?needs: apk/);
  });

  it('requires signing inputs before a tagged APK build and tests the release guards', () => {
    const text = workflow();
    const guard = text.split('      - name: Require original signing key for tags\n')[1]?.split('\n      - name:')[0];
    expect(guard).toBeTruthy();
    expect(guard).toContain("if: startsWith(github.ref, 'refs/tags/v')");
    expect(guard).toContain('node scripts/check-android-release.mjs signing-inputs');
    expect(text.indexOf('name: Require original signing key for tags')).toBeLessThan(text.indexOf('name: Build debug APK'));
    const tests = text.split('      - name: Release safety guard tests\n')[1]?.split('\n      - name:')[0];
    expect(tests).toContain('node --test scripts/check-android-release.node-test.mjs scripts/verify-release-asset.node-test.mjs');
  });

  it('collects the signed release rather than the debug APK for a tag', () => {
    const result = collectFixture(true);
    expect(result.status, result.diagnostics).toBe(0);
    expect(result.assets).toEqual({ 'prostuti-hsc27-v2.44.0.apk': 'signed-release' });
  });

  it('rejects a tag without a signed release even when a debug APK exists', () => {
    const result = collectFixture(true, false);
    expect(result.status).not.toBe(0);
    expect(result.assets).toEqual({});
  });

  it('labels contributor debug APK artifacts and keeps unsigned contributor builds usable', () => {
    const result = collectFixture(false, false);
    expect(result.status, result.diagnostics).toBe(0);
    expect(result.assets).toEqual({ 'prostuti-hsc27-arena-test-debug.apk': 'debug-only' });
  });

  it('requires exact-asset signing continuity after both native jobs and retains failed audit evidence', () => {
    const concurrency = workflow().split('\nconcurrency:\n')[1]?.split('\njobs:\n')[0];
    expect(concurrency).toContain("github.event_name == 'workflow_dispatch' && inputs.audit_release != '' && 'audit' || 'build'");
    const audit = workflow().split('\n  artifact-audit:\n')[1];
    expect(audit).toBeTruthy();
    const trigger = audit.split('\n    runs-on:')[0];
    expect(trigger).toContain('needs: [apk, device-checks]');
    expect(trigger).toContain('always()');
    expect(trigger).toContain("github.event_name == 'workflow_dispatch'");
    expect(trigger).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(trigger).toContain("needs.apk.result == 'success'");
    expect(trigger).toContain("needs['device-checks'].result == 'success'");
    expect(audit).toContain("AUDIT_PREVIOUS_TAG: ${{ inputs.audit_previous || 'v2.43.0' }}");
    expect(audit).toContain('node scripts/check-android-release.mjs compatible-update release-asset-verification.json');
    const save = audit.split('      - name: Save inspection evidence\n')[1];
    expect(save).toContain('if: always()');
  });
});
