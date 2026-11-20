import './test/pinnedDate';
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { DEFAULT_SETTINGS, buildPlan, chapterStudyTasks, freshData, STORAGE_KEY } from './planner';
import type { AppData } from './planner';
import { CHAPTERS } from './data';
import { emptyAdvanced } from './advanced';
import { ensureRevisions } from './revision';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  // Fake only the clock (storage and timers stay real) so the today-relative default start is stable in this suite.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z'));
  localStorage.clear();
  window.location.hash = '#settings';
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const stored = (): AppData => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
const change = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function open(data = freshData()) {
  data.settings.language = 'en';
  data.settings.adaptiveEnabled = false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const app = render(<App />);
  await screen.findByRole('heading', { name: 'Your study, your rhythm.' });
  return app;
}
async function saveConfirmed() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  const dialog = await screen.findByRole('dialog', { name: 'Update routine dates and times?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Update routine' }));
}

describe('real Settings date cascade', () => {
  it('describes the boost by its saved date rather than promising a new month or full preparation', async () => {
    await open();
    change(/^Routine start date/, '2026-12-01');
    expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('2026-12-18');
    expect(screen.getByLabelText(/^Scheduled study boost/)).toBeTruthy();
    const workload = screen.getByLabelText(/^Boosted daily study hours/).closest('label')!;
    expect(workload.textContent).toContain('Allow time for breaks, meals and adequate sleep.');
    expect(workload.textContent).not.toContain('full boost');
    expect(screen.queryByText('Next-month study boost')).toBeNull();
  }, 30000);

  it('distinguishes a future routine preview from an assigned target for today', async () => {
    const future = freshData();
    future.settings.startDate = '2026-11-20';
    future.settings.boostStartDate = '2026-12-07';
    vi.setSystemTime(new Date('2026-11-16T06:00:00Z'));
    await open(future);
    act(() => { window.location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    const notice = await screen.findByRole('region', { name: 'Plan has not started' });
    expect(within(notice).getByRole('heading', { name: 'Routine starts · 20 November 2026' })).toBeTruthy();
    expect(notice.textContent).toContain('No routine sessions are assigned before the start.');
    expect(screen.queryByRole('heading', { name: 'Today’s smart target' })).toBeNull();
    expect((screen.getByLabelText('Pick study date') as HTMLInputElement).value).toBe('2026-11-20');
    fireEvent.click(within(notice).getByRole('button', { name: 'Preview the first day' }));
    await waitFor(() => expect(window.location.hash).toBe('#calendar'));
    await waitFor(() => expect(document.querySelector('.calendar-day-panel')?.textContent).toContain('20 November'));
  }, 30000);

  it('shows the actual smart target on the start date rather than a not-started notice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T06:00:00Z'));
    await open();
    act(() => { window.location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(await screen.findByRole('heading', { name: 'Today’s smart target' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Plan has not started' })).toBeNull();
  }, 30000);

  it('previews all shifted dates, saves atomically and survives a reload without shifting twice', async () => {
    const data = freshData();
    data.completed['physics-1-2:part-1'] = '2026-11-20T08:00:00Z';
    const app = await open(data);
    expect((screen.getByLabelText(/^Routine start date/) as HTMLInputElement).value).toBe('2026-11-20');
    change(/^Routine start date/, '2026-11-26');
    expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('2026-12-13');
    expect((screen.getByLabelText(/^Test exam target date/) as HTMLInputElement).value).toBe('2027-02-07');
    expect((screen.getByLabelText(/^HSC '27 exam target date/) as HTMLInputElement).value).toBe('2027-06-12');
    expect(screen.getByRole('region', { name: 'Date change preview' }).textContent).toContain('11 June 2027');
    expect(stored().settings.startDate).toBe('2026-11-20');
    await saveConfirmed();
    await waitFor(() => {
      expect(stored().settings).toMatchObject({ startDate: '2026-11-26', boostStartDate: '2026-12-13', testExamDate: '2027-02-07', examDate: '2027-06-12', calendarRevision: 1 });
      expect(stored().completed).toEqual(data.completed);
    });
    app.unmount();
    render(<App />);
    await screen.findByRole('heading', { name: 'Your study, your rhythm.' });
    expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('2026-12-13');
    expect(stored().settings.calendarRevision).toBe(1);
  }, 30000);

  it.each(['shift', 'fixed'] as const)('moves an existing profile to the requested 20 November start only after confirmation (%s)', async policy => {
    const data = freshData();
    data.settings = { ...data.settings, name: 'Keep my profile', startDate: '2026-11-14', boostStartDate: '2026-12-01', dailyHours: 6, examDatePolicy: policy };
    data.notes['2026-11-15'] = 'Keep my actual study note';
    data.completed['physics-1-2:part-1'] = '2026-11-15T08:00:00Z';
    data.studySessions = [{ id: 'old-session', date: '2026-11-15', at: '2026-11-15T08:00:00Z', minutes: 17, subject: 'physics', mode: 'stopwatch' }];
    const app = await open(data);
    expect(stored().settings.startDate).toBe('2026-11-14');
    fireEvent.click(screen.getByRole('button', { name: 'Use 20 November 2026' }));
    expect((screen.getByLabelText(/^Routine start date/) as HTMLInputElement).value).toBe('2026-11-20');
    expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('2026-12-07');
    expect((screen.getByLabelText(/^Test exam target date/) as HTMLInputElement).value).toBe(policy === 'shift' ? '2027-02-07' : '2027-02-01');
    expect((screen.getByLabelText(/^HSC '27 exam target date/) as HTMLInputElement).value).toBe(policy === 'shift' ? '2027-06-12' : '2027-06-06');
    // A shortcut is a draft edit, not permission to reset or auto-save a profile.
    expect(stored().settings.startDate).toBe('2026-11-14');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Update routine dates and times?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(stored().settings.startDate).toBe('2026-11-14');
    expect(stored().settings.calendarRevision).toBe(0);
    await saveConfirmed();
    await waitFor(() => {
      expect(stored().settings).toMatchObject({ startDate: '2026-11-20', boostStartDate: '2026-12-07', name: 'Keep my profile', dailyHours: 6, examDatePolicy: policy, calendarRevision: 1 });
      expect(stored().notes).toEqual(data.notes);
      expect(stored().completed).toEqual(data.completed);
      expect(stored().studySessions).toEqual(data.studySessions);
    });
    app.unmount(); render(<App />);
    await screen.findByRole('heading', { name: 'Your study, your rhythm.' });
    expect((screen.getByLabelText(/^Routine start date/) as HTMLInputElement).value).toBe('2026-11-20');
    expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('2026-12-07');
    expect(stored().settings.calendarRevision).toBe(1);
    expect(screen.queryByRole('button', { name: 'Use 20 November 2026' })).toBeNull();
  }, 30000);

  it('uses the final customised video plan in the preview and shows the same capacity warnings after applying it', async () => {
    const data = freshData();
    data.removedTasks = [buildPlan()[0].tasks[0].id];
    data.advanced = { ...emptyAdvanced(), classes: [{
      id: 'long', title: 'Long course', url: 'https://example.org/a.mp4', chapterId: CHAPTERS[0].id,
      teacher: 'T', duration: 2_000_000, position: 0, watched: 0, speed: 1, permitted: true, note: '',
    }] };
    await open(data);
    change(/^Routine start date/, '2026-11-26');
    const preview = screen.getByRole('region', { name: 'Date change preview' });
    const warnings = within(preview).getAllByRole('alert').map(item => item.textContent);
    expect(warnings.some(warning => warning?.includes('minutes of work do not fit'))).toBe(true);
    expect(warnings.some(warning => warning?.includes('not full coverage'))).toBe(true);
    await saveConfirmed();
    await waitFor(() => expect(stored().settings.startDate).toBe('2026-11-26'));
    expect(within(screen.getByRole('alert', { name: 'Schedule capacity warning' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(warnings);
  }, 30000);

  it('refuses a locked plan in the preview and on save without moving the locked work', async () => {
    const data = freshData(); data.lockedDates = [data.settings.startDate];
    await open(data);
    change(/^Routine start date/, '2026-11-26');
    expect(within(screen.getByRole('region', { name: 'Date change preview' })).getByRole('alert').textContent).toContain('Unlock');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stored().settings.startDate).toBe('2026-11-20');
    expect(stored().lockedDates).toEqual(['2026-11-20']);
  }, 30000);

  it('keeps a completed chapter and its real recall-card dates through the full app save and reload pipeline', async () => {
    let data = freshData();
    const at = '2026-11-20T20:00:00Z';
    chapterStudyTasks(buildPlan(), CHAPTERS[0].id).forEach(task => { data.completed[task.id] = at; });
    data = ensureRevisions(buildPlan(), data);
    const cards = data.revisions;
    expect(cards).toHaveLength(5);
    const app = await open(data);
    change(/^Routine start date/, '2026-11-26');
    await saveConfirmed();
    await waitFor(() => {
      expect(stored().settings.startDate).toBe('2026-11-26');
      expect(stored().revisions).toEqual(cards);
      expect(stored().completed).toEqual(data.completed);
    });
    app.unmount(); render(<App />);
    await screen.findByRole('heading', { name: 'Your study, your rhythm.' });
    await waitFor(() => expect(stored().revisions).toEqual(cards));
  }, 30000);

  it('cancels a proposed date change without mutating the saved schedule or calendar revision', async () => {
    await open();
    change(/^Routine start date/, '2026-11-26');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Update routine dates and times?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(stored().settings.startDate).toBe('2026-11-20');
    expect(stored().settings.calendarRevision).toBe(0);
    expect((screen.getByLabelText(/^Routine start date/) as HTMLInputElement).value).toBe('2026-11-26');
  }, 30000);

  it('keeps external deadlines fixed and makes insufficient time visible before and after saving', async () => {
    await open();
    change(/^Exam target date policy/, 'fixed');
    change(/^Routine start date/, '2026-12-15');
    expect((screen.getByLabelText(/^Test exam target date/) as HTMLInputElement).value).toBe(DEFAULT_SETTINGS.testExamDate);
    expect((screen.getByLabelText(/^HSC '27 exam target date/) as HTMLInputElement).value).toBe(DEFAULT_SETTINGS.examDate);
    const preview = screen.getByRole('region', { name: 'Date change preview' });
    expect(within(preview).getAllByRole('alert').some(item => item.textContent?.includes('not full coverage'))).toBe(true);
    await saveConfirmed();
    await waitFor(() => expect(stored().settings.startDate).toBe('2026-12-15'));
    expect(screen.getByRole('alert', { name: 'Schedule capacity warning' }).textContent).toContain('not full coverage');
  }, 30000);

  it('handles empty date fields and repeated edits without a crash or accumulated offset error', async () => {
    await open();
    change(/^Boost start date/, '');
    change(/^Routine start date/, '2026-11-21');
    expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('');
    change(/^Boost start date/, '2026-12-09');
    change(/^Routine start date/, '');
    change(/^Routine start date/, '2026-11-22');
    expect((screen.getByLabelText(/^Boost start date/) as HTMLInputElement).value).toBe('2026-12-10');
    expect((screen.getByLabelText(/^Test exam target date/) as HTMLInputElement).value).toBe('2027-02-03');
    expect((screen.getByLabelText(/^HSC '27 exam target date/) as HTMLInputElement).value).toBe('2027-06-08');
  }, 30000);

  it.each([
    [/^Test exam target date/, 'testExamDate', '2027-02-03'],
    [/^HSC '27 exam target date/, 'examDate', '2027-06-08'],
  ] as const)('requires confirmation and updates calendar sequence for a date-only edit: %s', async (label, key, value) => {
    await open();
    change(label, value);
    await saveConfirmed();
    await waitFor(() => {
      expect(stored().settings[key]).toBe(value);
      expect(stored().settings.calendarRevision).toBe(1);
    });
  }, 30000);

  it('shows honest source status with official links rather than presenting unverified dates as a board notice', async () => {
    await open();
    const preview = screen.getByRole('region', { name: 'Date change preview' });
    expect(preview.textContent).toContain('not an official exam routine');
    expect(preview.textContent).toContain('could not be verified');
    expect(within(preview).getByRole('link', { name: 'NCTB' }).getAttribute('href')).toBe('https://nctb.gov.bd/pages/notices/');
    expect(preview.textContent).not.toContain('28 January');
    expect(preview.textContent).not.toContain('officially announced');
  }, 30000);

  it('opens a repairable legacy profile in Settings without crashing, resetting progress or erasing notes', async () => {
    const data = freshData();
    data.settings.startDate = '2027-05-01';
    data.notes['2026-11-14'] = 'Keep this history';
    data.completed['physics-1-2:part-1'] = '2026-11-20T08:00:00Z';
    await open(data);
    act(() => { window.location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(await screen.findByRole('heading', { name: 'Your study, your rhythm.' })).toBeTruthy();
    expect(screen.getByRole('alert', { name: 'Schedule capacity warning' }).textContent).toContain('after the start date');
    await waitFor(() => {
      expect(stored().notes['2026-11-14']).toBe('Keep this history');
      expect(stored().completed).toEqual(data.completed);
      expect(stored().settings.startDate).toBe('2027-05-01');
    });
  }, 30000);
});
