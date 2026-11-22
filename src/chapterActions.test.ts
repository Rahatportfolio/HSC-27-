import { describe, it, expect } from 'vitest';
import { answerAiQuestion } from './aiBrain';
import { freshData } from './planner';
import { parseBackup } from './storage';
import { applyChapterAction, mergedChapters } from './chapterStore';

describe('chapter assistant actions', () => {
  it('proposes changes without mutating and persists after confirmation and backup', () => {
    const data = freshData();
    const answer = answerAiQuestion('পদার্থে ‘নতুন বিষয়’ নামে অধ্যায় যোগ করো', data);
    expect(answer.kind).toBe('action');
    if (answer.kind !== 'action') throw Error('missing action');
    expect(data.customChapters).toHaveLength(0);
    const updated = applyChapterAction(data, answer.action);
    expect(updated.customChapters?.[0].title).toBe('নতুন বিষয়');
    const restored = parseBackup(JSON.stringify(updated));
    expect(restored.customChapters).toEqual(updated.customChapters);
    expect(mergedChapters(restored).some(c => c.title === 'নতুন বিষয়')).toBe(true);
  });
  it('moves and restores built-in overrides and never deletes built-ins', () => {
    const data = freshData();
    const answer = answerAiQuestion('পদার্থের ভেক্টর অধ্যায় দ্বিতীয় পত্রে রাখো', data);
    expect(answer.kind).toBe('action');
    if (answer.kind !== 'action') throw Error('missing action');
    const updated = applyChapterAction(data, answer.action);
    expect(mergedChapters(parseBackup(JSON.stringify(updated))).find(c => c.id === 'physics-1-2')?.paper).toBe(2);
    expect(answerAiQuestion('পদার্থ ভেক্টর অধ্যায় মুছে দাও', data).kind).toBe('unknown');
  });
});
