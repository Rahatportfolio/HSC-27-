// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalRoutineSetup, { PersonalRoutineSettings } from './components/PersonalRoutineSetup';
import { PlannerContext } from './context';
import type { ConfirmRequest, PlannerContextValue } from './context';
import { freshData, STORAGE_KEY } from './planner';
import type { AppData } from './planner';
import { buildStudyPlan } from './studyPlan';
import { setLanguage } from './i18n';
import { personalDataFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { classDurationReference } from './classDurationReferences';
import { defaultChapterWorkload, parsePersonalRoutine, personalRoutineHealth, workloadFor } from './personalRoutine';

beforeEach(() => { localStorage.clear(); setLanguage('en'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
/** Only context members consumed by this setup are provided. No student storage is used. */
function setup(initial: AppData) {
  let data = initial; let pending: ConfirmRequest | undefined;
  const onDone = vi.fn(), onCancel = vi.fn(), notify = vi.fn();
  const setData = vi.fn((value: AppData | ((old: AppData) => AppData)) => { data = typeof value === 'function' ? value(data) : value; draw(); });
  const context = () => ({ data, setData, plan: buildStudyPlan(data, initial.settings.startDate), today: initial.settings.startDate,
    setSelectedDate: vi.fn(), navigate: vi.fn(), notify, confirm: (request: ConfirmRequest) => { pending = request; },
  }) as unknown as PlannerContextValue;
  const element = () => <PlannerContext.Provider value={context()}><PersonalRoutineSetup onDone={onDone} onCancel={onCancel} /></PlannerContext.Provider>;
  const view = render(element()); function draw() { view.rerender(element()); }
  return { data: () => data, setData, notify, onDone, onCancel, confirm: () => pending, replace: (next: AppData) => act(() => { data = next; draw(); }) };
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
function availability(start = '18:00', end = '22:00') {
  fireEvent.change(screen.getByLabelText(/Daily total study hours/), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('radio', { name: 'None inside the study windows above' }));
  fireEvent.click(screen.getByRole('button', { name: 'This time every day' }));
  fireEvent.change(screen.getByLabelText('Window 1 start'), { target: { value: start } });
  fireEvent.change(screen.getByLabelText('Window 1 end'), { target: { value: end } });
}
const toPreview = () => { next(); next(); next(); };
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save (this availability & S|all-chapter) routine/ }));

describe('availability-first setup transaction', () => {
  it('asks for availability first, rejects an empty window, then saves a real 20-hour-per-chapter plan without any duration entry', () => {
    const data = { ...freshData(), routineSetupRequired: true }; const h = setup(data);
    expect(screen.getByRole('heading', { level: 1, name: 'First, when can you study?' })).toBeTruthy();
    expect((screen.getByLabelText('Window 1 start') as HTMLInputElement).value).toBe(''); next();
    expect(screen.getByRole('alert').textContent).toContain('Choose your study days'); expect(h.setData).not.toHaveBeenCalled();
    availability(); next(); next();
    // The time step now opens on the editable 20-hour estimate, not on blanks.
    expect(screen.getByText(/Even if you change nothing, each chapter gets/)).toBeTruthy();
    // 20 h is stated in the copy (letter/currency spacing is font-dependent,
    // so assert on the sentence rather than the digits).
    expect(screen.getByText(/These are estimates, not measured video lengths/)).toBeTruthy();
    // Step 3 is optional: entering no duration must still produce dated work.
    next(); save();
    expect(h.confirm()).toBeUndefined(); expect(h.onDone).toHaveBeenCalledOnce();
    expect(h.data().routineSetupRequired).toBe(false); expect(h.data().personalRoutine!.scope).toBe('ALL'); expect(h.data().personalRoutine!.chapterIds).toHaveLength(114); expect(h.data().personalRoutine!.windows).toHaveLength(7);
    const plan = buildStudyPlan(h.data(), data.settings.startDate);
    expect(plan.flatMap(day => day.tasks).length).toBeGreaterThan(0);
    for (const id of h.data().personalRoutine!.chapterIds) expect(workloadFor(h.data().personalRoutine!, id).class.source).toBe('default24');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).personalRoutine.chapterIds).toEqual(h.data().personalRoutine!.chapterIds);
  });
  it('accepts overnight availability on adjacent weekdays without losing a minute or scheduling outside it', () => {
    const h = setup({ ...freshData(), routineSetupRequired: true }); availability('22:00', '02:00'); toPreview(); save();
    const routine = h.data().personalRoutine!; expect(routine.windows).toHaveLength(14);
    for (let weekday = 0; weekday < 7; weekday++) expect(routine.windows.filter(window => window.weekday === weekday)).toEqual([{ weekday, startMinute: 0, endMinute: 120 }, { weekday, startMinute: 1320, endMinute: 1440 }]);
    expect(parsePersonalRoutine(routine)).toEqual(routine);
  });
  it('handles exact 24:00 explicitly instead of silently turning the end into an empty invalid time', () => {
    const h = setup({ ...freshData(), routineSetupRequired: true }); availability('22:00', '23:00');
    fireEvent.click(screen.getByRole('checkbox', { name: /Until midnight/ }));
    expect((screen.getByLabelText('Window 1 end') as HTMLInputElement).disabled).toBe(true); toPreview(); save();
    expect(h.data().personalRoutine!.windows.every(window => window.startMinute === 1320 && window.endMinute === 1440)).toBe(true);
  });
  it('uses the effective final-plan preview including manually moved custom appointments and preserves concurrent notes', () => {
    const data = personalDataFixture(); const date = data.settings.startDate;
    data.notes['2026-11-18'] = 'Keep real dated history';
    data.routineBlocks = [{ id: 'appointment', date, weekday: 5, startMinute: 1080, minutes: 60, subject: 'math', title: 'Keep my custom appointment', createdAt: '2026-11-18T08:00:00Z' }];
    data.dayOverrides[date] = { taskStartMinutes: { [`custom-${date}-appointment`]: 800 } };
    const h = setup(data); const expected = personalRoutineHealth(data, buildStudyPlan(data, date)); expect(expected.issues.some(issue => issue.code === 'unscheduled')).toBe(true);
    toPreview(); expect(screen.getByText('Some custom appointments are outside availability or clash. They are retained as unallocated items, not scheduled outside your windows. Edit them in the calendar.')).toBeTruthy();
    save(); expect(h.setData).not.toHaveBeenCalled(); expect(h.confirm()?.message).toContain('history are retained');
    h.replace({ ...data, notes: { ...data.notes, '2026-11-18': 'Updated elsewhere while editing' } });
    act(() => h.confirm()!.action());
    expect(h.data().notes['2026-11-18']).toBe('Updated elsewhere while editing'); expect(h.data().routineBlocks).toEqual(data.routineBlocks); expect(h.data().dayOverrides).toEqual(data.dayOverrides);
  });
  it('does not silently overwrite a routine changed elsewhere while the confirmation was open', () => {
    const data = personalDataFixture(); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); const h = setup(data); toPreview(); save();
    h.replace({ ...data, personalRoutine: { ...data.personalRoutine!, sessionMinutes: 60 } });
    act(() => h.confirm()!.action());
    expect(h.setData).not.toHaveBeenCalled(); expect(h.onDone).not.toHaveBeenCalled(); expect(screen.getByRole('alert').textContent).toContain('changed elsewhere');
    expect(h.data().personalRoutine!.sessionMinutes).toBe(60); expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).personalRoutine.sessionMinutes).toBe(120);
  });
  it('cancel and failed persistence cannot partially apply the draft', () => {
    const data = personalDataFixture(); const h = setup(data); next();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel—keep everything' }));
    expect(h.onCancel).toHaveBeenCalledOnce(); expect(h.data()).toBe(data); expect(h.setData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended shortlist' })); next(); next(); save();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full'); });
    act(() => h.confirm()!.action());
    expect(h.data()).toBe(data); expect(h.setData).not.toHaveBeenCalled(); expect(screen.getByRole('alert').textContent).toContain('Not saved');
  });
  it('uses an opt-in saved reference without inventing its observation date, and entering a new duration changes it to student-entered', () => {
    const data = personalDataFixture(); data.personalRoutine!.workloads[PERSONAL_IDS[0]] = defaultChapterWorkload(PERSONAL_IDS[0]); const h = setup(data);
    next(); next(); const fieldset = screen.getByText('Chapter class', { selector: 'legend' }).closest('fieldset')!;
    expect(within(fieldset).getByText('7:25:34')).toBeTruthy();
    expect(fieldset.textContent).toContain('Observation date unverified.');
    expect(fieldset.textContent).not.toContain('Page checked');
    const acceptedAfter = Date.now();
    fireEvent.click(within(fieldset).getByRole('button', { name: 'Use this reference duration' }));
    expect(Number((screen.getByLabelText('Chapter class minutes') as HTMLInputElement).value)).toBe(26734 / 60);
    expect(within(fieldset).getByText(/Saved page reference/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Chapter class minutes'), { target: { value: '500' } });
    expect(within(fieldset).getByText(/Student-entered/)).toBeTruthy();
    fireEvent.click(within(fieldset).getByRole('button', { name: 'Use this reference duration' }));
    next(); save(); act(() => h.confirm()!.action());
    const budget = h.data().personalRoutine!.workloads[PERSONAL_IDS[0]].class;
    expect(budget).toMatchObject({ minutes: 26734 / 60, source: 'reference-metadata' });
    expect(budget.observedAt).toBeUndefined();
    expect(Date.parse(budget.acceptedAt!)).toBeGreaterThanOrEqual(acceptedAfter);
    expect(parsePersonalRoutine(h.data().personalRoutine!).workloads[PERSONAL_IDS[0]].class).toEqual(budget);
  });
  it.each(['manual', 'source', 'omit'] as const)('clears reference acceptance when the student changes the %s input', mode => {
    const data = personalDataFixture(); data.personalRoutine!.workloads[PERSONAL_IDS[0]] = defaultChapterWorkload(PERSONAL_IDS[0]);
    const h = setup(data); next(); next();
    const stage = mode === 'omit' ? 'mcqClass' : 'class', name = mode === 'omit' ? 'MCQ solving class' : 'Chapter class';
    const fieldset = screen.getByText(name, { selector: 'legend' }).closest('fieldset')!;
    fireEvent.click(within(fieldset).getByRole('button', { name: 'Use this reference duration' }));
    if (mode === 'source') fireEvent.change(screen.getByLabelText(`${name} URL`), { target: { value: 'https://www.youtube.com/watch?v=abcdefghijk' } });
    else if (mode === 'manual') fireEvent.change(screen.getByLabelText(`${name} minutes`), { target: { value: '500' } });
    else fireEvent.click(within(fieldset).getByRole('button', { name: 'Omit this optional solving video (practice stays required)' }));
    next(); save(); act(() => h.confirm()!.action());
    const budget = h.data().personalRoutine!.workloads[PERSONAL_IDS[0]][stage];
    expect(budget.source).toBe(mode === 'source' ? 'unknown' : 'student');
    expect(budget.minutes).toBe(mode === 'source' ? null : mode === 'manual' ? 500 : 0);
    expect(budget.acceptedAt).toBeUndefined(); expect(budget.observedAt).toBeUndefined();
    expect(parsePersonalRoutine(h.data().personalRoutine!).workloads[PERSONAL_IDS[0]][stage]).toEqual(budget);
  });
  it('does not preselect a known promotion, wrong chapter or unverified partial class as chemistry MCQ/CQ', () => {
    const work = defaultChapterWorkload('chemistry-1-3'); expect(work.mcqClass.url).toBeUndefined(); expect(work.cqClass.url).toBeUndefined();
    expect(work.mcqClass.minutes).toBeNull(); expect(work.cqClass.minutes).toBeNull();
    expect(classDurationReference('8_o3fuF_UFI', 'chemistry-1-3', 'mcqClass')?.suitability).toBe('not-chapter');
    expect(classDurationReference('ALtCbY2H5ds', 'chemistry-1-3', 'cqClass')?.suitability).toBe('not-this-chapter');
  });
});

