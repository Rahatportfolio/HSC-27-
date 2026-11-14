/* Optional authenticated, conflict-safe sync and server-side AI.
 * The app still works locally when the optional backend is unavailable.
 */
'use strict';
const SYNC_META_KEY = 'hsc27_sync_v1';
const SYNC_BASE_KEY = 'hsc27_sync_base_v1';
const SYNC_COLLECTIONS = ['subjects','chapters','tasks','sessions','revisions','practice','exams','examResults','notes','formulas','resources','weaknesses','journal','weeklyReviews','milestones','questionBank'];
const ADDITIVE_MERGE_FIELDS = new Set(['notes','sessions','journal']);
let syncUser = null, syncRemote = null, syncMeta = null, syncMessage = '', syncTimer = null, syncBusy = false, syncSuppress = false, syncBlocked = false;
let aiReply = '', syncPushConfig = null, syncActionBusy = false;
try { syncMeta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || 'null'); } catch { syncBlocked = true; }
function writeSyncMeta() {
  try { if (syncMeta) localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta)); else localStorage.removeItem(SYNC_META_KEY); return true; }
  catch { syncBlocked = true; syncMessage = 'Sync metadata could not be saved; automatic sync is stopped. Export a backup.'; return false; }
}
function syncBeforeLocalSave() {
  if (syncSuppress || syncBlocked || !syncMeta || !syncMeta.enabled) return false;
  syncMeta.dirty = true; syncMeta.change = (syncMeta.change || 0) + 1;
  return writeSyncMeta();
}
function syncAfterLocalSave(marked) { if (marked) scheduleSync(); }
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  if (!syncBlocked && !storageBlocked && syncUser && syncMeta && syncMeta.enabled && syncMeta.userId === syncUser.id && syncMeta.dirty && !syncMeta.conflict) syncTimer = setTimeout(flushSync, 1200);
}
function syncRefresh() { if (typeof currentRoute !== 'undefined' && ['sync','ai'].includes(currentRoute.name)) render(); }
async function api(path, method = 'GET', payload) {
  const headers = payload === undefined ? {} : {'Content-Type':'application/json'};
  if (syncUser && !['api/session','api/login','api/register'].includes(path)) headers['X-HSC-User'] = syncUser.id;
  const response = await fetch(path, { method, credentials:'same-origin', cache:'no-store', headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  let data; try { data = await response.json(); } catch { throw new Error('Optional backend is unavailable.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.'); error.status = response.status; error.code = data.code;
    if (data.code === 'ACCOUNT_MISMATCH' || (response.status === 401 && syncUser && !['api/login','api/register'].includes(path))) {
      if (response.status === 401 && !data.code) error.code = 'SESSION_EXPIRED';
      syncUser = null; syncRemote = null; syncPushConfig = null; aiReply = '';
    }
    throw error;
  }
  return data;
}
async function syncInit() {
  if (isOfflineAndroid()) return; // The packaged Android edition has no server.
  try { const result = await api('api/session'); syncUser = result.user; syncUser.aiAvailable = result.aiAvailable; await refreshCloud(); syncPushConfig = await api('api/push/config');
    if (syncMeta && syncMeta.enabled && syncMeta.userId === syncUser.id && !syncMeta.dirty && !syncMeta.conflict && syncRemote.snapshot && syncRemote.revision === syncMeta.revision) await saveSyncBase(syncRemote.snapshot,syncUser.id,syncRemote.revision);
    scheduleSync(); }
  catch { syncUser = null; }
  syncRefresh();
}
async function refreshCloud() { syncRemote = await api('api/state'); }
function cloudSnapshot() {
  const snapshot = JSON.parse(exportJSON());
  // Running timers cannot be safely shared between two devices.
  delete snapshot.activeFocus; delete snapshot.activeExam; delete snapshot.activeQuiz; delete snapshot.activeWritten;
  return snapshot;
}
// A compact, per-collection SHA-256 baseline avoids storing a second copy of PDFs.
// Unsupported crypto, missing IDs, duplicate IDs or storage pressure disable merging, not sync.
function canonicalSyncValue(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalSyncValue).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalSyncValue(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
async function syncHash(value) {
  if (!globalThis.crypto || !crypto.subtle || typeof TextEncoder === 'undefined') throw new Error('Secure hashing unavailable.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSyncValue(value)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
function syncCollectionMap(snapshot, key) {
  if (!snapshot || !Array.isArray(snapshot[key])) throw new Error('Invalid collection.');
  const map = new Map();
  for (const row of snapshot[key]) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id || map.has(row.id)) throw new Error('Missing or duplicate record ID.');
    map.set(row.id,row);
  }
  return map;
}
function syncOtherFields(snapshot) {
  const other = Object.create(null);
  for (const key of Object.keys(snapshot).sort()) if (!SYNC_COLLECTIONS.includes(key)) other[key] = snapshot[key];
  return other;
}
async function syncFingerprint(snapshot, userId, revision) {
  if (!snapshot || snapshot.version !== 1 || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid baseline.');
  const maps = SYNC_COLLECTIONS.map(key => syncCollectionMap(snapshot,key));
  const collections = {};
  await Promise.all(SYNC_COLLECTIONS.map(async (key,i) => {
    const ids = [...maps[i].keys()];
    collections[key] = {ids, hash:await syncHash(ids.map(id => maps[i].get(id)))};
  }));
  return {version:1,userId,revision,otherHash:await syncHash(syncOtherFields(snapshot)),collections};
}
async function saveSyncBase(snapshot, userId, revision) {
  try {
    const base = await syncFingerprint(snapshot,userId,revision);
    if (!syncUser || syncUser.id !== userId || !syncMeta || syncMeta.userId !== userId || syncMeta.revision !== revision) return false;
    localStorage.setItem(SYNC_BASE_KEY,JSON.stringify(base));
    return true;
  } catch { try { localStorage.removeItem(SYNC_BASE_KEY); } catch {} return false; }
}
async function mergeIndependentAdditions(base, local, remote, userId, revision) {
  if (!base || base.version !== 1 || base.userId !== userId || base.revision !== revision || !base.collections) throw new Error('A matching secure sync baseline is unavailable. Back up both copies and resolve manually.');
  const [localOther, remoteOther] = await Promise.all([syncHash(syncOtherFields(local)),syncHash(syncOtherFields(remote))]);
  if (localOther !== base.otherHash || remoteOther !== base.otherHash) throw new Error('Settings or other shared data changed. Automatic merging is unsafe.');
  const merged = JSON.parse(JSON.stringify(remote)), additions = {local:0,cloud:0};
  for (const key of SYNC_COLLECTIONS) {
    const expected = base.collections[key];
    if (!expected || !Array.isArray(expected.ids) || typeof expected.hash !== 'string' || new Set(expected.ids).size !== expected.ids.length || expected.ids.some(id => typeof id !== 'string' || !id)) throw new Error('Invalid sync baseline.');
    const localMap = syncCollectionMap(local,key), remoteMap = syncCollectionMap(remote,key), ids = expected.ids.slice();
    if (ids.some(id => !localMap.has(id) || !remoteMap.has(id))) throw new Error('Records were deleted on a device. Automatic merging is unsafe.');
    if (canonicalSyncValue([...localMap.keys()].slice(0,ids.length)) !== canonicalSyncValue(ids) || canonicalSyncValue([...remoteMap.keys()].slice(0,ids.length)) !== canonicalSyncValue(ids)) throw new Error('Existing records were reordered or inserted before older records. Automatic merging is unsafe.');
    const [lh,rh] = await Promise.all([syncHash(ids.map(id => localMap.get(id))),syncHash(ids.map(id => remoteMap.get(id)))]);
    if (lh !== expected.hash || rh !== expected.hash) throw new Error('Existing records changed on a device. Automatic merging is unsafe.');
    const oldIds = new Set(ids), localNew = [...localMap.keys()].filter(id => !oldIds.has(id)), remoteNew = [...remoteMap.keys()].filter(id => !oldIds.has(id));
    if (!ADDITIVE_MERGE_FIELDS.has(key) && (localNew.length || remoteNew.length)) throw new Error('Changes include unsupported record types. Automatic merging is unsafe.');
    for (const id of localNew) {
      if (remoteMap.has(id)) {
        if (canonicalSyncValue(localMap.get(id)) !== canonicalSyncValue(remoteMap.get(id))) throw new Error('A new record ID differs between devices.');
      } else { merged[key].push(localMap.get(id)); additions.local++; }
    }
    additions.cloud += remoteNew.filter(id => !localMap.has(id)).length;
  }
  // New notes/sessions may only reference records already present in the unchanged baseline.
  const subjects = new Map(merged.subjects.map(s => [s.id,s])), chapters = new Map(merged.chapters.map(c => [c.id,c]));
  for (const key of ['notes','sessions']) for (const row of merged[key]) {
    const ch = row.chapterId ? chapters.get(row.chapterId) : null;
    if ((row.subjectId && !subjects.has(row.subjectId)) || (row.chapterId && (!ch || ch.subjectId !== row.subjectId))) throw new Error('A note or session has an invalid subject/chapter link.');
  }
  const runIds = new Set();
  for (const session of merged.sessions) if (session.runId) { if (runIds.has(session.runId)) throw new Error('Duplicate timer session detected.'); runIds.add(session.runId); }
  if (!additions.local && !additions.cloud) throw new Error('No independent additions to merge.');
  return {snapshot:merged,additions};
}
async function flushSync() {
  if (syncBusy || syncBlocked || storageBlocked || !syncUser || !syncMeta || !syncMeta.enabled || syncMeta.userId !== syncUser.id || !syncMeta.dirty || syncMeta.conflict) return;
  syncBusy = true;
  const meta = syncMeta, change = meta.change, revision = meta.revision;
  try {
    const sentSnapshot = cloudSnapshot();
    const response = await api('api/state', 'PUT', {baseRevision:revision, snapshot:sentSnapshot});
    if (syncMeta !== meta || !syncUser || syncUser.id !== meta.userId) return;
    meta.revision = response.revision;
    syncRemote = {revision:response.revision, snapshot:true};
    if (meta.change === change) meta.dirty = false;
    syncMessage = meta.dirty ? 'Saved to cloud; newer changes are queued.' : 'Cloud copy is up to date.';
    if (writeSyncMeta()) await saveSyncBase(sentSnapshot,meta.userId,response.revision);
  } catch (error) {
    if (syncMeta !== meta) return;
    if (error.status === 409) { meta.conflict = true; writeSyncMeta(); syncMessage = 'Conflict: cloud data changed on another device. Local data is preserved; export it before choosing a cloud copy.'; }
    else if (error.code === 'ACCOUNT_MISMATCH') syncMessage = 'Account changed in another tab. Sign in again; local data remains on this device.';
    else if (error.code === 'SESSION_EXPIRED') syncMessage = 'Session expired. Sign in again; local data remains on this device.';
    else syncMessage = 'Sync pending. Check connection and sign-in; local data remains on this device.';
  } finally { syncBusy = false; syncRefresh(); if (syncMeta && syncMeta.dirty && !syncMeta.conflict && !syncMessage.startsWith('Sync pending')) scheduleSync(); }
}
function renderSync() {
  if (!syncUser) return `<div class="page"><h1>Account &amp; sync</h1><p class="muted small">Optional self-hosted backend required. Your local data is not sent until you explicitly connect it. Use HTTPS on a trusted server.</p><p class="muted">${esc(syncMessage)}</p>
    <form id="sync-auth-form" class="card form"><label class="field"><span data-i18n="extra121">Username</span><input name="username" autocomplete="username" minlength="3" maxlength="32" required></label><label class="field"><span data-i18n="extra122">Password (at least 12 characters)</span><input name="password" type="password" autocomplete="current-password" minlength="12" maxlength="200" required></label><div class="row gap wrap"><button class="btn primary" type="submit" value="login" name="action" data-i18n="extra123">Sign in</button><button class="btn" type="submit" value="register" name="action" data-i18n="extra124">Create account</button></div></form></div>`;
  const linked = syncMeta && syncMeta.enabled && syncMeta.userId === syncUser.id;
  const mismatch = syncMeta && syncMeta.enabled && syncMeta.userId !== syncUser.id;
  return `<div class="page"><h1>Account &amp; sync</h1><p>Signed in as <strong>${esc(syncUser.name)}</strong>.</p><p class="muted small">Sync transfers a full unencrypted snapshot to your server. Running focus, MCQ, written tests and manual exam timers stay on the current device. Keep independent JSON backups.</p><p>${esc(syncMessage)}</p>
    ${syncBlocked ? '<p>Sync metadata is unavailable. Export a backup and check device storage.</p>' : mismatch ? '<p>This device is linked to a different account. Sign back into that account or disconnect its link first; queued changes will not be uploaded to this account.</p>' : linked ? `<p>Local changes: ${syncMeta.conflict ? 'conflict — automatic sync paused' : syncMeta.dirty ? 'queued' : 'synced'} · cloud revision ${esc(syncMeta.revision)}</p><div class="row gap wrap"><button class="btn" id="sync-now" data-i18n="extra130">Sync now</button><button class="btn" id="sync-cloud-backup" data-i18n="extra131">Download cloud backup</button><button class="btn" id="sync-pull" data-i18n="extra132">Replace local data with cloud copy</button>${syncMeta.conflict ? '<button class="btn" id="sync-merge-additions" data-i18n="extra133">Merge independent additions</button><button class="btn danger-ghost" id="sync-overwrite-cloud" data-i18n="extra134">Replace cloud with this device</button>' : ''}</div>${syncMeta.conflict ? '<p class="muted small">Limited merge supports only independently added notes, sessions and journal entries when all existing data and settings are unchanged. Back up BOTH copies first: download the cloud backup here and export the local backup from Backup &amp; restore. If merge is unavailable, you can explicitly replace either copy; replacement deletes its unique changes.</p>' : ''}` : `<p>Sync is not connected. ${syncRemote && syncRemote.snapshot ? 'A cloud copy exists. Download it explicitly to connect.' : 'No cloud copy exists. You can upload this device to start.'}</p><button class="btn primary" id="${syncRemote && syncRemote.snapshot ? 'sync-pull' : 'sync-connect'}">${syncRemote && syncRemote.snapshot ? 'Download cloud copy' : 'Connect and upload this device'}</button>`}
    <section class="card"><h2 data-i18n="extra125">Background reminders</h2><p class="muted small">Optional push reminders require browser permission, a running server with push configured, and synced notification preferences. They use the last cloud snapshot and may be delayed or blocked by Android/browser settings.</p>${syncPushConfig && syncPushConfig.enabled ? '<button class="btn" id="push-enable" data-i18n="extra126">Enable on this device</button> <button class="btn" id="push-disable" data-i18n="extra127">Disable on this device</button>' : '<p>Push is not configured on the server.</p>'}</section>
    <div class="row gap wrap"><button class="btn" id="sync-disconnect" data-i18n="extra128">Disconnect this device</button><button class="btn" id="sync-logout" data-i18n="extra129">Sign out</button></div><p class="muted small">No automatic merging: conflicting changes remain local until you choose what to do. Signing out removes this device’s push subscription but leaves local data on this device.</p></div>`;
}
function renderAiAssistant() {
  return `<div class="page"><h1 data-i18n="extra135">AI study assistant</h1><p class="muted small">Optional online service. Requests and prompts go to your configured server and provider and may incur provider charges. Outputs are AI-generated and can be wrong; questions are practice, not official board questions. Do not send private information.</p>
    ${syncUser && syncUser.aiAvailable ? `<form id="assistant-form" class="card form"><label class="field"><span data-i18n="extra136">Question or topic</span><textarea name="prompt" rows="4" maxlength="4000" required></textarea></label><button class="btn primary" type="submit" data-i18n="extra137">Send to AI</button></form>${aiReply ? `<section class="card"><strong data-i18n="extra138">AI-generated</strong><p>${esc(aiReply).replace(/\n/g,'<br>')}</p></section>` : ''}` : `<p>Sign in and configure the provider on your server to use AI. No API key is entered in the app.</p><button class="btn" data-nav="sync">Account &amp; sync</button>`}
    <p class="muted">${esc(syncMessage)}</p></div>`;
}
function canReplaceLocal() {
  return !(focusState.running || focusState.accumulatedMs > 0 || getState().activeQuiz || getState().activeWritten || getState().activeExam);
}
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id !== 'sync-auth-form' && form.id !== 'assistant-form') return;
  e.preventDefault();
  const button = e.submitter || form.querySelector('[type="submit"]');
  if (form.dataset.busy) return;
  form.dataset.busy = '1'; if (button) button.disabled = true;
  try {
    const fd = new FormData(form);
    if (form.id === 'sync-auth-form') {
      const action = e.submitter?.value === 'register' ? 'register' : 'login';
      const result = await api('api/' + action,'POST',{username:String(fd.get('username') || ''),password:String(fd.get('password') || '')});
      syncUser = result.user; syncMessage = 'Signed in. Choose how to connect this device.';
      const session = await api('api/session'); syncUser.aiAvailable = session.aiAvailable;
      await refreshCloud(); syncPushConfig = await api('api/push/config'); scheduleSync();
    } else {
      syncMessage = ''; const result = await api('api/ai','POST',{prompt:String(fd.get('prompt') || '')}); aiReply = result.answer;
    }
  } catch (error) { syncMessage = error.message; }
  finally { delete form.dataset.busy; if (button) button.disabled = false; syncRefresh(); }
});
document.addEventListener('click', async (e) => {
  const target = e.target.closest('#sync-connect,#sync-pull,#sync-disconnect,#sync-logout,#sync-now,#sync-cloud-backup,#sync-overwrite-cloud,#sync-merge-additions,#push-enable,#push-disable');
  if (!target || !syncUser) return;
  if (syncBusy || syncActionBusy) { toast('A sync request is already running.'); return; }
  syncActionBusy = true; target.disabled = true;
  try {
    if (target.id === 'push-enable') {
      if (!syncPushConfig || !syncPushConfig.enabled || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Push is not supported or configured here.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      if (!await navigator.serviceWorker.getRegistration()) throw new Error('Reload the app online to install its service worker first.');
      const reg = await navigator.serviceWorker.ready;
      const key = syncPushConfig.publicKey.replace(/-/g,'+').replace(/_/g,'/');
      const raw = atob(key + '='.repeat((4 - key.length % 4) % 4));
      const applicationServerKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const subscription = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
      await api('api/push/subscription','POST',subscription.toJSON());
      syncMessage = 'Push enabled on this device. Enable reminders in Settings and sync your preferences.';
    } else if (target.id === 'push-disable') {
      if (!('serviceWorker' in navigator)) throw new Error('Push is not supported here.');
      if (!await navigator.serviceWorker.getRegistration()) throw new Error('No app service worker is registered on this device.');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await api('api/push/subscription','DELETE',{endpoint:sub.endpoint}); await sub.unsubscribe(); }
      syncMessage = 'Push disabled on this device.';
    } else if (target.id === 'sync-logout') {
      // A shared device should not receive this account's push after sign-out.
      if ('serviceWorker' in navigator && await navigator.serviceWorker.getRegistration()) {
        const reg = await navigator.serviceWorker.ready;
        const sub = reg.pushManager && await reg.pushManager.getSubscription();
        if (sub) { await api('api/push/subscription','DELETE',{endpoint:sub.endpoint}); await sub.unsubscribe(); }
      }
      await api('api/logout','POST',{}); syncUser = null; syncRemote = null; syncMessage = 'Signed out. Local data remains on this device.'; }
    else if (target.id === 'sync-disconnect') {
      if (!confirm('Disconnect sync on this device? Pending local changes will no longer be uploaded. Local data and cloud data remain.')) return;
      syncMeta = null; syncBlocked = false; writeSyncMeta(); try { localStorage.removeItem(SYNC_BASE_KEY); } catch {} syncMessage = 'Device disconnected.';
    } else if (target.id === 'sync-now') { await flushSync(); return; }
    else if (target.id === 'sync-connect') {
      if (syncMeta && syncMeta.enabled && syncMeta.userId !== syncUser.id) throw new Error('Disconnect the previous account first.');
      await refreshCloud(); if (syncRemote.snapshot || syncRemote.revision !== 0) throw new Error('Cloud data exists. Download it or keep your local backup; no data was overwritten.');
      if (!confirm('Upload this device data to this account? Timers remain device-local.')) return;
      syncMeta = {userId:syncUser.id,enabled:true,revision:0,dirty:true,change:1,conflict:false};
      if (!writeSyncMeta()) return; await flushSync(); return;
    } else if (target.id === 'sync-cloud-backup') {
      if (!syncMeta || !syncMeta.enabled || syncMeta.userId !== syncUser.id) throw new Error('Connect the correct account first.');
      await refreshCloud();
      if (!syncRemote.snapshot) throw new Error('No cloud copy exists.');
      download('hsc27-cloud-backup-' + todayKey() + '.json', JSON.stringify(syncRemote.snapshot,null,2), 'application/json');
      syncMessage = 'Cloud backup download started. Check your downloads and store it privately; it is not encrypted.';
    } else if (target.id === 'sync-overwrite-cloud') {
      if (syncBlocked || storageBlocked || !syncMeta || !syncMeta.enabled || !syncMeta.conflict || syncMeta.userId !== syncUser.id) throw new Error('The linked account must have an active conflict and working storage.');
      const meta = syncMeta, userId = syncUser.id;
      await refreshCloud();
      if (syncMeta !== meta || !syncUser || syncUser.id !== userId || !meta.conflict) throw new Error('Sync state changed; review it again.');
      if (!syncRemote.snapshot) throw new Error('No cloud copy exists.');
      const revision = syncRemote.revision;
      if (!confirm('Replace ALL cloud data with this device? Cloud-only changes will be lost. First download a cloud backup and export a local backup.')) return;
      const change = meta.change, snapshot = cloudSnapshot();
      try {
        const result = await api('api/state','PUT',{baseRevision:revision,snapshot});
        if (syncMeta !== meta || !syncUser || syncUser.id !== userId) return;
        meta.revision = result.revision; meta.conflict = false; meta.dirty = meta.change !== change;
        syncRemote = {revision:result.revision,snapshot:true};
        if (!writeSyncMeta()) return;
        await saveSyncBase(snapshot,userId,result.revision);
        syncMessage = meta.dirty ? 'Cloud replaced; newer local changes are queued.' : 'Cloud replaced with this device.';
        if (meta.dirty) scheduleSync();
      } catch (error) {
        if (error.status === 409) { syncMessage = 'Cloud changed again; neither copy was replaced. Download a fresh backup and retry.'; return; }
        throw error;
      }
    } else if (target.id === 'sync-merge-additions') {
      if (syncBlocked || storageBlocked || !syncMeta || !syncMeta.enabled || !syncMeta.conflict || syncMeta.userId !== syncUser.id) throw new Error('The linked account must have an active conflict and working storage.');
      if (!canReplaceLocal()) throw new Error('Stop timers and finish active tests before merging.');
      const meta = syncMeta, userId = syncUser.id, before = localStorage.getItem(STORAGE_KEY), local = cloudSnapshot();
      let base; try { base = JSON.parse(localStorage.getItem(SYNC_BASE_KEY) || 'null'); } catch { base = null; }
      await refreshCloud();
      if (!syncRemote.snapshot) throw new Error('No cloud copy exists.');
      const remote = syncRemote, plan = await mergeIndependentAdditions(base,local,remote.snapshot,userId,meta.revision);
      const unchanged = () => syncMeta === meta && syncUser && syncUser.id === userId && meta.conflict && canReplaceLocal() && localStorage.getItem(STORAGE_KEY) === before && canonicalSyncValue(cloudSnapshot()) === canonicalSyncValue(local);
      if (!unchanged()) throw new Error('Local data or account changed during merge. Back up and retry.');
      if (!confirm(`Merge ${plan.additions.local} local and ${plan.additions.cloud} cloud independent addition(s)? Back up both copies first. The merged copy will be uploaded.`)) return;
      if (!unchanged()) throw new Error('Local data or account changed during confirmation. Back up and retry.');
      syncSuppress = true;
      try { importJSON(JSON.stringify(plan.snapshot)); resetTimer(false); focusState.subjectId = null; focusState.chapterId = null; restoreFocusTimer(); } finally { syncSuppress = false; }
      meta.revision = remote.revision; meta.dirty = true; meta.conflict = true; meta.change = (meta.change || 0) + 1;
      if (!writeSyncMeta()) return;
      await saveSyncBase(remote.snapshot,userId,remote.revision);
      // Authentication or the device link can change while hashes are being computed.
      if (syncMeta !== meta || !syncUser || syncUser.id !== userId || meta.revision !== remote.revision || !meta.conflict) return;
      meta.conflict = false;
      if (!writeSyncMeta()) return;
      syncMessage = 'Independent additions merged locally; upload is queued.';
      scheduleSync();
    } else if (target.id === 'sync-pull') {
      if (syncMeta && syncMeta.enabled && syncMeta.userId !== syncUser.id) throw new Error('Disconnect the previous account first.');
      if (!canReplaceLocal()) throw new Error('Stop the focus and exam timers and finish active tests before replacing local data.');
      // Detect local edits while the network request is in flight, including writes from another tab.
      const before = localStorage.getItem(STORAGE_KEY), localBefore = JSON.stringify(cloudSnapshot());
      await refreshCloud(); if (!syncRemote.snapshot) throw new Error('No cloud copy exists.');
      if (!canReplaceLocal() || localStorage.getItem(STORAGE_KEY) !== before || JSON.stringify(cloudSnapshot()) !== localBefore) throw new Error('Local data changed during download. Back up and retry.');
      if (!confirm('Replace ALL local study data with the cloud copy? Export a local backup first. This discards unsynced local changes.')) return;
      if (!canReplaceLocal() || localStorage.getItem(STORAGE_KEY) !== before || JSON.stringify(cloudSnapshot()) !== localBefore) throw new Error('Local data changed during confirmation. Back up and retry.');
      syncSuppress = true;
      try { importJSON(JSON.stringify(syncRemote.snapshot)); resetTimer(false); focusState.subjectId = null; focusState.chapterId = null; restoreFocusTimer(); } finally { syncSuppress = false; }
      syncMeta = {userId:syncUser.id,enabled:true,revision:syncRemote.revision,dirty:false,change:0,conflict:false};
      if (!writeSyncMeta()) return;
      await saveSyncBase(syncRemote.snapshot,syncUser.id,syncRemote.revision);
      syncMessage = 'Cloud copy downloaded. This device is connected.';
    }
  } catch (error) { syncMessage = error.message; }
  finally { syncActionBusy = false; target.disabled = false; syncRefresh(); }
});
window.addEventListener('online', scheduleSync);
