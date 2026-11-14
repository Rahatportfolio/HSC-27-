/* HSC 2027 Smart Study App — views/more.js
 * Weekly review, journal, calendar, global search, settings and backup/restore.
 */
'use strict';

/* ================= WEEKLY REVIEW ================= */
function renderReview() {
  const st = getState();
  const today = todayKey();
  const wStart = weekStartKey(today);
  const weekMins = minutesInWeek(wStart);
  const target = st.settings.dailyTargetMinutes || 480;
  const chaptersDone = st.chapters.filter((c) => c.status === 'completed' && c.updatedAt && toDateKey(new Date(c.updatedAt)) >= wStart);
  const missedTasks = st.tasks.filter((t) => t.date >= wStart && t.date <= today && t.status !== 'done');
  const existing = st.weeklyReviews.find((r) => r.weekStart === wStart);
  const plannedTasks = st.tasks.filter((t) => (t.originalDate || t.date) >= wStart && (t.originalDate || t.date) <= addDays(wStart, 6));
  const plannedMinutes = plannedTasks.filter((t) => t.type !== 'rest').reduce((sum, t) => sum + (t.plannedMinutes || 0), 0);
  const previousMinutes = minutesInWeek(addDays(wStart, -7));
  const recordedPractice = st.practice.filter((p) => p.date >= wStart && p.date <= today);

  const subjectProgress = st.subjects.map((s) => {
    const mins = st.sessions.filter((x) => x.subjectId === s.id && x.date >= wStart && x.date <= today)
      .reduce((a, x) => a + x.durationMinutes, 0);
    return { subject: s, mins };
  }).filter((x) => x.mins > 0).sort((a, b) => b.mins - a.mins);

  return `<div class="page">
    <div class="page-head"><h1>Weekly review</h1></div>
    <p class="muted">Week of ${esc(formatDate(wStart))} · Studied ${formatDuration(weekMins)} of ${formatDuration(target * 7)} target.</p>

    <section class="card">
      <h2>Auto-generated summary (from recorded data only)</h2>
      <ul class="plain-list">
        <li>Chapters completed this week: <strong>${chaptersDone.length}</strong>${chaptersDone.length ? ' — ' + chaptersDone.map((c) => esc(chapterLabel(c.id))).join(', ') : ''}</li>
        <li>Original weekly plan: ${formatDuration(plannedMinutes)} across ${plannedTasks.length} tasks · ${plannedTasks.filter((t) => t.status === 'done').length} currently marked done.</li>
        <li>Actual this week: ${formatDuration(weekMins)} · Previous week: ${formatDuration(previousMinutes)}</li>
        <li>Unfinished tasks: <strong>${missedTasks.length}</strong></li>
        <li>Practice recorded this week: ${recordedPractice.length} sessions.</li>
        <li>Due revisions: <strong>${dueRevisions().length}</strong></li>
        <li>Subject time: ${subjectProgress.length ? subjectProgress.map((x) => `${esc(x.subject.name)} ${formatDuration(x.mins)}`).join(' · ') : 'none recorded'}</li>
      </ul>
      <p class="muted small">Plans reflect current tasks, including their original dates when carried over. Deleted or edited tasks are not historical snapshots. The app never claims progress that was not recorded.</p>
    </section>

    <section class="card">
      <h2>Your answers</h2>
      <form id="review-form" class="form">
        <label class="field"><span>1. Which chapters were completed?</span><textarea name="completed" rows="2">${existing ? esc(existing.answers.completed || '') : ''}</textarea></label>
        <label class="field"><span>2. Progress per subject?</span><textarea name="subjectProgress" rows="2">${existing ? esc(existing.answers.subjectProgress || '') : ''}</textarea></label>
        <label class="field"><span>3. How were CQ / MCQ / written tests?</span><textarea name="tests" rows="2">${existing ? esc(existing.answers.tests || '') : ''}</textarea></label>
        <label class="field"><span>4. Which topics were difficult?</span><textarea name="difficult" rows="2">${existing ? esc(existing.answers.difficult || '') : ''}</textarea></label>
        <label class="field"><span>5. Actual hours studied</span><input name="hours" value="${existing ? esc(existing.answers.hours || '') : minutesToHours(weekMins)}"></label>
        <label class="field"><span>6. Which planned tasks were missed?</span><textarea name="missed" rows="2">${existing ? esc(existing.answers.missed || '') : ''}</textarea></label>
        <label class="field"><span>Goals for the next 7 days</span><textarea name="goals" rows="3">${existing ? esc(existing.answers.goals || '') : ''}</textarea></label>
        <button class="btn primary" type="submit">${existing ? 'Update review' : 'Save review'}</button>
      </form>
    </section>

    <section class="card">
      <h2>Turn goals into tasks</h2>
      <p class="muted small">Save your review first. Put one goal per line; this creates one 30-minute task per goal across the next seven days, without replacing existing tasks. You can reschedule them in Planner.</p>
      ${existing && existing.answers.goals ? `<button class="btn" id="review-create-tasks">Create tasks from saved goals</button>` : '<p class="muted">No saved goals yet.</p>'}
    </section>
    <section class="card">
      <h2>Past reviews</h2>
      ${st.weeklyReviews.length ? `<ul class="plain-list">${st.weeklyReviews.slice().sort((a, b) => b.weekStart.localeCompare(a.weekStart)).map((r) => `
        <li><strong>${esc(formatDate(r.weekStart))}</strong> — goals: ${esc(r.answers.goals || '—')}</li>`).join('')}</ul>`
      : `<p class="muted">No reviews saved yet.</p>`}
    </section>
  </div>`;
}

