/* HSC 2027 Smart Study App — app.js
 * Router, bottom navigation, modal system, toasts, global event handling,
 * theme, online/offline status, and in-app reminders.
 */
'use strict';

let currentRoute = { name: 'dashboard', param: null };
let modalState = null; // { title, html, onSubmit }

const ROUTES = {
  dashboard: () => renderDashboard(),
  subjects: () => renderSubjects(),
  subject: (id) => renderSubjectDetail(id),
  chapter: (id) => renderChapterDetail(id),
  planner: () => renderPlanner(),
  focus: (chapterId) => renderFocus(chapterId || undefined),
  progress: () => renderProgress(),
  notes: (chapterId) => renderNotes(chapterId || undefined),
  formulas: (chapterId) => renderFormulas(chapterId || undefined),
  library: (chapterId) => renderLibrary(chapterId || undefined),
  practice: (chapterId) => renderPractice(chapterId || undefined),
  exams: () => renderExams(),
  quiz: () => renderBankQuiz(),
  written: () => renderWrittenTest(),
  'written-review': (id) => { const r = getState().examResults.find(item => item.id === id && Array.isArray(item.writtenReview)); return r ? writtenReviewHTML(r) : '<div class="page"><p>Result not found.</p><button class="btn" data-nav="exams">Exams</button></div>'; },
  'quiz-review': (id) => { const r = getState().examResults.find((item) => item.id === id && Array.isArray(item.quizReview)); return r ? quizReviewHTML(r) : '<div class="page"><p>Result not found.</p><button class="btn" data-nav="exams">Exams</button></div>'; },
  revisions: () => renderRevisions(),
  weaknesses: (chapterId) => renderWeaknesses(chapterId || undefined),
  review: () => renderReview(),
  journal: () => renderJournal(),
  calendar: () => renderCalendar(),
  search: () => renderSearch(),
  settings: () => renderSettings(),
  backup: () => renderBackup(),
  sync: () => renderSync(),
  ai: () => renderAiAssistant(),
};

function navigate(name, param) {
  if (modalState) closeModal();
  currentRoute = { name, param: param || null };
  render();
  window.scrollTo(0, 0);
}

function render() {
  const view = document.getElementById('view');
  const fn = ROUTES[currentRoute.name] || ROUTES.dashboard;
  view.innerHTML = fn(currentRoute.param);
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const active = b.dataset.nav === currentRoute.name ||
      (currentRoute.name === 'subject' && b.dataset.nav === 'subjects') ||
      (currentRoute.name === 'chapter' && b.dataset.nav === 'subjects');
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  afterRender();
}

function afterRender() {
  // Focus view: sync chapter dropdown
  if (currentRoute.name === 'focus') { syncFocusChapterOptions(); updateTimerDisplay(); refreshTimerButtons(); }
  updateExamTimerDisplay();
  // Task form chapter dropdown depends on subject selection
  const taskSubject = document.querySelector('#task-form select[name="subjectId"]');
  if (taskSubject) {
    const fillChapters = () => {
      const sel = document.querySelector('#task-form select[name="chapterId"]');
      const chs = taskSubject.value ? chaptersOf(taskSubject.value) : [];
      sel.innerHTML = '<option value="">—</option>' + chs.map((c) => `<option value="${esc(c.id)}">${esc(chapterLabel(c.id))}</option>`).join('');
    };
    taskSubject.addEventListener('change', fillChapters);
    fillChapters();
  }
  // Chapter detail: live % label
  const pctInput = document.getElementById('ch-pct');
  if (pctInput) pctInput.addEventListener('input', () => {
    document.getElementById('ch-pct-label').textContent = pctInput.value + '%';
  });
  // Search inputs: live filtering
  const bindSearch = (id, setter) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { setter(el.value); render(); const again = document.getElementById(id); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } });
  };
  bindSearch('notes-search', (v) => { notesFilter.q = v; });
  bindSearch('formula-search', (v) => { formulaFilter.q = v; });
  bindSearch('library-search', (v) => { libraryFilter.q = v; });
  bindSearch('global-search', (v) => { searchQuery = v; });
  updateOnlineStatus();
  applyLanguage();
  checkReminders();
}

/* ---------- Modal ---------- */
function openModal(title, html, onSubmit) {
  const returnFocus = modalState ? modalState.returnFocus : document.activeElement;
  modalState = { title, html, onSubmit, returnFocus };
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  overlay.hidden = false;
  document.body.classList.add('modal-open');
  const taskSubject = overlay.querySelector('#task-form select[name="subjectId"]');
  if (taskSubject) {
    const fill = (selected = '') => {
      const sel = overlay.querySelector('#task-form select[name="chapterId"]');
      sel.innerHTML = '<option value="">—</option>' + chaptersOf(taskSubject.value).map((c) => `<option value="${esc(c.id)}">${esc(chapterLabel(c.id))}</option>`).join('');
      sel.value = selected || '';
    };
    fill(overlay.querySelector('#task-form').dataset.chapter);
    taskSubject.addEventListener('change', () => fill());
  }
  const chapter = chapterById(currentRoute.param);
  if (chapter && ['notes', 'formulas', 'library', 'weaknesses'].includes(currentRoute.name)) {
    const chSelect = overlay.querySelector('[name="chapterId"]');
    const subjectSelect = overlay.querySelector('[name="subjectId"], [name="subject"]');
    if (chSelect && !chSelect.value) chSelect.value = chapter.id;
    if (subjectSelect && !subjectSelect.value) subjectSelect.value = chapter.subjectId;
  }
  applyLanguage(overlay);
  const first = overlay.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])');
  (first || overlay.querySelector('#modal-body button:not([disabled]), #modal-body a[href]') || overlay.querySelector('[data-close-modal]')).focus();
}
function closeModal() {
  const returnFocus = modalState && modalState.returnFocus;
  document.getElementById('modal-overlay').hidden = true;
  document.body.classList.remove('modal-open');
  modalState = null;
  if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
}

/* ---------- Toast ---------- */
function toast(message) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('show'); }, 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

