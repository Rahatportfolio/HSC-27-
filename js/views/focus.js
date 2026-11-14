/* HSC 2027 Smart Study App — views/focus.js
 * Study timer: stopwatch, countdown, Pomodoro, custom sessions.
 * Uses wall-clock timestamps (not interval counting) so it stays accurate
 * when the screen locks or the tab is hidden. Completed sessions are
 * recorded automatically with a duplicate guard.
 */
'use strict';

const focusState = {
  mode: 'pomodoro', // stopwatch | countdown | pomodoro | custom
  subjectId: null,
  chapterId: null,
  running: false,
  startedAt: null,      // wall-clock start of current run segment
  accumulatedMs: 0,     // completed segments
  targetMs: 25 * 60 * 1000,
  breakMs: 5 * 60 * 1000,
  phase: 'focus',       // focus | break
  intervalId: null,
  wakeLock: null,
  runId: null,
};

function renderFocus(prefillChapterId) {
  const st = getState();
  if (prefillChapterId && !focusState.running && !focusState.accumulatedMs && chapterById(prefillChapterId)) {
    const ch = chapterById(prefillChapterId);
    focusState.subjectId = ch.subjectId;
    focusState.chapterId = ch.id;
  }
  const today = todayKey();
  const todayMins = minutesOn(today);
  const weekMins = minutesInWeek(weekStartKey(today));
  const target = st.settings.dailyTargetMinutes || 480;

  const modeBtn = (m, label) => `<button class="tab ${focusState.mode === m ? 'active' : ''}" data-focus-mode="${m}">${label}</button>`;

  return `<div class="page">
    <div class="page-head"><h1>Focus timer</h1></div>
    <p class="muted">Today: ${formatDuration(todayMins)} of ${formatDuration(target)} · This week: ${formatDuration(weekMins)}</p>

    <section class="card focus-card">
      <div class="tabs">${modeBtn('pomodoro', 'Pomodoro')}${modeBtn('stopwatch', 'Stopwatch')}${modeBtn('countdown', 'Countdown')}${modeBtn('custom', 'Custom')}</div>

      <div id="focus-duration-row" class="row gap wrap" ${focusState.mode === 'stopwatch' ? 'hidden' : ''}>
        <label class="field inline"><span>Focus minutes</span>
          <input id="focus-minutes" type="number" min="1" max="600" value="${Math.round(focusState.targetMs / 60000)}"></label>
        <label class="field inline"><span>Break minutes</span>
          <input id="focus-break" type="number" min="1" max="120" value="${Math.round(focusState.breakMs / 60000)}"></label>
      </div>

      <label class="field"><span>Subject</span>
        <select id="focus-subject"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}" ${focusState.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Chapter</span>
        <select id="focus-chapter"><option value="">—</option></select></label>

      <div class="timer-display" id="timer-display" aria-live="polite">${formatClock(focusState.targetMs / 1000)}</div>
      <p class="muted center" id="timer-phase">${focusState.phase === 'break' ? 'Break phase' : 'Focus phase'}</p>

      <div class="row gap center-row">
        <button class="btn primary lg" id="timer-toggle">${focusState.running ? 'Pause' : 'Start'}</button>
        <button class="btn lg" id="timer-stop">Stop &amp; save</button>
        <button class="btn ghost lg" id="timer-reset">Reset</button>
      </div>
      <p class="muted small center">Timer state is saved on this device and recovered when you reopen the app. Browsers may suspend or terminate execution; alerts cannot be guaranteed while closed.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Manual session</h2></div>
      <p class="muted small">Forgot to run the timer? Record a session manually.</p>
      <form id="manual-session-form" class="form">
        <label class="field"><span>Minutes studied</span><input name="minutes" type="number" min="1" max="1440" value="30" required></label>
        <label class="field"><span>Subject</span><select name="subjectId"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Note (optional)</span><input name="note" placeholder="What did you cover?"></label>
        <button class="btn primary" type="submit">Save session</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><h2>Recent sessions</h2></div>
      ${st.sessions.length ? `<ul class="plain-list">${st.sessions.slice().sort((a, b) => (b.endedAt || '').localeCompare(a.endedAt || '')).slice(0, 10).map((s) => `
        <li>${esc(formatDate(s.date))} ${esc(formatTime(s.endedAt))} — ${esc(subjectName(s.subjectId))}${s.chapterId ? ' · ' + esc(chapterLabel(s.chapterId)) : ''} · <strong>${formatDuration(s.durationMinutes)}</strong> <span class="muted small">(${esc(s.mode)})</span>
        <button class="btn small ghost" data-session-delete="${esc(s.id)}">Delete</button></li>`).join('')}</ul>`
      : `<p class="muted">No sessions recorded yet.</p>`}
    </section>
  </div>`;
}

