'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('../server/server.js');
const fields=['subjects','chapters','tasks','sessions','revisions','practice','exams','examResults','notes','formulas','resources','weaknesses','journal','weeklyReviews','milestones','questionBank'];
const snapshot=(name)=>Object.assign({version:1,settings:{},name},Object.fromEntries(fields.map(k=>[k,[]])));
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hsc-test-'));
  let providerCalls=0;
  const server=await createServer({dataDir:dir,allowRegistration:true,aiKey:'test-provider-key',aiAllowedUsers:'alice',providerFetch:async (url,opts)=>{providerCalls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.match(opts.headers.Authorization,/test-provider-key/);return {ok:true,json:async()=>({choices:[{message:{content:'Practice answer'}}]})};}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const ids = new Map();
  async function req(route,{method='GET',data,cookie,origin=base,userId}={}) {
    const headers={}; if(method!=='GET')headers.Origin=origin;if(data!==undefined)headers['Content-Type']='application/json'; if(cookie){headers.Cookie=cookie;const id = userId === undefined ? ids.get(cookie) : userId;if(id)headers['X-HSC-User']=id;}
    const res=await fetch(base+route,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});const text=await res.text();let json;try{json=JSON.parse(text);}catch{}return {status:res.status,json,text,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};
  }
  try {
    assert.equal((await req('/.data/study-data.json')).status,404);
    assert.equal((await req('/api/state')).status,401);
    assert.equal((await req('/api/register',{method:'POST',origin:'https://evil.example',data:{username:'alice',password:'long password 123'}})).status,403);
    const a=await req('/api/register',{method:'POST',data:{username:'alice',password:'long password 123'}}); assert.equal(a.status,201);assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/SameSite=Strict/);
    const b=await req('/api/register',{method:'POST',data:{username:'bob',password:'long password 456'}});assert.equal(b.status,201); ids.set(a.cookie,a.json.user.id); ids.set(b.cookie,b.json.user.id);
    assert.equal((await req('/api/state',{cookie:b.cookie,userId:a.json.user.id})).status,403,'stale tabs cannot read a different account');
    assert.equal((await req('/api/state',{method:'PUT',cookie:b.cookie,userId:a.json.user.id,data:{baseRevision:0,snapshot:snapshot('wrong account')}})).status,403);
    assert.equal((await req('/api/state',{cookie:b.cookie,userId:''})).status,403,'authenticated API requires intended account header');
    assert.equal((await req('/api/session',{cookie:b.cookie,userId:''})).json.user.name,'bob','session identifies the current cookie account');
    assert.equal((await req('/api/ai',{method:'POST',cookie:b.cookie,userId:a.json.user.id,data:{prompt:'Private prompt'}})).status,403);
    assert.equal((await req('/api/login',{method:'POST',data:{username:'alice',password:'wrong password 123'}})).status,401);
    assert.equal((await req('/api/state',{cookie:b.cookie})).json.snapshot,null);
    const put=await req('/api/state',{method:'PUT',cookie:a.cookie,data:{baseRevision:0,snapshot:snapshot('alice private')}});assert.equal(put.json.revision,1);
    assert.equal((await req('/api/state',{cookie:b.cookie})).json.snapshot,null,'accounts must be isolated');
    const [x,y]=await Promise.all([req('/api/state',{method:'PUT',cookie:a.cookie,data:{baseRevision:1,snapshot:snapshot('one')}}),req('/api/state',{method:'PUT',cookie:a.cookie,data:{baseRevision:1,snapshot:snapshot('two')}})]);
    assert.deepEqual([x.status,y.status].sort(),[200,409]);
    assert.equal((await req('/api/ai',{method:'POST',cookie:b.cookie,data:{prompt:'Explain'}})).status,503);
    const ai=await req('/api/ai',{method:'POST',cookie:a.cookie,data:{prompt:'Explain'}});assert.equal(ai.json.label,'AI-generated');assert.equal(providerCalls,1);assert.ok(!JSON.stringify(ai.json).includes('test-provider-key'));
    const stored=await fs.readFile(path.join(dir,'study-data.json'),'utf8');assert.ok(!stored.includes('long password 123'));assert.ok(!stored.includes('test-provider-key'));
    await req('/api/logout',{method:'POST',cookie:a.cookie,data:{}});assert.equal((await req('/api/state',{cookie:a.cookie})).status,401);
  } finally {await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
  await assert.rejects(createServer({production:true,publicOrigin:'http://not-secure',dataDir:dir}),/HTTPS/);
  console.log('Optional server: auth, isolation, CSRF, conflict concurrency, private files and AI allowlist passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
