// Unit tests for js/utils.js — run with: node tests/utils.test.js
'use strict';
const assert = require('node:assert');
const u = require('../js/utils.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('utils.test.js');

test('esc escapes HTML', () => {
  assert.strictEqual(u.esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.strictEqual(u.esc(null), '');
  assert.strictEqual(u.esc(undefined), '');
});

test('date keys and arithmetic', () => {
  assert.strictEqual(u.todayKey().length, 10);
  assert.strictEqual(u.addDays('2027-01-31', 1), '2027-02-01');
  assert.strictEqual(u.addDays('2027-03-01', -1), '2027-02-28');
  assert.strictEqual(u.daysBetween('2027-01-01', '2027-01-11'), 10);
  assert.strictEqual(u.daysBetween('2027-01-11', '2027-01-01'), -10);
});

test('weekStartKey is Monday', () => {
  // 2027-01-04 is a Monday
  assert.strictEqual(u.weekStartKey('2027-01-04'), '2027-01-04');
  assert.strictEqual(u.weekStartKey('2027-01-10'), '2027-01-04'); // Sunday
  assert.strictEqual(u.weekStartKey('2027-01-06'), '2027-01-04'); // Wednesday
});

test('formatDuration / formatClock', () => {
  assert.strictEqual(u.formatDuration(0), '0m');
  assert.strictEqual(u.formatDuration(45), '45m');
  assert.strictEqual(u.formatDuration(60), '1h');
  assert.strictEqual(u.formatDuration(135), '2h 15m');
  assert.strictEqual(u.formatClock(3661), '01:01:01');
  assert.strictEqual(u.formatClock(61), '01:01');
  assert.strictEqual(u.formatClock(0), '00:00');
});

test('pct and accuracy', () => {
  assert.strictEqual(u.pct(1, 4), 25);
  assert.strictEqual(u.pct(0, 0), 0);
  assert.strictEqual(u.accuracy(8, 10), 80);
  assert.strictEqual(u.accuracy(0, 0), null);
});

test('gradeForMarks follows BD board scale', () => {
  assert.strictEqual(u.gradeForMarks(85, 100).grade, 'A+');
  assert.strictEqual(u.gradeForMarks(75, 100).grade, 'A');
  assert.strictEqual(u.gradeForMarks(65, 100).grade, 'A-');
  assert.strictEqual(u.gradeForMarks(55, 100).grade, 'B');
  assert.strictEqual(u.gradeForMarks(45, 100).grade, 'C');
  assert.strictEqual(u.gradeForMarks(35, 100).grade, 'D');
  assert.strictEqual(u.gradeForMarks(20, 100).grade, 'F');
  assert.strictEqual(u.gradeForMarks(0, 0).grade, '');
});

test('calcStreak', () => {
  const today = u.todayKey();
  const y = u.addDays(today, -1), y2 = u.addDays(today, -2), y3 = u.addDays(today, -3);
  assert.strictEqual(u.calcStreak([today, y, y2]), 3);
  assert.strictEqual(u.calcStreak([y, y2, y3]), 3); // today not yet studied
  assert.strictEqual(u.calcStreak([y3]), 0); // gap
  assert.strictEqual(u.calcStreak([]), 0);
});

test('CSV round-trip', () => {
  const rows = [['a', 'b,c', 'd"e'], ['1', '2', '3']];
  const csv = u.toCSV(rows);
  const back = u.parseCSV(csv);
  assert.deepStrictEqual(back, rows);
});

test('validation helpers', () => {
  assert.strictEqual(u.isValidDateKey('2027-06-01'), true);
  assert.strictEqual(u.isValidDateKey('not-a-date'), false);
  assert.strictEqual(u.isValidDateKey('2027-02-30'), false);
  assert.strictEqual(u.sanitizeUrl('https://youtube.com/watch?v=x'), 'https://youtube.com/watch?v=x');
  assert.strictEqual(u.sanitizeUrl('javascript:alert(1)'), '');
  assert.strictEqual(u.sanitizeText('  hi  '), 'hi');
});

test('greeting', () => {
  assert.strictEqual(u.greeting(8), 'Good morning');
  assert.strictEqual(u.greeting(13), 'Good afternoon');
  assert.strictEqual(u.greeting(20), 'Good evening');
  assert.strictEqual(u.greeting(2), 'Good night');
});

console.log(`\n${passed} tests passed.`);