/* ---------- Theme ---------- */
function applyTheme() {
  const theme = getState().settings.theme || 'auto';
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* ---------- Online / offline ---------- */
function updateOnlineStatus() {
  const el = document.getElementById('online-status');
  if (!el) return;
  if (isOfflineAndroid()) {
    el.textContent = '● Local-only app'; el.classList.add('offline'); return;
  }
  const online = navigator.onLine;
  el.textContent = online ? '● Online' : '● Offline — data is saved on this device';
  el.classList.toggle('offline', !online);
}

/* ---------- In-app reminders (shown when app is open) ---------- */
function checkReminders() {
  const st = getState();
  const n = st.settings.notifications;
  const bar = document.getElementById('reminder-bar');
  if (bar) bar.hidden = true;
  if (!n.enabled) return;
  const today = todayKey();
  const items = [];
  if (n.revisionReminder) {
    const due = dueRevisions().length;
    if (due) items.push(`${due} revision(s) due.`);
  }
  if (n.examReminder && st.settings.examDate && isValidDateKey(st.settings.examDate)) {
    const d = daysBetween(today, st.settings.examDate);
    if (d >= 0 && d <= 30) items.push(`HSC exam in ${d} day(s).`);
  }
  if (n.examReminder) {
    const upcoming = st.exams.filter((exam) => isValidDateKey(exam.date) && daysBetween(today, exam.date) >= 0 && daysBetween(today, exam.date) <= 7);
    if (upcoming.length) items.push(`${upcoming.length} scheduled test(s) within 7 days.`);
  }
  if (n.missedTaskReminder) {
    const carried = st.tasks.filter((t) => t.status !== 'done' && (t.status === 'carried' || t.date < today)).length;
    if (carried) items.push(`${carried} missed or carried task(s).`);
  }
  if (n.dailySummary) items.push(`Today: ${formatDuration(minutesOn(today))} studied.`);
  if (n.sessionReminder) {
    const actual = minutesOn(today);
    const target = st.settings.dailyTargetMinutes || 480;
    if (actual < target) items.push(`${formatDuration(target - actual)} of today's target remaining.`);
  }
  if (n.weeklyReview) {
    const wStart = weekStartKey(today);
    if (!st.weeklyReviews.some((r) => r.weekStart === wStart)) items.push('Weekly review not done yet.');
  }
  if (items.length) {
    const el = document.getElementById('reminder-bar');
    if (el) {
      el.hidden = false;
      el.innerHTML = '<strong>Reminders:</strong> ' + esc(items.join(' '));
    }
  }
}

function updateExamTimerDisplay() {
  const el = document.getElementById('exam-timer-display');
  const active = getState().activeExam;
  if (!el || !active) return;
  const remaining = Math.max(0, active.endsAt - Date.now());
  el.textContent = remaining ? formatClock(Math.ceil(remaining / 1000)) + ' remaining' : 'Time is up';
}

function shiftPlannerMonth(key, delta) {
  const date = parseDateKey(key);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1)).toISOString().slice(0, 10);
}

// Learning actions replace collections transactionally; failed saves leave the view/data unchanged.
function removeLearningRecord(key, id, prompt) {
  if (!confirm(prompt)) return false;
  const st = getState();
  return replaceLearningCollection(key, st[key].filter(item => item.id !== id));
}
function updateLearningRecord(key, id, patch) {
  const st = getState(), item = st[key].find(x => x.id === id);
  if (!item) return false;
  return replaceLearningCollection(key, st[key].map(x => x.id === id ? {...x, ...patch(item)} : x));
}

/* Open external links in the device browser, never inside the privileged app WebView. */
document.addEventListener('click', (e) => {
  if (!isOfflineAndroid()) return;
  const link = e.target.closest('a[href]');
  if (!link) return;
  const url = sanitizeUrl(link.href);
  if (url) { e.preventDefault(); HSCAndroid.openExternal(url); }
}, true);

