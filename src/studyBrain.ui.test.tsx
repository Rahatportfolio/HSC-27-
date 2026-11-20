// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyBrainView from './views/StudyBrain';
import StudyBrainTeaser from './components/StudyBrainTeaser';
import { PlannerContext } from './context';
import type { ConfirmRequest, PlannerContextValue } from './context';
import type { AppData } from './planner';
import { buildStudyPlan } from './studyPlan';
import { personalDataFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { newStudyBrain } from './studyBrain';
import { chapterById } from './data';
import { setLanguage } from './i18n';

const now = new Date('2026-11-20T12:05:00.000Z'), today = '2026-11-20';
beforeEach(() => { setLanguage('en'); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function enabled() { const data = personalDataFixture(); data.studyBrain = newStudyBrain(); return data; }
function setup(initial = personalDataFixture(), props: Partial<PlannerContextValue> = {}, teaser = false) {
  let data = initial, request: ConfirmRequest | undefined;
  const navigate = vi.fn(), notify = vi.fn(), startPresetTimer = vi.fn();
  const setData = vi.fn((value: AppData | ((old: AppData) => AppData)) => { data = typeof value === 'function' ? value(data) : value; draw(); });
  const context = () => ({ data, setData, plan: buildStudyPlan(data, today), now, today, navigate, notify, startPresetTimer,
    storageOk: true, routineSetupReady: true, timer: { running: false, accumulatedMs: 0 }, confirm: (value: ConfirmRequest) => { request = value; }, ...props }) as unknown as PlannerContextValue;
  const element = () => <PlannerContext.Provider value={context()}>{teaser ? <StudyBrainTeaser /> : <StudyBrainView />}</PlannerContext.Provider>;
  const view = render(element()); function draw() { view.rerender(element()); }
  return { data: () => data, setData, navigate, notify, startPresetTimer, request: () => request, replace: (next: AppData) => act(() => { data = next; draw(); }) };
}
const checkIn = () => screen.getByRole('region', { name: 'Daily brain check-in' });
const nextStep = () => screen.getByRole('region', { name: 'Brain next step' });
const interpret = (text: string) => { fireEvent.change(screen.getByLabelText('Say it briefly (Bengali / Banglish / English)'), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Interpret' })); };
const remember = () => fireEvent.click(screen.getByRole('button', { name: 'Remember check-in' }));

describe('Study Brain controls, consent and truthful suggestions', () => {
  it('is opt-in and explicitly describes a local rule-based, non-general-AI helper', () => {
    const initial = personalDataFixture(), h = setup(initial);
    expect(screen.getByText(/Not a general AI chatbot/)).toBeTruthy(); expect(screen.getByText(/does not read notes or scans/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Daily brain check-in' })).toBeNull(); expect(h.setData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable local Study Brain' }));
    expect(h.data().studyBrain?.enabled).toBe(true); expect(h.data().studyBrain!.checkIns).toEqual([]);
    expect(h.data().personalRoutine).toBe(initial.personalRoutine); expect(checkIn()).toBeTruthy();
  });
  it('shows a discoverable home entry and navigates without creating memory', () => {
    const h = setup(personalDataFixture(), {}, true);
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Study Brain' }));
    expect(h.navigate).toHaveBeenCalledWith('brain'); expect(h.data().studyBrain).toBeUndefined(); expect(h.setData).not.toHaveBeenCalled();
  });
  it('only drafts Banglish input, requires explicit save, and never retains the chat text', () => {
    const initial = enabled(), h = setup(initial); interpret('aj 30 min ache, onek tired');
    expect((screen.getByLabelText('Energy today') as HTMLSelectElement).value).toBe('low');
    expect((screen.getByLabelText('Time for this focus (minutes)') as HTMLInputElement).value).toBe('30');
    expect(h.data().studyBrain!.checkIns).toEqual([]); expect(h.setData).not.toHaveBeenCalled();
    expect(within(checkIn()).getByRole('status').textContent).toContain('nothing saved yet'); remember();
    expect(h.data().studyBrain!.checkIns[0]).toMatchObject({ date: today, energy: 'low', availableMinutes: 30 });
    expect(JSON.stringify(h.data())).not.toContain('onek tired'); expect((screen.getByLabelText('Say it briefly (Bengali / Banglish / English)') as HTMLInputElement).value).toBe('');
    expect(h.data().completed).toBe(initial.completed); expect(h.data().personalRoutine).toBe(initial.personalRoutine);
    expect(within(nextStep()).getByRole('button', { name: 'Start 15-minute focus' })).toBeTruthy();
  });
  it('lets a typed study obstacle focus only a chapter in the existing pair', () => {
    const h = setup(enabled()); interpret('chemistry mone thake na');
    expect((screen.getByLabelText('Which chapter in this pair needs attention?') as HTMLSelectElement).value).toBe(PERSONAL_IDS[1]); remember();
    expect(h.data().studyBrain!.checkIns[0]).toMatchObject({ obstacle: 'remembering', chapterId: PERSONAL_IDS[1] });
    expect(within(nextStep()).getByText(/This slot is open now/)).toBeTruthy();
    expect(within(nextStep()).getByRole('button', { name: 'Start 25-minute focus' })).toBeTruthy();
    interpret('math bujhi na'); expect(within(checkIn()).getByRole('status').textContent).toContain('outside the current pair');
    expect(h.data().personalRoutine!.chapterIds).toEqual(PERSONAL_IDS);
  });
  it('zero time produces a non-judgmental break without removing planned work', () => {
    const initial = enabled(), h = setup(initial); interpret('aj porte parbo na'); remember();
    expect(within(nextStep()).getByText('A break today. No extra work piled on.')).toBeTruthy();
    expect(within(nextStep()).queryByRole('button', { name: /Start .*focus/ })).toBeNull();
    expect(h.data().completed).toEqual({}); expect(buildStudyPlan(h.data(), today)).toEqual(buildStudyPlan(initial, today));
  });
  it('rejects fractional check-in time, excessive focus preference and destructive text without mutations', () => {
    const h = setup(enabled()); fireEvent.change(screen.getByLabelText('Time for this focus (minutes)'), { target: { value: '2.5' } }); remember();
    expect(screen.getByRole('alert').textContent).toContain('whole minutes'); expect(h.setData).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Preferred small focus (minutes)'), { target: { value: '100' } }); fireEvent.click(screen.getByRole('button', { name: 'Remember preference' }));
    expect(screen.getAllByRole('alert').some(item => item.textContent?.includes('5–90'))).toBe(true); expect(h.setData).not.toHaveBeenCalled();
    interpret('delete all notes'); expect(within(checkIn()).getByRole('status').textContent).toContain('cannot mark work complete'); expect(h.setData).not.toHaveBeenCalled();
  });
  it('a focus timer is explicit and carries only an uncovered personal source range, not a completion action', () => {
    const initial = enabled(), h = setup(initial);
    fireEvent.click(within(nextStep()).getByRole('button', { name: 'Start 25-minute focus' }));
    expect(h.startPresetTimer).toHaveBeenCalledOnce(); expect(h.startPresetTimer.mock.calls[0][0]).toMatchObject({ subject: 'physics', chapterId: PERSONAL_IDS[0], durationMin: 25 });
    expect(h.startPresetTimer.mock.calls[0][0].taskId).toMatch(/^smart-part\|personal%3A.*\|0\|25$/);
    expect(h.data()).toBe(initial); expect(h.setData).not.toHaveBeenCalled();
    expect(screen.getByText(/a timer never ticks the source complete/)).toBeTruthy();
  });
  it('rechecks real time at click and refuses a stale/expired timer suggestion', () => {
    const h = setup(enabled()); vi.setSystemTime(new Date('2026-11-20T16:00:00Z'));
    fireEvent.click(within(nextStep()).getByRole('button', { name: 'Start 25-minute focus' }));
    expect(h.startPresetTimer).not.toHaveBeenCalled(); expect(h.notify).toHaveBeenCalledWith(expect.stringContaining('time or current work changed'), 'info');
  });
  it('does not replace an already running timer or start focus when storage cannot save', () => {
    const h = setup(enabled(), { timer: { running: true, accumulatedMs: 1000 } as PlannerContextValue['timer'] });
    expect((within(nextStep()).getByRole('button', { name: 'Start 25-minute focus' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Review existing timer first' })); expect(h.navigate).toHaveBeenCalledWith('timer'); expect(h.startPresetTimer).not.toHaveBeenCalled();
  });
  it('chapter feedback only affects optional focus suggestions, not source lengths or learning records', () => {
    const initial = enabled(), h = setup(initial);
    fireEvent.click(within(nextStep()).getByRole('button', { name: 'Felt hard' }));
    expect(h.data().studyBrain!.feedback[0]).toMatchObject({ chapterId: PERSONAL_IDS[0], difficulty: 'hard' });
    expect(within(nextStep()).getByRole('button', { name: 'Start 15-minute focus' })).toBeTruthy();
    expect(h.data().personalRoutine).toBe(initial.personalRoutine); expect(h.data().completed).toBe(initial.completed); expect(h.data().studySessions).toBe(initial.studySessions);
  });
  it('shows insufficient evidence honestly instead of claiming to know ability', () => {
    setup(enabled()); expect(screen.getByText(/Not enough data for a study-length pattern yet/)).toBeTruthy();
    expect(within(nextStep()).getByText('Why this suggestion?')).toBeTruthy();
  });
  it('keeps current study data when confirmed memory deletion runs after another edit', () => {
    const initial = enabled(), h = setup(initial); initial.notes[today] = 'Original note';
    fireEvent.click(screen.getByRole('button', { name: 'Forget brain memory' }));
    expect(h.data().studyBrain).toBeDefined(); expect(h.request()!.message).toContain('notes, scans');
    h.replace({ ...h.data(), notes: { ...h.data().notes, [today]: 'Updated concurrently' } });
    act(() => h.request()!.action()); expect(h.data().studyBrain).toBeUndefined(); expect(h.data().notes[today]).toBe('Updated concurrently');
    expect(h.data().personalRoutine).toBe(initial.personalRoutine); expect(screen.getByRole('button', { name: 'Enable local Study Brain' })).toBeTruthy();
  });
  it('pauses without forgetting, then resumes with retained memory', () => {
    const data = enabled(); data.studyBrain!.checkIns = [{ energy: 'low', availableMinutes: 10, obstacle: 'none', date: today, at: now.toISOString() }];
    const h = setup(data); fireEvent.click(screen.getByRole('button', { name: 'Pause, keep memory' }));
    expect(h.data().studyBrain!.enabled).toBe(false); expect(h.data().studyBrain!.checkIns).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Brain next step' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume Study Brain' }));
    expect(h.data().studyBrain!.enabled).toBe(true); expect(within(nextStep()).getByRole('button', { name: 'Start 10-minute focus' })).toBeTruthy();
  });
  it('disables memory writes while native data is restoring or storage has failed', () => {
    const h = setup(enabled(), { routineSetupReady: false });
    expect(screen.getByRole('status').textContent).toContain('saved device data has loaded'); expect(screen.queryByRole('button', { name: 'Remember check-in' })).toBeNull(); expect(h.setData).not.toHaveBeenCalled();
    cleanup(); const s = setup(enabled(), { storageOk: false });
    expect(screen.getByRole('alert').textContent).toContain('Storage is not saving');
    expect((screen.getByRole('button', { name: 'Remember check-in' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Start 25-minute focus' }) as HTMLButtonElement).disabled).toBe(true); expect(s.setData).not.toHaveBeenCalled();
  });
  it('uses the Bengali interface for controls, uncertainty and feedback', () => {
    setLanguage('bn'); setup(enabled());
    expect(screen.getByRole('heading', { level: 1, name: 'একটু বলো, পরের কাজটা সহজ করি।' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'চেক-ইন মনে রাখো' })).toBeTruthy();
    expect(screen.getByText(/পড়ার ধরন ধরার মতো তথ্য এখনো কম/)).toBeTruthy();
    expect(screen.getByRole('option', { name: chapterById[PERSONAL_IDS[0]].title })).toBeTruthy();
  });
});

describe('Study Brain full-strength insights and pre-flight', () => {
  it('shows low-data honesty in the 28-day picture and pre-flight, and coach answers never mutate anything', () => {
    const initial = enabled(), h = setup(initial);
    const insights = screen.getByRole('region', { name: 'The full 28-day picture' });
    expect(within(insights).getByText('When you study')).toBeTruthy();
    expect(within(insights).getByText(/At least 5 saved sessions/)).toBeTruthy();
    expect(within(insights).getByText(/At least 4 check-in days/)).toBeTruthy();
    expect(within(insights).getByText(/Not enough data for a pace estimate/)).toBeTruthy();
    const preflight = screen.getByRole('region', { name: 'Fix these before your next review' });
    expect(within(preflight).getByText(/Nothing urgent in your records/)).toBeTruthy();
    expect(within(preflight).queryByRole('button', { name: /Open/ })).toBeNull();
    interpret('pace');
    expect(within(checkIn()).getByRole('status').textContent).toContain('Not enough saved data for a pace estimate');
    expect(h.setData).not.toHaveBeenCalled();
    interpret('ki age thik korbo');
    expect(within(checkIn()).getByRole('status').textContent).toContain('No unresolved-mistake');
    expect(h.setData).not.toHaveBeenCalled();
    interpret('streak');
    expect(within(checkIn()).getByRole('status').textContent).toContain('last 28 days');
    expect(h.setData).not.toHaveBeenCalled();
    expect(h.data().completed).toBe(initial.completed);
    expect(h.data().personalRoutine).toBe(initial.personalRoutine);
  });
  it('lists real priorities with route buttons and never adds work to the plan', () => {
    const initial = enabled();
    initial.mistakes.push({ id: 'm1', subject: 'chemistry', text: 'হার চাপ', date: '2026-11-15', category: 'careless', retryStatus: 'pending', resolved: false, chapterId: PERSONAL_IDS[1] });
    const h = setup(initial);
    const preflight = screen.getByRole('region', { name: 'Fix these before your next review' });
    expect(within(preflight).getByText(/Open mistake records · 1/)).toBeTruthy();
    expect(within(preflight).queryByText(/Nothing urgent/)).toBeNull();
    fireEvent.click(within(preflight).getByRole('button', { name: /Open weakness detector/ }));
    expect(h.navigate).toHaveBeenCalledWith('weakness');
    expect(h.data().completed).toBe(initial.completed);
    expect(h.data().personalRoutine).toBe(initial.personalRoutine);
    expect(buildStudyPlan(h.data(), today)).toEqual(buildStudyPlan(initial, today));
  });
});
