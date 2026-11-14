// Smoke test: load all app scripts in a shared vm context (like browser
// <script> tags) with a minimal DOM stub and render every view.
// Catches reference errors and template bugs. Run: node tests/smoke.test.js
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mem = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  },
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  navigator: { onLine: true },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {} }),
    body: { classList: { add() {}, remove() {} }, appendChild() {} },
    documentElement: { dataset: {} },
  },
  confirm: () => true,
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  Intl, Date, Math, JSON, Number, String, Array, Object, Set, Map, Promise, Error,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = [
  'js/utils.js', 'js/store.js',
  'js/views/dashboard.js', 'js/views/subjects.js', 'js/views/planner.js',
  'js/views/focus.js', 'js/views/progress.js', 'js/views/library.js', 'js/views/more.js', 'js/views/quiz.js',
];
for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

vm.runInContext('loadState(); loadDemoData();', sandbox);

const views = {
  dashboard: 'renderDashboard()',
  subjects: 'renderSubjects()',
  subject: 'renderSubjectDetail("sub-sci-1")',
  chapter: 'renderChapterDetail(getState().chapters[0].id)',
  planner: 'renderPlanner()',
  focus: 'renderFocus()',
  progress: 'renderProgress()',
  notes: 'renderNotes()',
  formulas: 'renderFormulas()',
  library: 'renderLibrary()',
  practice: 'renderPractice()',
  exams: 'renderExams()',
  revisions: 'renderRevisions()',
  weaknesses: 'renderWeaknesses()',
  review: 'renderReview()',
  journal: 'renderJournal()',
  calendar: 'renderCalendar()',
  search: 'renderSearch()',
  settings: 'renderSettings()',
  backup: 'renderBackup()',
};

let passed = 0;
for (const [name, expr] of Object.entries(views)) {
  try {
    const html = vm.runInContext(expr, sandbox);
    assert.ok(typeof html === 'string' && html.length > 100, 'view returned empty/short HTML');
    assert.ok(!html.includes('undefined'), 'view contains "undefined"');
    passed++;
    console.log('  ✓ renders ' + name + ' (' + html.length + ' chars)');
  } catch (e) {
    console.error('  ✗ ' + name + ': ' + e.message);
    process.exitCode = 1;
  }
}

try {
  vm.runInContext(`
    chapterFormHTML(null, 'sub-sci-1');
    taskFormHTML(todayKey());
    noteFormHTML(null);
    formulaFormHTML(null);
    resourceFormHTML(null);
    practiceFormHTML();
    examFormHTML();
    weaknessFormHTML();
    journalFormHTML();
  `, sandbox);
  console.log('  ✓ all forms render');
  passed++;
} catch (e) {
  console.error('  ✗ forms: ' + e.message);
  process.exitCode = 1;
}

console.log(`\n${passed} smoke checks passed.`);
