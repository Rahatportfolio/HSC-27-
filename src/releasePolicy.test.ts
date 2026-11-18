import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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
});
