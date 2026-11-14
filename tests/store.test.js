// Unit tests for js/store.js — run with: node tests/store.test.js
// Uses an in-memory localStorage shim so the store runs in Node.
'use strict';
const assert = require('node:assert');

// --- localStorage shim (must exist before store.js loads) ---
const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

// utils.js globals used by store.js
const u = require('../js/utils.js');
Object.assign(global, u);

const store = require('../js/store.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('store.test.js');

test('default state seeds 13 subjects, no chapters', () => {
  const st = store.defaultState();
  assert.strictEqual(st.subjects.length, 13);
  assert.strictEqual(st.subjects.filter((s) => s.group === 'science').length, 8);
  assert.strictEqual(st.subjects.filter((s) => s.group === 'other').length, 5);
  assert.strictEqual(st.chapters.length, 0);
  assert.strictEqual(st.settings.dailyTargetMinutes, 480);
});

test('loadState persists and reloads', () => {
  const st = store.loadState();
  assert.strictEqual(st.subjects.length, 13);
  const raw = mem.get(store.STORAGE_KEY);
  assert.ok(raw && raw.includes('Physics 1st Paper'));
});

test('recordSession dedupes identical sessions', () => {
  store.resetState();
  const data = {
    subjectId: 'sub-sci-1', chapterId: null,
    startedAt: '2027-01-01T10:00:00.000Z', endedAt: '2027-01-01T10:30:00.000Z',
    durationMinutes: 30, mode: 'manual', source: 'timer', date: '2027-01-01',
  };
  const a = store.recordSession(data);
  const b = store.recordSession(data);
  assert.ok(a && b);
  assert.strictEqual(a.id, b.id);
  assert.strictEqual(store.getState().sessions.length, 1);
  assert.strictEqual(store.recordSession({ durationMinutes: 0 }), null);
});

test('derived minutes and completion', () => {
  store.resetState();
  const st = store.getState();
  st.chapters.push({
    id: 'ch1', subjectId: 'sub-sci-1', number: 1, name: 'Test', priority: 'A',
    status: 'in-progress', completionPct: 50, order: 0,
  });
  store.recordSession({ subjectId: 'sub-sci-1', chapterId: 'ch1', durationMinutes: 60, date: todayKey() });
  assert.strictEqual(store.minutesOn(todayKey()), 60);
  assert.strictEqual(store.chapterMinutes('ch1'), 60);
  assert.strictEqual(store.subjectMinutes('sub-sci-1'), 60);
  const c = store.subjectCompletion('sub-sci-1');
  assert.strictEqual(c.pct, 50);
  assert.strictEqual(c.total, 1);
});

test('scheduleRevisions creates 5 cycles', () => {
  store.resetState();
  const st = store.getState();
  const ch = { id: 'chX', subjectId: 'sub-sci-1' };
  st.chapters.push(Object.assign({ status: 'completed' }, ch));
  store.scheduleRevisions(ch);
  assert.strictEqual(st.revisions.length, 5);
  assert.strictEqual(st.revisions[0].dueDate, addDays(todayKey(), 1));
  assert.strictEqual(st.revisions[4].dueDate, addDays(todayKey(), 30));
  // Idempotent: second call adds nothing
  store.scheduleRevisions(ch);
  assert.strictEqual(st.revisions.length, 5);
});

test('carryOverMissed moves past tasks to today', () => {
  store.resetState();
  const st = store.getState();
  st.tasks.push({ id: 't1', title: 'Old', date: '2020-01-01', status: 'pending' });
  st.tasks.push({ id: 't2', title: 'Done', date: '2020-01-01', status: 'done' });
  const moved = store.carryOverMissed();
  assert.strictEqual(moved, 1);
  assert.strictEqual(st.tasks[0].date, todayKey());
  assert.strictEqual(st.tasks[0].status, 'carried');
  assert.strictEqual(st.tasks[1].status, 'done');
  st.tasks[0].date = '2020-01-02';
  assert.equal(store.carryOverMissed(), 1);
  assert.equal(st.tasks[0].date, todayKey());
});

test('practiceTotals aggregates correctly', () => {
  store.resetState();
  const st = store.getState();
  st.practice.push({ id: 'p1', chapterId: 'c1', type: 'mcq', attempted: 10, correct: 8, marks: null, totalMarks: null });
  st.practice.push({ id: 'p2', chapterId: 'c1', type: 'mcq', attempted: 10, correct: 6, marks: null, totalMarks: null });
  const t = store.practiceTotals('c1', 'mcq');
  assert.strictEqual(t.attempted, 20);
  assert.strictEqual(t.correct, 14);
  assert.strictEqual(t.accuracy, 70);
});

test('export/import JSON round-trip and validation', () => {
  store.resetState();
  const json = store.exportJSON();
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.subjects.length, 13);
  assert.throws(() => store.importJSON('{"bad":true}'), /Invalid backup/);
  const broken = JSON.parse(json); broken.notes = null;
  assert.throws(() => store.importJSON(JSON.stringify(broken)), /Invalid backup/);
  assert.equal(store.getState().subjects.length, 13);
  store.importJSON(json);
  assert.strictEqual(store.getState().subjects.length, 13);
});

test('CSV exports produce headers', () => {
  const csv = store.exportCSV('sessions');
  assert.ok(csv.startsWith('date,subject,chapter,minutes'));
});

test('demo data loads and clears', () => {
  store.resetState();
  store.loadDemoData();
  assert.strictEqual(store.getState().demoLoaded, true);
  assert.ok(store.getState().chapters.length > 0);
  store.clearDemoData();
  assert.strictEqual(store.getState().demoLoaded, false);
  assert.strictEqual(store.getState().chapters.length, 0);
});

console.log(`\n${passed} tests passed.`);
