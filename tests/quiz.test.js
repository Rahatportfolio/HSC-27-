'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
const files = ['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/app.js'];
const errors=[];
function create(saved) {
  const vc=new VirtualConsole(); vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://study.example/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    w.matchMedia=()=>({matches:false,addEventListener(){}}); w.scrollTo=()=>{}; w.confirm=()=>true; w.alert=msg=>errors.push(msg);
    if(saved) w.localStorage.setItem('hsc27_state_v1',saved);
  }});
  const w=dom.window,d=w.document;
  w.addEventListener('error', e=>errors.push(e.error ? e.error.stack : e.message));
  files.forEach(f=>{const s=d.createElement('script');s.textContent=fs.readFileSync(f,'utf8');d.body.appendChild(s);});
  return {dom,w,d, click(sel){const el=d.querySelector(sel);assert.ok(el,sel);el.click();}, set(sel,v){const el=d.querySelector(sel);assert.ok(el,sel);el.value=v;el.dispatchEvent(new w.Event('change',{bubbles:true}));}, submit(sel){d.querySelector(sel).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}, state(){return JSON.parse(w.localStorage.getItem('hsc27_state_v1'));}};
}
let app=create();
try {
  app.click('[data-nav="subjects"]'); app.click('[data-nav="subject"][data-id="sub-sci-1"]'); app.click('#add-chapter-btn');
  app.set('#chapter-form [name="name"]','Student chapter'); app.submit('#chapter-form');
  const chapter=app.state().chapters[0].id;
  app.click('#more-btn'); app.click('[data-nav="practice"]');
  function addQuestion(text, correct) {
    app.click('#add-question-btn'); app.set('#question-form [name="question"]',text); app.set('#question-form [name="chapterId"]',chapter);
    for(let i=0;i<4;i++) app.set(`#question-form [name="option${i}"]`,`Choice ${i+1}`);
    app.set('#question-form [name="correctIndex"]',String(correct)); app.submit('#question-form');
  }
  addQuestion('<img src=x onerror=alert(1)>',0); addQuestion('Second question',2);
  assert.equal(app.state().questionBank[0].correctIndex,0);
  app.click('#more-btn'); app.click('[data-nav="exams"]'); app.click('#add-exam-btn');
  app.set('#exam-form [name="name"]','MCQ quiz'); app.set('#exam-form [name="subjectId"]','sub-sci-1');
  app.set('#exam-form [name="chapterId"]',chapter); app.set('#exam-form [name="format"]','mcq'); app.submit('#exam-form');
  app.click('[data-quiz-start]'); assert.equal(app.state().activeQuiz.questions.length,2);
  assert.equal(app.d.querySelector('#view img'),null,'user-authored questions must be escaped');
  app.click('[data-quiz-answer="0"][value="0"]'); app.click('[data-quiz-answer="1"][value="1"]');
  assert.equal(app.state().activeQuiz.answers['0'],0);
  let saved=JSON.stringify(app.state()); app.dom.window.close(); app=create(saved);
  app.click('#more-btn'); app.click('[data-nav="exams"]'); app.click('[data-nav="quiz"]');
  assert.ok(app.d.querySelector('[data-quiz-answer="0"][value="0"]').checked);
  const originalSet=app.w.Storage.prototype.setItem; const originalAlert=app.w.alert;
  app.w.Storage.prototype.setItem=function(){throw new Error('quota');}; app.w.alert=()=>{};
  app.click('#quiz-submit'); assert.ok(app.state().activeQuiz); assert.equal(app.state().examResults.length,0);
  app.w.Storage.prototype.setItem=originalSet; app.w.alert=originalAlert;
  app.click('#quiz-submit'); assert.equal(app.state().examResults.length,1);
  assert.equal(app.state().examResults[0].obtainedMarks,12.5);
  assert.equal(app.state().activeQuiz,null);
  app.click('[data-nav="quiz-review"]'); assert.match(app.d.querySelector('#view').textContent,/Correct answer: Choice 3/);
  app.click('[data-quiz-weakness]'); app.click('[data-quiz-weakness]'); assert.equal(app.state().weaknesses.length,1); assert.equal(app.state().weaknesses[0].chapterId,chapter);
  app.click('[data-nav="exams"]'); app.click('[data-quiz-start]');
  let snapshot=app.state(); snapshot.activeQuiz.endsAt=Date.now()-1000;
  app.dom.window.close(); app=create(JSON.stringify(snapshot));
  assert.equal(app.state().activeQuiz,null); assert.equal(app.state().examResults.length,2);
  saved=JSON.stringify(app.state()); app.dom.window.close(); app=create(saved);
  assert.equal(app.state().examResults.length,2,'expiry cannot duplicate results');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Question-bank MCQ: authoring, chapter filter, answer persistence, scoring, review and expiry recovery passed.');
} finally {app.dom.window.close();}
