import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { buildPlan, chapterTasks, freshData } from './planner';
import { completeRevision, completeRevisionWithRecall, ensureRevisions, recallSummary, revisionBuckets, revisionDueCount, snoozeRevision } from './revision';

const plan = buildPlan();
const physics = CHAPTERS[0];
const tasks = chapterTasks(plan, physics.id);

function completedChapter() {
  const data = freshData();
  for (const task of tasks) data.completed[task.id] = '2026-11-14T08:00:00.000Z';
  return data;
}
describe('1/3/7/14/30-day revision engine', () => {
  it('creates five cards from the day the last chapter part was completed', () => {
    const data = ensureRevisions(plan, completedChapter());
    const cards = data.revisions.filter(item => item.chapterId === physics.id);
    expect(cards.map(card => card.interval).sort((a, b) => a - b)).toEqual([1, 3, 7, 14, 30]);
    expect(cards.every(card => card.dueDate >= '2026-11-15')).toBe(true);
    expect(cards.find(card => card.interval === 1)?.dueDate).toBe('2026-11-15');
    expect(cards.find(card => card.interval === 30)?.dueDate).toBe('2026-12-14');
  });
  it('uses the Dhaka calendar date of a late-night completion', () => {
    const data = freshData();
    for (const task of tasks) data.completed[task.id] = '2026-11-14T20:00:00.000Z';
    const next = ensureRevisions(plan, data);
    expect(next.revisions.find(card => card.chapterId === physics.id && card.interval === 1)?.dueDate).toBe('2026-11-16');
  });
  it('is idempotent and returns the same object when nothing changed', () => {
    const once = ensureRevisions(plan, completedChapter());
    const twice = ensureRevisions(plan, once);
    expect(twice).toBe(once);
    expect(twice.revisions.filter(item => item.chapterId === physics.id)).toHaveLength(5);
  });
  it('withdraws pending cards when a chapter becomes incomplete but keeps history', () => {
    let data = ensureRevisions(plan, completedChapter());
    const card = data.revisions.find(item => item.chapterId === physics.id)!;
    data = completeRevision(data, card.id, '2026-11-15T08:00:00.000Z');
    delete data.completed[tasks[0].id];
    const next = ensureRevisions(plan, data);
    const remaining = next.revisions.filter(item => item.chapterId === physics.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].completedAt).toBeTruthy();
  });
  it('does not schedule when revision setting is disabled', () => {
    const data = completedChapter();
    data.settings.revisionEnabled = false;
    expect(ensureRevisions(plan, data)).toBe(data);
  });
  it('buckets due, overdue and snoozed cards by Dhaka date', () => {
    let data = ensureRevisions(plan, completedChapter());
    const [first, second] = data.revisions.filter(item => item.chapterId === physics.id).sort((a, b) => a.interval - b.interval);
    data = completeRevision(data, first.id, '2026-11-15T08:00:00.000Z');
    const buckets = revisionBuckets(data.revisions, '2026-11-20');
    expect(buckets.overdue.some(item => item.id === second.id)).toBe(true);
    expect(buckets.completed.some(item => item.id === first.id)).toBe(true);
    expect(revisionDueCount(data, '2026-11-20')).toBeGreaterThanOrEqual(1);
    const snoozed = snoozeRevision(data, second.id, '2026-11-20', 2);
    expect(snoozed.revisions.find(item => item.id === second.id)?.dueDate).toBe('2026-11-22');
  });

  it('pulls the next card to tomorrow when the recall was weak', () => {
    let data = ensureRevisions(plan, completedChapter());
    const first = data.revisions.filter(item => item.chapterId === physics.id).sort((a, b) => a.interval - b.interval)[0];
    const outcome = completeRevisionWithRecall(data, first.id, 'weak', '2026-11-15');
    data = outcome.data;
    const pending = data.revisions.filter(item => item.chapterId === physics.id && !item.completedAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(pending[0].dueDate).toBe('2026-11-16');
    expect(pending[0].adjusted).toBe(true);
    expect(data.revisions.find(item => item.id === first.id)?.recall).toBe('weak');
    // The adaptation must survive the automatic scheduler.
    const rescheduled = ensureRevisions(plan, data);
    expect(rescheduled.revisions.find(item => item.id === pending[0].id)?.dueDate).toBe('2026-11-16');
  });
  it('moves the next card three days out for an okay recall and leaves a good one alone', () => {
    let data = ensureRevisions(plan, completedChapter());
    const cards = data.revisions.filter(item => item.chapterId === physics.id).sort((a, b) => a.interval - b.interval);
    const okay = completeRevisionWithRecall(data, cards[0].id, 'okay', '2026-11-15');
    const okayPending = okay.data.revisions.filter(item => item.chapterId === physics.id && !item.completedAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    expect(okayPending.dueDate).toBe('2026-11-18');
    const good = completeRevisionWithRecall(data, cards[0].id, 'good', '2026-11-15');
    expect(good.dueDate).toBeNull();
    expect(good.data.revisions.filter(item => item.chapterId === physics.id && !item.completedAt)).toHaveLength(4);
  });
  it('creates a fresh card when a weak recall has nothing left to pull', () => {
    let data = ensureRevisions(plan, completedChapter());
    const cards = data.revisions.filter(item => item.chapterId === physics.id);
    for (const card of cards) data = completeRevision(data, card.id, '2026-11-15T08:00:00.000Z');
    const outcome = completeRevisionWithRecall(data, cards[0].id, 'weak', '2026-11-20');
    expect(outcome.created).toBe(true);
    expect(outcome.dueDate).toBe('2026-11-21');
    expect(outcome.data.revisions.filter(item => item.chapterId === physics.id && !item.completedAt)).toHaveLength(1);
  });
  it('summarises the last 45 days of recall ratings', () => {
    let data = ensureRevisions(plan, completedChapter());
    const cards = data.revisions.filter(item => item.chapterId === physics.id);
    data = completeRevisionWithRecall(data, cards[0].id, 'good', '2026-11-15').data;
    data = completeRevisionWithRecall(data, cards[1].id, 'weak', '2026-11-16').data;
    const summary = recallSummary(data.revisions, '2026-11-20');
    expect(summary).toMatchObject({ good: 1, weak: 1, okay: 0, rated: 2 });
    expect(summary.score).toBe(60);
    expect(recallSummary(data.revisions, '2027-06-01').rated).toBe(0);
  });
});
