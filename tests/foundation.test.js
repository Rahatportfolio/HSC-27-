'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM, VirtualConsole} = require('jsdom');
const scripts = ['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/i18n.js','js/sync.js','js/app.js'];
const html = fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
function app(initial) {
  const errors = [], alerts = [], confirmations = [];
  let fail = false, confirmAnswer = true;
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {url:'https://study.example/', runScripts:'dangerously', virtualConsole:vc, beforeParse(w) {
    w.matchMedia = () => ({matches:false,addEventListener(){}}); w.scrollTo = () => {}; w.fetch = async () => {throw Error('offline');};
    w.alert = msg => alerts.push(msg); w.confirm = msg => {confirmations.push(msg); return confirmAnswer;};
    if (initial) w.localStorage.setItem('hsc27_state_v1',initial);
    const original = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function(k,v) {if (fail && k === 'hsc27_state_v1') throw Error('quota'); return original.call(this,k,v);};
  }});
  const w=dom.window, d=w.document;
  w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
  scripts.forEach(f => {const s=d.createElement('script');s.textContent=fs.readFileSync(f,'utf8');d.body.appendChild(s);});
  return {w,d,dom,errors,alerts,confirmations,fail(v){fail=v;},confirm(v){confirmAnswer=v;},
    click(sel){const el=d.querySelector(sel);assert.ok(el,'missing '+sel);el.click();},
    set(sel,v){const el=d.querySelector(sel);assert.ok(el,'missing '+sel);el.value=v;el.dispatchEvent(new w.Event('change',{bubbles:true}));},
    submit(sel){const el=d.querySelector(sel);assert.ok(el,'missing '+sel);el.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));},
    data(){return JSON.parse(w.localStorage.getItem('hsc27_state_v1'));},
    run(code){return w.eval(code);}};
}
const a=app();
try {
  assert.equal(a.data().settings.dailyTargetMinutes,480); assert.equal(a.data().subjects.length,13); assert.equal(a.data().chapters.length,0);
  a.click('[data-nav="subjects"]'); assert.equal(a.d.querySelector('.bottom-nav [data-nav="subjects"]').getAttribute('aria-current'),'page'); a.click('#add-subject-btn'); a.set('#subject-form [name="name"]','  physics 1st paper '); a.submit('#subject-form');
  assert.equal(a.data().subjects.length,13); assert.equal(a.d.querySelector('#modal-overlay').hidden,false); a.click('[data-close-modal]');
  a.click('#add-subject-btn'); a.set('#subject-form [name="name"]','বাংলা ব্যক্তিগত'); a.submit('#subject-form');
  const custom=a.data().subjects.find(s=>s.name==='বাংলা ব্যক্তিগত'); assert.ok(custom);
  a.click(`[data-nav="subject"][data-id="${custom.id}"]`); a.click('#add-chapter-btn'); a.set('#chapter-form [name="name"]','First'); a.submit('#chapter-form');
  a.click('#add-chapter-btn'); a.set('#chapter-form [name="name"]','Second'); a.submit('#chapter-form');
  const [first,second]=a.data().chapters; assert.equal(first.order,0); assert.equal(second.order,1);
  a.click(`[data-move-chapter="${second.id}"][data-dir="-1"]`); assert.deepEqual(a.data().chapters.map(c=>c.order),[1,0]);
  a.click(`[data-nav="chapter"][data-id="${first.id}"]`); a.click('#ch-delete'); assert.equal(a.data().chapters.length,1);
  a.click(`[data-nav="subject"][data-id="${custom.id}"]`); a.click('#add-chapter-btn'); a.set('#chapter-form [name="name"]','Third'); a.submit('#chapter-form');
  assert.equal(a.data().chapters.find(c=>c.name==='Third').order,1,'new chapter must append even after deletion');
  a.click('#add-chapter-btn'); a.set('#chapter-form [name="name"]',' second '); a.submit('#chapter-form'); assert.equal(a.data().chapters.length,2); a.click('[data-close-modal]');
  a.click('#add-chapter-btn'); a.set('#chapter-form [name="name"]','Fails to persist'); a.fail(true); a.submit('#chapter-form'); a.fail(false);
  assert.equal(a.data().chapters.length,2); assert.equal(a.run('getState().chapters.length'),2); assert.equal(a.d.querySelector('#modal-overlay').hidden,false); a.click('[data-close-modal]');
  a.click(`[data-nav="chapter"][data-id="${second.id}"]`); a.fail(true); a.click('#ch-complete'); a.fail(false);
  assert.equal(a.data().revisions.length,0); assert.equal(a.run('getState().revisions.length'),0); assert.notEqual(a.run('chapterById('+JSON.stringify(second.id)+').status'),'completed');
  a.click('#ch-complete'); assert.equal(a.data().revisions.length,5); a.click('#ch-complete'); assert.equal(a.data().revisions.length,5);
  a.confirm(false); a.click('#ch-delete'); assert.equal(a.data().chapters.length,2); a.confirm(true); assert.match(a.confirmations.at(-1),/notes/);
  a.fail(true); a.click('#ch-delete'); a.fail(false); assert.equal(a.run('getState().chapters.length'),2); assert.equal(a.data().revisions.length,5);
  a.click('[data-nav="dashboard"]'); const lowest=a.d.querySelector('#view').textContent.split('Lowest chapter completion')[1].split('Quick actions')[0]; assert.match(lowest,/বাংলা ব্যক্তিগত/); assert.doesNotMatch(lowest,/Physics 1st Paper/);
  a.click('[data-nav="subjects"]'); a.click(`[data-nav="subject"][data-id="${custom.id}"]`); a.click('#delete-subject-btn'); assert.ok(a.data().subjects.some(s=>s.id===custom.id),'linked subject deletion must be blocked');
  const result=a.run(`importChaptersFromText(JSON.stringify([null,{subject:'বাংলা ব্যক্তিগত',name:'Imported',number:3},{subject:'বাংলা ব্যক্তিগত',name:' imported ',number:4},{subject:'Unknown',name:'X'},{subject:'বাংলা ব্যক্তিগত',name:'Bad',number:-1}]),'x.json')`);
  assert.equal(result.added,1); assert.equal(result.skipped,4); const before=a.data().chapters.length;
  assert.throws(()=>a.run(`importChaptersFromText('subject,name\\nPhysics 1st Paper,"broken','x.csv')`),/unclosed/); assert.equal(a.data().chapters.length,before);
  a.fail(true); assert.throws(()=>a.run(`importChaptersFromText('subject,name\\nPhysics 1st Paper,Will fail','x.csv')`),/Unable to save/); a.fail(false); assert.equal(a.run('getState().chapters.length'),before); assert.equal(a.data().chapters.length,before);
  const csvResult=a.run(`importChaptersFromText('\ufeffsubject,number,name,priority\\nPhysics 1st Paper,1,\"Mechanics, basic\",A','x.csv')`); assert.equal(csvResult.added,1); assert.ok(a.data().chapters.some(c=>c.name==='Mechanics, basic'));
  const restored=app(a.w.localStorage.getItem('hsc27_state_v1'));
  try { assert.equal(restored.data().chapters.length,before+1); restored.click('[data-nav="subjects"]'); assert.match(restored.d.querySelector('#view').textContent,/বাংলা ব্যক্তিগত/); assert.equal(restored.errors.length,0,restored.errors.join('\n')); }
  finally {restored.dom.window.close();}
  assert.equal(a.errors.length,0,a.errors.join('\n')); assert.ok(a.alerts.length >= 3,'storage failures must be surfaced');
  console.log('Foundation: dashboard, subject/chapter CRUD, duplicate protection, order, revision atomicity, import validation, quota rollback and reload passed (jsdom).');
} finally {a.dom.window.close();}
