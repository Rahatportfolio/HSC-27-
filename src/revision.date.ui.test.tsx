// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlannerContextValue } from './context';
import { CHAPTERS } from './data';
import { setLanguage } from './i18n';
import { buildPlan, formatDate, freshData } from './planner';

const state = vi.hoisted(() => ({ context: null as unknown as PlannerContextValue }));
vi.mock('./context', () => ({ usePlanner: () => state.context }));
import RevisionView from './views/Revision';
afterEach(cleanup);

it('shows the Bangladesh date of a late-night completed revision in history', () => {
  setLanguage('en');
  const data = freshData();
  const chapter = CHAPTERS[0];
  data.revisions.push({ id: 'late', chapterId: chapter.id, subject: chapter.subject, interval: 1, dueDate: '2026-11-13', createdAt: '2026-11-12T00:00:00Z', completedAt: '2026-11-13T20:00:00Z' });
  state.context = { data, plan: buildPlan(), today: '2026-11-14', setData: vi.fn(), notify: vi.fn(), confirm: vi.fn(), navigate: vi.fn(), openChapter: vi.fn(), startTimer: vi.fn() } as unknown as PlannerContextValue;
  render(<RevisionView />);
  fireEvent.click(screen.getByRole('button', { name: /History/ }));
  expect(screen.getByText((content, element) => element?.tagName === 'SPAN' && content.includes(`সম্পন্ন ${formatDate('2026-11-14')}`))).toBeTruthy();
});