/* ---------- Global click delegation ---------- */
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    if (nav.dataset.searchResult) {
      if (nav.dataset.nav === 'notes') { notesFilter.q = searchQuery; notesFilter.category = ''; notesFilter.bookmarkedOnly = false; }
      if (nav.dataset.nav === 'formulas') { formulaFilter.q = searchQuery; formulaFilter.subject = ''; }
      if (nav.dataset.nav === 'library') { libraryFilter.q = searchQuery; libraryFilter.subject = ''; libraryFilter.bookmarkedOnly = false; libraryFilter.unwatchedOnly = false; }
    }
    const chapter = nav.dataset.chapter || nav.dataset.id;
    navigate(nav.dataset.nav, chapter || nav.dataset.id || null);
    return;
  }
  const close = e.target.closest('[data-close-modal]');
  if (close) { closeModal(); return; }

  const st = getState();

  // Planner mode / navigation
  if (e.target.closest('#add-suggested-plan')) { if (addSuggestedPlan()) render(); return; }
  const pm = e.target.closest('[data-planner-mode]');
  if (pm) { plannerMode = pm.dataset.plannerMode; render(); return; }
  if (e.target.closest('#planner-today')) { plannerCursor = todayKey(); render(); return; }
  if (e.target.closest('#planner-prev')) {
    plannerCursor = plannerMode === 'day' ? addDays(plannerCursor, -1)
      : plannerMode === 'week' ? addDays(plannerCursor, -7) : shiftPlannerMonth(plannerCursor, -1);
    render(); return;
  }
  if (e.target.closest('#planner-next')) {
    plannerCursor = plannerMode === 'day' ? addDays(plannerCursor, 1)
      : plannerMode === 'week' ? addDays(plannerCursor, 7) : shiftPlannerMonth(plannerCursor, 1);
    render(); return;
  }
  const jump = e.target.closest('[data-planner-jump]');
  if (jump) { plannerCursor = jump.dataset.plannerJump; plannerMode = 'day'; navigate('planner'); return; }

  if (e.target.closest('#start-challenge')) {
    openModal('Start a study challenge', `<form id="challenge-form" class="form"><label class="field"><span>Days (1–90)</span><input name="days" type="number" min="1" max="90" value="7" required></label><label class="field"><span>Daily study minutes (1–1440)</span><input name="minutes" type="number" min="1" max="1440" value="${esc(st.settings.dailyTargetMinutes)}" required></label><button class="btn primary" type="submit">Start today</button></form>`, (form) => {
      const fd = new FormData(form), days = Number(fd.get('days')), minutes = Number(fd.get('minutes'));
      if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { toast('Enter a valid duration and target.'); return false; }
      const previous = st.challenge;
      st.challenge = { startDate: todayKey(), days, targetMinutes: minutes };
      if (!save()) { st.challenge = previous; return false; }
      return true;
    });
    return;
  }
  if (e.target.closest('#end-challenge')) {
    if (confirm('Remove this challenge? Study sessions will be kept.')) {
      const previous = st.challenge; st.challenge = null;
      if (!save()) { st.challenge = previous; return; }
      render();
    }
    return;
  }

  // Tasks
  const taskEdit = e.target.closest('[data-task-edit]');
  if (taskEdit) {
    const task = st.tasks.find(t => t.id === taskEdit.dataset.taskEdit);
    if (task) openModal('Edit task', taskFormHTML(task.date, task), form => saveTaskFromForm(form, task.id));
    return;
  }
  const reschedule = e.target.closest('[data-task-reschedule]');
  if (reschedule) {
    const task = st.tasks.find((t) => t.id === reschedule.dataset.taskReschedule);
    if (!task) return;
    openModal('Reschedule task', `<form id="reschedule-form" class="form"><p>${esc(task.title)}</p><label class="field"><span>New date</span><input type="date" name="date" value="${esc(task.date)}" required></label><button class="btn primary" type="submit">Reschedule</button></form>`, (form) => {
      const date = String(new FormData(form).get('date') || '');
      if (!isValidDateKey(date)) { toast('Choose a valid date.'); return false; }
      const previous = {...task};
      if (!task.originalDate) task.originalDate = task.date;
      task.date = date; task.status = 'pending';
      if (!save()) { Object.keys(task).forEach(key => delete task[key]); Object.assign(task, previous); return false; }
      return true;
    });
    return;
  }
  const taskDel = e.target.closest('[data-task-delete]');
  if (taskDel) {
    if (!confirm('Delete this task?')) return;
    const previous = st.tasks; st.tasks = st.tasks.filter((t) => t.id !== taskDel.dataset.taskDelete);
    if (!save()) { st.tasks = previous; return; }
    toast('Task deleted.'); render(); return;
  }

  // Focus mode
  const fm = e.target.closest('[data-focus-mode]');
  if (fm) {
    if (focusElapsedMs() > 0 && !confirm('Discard the current timer period?')) return;
    focusState.mode = fm.dataset.focusMode;
    resetTimer();
    render();
    return;
  }
  if (e.target.closest('#timer-toggle')) { toggleTimer(); return; }
  if (e.target.closest('#timer-stop')) { stopAndSaveTimer(); return; }
  if (e.target.closest('#timer-reset')) { if (focusElapsedMs() > 0 && !confirm('Discard the current timer period?')) return; resetTimer(); toast('Timer reset.'); return; }

  // Sessions
  const sesDel = e.target.closest('[data-session-delete]');
  if (sesDel) {
    if (!confirm('Delete this study session?')) return;
    const previous = st.sessions; st.sessions = st.sessions.filter((s) => s.id !== sesDel.dataset.sessionDelete);
    if (!save()) { st.sessions = previous; return; }
    toast('Session deleted.'); render(); return;
  }

  // Chapters
  const move = e.target.closest('[data-move-chapter]');
  if (move) {
    const ch = chapterById(move.dataset.moveChapter);
    if (ch) {
      const list = chaptersOf(ch.subjectId);
      const i = list.findIndex((c) => c.id === ch.id);
      const j = i + Number(move.dataset.dir);
      if (j >= 0 && j < list.length) {
        const oldOrders = list.map(c => c.order);
        [list[i], list[j]] = [list[j], list[i]];
        list.forEach((c, index) => { c.order = index; });
        if (!save()) { [list[i], list[j]] = [list[j], list[i]]; list.forEach((c, index) => { c.order = oldOrders[index]; }); }
        render();
      }
    }
    return;
  }
  if (e.target.closest('#add-chapter-btn') || e.target.closest('#add-chapter-btn-2')) {
    const sid = currentRoute.param;
    openModal('Add chapter', chapterFormHTML(null, sid), (form) => saveChapterFromForm(form, null));
    return;
  }
  if (e.target.closest('#ch-edit')) {
    openModal('Edit chapter', chapterFormHTML(chapterById(currentRoute.param), null), (form) => saveChapterFromForm(form, currentRoute.param));
    return;
  }
  if (e.target.closest('#ch-delete')) {
    if (focusState.chapterId === currentRoute.param && (focusState.running || focusState.accumulatedMs > 0)) { toast('Stop the active focus timer before deleting this chapter.'); return; }
    if (confirm('Delete this chapter? Its linked tasks, revisions, practice, notes, formulas, videos and weaknesses will also be deleted. Sessions, exams and questions will be kept without a chapter link. Export a backup first.')) {
      const id = currentRoute.param;
      const previous = Object.fromEntries(['chapters','sessions','exams','questionBank','tasks','revisions','practice','notes','formulas','resources','weaknesses'].map(key => [key, st[key]]));
      const previousFocus = st.activeFocus, previousFocusChapter = focusState.chapterId;
      st.chapters = st.chapters.filter((c) => c.id !== id);
      for (const key of ['sessions','exams','questionBank']) st[key] = st[key].map(item => item.chapterId === id ? {...item, chapterId:null} : item);
      for (const key of ['tasks','revisions','practice','notes','formulas','resources','weaknesses']) st[key] = st[key].filter(item => item.chapterId !== id);
      if (focusState.chapterId === id) {
        focusState.chapterId = null;
        if (st.activeFocus) st.activeFocus = {...st.activeFocus, chapterId:null};
      }
      if (!save()) { Object.assign(st, previous); st.activeFocus = previousFocus; focusState.chapterId = previousFocusChapter; return; }
      toast('Chapter deleted.'); navigate('subjects');
    }
    return;
  }
  if (e.target.closest('#ch-save') || e.target.closest('#ch-complete')) {
    const ch = chapterById(currentRoute.param);
    if (ch) {
      const previous = {...ch}, previousRevisions = st.revisions.slice();
      if (e.target.closest('#ch-complete')) {
        ch.status = 'completed'; ch.completionPct = 100;
      } else {
        ch.status = document.getElementById('ch-status').value;
        ch.completionPct = Number(document.getElementById('ch-pct').value) || 0;
        if (ch.status === 'completed') ch.completionPct = 100;
        ch.cqStatus = document.getElementById('ch-cq').value;
        ch.mcqStatus = document.getElementById('ch-mcq').value;
        ch.writtenStatus = document.getElementById('ch-written').value;
        ch.revisionStatus = document.getElementById('ch-revision').value;
        ch.notes = sanitizeText(document.getElementById('ch-notes').value, 20000);
      }
      ch.updatedAt = nowISO();
      if (ch.status === 'completed') scheduleRevisions(ch, false);
      if (!save()) { Object.assign(ch, previous); st.revisions = previousRevisions; return; }
      toast(ch.status === 'completed' ? 'Chapter completed — revisions scheduled.' : 'Progress saved.');
      render();
    }
    return;
  }

  // Subjects
  if (e.target.closest('#add-subject-btn')) {
    openModal('Add custom subject', `<form id="subject-form" class="form">
      <label class="field"><span>Subject name *</span><input name="name" required></label>
      <label class="field"><span>Group</span><select name="group"><option value="science">Science</option><option value="other">Other</option></select></label>
      <div class="row gap"><button class="btn primary" type="submit">Add subject</button>
      <button class="btn ghost" type="button" data-close-modal data-i18n="extra24">Cancel</button></div></form>`,
      (form) => {
        const fd = new FormData(form);
        const name = sanitizeText(fd.get('name'), 200);
        if (!name) { toast('Subject name is required.'); return false; }
        if (st.subjects.some(s => s.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { toast('A subject with that name already exists.'); return false; }
        const group = fd.get('group') === 'science' ? 'science' : 'other';
        st.subjects.push({ id: uid('sub'), name, group, color: SUBJECT_COLORS[st.subjects.length % SUBJECT_COLORS.length], createdAt: nowISO() });
        if (!save()) { st.subjects.pop(); return false; } return true;
      });
    return;
  }
  if (e.target.closest('#edit-subject-btn')) {
    const s = subjectById(currentRoute.param);
    openModal('Rename subject', `<form id="subject-form" class="form">
      <label class="field"><span>Subject name</span><input name="name" required value="${esc(s.name)}"></label>
      <div class="row gap"><button class="btn primary" type="submit">Save</button>
      <button class="btn ghost" type="button" data-close-modal data-i18n="extra24">Cancel</button></div></form>`,
      (form) => {
        const name = sanitizeText(new FormData(form).get('name'), 200);
        if (!name) { toast('Subject name is required.'); return false; }
        if (st.subjects.some(other => other.id !== s.id && other.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { toast('A subject with that name already exists.'); return false; }
        const oldName = s.name; s.name = name;
        if (!save()) { s.name = oldName; return false; } return true;
      });
    return;
  }
  if (e.target.closest('#delete-subject-btn')) {
    const id = currentRoute.param;
    if (focusState.subjectId === id && (focusState.running || focusState.accumulatedMs > 0)) { toast('Stop the active focus timer before deleting this subject.'); return; }
    if (['chapters', 'tasks', 'sessions', 'revisions', 'practice', 'exams', 'notes', 'formulas', 'resources', 'weaknesses', 'questionBank'].some((key) => st[key].some((item) => item.subjectId === id || (key === 'formulas' && item.subject === id)))) { toast('Remove or reassign linked records before deleting this subject.'); return; }
    if (confirm('Delete this subject?')) {
      const previous = st.subjects, previousFocus = st.activeFocus, previousFocusSubject = focusState.subjectId;
      st.subjects = st.subjects.filter((s) => s.id !== id);
      if (focusState.subjectId === id) {
        focusState.subjectId = null;
        if (st.activeFocus) st.activeFocus = {...st.activeFocus, subjectId:null};
      }
      if (!save()) { st.subjects = previous; st.activeFocus = previousFocus; focusState.subjectId = previousFocusSubject; return; }
      toast('Subject deleted.'); navigate('subjects');
    }
    return;
  }
  if (e.target.closest('#download-chapter-template')) {
    download('chapters-template.csv', 'subject,number,name,priority\nPhysics 1st Paper,1,Example Chapter,A\n', 'text/csv;charset=utf-8');
    return;
  }

  // Tasks add
  if (e.target.closest('#add-task-btn')) {
    openModal('Add task', taskFormHTML(plannerCursor), (form) => saveTaskFromForm(form));
    return;
  }

  // Notes
  const notePdf = e.target.closest('[data-note-pdf]');
  if (notePdf) { downloadNotePdf(notePdf.dataset.notePdf); return; }
  if (e.target.closest('#add-note-btn')) { openModal('Add note', noteFormHTML(null), (form, isCurrent) => saveNoteFromForm(form, null, isCurrent)); return; }
  const noteEdit = e.target.closest('[data-note-edit]');
  if (noteEdit) { const n = st.notes.find((x) => x.id === noteEdit.dataset.noteEdit); openModal('Edit note', noteFormHTML(n), (form, isCurrent) => saveNoteFromForm(form, n.id, isCurrent)); return; }
  const noteDel = e.target.closest('[data-note-delete]');
  if (noteDel) { if (removeLearningRecord('notes',noteDel.dataset.noteDelete,'Delete this note and its saved PDF, if any?')) { toast('Note deleted.'); render(); } return; }
  const noteBm = e.target.closest('[data-note-bookmark]');
  if (noteBm) { if (updateLearningRecord('notes',noteBm.dataset.noteBookmark,n=>({bookmarked:!n.bookmarked}))) render(); return; }
  if (e.target.closest('#notes-bookmarked')) { notesFilter.bookmarkedOnly = !notesFilter.bookmarkedOnly; render(); return; }

  // Formulas
  if (e.target.closest('#add-formula-btn')) { openModal('Add formula', formulaFormHTML(null), (form) => saveFormulaFromForm(form, null)); return; }
  const fEdit = e.target.closest('[data-formula-edit]');
  if (fEdit) { const f = st.formulas.find((x) => x.id === fEdit.dataset.formulaEdit); openModal('Edit formula', formulaFormHTML(f), (form) => saveFormulaFromForm(form, f.id)); return; }
  const fDel = e.target.closest('[data-formula-delete]');
  if (fDel) { if (removeLearningRecord('formulas',fDel.dataset.formulaDelete,'Delete this formula?')) { toast('Formula deleted.'); render(); } return; }
  const fFav = e.target.closest('[data-formula-fav]');
  if (fFav) { if (updateLearningRecord('formulas',fFav.dataset.formulaFav,f=>({favorite:!f.favorite}))) render(); return; }

  const openedResource = e.target.closest('[data-resource-open]');
  if (openedResource) {
    updateLearningRecord('resources',openedResource.dataset.resourceOpen,()=>({lastOpenedAt:nowISO()}));
  }

  // Resources
  if (e.target.closest('#add-resource-btn')) { openModal('Add video', resourceFormHTML(null), (form) => saveResourceFromForm(form, null)); return; }
  const rEdit = e.target.closest('[data-resource-edit]');
  if (rEdit) { const r = st.resources.find((x) => x.id === rEdit.dataset.resourceEdit); openModal('Edit video', resourceFormHTML(r), (form) => saveResourceFromForm(form, r.id)); return; }
  const rDel = e.target.closest('[data-resource-delete]');
  if (rDel) { if (removeLearningRecord('resources',rDel.dataset.resourceDelete,'Delete this video link?')) { toast('Video deleted.'); render(); } return; }
  const rBm = e.target.closest('[data-resource-bookmark]');
  if (rBm) { if (updateLearningRecord('resources',rBm.dataset.resourceBookmark,r=>({bookmarked:!r.bookmarked}))) render(); return; }
  const rW = e.target.closest('[data-resource-watched]');
  if (rW) { if (updateLearningRecord('resources',rW.dataset.resourceWatched,r=>({watched:!r.watched}))) render(); return; }
  if (e.target.closest('#library-bookmarked')) { libraryFilter.bookmarkedOnly = !libraryFilter.bookmarkedOnly; render(); return; }
  if (e.target.closest('#library-unwatched')) { libraryFilter.unwatchedOnly = !libraryFilter.unwatchedOnly; render(); return; }

  // Practice
  if (e.target.closest('#add-practice-btn')) { openModal('Record practice', practiceFormHTML(currentRoute.param), (form) => savePracticeFromForm(form)); return; }
  const pDel = e.target.closest('[data-practice-delete]');
  if (pDel) { if (removeLearningRecord('practice',pDel.dataset.practiceDelete,'Delete this practice record? Linked weaknesses will remain.')) { toast('Practice deleted.'); render(); } return; }
  const pBm = e.target.closest('[data-practice-bookmark]');
  if (pBm) { if (updateLearningRecord('practice',pBm.dataset.practiceBookmark,p=>({bookmarked:!p.bookmarked}))) render(); return; }
  const pRe = e.target.closest('[data-practice-reattempt]');
  if (pRe) { if (updateLearningRecord('practice',pRe.dataset.practiceReattempt,p=>({reattempted:!p.reattempted}))) render(); return; }

  // Question bank
  const questionPageButton = e.target.closest('[data-question-page]');
  if (questionPageButton) { questionPage = Number(questionPageButton.dataset.questionPage) || 0; render(); return; }
  const questionEdit = e.target.closest('[data-question-edit]');
  if (e.target.closest('#add-question-btn') || questionEdit) {
    const existing = questionEdit ? st.questionBank.find(q => q.id === questionEdit.dataset.questionEdit) : null;
    if (questionEdit && !existing) return;
    const options = Array.isArray(existing?.options) ? existing.options : [];
    const selected = (a, b) => a === b ? 'selected' : '';
    openModal(existing ? 'Edit question' : 'Add question', `<form id="question-form" class="form">
      <label class="field"><span>Question *</span><textarea name="question" rows="3" required>${esc(existing?.question || '')}</textarea></label>
      <label class="field"><span data-i18n="extra41">Type</span><select name="type"><option value="mcq" ${selected(existing?.type || 'mcq','mcq')}>MCQ</option><option value="cq" ${selected(existing?.type,'cq')}>CQ</option></select></label>
      <label class="field"><span data-i18n="extra10">Subject</span><select name="subjectId"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}" ${selected(existing?.subjectId,s.id)}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field"><span data-i18n="extra14">Chapter (optional)</span><select name="chapterId"><option value="">—</option>${st.chapters.map((c) => `<option value="${esc(c.id)}" ${selected(existing?.chapterId,c.id)}>${esc(subjectName(c.subjectId))} — ${esc(chapterLabel(c.id))}</option>`).join('')}</select></label>
      <p class="muted small">For an auto-graded MCQ test, provide all four choices and the correct choice. Leave choices blank for a manual question. Editing a question does not alter an active test or past review.</p>
      ${[0,1,2,3].map(i => `<label class="field"><span>Choice ${i+1}</span><input name="option${i}" maxlength="1000" value="${esc(options[i] || '')}"></label>`).join('')}
      <label class="field"><span>Correct choice</span><select name="correctIndex"><option value="">—</option>${[0,1,2,3].map(i => `<option value="${i}" ${selected(existing?.correctIndex,i)}>${i+1}</option>`).join('')}</select></label>
      <label class="field"><span>Answer / explanation</span><textarea name="answer" rows="2">${esc(existing?.answer || '')}</textarea></label>
      <div class="row gap"><button class="btn primary" type="submit">${existing ? 'Save question' : 'Add question'}</button><button class="btn ghost" type="button" data-close-modal data-i18n="extra24">Cancel</button></div></form>`,
      (form) => {
        const fd = new FormData(form), question = sanitizeText(fd.get('question'),5000), type = String(fd.get('type') || '');
        const chapterId = String(fd.get('chapterId') || '') || null, chapter = chapterId ? chapterById(chapterId) : null;
        const subjectId = String(fd.get('subjectId') || '') || (chapter ? chapter.subjectId : null);
        if (!question || !['mcq','cq'].includes(type) || !validLearningLink(subjectId,chapterId)) { toast('Enter a question and choose a matching subject and chapter.'); return false; }
        const choices = [0,1,2,3].map(i => sanitizeText(fd.get('option'+i),1000)), choice = String(fd.get('correctIndex') || '');
        if ((choices.some(Boolean) || choice) && (type !== 'mcq' || choices.some(v => !v) || !['0','1','2','3'].includes(choice))) { toast('For an MCQ, enter all four choices and select the correct one.'); return false; }
        if (questionDuplicate(st.questionBank.filter(q => !existing || q.id !== existing.id),question,type,subjectId,chapterId)) { toast('This question is already in the same subject and chapter.'); return false; }
        const data = {question,type,subjectId,chapterId,options:choices.every(Boolean) ? choices : null,correctIndex:choice === '' ? null : Number(choice),answer:sanitizeText(fd.get('answer'),5000)};
        if (existing) return replaceLearningCollection('questionBank', st.questionBank.map(q => q.id === existing.id ? {...q,...data,updatedAt:nowISO()} : q));
        return replaceLearningCollection('questionBank',st.questionBank.concat({id:uid('qb'),...data,source:'manual',createdAt:nowISO()}));
      });
    return;
  }
  if (e.target.closest('#export-questions-btn')) { download('question-bank.json', JSON.stringify(st.questionBank, null, 2), 'application/json'); return; }
  const qDel = e.target.closest('[data-question-delete]');
  if (qDel) { if (removeLearningRecord('questionBank',qDel.dataset.questionDelete,'Delete this question? Active tests and past reviews keep their snapshots.')) { toast('Question deleted.'); render(); } return; }

  // Exams
  if (e.target.closest('#add-exam-btn')) { openModal('Schedule exam', examFormHTML(), (form) => saveExamFromForm(form)); return; }
  const quizMistake = e.target.closest('[data-quiz-weakness]');
  if (quizMistake) {
    const result = st.examResults.find((r) => r.id === quizMistake.dataset.quizWeakness);
    const index = Number(quizMistake.dataset.index);
    const q = result && Array.isArray(result.quizReview) && Number.isInteger(index) ? result.quizReview[index] : null;
    if (!q || q.selectedIndex === q.correctIndex) return;
    if (st.weaknesses.some((w) => w.resultId === result.id && w.questionIndex === index)) { toast('Already saved to weaknesses.'); return; }
    const chapter = q.chapterId ? chapterById(q.chapterId) : null;
    const weakness = { id: uid('wk'), topic: sanitizeText(q.question, 300), type: 'mcq', subjectId: chapter ? chapter.subjectId : null, chapterId: chapter ? chapter.id : null, reason: '', correctionTask: 'Reattempt the question', status: 'active', practiceCount: 0, resultId: result.id, questionIndex: index, createdAt: nowISO(), updatedAt: nowISO() };
    st.weaknesses.push(weakness);
    if (!save()) { st.weaknesses.pop(); return; }
    toast('Saved to weaknesses.'); return;
  }
  if (e.target.closest('#written-discard') || e.target.closest('#quiz-discard')) {
    const key = e.target.closest('#written-discard') ? 'activeWritten' : 'activeQuiz';
    if (!st[key] || !confirm('Discard this test and its answers without saving a result?')) return;
    const previous = st[key]; st[key] = null;
    if (!save()) { st[key] = previous; return; }
    toast('Test discarded.'); navigate('exams'); return;
  }
  const writtenStart = e.target.closest('[data-written-start]');
  if (writtenStart) { if (startWrittenTest(writtenStart.dataset.writtenStart)) navigate('written'); return; }
  if (e.target.closest('#written-submit')) { if (confirm('Submit answers for self-marking? They can no longer be edited.')) { if (submitWrittenTest()) render(); } return; }
  if (e.target.closest('#written-finish')) { if (confirm('Save your self-marked result?')) { if (finishWrittenTest()) { toast('Self-marked result saved.'); navigate('exams'); } } return; }
  const quizStart = e.target.closest('[data-quiz-start]');
  if (quizStart) { if (startBankQuiz(quizStart.dataset.quizStart)) navigate('quiz'); return; }
  if (e.target.closest('#quiz-submit')) { if (confirm('Submit your answers now?')) { if (finishBankQuiz()) { toast('MCQ test submitted.'); navigate('exams'); } } return; }
  const exStart = e.target.closest('[data-exam-start]');
  if (exStart) {
    const exam = st.exams.find((x) => x.id === exStart.dataset.examStart);
    if (!exam) return;
    if (st.activeExam) { toast('End the current timed test first.'); return; }
    st.activeExam = { examId: exam.id, startedAt: Date.now(), endsAt: Date.now() + exam.durationMinutes * 60000 };
    if (!save()) { st.activeExam = null; return; } render(); return;
  }
  if (e.target.closest('#end-timed-exam')) {
    if (confirm('End the timed test? Record your marks separately.')) { const previous = st.activeExam; st.activeExam = null; if (!save()) { st.activeExam = previous; return; } render(); }
    return;
  }
  const exDel = e.target.closest('[data-exam-delete]');
  if (exDel) {
    if (st.activeWritten && st.activeWritten.examId === exDel.dataset.examDelete) { toast('Finish the active written test before deleting this exam.'); return; }
    if (st.activeQuiz && st.activeQuiz.examId === exDel.dataset.examDelete) { toast('Finish the active MCQ test before deleting this exam.'); return; }
    if (!confirm('Delete this exam and its recorded results?')) return;
    const previous = {activeExam:st.activeExam, exams:st.exams, examResults:st.examResults};
    if (st.activeExam && st.activeExam.examId === exDel.dataset.examDelete) st.activeExam = null;
    st.exams = st.exams.filter((x) => x.id !== exDel.dataset.examDelete);
    st.examResults = st.examResults.filter((r) => r.examId !== exDel.dataset.examDelete);
    if (!save()) { Object.assign(st,previous); return; } toast('Exam deleted.'); render(); return;
  }
  const resAdd = e.target.closest('[data-result-add]');
  if (resAdd) {
    const exam = st.exams.find((x) => x.id === resAdd.dataset.resultAdd);
    openModal('Record result', resultFormHTML(exam), (form) => saveResultFromForm(form, exam.id));
    return;
  }

  // Revisions
  const revDone = e.target.closest('[data-revision-done]');
  if (revDone) {
    openModal('Revision difficulty', `<form id="rev-form" class="form">
      <p>How difficult was this revision?</p>
      <label class="field"><span>Difficulty (1 = easy, 5 = very hard)</span>
      <select name="difficulty"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>
      <div class="row gap"><button class="btn primary" type="submit">Mark revised</button>
      <button class="btn ghost" type="button" data-close-modal data-i18n="extra24">Cancel</button></div></form>`,
      (form) => !!completeRevision(revDone.dataset.revisionDone, Number(new FormData(form).get('difficulty'))));
    return;
  }
  const revDiff = e.target.closest('[data-revision-difficult]');
  if (revDiff) {
    const r = st.revisions.find((x) => x.id === revDiff.dataset.revisionDifficult);
    if (r) {
      // Completion and the extra repeat are a single transaction.
      const revised = {...r, completedAt:nowISO(), status:'done', difficulty:5};
      const extra = {id:uid('rev'), chapterId:r.chapterId, subjectId:r.subjectId, dueDate:addDays(todayKey(),2), completedAt:null, difficulty:null, status:'pending', cycle:r.cycle, createdAt:nowISO()};
      if (!replaceLearningCollection('revisions',st.revisions.map(x => x.id === r.id ? revised : x).concat(extra))) return;
      toast('Marked revised — extra repeat scheduled in 2 days.');
      render();
    }
    return;
  }

  // Weaknesses
  if (e.target.closest('#add-weakness-btn')) { openModal('Add weakness', weaknessFormHTML(currentRoute.param), (form) => saveWeaknessFromForm(form)); return; }
  const wSchedule = e.target.closest('[data-weakness-schedule]');
  if (wSchedule) {
    const weakness = st.weaknesses.find((w) => w.id === wSchedule.dataset.weaknessSchedule);
    if (!weakness) return;
    openModal('Schedule correction practice', `<form id="correction-form" class="form"><p>${esc(weakness.topic)}</p><label class="field"><span>Task title</span><input name="title" required maxlength="300" value="${esc(weakness.correctionTask || 'Practice: ' + weakness.topic)}"></label><label class="field"><span>First date</span><input name="date" type="date" value="${todayKey()}" required></label><label class="field"><span>Number of sessions (1–5)</span><input name="count" type="number" min="1" max="5" value="1" required></label><label class="field"><span>Days between sessions</span><input name="interval" type="number" min="1" max="90" value="3" required></label><label class="field"><span>Minutes per session</span><input name="minutes" type="number" min="1" max="1440" value="30" required></label><button class="btn primary" type="submit">Add to planner</button></form>`, (form) => {
      const fd = new FormData(form), title = sanitizeText(fd.get('title'), 300), date = String(fd.get('date') || '');
      const count = Number(fd.get('count')), interval = Number(fd.get('interval')), minutes = Number(fd.get('minutes'));
      if (!title || !isValidDateKey(date) || !Number.isInteger(count) || count < 1 || count > 5 || !Number.isInteger(interval) || interval < 1 || interval > 90 || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { toast('Enter a valid title, date and schedule.'); return false; }
      const previous = st.tasks; st.tasks = previous.slice();
      for (let i = 0; i < count; i++) st.tasks.push({ id: uid('task'), title, date: addDays(date, i * interval), plannedMinutes: minutes, type: 'study', priority: 'A', subjectId: weakness.subjectId || null, chapterId: weakness.chapterId || null, weaknessId: weakness.id, deadline: null, status: 'pending', createdAt: nowISO() });
      if (!save()) { st.tasks = previous; return false; } toast(`${count} correction task(s) added to Planner.`); return true;
    });
    return;
  }
  const wPrac = e.target.closest('[data-weakness-practice]');
  if (wPrac) { if (updateLearningRecord('weaknesses',wPrac.dataset.weaknessPractice,w=>({practiceCount:(w.practiceCount || 0)+1,updatedAt:nowISO()}))) render(); return; }
  const wStat = e.target.closest('[data-weakness-status]');
  if (wStat) { if (updateLearningRecord('weaknesses',wStat.dataset.weaknessStatus,()=>({status:wStat.dataset.status,updatedAt:nowISO()}))) render(); return; }
  const wDel = e.target.closest('[data-weakness-delete]');
  if (wDel) { if (removeLearningRecord('weaknesses',wDel.dataset.weaknessDelete,'Delete this weakness? Scheduled tasks will remain.')) { toast('Weakness deleted.'); render(); } return; }

  if (e.target.closest('#review-create-tasks')) {
    const review = st.weeklyReviews.find((r) => r.weekStart === weekStartKey(todayKey()));
    if (!review) return;
    const goals = String(review.answers.goals || '').split('\n').map((v) => v.trim()).filter(Boolean).slice(0, 21);
    let added = 0;
    const previous = st.tasks; st.tasks = previous.slice();
    goals.forEach((goal, i) => {
      if (st.tasks.some((t) => t.reviewId === review.id && t.reviewGoal === goal)) return;
      st.tasks.push({ id: uid('task'), title: sanitizeText(goal, 300), date: addDays(todayKey(), i % 7 + 1), plannedMinutes: 30, type: 'study', priority: 'B', subjectId: null, chapterId: null, deadline: null, status: 'pending', reviewId: review.id, reviewGoal: goal, createdAt: nowISO() });
      added++;
    });
    if (!added) { st.tasks = previous; toast('No new goal tasks to add.'); return; }
    if (!save()) { st.tasks = previous; return; }
    toast(added + ' goal task(s) added.'); render(); return;
  }

  // Journal
  if (e.target.closest('#add-journal-btn')) { openModal('New journal entry', journalFormHTML(), (form) => saveJournalFromForm(form)); return; }
  const jDel = e.target.closest('[data-journal-delete]');
  if (jDel) { const previous = st.journal; st.journal = previous.filter((j) => j.id !== jDel.dataset.journalDelete); if (!save()) { st.journal = previous; return; } toast('Entry deleted.'); render(); return; }

  // Settings / data
  if (e.target.closest('#load-demo-btn')) { loadDemoData(); toast('Demo data loaded (labelled DEMO).'); render(); return; }
  if (e.target.closest('#clear-demo-btn')) { clearDemoData(); toast('Demo data removed.'); render(); return; }
  if (e.target.closest('#reset-all-btn')) {
    if (confirm('Delete ALL local data on this device? If sync is connected this reset will also be uploaded. Export a backup first.')) { resetTimer(); if (resetState()) toast('All data reset.'); render(); }
    return;
  }
  if (e.target.closest('#enable-browser-notif')) {
    const statusEl = document.getElementById('notif-status');
    if (!('Notification' in window)) { if (statusEl) statusEl.textContent = 'This browser does not support notifications.'; return; }
    Notification.requestPermission().then((perm) => {
      if (statusEl) statusEl.textContent = 'Notification permission: ' + perm;
      if (perm === 'granted') notify('Notifications enabled', 'Timer alerts can appear while the app is open.');
    });
    return;
  }

  // Backup
  if (e.target.closest('#export-json-btn')) { download('hsc27-backup-' + todayKey() + '.json', exportJSON(), 'application/json'); return; }
  if (e.target.closest('#export-notes-btn')) {
    download('hsc27-notes-' + todayKey() + '.json', JSON.stringify({ notes: st.notes, formulas: st.formulas, resources: st.resources }, null, 2), 'application/json');
    return;
  }
  const csvBtn = e.target.closest('[data-export-csv]');
  if (csvBtn) { download('hsc27-' + csvBtn.dataset.exportCsv + '.csv', exportCSV(csvBtn.dataset.exportCsv), 'text/csv;charset=utf-8'); return; }


});

/* ---------- Change delegation (checkboxes, selects) ---------- */
document.addEventListener('change', (e) => {
  const st = getState();
  const quizAnswer = e.target.closest('[data-quiz-answer]');
  if (quizAnswer && st.activeQuiz) {
    if (Date.now() >= st.activeQuiz.endsAt) { checkQuizExpiry(); return; }
    const i = Number(quizAnswer.dataset.quizAnswer), value = Number(quizAnswer.value);
    if (Number.isInteger(i) && i >= 0 && i < st.activeQuiz.questions.length && Number.isInteger(value) && value >= 0 && value < 4) {
      const previous = st.activeQuiz.answers[i]; st.activeQuiz.answers[i] = value;
      if (!save()) { if (previous === undefined) delete st.activeQuiz.answers[i]; else st.activeQuiz.answers[i] = previous; render(); }
    }
    return;
  }
  const taskToggle = e.target.closest('[data-task-toggle]');
  if (taskToggle) {
    const t = st.tasks.find((x) => x.id === taskToggle.dataset.taskToggle);
    if (t) { const previous = t.status; t.status = taskToggle.checked ? 'done' : 'pending'; if (!save()) t.status = previous; render(); }
    return;
  }
  if (e.target.id === 'focus-subject') { focusState.subjectId = e.target.value || null; focusState.chapterId = null; persistFocusTimer(); syncFocusChapterOptions(); return; }
  if (e.target.id === 'focus-chapter') { focusState.chapterId = e.target.value || null; persistFocusTimer(); return; }
  if (e.target.id === 'focus-minutes') { focusState.targetMs = Math.max(1, Number(e.target.value) || 25) * 60000; resetTimer(); return; }
  if (e.target.id === 'focus-break') { focusState.breakMs = Math.max(1, Number(e.target.value) || 5) * 60000; persistFocusTimer(); return; }
  if (e.target.id === 'notes-category') { notesFilter.category = e.target.value; render(); return; }
  if (e.target.id === 'formula-subject') { formulaFilter.subject = e.target.value; render(); return; }
  if (e.target.id === 'library-subject') { libraryFilter.subject = e.target.value; render(); return; }
  if (e.target.id === 'chapter-import-file' && e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = importChaptersFromText(String(reader.result), file.name);
        toast(`Imported ${r.added} chapter(s), skipped ${r.skipped}.`);
      } catch (err) { toast('Import failed: ' + err.message); }
      render();
    };
    reader.readAsText(file);
    return;
  }
  if (e.target.id === 'import-json-file' && e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try { if (focusState.running || focusState.accumulatedMs > 0 || getState().activeQuiz || getState().activeWritten || getState().activeExam) { toast('Stop the focus and exam timers and finish active tests before restoring.'); return; } if (!confirm('Replace all data on this device with this backup? If sync is connected this replacement will also be uploaded. Export a backup first.')) return; importJSON(String(reader.result)); resetTimer(false); restoreFocusTimer(); toast('Backup restored.'); } catch (err) { toast('Restore failed: ' + err.message); }
      render();
    };
    reader.readAsText(file);
    return;
  }
  if (e.target.id === 'import-questions-file' && e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        if (!Array.isArray(arr)) throw new Error('Expected a JSON array.');
        const currentState = getState();
        const previous = currentState.questionBank;
        const next = previous.slice();
        let added = 0;
        arr.slice(0, 1000).forEach((q) => {
          if (!q || !sanitizeText(q.question, 5000)) return;
          const chapter = q.chapterId ? chapterById(q.chapterId) : null;
          const subjectId = chapter ? chapter.subjectId : (subjectById(q.subjectId) ? q.subjectId : null);
          const options = Array.isArray(q.options) && q.options.length === 4 ? q.options.map((o) => sanitizeText(o, 1000)) : null;
          const correctIndex = Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4 ? q.correctIndex : null;
          const question = sanitizeText(q.question, 5000), type = q.type === 'cq' ? 'cq' : 'mcq', chapterId = chapter ? chapter.id : null;
          if (questionDuplicate(next, question, type, subjectId, chapterId)) return;
          next.push({ id: uid('qb'), question, type,
            subjectId, chapterId, options: options && options.every(Boolean) ? options : null, correctIndex,
            answer: sanitizeText(q.answer, 5000), source: q.source === 'ai' ? 'ai' : 'imported', createdAt: nowISO() });
          added++;
        });
        currentState.questionBank = next;
        if (!save()) { currentState.questionBank = previous; throw new Error('Could not save imported questions.'); }
        toast(`Imported ${added} question(s); duplicates or invalid entries skipped.`);
      } catch (err) { toast('Import failed: ' + err.message); }
      render();
    };
    reader.readAsText(file);
  }
});

