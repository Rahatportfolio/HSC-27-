import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import capacitor from '../capacitor.config';
import vite from '../vite.config';

describe('startup compatibility fails safely before opening student data', () => {
  it('aligns Android WebView minimum with the explicit Chrome production target', () => {
    expect(capacitor.android?.minWebViewVersion).toBe(107);
    expect(vite.build?.target).toContain(`chrome${capacitor.android?.minWebViewVersion}`);
    expect(capacitor.server?.errorPath).toBe('recovery.html');
    expect(capacitor.server?.url).toBeUndefined();
  });
  it('keeps capability checks before React mounts a profile, including all unpolyfilled newer APIs', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    const checks = main.indexOf('const supported =');
    expect(checks).toBeGreaterThan(0);
    expect(checks).toBeLessThan(main.indexOf('ReactDOM.createRoot'));
    expect(main.slice(checks)).toContain("typeof Array.prototype.at === 'function'");
    expect(main.slice(checks)).toContain("typeof Object.hasOwn === 'function'");
    expect(main.slice(checks)).toContain("typeof structuredClone === 'function'");
    expect(main).toContain('if (supported) ReactDOM.createRoot');
  });
  it('keeps genuine native onboarding and standalone recovery in the fresh-install instrumentation path', () => {
    const native = readFileSync('android/app/src/androidTest/java/com/prostuti/hsc27/MobileShellInstrumentedTest.java', 'utf8');
    const firstLaunch = native.slice(native.indexOf('public void a_launch'), native.indexOf('private String syntheticProfile'));
    expect(firstLaunch).toContain('completeFreshSetupAndRecover(scenario, ref.get())');
    expect(firstLaunch).toContain('Three sessions for every chapter');
    expect(firstLaunch).toContain('assertEquals(114, routine.getJSONArray("chapterIds").length())');
    expect(firstLaunch).toContain('personal-workload-editor .personal-shortlist-actions button:nth-child');
    expect(firstLaunch).toContain('new-student-setup-restart');
    expect(firstLaunch).toContain('new-student-independent-recovery');
    expect(firstLaunch).toContain('scenario.recreate()');
    expect(firstLaunch).not.toContain('loadSyntheticProfile');
    expect(firstLaunch).not.toContain('localStorage.setItem');
  });
  it('requires startup, dates, full media backup, field interaction and follow-up journeys in the same unfiltered production gate', () => {
    const gate = readFileSync('scripts/check-built-web.ts', 'utf8');
    for (const script of ['test:startup-recovery', 'test:date-browser', 'test:post-release-browser', 'test:input-accessibility', 'test:followup-browser']) expect(gate).toContain(`'${script}'`);
    expect(gate).toContain('requireFullBrowserEnvironment(process.env)');
  });
});
