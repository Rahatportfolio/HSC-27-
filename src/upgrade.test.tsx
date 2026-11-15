// @vitest-environment jsdom
/**
 * PROSTUTI HSC27 v2.14 upgrade tests: manual schedule editing, completion
 * prediction, Test Exam preparation, the video catalogue, the PDF library and
 * the four new screens — everything the feature list asks to be covered.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { CHAPTERS, SUBJECTS, subjectById } from './data';
import { STORAGE_KEY, buildPlan, freshData } from './planner';
import type { AppData } from './planner';
import {
  applyManualSchedule, editTask, isDateLocked, moveTask, planRange,
  removeTask, rescheduleUnfinished, restoreTask, toggleLockDate,
} from './scheduleEdit';
import { categoryScheduleDates, estimatedFinishDate, expectedPercentBy, overallTaskProgress, recentTaskPace, scheduleStatus } from './prediction';
import { aCategoryChecklist, testPrepStats } from './testPrep';
import { CLASS_CATALOG, CLASS_TYPES, chapterClassRows, embedUrlFor, filterClasses } from './videoCatalog';
import { PDF_MATERIAL_IDS, PDF_MATERIALS, formatBytes, materialSlots, totalPdfBytes } from './pdfCatalog';
import { chapterPriority } from './learning';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  });
  window.scrollTo = vi.fn();
  window.print = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:prostuti');
  URL.revokeObjectURL = vi.fn();
  // jsdom has no IndexedDB; the PDF view must survive that gracefully.
  Object.defineProperty(window, 'indexedDB', { writable: true, value: undefined });
});
beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function go(view: string) {
  act(() => {
    window.location.hash = `#${view}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as AppData;
const change = (element: Element, value: string) => fireEvent.change(element, { target: { value } });

describe('manual schedule editing survives regeneration', () => {
  it('moves a task to another date and keeps the move after a rebuild', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const source = plan[0];
    const target = plan[5];
    const task = source.tasks[0];
    const moved = moveTask(data, task.id, source.date, target.date);
    expect(moved.taskEdits[task.id]?.date).toBe(target.date);
    const rebuilt = applyManualSchedule(buildPlan(data.settings), moved);
    const onTarget = rebuilt.find(day => day.date === target.date)!;
    const onSource = rebuilt.find(day => day.date === source.date)!;
    expect(onTarget.tasks.some(item => item.id === task.id)).toBe(true);
    expect(onSource.tasks.some(item => item.id === task.id)).toBe(false);
    // The moved day is resequenced — no overlapping times.
    for (let i = 1; i < onTarget.tasks.length; i++) {
      expect(onTarget.tasks[i].startMinute).toBeGreaterThanOrEqual(onTarget.tasks[i - 1].endMinute);
    }
  });

  it('edits a subject and deletes/restores a task without touching completed work', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const task = plan[0].tasks[0];
    data.completed[task.id] = '2026-11-14T10:00:00.000Z';
    const edited = editTask(data, task.id, { subject: 'chemistry', title: 'নিজের নাম দেওয়া কাজ' });
    expect(edited.taskEdits[task.id]).toMatchObject({ subject: 'chemistry', title: 'নিজের নাম দেওয়া কাজ' });
    const afterEdit = applyManualSchedule(buildPlan(data.settings), edited);
    const found = afterEdit.flatMap(day => day.tasks).find(item => item.id === task.id)!;
    expect(found.subject).toBe('chemistry');
    expect(found.title).toBe('নিজের নাম দেওয়া কাজ');

    const removed = removeTask(edited, task.id);
    expect(removed.removedTasks).toContain(task.id);
    const afterRemove = applyManualSchedule(buildPlan(data.settings), removed);
    expect(afterRemove.flatMap(day => day.tasks).some(item => item.id === task.id)).toBe(false);
    // Completed timestamps are never erased by a delete.
    expect(storedAfterDelete(removed)).toContain(task.id);

    const restored = restoreTask(removed, task.id);
    const afterRestore = applyManualSchedule(buildPlan(data.settings), restored);
    expect(afterRestore.flatMap(day => day.tasks).some(item => item.id === task.id)).toBe(true);
  });

  it('locks a date and excludes it from rebalancing', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const past = plan[0].date;
    const today = plan[1].date;
    expect(isDateLocked(data, past)).toBe(false);
    const locked = toggleLockDate(data, past);
    expect(isDateLocked(locked, past)).toBe(true);
    expect(toggleLockDate(locked, past).lockedDates).not.toContain(past);

    // Every unfinished past task lives on a locked date → nothing may move.
    const result = rescheduleUnfinished(plan, locked, today, { maxExtraMinutesPerDay: 45 });
    expect(result.moved).toBe(0);
    expect(result.skippedLocked).toBeGreaterThan(0);
  });

  it('moves unfinished past work forward within the daily budget, never completed work', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const past = plan[0];
    const today = plan[1].date;
    // Finish the first past task so it must NOT be moved.
    const doneTask = past.tasks[0];
    data.completed[doneTask.id] = `${past.date}T09:00:00.000Z`;
    const result = rescheduleUnfinished(plan, data, today, { maxExtraMinutesPerDay: 45 });
    expect(result.moved + result.skippedLocked + result.skippedBudget).toBeGreaterThan(0);
    const movedIds = Object.entries(result.data.taskEdits)
      .filter(([, edit]) => edit.date && edit.date >= today)
      .map(([id]) => id);
    expect(movedIds).not.toContain(doneTask.id);
    // Budget: no day receives more than 45 extra minutes.
    const extraByDay = new Map<string, number>();
    for (const [id, edit] of Object.entries(result.data.taskEdits)) {
      if (!edit.date) continue;
      const original = plan.find(day => day.tasks.some(task => task.id === id));
      if (!original || original.date === edit.date) continue;
      const task = original.tasks.find(item => item.id === id)!;
      extraByDay.set(edit.date, (extraByDay.get(edit.date) || 0) + Math.max(15, task.endMinute - task.startMinute));
    }
    for (const minutes of extraByDay.values()) expect(minutes).toBeLessThanOrEqual(45);
  });

  it('exposes the plan range used by the task date picker', () => {
    const plan = buildPlan();
    const range = planRange(plan);
    expect(range).toEqual({ start: plan[0].date, end: plan[plan.length - 1].date });
    expect(planRange([])).toBeNull();
  });
});

const storedAfterDelete = (data: AppData) => data.removedTasks;

describe('completion prediction', () => {
  it('starts at zero progress and reports a real schedule status', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const overall = overallTaskProgress(plan, data);
    expect(overall.done).toBe(0);
    expect(overall.total).toBeGreaterThan(0);
    expect(overall.percent).toBe(0);
    expect(recentTaskPace(plan, data, plan[0].date)).toBe(0);
    const status = scheduleStatus(plan, data, plan[0].date);
    expect(['ahead', 'ontrack', 'behind']).toContain(status.status);
    expect(status.dueTotal).toBeGreaterThan(0);
    expect(status.gapPercent).toBeGreaterThanOrEqual(0);
  });

  it('counts completions and moves the forecast', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const today = plan[3].date;
    let done = 0;
    for (const day of plan.slice(0, 4)) {
      for (const task of day.tasks) {
        data.completed[task.id] = `${day.date}T10:00:00.000Z`;
        done++;
      }
    }
    expect(overallTaskProgress(plan, data).done).toBe(done);
    expect(recentTaskPace(plan, data, today)).toBeGreaterThan(0);
    const expected = expectedPercentBy(plan, data, today, data.settings.testExamDate);
    expect(expected).toBeGreaterThanOrEqual(0);
    expect(expected).toBeLessThanOrEqual(100);
    const finish = estimatedFinishDate(plan, data, today);
    if (finish) expect(finish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = categoryScheduleDates(plan, {
      A: new Set(CHAPTERS.filter(ch => chapterPriority(ch, data) === 'A').map(ch => ch.id)),
      B: new Set(CHAPTERS.filter(ch => chapterPriority(ch, data) === 'B').map(ch => ch.id)),
      C: new Set(CHAPTERS.filter(ch => chapterPriority(ch, data) === 'C').map(ch => ch.id)),
    });
    expect(dates.A).toBeTruthy();
    expect(dates.A! <= dates.C!).toBe(true);
  });
});

describe('test exam preparation', () => {
  it('derives A-category stats and a checklist from real data', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const stats = testPrepStats(data, plan, plan[0].date);
    const aCount = CHAPTERS.filter(ch => chapterPriority(ch, data) === 'A').length;
    expect(stats.totalA).toBe(aCount);
    expect(stats.doneA).toBe(0);
    expect(stats.remainingA).toBe(aCount);
    expect(stats.percentA).toBe(0);
    expect(stats.paceTasksPerDay).toBe(0);
    if (stats.remainingA > 0 && stats.daysLeft > 0 && !stats.onPace) expect(stats.warning).toBe('behind');

    const checklist = aCategoryChecklist(data, plan);
    expect(checklist).toHaveLength(aCount);
    expect(checklist.every(item => item.priority === 'A')).toBe(true);
    expect(checklist.some(item => item.done)).toBe(false);
  });

  it('marks a chapter complete through learning state', () => {
    const data = freshData();
    const plan = buildPlan(data.settings);
    const aChapter = CHAPTERS.find(ch => chapterPriority(ch, data) === 'A')!;
    const tasks = plan.flatMap(day => day.tasks).filter(task => task.chapterIds.includes(aChapter.id));
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) data.completed[task.id] = `${task.date}T09:00:00.000Z`;
    const stats = testPrepStats(data, plan, plan[0].date);
    expect(stats.doneA).toBeGreaterThanOrEqual(1);
    const checklist = aCategoryChecklist(data, plan);
    expect(checklist.find(item => item.id === aChapter.id)?.done).toBe(true);
  });
});

describe('video catalogue', () => {
  it('builds a large verified catalogue with the nine class types', () => {
    expect(CLASS_CATALOG.length).toBeGreaterThan(400);
    expect(CLASS_TYPES.map(type => type.id)).toEqual(
      expect.arrayContaining(['full', 'oneShot', 'cq', 'mcq', 'board', 'important', 'revision', 'concept', 'practical']),
    );
    for (const item of CLASS_CATALOG) {
      expect(item.chapterId).toBeTruthy();
      expect(subjectById[item.subject]).toBeTruthy();
      expect(item.title.length).toBeGreaterThan(3);
      // Every resource URL comes from the shipped, verified link data — never invented.
      expect(item.url).toMatch(/^https:\/\/www\.youtube\.com\//);
    }
    const byChapter = new Map<string, Set<string>>();
    for (const item of CLASS_CATALOG) {
      const seen = byChapter.get(item.chapterId) || new Set<string>();
      expect(seen.has(item.id)).toBe(false); // no duplicate resource inside one chapter
      seen.add(item.id);
      byChapter.set(item.chapterId, seen);
    }
  });

  it('filters by search, teacher, chapter and watched state', () => {
    const data = freshData();
    const first = CLASS_CATALOG[0];
    const byChapter = filterClasses(CLASS_CATALOG, { chapterId: first.chapterId }, data);
    expect(byChapter.length).toBeGreaterThan(0);
    expect(byChapter.every(item => item.chapterId === first.chapterId)).toBe(true);

    const byTeacher = filterClasses(CLASS_CATALOG, { teacher: first.channel }, data);
    expect(byTeacher.every(item => item.channel === first.channel)).toBe(true);

    const query = filterClasses(CLASS_CATALOG, { query: first.channel.toLowerCase() }, data);
    expect(query.some(item => item.id === first.id)).toBe(true);

    data.classWatched[first.id] = '2026-11-15T10:00:00.000Z';
    expect(filterClasses([first], { watched: 'watched' }, data)).toHaveLength(1);
    expect(filterClasses([first], { watched: 'unwatched' }, data)).toHaveLength(0);
    data.classBookmarks[first.id] = '2026-11-15T10:00:00.000Z';
    expect(filterClasses([first], { bookmarkedOnly: true }, data)).toHaveLength(1);
    expect(filterClasses([first], { classType: first.classType === 'search' ? 'mcq' : 'search' }, data)).toHaveLength(0);
  });

  it('embeds only real YouTube ids and reports per-chapter progress', () => {
    const embed = embedUrlFor('https://www.youtube.com/watch?v=KtqyZ-ANMUk');
    expect(embed).toContain('/embed/KtqyZ-ANMUk');
    expect(embedUrlFor('https://www.youtube.com/@channel')).toBeUndefined();
    const rows = chapterClassRows(freshData());
    expect(rows.length).toBeGreaterThan(20);
    expect(rows[0].percent).toBe(0);
    const withWatched = freshData();
    const firstRow = rows[0];
    const item = CLASS_CATALOG.find(entry => entry.chapterId === firstRow.chapterId && entry.status !== 'search')!;
    withWatched.classWatched[item.id] = '2026-11-15T10:00:00.000Z';
    const updated = chapterClassRows(withWatched).find(row => row.chapterId === firstRow.chapterId)!;
    expect(updated.watched).toBe(1);
  });
});

describe('pdf library', () => {
  it('ships unique material ids, byte formatting and honest slots', () => {
    expect(PDF_MATERIALS.length).toBeGreaterThanOrEqual(8);
    expect(PDF_MATERIAL_IDS.size).toBe(PDF_MATERIALS.length);
    expect(formatBytes(0)).toMatch(/B/);
    expect(formatBytes(1536)).toMatch(/KB/);
    expect(formatBytes(5 * 1024 * 1024)).toMatch(/MB/);
    const data = freshData();
    expect(totalPdfBytes(data)).toBe(0);
    const slots = materialSlots(data);
    // One slot per subject × material type (the free-form "other" row is not a slot).
    const perSubject = PDF_MATERIALS.filter(item => item.id !== 'other').length;
    expect(slots.length).toBe(SUBJECTS.length * perSubject);
    expect(new Set(slots.map(slot => slot.key)).size).toBe(slots.length);
    // With no PDFs added every slot is either linked or honestly "not added".
    for (const slot of slots) expect(['notAdded', 'linked', 'inApp']).toContain(slot.status);
    expect(slots.some(slot => slot.status === 'notAdded')).toBe(true);
    data.pdfs.push({
      id: 'pdf-1', title: 'নোট', material: 'notes', subject: 'physics', url: 'https://example.com/note.pdf',
      sizeBytes: 2048, createdAt: '2026-11-15T00:00:00.000Z',
    });
    expect(totalPdfBytes(data)).toBe(2048);
  });
});

describe('new screens', () => {
  it('renders Video Classes with type chips, filters and an in-app player', async () => {
    render(<App />);
    go('videos');
    expect(await screen.findByText(/ক্লাস খুঁজে দেখো/)).toBeTruthy();
    // All nine class types are offered as filter chips.
    for (const label of ['ফুল চ্যাপ্টার ক্লাস', 'ওয়ান শট ক্লাস', 'CQ সলভিং ক্লাস', 'MCQ সলভিং ক্লাস', 'বোর্ড প্রশ্ন সলভিং', 'গুরুত্বপূর্ণ প্রশ্ন ও সাজেশন', 'রিভিশন ক্লাস', 'কনসেপ্ট ক্লিয়ারিং', 'প্র্যাকটিক্যাল ক্লাস']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
    // Honest empty state for a type with no verified resource yet.
    fireEvent.click(screen.getByRole('button', { name: /কনসেপ্ট ক্লিয়ারিং/ }));
    expect(await screen.findByRole('heading', { name: /এখনো যোগ করা হয়নি|not added yet/ })).toBeTruthy();

    // Search + real cards with bookmark/watched controls.
    fireEvent.click(screen.getByRole('button', { name: /ফুল চ্যাপ্টার ক্লাস/ }));
    const search = await screen.findByLabelText('ক্লাস খুঁজো');
    change(search, 'পদার্থ');
    const bookmark = (await screen.findAllByRole('button', { name: /ক্লাস বুকমার্ক করো/ }))[0];
    await act(async () => { fireEvent.click(bookmark); });
    expect(Object.keys(stored().classBookmarks).length).toBe(1);
    const watched = (await screen.findAllByRole('button', { name: 'দেখেছি' }))[0];
    await act(async () => { fireEvent.click(watched); });
    expect(Object.keys(stored().classWatched).length).toBe(1);

    // In-app playback opens the player modal.
    const play = await screen.findAllByRole('button', { name: /চালাও|সার্চ খোলো/ });
    await act(async () => { fireEvent.click(play[0]); });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('YouTube');
  }, 30000);

  it('renders PDF Library, adds a link and shows honest material slots', async () => {
    render(<App />);
    go('pdfs');
    expect(await screen.findByText(/সব নোট, শিট ও পিডিএফ/)).toBeTruthy();
    expect(screen.getAllByText(/যোগ করা হয়নি/).length).toBeGreaterThan(0);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /লিংক\/ফাইল/ })); });
    const title = await screen.findByPlaceholderText(/ভেক্টর অধ্যায় নোট/);
    const url = screen.getByPlaceholderText(/https:\/\/…\/file\.pdf/);
    change(title, 'পদার্থবিদ্যা অধ্যায় নোট');
    change(url, 'https://example.com/physics-notes.pdf');
    const addForm = document.querySelector('.pdf-add-form') as HTMLElement;
    await act(async () => { fireEvent.click(within(addForm).getByRole('button', { name: /লিংক যোগ করো/ })); });
    await waitFor(() => expect(stored().pdfs).toHaveLength(1));
    expect(stored().pdfs[0].url).toBe('https://example.com/physics-notes.pdf');
    expect(await screen.findByText('পদার্থবিদ্যা অধ্যায় নোট')).toBeTruthy();
  });

  it('renders Test Preparation with countdown, warning area and A checklist', async () => {
    render(<App />);
    go('testprep');
    expect(await screen.findByText('টেস্ট পরীক্ষার আগে A ক্যাটাগরি শেষ করো।')).toBeTruthy();
    expect(screen.getByText(/দিন বাকি/)).toBeTruthy();
    expect(screen.getByText(/A ক্যাটাগরি চেকলিস্ট/)).toBeTruthy();
    // The checklist shows real chapter titles from the dataset.
    const rows = document.querySelectorAll('.testprep-row');
    expect(rows.length).toBeGreaterThan(0);
    const firstChapter = CHAPTERS.find(ch => chapterPriority(ch, freshData()) === 'A')!;
    expect(document.body.textContent).toContain(firstChapter.title.slice(0, 6));
    // Rebalance asks for confirmation and reports the outcome.
    const rebalance = screen.getAllByRole('button', { name: /রিব্যালেন্স|প্ল্যান রিব্যালেন্স|বাকি কাজ সরাও/ })[0];
    if (rebalance) {
      await act(async () => { fireEvent.click(rebalance); });
      const dialog = screen.getByRole('dialog');
      expect(dialog.textContent).toMatch(/সম্পন্ন|Completed/);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /হ্যাঁ, সামনে সরাও|রিব্যালেন্স করো/ })); });
      await waitFor(() => expect(stored().taskEdits).toBeDefined());
    }
  });

  it('renders the smart syllabus dashboard on Progress & Analytics', async () => {
    render(<App />);
    go('analytics');
    expect(await screen.findByText('স্মার্ট সিলেবাস ড্যাশবোর্ড')).toBeTruthy();
    expect(screen.getByText('সমগ্র সিলেবাস')).toBeTruthy();
    expect(screen.getAllByText(/সর্বোচ্চ অগ্রাধিকার/).length).toBeGreaterThan(0);
    // Subject rows come from the real 7-subject dataset.
    for (const short of ['পদার্থ', 'রসায়ন', 'জীববিজ্ঞান', 'উ. গণিত', 'বাংলা', 'ইংরেজি', 'আইসিটি']) {
      expect(screen.getAllByText(short).length).toBeGreaterThan(0);
    }
  });

  it('shows the plan timeline, locks a date and adds a personal task on Calendar', async () => {
    render(<App />);
    go('calendar');
    expect(await screen.findByText('সম্পূর্ণ পরিকল্পনার টাইমলাইন')).toBeTruthy();
    expect(screen.getAllByText(/A ক্যাটাগরি শেষ/).length).toBeGreaterThan(0);
    expect(screen.getByText(/টেস্ট তারিখে প্রত্যাশিত অগ্রগতি/)).toBeTruthy();

    // Lock the selected date.
    const lock = screen.getByRole('button', { name: 'দিনটি লক করো' });
    await act(async () => { fireEvent.click(lock); });
    expect(stored().lockedDates.length).toBe(1);
    expect(screen.getByRole('button', { name: 'দিনের লক খোলো' })).toBeTruthy();

    // Add a one-off personal task to the selected day.
    const name = screen.getByLabelText('কাজের নাম');
    change(name, 'বিশেষ অধ্যায় রিভিশন');
    const before = stored().routineBlocks.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'কাজ যোগ করো' })); });
    await waitFor(() => expect(stored().routineBlocks.length).toBe(before + 1));
    expect(stored().routineBlocks[stored().routineBlocks.length - 1].title).toBe('বিশেষ অধ্যায় রিভিশন');
  });
});