document.addEventListener('input', (e) => {
  const test = getState().activeWritten, el = e.target.closest('[data-written-answer]');
  if (!el || !test || test.submittedAt) return;
  if (Date.now() >= test.endsAt) { checkWrittenExpiry(); return; }
  const i = Number(el.dataset.writtenAnswer);
  if (!Number.isInteger(i) || i < 0 || i >= test.questions.length) return;
  const previous = test.answers[i]; test.answers[i] = String(el.value).slice(0,4000);
  if (!save()) { if (previous === undefined) delete test.answers[i]; else test.answers[i] = previous; el.value = previous || ''; }
});
document.addEventListener('change', (e) => {
  const test = getState().activeWritten, el = e.target.closest('[data-written-score]');
  if (!el || !test || !test.submittedAt) return;
  const i = Number(el.dataset.writtenScore), value = el.value === '' ? null : Number(el.value);
  if (!Number.isInteger(i) || i < 0 || i >= test.questions.length || (value !== null && (!Number.isInteger(value) || value < 0 || value > 100))) { toast('Enter a whole percentage between 0 and 100.'); el.value = Number.isInteger(test.scores[i]) ? test.scores[i] : ''; return; }
  const previous = test.scores[i]; if (value === null) delete test.scores[i]; else test.scores[i] = value;
  if (!save()) { if (previous === undefined) delete test.scores[i]; else test.scores[i] = previous; el.value = previous ?? ''; }
});