// Save only serializable timer data, together with study records in the same store.
function persistFocusTimer() {
  const keys = ['mode', 'subjectId', 'chapterId', 'running', 'startedAt', 'accumulatedMs', 'targetMs', 'breakMs', 'phase', 'runId'];
  const snapshot = {};
  keys.forEach((key) => { snapshot[key] = focusState[key]; });
  getState().activeFocus = snapshot;
  save();
}
function restoreFocusTimer() {
  const snapshot = getState().activeFocus;
  if (!snapshot || !['stopwatch', 'countdown', 'pomodoro', 'custom'].includes(snapshot.mode) || !['focus', 'break'].includes(snapshot.phase) || !Number.isFinite(snapshot.accumulatedMs) || !Number.isFinite(snapshot.targetMs) || snapshot.targetMs <= 0 || !Number.isFinite(snapshot.breakMs) || snapshot.breakMs <= 0 || (snapshot.running && (!Number.isFinite(snapshot.startedAt) || snapshot.startedAt > Date.now()))) return;
  Object.assign(focusState, snapshot, { intervalId: null, wakeLock: null });
  if (focusState.running) { timerTick(); if (focusState.running) startTimerInterval(); }
}

function focusElapsedMs() {
  let ms = focusState.accumulatedMs;
  if (focusState.running && focusState.startedAt) ms += Date.now() - focusState.startedAt;
  return ms;
}
function focusRemainingMs() {
  if (focusState.mode === 'stopwatch') return null;
  const target = focusState.phase === 'break' ? focusState.breakMs : focusState.targetMs;
  return Math.max(0, target - focusElapsedMs());
}
function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  if (!el) return;
  if (focusState.mode === 'stopwatch') el.textContent = formatClock(focusElapsedMs() / 1000);
  else el.textContent = formatClock(focusRemainingMs() / 1000);
}
function timerTick() {
  updateTimerDisplay();
  if (focusState.running && focusState.mode !== 'stopwatch' && focusRemainingMs() <= 0) {
    finishTimerPhase();
  }
}
function startTimerInterval() {
  stopTimerInterval();
  focusState.intervalId = setInterval(timerTick, 250);
  updateTimerDisplay();
}
function stopTimerInterval() {
  if (focusState.intervalId) { clearInterval(focusState.intervalId); focusState.intervalId = null; }
}
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) focusState.wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* unsupported or denied — timer still works via timestamps */ }
}
function releaseWakeLock() {
  try { if (focusState.wakeLock) focusState.wakeLock.release(); } catch (e) {}
  focusState.wakeLock = null;
}

function toggleTimer() {
  if (focusState.running) {
    focusState.accumulatedMs = focusElapsedMs();
    focusState.running = false;
    focusState.startedAt = null;
    stopTimerInterval();
    releaseWakeLock();
  } else {
    if (!focusState.subjectId) { toast('Choose a subject before starting.'); return; }
    if (focusState.phase === 'focus' && !focusState.runId) focusState.runId = uid('run');
    focusState.running = true;
    focusState.startedAt = Date.now();
    startTimerInterval();
    requestWakeLock();
  }
  persistFocusTimer();
  refreshTimerButtons();
}
function refreshTimerButtons() {
  const btn = document.getElementById('timer-toggle');
  if (btn) btn.textContent = focusState.running ? 'Pause' : 'Start';
  // Keep attribution and durations stable during an active or paused period.
  ['focus-subject', 'focus-chapter', 'focus-minutes', 'focus-break'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.disabled = focusState.running || focusState.accumulatedMs > 0;
  });
  const phase = document.getElementById('timer-phase');
  if (phase) phase.textContent = focusState.phase === 'break' ? 'Break phase' : 'Focus phase';
}

