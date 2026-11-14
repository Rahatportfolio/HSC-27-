/* HSC 2027 Smart Study App — store.js
 * Local-first data layer. Single source of truth persisted to localStorage
 * (works fully offline; export/import JSON for backup). All derived values
 * (chapter study time, completion, streaks) are computed, never duplicated,
 * to avoid inconsistent states.
 */
'use strict';

const STORAGE_KEY = 'hsc27_state_v1';
const STATE_VERSION = 1;

const DEFAULT_SETTINGS = {
  dailyTargetMinutes: 480, // 8 hours
  theme: 'auto', // auto | light | dark
  language: 'en',
  revisionIntervals: [1, 3, 7, 14, 30],
  examDate: '', // user-set HSC exam date (YYYY-MM-DD); never invented
  notifications: {
    enabled: false,
    sessionReminder: true,
    revisionReminder: true,
    examReminder: true,
    weeklyReview: true,
    dailySummary: true,
    missedTaskReminder: true,
    reminderTime: '20:00',
  },
};

const SCIENCE_SUBJECTS = [
  'Physics 1st Paper', 'Physics 2nd Paper',
  'Chemistry 1st Paper', 'Chemistry 2nd Paper',
  'Biology 1st Paper', 'Biology 2nd Paper',
  'Higher Mathematics 1st Paper', 'Higher Mathematics 2nd Paper',
];
const OTHER_SUBJECTS = [
  'ICT', 'Bangla 1st Paper', 'Bangla 2nd Paper', 'English 1st Paper', 'English 2nd Paper',
];
const SUBJECT_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#65a30d', '#db2777', '#ea580c', '#0d9488', '#9333ea', '#ca8a04'];

function defaultState() {
  const subjects = [];
  SCIENCE_SUBJECTS.forEach((name, i) => subjects.push({
    id: 'sub-sci-' + (i + 1), name, group: 'science',
    color: SUBJECT_COLORS[i % SUBJECT_COLORS.length], createdAt: nowISO(),
  }));
  OTHER_SUBJECTS.forEach((name, i) => subjects.push({
    id: 'sub-oth-' + (i + 1), name, group: 'other',
    color: SUBJECT_COLORS[(i + 8) % SUBJECT_COLORS.length], createdAt: nowISO(),
  }));
  return {
    version: STATE_VERSION,
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    subjects,
    chapters: [],
    tasks: [],
    sessions: [],
    revisions: [],
    practice: [],
    exams: [],
    examResults: [],
    notes: [],
    formulas: [],
    resources: [],
    weaknesses: [],
    journal: [],
    weeklyReviews: [],
    milestones: [],
    questionBank: [],
    demoLoaded: false,
  };
}

/* ---------- Persistence ---------- */
let state = null;
let saveTimer = null;
let storageBlocked = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === STATE_VERSION && Array.isArray(parsed.subjects)) {
        // Merge settings defaults for forward compatibility
        parsed.settings = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), parsed.settings || {});
        parsed.settings.notifications = Object.assign({}, DEFAULT_SETTINGS.notifications, (parsed.settings || {}).notifications || {});
        // Remove credentials from earlier experimental builds.
        delete parsed.settings.ai;
        state = parsed;
        return state;
      }
      throw new Error('Unsupported or invalid saved data');
    }
  } catch (e) {
    // Preserve unreadable data; never silently overwrite it.
    state = defaultState();
    storageBlocked = true;
    if (typeof alert === 'function') alert('Saved data could not be read. Storage is blocked to avoid overwriting it. Export your browser data and seek help.');
    return state;
  }
  state = defaultState();
  persist();
  return state;
}
function persist() {
  if (storageBlocked) return false;
  const syncMarked = typeof syncBeforeLocalSave === 'function' ? syncBeforeLocalSave() : false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); if (typeof syncAfterLocalSave === 'function') syncAfterLocalSave(syncMarked); return true; } catch (e) {
    if (typeof alert === 'function') alert('Unable to save data on this device. Export a backup now; free storage space or check browser settings.');
    return false;
  }
}
function save() {
  // Synchronous persistence avoids losing changes when Android suspends the app.
  return persist();
}
function saveNow() { if (saveTimer) clearTimeout(saveTimer); return persist(); }
function getState() { if (!state) loadState(); return state; }
function resetState() { const previous = state; state = defaultState(); if (!saveNow()) { state = previous; return null; } return state; }