function saveReviewFromForm(form) {
  const fd = new FormData(form);
  const wStart = weekStartKey(todayKey());
  const st = getState();
  const answers = {};
  ['completed', 'subjectProgress', 'tests', 'difficult', 'hours', 'missed', 'goals'].forEach((k) => {
    answers[k] = sanitizeText(fd.get(k), 5000);
  });
  const existing = st.weeklyReviews.find((r) => r.weekStart === wStart);
  if (existing) { existing.answers = answers; existing.updatedAt = nowISO(); }
  else st.weeklyReviews.push({ id: uid('rev'), weekStart: wStart, answers, createdAt: nowISO(), updatedAt: nowISO() });
  save();
  return true;
}

/* ================= JOURNAL ================= */
function renderJournal() {
  const st = getState();
  const list = st.journal.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="page">
    <div class="page-head"><h1>Study journal</h1>
      <button class="btn small primary" id="add-journal-btn">+ New entry</button></div>
    ${list.length ? `<ul class="card-list">${list.map((j) => `
      <li class="card"><strong>${esc(formatDate(j.date))}</strong>${j.mood ? ` <span class="badge">${esc(j.mood)}</span>` : ''}
        <p>${esc(j.text).replace(/\n/g, '<br>')}</p>
        <button class="btn small danger-ghost" data-journal-delete="${esc(j.id)}">Delete</button></li>`).join('')}</ul>`
    : `<div class="empty"><p>No journal entries yet.</p></div>`}
  </div>`;
}

function journalFormHTML() {
  return `<form id="journal-form" class="form">
    <label class="field"><span>Date</span><input name="date" type="date" value="${todayKey()}"></label>
    <label class="field"><span>Mood</span>
      <select name="mood"><option value="">—</option><option>Great</option><option>Good</option><option>Okay</option><option>Tough</option></select></label>
    <label class="field"><span>Entry *</span><textarea name="text" rows="5" required placeholder="What did you study? What was hard?"></textarea></label>
    <div class="row gap"><button class="btn primary" type="submit">Save entry</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveJournalFromForm(form) {
  const fd = new FormData(form);
  const text = sanitizeText(fd.get('text'), 20000);
  if (!text) { toast('Entry text is required.'); return false; }
  getState().journal.push({
    id: uid('jrnl'),
    date: isValidDateKey(String(fd.get('date'))) ? String(fd.get('date')) : todayKey(),
    mood: String(fd.get('mood') || ''), text, createdAt: nowISO(),
  });
  save();
  return true;
}

/* ================= CALENDAR ================= */
function renderCalendar() {
  const st = getState();
  const today = todayKey();
  const target = st.settings.dailyTargetMinutes || 480;
  // Build a 3-month view: previous, current, next
  const months = [];
  for (let off = -1; off <= 1; off++) {
    const current = parseDateKey(today);
    const base = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + off, 1));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1;
    months.push({ y, m });
  }
  const seen = new Set();
  const monthBlocks = months.filter((x) => { const k = x.y + '-' + x.m; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(({ y, m }) => {
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let cells = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const mins = minutesOn(key);
        const tasks = tasksOn(key).length;
        const exams = st.exams.filter((e) => e.date === key).length;
        cells += `<button class="cal-cell ${key === today ? 'today' : ''} ${mins >= target ? 'hit' : ''}" data-planner-jump="${key}">
          <span>${d}</span><span class="cal-min">${mins ? formatDuration(mins) : ''}</span>
          <span class="cal-tasks">${tasks ? tasks + ' task' + (tasks > 1 ? 's' : '') : ''}${exams ? ' · ' + exams + ' exam' : ''}</span></button>`;
      }
      return `<section class="card"><h2>${esc(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1))))}</h2><div class="cal-grid">${cells}</div></section>`;
    }).join('');

  return `<div class="page">
    <div class="page-head"><h1>Calendar</h1></div>
    <p class="muted small">Green = daily target met. Tap a day to open it in the planner.</p>
    ${monthBlocks}
  </div>`;
}

