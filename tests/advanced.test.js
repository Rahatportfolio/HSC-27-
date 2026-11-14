'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const files = ['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/app.js'];
const errors = [];
function create(saved) {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {url:'https://study.example/', runScripts:'dangerously', virtualConsole:vc, beforeParse(w) {
    w.matchMedia = () => ({matches:false,addEventListener(){}}); w.scrollTo = () => {}; w.confirm = () => true; w.alert = msg => errors.push(msg);
    if (saved) w.localStorage.setItem('hsc27_state_v1', saved);
  }});
  const {window:w} = dom, d = w.document;
  w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
  for (const f of files) { const script = d.createElement('script'); script.textContent=fs.readFileSync(f,'utf8'); d.body.appendChild(script); }
  return { dom, w, d, click(sel) {const el=d.querySelector(sel); assert.ok(el, 'missing '+sel); el.click();}, set(sel,v) {const el=d.querySelector(sel); assert.ok(el,'missing '+sel); el.value=v; el.dispatchEvent(new w.Event('change',{bubbles:true}));}, submit(sel) {const el=d.querySelector(sel); assert.ok(el, 'missing '+sel); el.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}, state() {return JSON.parse(w.localStorage.getItem('hsc27_state_v1'));} };
}
let app = create();
try {
  app.click('[data-nav="subjects"]'); app.click('[data-nav="subject"][data-id="sub-sci-1"]'); app.click('#add-chapter-btn');
  app.set('#chapter-form [name="name"]','My chapter'); app.submit('#chapter-form');
  const chapter = app.state().chapters[0].id;
  app.click('[data-nav="planner"]'); app.click('#add-task-btn'); app.set('#task-form [name="title"]','Plan'); app.submit('#task-form');
  app.click('#add-task-btn'); app.set('#task-form [name="title"]','Rest'); app.set('#task-form [name="type"]','rest'); app.set('#task-form [name="startTime"]','10:00'); app.submit('#task-form');
  assert.equal(app.state().tasks[1].startTime,'10:00'); assert.match(app.d.querySelector('#view').textContent,/Planned study 1h/);
  app.click('[data-task-reschedule]'); app.set('#reschedule-form [name="date"]','2027-01-01'); app.submit('#reschedule-form');
  assert.equal(app.state().tasks[0].date,'2027-01-01'); assert.ok(app.state().tasks[0].originalDate);

  app.click('#more-btn'); app.click('[data-nav="review"]'); app.set('#review-form [name="goals"]','Goal one\nGoal two'); app.submit('#review-form');
  app.click('#review-create-tasks'); app.click('#review-create-tasks');
  assert.equal(app.state().tasks.filter(t => t.reviewId).length,2);

  app.click('#more-btn'); app.click('[data-nav="exams"]'); app.click('#add-exam-btn');
  app.set('#exam-form [name="name"]','Chapter quiz'); app.set('#exam-form [name="subjectId"]','sub-sci-1');
  app.submit('#exam-form'); assert.equal(app.state().exams.length,0, 'chapter must be selected');
  app.set('#exam-form [name="chapterId"]',chapter); app.set('#exam-form [name="format"]','mcq'); app.submit('#exam-form');
  assert.equal(app.state().exams[0].chapterId,chapter); assert.equal(app.state().exams[0].format,'mcq');
  app.click('[data-exam-start]'); assert.ok(app.state().activeExam); assert.match(app.d.querySelector('#exam-timer-display').textContent,/remaining/);
  app.click('#end-timed-exam'); assert.equal(app.state().activeExam,null);
  app.click('[data-result-add]'); app.set('#result-form [name="obtainedMarks"]','20'); app.submit('#result-form');
  assert.equal(app.state().examResults[0].grade,'A+');
  app.click('[data-nav="subjects"]'); app.click('[data-nav="subject"][data-id="sub-sci-1"]'); app.click(`[data-nav="chapter"][data-id="${chapter}"]`);
  assert.match(app.d.querySelector('#view').textContent,/Chapter quiz/);

  app.click('#more-btn'); app.click('[data-nav="weaknesses"]'); app.click('#add-weakness-btn');
  app.set('#weakness-form [name="topic"]','Hard concept'); app.set('#weakness-form [name="chapterId"]',chapter); app.set('#weakness-form [name="correctionTask"]','Review concept'); app.submit('#weakness-form');
  assert.equal(app.state().weaknesses[0].subjectId,'sub-sci-1');
  app.click('[data-weakness-schedule]'); app.set('#correction-form [name="count"]','3'); app.set('#correction-form [name="interval"]','2'); app.submit('#correction-form');
  const corrections=app.state().tasks.filter(t => t.weaknessId); assert.equal(corrections.length,3); assert.equal(corrections[0].chapterId,chapter);
  assert.equal((Date.parse(corrections[2].date)-Date.parse(corrections[0].date))/86400000,4);

  app.click('#more-btn'); app.click('[data-nav="settings"]');
  app.set('#settings-form [name="preferredStart"]','08:00'); app.set('#settings-form [name="preferredEnd"]','12:00'); app.submit('#settings-form'); assert.equal(app.state().settings.preferredStart,'08:00');
  app.d.querySelector('#notif-form [name="enabled"]').checked=true; app.submit('#notif-form');
  assert.match(app.d.querySelector('#reminder-bar').textContent, /Today:/);
  app.click('#more-btn'); app.click('[data-nav="library"]'); app.click('#add-resource-btn');
  app.set('#resource-form [name="title"]','Learning video'); app.set('#resource-form [name="url"]','https://www.youtube.com/watch?v=example'); app.submit('#resource-form');
  const anchor=app.d.querySelector('[data-resource-open]');
  anchor.addEventListener('click', event => event.preventDefault()); anchor.click();
  assert.ok(app.state().resources[0].lastOpenedAt);

  app.click('[data-nav="progress"]'); app.click('#start-challenge'); app.set('#challenge-form [name="days"]','3'); app.set('#challenge-form [name="minutes"]','30'); app.submit('#challenge-form');
  assert.equal(app.state().challenge.days,3); assert.match(app.d.querySelector('#view').textContent,/0\/3 days/);
  app.click('[data-nav="focus"]'); app.set('#focus-subject','sub-sci-1'); app.click('#timer-toggle');
  const snapshot=app.state(); assert.equal(snapshot.activeFocus.running,true); assert.ok(snapshot.activeFocus.runId);
  // Simulate termination after the timer has exceeded its deadline, then reload twice.
  snapshot.activeFocus.mode='countdown'; snapshot.activeFocus.startedAt=Date.now()-120000; snapshot.activeFocus.targetMs=60000; snapshot.activeFocus.accumulatedMs=0;
  app.dom.window.close(); app=create(JSON.stringify(snapshot));
  assert.equal(app.state().sessions.length,1); assert.equal(app.state().sessions[0].durationMinutes,1);
  assert.equal(app.state().activeFocus.phase,'break');
  const savedState=app.state();
  // Simulate a crash after the session was persisted but before the timer phase was updated.
  savedState.activeFocus = snapshot.activeFocus;
  const saved=JSON.stringify(savedState); app.dom.window.close(); app=create(saved);
  assert.equal(app.state().sessions.length,1, 'reopening must not duplicate the session');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Advanced integration: reschedule, weekly goals, exam validation/link/results/timer and focus recovery passed.');
} finally { app.dom.window.close(); }