describe('availability setup embedded in an existing page', () => {
  const embedded = (data: AppData) => {
    const context = { data, plan: buildStudyPlan(data, data.settings.startDate), today: data.settings.startDate,
      setData: vi.fn(), notify: vi.fn(), confirm: vi.fn(), navigate: vi.fn(), setSelectedDate: vi.fn(),
    } as unknown as PlannerContextValue;
    render(<PlannerContext.Provider value={context}><main><div className="view settings-view"><h1>Settings</h1><PersonalRoutineSettings /></div></main></PlannerContext.Provider>);
    return context;
  };
  it.each(['new', 'legacy', 'personal'] as const)('keeps a single page heading/view for a %s profile without changing saved data', profile => {
    const data = profile === 'personal' ? personalDataFixture() : freshData();
    if (profile === 'new') data.routineSetupRequired = true;
    const before = JSON.stringify(data), context = embedded(data);
    if (profile !== 'new') fireEvent.click(screen.getByRole('button', { name: 'Set availability, S list & class durations' }));
    expect(document.querySelectorAll('main .view')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const heading = screen.getByRole('heading', { level: 2, name: 'First, when can you study?' });
    expect(document.activeElement).toBe(heading);
    expect(JSON.stringify(data)).toBe(before); expect(context.setData).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    if (profile !== 'new') {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel—keep everything' }));
      expect(screen.queryByRole('heading', { name: 'First, when can you study?' })).toBeNull();
      expect(JSON.stringify(data)).toBe(before); expect(context.setData).not.toHaveBeenCalled();
    }
  });
  it('keeps step navigation focused on a subordinate heading, not a second page title', () => {
    const context = embedded(personalDataFixture());
    fireEvent.click(screen.getByRole('button', { name: 'Set availability, S list & class durations' })); next();
    const heading = screen.getByRole('heading', { level: 2, name: 'S chapters only' });
    expect(document.activeElement).toBe(heading); expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(context.setData).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