/* ================= SEARCH ================= */
let searchQuery = '';
function renderSearch() {
  const st = getState();
  const q = searchQuery.trim().toLowerCase();
  const results = [];
  if (q.length >= 2) {
    st.chapters.filter((c) => (c.name + ' ' + subjectName(c.subjectId)).toLowerCase().includes(q))
      .forEach((c) => results.push({ type: 'Chapter', label: chapterLabel(c.id), sub: subjectName(c.subjectId), nav: 'chapter', id: c.id }));
    st.notes.filter((n) => (n.title + ' ' + n.body).toLowerCase().includes(q))
      .forEach((n) => results.push({ type: 'Note', label: n.title, sub: n.category, nav: 'notes', id: n.id }));
    st.formulas.filter((f) => (f.title + ' ' + f.content).toLowerCase().includes(q))
      .forEach((f) => results.push({ type: 'Formula', label: f.title, sub: subjectName(f.subject), nav: 'formulas', id: f.id }));
    st.resources.filter((r) => (r.title + ' ' + r.channel).toLowerCase().includes(q))
      .forEach((r) => results.push({ type: 'Video', label: r.title, sub: r.channel || '', nav: 'library', id: r.id }));
    st.weaknesses.filter((w) => w.topic.toLowerCase().includes(q))
      .forEach((w) => results.push({ type: 'Weakness', label: w.topic, sub: w.status, nav: 'weaknesses', id: w.id }));
    st.journal.filter((j) => j.text.toLowerCase().includes(q))
      .forEach((j) => results.push({ type: 'Journal', label: formatDate(j.date), sub: j.text.slice(0, 60) + '…', nav: 'journal', id: j.id }));
  }
  return `<div class="page">
    <div class="page-head"><h1>Search</h1></div>
    <div class="search-row"><input id="global-search" type="search" placeholder="Search chapters, notes, formulas, videos…" value="${esc(searchQuery)}" aria-label="Global search"></div>
    ${q.length < 2 ? `<p class="muted">Type at least 2 characters to search across subjects, notes, formulas, videos, weaknesses and journal.</p>`
    : results.length ? `<ul class="card-list">${results.map((r) => `
        <li class="card"><span class="badge">${esc(r.type)}</span> <strong>${esc(r.label)}</strong>
          <span class="muted small">${esc(r.sub)}</span>
          <button class="btn small" data-nav="${esc(r.nav)}">Open</button></li>`).join('')}</ul>`
    : `<p class="muted">No results for “${esc(searchQuery)}”.</p>`}
  </div>`;
}

