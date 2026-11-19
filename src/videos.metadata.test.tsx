// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import VideosView from './views/Videos';
import { PlannerContext } from './context';
import type { PlannerContextValue } from './context';
import { freshData } from './planner';
import { CLASS_CATALOG } from './videoCatalog';
import { setLanguage } from './i18n';
beforeEach(() => { setLanguage('en'); sessionStorage.clear(); });
afterEach(cleanup);
it('does not render a bare numeric zero for missing video duration, file size or watch progress', () => {
  const data = freshData(), before = JSON.stringify(data), setData = vi.fn();
  const context = { data, setData, plan: [], today: '2026-11-20', openChapter: vi.fn(), navigate: vi.fn() } as unknown as PlannerContextValue;
  const { container } = render(<PlannerContext.Provider value={context}><VideosView /></PlannerContext.Provider>);
  expect(container.querySelectorAll('.video-card')).toHaveLength(CLASS_CATALOG.length);
  const metas = [...container.querySelectorAll('.video-card-meta')];
  expect(metas.length).toBeGreaterThan(0); expect(metas.every(element => element.textContent?.trim() === '')).toBe(true);
  expect(screen.getByText(/URL structure is checked; not every video/)).toBeTruthy();
  expect(JSON.stringify(data)).toBe(before); expect(setData).not.toHaveBeenCalled();
});
