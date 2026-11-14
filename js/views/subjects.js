/* HSC 2027 Smart Study App — views/subjects.js
 * Subject list, subject detail (chapter list), chapter detail, and the
 * chapter admin (add/edit/delete/reorder/import). Chapter data is always
 * user-entered — the app never invents official syllabus chapters.
 */
'use strict';

function renderSubjects() {
  const st = getState();
  const sci = st.subjects.filter((s) => s.group === 'science');
  const oth = st.subjects.filter((s) => s.group === 'other');
  const card = (s) => {
    const c = subjectCompletion(s.id);
    const mins = subjectMinutes(s.id);
    return `<button class="subject-card" data-nav="subject" data-id="${esc(s.id)}">
      <span class="dot lg" style="background:${esc(s.color)}"></span>
      <span class="subject-card-body">
        <strong>${esc(s.name)}</strong>
        <span class="muted small">${c.total} chapters · ${c.pct}% complete · ${formatDuration(mins)} studied</span>
        <span class="progress-bar sm"><span class="progress-fill" style="width:${c.pct}%"></span></span>
      </span>
      <span class="chev">›</span>
    </button>`;
  };
  return `<div class="page">
    <div class="page-head"><h1>Subjects</h1>
      <button class="btn small" id="add-subject-btn">+ Custom subject</button></div>
    <p class="muted small">Chapters are added by you — official syllabus data is never invented. Use the import tool to bulk-add chapters.</p>
    <h2 class="section-title">Science</h2>
    <div class="subject-list">${sci.map(card).join('')}</div>
    <h2 class="section-title">Other subjects</h2>
    <div class="subject-list">${oth.map(card).join('')}</div>
    <section class="card">
      <h2>Chapter import</h2>
      <p class="muted small">Import chapters from CSV or JSON. CSV columns: <code>subject,number,name,priority</code>. JSON: an array of <code>{subject, number, name, priority}</code>. Subjects must match existing subject names.</p>
      <label class="btn small" for="chapter-import-file">Import chapters file</label>
      <input type="file" id="chapter-import-file" accept=".csv,.json,text/csv,application/json" hidden>
      <button class="btn small ghost" id="download-chapter-template">Download CSV template</button>
    </section>
  </div>`;
}

function renderSubjectDetail(subjectId) {
  const s = subjectById(subjectId);
  if (!s) return `<div class="page"><p class="muted">Subject not found.</p><button class="btn" data-nav="subjects">Back</button></div>`;
  const chs = chaptersOf(subjectId);
  const c = subjectCompletion(subjectId);
  const mins = subjectMinutes(subjectId);
  return `<div class="page">
    <button class="btn small ghost" data-nav="subjects">← Subjects</button>
    <div class="page-head"><h1><span class="dot lg" style="background:${esc(s.color)}"></span> ${esc(s.name)}</h1>
      <button class="btn small primary" id="add-chapter-btn">+ Add chapter</button></div>
    <p class="muted">${c.done}/${c.total} chapters complete · ${c.pct}% · ${formatDuration(mins)} studied</p>
    <div class="progress-bar"><div class="progress-fill" style="width:${c.pct}%"></div></div>
    ${chs.length ? `<ul class="chapter-list">${chs.map((ch) => chapterRow(ch)).join('')}</ul>`
      : `<div class="empty"><p>No chapters yet for this subject.</p><p class="muted small">Add chapters manually or import them. Chapter names are never guessed by the app.</p><button class="btn primary" id="add-chapter-btn-2">+ Add first chapter</button></div>`}
    <div class="row gap wrap">
      <button class="btn small ghost" id="edit-subject-btn">Rename subject</button>
      <button class="btn small danger-ghost" id="delete-subject-btn">Delete subject</button>
    </div>
  </div>`;
}