/* ---------- Lookups ---------- */
function subjectById(id) { return getState().subjects.find((s) => s.id === id) || null; }
function chapterById(id) { return getState().chapters.find((c) => c.id === id) || null; }
function chaptersOf(subjectId) {
  return getState().chapters
    .filter((c) => c.subjectId === subjectId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}
function subjectName(id) { const s = subjectById(id); return s ? s.name : 'Unknown subject'; }
function chapterLabel(chapterId) {
  const c = chapterById(chapterId);
  if (!c) return '';
  return (c.number ? 'Ch ' + c.number + ': ' : '') + c.name;
}

/* ---------- Derived study time (from sessions — single source of truth) ---------- */
function sessionsOn(dateKey) {
  return getState().sessions.filter((s) => s.date === dateKey);
}
function minutesOn(dateKey) {
  return sessionsOn(dateKey).reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
}
function minutesInWeek(weekStart) {
  let total = 0;
  for (let i = 0; i < 7; i++) total += minutesOn(addDays(weekStart, i));
  return total;
}
function minutesInMonth(mKey) {
  return getState().sessions
    .filter((s) => s.date && s.date.slice(0, 7) === mKey)
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
}
function chapterMinutes(chapterId) {
  return getState().sessions
    .filter((s) => s.chapterId === chapterId)
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
}
function subjectMinutes(subjectId) {
  return getState().sessions
    .filter((s) => s.subjectId === subjectId)
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
}
function lastStudiedChapter() {
  const ss = getState().sessions.filter((s) => s.chapterId).sort((a, b) => (b.endedAt || '').localeCompare(a.endedAt || ''));
  return ss.length ? chapterById(ss[0].chapterId) : null;
}
function studyDateKeys() {
  const set = new Set();
  getState().sessions.forEach((s) => { if (s.date && s.durationMinutes > 0) set.add(s.date); });
  return [...set];
}

/* ---------- Completion (derived from chapter status + completionPct) ---------- */
function subjectCompletion(subjectId) {
  const chs = chaptersOf(subjectId);
  if (!chs.length) return { pct: 0, done: 0, total: 0 };
  const sum = chs.reduce((a, c) => a + (c.status === 'completed' ? 100 : (c.completionPct || 0)), 0);
  return { pct: Math.round(sum / chs.length), done: chs.filter((c) => c.status === 'completed').length, total: chs.length };
}
function overallCompletion() {
  const chs = getState().chapters;
  if (!chs.length) return { pct: 0, done: 0, total: 0 };
  const sum = chs.reduce((a, c) => a + (c.status === 'completed' ? 100 : (c.completionPct || 0)), 0);
  return { pct: Math.round(sum / chs.length), done: chs.filter((c) => c.status === 'completed').length, total: chs.length };
}
function weakestSubjects(limit) {
  return getState().subjects
    .filter((s) => chaptersOf(s.id).length > 0)
    .map((s) => {
      const c = subjectCompletion(s.id);
      return { subject: s, pct: c.pct, minutes: subjectMinutes(s.id), chapters: c.total };
    })
    .sort((a, b) => a.pct - b.pct || a.minutes - b.minutes)
    .slice(0, limit || 3);
}

/* ---------- Sessions (with duplicate guard) ---------- */
function recordSession(data) {
  const st = getState();
  const durationMinutes = Math.max(0, Math.round(data.durationMinutes || 0));
  if (durationMinutes <= 0) return null;
  // A stable timer run key makes recovery after interruption idempotent.
  if (data.runId) { const prior = st.sessions.find((s) => s.runId === data.runId); if (prior) return prior; }
  // Prevent accidental duplicate recording (same chapter, overlapping window)
  const dup = !data.runId && data.source === 'timer' && data.endedAt && st.sessions.find((s) =>
    s.chapterId === data.chapterId && s.subjectId === data.subjectId &&
    Math.abs(new Date(s.endedAt || 0).getTime() - new Date(data.endedAt || 0).getTime()) < 60000 &&
    Math.abs((s.durationMinutes || 0) - durationMinutes) < 1);
  if (dup) return dup;
  const session = {
    id: uid('ses'),
    runId: data.runId || null,
    subjectId: data.subjectId || null,
    chapterId: data.chapterId || null,
    startedAt: data.startedAt || nowISO(),
    endedAt: data.endedAt || nowISO(),
    durationMinutes,
    mode: data.mode || 'manual',
    source: data.source || 'manual',
    note: sanitizeText(data.note || '', 500),
    date: data.date || toDateKey(new Date(data.endedAt || Date.now())),
  };
  st.sessions.push(session);
  if (!save()) { st.sessions.pop(); return null; }
  return session;
}

/* ---------- Revisions ---------- */
function scheduleRevisions(chapter, shouldSave = true) {
  const st = getState();
  const intervals = st.settings.revisionIntervals || [1, 3, 7, 14, 30];
  const today = todayKey();
  intervals.forEach((days, i) => {
    const exists = st.revisions.some((r) => r.chapterId === chapter.id && r.cycle === i + 1);
    if (!exists) {
      st.revisions.push({
        id: uid('rev'), chapterId: chapter.id, subjectId: chapter.subjectId,
        dueDate: addDays(today, days), completedAt: null, difficulty: null,
        status: 'pending', cycle: i + 1, createdAt: nowISO(),
      });
    }
  });
  if (shouldSave) save();
}
function dueRevisions() {
  const today = todayKey();
  return getState().revisions
    .filter((r) => !r.completedAt && r.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
function completeRevision(id, difficulty) {
  const st = getState(), index = st.revisions.findIndex(x => x.id === id);
  if (index < 0 || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return null;
  const previous = st.revisions;
  const revised = {...previous[index], completedAt:nowISO(), status:'done', difficulty};
  st.revisions = previous.map((r, i) => i === index ? revised : r);
  if (!save()) { st.revisions = previous; return null; }
  return revised;
}

/* ---------- Tasks / planner ---------- */
function tasksOn(dateKey) {
  return getState().tasks
    .filter((t) => t.date === dateKey)
    .sort((a, b) => (a.priority || 'B').localeCompare(b.priority || 'B') || (a.createdAt || '').localeCompare(b.createdAt || ''));
}
function carryOverMissed() {
  // Move unfinished tasks from past days to today (status 'carried')
  const st = getState();
  const today = todayKey();
  let moved = 0;
  const original = st.tasks.map(t => ({t, date:t.date, status:t.status, originalDate:t.originalDate, hadOriginal:Object.prototype.hasOwnProperty.call(t, 'originalDate')}));
  st.tasks.forEach((t) => {
    if ((t.status === 'pending' || t.status === 'carried') && t.date < today) {
      if (!t.originalDate) t.originalDate = t.date;
      t.date = today;
      t.status = 'carried';
      moved += 1;
    }
  });
  if (moved && !save()) {
    original.forEach(({t, date, status, originalDate, hadOriginal}) => { t.date = date; t.status = status; if (hadOriginal) t.originalDate = originalDate; else delete t.originalDate; });
    return 0;
  }
  return moved;
}

/* ---------- Practice ---------- */
function practiceForChapter(chapterId) {
  return getState().practice.filter((p) => p.chapterId === chapterId).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function practiceTotals(chapterId, type) {
  const list = getState().practice.filter((p) => p.chapterId === chapterId && (!type || p.type === type));
  const attempted = list.reduce((a, p) => a + (p.attempted || 0), 0);
  const correct = list.reduce((a, p) => a + (p.correct || 0), 0);
  const marks = list.reduce((a, p) => a + (p.marks || 0), 0);
  const totalMarks = list.reduce((a, p) => a + (p.totalMarks || 0), 0);
  return { attempted, correct, incorrect: attempted - correct, accuracy: accuracy(correct, attempted), marks, totalMarks, sessions: list.length };
}

/* ---------- Backup / export / import ---------- */
function exportJSON() {
  const copy = JSON.parse(JSON.stringify(getState()));
  delete copy.settings.ai;
  return JSON.stringify(copy, null, 2);
}
function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.subjects) || !Array.isArray(parsed.chapters)) {
    throw new Error('Invalid backup file: missing subjects/chapters.');
  }
  const defaults = defaultState();
  if (parsed.version !== STATE_VERSION) throw new Error('Unsupported backup version.');
  for (const key of Object.keys(defaults)) {
    if (Array.isArray(defaults[key]) && (!Array.isArray(parsed[key]) || parsed[key].some((item) => !item || typeof item !== 'object' || Array.isArray(item)))) {
      throw new Error('Invalid backup file: missing or invalid ' + key + '.');
    }
  }
  if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
    throw new Error('Invalid backup settings.');
  }
  const candidate = Object.assign(defaults, parsed);
  candidate.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings);
  candidate.settings.notifications = Object.assign({}, DEFAULT_SETTINGS.notifications, parsed.settings.notifications || {});
  delete candidate.settings.ai;
  // Write before replacing the live state, so quota/security failures cannot
  // turn a failed restore into an apparent success or discard current data.
  const syncMarked = typeof syncBeforeLocalSave === 'function' ? syncBeforeLocalSave() : false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate)); }
  catch (e) { throw new Error('Could not store backup on this device. Current data is unchanged.'); }
  state = candidate;
  storageBlocked = false;
  if (typeof syncAfterLocalSave === 'function') syncAfterLocalSave(syncMarked);
  return state;
}
function exportCSV(kind) {
  const st = getState();
  if (kind === 'sessions') {
    const rows = [['date', 'subject', 'chapter', 'minutes', 'mode', 'note']];
    st.sessions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
      rows.push([s.date, subjectName(s.subjectId), chapterLabel(s.chapterId), s.durationMinutes, s.mode, s.note || '']);
    });
    return toCSV(rows);
  }
  if (kind === 'chapters') {
    const rows = [['subject', 'number', 'name', 'priority', 'status', 'completionPct']];
    st.chapters.forEach((c) => rows.push([subjectName(c.subjectId), c.number || '', c.name, c.priority, c.status, c.completionPct || 0]));
    return toCSV(rows);
  }
  if (kind === 'practice') {
    const rows = [['date', 'subject', 'chapter', 'type', 'attempted', 'correct', 'marks', 'totalMarks']];
    st.practice.forEach((p) => rows.push([p.date, subjectName(p.subjectId), chapterLabel(p.chapterId), p.type, p.attempted, p.correct, p.marks || '', p.totalMarks || '']));
    return toCSV(rows);
  }
  if (kind === 'examResults') {
    const rows = [['date', 'exam', 'obtained', 'total', 'grade']];
    st.examResults.forEach((r) => {
      const ex = st.exams.find((e) => e.id === r.examId);
      rows.push([r.date, ex ? ex.name : '', r.obtainedMarks, ex ? ex.totalMarks : '', r.grade || '']);
    });
    return toCSV(rows);
  }
  return '';
}
function downloadBlob(filename, blob) {
  if (isOfflineAndroid()) {
    // Android WebView cannot reliably download blob: URLs. The native bridge opens
    // the system document picker; cancellation or failure never changes app data.
    const reader = new FileReader();
    reader.onerror = () => alert('Could not prepare export. Your data is unchanged.');
    reader.onload = () => {
      try {
        const data = String(reader.result || '');
        if (!data.includes(';base64,')) throw new Error('Invalid export');
        HSCAndroid.saveFile(filename, blob.type, data.slice(data.indexOf(',') + 1));
      } catch { alert('Could not prepare export. Your data is unchanged.'); }
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function download(filename, content, mime) {
  downloadBlob(filename, new Blob([content], { type: mime || 'text/plain;charset=utf-8' }));
}

/* ---------- Demo data (opt-in, clearly labelled, resettable) ---------- */
function loadDemoData() {
  const st = getState();
  if (st.demoLoaded) return;
  const phys = st.subjects.find((s) => s.name === 'Physics 1st Paper');
  const chem = st.subjects.find((s) => s.name === 'Chemistry 1st Paper');
  const math = st.subjects.find((s) => s.name === 'Higher Mathematics 1st Paper');
  const mk = (subjectId, number, name, priority, status, pct) => ({
    id: uid('ch'), subjectId, number, name, priority, status,
    completionPct: pct, cqStatus: pct >= 50 ? 'in-progress' : 'not-started',
    mcqStatus: pct >= 30 ? 'in-progress' : 'not-started',
    writtenStatus: 'not-started', revisionStatus: 'not-started',
    notes: 'DEMO chapter — delete or edit. Add your real chapters via Subjects → Add chapter.',
    order: number, createdAt: nowISO(), updatedAt: nowISO(),
  });
  if (phys) st.chapters.push(mk(phys.id, 1, 'DEMO: Physical World & Measurement', 'A', 'completed', 100));
  if (phys) st.chapters.push(mk(phys.id, 2, 'DEMO: Vector', 'A', 'in-progress', 45));
  if (chem) st.chapters.push(mk(chem.id, 1, 'DEMO: Laboratory Safety & Environment', 'B', 'in-progress', 20));
  if (math) st.chapters.push(mk(math.id, 1, 'DEMO: Matrix & Determinant', 'A', 'not-started', 0));
  // A few demo sessions over the past days
  const today = todayKey();
  [3, 2, 1, 0].forEach((daysAgo, i) => {
    const d = addDays(today, -daysAgo);
    const ch = st.chapters[i % st.chapters.length];
    if (ch) st.sessions.push({
      id: uid('ses'), subjectId: ch.subjectId, chapterId: ch.id,
      startedAt: nowISO(), endedAt: nowISO(), durationMinutes: 45 + i * 15,
      mode: 'manual', source: 'demo', note: 'DEMO session', date: d,
    });
  });
  st.demoLoaded = true;
  saveNow();
}
function clearDemoData() {
  const st = getState();
  st.sessions = st.sessions.filter((s) => s.source !== 'demo');
  st.chapters = st.chapters.filter((c) => !String(c.notes || '').startsWith('DEMO'));
  st.demoLoaded = false;
  saveNow();
}

/* ---------- Node test export ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    defaultState, STATE_VERSION, STORAGE_KEY,
    loadState, persist, save, saveNow, getState, resetState,
    subjectById, chapterById, chaptersOf, subjectName, chapterLabel,
    sessionsOn, minutesOn, minutesInWeek, minutesInMonth, chapterMinutes,
    subjectMinutes, lastStudiedChapter, studyDateKeys,
    subjectCompletion, overallCompletion, weakestSubjects,
    recordSession, scheduleRevisions, dueRevisions, completeRevision,
    tasksOn, carryOverMissed, practiceForChapter, practiceTotals,
    exportJSON, importJSON, exportCSV, download, loadDemoData, clearDemoData,
  };
}
