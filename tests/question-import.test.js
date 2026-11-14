'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const html=fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
const dom=new JSDOM(html,{url:'https://study.example/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};}});
const w=dom.window,d=w.document;
w.addEventListener('error',e=>errors.push(e.error ? e.error.stack : e.message));
for(const f of ['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/app.js']) {const s=d.createElement('script');s.textContent=fs.readFileSync(f,'utf8');d.body.appendChild(s);}
const click=sel=>{const x=d.querySelector(sel);assert.ok(x,sel);x.click();};
const state=()=>JSON.parse(w.localStorage.getItem('hsc27_state_v1'));
const wait=()=>new Promise(r=>setTimeout(r,40));
async function importData(data){const el=d.querySelector('#import-questions-file');Object.defineProperty(el,'files',{configurable:true,value:[new w.File([JSON.stringify(data)],'q.json',{type:'application/json'})]});el.dispatchEvent(new w.Event('change',{bubbles:true}));await wait();}
(async()=>{
  click('#more-btn');click('[data-nav="practice"]');
  const q={question:'Imported MCQ',type:'mcq',subjectId:'sub-sci-1',options:['one','two','three','four'],correctIndex:0,source:'ai'};
  await importData([q,q,null,{question:''}]);
  assert.equal(state().questionBank.length,1);assert.equal(state().questionBank[0].correctIndex,0);assert.equal(state().questionBank[0].source,'ai');
  await importData([q]);assert.equal(state().questionBank.length,1);
  const old=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(){throw Error('quota');};
  await importData([{...q,question:'Quota test'}]);assert.equal(state().questionBank.length,1);assert.equal(w.eval('getState().questionBank.length'),1);
  w.Storage.prototype.setItem=old;
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Question import: options, source, deduplication and quota rollback passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