function chapterRow(ch) {
  const mins = chapterMinutes(ch.id);
  const statusLabel = { 'not-started': 'Not started', 'in-progress': 'In progress', 'completed': 'Completed' }[ch.status] || ch.status;
  return `<li class="chapter-row">
    <button class="chapter-main" data-nav="chapter" data-id="${esc(ch.id)}">
      <span class="badge prio-${esc(ch.priority || 'B')}">${esc(ch.priority || 'B')}</span>
      <span class="chapter-body">
        <strong>${esc(ch.number ? 'Ch ' + ch.number + ': ' : '')}${esc(ch.name)}</strong>
        <span class="muted small">${esc(statusLabel)} · ${ch.status === 'completed' ? 100 : (ch.completionPct || 0)}% · ${formatDuration(mins)} studied</span>
        <span class="progress-bar sm"><span class="progress-fill" style="width:${ch.status === 'completed' ? 100 : (ch.completionPct || 0)}%"></span></span>
      </span>
      <span class="chev">›</span>
    </button>
    <div class="chapter-actions">
      <button class="btn small ghost" data-move-chapter="${esc(ch.id)}" data-dir="-1" aria-label="Move up">↑</button>
      <button class="btn small ghost" data-move-chapter="${esc(ch.id)}" data-dir="1" aria-label="Move down">↓</button>
    </div>
  </li>`;
}

