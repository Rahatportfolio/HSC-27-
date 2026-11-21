// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlannerContextValue } from './context';
import { freshData } from './planner';
import { setLanguage } from './i18n';
const state = vi.hoisted(() => ({ context: null as unknown as PlannerContextValue, notify: vi.fn() }));
vi.mock('./context', () => ({ usePlanner: () => state.context }));
vi.mock('./native', () => ({
  isNativeApp: () => true,
  nativeNotificationStatus: vi.fn(async () => ({ permission: 'granted', exact: 'granted', channels: true })),
  requestNativeNotifications: vi.fn(async () => 'granted'),
  syncNativeReminders: vi.fn(async () => ({ permission: 'granted', scheduled: 0 })),
  nativeNotify: vi.fn(), openExactAlarmSettings: vi.fn(),
}));
import RemindersView from './views/Reminders';
afterEach(cleanup);
it('does not claim that sessions are already scheduled when zero reminders are scheduled', async () => {
  setLanguage('en');
  state.notify.mockClear();
  state.context = { data: freshData(), plan: [], today: '2026-11-20', setData: vi.fn(), notify: state.notify, navigate: vi.fn(), exportICS: vi.fn(), sendStudyStatusNotification: vi.fn() } as unknown as PlannerContextValue;
  render(<RemindersView />);
  fireEvent.click(screen.getByRole('button', { name: 'এখনই সিঙ্ক করো' }));
  await waitFor(() => expect(state.notify).toHaveBeenCalledWith('No reminders are scheduled for the next 14 days.', 'info'));
});
