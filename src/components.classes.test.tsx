// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ClassBlock, ClassLinkRow, LessonList } from './components';
import { BANGLA_LESSONS, CHAPTER_CLASSES } from './classLinks';

afterEach(() => cleanup());

describe('chapter class block', () => {
  it('groups the three class blocks in One-Shot → CQ Solving → MCQ Solving order with direct + search links', () => {
    const classes = CHAPTER_CLASSES['physics-1-2'];
    render(<ClassBlock classes={classes} />);
    const kinds = screen.getAllByText(/^(ওয়ান শট ক্লাস|CQ সলভিং ক্লাস|MCQ সলভিং ক্লাস)$/);
    expect(kinds.map(node => node.textContent)).toEqual(['ওয়ান শট ক্লাস', 'CQ সলভিং ক্লাস', 'MCQ সলভিং ক্লাস']);
    const total = classes.oneShot.length + classes.cq.length + classes.mcq.length;
    expect(screen.getAllByRole('link')).toHaveLength(total);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/(watch\?v=|playlist\?list=|@[\w]+\/search\?query=)/);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('provides both verified direct video/playlist links and teacher channel search links across every chapter', () => {
    for (const [id, classes] of Object.entries(CHAPTER_CLASSES)) {
      for (const slot of ['oneShot', 'cq', 'mcq'] as const) {
        expect(classes[slot].filter(option => option.kind === 'video' || option.kind === 'playlist').length, `${id}:${slot}`).toBeGreaterThanOrEqual(2);
      }
      const all = [...classes.oneShot, ...classes.cq, ...classes.mcq];
      expect(all.some(option => option.kind === 'search'), `${id}:search`).toBe(true);
    }
  });

  it('marks real classes and synthetic channel searches differently', () => {
    const base = CHAPTER_CLASSES['chemistry-2-2'];
    render(<ClassBlock classes={base} />);
    const real = document.querySelectorAll('.class-link.real');
    const search = document.querySelectorAll('.class-link.search');
    expect(real.length).toBeGreaterThanOrEqual(6);
    expect(search.length).toBeGreaterThanOrEqual(3);
  });

  it('compact row shows one chip per class block in One-Shot → CQ → MCQ order', () => {
    render(<ClassLinkRow classes={CHAPTER_CLASSES['math-1-9']} />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('every bangla lesson opens a real class', () => {
    const lessons = Object.values(BANGLA_LESSONS).flat();
    expect(lessons.length).toBeGreaterThan(20);
    expect(lessons.filter(lesson => !lesson.url)).toEqual([]);
  });

  it('lists bangla lessons with a working fallback search link', () => {
    const lessons = [...BANGLA_LESSONS['bangla-1-গদ-য-১'].slice(0, 2), { title: 'নতুন পাঠ' }];
    render(<LessonList lessons={lessons} />);
    const block = screen.getByText('পাঠভিত্তিক ক্লাস').closest('.lesson-block') as HTMLElement;
    const rows = within(block).getAllByRole('link');
    expect(rows).toHaveLength(lessons.length);
    for (const row of rows) {
      expect(row.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/(watch\?v=|@shakibsirbangla\/search\?query=)/);
    }
    expect(within(block).getAllByText('ক্লাস').length).toBeGreaterThan(0);
    expect(within(block).getAllByText('খুঁজো').length).toBeGreaterThan(0);
  });
});