/* ---------- Submit delegation (modal + inline forms) ---------- */
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form.id === 'manual-session-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const minutes = Number(fd.get('minutes')) || 0;
    const subjectId = String(fd.get('subjectId') || '') || null;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || (subjectId && !subjectById(subjectId))) { toast('Enter 1–1440 whole minutes and a valid subject.'); return; }
    const session = recordSession({ subjectId, chapterId: null, durationMinutes: minutes, mode: 'manual', source: 'manual', note: sanitizeText(fd.get('note'), 500) });
    if (!session) return;
    toast(`Saved ${formatDuration(minutes)} session.`);
    render();
    return;
  }
  if (form.id === 'settings-form') { e.preventDefault(); if (saveSettingsFromForm(form)) { toast('Settings saved.'); render(); } return; }
  if (form.id === 'notif-form') { e.preventDefault(); if (saveNotifFromForm(form)) { toast('Notification preferences saved.'); checkReminders(); render(); } return; }
  if (form.id === 'review-form') { e.preventDefault(); if (saveReviewFromForm(form)) { toast('Weekly review saved.'); render(); } return; }
  // Modal forms
  if (modalState && form.closest('#modal-overlay')) {
    e.preventDefault();
    const modal = modalState;
    if (modal.pending) return;
    const result = modal.onSubmit(form, () => modalState === modal);
    if (result && typeof result.then === 'function') {
      modal.pending = true;
      const buttons = form.querySelectorAll('[type="submit"]');
      buttons.forEach((button) => { button.disabled = true; });
      result.then((ok) => {
        if (modalState !== modal) return;
        modal.pending = false;
        buttons.forEach((button) => { button.disabled = false; });
        if (ok) { closeModal(); render(); }
      }).catch(() => {
        if (modalState !== modal) return;
        modal.pending = false;
        buttons.forEach((button) => { button.disabled = false; });
        toast('Could not save. Please try again.');
      });
    } else if (result) { closeModal(); render(); }
  }
});

