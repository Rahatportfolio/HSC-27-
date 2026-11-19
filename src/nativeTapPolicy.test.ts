import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('../android/app/src/androidTest/java/com/prostuti/hsc27/MobileShellInstrumentedTest.java', import.meta.url), 'utf8');
const tap = source.slice(source.indexOf('  private void tap('), source.indexOf('  @Test', source.indexOf('  private void tap(')));
// Execute the actual Java-embedded browser expression, including its string
// decoding, rather than testing a second implementation of coordinate policy.
const measurement = tap.slice(tap.indexOf('    JSONObject point = object(web,'), tap.indexOf('\n    );', tap.indexOf('    JSONObject point = object(web,')));
const expression = [...measurement.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0]) as string).join('');

type Box = { left: number; top: number; width: number; height: number };
function measure(options: { zoomLocal?: boolean; android?: boolean; covered?: boolean; centreCovered?: boolean; disabled?: boolean; height?: number; unknownOffset?: boolean } = {}) {
  const zoom = 1.06, rect: Box = { left: 200, top: 500, width: 30, height: 20 };
  const actual = Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, options.zoomLocal ? value * zoom : value])) as Box;
  if (options.unknownOffset) { actual.left += 10; actual.top += 7; }
  const blocker = { tagName: 'DIV', className: 'overlay', outerHTML: '<div class="overlay"></div>' };
  const element = { getBoundingClientRect: () => rect, parentElement: { zoom, parentElement: null }, zoom: 1, disabled: !!options.disabled, contains: () => false, tagName: 'BUTTON', className: 'native-target', outerHTML: '<button>3h</button>' };
  return runInNewContext(expression, {
    navigator: { userAgent: options.android === false ? 'Desktop Chrome' : 'Android WebView' },
    innerWidth: 320, innerHeight: options.height ?? 800,
    getComputedStyle: (node: { zoom: number }) => ({ zoom: String(node.zoom) }),
    document: {
      querySelector: () => element,
      elementFromPoint: (x: number, y: number) => {
        if (options.covered || options.centreCovered && Math.abs(x - (actual.left + actual.width / 2)) < 0.1) return blocker;
        return x >= actual.left && x <= actual.left + actual.width && y >= actual.top && y <= actual.top + actual.height ? element : blocker;
      },
    },
  }) as { hit: boolean; method: string; disabled: boolean; x: number; y: number; probes: { exposed: boolean }[] };
}

it('uses ordinary viewport coordinates whenever all three actual control points are exposed', () => {
  const point = measure(); expect(point.hit).toBe(true); expect(point.method).toBe('viewport DOMRect');
});
it('accepts a zoom-adjusted Android coordinate space only with three matching hit tests', () => {
  const point = measure({ zoomLocal: true });
  expect(point.hit).toBe(true); expect(point.method).toBe('verified Android CSS-zoom coordinates');
  expect(point.probes.map(probe => probe.exposed)).toEqual([false, true]);
  expect(point.x).toBeCloseTo(215 * 1.06); expect(point.y).toBeCloseTo(510 * 1.06);
});
it('does not apply Android coordinate calibration on desktop', () => {
  expect(measure({ zoomLocal: true, android: false }).hit).toBe(false);
});
it('still rejects a genuinely covered button in every coordinate space', () => {
  expect(measure({ zoomLocal: true, covered: true }).hit).toBe(false);
});
it('does not use calibration to sidestep a covered ordinary centre', () => {
  expect(measure({ centreCovered: true }).hit).toBe(false);
});
it('rejects offscreen controls even when the synthetic hit test returns the element', () => {
  expect(measure({ height: 505 }).hit).toBe(false);
});
it('retains disabled-state evidence and requires native rejection before any pointer injection', () => {
  expect(measure({ disabled: true }).disabled).toBe(true);
  expect(tap.indexOf('assertFalse("Tap target is disabled')).toBeLessThan(tap.indexOf('sendPointerSync(down)'));
  expect(tap).not.toContain('.click()');
});
it('fails closed for an unproved geometry offset instead of searching for an arbitrary clickable pixel', () => {
  expect(measure({ unknownOffset: true }).hit).toBe(false);
});
it('requires awake/unlocked test-device preconditions without bypassing real app-window focus', () => {
  const workflow = readFileSync(new URL('../.github/workflows/android-apk.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('adb shell svc power stayon true');
  expect(workflow).toContain('adb shell input keyevent KEYCODE_WAKEUP');
  expect(workflow).toContain('adb shell wm dismiss-keyguard');
  expect(source).toContain('power.isInteractive()');
  expect(source).toContain('keyguard.isKeyguardLocked()');
  expect(source).toContain('web.hasWindowFocus()');
  expect(source).toContain('refusing an unowned screen tap');
});

it('suppresses unrelated system ANR dialogs on the disposable emulator without weakening app assertions', () => {
  const workflow = readFileSync(new URL('../.github/workflows/android-apk.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('adb shell settings put global hide_error_dialogs 1');
  expect(workflow).toContain('adb shell settings put global anr_show_background 0');
  // The focus precondition itself must stay: no window owner means no tap.
  expect(source).toContain('waitForFocusedWindow(web);');
  expect(source).toContain('fail("App window never gained input focus');
});

it('diagnoses the focused window without relying on a shell pipe UiAutomation cannot parse', () => {
  const shellCommands = [...source.matchAll(/shell\(((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)\)/g)].map(match => match[1]);
  expect(shellCommands.length).toBeGreaterThan(0);
  for (const command of shellCommands) expect(command).not.toContain('|');
  expect(source).toContain('focusedWindowLines(shell("dumpsys window"))');
  expect(source).toContain('mTopFocusedDisplayId');
});
