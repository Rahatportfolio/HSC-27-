// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ClassBlock, ClassLinkRow, LessonList } from './components';
import { BANGLA_LESSONS, CHAPTER_CLASSES } from './classLinks';

afterEach(() => cleanup());

describe('chapter class block', () => {
  it('groups the three class types and lists every teacher', () => {
    const classes = CHAPTER_CLASSES['physics-1-2'];
    render(<ClassBlock classes={classes} />);
    const kinds = screen.getAllByText(/^(ওয়ান শট|MCQ|CQ)$/);
    expect(kinds.map(node => node.textContent)).toEqual(['ওয়ান শট', 'MCQ', 'CQ']);
    const total = classes.oneShot.length + classes.mcq.length + classes.cq.length;
    expect(screen.getAllByRole('link')).toHaveLength(total);
    // every link says which teacher it belongs to and opens in a new tab
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\//);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute(`aria-label`)).toBeTruthy();
    }
  });

  it('keeps both physics teachers reachable on every physics chapter', () => {
    for (const [id, classes] of Object.entries(CHAPTER_CLASSES)) {
      if (!id.startsWith('physics')) continue;
      const names = [...classes.oneShot, ...classes.mcq, ...classes.cq].map(option => option.channel).join(' ');
      expect(names, id).toContain('রাকিব');
      expect(names, id).toContain('অপুর্ব');
    }
  });

  it('marks real classes and channel searches differently', () => {
    render(<ClassBlock classes={CHAPTER_CLASSES['chemistry-2-2']} />);
    const real = document.querySelectorAll('.class-link.real');
    const search = document.querySelectorAll('.class-link.search');
    expect(real.length).toBeGreaterThan(0);
    expect(search.length).toBeGreaterThan(0);
  });

  it('compact row shows one chip per class type', () => {
    render(<ClassLinkRow classes={CHAPTER_CLASSES['math-1-9']} />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('lists bangla lessons with a working fallback search link', () => {
    const group = Object.keys(BANGLA_LESSONS).find(id => BANGLA_LESSONS[id].some(lesson => !lesson.url))!;
    render(<LessonList lessons={BANGLA_LESSONS[group]} />);
    const block = screen.getByText('পাঠভিত্তিক ক্লাস').closest('.lesson-block') as HTMLElement;
    const rows = within(block).getAllByRole('link');
    expect(rows).toHaveLength(BANGLA_LESSONS[group].length);
    for (const row of rows) {
      expect(row.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/(watch\?v=|@shakibsirbangla\/search\?query=)/);
    }
    expect(within(block).getAllByText('ক্লাস').length).toBeGreaterThan(0);
    expect(within(block).getAllByText('খুঁজো').length).toBeGreaterThan(0);
  });
});
