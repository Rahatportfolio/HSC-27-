// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RouteBoundary, RouteLoading } from './routeViews';
import { setLanguage } from './i18n';
beforeEach(() => { setLanguage('en'); localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('announces a pending page without pretending the optional view has rendered', () => {
  const { container } = render(<RouteLoading title="Study Brain" />);
  expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true'); expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Study Brain'); expect(container.querySelector('.view')).toBeNull(); expect(localStorage.length).toBe(0);
});
it('a failed optional route preserves data and offers working independent recovery actions', () => {
  const raw = '{"private":"keep every byte"}'; localStorage.setItem('retained-profile', raw);
  const home = vi.fn(), settings = vi.fn(), backup = vi.fn(); vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken(): never { throw new Error('Simulated unavailable optional chunk'); }
  render(<RouteBoundary onHome={home} onSettings={settings} onBackup={backup}><Broken /></RouteBoundary>);
  expect(screen.getByRole('alert').textContent).toContain('Your saved data has not been erased'); expect(screen.getByText(/not original scan\/video bytes/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Keep a JSON backup' })); fireEvent.click(screen.getByRole('button', { name: 'Back to home' })); fireEvent.click(screen.getByRole('button', { name: 'Settings & backup' }));
  expect(backup).toHaveBeenCalledOnce(); expect(home).toHaveBeenCalledOnce(); expect(settings).toHaveBeenCalledOnce(); expect(localStorage.getItem('retained-profile')).toBe(raw);
});
it('a healthy route renders normally without invoking recovery callbacks', () => {
  const callback = vi.fn(); render(<RouteBoundary onHome={callback} onSettings={callback} onBackup={callback}><h1>A healthy route</h1></RouteBoundary>); expect(screen.getByRole('heading').textContent).toBe('A healthy route'); expect(screen.queryByRole('alert')).toBeNull(); expect(callback).not.toHaveBeenCalled();
});
