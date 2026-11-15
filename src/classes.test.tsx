// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { freshData } from './planner';
import { CHAPTER_CLASSES, BANGLA_LESSONS } from './classLinks';
import { allOptions, chapterClassProgress, classProgress, isWatched, lessonKey, realOptions, toggleClassWatched, unwatchedChapters } from './classes';
import { ClassBlock, LessonList } from './components';
import { PlannerContext } from './context';
import type { PlannerContextValue } from './context';

afterEach(() => cleanup());

const AT = '2026-11-14T09:00:00Z';
const bnDigits = (value: string) => value.replace(/[0-9]/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)]);

describe('class-watched tracker', () => {
  it('counts only direct links, never channel searches', () => {
    const classes = CHAPTER_CLASSES['physics-1-2'];
    expect(realOptions(classes).every(option => option.kind !== 'search')).toBe(true);
    expect(realOptions(classes).length).toBeGreaterThanOrEqual(6);
    expect(realOptions(classes).length).toBeLessThan(allOptions(classes).length);
    const progress = chapterClassProgress(freshData(), 'physics-1-2');
    expect(progress).toEqual({ total: realOptions(classes).length, watched: 0, percent: 0 });
  });

  it('ticks and un-ticks one link at a time', () => {
    const url = realOptions(CHAPTER_CLASSES['physics-1-2'])[0].url;
    let data = freshData();
    data = toggleClassWatched(data, url, AT);
    expect(isWatched(data, url)).toBe(true);
    expect(chapterClassProgress(data, 'physics-1-2').watched).toBe(1);
    data = toggleClassWatched(data, url, AT);
    expect(isWatched(data, url)).toBe(false);
    expect(data.classWatched).toEqual({});
  });

  it('caps the record and drops the oldest marks first', () => {
    let data = freshData();
    for (let index = 0; index < 1005; index += 1) {
      data = toggleClassWatched(data, `url-${index}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString());
    }
    const keys = Object.keys(data.classWatched);
    expect(keys).toHaveLength(1000);
    expect(keys).not.toContain('url-0');
    expect(keys).toContain('url-1004');
  });

  it('counts Bangla lesson videos in the library total', () => {
    const lessonUrls = Object.values(BANGLA_LESSONS).flat().filter(lesson => lesson.url).map(lesson => lesson.url!);
    const chapterUrls = Object.values(CHAPTER_CLASSES).flatMap(realOptions).map(option => option.url);
    const expected = new Set([...lessonUrls, ...chapterUrls]).size;
    expect(classProgress(freshData()).total).toBe(expected);
    expect(classProgress(freshData()).watched).toBe(0);
  });

  it('lists the chapters that still have an unwatched class', () => {
    const data = freshData();
    const ids = Object.keys(CHAPTER_CLASSES).filter(id => realOptions(CHAPTER_CLASSES[id]).length > 0);
    expect(unwatchedChapters(data, ids)).toEqual(ids);
    const first = ids[0];
    const next = realOptions(CHAPTER_CLASSES[first]).map(option => option.url)
      .reduce((acc, url) => toggleClassWatched(acc, url, AT), data);
    expect(unwatchedChapters(next, ids)).not.toContain(first);
    // Chapter ids that only offer channel searches are never reported as "unwatched".
    expect(unwatchedChapters(data, ['math-1-1'])).toEqual(
      realOptions(CHAPTER_CLASSES['math-1-1']).length ? ['math-1-1'] : []);
  });
});

function harness(overrides: Partial<PlannerContextValue> = {}): PlannerContextValue {
  const data = freshData();
  return {
    data, setData: () => undefined, plan: [], today: '2026-11-14', now: new Date('2026-11-14T09:00:00Z'),
    view: 'syllabus', navigate: () => undefined, selectedDate: '2026-11-14', setSelectedDate: () => undefined,
    notify: () => undefined, toggleTask: () => undefined, openChapter: () => undefined, openExam: () => undefined,
    openMistake: () => undefined, confirm: () => undefined, exportICS: () => undefined, storageOk: true,
    timer: {} as PlannerContextValue['timer'], logSession: () => undefined, startTimer: () => undefined,
    setTheme: () => undefined, setFontScale: () => undefined, screenAwake: false,
    ...overrides,
  };
}

describe('class UI inside the app', () => {
  it('shows a tick button on every direct link and a live progress line', () => {
    const value = harness();
    const url = realOptions(CHAPTER_CLASSES['physics-1-2'])[0].url;
    const withTick = { ...value, data: { ...value.data, classWatched: { [url]: AT } } };
    render(<PlannerContext.Provider value={withTick}><ClassBlock classes={CHAPTER_CLASSES['physics-1-2']} /></PlannerContext.Provider>);
    const real = realOptions(CHAPTER_CLASSES['physics-1-2']);
    const ticks = document.querySelectorAll('.class-watch');
    expect(ticks).toHaveLength(real.length);
    expect(document.querySelectorAll('.class-watch.on')).toHaveLength(1);
    expect(screen.getByText(new RegExp(`১/${bnDigits(String(real.length))} ক্লাস দেখা হয়েছে`))).toBeTruthy();
  });

  it('shows the lesson progress and ticks a lesson video', () => {
    const value = harness();
    const group = Object.keys(BANGLA_LESSONS).find(id => BANGLA_LESSONS[id].filter(lesson => lesson.url).length >= 2)!;
    const lesson = BANGLA_LESSONS[group].find(item => item.url)!;
    const withTick = { ...value, data: { ...value.data, classWatched: { [lessonKey(lesson.title)]: AT, [lesson.url!]: AT } } };
    render(<PlannerContext.Provider value={withTick}><LessonList lessons={BANGLA_LESSONS[group]} /></PlannerContext.Provider>);
    const ready = BANGLA_LESSONS[group].filter(item => item.url).length;
    expect(screen.getByText(new RegExp(`১/${bnDigits(String(ready))} ক্লাস দেখা হয়েছে`))).toBeTruthy();
    expect(document.querySelectorAll('.class-watch.on')).toHaveLength(1);
  });
});
