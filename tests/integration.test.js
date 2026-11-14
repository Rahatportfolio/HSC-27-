'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
const html = fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://study.example/', runScripts: 'dangerously', virtualConsole: vc, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.scrollTo = () => {}; w.fetch = async () => { throw Error('offline'); };
  w.confirm = () => true;
  w.alert = msg => errors.push(msg);
}});
const w = dom.window, d = w.document;
w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
for (const f of ['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/i18n.js','js/sync.js','js/app.js']) {
  const s = d.createElement('script'); s.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(s);
}
function click(sel) { const el = d.querySelector(sel); assert.ok(el, 'missing ' + sel); el.click(); }
function set(sel, value) { const el = d.querySelector(sel); assert.ok(el, 'missing ' + sel); el.value = value; el.dispatchEvent(new w.Event('change', {bubbles:true})); }
function submit(sel) { const el = d.querySelector(sel); assert.ok(el, 'missing ' + sel); el.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); }
function data() { return JSON.parse(w.localStorage.getItem('hsc27_state_v1')); }
function run(code) { const el=d.createElement('script'); el.textContent=code; d.body.appendChild(el); el.remove(); }
try {
  assert.match(d.querySelector('#view').textContent, /today/i);
  click('[data-nav="subjects"]');
  click('[data-nav="subject"][data-id="sub-sci-1"]');
  click('#add-chapter-btn');
  set('#chapter-form [name="name"]', 'Personal chapter বাংলা');
  set('#chapter-form [name="number"]', '1');
  submit('#chapter-form');
  assert.equal(data().chapters.length, 1);
  const id = data().chapters[0].id;
  click(`[data-nav="chapter"][data-id="${id}"]`);
  click('#ch-edit'); set('#chapter-form [name="name"]', 'Edited chapter'); submit('#chapter-form');
  assert.equal(data().chapters[0].name, 'Edited chapter');
  click('#ch-complete'); assert.equal(data().revisions.length, 5);
  click('#ch-complete'); assert.equal(data().revisions.length, 5);
  click('[data-nav="planner"]'); click('#add-task-btn');
  set('#task-form [name="title"]', 'Revise'); set('#task-form [name="subjectId"]', 'sub-sci-1');
  set('#task-form [name="chapterId"]', id); submit('#task-form');
  assert.equal(data().tasks[0].chapterId, id);
  click('[data-planner-mode="month"]'); assert.match(d.querySelector('#view').textContent, /Planned/);
  click('[data-nav="focus"]'); set('#manual-session-form [name="minutes"]', '30'); submit('#manual-session-form');
  submit('#manual-session-form'); assert.equal(data().sessions.length, 2, 'separate manual entries must not be deduplicated');
  // A stop during break must never save break time as study.
  run("focusState.phase='break'; focusState.accumulatedMs=180000; stopAndSaveTimer();");
  assert.equal(data().sessions.length, 2);
  // When a throttled timer resumes late, record only its planned focus duration.
  run("focusState.phase='focus'; focusState.mode='countdown'; focusState.targetMs=60000; focusState.accumulatedMs=300000; focusState.running=true; focusState.startedAt=Date.now(); timerTick();");
  assert.equal(data().sessions.at(-1).durationMinutes, 1);
  run('resetTimer()');
  click('#more-btn'); click('#modal-overlay [data-nav="settings"]');
  assert.equal(d.querySelector('#modal-overlay').hidden, true);
  assert.ok(d.querySelector('#settings-form'));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Integration: chapter create/edit, revision scheduling, planner association/month, manual sessions, timer break/throttling, modal navigation and local persistence passed.');
} finally { dom.window.close(); }
