'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {createServer}=require('../server/server.js');
const fields=['subjects','chapters','tasks','sessions','revisions','practice','exams','examResults','notes','formulas','resources','weaknesses','journal','weeklyReviews','milestones','questionBank'];
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hsc-push-'));const sent=[];
 const fake={setVapidDetails(subject,pub,priv){assert.equal(pub,'public');assert.equal(priv,'private');},async sendNotification(subscription,body){sent.push({subscription,body:JSON.parse(body)});}};
 const server=await createServer({dataDir:dir,allowRegistration:true,pushConfig:{subject:'mailto:admin@example.org',publicKey:'public',privateKey:'private'},pushService:fake,schedule:false});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 async function req(url,method='GET',data,cookie){const headers={};if(method!=='GET')headers.Origin=base;if(data!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;const r=await fetch(base+url,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const a=await req('/api/register','POST',{username:'alice',password:'long password 123'});const cookie=a.cookie;assert.equal(a.status,201);
  const config=await req('/api/push/config','GET',undefined,cookie);assert.equal(config.json.publicKey,'public');assert.ok(!JSON.stringify(config.json).includes('private'));
  const keys={p256dh:'A'.repeat(87),auth:'B'.repeat(22)};
  assert.equal((await req('/api/push/subscription','POST',{endpoint:'https://evil.example/internal',keys},cookie)).status,400);
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys};assert.equal((await req('/api/push/subscription','POST',sub,cookie)).status,200);
  const snap=Object.assign({version:1,settings:{dailyTargetMinutes:480,notifications:{enabled:true,reminderTime:'20:00',revisionReminder:true,dailySummary:true}}},Object.fromEntries(fields.map(k=>[k,[]])));
  snap.revisions.push({dueDate:'2027-01-01',completedAt:null});snap.sessions.push({date:'2027-01-01',durationMinutes:45});
  assert.equal((await req('/api/state','PUT',{baseRevision:0,snapshot:snap},cookie)).status,200);
  await server.runReminders(new Date('2027-01-01T13:59:00Z'));assert.equal(sent.length,0);
  await server.runReminders(new Date('2027-01-01T14:00:00Z'));assert.equal(sent.length,1);assert.match(sent[0].body.body,/1 revision/);assert.match(sent[0].body.body,/45 minutes/);
  await server.runReminders(new Date('2027-01-01T15:00:00Z'));assert.equal(sent.length,1,'once a day');
  assert.equal((await req('/api/push/subscription','DELETE',{endpoint:sub.endpoint},cookie)).status,200);
  await server.runReminders(new Date('2027-01-02T14:00:00Z'));assert.equal(sent.length,1,'unsubscribed');
  console.log('Push server: authenticated subscription, endpoint restriction, Bangladesh schedule and daily deduplication passed (mock transport).');
 } finally {await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
