'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const errors = [];
const vc = new VirtualConsole(); vc.on('jsdomError',e=>errors.push(e.message));
const html=fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
const dom=new JSDOM(html,{url:'https://study.example/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.confirm=()=>true;w.alert=msg=>errors.push(msg);}});
const w=dom.window,d=w.document;
w.addEventListener('error',e=>errors.push(e.error ? e.error.stack : e.message));
for(const f of ['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/app.js']){const s=d.createElement('script');s.textContent=fs.readFileSync(f,'utf8');d.body.appendChild(s);}
const click=sel=>{const x=d.querySelector(sel);assert.ok(x,sel);x.click();};
const set=(sel,value)=>{const x=d.querySelector(sel);assert.ok(x,sel);x.value=value;x.dispatchEvent(new w.Event('change',{bubbles:true}));};
const submit=sel=>d.querySelector(sel).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const state=()=>JSON.parse(w.localStorage.getItem('hsc27_state_v1'));
try {
  click('[data-nav="subjects"]'); click('[data-nav="subject"][data-id="sub-sci-1"]'); click('#add-chapter-btn');
  set('#chapter-form [name="name"]','Unique topic'); submit('#chapter-form'); const chapter=state().chapters[0].id;
  click('#more-btn'); click('[data-nav="search"]');
  let search=d.querySelector('#global-search');search.value='Unique';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  click('[data-nav="chapter"]'); assert.match(d.querySelector('#view').textContent,/Unique topic/);
  click('[data-nav="practice"][data-chapter]'); click('#add-practice-btn');
  set('#practice-form [name="attempted"]','5');set('#practice-form [name="correct"]','8');submit('#practice-form');
  assert.equal(state().practice.length,0,'cannot save more correct than attempts');
  set('#practice-form [name="correct"]','4');set('#practice-form [name="marks"]','9');set('#practice-form [name="totalMarks"]','8');submit('#practice-form');
  assert.equal(state().practice.length,0,'cannot save marks above maximum');
  set('#practice-form [name="marks"]','');set('#practice-form [name="totalMarks"]','');submit('#practice-form');
  assert.equal(state().practice[0].chapterId,chapter);assert.equal(state().practice[0].correct,4);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Search routes and practice validation passed.');
} finally {dom.window.close();}
