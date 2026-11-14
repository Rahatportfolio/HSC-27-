/* Optional single-process self-hosted API. web-push is used when configured. */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const ROOT = path.resolve(__dirname, '..');
const ASSETS = new Set(['index.html','manifest.webmanifest','sw.js','css/style.css','icons/icon.svg','icons/icon-192.png','icons/icon-512.png', 'js/utils.js','js/store.js','js/views/dashboard.js','js/views/subjects.js','js/views/planner.js','js/views/focus.js','js/views/progress.js','js/views/library.js','js/views/more.js','js/views/quiz.js','js/i18n.js','js/sync.js','js/app.js']);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const MAX_BODY = 6 * 1024 * 1024;
const FIELDS = ['subjects','chapters','tasks','sessions','revisions','practice','exams','examResults','notes','formulas','resources','weaknesses','journal','weeklyReviews','milestones','questionBank'];

async function createServer(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.HSC_DATA_DIR || path.join(ROOT, '.data'));
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const publicOrigin = options.publicOrigin || process.env.PUBLIC_ORIGIN || '';
  if (production && (!publicOrigin || !/^https:\/\//.test(publicOrigin) || new URL(publicOrigin).origin !== publicOrigin)) throw new Error('Production requires PUBLIC_ORIGIN set to the exact HTTPS origin.');
  const allowRegistration = options.allowRegistration ?? process.env.HSC_ALLOW_REGISTRATION === 'true';
  const aiKey = options.aiKey || process.env.OPENAI_API_KEY || '';
  const aiAllowed = new Set((options.aiAllowedUsers || process.env.AI_ALLOWED_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const aiModel = options.aiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const pushConfig = options.pushConfig || { publicKey:process.env.VAPID_PUBLIC_KEY || '', privateKey:process.env.VAPID_PRIVATE_KEY || '', subject:process.env.VAPID_SUBJECT || '' };
  const pushEnabled = !!(pushConfig.publicKey && pushConfig.privateKey && pushConfig.subject);
  const pushService = pushEnabled ? (options.pushService || require('web-push')) : null;
  if (pushEnabled) { try { pushService.setVapidDetails(pushConfig.subject, pushConfig.publicKey, pushConfig.privateKey); } catch { throw new Error('Invalid VAPID configuration.'); } }
  const providerFetch = options.providerFetch || globalThis.fetch;
  await fs.mkdir(dataDir, {recursive:true, mode:0o700});
  const dbFile = path.join(dataDir, 'study-data.json');
  let db;
  try { db = JSON.parse(await fs.readFile(dbFile, 'utf8')); if (!db || db.version !== 1 || !Array.isArray(db.users)) throw Error('Invalid database'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; db = {version:1, users:[]}; }
  const sessions = new Map(), attempts = new Map();
  let chain = Promise.resolve();
  const mutate = (fn) => {
    const work = chain.then(async () => {
      const draft = structuredClone(db);
      const result = await fn(draft);
      if (result.write) {
        const temp = path.join(dataDir, `.tmp-${crypto.randomBytes(12).toString('hex')}`);
        try { await fs.writeFile(temp, JSON.stringify(draft), {mode:0o600, flag:'wx'}); await fs.rename(temp, dbFile); }
        catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
        db = draft;
      }
      return result.value;
    });
    chain = work.catch(() => {});
    return work;
  };
  function send(res, status, body, headers = {}) {
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...headers});
    res.end(JSON.stringify(body));
  }
  function cookie(req) { return (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('hsc_session='))?.slice('hsc_session='.length) || ''; }
  function session(req) { const key = cookie(req), s = sessions.get(key); if (!s || s.expires < Date.now()) { sessions.delete(key); return null; } return s; }
  function setCookie(token, age) { return `hsc_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`; }
  function originOK(req) {
    const expected = publicOrigin || `http://${req.headers.host}`;
    return req.headers.origin === expected && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');
  }
  function limited(req) {
    const key = req.socket.remoteAddress || 'unknown', now = Date.now();
    const recent = (attempts.get(key) || []).filter(t=>now-t<600000);
    recent.push(now); attempts.set(key,recent);
    return recent.length > 30;
  }
  async function body(req) {
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw Object.assign(Error('JSON required'),{status:415});
    let total = 0; const chunks = [];
    for await (const chunk of req) { total += chunk.length; if (total > MAX_BODY) throw Object.assign(Error('Request too large'),{status:413}); chunks.push(chunk); }
    try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(); return parsed; } catch { throw Object.assign(Error('Invalid JSON object'),{status:400}); }
  }
  function username(v) { return typeof v === 'string' && /^[a-zA-Z0-9_.-]{3,32}$/.test(v) ? v.toLowerCase() : null; }
  function validSnapshot(x) { return x && typeof x === 'object' && x.version === 1 && x.settings && typeof x.settings === 'object' && !Array.isArray(x.settings) && FIELDS.every(k => Array.isArray(x[k]) && x[k].every(item => item && typeof item === 'object' && !Array.isArray(item))) && !(x.settings.ai && x.settings.ai.apiKey); }
  const handler = async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://local').pathname;
      if (!pathname.startsWith('/api/')) {
        if (!['GET','HEAD'].includes(req.method)) return send(res,405,{error:'Method not allowed'});
        const name = pathname === '/' ? 'index.html' : pathname.slice(1);
        if (!ASSETS.has(name)) return send(res,404,{error:'Not found'});
        const bytes = await fs.readFile(path.join(ROOT,name));
        res.writeHead(200, {'Content-Type':MIME[path.extname(name)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Cache-Control':'no-cache'});
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      if (!['GET','HEAD'].includes(req.method) && !originOK(req)) return send(res,403,{error:'Origin rejected'});
      if ((pathname === '/api/register' || pathname === '/api/login') && req.method === 'POST') {
        if (limited(req)) return send(res,429,{error:'Too many attempts. Try later.'});
        const input = await body(req), name = username(input.username);
        if (!name || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 200) return send(res,400,{error:'Username must be 3–32 letters, digits, dot, dash or underscore; password must be 12–200 characters.'});
        if (pathname === '/api/register') {
          if (!allowRegistration) return send(res,403,{error:'Registration is disabled on this server.'});
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = (await scrypt(input.password, salt, 64)).toString('hex');
          const user = await mutate(async (draft) => {
            if (draft.users.some(u=>u.name===name)) return {write:false,value:null};
            const u = {id:crypto.randomBytes(16).toString('hex'),name,salt,hash,revision:0,snapshot:null}; draft.users.push(u);
            return {write:true,value:{id:u.id,name:u.name}};
          });
          if (!user) return send(res,409,{error:'Username unavailable.'});
          const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{userId:user.id,expires:Date.now()+7*86400000});
          return send(res,201,{user},{'Set-Cookie':setCookie(token,604800)});
        }
        const u = db.users.find(x=>x.name===name);
        const salt = u ? u.salt : '00000000000000000000000000000000';
        const hash = await scrypt(input.password,salt,64);
        if (!u || !crypto.timingSafeEqual(hash,Buffer.from(u.hash,'hex'))) return send(res,401,{error:'Invalid credentials.'});
        const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{userId:u.id,expires:Date.now()+7*86400000});
        return send(res,200,{user:{id:u.id,name:u.name}},{'Set-Cookie':setCookie(token,604800)});
      }
      const auth = session(req), u = auth && db.users.find(x=>x.id===auth.userId);
      if (!u) return send(res,401,{error:'Sign in required.'});
      if (pathname === '/api/session' && req.method === 'GET') return send(res,200,{user:{id:u.id,name:u.name}, aiAvailable:!!aiKey && aiAllowed.has(u.name)});
      if (pathname === '/api/logout' && req.method === 'POST') { sessions.delete(cookie(req)); return send(res,200,{ok:true},{'Set-Cookie':setCookie('',0)}); }
      if (pathname === '/api/push/config' && req.method === 'GET') return send(res,200,{enabled:pushEnabled,publicKey:pushEnabled ? pushConfig.publicKey : null});
      if (pathname === '/api/push/subscription' && req.method === 'POST') {
        if (!pushEnabled) return send(res,503,{error:'Push notifications are not configured.'});
        const input = await body(req);
        let endpoint;
        try { const url = new URL(input.endpoint); if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname) || url.hostname.endsWith('.push.apple.com'))) throw Error(); endpoint=url.href; }
        catch { return send(res,400,{error:'Unsupported push endpoint.'}); }
        if (!input.keys || typeof input.keys.p256dh !== 'string' || typeof input.keys.auth !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(input.keys.p256dh) || !/^[A-Za-z0-9_-]{20,30}$/.test(input.keys.auth)) return send(res,400,{error:'Invalid push keys.'});
        const result = await mutate(async draft => {
          const user = draft.users.find(x=>x.id===auth.userId); user.subscriptions ||= [];
          const existing = user.subscriptions.find(x=>x.endpoint===endpoint);
          if (!existing && user.subscriptions.length >= 5) return {write:false,value:false};
          if (existing) existing.keys = input.keys; else user.subscriptions.push({endpoint,keys:{p256dh:input.keys.p256dh,auth:input.keys.auth},lastSentDate:''});
          return {write:true,value:true};
        });
        return result ? send(res,200,{ok:true}) : send(res,400,{error:'Maximum five subscriptions per account.'});
      }
      if (pathname === '/api/push/subscription' && req.method === 'DELETE') {
        const input=await body(req);
        await mutate(async draft=>{const user=draft.users.find(x=>x.id===auth.userId);user.subscriptions=(user.subscriptions || []).filter(x=>x.endpoint!==input.endpoint);return {write:true,value:true};});
        return send(res,200,{ok:true});
      }
      if (pathname === '/api/state' && req.method === 'GET') return send(res,200,{revision:u.revision,snapshot:u.snapshot});
      if (pathname === '/api/state' && req.method === 'PUT') {
        const input = await body(req);
        if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0 || !validSnapshot(input.snapshot)) return send(res,400,{error:'Invalid state or revision.'});
        const result = await mutate(async (draft) => {
          const user = draft.users.find(x=>x.id===auth.userId);
          if (!user || user.revision !== input.baseRevision) return {write:false,value:{conflict:true,revision:user ? user.revision : null}};
          user.snapshot=input.snapshot; user.revision++; return {write:true,value:{revision:user.revision}};
        });
        if (result.conflict) return send(res,409,{error:'Conflict: cloud data changed.',revision:result.revision});
        return send(res,200,result);
      }
      if (pathname === '/api/ai' && req.method === 'POST') {
        if (!aiKey || !aiAllowed.has(u.name)) return send(res,503,{error:'AI is not enabled for this account.'});
        if (limited(req)) return send(res,429,{error:'Too many requests. Try later.'});
        const input=await body(req);
        if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000) return send(res,400,{error:'Prompt must be 1–4000 characters.'});
        try {
          const upstream=await providerFetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+aiKey},body:JSON.stringify({model:aiModel,max_tokens:600,messages:[{role:'system',content:'You are a study assistant for Bangladesh HSC students. Label generated questions as AI-generated practice, never official board questions. Do not guarantee examination results.'},{role:'user',content:input.prompt.trim()}]}),signal:AbortSignal.timeout(30000)});
          if (!upstream.ok) return send(res,502,{error:'AI provider request failed.'});
          const response=await upstream.json(); const answer=response?.choices?.[0]?.message?.content;
          if (typeof answer !== 'string') return send(res,502,{error:'AI provider returned an invalid response.'});
          return send(res,200,{label:'AI-generated',answer:answer.slice(0,12000)});
        } catch { return send(res,502,{error:'AI provider is unavailable.'}); }
      }
      return send(res,404,{error:'Not found'});
    } catch (error) { if (!res.headersSent) send(res,error.status || 500,{error:error.status ? error.message : 'Server error.'}); else res.end(); }
  };
  let runningReminders = false;
  async function runReminders(now = new Date()) {
    if (!pushEnabled || runningReminders) return;
    runningReminders = true;
    try {
      const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
      const part = (type) => parts.find(p=>p.type===type).value;
      const today = `${part('year')}-${part('month')}-${part('day')}`, time = `${part('hour')}:${part('minute')}`;
      const users = structuredClone(db.users);
      for (const user of users) {
        const st=user.snapshot, pref=st && st.settings && st.settings.notifications;
        if (!pref || !pref.enabled || time < (/^([01]\d|2[0-3]):[0-5]\d$/.test(pref.reminderTime || '') ? pref.reminderTime : '20:00')) continue;
        const parts=[];
        if (pref.revisionReminder) {const count=st.revisions.filter(r=>!r.completedAt && typeof r.dueDate==='string' && r.dueDate<=today).length;if(count)parts.push(`${count} revision(s) due`);}
        if (pref.missedTaskReminder) {const count=st.tasks.filter(t=>t.status!=='done' && (t.status==='carried' || (typeof t.date==='string' && t.date<today))).length;if(count)parts.push(`${count} unfinished task(s)`);}
        if (pref.examReminder) {const todayMs=Date.parse(today+'T00:00:00Z');const count=st.exams.filter(e=>typeof e.date==='string' && Date.parse(e.date+'T00:00:00Z')>=todayMs && Date.parse(e.date+'T00:00:00Z')<=todayMs+7*86400000).length;if(count)parts.push(`${count} test(s) within seven days`);}
        if (pref.dailySummary || pref.sessionReminder) {const mins=st.sessions.filter(s=>s.date===today).reduce((a,s)=>a+(Number(s.durationMinutes)||0),0);if(pref.dailySummary)parts.push(`${Math.round(mins)} minutes studied today`);else if(mins<(Number(st.settings.dailyTargetMinutes)||480))parts.push('Study target not reached');}
        if (pref.weeklyReview) {const date=new Date(today+'T00:00:00Z');const offset=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-offset);const start=date.toISOString().slice(0,10);if(!st.weeklyReviews.some(r=>r.weekStart===start))parts.push('Weekly review pending');}
        if (!parts.length) continue;
        for (const sub of user.subscriptions || []) {
          if (sub.lastSentDate===today) continue;
          try {
            await pushService.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({title:'Study reminders',body:parts.join(' · ').slice(0,220)}),{TTL:3600,timeout:10000});
            await mutate(async draft=>{const u=draft.users.find(x=>x.id===user.id);const current=u && (u.subscriptions||[]).find(x=>x.endpoint===sub.endpoint);if(current)current.lastSentDate=today;return {write:!!current,value:null};});
          } catch (error) {
            if (error.statusCode===404 || error.statusCode===410) await mutate(async draft=>{const u=draft.users.find(x=>x.id===user.id);if(u)u.subscriptions=(u.subscriptions||[]).filter(x=>x.endpoint!==sub.endpoint);return {write:!!u,value:null};});
          }
        }
      }
    } finally { runningReminders = false; }
  }
  const server = http.createServer(handler);
  server.runReminders = runReminders; // Explicit hook for deterministic tests.
  if (pushEnabled && options.schedule !== false) {
    const interval = setInterval(() => { runReminders().catch(() => {}); },60000);
    interval.unref(); server.on('close',()=>clearInterval(interval));
  }
  return server;
}
if (require.main === module) createServer().then(server=>server.listen(Number(process.env.PORT)||8000,process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'),()=>console.log(`Study app server listening on port ${server.address().port}`))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports = {createServer};
