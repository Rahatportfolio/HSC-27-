'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const fsp=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');const {createServer}=require('../server/server.js');
const html=fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
const files=['js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/i18n.js','js/sync.js','js/app.js'];
(async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'hsc-sync-'));const server=await createServer({dataDir:dir,allowRegistration:true,pushConfig:{publicKey:'public',privateKey:'private',subject:'mailto:a@example.org'},pushService:{setVapidDetails(){},async sendNotification(){}},schedule:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const errors=[];const apps=[];
 function make(){let cookie='',offline=false,beforePut=null,beforeGet=null,confirmAnswer=true;const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  let subscription = null; const manager = {async getSubscription(){return subscription;},async subscribe(){subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)},toJSON(){return {endpoint:this.endpoint,keys:this.keys};},async unsubscribe(){subscription=null;return true;}};return subscription;}}; const registration={pushManager:manager};
  const dom=new JSDOM(html,{url:base+'/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){Object.defineProperty(w.navigator,'serviceWorker',{value:{getRegistration:async()=>registration,ready:Promise.resolve(registration),register:async()=>registration}});w.PushManager=function(){};w.Notification={permission:'granted',requestPermission:async()=> 'granted'};w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.confirm=()=>confirmAnswer;w.alert=msg=>errors.push(msg);
   w.fetch=async(url,opts={})=>{if(offline)throw Error('offline');if(opts.method==='GET' && String(url)==='api/state' && beforeGet){const fn=beforeGet;beforeGet=null;await fn();}if(opts.method==='PUT' && String(url)==='api/state' && beforePut){const fn=beforePut;beforePut=null;await fn();}const headers={...opts.headers};if(cookie)headers.Cookie=cookie;if(opts.method && opts.method!=='GET')headers.Origin=base;const r=await fetch(new URL(url,base+'/'),{...opts,headers});const c=r.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return r;};
  }});
  const w=dom.window,d=w.document;w.addEventListener('error',e=>errors.push(e.error ? e.error.stack : e.message));
  for(const f of files){const s=d.createElement('script');s.textContent=fs.readFileSync(f,'utf8');d.body.appendChild(s);}
  const app={dom,w,d,offline(v){offline=v;},confirm(v){confirmAnswer=v;},cookie(v){if(v!==undefined)cookie=v;return cookie;},beforePut(fn){beforePut=fn;},beforeGet(fn){beforeGet=fn;},click(sel){const el=d.querySelector(sel);assert.ok(el,sel);el.click();},set(sel,v){const el=d.querySelector(sel);assert.ok(el,sel);el.value=v;el.dispatchEvent(new w.Event('change',{bubbles:true}));},submit(sel,button){const form=d.querySelector(sel);assert.ok(form,sel);form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:d.querySelector(button)}));},state(){return JSON.parse(w.localStorage.getItem('hsc27_state_v1'));},meta(){return JSON.parse(w.localStorage.getItem('hsc27_sync_v1'));}};apps.push(app);return app;
 }
 async function wait(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('timeout');}
 async function auth(a,action){a.click('#more-btn');a.click('[data-nav="sync"]');a.set('[name="username"]','alice');a.set('[name="password"]','strong password 123');a.submit('#sync-auth-form',`[name="action"][value="${action}"]`);await wait(()=>a.d.querySelector('#sync-connect,#sync-pull'));}
 try{
  const a=make();await auth(a,'register');a.click('#sync-connect');await wait(()=>a.meta()?.revision===1&&!a.meta().dirty);
  a.click('[data-nav="subjects"]');a.click('[data-nav="subject"][data-id="sub-sci-1"]');a.click('#add-chapter-btn');a.set('#chapter-form [name="name"]','Shared chapter');a.submit('#chapter-form');
  await wait(()=>a.meta()?.revision===2&&!a.meta().dirty);
  const b=make();await auth(b,'login');b.click('#sync-pull');await wait(()=>b.meta()?.revision===2);assert.equal(b.state().chapters[0].name,'Shared chapter');
  // B changes while offline, A writes online; a subsequent B upload must conflict, not overwrite.
  b.offline(true);b.click('[data-nav="subjects"]');b.click('[data-nav="subject"][data-id="sub-sci-1"]');b.click('#add-chapter-btn');b.set('#chapter-form [name="name"]','B offline work');b.submit('#chapter-form');assert.equal(b.meta().dirty,true);
  a.click('#add-chapter-btn');a.set('#chapter-form [name="name"]','A online work');a.submit('#chapter-form');await wait(()=>a.meta().revision===3&&!a.meta().dirty);
  b.offline(false);b.click('#more-btn');b.click('[data-nav="sync"]');b.click('#sync-now');await wait(()=>b.meta().conflict===true);assert.equal(b.state().chapters.length,2);assert.equal(b.state().chapters[1].name,'B offline work');
  // A local edit during a cloud pull must abort replacement rather than discard the edit.
  b.beforeGet(async()=>{b.w.eval("getState().chapters.push({id:'during-pull',subjectId:'sub-sci-1',name:'Edited during pull',order:7});save()");});
  b.click('#sync-pull');await wait(()=>b.d.querySelector('#view').textContent.includes('Local data changed during download'));
  assert.ok(b.state().chapters.some(c=>c.id==='during-pull'));assert.equal(b.meta().conflict,true);
  // Save the cloud copy without replacing the offline local copy.
  b.w.eval("download = (name, content) => { window.savedCloudName = name; window.savedCloudJSON = content; }");
  b.click('#sync-cloud-backup');await wait(()=>b.w.savedCloudJSON);const backup=JSON.parse(b.w.savedCloudJSON);
  assert.equal(backup.chapters[1].name,'A online work');assert.equal(b.state().chapters[1].name,'B offline work');
  assert.match(b.d.querySelector('#view').textContent,/not encrypted/);
  b.confirm(false);b.click('#sync-overwrite-cloud');await wait(()=>b.d.querySelector('#sync-overwrite-cloud') && !b.d.querySelector('#sync-overwrite-cloud').disabled);assert.equal(b.meta().revision,2);assert.equal(b.meta().conflict,true);b.confirm(true);
  // Simulate a third device changing the cloud after the replacement's GET but before PUT.
  b.beforePut(async()=>{
    const headers={'Cookie':a.cookie(),'X-HSC-User':a.meta().userId,'Origin':base,'Content-Type':'application/json'};
    const current=await (await fetch(base+'/api/state',{headers})).json();current.snapshot.settings.studentName='Cloud race';
    const result=await fetch(base+'/api/state',{method:'PUT',headers,body:JSON.stringify({baseRevision:current.revision,snapshot:current.snapshot})});assert.equal(result.status,200);
  });
  b.click('#sync-overwrite-cloud');await wait(()=>b.d.querySelector('#view').textContent.includes('Cloud changed again'));
  assert.equal(b.meta().conflict,true);assert.equal(b.state().chapters[1].name,'B offline work');
  // A local edit made while the replacement PUT is in flight must remain queued.
  b.beforePut(async()=>{b.w.eval("getState().chapters.push({id:'in-flight',subjectId:'sub-sci-1',name:'Edit during upload',status:'not-started',completionPct:0,order:5});save()");});
  b.click('#sync-overwrite-cloud');await wait(()=>b.meta().revision===5 && b.meta().dirty && !b.meta().conflict);
  await wait(()=>b.meta().revision===6 && !b.meta().dirty);
  const cloudAfter=JSON.parse(await fsp.readFile(path.join(dir,'study-data.json'),'utf8')).users[0].snapshot;
  assert.equal(cloudAfter.chapters[1].name,'B offline work');assert.ok(cloudAfter.chapters.some(c=>c.id==='in-flight'));
  assert.equal(a.state().chapters[1].name,'A online work','local copy on other device is untouched');
  const c=make();await auth(c,'login');c.click('#sync-pull');await wait(()=>c.meta()?.revision===6);assert.ok(c.state().chapters.some(ch=>ch.id==='in-flight'));
  // Revoked sessions return to sign-in without clearing the device data.
  const revoked=await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:c.cookie(),'X-HSC-User':c.meta().userId,Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(revoked.status,200);
  c.click('#sync-cloud-backup');await wait(()=>c.d.querySelector('#sync-auth-form'));assert.ok(c.state().chapters.some(ch=>ch.id==='in-flight'));
  b.click('#push-enable');await wait(()=>b.d.querySelector('#view').textContent.includes('Push enabled'));
  const stored=JSON.parse(await fsp.readFile(path.join(dir,'study-data.json'),'utf8'));assert.equal(stored.users[0].subscriptions.length,1);
  b.click('#push-disable');await wait(()=>b.d.querySelector('#view').textContent.includes('Push disabled'));
  const after=JSON.parse(await fsp.readFile(path.join(dir,'study-data.json'),'utf8'));assert.equal(after.users[0].subscriptions.length,0);
  b.click('#sync-logout');await wait(()=>b.d.querySelector('#sync-auth-form')); b.set('[name="username"]','bob');b.set('[name="password"]','another secure password');b.submit('#sync-auth-form','[name="action"][value="register"]');await wait(()=>b.d.querySelector('#sync-disconnect'));
  assert.match(b.d.querySelector('#view').textContent,/different account/);assert.equal(b.state().chapters[1].name,'B offline work');assert.equal(b.d.querySelector('#sync-connect'),null);
  // Cookie changed to Bob in another tab, while A still believes it is Alice.
  a.cookie(b.cookie());a.w.eval("getState().chapters.push({id:'wrong-account-test',subjectId:'sub-sci-1',name:'Alice private',order:9});save();navigate('sync')");
  a.click('#sync-now');await wait(()=>a.d.querySelector('#sync-auth-form'));
  assert.match(a.d.querySelector('#view').textContent,/Account changed/);assert.ok(a.state().chapters.some(c=>c.id==='wrong-account-test'));
  const users=JSON.parse(await fsp.readFile(path.join(dir,'study-data.json'),'utf8')).users;assert.equal(users.find(u=>u.name==='bob').snapshot,null,'stale tab must never overwrite another account');
  assert.equal(errors.length,0,errors.join('\n'));console.log('Client sync: conflict backups/replacement, revision race, in-flight edits and cross-tab account isolation passed.');
 }finally{apps.forEach(a=>a.dom.window.close());await new Promise(r=>server.close(r));await fsp.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