/* ---------- Modal overlay click-to-close ---------- */
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (!modalState) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
  if (e.key !== 'Tab') return;
  const overlay = document.getElementById('modal-overlay');
  const focusable = [...overlay.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(node => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden');
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement;
  if (e.shiftKey && (active === first || !overlay.contains(active))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (active === last || !overlay.contains(active))) { e.preventDefault(); first.focus(); }
});

/* ---------- Bottom nav ---------- */
document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => navigate(b.dataset.nav));
});
document.getElementById('more-btn').addEventListener('click', () => {
  openModal('More', `<div class="menu-list">
    ${[['notes', '🗒 Notes & documents'], ['formulas', '∑ Formula library'], ['library', '▶ Video library'],
       ['practice', '✍ Practice tracker'], ['exams', '📝 Exams'], ['revisions', '🔁 Revisions'],
       ['weaknesses', '⚠ Weaknesses'], ['review', '✅ Weekly review'], ['journal', '📓 Journal'],
       ['calendar', '📅 Calendar'], ['search', '🔍 Search'], ['sync', '☁ Account & sync'], ['ai', '🤖 AI assistant'],
       ['backup', '💾 Backup & restore'], ['settings', '⚙ Settings']]
      .filter(([r]) => !isOfflineAndroid() || !['sync','ai'].includes(r))
      .map(([r, l]) => `<button class="menu-item" data-nav="${r}"><span data-i18n="menu-${r}">${l}</span></button>`).join('')}
  </div>`, () => true);
});

function updateHeaderDate() {
  const el = document.getElementById('header-date');
  if (!el) return;
  try { el.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date()); }
  catch (e) { el.textContent = ''; }
}

/* ---------- Init ---------- */
loadState();
restoreFocusTimer();
carryOverMissed();
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
render();
updateHeaderDate();
checkReminders();
setInterval(updateHeaderDate, 60000);
setInterval(() => { if (carryOverMissed()) render(); checkReminders(); }, 60000);
checkQuizExpiry();
checkWrittenExpiry();
syncInit();
setInterval(() => { updateExamTimerDisplay(); checkQuizExpiry(); checkWrittenExpiry(); }, 1000);

// Register service worker for offline PWA support
if (!isOfflineAndroid() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline still works via cache if previously registered */ });
  });
}