function renderChapterDetail(chapterId) {
  const ch = chapterById(chapterId);
  if (!ch) return `<div class="page"><p class="muted">Chapter not found.</p><button class="btn" data-nav="subjects">Back</button></div>`;
  const s = subjectById(ch.subjectId);
  const mins = chapterMinutes(ch.id);
  const mcq = practiceTotals(chapterId, 'mcq');
  const cq = practiceTotals(chapterId, 'cq');
  const wr = practiceTotals(chapterId, 'written');
  const revs = getState().revisions.filter((r) => r.chapterId === chapterId).sort((a, b) => a.cycle - b.cycle);
  const chapterNotes = getState().notes.filter((n) => n.chapterId === chapterId);
  const chapterFormulas = getState().formulas.filter((f) => f.chapterId === chapterId);
  const chapterVideos = getState().resources.filter((r) => r.chapterId === chapterId);
  const chapterWeak = getState().weaknesses.filter((w) => w.chapterId === chapterId);
  const statusOpts = [['not-started', 'Not started'], ['in-progress', 'In progress'], ['completed', 'Completed']];
  const prepOpts = [['not-started', 'Not started'], ['in-progress', 'In progress'], ['done', 'Done']];
  const sel = (cur, opts) => opts.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');

  return `<div class="page">
    <button class="btn small ghost" data-nav="subject" data-id="${esc(ch.subjectId)}">← ${esc(s ? s.name : 'Subject')}</button>
    <div class="page-head"><h1>${esc(ch.number ? 'Ch ' + ch.number + ': ' : '')}${esc(ch.name)}</h1>
      <span class="badge prio-${esc(ch.priority || 'B')}">Priority ${esc(ch.priority || 'B')}</span></div>
    <p class="muted">${formatDuration(mins)} studied · ${ch.status === 'completed' ? 100 : (ch.completionPct || 0)}% complete</p>

    <section class="card">
      <h2>Progress</h2>
      <label class="field"><span>Study status</span>
        <select id="ch-status">${sel(ch.status, statusOpts)}</select></label>
      <label class="field"><span>Completion: <strong id="ch-pct-label">${ch.completionPct || 0}%</strong></span>
        <input type="range" id="ch-pct" min="0" max="100" step="5" value="${ch.completionPct || 0}"></label>
      <label class="field"><span>CQ preparation</span><select id="ch-cq">${sel(ch.cqStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span>MCQ preparation</span><select id="ch-mcq">${sel(ch.mcqStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span>Written practice</span><select id="ch-written">${sel(ch.writtenStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span>Revision status</span><select id="ch-revision">${sel(ch.revisionStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span>Personal notes</span>
        <textarea id="ch-notes" rows="3" placeholder="Your own notes for this chapter…">${esc(ch.notes || '')}</textarea></label>
      <div class="row gap wrap">
        <button class="btn primary" id="ch-save">Save progress</button>
        <button class="btn" id="ch-complete">Mark completed</button>
        <button class="btn" data-nav="focus" data-chapter="${esc(ch.id)}">▶ Study this chapter</button>
      </div>
      <p class="muted small">Completing a chapter automatically schedules spaced revisions (${esc((getState().settings.revisionIntervals || []).join(', '))} days — configurable in Settings).</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Practice summary</h2><button class="btn small ghost" data-nav="practice" data-chapter="${esc(ch.id)}">Record practice</button></div>
      <ul class="plain-list">
        <li>MCQ: ${mcq.attempted} attempted · accuracy ${mcq.accuracy === null ? '—' : mcq.accuracy + '%'} · ${mcq.sessions} sessions</li>
        <li>CQ: ${cq.attempted} attempted · marks ${cq.marks}/${cq.totalMarks} · ${cq.sessions} sessions</li>
        <li>Written: ${wr.attempted} attempted · ${wr.sessions} sessions</li>
      </ul>
    </section>

    <section class="card">
      <div class="card-head"><h2>Chapter test results</h2><button class="btn small ghost" data-nav="exams">Exams</button></div>
      ${(() => {
        const st = getState();
        const results = st.examResults.map((r) => ({ r, exam: st.exams.find((e) => e.id === r.examId && e.chapterId === chapterId) })).filter((x) => x.exam);
        return results.length ? `<ul class="plain-list">${results.map(({ r, exam }) => `<li>${esc(exam.name)} · ${esc(formatDate(r.date))} · ${esc(r.obtainedMarks)}/${esc(exam.totalMarks)} (${esc(r.grade || '')})</li>`).join('')}</ul>` : '<p class="muted">No chapter test results recorded.</p>';
      })()}
    </section>

    <section class="card">
      <div class="card-head"><h2>Revisions</h2><button class="btn small ghost" data-nav="revisions">All revisions</button></div>
      ${revs.length ? `<ul class="plain-list">${revs.map((r) => `<li>Cycle ${r.cycle}: due ${esc(formatDate(r.dueDate))} — ${r.completedAt ? 'done' : (r.dueDate <= todayKey() ? 'OVERDUE' : 'pending')}</li>`).join('')}</ul>`
      : `<p class="muted">No revisions scheduled. Complete this chapter to start the spaced-revision cycle.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Linked items</h2></div>
      <ul class="plain-list">
        <li>Notes: ${chapterNotes.length} · <button class="link" data-nav="notes" data-chapter="${esc(ch.id)}">Add note</button></li>
        <li>Formulas: ${chapterFormulas.length} · <button class="link" data-nav="formulas" data-chapter="${esc(ch.id)}">Add formula</button></li>
        <li>Videos: ${chapterVideos.length} · <button class="link" data-nav="library" data-chapter="${esc(ch.id)}">Add video</button></li>
        <li>Weaknesses: ${chapterWeak.length} · <button class="link" data-nav="weaknesses" data-chapter="${esc(ch.id)}">Add weakness</button></li>
      </ul>
    </section>

    <section class="card danger-zone">
      <h2>Chapter admin</h2>
      <div class="row gap wrap">
        <button class="btn small" id="ch-edit">Edit chapter</button>
        <button class="btn small danger-ghost" id="ch-delete">Delete chapter</button>
      </div>
    </section>
  </div>`;
}

/* ---------- Chapter / subject forms (modal) ---------- */
function chapterFormHTML(ch, subjectId) {
  const subjects = getState().subjects;
  return `<form id="chapter-form" class="form">
    <label class="field"><span>Subject</span>
      <select name="subjectId">${subjects.map((s) => `<option value="${esc(s.id)}" ${ch && ch.subjectId === s.id ? 'selected' : (!ch && subjectId === s.id ? 'selected' : '')}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Chapter number</span><input name="number" type="number" min="1" value="${ch ? esc(ch.number || '') : ''}" placeholder="e.g. 2"></label>
    <label class="field"><span>Chapter name *</span><input name="name" required value="${ch ? esc(ch.name) : ''}" placeholder="Enter the chapter name from your textbook"></label>
    <label class="field"><span>Priority (your personal priority, not official)</span>
      <select name="priority">${['A', 'B', 'C'].map((p) => `<option ${ch && ch.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <div class="row gap"><button class="btn primary" type="submit">${ch ? 'Save chapter' : 'Add chapter'}</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveChapterFromForm(form, existingId) {
  const fd = new FormData(form);
  const name = sanitizeText(fd.get('name'), 300);
  if (!name) { toast('Chapter name is required.'); return false; }
  const st = getState();
  const subjectId = String(fd.get('subjectId'));
  const number = Number(fd.get('number')) || null;
  const priority = ['A', 'B', 'C'].includes(fd.get('priority')) ? fd.get('priority') : 'B';
  if (existingId) {
    const ch = chapterById(existingId);
    if (!ch) return false;
    if (ch.subjectId !== subjectId && ['tasks', 'sessions', 'revisions', 'practice', 'exams', 'notes', 'formulas', 'resources', 'weaknesses', 'questionBank'].some((key) => st[key].some((item) => item.chapterId === ch.id))) { toast('Remove or reassign linked records before changing the chapter subject.'); return false; }
    Object.assign(ch, { subjectId, number, name, priority, updatedAt: nowISO() });
  } else {
    const order = chaptersOf(subjectId).length;
    st.chapters.push({
      id: uid('ch'), subjectId, number, name, priority,
      status: 'not-started', completionPct: 0,
      cqStatus: 'not-started', mcqStatus: 'not-started',
      writtenStatus: 'not-started', revisionStatus: 'not-started',
      notes: '', order, createdAt: nowISO(), updatedAt: nowISO(),
    });
  }
  save();
  return true;
}

function importChaptersFromText(text, filename) {
  const st = getState();
  let added = 0, skipped = 0;
  const byName = new Map(st.subjects.map((s) => [s.name.toLowerCase(), s]));
  const addRow = (subjectName, number, name, priority) => {
    const s = byName.get(String(subjectName || '').trim().toLowerCase());
    if (!s || !String(name || '').trim()) { skipped++; return; }
    if (chaptersOf(s.id).some((c) => c.name.trim().toLowerCase() === String(name).trim().toLowerCase())) { skipped++; return; }
    const order = chaptersOf(s.id).length;
    st.chapters.push({
      id: uid('ch'), subjectId: s.id, number: Number(number) || null,
      name: sanitizeText(name, 300),
      priority: ['A', 'B', 'C'].includes(String(priority).toUpperCase()) ? String(priority).toUpperCase() : 'B',
      status: 'not-started', completionPct: 0,
      cqStatus: 'not-started', mcqStatus: 'not-started',
      writtenStatus: 'not-started', revisionStatus: 'not-started',
      notes: '', order, createdAt: nowISO(), updatedAt: nowISO(),
    });
    added++;
  };
  if (/\.json$/i.test(filename || '')) {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('JSON must be an array of chapter objects.');
    arr.forEach((o) => addRow(o.subject, o.number, o.name, o.priority));
  } else {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('CSV file is empty.');
    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const idx = {
      subject: header.indexOf('subject'), number: header.indexOf('number'),
      name: header.indexOf('name'), priority: header.indexOf('priority'),
    };
    if (idx.subject < 0 || idx.name < 0) throw new Error('CSV needs "subject" and "name" columns.');
    rows.slice(1).forEach((r) => addRow(r[idx.subject], r[idx.number], r[idx.name], r[idx.priority]));
  }
  save();
  return { added, skipped };
}