function finishTimerPhase() {
  // Save the focus portion as a session, then switch to break (or finish).
  if (focusState.phase === 'focus') {
    const elapsed = focusElapsedMs();
    const completedAt = Date.now() - Math.max(0, elapsed - focusState.targetMs);
    saveFocusSession(Math.min(elapsed, focusState.targetMs), completedAt);
    focusState.phase = 'break';
    focusState.accumulatedMs = 0;
    focusState.startedAt = focusState.running ? Date.now() : null;
    toast('Focus session saved. Break time — step away from the screen.');
    notify('Focus session complete', 'Your study session was saved. Take a break.');
  } else {
    focusState.phase = 'focus';
    focusState.accumulatedMs = 0;
    focusState.runId = null;
    focusState.running = false;
    focusState.startedAt = null;
    stopTimerInterval();
    releaseWakeLock();
    toast('Break over. Ready for the next session?');
    notify('Break over', 'Time for the next focus session.');
  }
  persistFocusTimer();
  refreshTimerButtons();
  updateTimerDisplay();
}

function saveFocusSession(elapsedMs = focusElapsedMs(), endedAt = Date.now()) {
  const minutes = Math.round(elapsedMs / 60000);
  if (minutes <= 0) return null;
  const ended = new Date(endedAt);
  const started = new Date(ended.getTime() - elapsedMs);
  return recordSession({
    subjectId: focusState.subjectId || null,
    chapterId: focusState.chapterId || null,
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    durationMinutes: minutes,
    mode: focusState.mode,
    source: 'timer',
    runId: focusState.runId,
    date: toDateKey(ended),
  });
}

function stopAndSaveTimer() {
  const wasRunning = focusState.running;
  if (wasRunning) { focusState.accumulatedMs = focusElapsedMs(); focusState.running = false; focusState.startedAt = null; }
  stopTimerInterval();
  releaseWakeLock();
  const elapsed = focusElapsedMs();
  const limited = focusState.mode === 'stopwatch' ? elapsed : Math.min(elapsed, focusState.targetMs);
  const ended = Date.now() - Math.max(0, elapsed - limited);
  const saved = focusState.phase === 'focus' ? saveFocusSession(limited, ended) : null;
  focusState.accumulatedMs = 0;
  focusState.phase = 'focus';
  focusState.runId = null;
  persistFocusTimer();
  refreshTimerButtons();
  updateTimerDisplay();
  if (saved) toast(`Saved ${formatDuration(saved.durationMinutes)} study session.`);
  else toast('Nothing to save — timer was at zero.');
  render();
}

function resetTimer(shouldPersist = true) {
  focusState.running = false;
  focusState.startedAt = null;
  focusState.accumulatedMs = 0;
  focusState.phase = 'focus';
  focusState.runId = null;
  stopTimerInterval();
  releaseWakeLock();
  if (shouldPersist) persistFocusTimer();
  refreshTimerButtons();
  updateTimerDisplay();
}

function syncFocusChapterOptions() {
  const sel = document.getElementById('focus-chapter');
  if (!sel) return;
  const sid = focusState.subjectId;
  const chs = sid ? chaptersOf(sid) : [];
  sel.innerHTML = '<option value="">—</option>' + chs.map((c) => `<option value="${esc(c.id)}" ${focusState.chapterId === c.id ? 'selected' : ''}>${esc(chapterLabel(c.id))}</option>`).join('');
}

function notify(title, body) {
  try {
    if (getState().settings.notifications.enabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch (e) { /* notifications are best-effort */ }
}
