import './test/pinnedDate';
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PlannerContext } from './context';
import type { ConfirmRequest, PlannerContextValue } from './context';
import { freshTimerState } from './hooks';
import { freshData, STORAGE_KEY } from './planner';
import type { AppData } from './planner';
import { chapterById, subjectById } from './data';
import { setLanguage } from './i18n';
import { buildStudyPlan } from './studyPlan';
import { setTaskCompletion } from './study';
import { parseBackup } from './storage';
import { personalDataFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { WORK_STAGES, applyPersonalRoutine, nextPersonalRoutine, personalChapterProgress, personalStageSourceId, setPersonalStageCompletion, personalBookLabel } from './personalRoutine';
import PersonalRoutineSetup from './components/PersonalRoutineSetup';
import PersonalStudyHome from './views/PersonalStudyHome';
import PersonalSessionCard from './components/PersonalSessionCard';
import AnalyticsView from './views/Analytics';
import SyllabusView from './views/Syllabus';
import { ChapterModal } from './modals';

beforeEach(() => { localStorage.clear(); setLanguage('en'); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function harness(initial: AppData, children: ReactNode, today = initial.settings.startDate) {
  let data = initial, pending: ConfirmRequest | undefined;
  const navigate = vi.fn(), notify = vi.fn();
  const setData = (value: AppData | ((old: AppData) => AppData)) => { data = typeof value === 'function' ? value(data) : value; draw(); };
  const node = () => <PlannerContext.Provider value={{ data, setData, plan: buildStudyPlan(data, today), selectedDate: today, today,
    now: new Date(`${today}T12:05:00Z`), timer: freshTimerState(), navigate, notify, setSelectedDate: vi.fn(), exportICS: vi.fn(), openChapter: vi.fn(), startTimer: vi.fn(),
    confirm: (request: ConfirmRequest) => { pending = request; }, toggleTask: vi.fn(),
  } as unknown as PlannerContextValue}>{children}</PlannerContext.Provider>;
  const view = render(node()); function draw() { view.rerender(node()); }
  return { data: () => data, navigate, notify, confirm: () => pending, setData };
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
const preview = () => {
  next();
  if (screen.queryByLabelText('Choose chapters')) fireEvent.click(screen.getByLabelText(`${chapterById['physics-1-3'].title} · ${personalBookLabel('physics-1-3')}`));
  next(); next();
};
function windows() {
  fireEvent.click(screen.getByRole('button', { name: 'This time every day' }));
  fireEvent.change(screen.getByLabelText('Window 1 start'), { target: { value: '18:00' } });
  fireEvent.change(screen.getByLabelText('Window 1 end'), { target: { value: '22:00' } });
}

describe('three-session daily workflow', () => {
  it('groups short allocations by chapter and ticks only the selected date, retaining old evidence on undo', () => {
    const data = personalDataFixture(); const id = PERSONAL_IDS[0];
    const plan = buildStudyPlan(data, data.settings.startDate);
    const parts = plan[0].tasks.filter(task => task.chapterIds.includes(id));
    const h = harness(data, <PersonalSessionCard />);
    expect(screen.getAllByRole('heading', { name: '1. Chapter YouTube class' })).toHaveLength(2);
    const card = screen.getAllByRole('heading', { name: '1. Chapter YouTube class' }).map(el => el.closest('article')!).find(el => el.textContent!.includes(chapterById[id].title))!;
    expect(within(card).getByRole('link', { name: 'Open YouTube class' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Finished this date’s allocation' }));
    expect(parts.every(task => !!h.data().completed[task.id])).toBe(true);
    expect(personalChapterProgress(h.data().personalRoutine!, id, h.data().completed).fullyComplete).toBe(false);
    expect(Object.keys(h.data().completed).every(key => !key.includes(PERSONAL_IDS[1]))).toBe(true);
    expect(parseBackup(JSON.stringify(h.data())).completed).toEqual(h.data().completed);
    fireEvent.click(within(card).getByRole('button', { name: /Undo (this date’s work|completed parts on this date)/ }));
    expect(parts.every(task => !h.data().completed[task.id])).toBe(true);
  });
  it('shows retained partial minutes and offers an undo without certifying the whole range', () => {
    const data = personalDataFixture([PERSONAL_IDS[0]]), id = PERSONAL_IDS[0];
    const source = personalStageSourceId(data.personalRoutine!, id, 'class');
    const evidence = `smart-part|${encodeURIComponent(source)}|0|40`;
    data.completed[evidence] = '2026-11-16T10:00:00.000Z';
    const h = harness(data, <PersonalSessionCard />);
    const card = screen.getByRole('heading', { name: '1. Chapter YouTube class' }).closest('article')!;
    expect(card.textContent).toContain('done 40m');
    expect(personalChapterProgress(h.data().personalRoutine!, id, h.data().completed).fullyComplete).toBe(false);
    fireEvent.click(within(card).getByRole('button', { name: 'Undo completed parts on this date' }));
    expect(h.data().completed[evidence]).toBeUndefined();
  });
  it('displays notes without class links and keeps solving links with practice', () => {
    const data = personalDataFixture([PERSONAL_IDS[0]]);
    data.personalRoutine!.windows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 480, endMinute: 1320 }));
    data.personalRoutine!.dailyLimitMinutes = 840;
    data.personalRoutine!.workloads[PERSONAL_IDS[0]].mcqClass.minutes = 5;
    data.personalRoutine!.workloads[PERSONAL_IDS[0]].cqClass.minutes = 5;
    harness(data, <PersonalSessionCard />);
    const notes = screen.getByRole('heading', { name: '2. Make your own notes' }).closest('article')!;
    expect(within(notes).queryByRole('link')).toBeNull();
    const practice = screen.getByRole('heading', { name: '3. CQ/MCQ solving and own practice' }).closest('article')!;
    expect(within(practice).getByRole('link', { name: 'Open MCQ class' })).toBeTruthy();
    expect(within(practice).getByRole('link', { name: 'Open CQ class' })).toBeTruthy();
    expect(within(practice).getByRole('button', { name: 'Find CQ/MCQ classes' })).toBeTruthy();
  });
  it('requires an explicit confirmation to certify an entire session and keeps notes pending', () => {
    const data = personalDataFixture([PERSONAL_IDS[0]]), id = PERSONAL_IDS[0];
    const h = harness(data, <ChapterModal chapter={chapterById[id]} onClose={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Three chapter sessions' });
    fireEvent.click(within(region).getAllByRole('button', { name: 'Confirm entire session complete' })[0]);
    expect(Object.keys(h.data().completed)).toHaveLength(0);
    act(() => h.confirm()!.action());
    expect(within(region).getByText(/1\/3/)).toBeTruthy();
    expect(personalChapterProgress(h.data().personalRoutine!, id, h.data().completed).fullyComplete).toBe(false);
  });
});

describe('reworked setup UI', () => {
  it('requires explicit daily net hours and an obligation answer, not just a guessed window/default timetable', () => {
    harness({ ...freshData(), routineSetupRequired: true }, <PersonalRoutineSetup />);
    windows(); next();
    expect(screen.getByRole('alert').textContent).toContain('daily net hours');
    fireEvent.change(screen.getByLabelText(/Daily total study hours/), { target: { value: '1.5' } }); next();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('First, when can you study?');
    fireEvent.click(screen.getByRole('radio', { name: 'None inside the study windows above' })); next();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Choose chapters');
  });
  it('saves fixed obligations and daily cap, returns to dashboard and round-trips every minute of the explicit intervals', () => {
    const h = harness({ ...freshData(), routineSetupRequired: true }, <PersonalRoutineSetup />);
    windows(); fireEvent.change(screen.getByLabelText(/Daily total study hours/), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Yes—do not schedule study in these intervals' }));
    fireEvent.click(screen.getByRole('button', { name: 'This obligation every day' }));
    fireEvent.change(screen.getByLabelText('Obligation 1 start'), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText('Obligation 1 end'), { target: { value: '20:00' } });
    preview(); fireEvent.click(screen.getByRole('button', { name: 'Save selected-chapter routine' }));
    expect(h.navigate).toHaveBeenCalledWith('today');
    expect(h.data().personalRoutine!.dailyLimitMinutes).toBe(90);
    expect(h.data().personalRoutine!.exclusions).toEqual(Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 1140, endMinute: 1200 })));
    expect(parseBackup(localStorage.getItem(STORAGE_KEY)!)).toEqual(h.data());
  });
  it('cascades linked personal target dates and handles a cleared start date without crashing or saving', () => {
    const h = harness({ ...freshData(), routineSetupRequired: true }, <PersonalRoutineSetup />);
    windows(); fireEvent.change(screen.getByLabelText(/Daily total study hours/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('radio', { name: 'None inside the study windows above' }));
    fireEvent.change(screen.getByLabelText('Plan start date'), { target: { value: '' } }); next();
    expect(screen.getByRole('alert')).toBeTruthy(); expect(h.data().personalRoutine).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Plan start date'), { target: { value: '2026-11-21' } });
    expect((screen.getByLabelText('Personal test target') as HTMLInputElement).value).toBe('2027-02-02');
    expect((screen.getByLabelText('Personal end target') as HTMLInputElement).value).toBe('2027-06-07');
    preview(); fireEvent.click(screen.getByRole('button', { name: 'Save selected-chapter routine' }));
    expect(h.data().settings.startDate).toBe('2026-11-21');
  });
  it('explains and excludes retained later-phase chapters from a reopened S editor and its recommended shortlist', () => {
    let data = personalDataFixture();
    for (const id of PERSONAL_IDS) for (const stage of WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id))) data = setPersonalStageCompletion(data, id, stage.id, true);
    data = applyPersonalRoutine(data, nextPersonalRoutine(data, '2026-11-24')!, { asOf: '2026-11-24' });
    data = setPersonalStageCompletion(data, PERSONAL_IDS[0], 'revision', false);
    const archived = data.personalPhases!.A!.chapterIds[0], h = harness(data, <PersonalRoutineSetup />, '2026-11-24');
    next();
    expect(screen.getByText(/Chapters belonging to a retained later phase/)).toBeTruthy();
    const subject = screen.getByRole('group', { name: subjectById[chapterById[archived].subject].name });
    const choice = within(subject).getByRole('checkbox', { name: new RegExp(`^${chapterById[archived].title}`) }) as HTMLInputElement;
    expect(choice.disabled).toBe(true); expect(choice.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended shortlist' })); next(); next();
    fireEvent.click(screen.getByRole('button', { name: 'Save this availability & S routine' })); act(() => h.confirm()!.action());
    expect(h.data().personalRoutine!.chapterIds.every(id => !h.data().personalPhases!.A!.chapterIds.includes(id))).toBe(true);
    expect(parseBackup(localStorage.getItem(STORAGE_KEY)!)).toEqual(h.data());
  });
  it('uses notes volume and MCQ/CQ/revision rates as separate editable calculations with provenance', () => {
    const h = harness(personalDataFixture(), <PersonalRoutineSetup />);
    next(); next();
    const notes = screen.getByText('Note making', { selector: 'legend' }).closest('fieldset')!;
    fireEvent.change(within(notes).getByLabelText('Note topics/sections'), { target: { value: '8' } });
    fireEvent.change(within(notes).getByLabelText('Note-making minutes per section'), { target: { value: '4' } });
    fireEvent.change(within(notes).getByLabelText('Work difficulty'), { target: { value: 'hard' } });
    fireEvent.click(within(notes).getByRole('button', { name: 'Calculate workload time' }));
    expect((screen.getByLabelText('Note making minutes') as HTMLInputElement).value).toBe('45');
    const revision = screen.getByText('Chapter revision', { selector: 'legend' }).closest('fieldset')!;
    fireEvent.change(within(revision).getByLabelText('Revision topics/sections'), { target: { value: '10' } });
    fireEvent.change(within(revision).getByLabelText('Revision minutes per section'), { target: { value: '5' } });
    fireEvent.change(within(revision).getByLabelText(/Previously reviewed/), { target: { value: '50' } });
    fireEvent.click(within(revision).getByRole('button', { name: 'Calculate workload time' }));
    expect((screen.getByLabelText('Chapter revision minutes') as HTMLInputElement).value).toBe('38');
    fireEvent.change(screen.getByLabelText('Chosen playback speed', { exact: false }), { target: { value: '2' } });
    expect((screen.getByLabelText('Note making minutes') as HTMLInputElement).value).toBe('45');
    next(); fireEvent.click(screen.getByRole('button', { name: 'Save this availability & S routine' })); act(() => h.confirm()!.action());
    expect(h.data().personalRoutine!.workloads[PERSONAL_IDS[0]].notes.calculation).toEqual({ quantity: 8, unitMinutes: 4, difficulty: 'hard' });
    expect(h.data().personalRoutine!.workloads[PERSONAL_IDS[0]].revision.minutes).toBe(38);
    expect(h.data().completed).toEqual({});
  });
});

describe('six-group completion and dashboard UI', () => {
  it('does not leave the actual S dashboard without the saved-data backup reminder', () => {
    const data = personalDataFixture(), before = JSON.stringify(data);
    harness(data, <PersonalStudyHome />);
    expect(screen.getByText('No backup recorded yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save backup' })).toBeTruthy();
    expect(JSON.stringify(data)).toBe(before);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
  it('labels Analytics as the current phase, separates six-group coverage/readiness, and uses availability rather than legacy hours', () => {
    const data = personalDataFixture(), original = structuredClone(data);
    harness(data, <AnalyticsView />);
    expect(screen.getByText('Current S phase')).toBeTruthy();
    expect(screen.queryByText('Whole syllabus')).toBeNull(); expect(screen.queryByText('Highest priority')).toBeNull(); expect(screen.queryByText('as planned')).toBeNull();
    expect(screen.getByRole('group', { name: 'Current-phase coverage and readiness' }).textContent).toContain('Syllabus Coverage');
    expect(screen.getByRole('group', { name: 'Current-phase coverage and readiness' }).textContent).toContain('Exam Readiness');
    expect(screen.getByText('Today’s availability cap 270 min')).toBeTruthy();
    expect(screen.getByText('Not enough evidence')).toBeTruthy(); expect(data).toEqual(original);
  });
  it('does not invent an Analytics finish date for an unknown mandatory workload', () => {
    const data = personalDataFixture(); data.personalRoutine!.workloads[PERSONAL_IDS[0]].notes.minutes = null;
    harness(data, <AnalyticsView />);
    expect(screen.getByText('Not all work has a valid allocation')).toBeTruthy(); expect(screen.getByText('Not enough evidence')).toBeTruthy();
  });
  it('removes personal status/bulk-complete bypasses, keeps old assessment/notes and requires each of the six groups', () => {
    const data = personalDataFixture(), id = PERSONAL_IDS[0];
    data.chapterMeta[id] = { note: 'Keep my note', stage: 'completed', cq: 'ready', mcq: 'ready', weak: false, updatedAt: '2026-11-16T09:00:00Z' };
    const h = harness(data, <ChapterModal chapter={chapterById[id]} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Chapter status')).toBeNull(); expect(screen.queryByRole('button', { name: 'Mark chapter complete' })).toBeNull();
    expect(screen.getByText(/Retained old self-assessment/)).toBeTruthy();
    const groups = screen.getByRole('region', { name: 'Three chapter sessions' });
    expect(groups.querySelectorAll('fieldset')).toHaveLength(3);
    for (const summary of within(groups).getAllByText('Individual work and previous progress')) fireEvent.click(summary);
    for (const name of ['Chapter class', 'Textbook reading', 'Note making', 'Own MCQ practice', 'Own CQ practice']) fireEvent.click(within(groups).getByRole('checkbox', { name: new RegExp(`^${name}`) }));
    expect(personalChapterProgress(h.data().personalRoutine!, id, h.data().completed).fullyComplete).toBe(false);
    fireEvent.click(within(groups).getByRole('checkbox', { name: /^Chapter revision/ }));
    expect(personalChapterProgress(h.data().personalRoutine!, id, h.data().completed).fullyComplete).toBe(true);
    expect(within(groups).getByText(/Fully completed/)).toBeTruthy();
    expect(h.data().chapterMeta[id].note).toBe('Keep my note'); expect(h.data().chapterMeta[id].updatedAt).toBe('2026-11-16T09:00:00Z');
    fireEvent.click(within(groups).getByRole('checkbox', { name: /^Note making/ }));
    expect(personalChapterProgress(h.data().personalRoutine!, id, h.data().completed).fullyComplete).toBe(false);
  });
  it('shows this chapter’s retained prior allocations separately from actual confirmation times after availability changes', () => {
    let data = personalDataFixture(), plan = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, plan[0].tasks.slice(0, 2).map(task => task.id), true, plan);
    data.personalRoutine!.windows = data.personalRoutine!.windows.map(window => ({ ...window, startMinute: 480, endMinute: 600 }));
    harness(data, <ChapterModal chapter={chapterById[PERSONAL_IDS[0]]} onClose={vi.fn()} />);
    const history = screen.getByText(/Retained prior allocations & confirmation times/).closest('details')!;
    fireEvent.click(within(history).getByText(/Retained prior allocations/));
    expect(history.querySelectorAll('li')).toHaveLength(1);
    expect(history.textContent).toContain(chapterById[PERSONAL_IDS[0]].title);
    expect(history.textContent).not.toContain(chapterById[PERSONAL_IDS[1]].title);
    expect(history.textContent).toContain('Prior allocation'); expect(history.textContent).toContain('Last confirmation (Bangladesh time)');
    expect(history.querySelector('time')!.dateTime).toBe(Object.values(data.completed)[0]);
  });
  it('shows explicit S totals, coverage/readiness separately and offers the next phase only after every S group', () => {
    let data = personalDataFixture();
    const h = harness(data, <PersonalStudyHome />, '2026-11-24');
    expect(screen.getByText('S total:')).toBeTruthy(); expect(screen.getByText(/Syllabus Coverage/)).toBeTruthy(); expect(screen.getByText(/Exam Readiness/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Prepare next phase/ })).toBeNull();
    for (const id of PERSONAL_IDS) for (const stage of WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id))) data = setPersonalStageCompletion(data, id, stage.id, true);
    act(() => h.setData(data));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare next phase · A' }));
    next(); expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A phase chapters');
    next(); next(); fireEvent.click(screen.getByRole('button', { name: 'Save this phase routine' })); act(() => h.confirm()!.action());
    expect(h.data().personalRoutine!.scope).toBe('A'); expect(h.data().personalPhases!.S!.chapterIds).toEqual(PERSONAL_IDS);
    expect(h.data().personalRoutine!.startsOn).toBe('2026-11-24'); expect(h.navigate).toHaveBeenCalledWith('today');
    expect(parseBackup(localStorage.getItem(STORAGE_KEY)!)).toEqual(h.data());
  });
});

describe('upgrade an existing personal routine', () => {
  it('asks before adding every chapter and keeps existing notes and evidence', () => {
    const data = personalDataFixture([PERSONAL_IDS[0]]);
    data.notes[data.settings.startDate] = 'Keep note';
    const source = personalStageSourceId(data.personalRoutine!, PERSONAL_IDS[0], 'class');
    data.completed[source] = '2026-11-20T10:00:00.000Z';
    const h = harness(data, <PersonalStudyHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Add all chapters' }));
    expect(h.data().personalRoutine!.scope).toBe('S');
    act(() => h.confirm()!.action());
    expect(h.data().personalRoutine!.scope).toBe('ALL');
    expect(h.data().personalRoutine!.chapterIds).toHaveLength(114);
    expect(h.data().notes[data.settings.startDate]).toBe('Keep note');
    expect(h.data().completed[source]).toBeTruthy();
    expect(parseBackup(localStorage.getItem(STORAGE_KEY)!)).toEqual(h.data());
  });
  it('does not overwrite newer changes while confirmation is open', () => {
    const data = personalDataFixture(); const h = harness(data, <PersonalStudyHome />);
    fireEvent.click(screen.getByRole('button', { name: 'Add all chapters' }));
    act(() => h.setData({ ...data, notes: { ...data.notes, [data.settings.startDate]: 'newer' } }));
    act(() => h.confirm()!.action());
    expect(h.data().personalRoutine!.scope).toBe('S');
    expect(h.data().notes[data.settings.startDate]).toBe('newer');
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining('Data changed'), 'error');
  });
});


describe('selected routine and user-managed syllabus integration', () => {
  it('keeps the selected A category despite a chapter override and shows custom chapters outside the routine', () => {
    const sId = 'physics-1-3', aId = 'physics-1-2';
    const data = personalDataFixture([sId, aId]);
    data.personalRoutine = { ...data.personalRoutine!, scope: 'SELECTED', categories: { [sId]: 'S', [aId]: 'A' } };
    data.chapterOverrides = { [aId]: { priority: 'C' } };
    data.customChapters = [{ ...chapterById[aId], id: 'custom-physics-integrated', title: 'Custom chapter in library' }];
    harness(data, <SyllabusView />);
    expect(screen.getByText('Custom chapter in library')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'S · important only' }));
    expect(screen.getByText(chapterById[sId].title)).toBeTruthy();
    expect(screen.queryByText(chapterById[aId].title)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'A · Test priority' }));
    expect(screen.getByText(chapterById[aId].title)).toBeTruthy();
    expect(screen.queryByText(chapterById[sId].title)).toBeNull();
    expect(data.personalRoutine.chapterIds).toEqual([sId, aId]);
  });
});
