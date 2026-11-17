// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ProgressRing } from './components';
import { TIMER_KEY } from './hooks';
import { freshData, STORAGE_KEY } from './planner';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
  localStorage.clear();
  const data = freshData();
  data.settings.language = 'en';
  data.settings.fontScale = 'lg';
  data.notes['2026-11-15'] = 'Do not clear notes while repairing the shell';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.location.hash = '#today';
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function go(view: string) {
  await act(async () => { window.location.hash = view; window.dispatchEvent(new HashChangeEvent('hashchange')); });
}

describe('reported mobile clipping and missing clock regressions', () => {
  it('gives the home progress panel a dedicated padded-card layout', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Syllabus progress' }).classList.contains('home-progress-card')).toBe(true);
  });

  it('does not reserve a live timer banner when no session is active', () => {
    render(<App />);
    expect(document.querySelector('.live-timer-topbar')).toBeNull();
  });

  it('keeps a named ticking timer reachable after navigation and pause without resetting data', async () => {
    render(<App />);
    await go('timer');
    await act(async () => { (document.querySelector('.timer-main-button') as HTMLButtonElement).click(); });
    await act(async () => { vi.advanceTimersByTime(2500); });
    await go('today');
    const bar = screen.getByRole('status', { name: 'Active study timer' });
    expect(bar.querySelector('.elapsed strong')?.textContent).toBe('00:02');
    const clock = localStorage.getItem(TIMER_KEY);
    await act(async () => { within(bar).getByRole('button', { name: 'Open study timer' }).click(); });
    expect(document.querySelector('.timer-view')).not.toBeNull();
    expect(localStorage.getItem(TIMER_KEY)).toBe(clock);
    await act(async () => { within(bar).getByRole('button', { name: 'Pause' }).click(); });
    const paused = bar.querySelector('.remaining strong')?.textContent;
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(bar.querySelector('.remaining strong')?.textContent).toBe(paused);
    expect(bar.classList.contains('paused')).toBe(true);
    expect(document.documentElement.dataset.font).toBe('lg');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(saved.notes['2026-11-15']).toBe('Do not clear notes while repairing the shell');
    expect(saved.settings.startDate).toBe('2026-11-20');
  });

  it('updates focus/scroll clearance when timer or bottom navigation height changes', () => {
    let resize: (() => void) | undefined;
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    let height = 180;
    const rect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('top-chrome-stack')) return { height } as DOMRect;
      if (this.classList.contains('mobile-bottom-nav')) return { height: 92 } as DOMRect;
      return rect.call(this);
    });
    const app = render(<App />);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(document.documentElement.style.getPropertyValue('--top-chrome-height')).toBe('180px');
    expect(document.documentElement.style.getPropertyValue('--bottom-chrome-height')).toBe('92px');
    height = 220;
    act(() => resize?.());
    expect(document.documentElement.style.getPropertyValue('--top-chrome-height')).toBe('220px');
    app.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(document.documentElement.style.getPropertyValue('--top-chrome-height')).toBe('');
  });

  it('scales the decorative ring into the resized mobile SVG viewport', () => {
    const { container } = render(<ProgressRing value={25} size={270}><strong>02:00:00</strong></ProgressRing>);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 270 270');
  });

  it('installs the splash theme before edge-to-edge can inflate native chrome', () => {
    const activity = source('android/app/src/main/java/com/prostuti/hsc27/MainActivity.java');
    const installed = activity.indexOf('SplashScreen.installSplashScreen(this);');
    expect(installed).toBeGreaterThanOrEqual(0);
    expect(installed).toBeLessThan(activity.indexOf('EdgeToEdge.enable(this);'));
    expect(installed).toBeLessThan(activity.indexOf('super.onCreate(savedInstanceState);'));
  });

  it('does not use the full splash picture as a persistent view/action-bar background', () => {
    const styles = source('android/app/src/main/res/values/styles.xml');
    const launch = styles.match(/<style name="AppTheme.NoActionBarLaunch"[\s\S]*?<\/style>/)?.[0] || '';
    expect(launch).toContain('<item name="windowActionBar">false</item>');
    expect(launch).toContain('<item name="windowNoTitle">true</item>');
    expect(launch).toContain('<item name="windowSplashScreenAnimatedIcon">');
    expect(launch).not.toMatch(/name="android:background">@drawable\/splash/);
    expect(launch).toContain('<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>');
  });
});