/* ================= SETTINGS ================= */
function renderSettings() {
  const st = getState();
  const s = st.settings;
  const n = s.notifications;
  return `<div class="page">
    <div class="page-head"><h1>Settings</h1></div>

    <section class="card">
      <h2>Study target</h2>
      <form id="settings-form" class="form">
        <label class="field"><span>Your name (optional)</span><input name="studentName" value="${esc(s.studentName || '')}"></label>
        <label class="field"><span>Daily study target (minutes)</span><input name="dailyTargetMinutes" type="number" min="30" max="1440" step="15" value="${s.dailyTargetMinutes}"></label>
        <label class="field"><span>HSC exam date (set it yourself — never guessed)</span><input name="examDate" type="date" value="${esc(s.examDate || '')}"></label>
        <label class="field"><span>Revision intervals (days, comma separated)</span>
          <input name="revisionIntervals" value="${esc((s.revisionIntervals || []).join(', '))}" placeholder="1, 3, 7, 14, 30"></label>
        <label class="field"><span>Theme</span>
          <select name="theme"><option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>System</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label>
        <button class="btn primary" type="submit">Save settings</button>
      </form>
    </section>

    <section class="card">
      <h2>Notifications</h2>
      <p class="muted small">In-app reminders appear while the app is open. Browser permission is used for timer phase alerts only; background push and scheduled notifications are not supported.</p>
      <form id="notif-form" class="form">
        <label class="check"><input type="checkbox" name="enabled" ${n.enabled ? 'checked' : ''}> Enable reminders</label>
        <label class="check"><input type="checkbox" name="sessionReminder" ${n.sessionReminder ? 'checked' : ''}> Study session reminder</label>
        <label class="check"><input type="checkbox" name="revisionReminder" ${n.revisionReminder ? 'checked' : ''}> Revision due reminder</label>
        <label class="check"><input type="checkbox" name="examReminder" ${n.examReminder ? 'checked' : ''}> Upcoming exam reminder</label>
        <label class="check"><input type="checkbox" name="missedTaskReminder" ${n.missedTaskReminder ? 'checked' : ''}> Carried or missed tasks</label>
        <label class="check"><input type="checkbox" name="dailySummary" ${n.dailySummary ? 'checked' : ''}> Daily progress summary</label>
        <label class="check"><input type="checkbox" name="weeklyReview" ${n.weeklyReview ? 'checked' : ''}> Weekly review reminder</label>
        <div class="row gap wrap">
          <button class="btn primary" type="submit">Save preferences</button>
          <button class="btn" type="button" id="enable-browser-notif">Enable browser notifications</button>
        </div>
        <p class="muted small" id="notif-status"></p>
      </form>
    </section>

    <section class="card">
      <h2>Data</h2>
      <div class="row gap wrap">
        <button class="btn" data-nav="backup">Backup &amp; restore</button>
        <button class="btn" id="load-demo-btn">Load demo data</button>
        <button class="btn danger-ghost" id="clear-demo-btn">Remove demo data</button>
        <button class="btn danger-ghost" id="reset-all-btn">Reset everything</button>
      </div>
      <p class="muted small">Demo data is clearly labelled and can be removed. Reset deletes all local data on this device.</p>
    </section>
  </div>`;
}

function saveSettingsFromForm(form) {
  const fd = new FormData(form);
  const st = getState();
  st.settings.studentName = sanitizeText(fd.get('studentName'), 100);
  st.settings.dailyTargetMinutes = clamp(Number(fd.get('dailyTargetMinutes')) || 480, 30, 1440);
  const examDate = String(fd.get('examDate') || '');
  st.settings.examDate = isValidDateKey(examDate) ? examDate : '';
  const intervals = String(fd.get('revisionIntervals') || '')
    .split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x > 0).slice(0, 10);
  if (intervals.length) st.settings.revisionIntervals = intervals;
  st.settings.theme = String(fd.get('theme') || 'auto');
  save();
  applyTheme();
  return true;
}

function saveNotifFromForm(form) {
  const fd = new FormData(form);
  const n = getState().settings.notifications;
  n.enabled = !!fd.get('enabled');
  n.sessionReminder = !!fd.get('sessionReminder');
  n.revisionReminder = !!fd.get('revisionReminder');
  n.examReminder = !!fd.get('examReminder');
  n.weeklyReview = !!fd.get('weeklyReview');
  n.missedTaskReminder = !!fd.get('missedTaskReminder');
  n.dailySummary = !!fd.get('dailySummary');
  save();
  return true;
}

/* ================= BACKUP ================= */
function renderBackup() {
  const st = getState();
  return `<div class="page">
    <div class="page-head"><h1>Backup &amp; restore</h1></div>
    <section class="card">
      <h2>Full backup (JSON)</h2>
      <p class="muted small">Contains your local study data. Keep it private. Restoring replaces the current data on this device.</p>
      <div class="row gap wrap">
        <button class="btn primary" id="export-json-btn">Download backup</button>
        <label class="btn" for="import-json-file">Restore from backup</label>
        <input type="file" id="import-json-file" accept=".json,application/json" hidden>
      </div>
    </section>
    <section class="card">
      <h2>CSV exports</h2>
      <div class="row gap wrap">
        <button class="btn small" data-export-csv="sessions">Sessions</button>
        <button class="btn small" data-export-csv="chapters">Chapters</button>
        <button class="btn small" data-export-csv="practice">Practice</button>
        <button class="btn small" data-export-csv="examResults">Exam results</button>
      </div>
    </section>
    <section class="card">
      <h2>Notes export</h2>
      <button class="btn small" id="export-notes-btn">Download notes (JSON)</button>
      <p class="muted small">${st.notes.length} notes · ${st.formulas.length} formulas · ${st.resources.length} videos</p>
    </section>
  </div>`;
}
