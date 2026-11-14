'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
const files=['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/i18n.js','js/sync.js','js/app.js'];
const errors=[],alerts=[]; let fail=false, allowConfirm=true;
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'https://study.example/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.fetch=async()=>{throw Error('offline');};w.confirm=()=>allowConfirm;w.alert=m=>alerts.push(m);
 const old=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(k,v){if(fail && k==='hsc27_state_v1')throw Error('quota');return old.call(this,k,v);};
}});
const w=dom.window,d=w.document;w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
for(const f of files){const s=d.createElement('script');s.textContent=fs.readFileSync(f,'utf8');d.body.appendChild(s);}
const run=s=>w.eval(s), data=()=>JSON.parse(w.localStorage.getItem('hsc27_state_v1'));
const click=s=>{const el=d.querySelector(s);assert.ok(el,s);el.click();};
const set=(s,v)=>{const el=d.querySelector(s);assert.ok(el,s);el.value=v;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const submit=s=>{const el=d.querySelector(s);assert.ok(el,s);el.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
try{
 click('[data-nav="subjects"]');click('[data-nav="subject"][data-id="sub-sci-1"]');click('#add-chapter-btn');set('#chapter-form [name="name"]','My chapter');submit('#chapter-form');const ch=data().chapters[0];
 click('[data-nav="planner"]');click('#add-task-btn');set('#task-form [name="title"]','Study');set('#task-form [name="subjectId"]','sub-sci-1');set('#task-form [name="chapterId"]',ch.id);set('#task-form [name="plannedMinutes"]','1441');submit('#task-form');assert.equal(data().tasks.length,0);
 set('#task-form [name="plannedMinutes"]','45');submit('#task-form');let task=data().tasks[0];assert.equal(task.chapterId,ch.id);
 click(`[data-task-edit="${task.id}"]`);assert.equal(d.querySelector('#task-form [name="chapterId"]').value,ch.id);set('#task-form [name="title"]','Edited');fail=true;submit('#task-form');fail=false;assert.equal(data().tasks[0].title,'Study');assert.equal(run('getState().tasks[0].title'),'Study');assert.equal(d.querySelector('#modal-overlay').hidden,false);submit('#task-form');assert.equal(data().tasks[0].title,'Edited');
 fail=true;click(`[data-task-toggle="${task.id}"]`);fail=false;assert.equal(data().tasks[0].status,'pending');assert.equal(run('getState().tasks[0].status'),'pending');click(`[data-task-toggle="${task.id}"]`);assert.equal(data().tasks[0].status,'done');
 click(`[data-task-reschedule="${task.id}"]`);const tomorrow=run('addDays(todayKey(),1)');set('#reschedule-form [name="date"]',tomorrow);fail=true;submit('#reschedule-form');fail=false;assert.equal(data().tasks[0].status,'done');assert.equal(run('getState().tasks[0].status'),'done');submit('#reschedule-form');assert.equal(data().tasks[0].date,tomorrow);assert.equal(data().tasks[0].status,'pending');click('#planner-next');
 allowConfirm=false;click(`[data-task-delete="${task.id}"]`);assert.equal(data().tasks.length,1);allowConfirm=true;fail=true;click(`[data-task-delete="${task.id}"]`);fail=false;assert.equal(run('getState().tasks.length'),1);click(`[data-task-delete="${task.id}"]`);assert.equal(data().tasks.length,0);
 run("getState().tasks.push({id:'old-task',title:'Old',date:addDays(todayKey(),-1),status:'pending'});save()");fail=true;assert.equal(run('carryOverMissed()'),0);assert.equal(run('getState().tasks[0].date'),run('addDays(todayKey(),-1)'));fail=false;assert.equal(run('carryOverMissed()'),1);assert.equal(data().tasks[0].originalDate,run('addDays(todayKey(),-1)'));
 click('[data-nav="focus"]');set('#manual-session-form [name="minutes"]','1500');submit('#manual-session-form');assert.equal(data().sessions.length,0);set('#manual-session-form [name="minutes"]','30');fail=true;submit('#manual-session-form');fail=false;assert.equal(run('getState().sessions.length'),0);submit('#manual-session-form');assert.equal(data().sessions.length,1);
 // Complete a countdown while localStorage fails: no false save or phase transition, then retry once.
 run("focusState.mode='countdown';focusState.phase='focus';focusState.subjectId='sub-sci-1';focusState.chapterId=null;focusState.targetMs=60000;focusState.accumulatedMs=120000;focusState.running=true;focusState.startedAt=Date.now();focusState.runId='phase2-test-run';");
 fail=true;run('timerTick()');fail=false;assert.equal(run('focusState.phase'),'focus');assert.equal(run('focusState.running'),false);assert.equal(run('focusState.accumulatedMs'),60000);assert.equal(data().sessions.length,1);assert.match(d.querySelector('#toast-wrap').textContent,/Session not saved/);
 run('stopAndSaveTimer()');assert.equal(data().sessions.length,2);assert.equal(data().sessions.at(-1).durationMinutes,1);assert.equal(data().activeFocus.phase,'focus');run('stopAndSaveTimer()');assert.equal(data().sessions.length,2);
 // Stop & save failure also keeps the paused time for retry.
 run("focusState.mode='stopwatch';focusState.phase='focus';focusState.subjectId='sub-sci-1';focusState.accumulatedMs=120000;focusState.running=false;focusState.runId='phase2-test-stop';");fail=true;run('stopAndSaveTimer()');fail=false;assert.equal(run('focusState.accumulatedMs'),120000);assert.equal(data().sessions.length,2);run('stopAndSaveTimer()');assert.equal(data().sessions.length,3);
 assert.equal(errors.length,0,errors.join('\n'));assert.ok(alerts.length>=6);console.log('Phase 2 core: planner edit/validation, reschedule/toggle/delete and carryover rollback, manual sessions, timer save failure/retry passed (jsdom).');
}finally{dom.window.close();}
