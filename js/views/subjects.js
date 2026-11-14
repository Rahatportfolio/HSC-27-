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
    <div class="page-head"><h1 data-i18n="subjects">Subjects</h1>
      <button class="btn small" id="add-subject-btn">+ Custom subject</button></div>
    <p class="muted small">Chapters are added by you — official syllabus data is never invented. Use the import tool to bulk-add chapters.</p>
    <h2 class="section-title" data-i18n="extra0">Science</h2>
    <div class="subject-list">${sci.map(card).join('')}</div>
    <h2 class="section-title" data-i18n="extra1">Other subjects</h2>
    <div class="subject-list">${oth.map(card).join('')}</div>
    <section class="card">
      <h2 data-i18n="extra2">Chapter import</h2>
      <p class="muted small">Import chapters from CSV or JSON. CSV columns: <code>subject,number,name,priority</code>. JSON: an array of <code>{subject, number, name, priority}</code>. Subjects must uniquely match existing subject names. Invalid or duplicate rows are skipped; maximum 5,000 rows and 2,097,152 characters.</p>
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
      <button class="btn small ghost" id="edit-subject-btn" data-i18n="extra29">Rename subject</button>
      <button class="btn small danger-ghost" id="delete-subject-btn" data-i18n="extra30">Delete subject</button>
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
        <span class="muted small">${esc(statusLabel)} · ${esc(ch.status === 'completed' ? 100 : (ch.completionPct || 0))}% · ${formatDuration(mins)} studied</span>
        <span class="progress-bar sm"><span class="progress-fill" style="width:${esc(ch.status === 'completed' ? 100 : (ch.completionPct || 0))}%"></span></span>
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
    <p class="muted">${formatDuration(mins)} studied · ${esc(ch.status === 'completed' ? 100 : (ch.completionPct || 0))}% complete</p>

    <section class="card">
      <h2 data-i18n="extra3">Progress</h2>
      <label class="field"><span data-i18n="extra4">Study status</span>
        <select id="ch-status">${sel(ch.status, statusOpts)}</select></label>
      <label class="field"><span>Completion: <strong id="ch-pct-label">${esc(ch.completionPct || 0)}%</strong></span>
        <input type="range" id="ch-pct" min="0" max="100" step="5" value="${esc(ch.completionPct || 0)}"></label>
      <label class="field"><span data-i18n="extra18">CQ preparation</span><select id="ch-cq">${sel(ch.cqStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span data-i18n="extra19">MCQ preparation</span><select id="ch-mcq">${sel(ch.mcqStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span data-i18n="extra20">Written practice</span><select id="ch-written">${sel(ch.writtenStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span data-i18n="extra21">Revision status</span><select id="ch-revision">${sel(ch.revisionStatus || 'not-started', prepOpts)}</select></label>
      <label class="field"><span data-i18n="extra17">Personal notes</span>
        <textarea id="ch-notes" rows="3" placeholder="Your own notes for this chapter…">${esc(ch.notes || '')}</textarea></label>
      <div class="row gap wrap">
        <button class="btn primary" id="ch-save" data-i18n="extra25">Save progress</button>
        <button class="btn" id="ch-complete" data-i18n="extra26">Mark completed</button>
        <button class="btn" data-nav="focus" data-chapter="${esc(ch.id)}">▶ Study this chapter</button>
      </div>
      <p class="muted small">Completing a chapter automatically schedules spaced revisions (${esc((getState().settings.revisionIntervals || []).join(', '))} days — configurable in Settings).</p>
    </section>

    <section class="card">
      <div class="card-head"><h2 data-i18n="extra6">Practice summary</h2><button class="btn small ghost" data-nav="practice" data-chapter="${esc(ch.id)}">Record practice</button></div>
      <ul class="plain-list">
        <li>MCQ: ${esc(mcq.attempted)} attempted · accuracy ${mcq.accuracy === null ? '—' : mcq.accuracy + '%'} · ${mcq.sessions} sessions</li>
        <li>CQ: ${esc(cq.attempted)} attempted · marks ${esc(cq.marks)}/${esc(cq.totalMarks)} · ${cq.sessions} sessions</li>
        <li>Written: ${esc(wr.attempted)} attempted · ${wr.sessions} sessions</li>
      </ul>
    </section>

    <section class="card">
      <div class="card-head"><h2 data-i18n="extra7">Chapter test results</h2><button class="btn small ghost" data-nav="exams">Exams</button></div>
      ${(() => {
        const st = getState();
        const results = st.examResults.map((r) => ({ r, exam: st.exams.find((e) => e.id === r.examId && e.chapterId === chapterId) })).filter((x) => x.exam);
        return results.length ? `<ul class="plain-list">${results.map(({ r, exam }) => `<li>${esc(exam.name)} · ${esc(formatDate(r.date))} · ${esc(r.obtainedMarks)}/${esc(exam.totalMarks)} (${esc(r.grade || '')})</li>`).join('')}</ul>` : '<p class="muted">No chapter test results recorded.</p>';
      })()}
    </section>

    <section class="card">
      <div class="card-head"><h2 data-i18n="extra8">Revisions</h2><button class="btn small ghost" data-nav="revisions">All revisions</button></div>
      ${revs.length ? `<ul class="plain-list">${revs.map((r) => `<li>Cycle ${esc(r.cycle)}: due ${esc(formatDate(r.dueDate))} — ${r.completedAt ? 'done' : (r.dueDate <= todayKey() ? 'OVERDUE' : 'pending')}</li>`).join('')}</ul>`
      : `<p class="muted">No revisions scheduled. Complete this chapter to start the spaced-revision cycle.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><h2 data-i18n="extra9">Linked items</h2></div>
      <ul class="plain-list">
        <li>Notes: ${chapterNotes.length} · <button class="link" data-nav="notes" data-chapter="${esc(ch.id)}">Add note</button></li>
        <li>Formulas: ${chapterFormulas.length} · <button class="link" data-nav="formulas" data-chapter="${esc(ch.id)}">Add formula</button></li>
        <li>Videos: ${chapterVideos.length} · <button class="link" data-nav="library" data-chapter="${esc(ch.id)}">Add video</button></li>
        <li>Weaknesses: ${chapterWeak.length} · <button class="link" data-nav="weaknesses" data-chapter="${esc(ch.id)}" data-i18n="extra63">Add weakness</button></li>
      </ul>
    </section>

    <section class="card danger-zone">
      <h2 data-i18n="extra5">Chapter admin</h2>
      <div class="row gap wrap">
        <button class="btn small" id="ch-edit" data-i18n="extra27">Edit chapter</button>
        <button class="btn small danger-ghost" id="ch-delete" data-i18n="extra28">Delete chapter</button>
      </div>
    </section>
  </div>`;
}

/* ---------- Chapter / subject forms (modal) ---------- */
function chapterFormHTML(ch, subjectId) {
  const subjects = getState().subjects;
  return `<form id="chapter-form" class="form">
    <label class="field"><span data-i18n="extra10">Subject</span>
      <select name="subjectId">${subjects.map((s) => `<option value="${esc(s.id)}" ${ch && ch.subjectId === s.id ? 'selected' : (!ch && subjectId === s.id ? 'selected' : '')}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span data-i18n="extra15">Chapter number</span><input name="number" type="number" min="1" max="9999" step="1" value="${ch ? esc(ch.number || '') : ''}" placeholder="e.g. 2"></label>
    <label class="field"><span data-i18n="extra16">Chapter name *</span><input name="name" required maxlength="300" value="${ch ? esc(ch.name) : ''}" placeholder="Enter the chapter name from your textbook"></label>
    <label class="field"><span>Priority (your personal priority, not official)</span>
      <select name="priority">${['A', 'B', 'C'].map((p) => `<option ${ch && ch.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <div class="row gap"><button class="btn primary" type="submit">${ch ? 'Save chapter' : 'Add chapter'}</button>
    <button class="btn ghost" type="button" data-close-modal data-i18n="extra24">Cancel</button></div>
  </form>`;
}

function nextChapterOrder(subjectId, excludingId = null) {
  return chaptersOf(subjectId).filter(c => c.id !== excludingId).reduce((max, c) => Math.max(max, Number.isFinite(Number(c.order)) ? Number(c.order) : 0), -1) + 1;
}
function chapterNameKey(name) { return sanitizeText(name, 300).toLocaleLowerCase(); }

function saveChapterFromForm(form, existingId) {
  const fd = new FormData(form), st = getState();
  const name = sanitizeText(fd.get('name'), 300);
  const subjectId = String(fd.get('subjectId') || '');
  const numberText = String(fd.get('number') || '').trim();
  const number = numberText ? Number(numberText) : null;
  const priority = ['A', 'B', 'C'].includes(fd.get('priority')) ? fd.get('priority') : 'B';
  if (!name) { toast('Chapter name is required.'); return false; }
  if (!subjectById(subjectId)) { toast('Choose a valid subject.'); return false; }
  if (number !== null && (!Number.isInteger(number) || number < 1 || number > 9999)) { toast('Chapter number must be a whole number from 1 to 9999.'); return false; }
  if (chaptersOf(subjectId).some(c => c.id !== existingId && chapterNameKey(c.name) === chapterNameKey(name))) { toast('This subject already has a chapter with that name.'); return false; }
  if (existingId) {
    const ch = chapterById(existingId);
    if (!ch) return false;
    if (ch.subjectId !== subjectId && ['tasks', 'sessions', 'revisions', 'practice', 'exams', 'notes', 'formulas', 'resources', 'weaknesses', 'questionBank'].some((key) => st[key].some((item) => item.chapterId === ch.id))) { toast('Remove or reassign linked records before changing the chapter subject.'); return false; }
    if (ch.subjectId !== subjectId && focusState.chapterId === ch.id && (focusState.running || focusState.accumulatedMs > 0)) { toast('Stop the active focus timer before changing this chapter subject.'); return false; }
    const previous = { ...ch }, previousFocus = st.activeFocus, previousFocusSubject = focusState.subjectId;
    const order = ch.subjectId === subjectId ? ch.order : nextChapterOrder(subjectId, ch.id);
    Object.assign(ch, { subjectId, number, name, priority, order, updatedAt: nowISO() });
    if (focusState.chapterId === ch.id) {
      focusState.subjectId = subjectId;
      if (st.activeFocus && st.activeFocus.chapterId === ch.id) st.activeFocus = {...st.activeFocus, subjectId};
    }
    if (!save()) { Object.assign(ch, previous); st.activeFocus = previousFocus; focusState.subjectId = previousFocusSubject; return false; }
  } else {
    const ch = {
      id: uid('ch'), subjectId, number, name, priority,
      status: 'not-started', completionPct: 0,
      cqStatus: 'not-started', mcqStatus: 'not-started',
      writtenStatus: 'not-started', revisionStatus: 'not-started',
      notes: '', order: nextChapterOrder(subjectId), createdAt: nowISO(), updatedAt: nowISO(),
    };
    st.chapters.push(ch);
    if (!save()) { st.chapters.pop(); return false; }
  }
  return true;
}

function importChaptersFromText(text, filename) {
  const st = getState();
  if (text.length > 2 * 1024 * 1024) throw new Error('Chapter import is limited to 2,097,152 characters.');
  let rows;
  if (/\.json$/i.test(filename || '')) {
    rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error('JSON must be an array of chapter objects.');
  } else {
    const csv = parseCSV(text, true);
    if (!csv.length) throw new Error('CSV file is empty.');
    const header = csv[0].map((h) => String(h).replace(/^\uFEFF/, '').trim().toLowerCase());
    const subject = header.indexOf('subject'), number = header.indexOf('number'), name = header.indexOf('name'), priority = header.indexOf('priority');
    if (subject < 0 || name < 0) throw new Error('CSV needs "subject" and "name" columns.');
    rows = csv.slice(1).map(r => ({subject:r[subject], number:r[number], name:r[name], priority:r[priority]}));
  }
  if (rows.length > 5000) throw new Error('Chapter import is limited to 5000 rows.');
  // Stage the whole import before touching state, so malformed rows or a failed save
  // cannot leave an invisible partial import in memory.
  const staged = [], seen = new Set(st.chapters.map(c => c.subjectId + '\0' + chapterNameKey(c.name)));
  const nextOrders = new Map(st.subjects.map(s => [s.id, nextChapterOrder(s.id)]));
  let skipped = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { skipped++; continue; }
    const subjectName = typeof row.subject === 'string' ? row.subject.trim().toLocaleLowerCase() : '';
    const matches = st.subjects.filter(s => s.name.trim().toLocaleLowerCase() === subjectName);
    const name = sanitizeText(row.name, 300);
    const numberText = row.number == null ? '' : String(row.number).trim();
    const number = numberText ? Number(numberText) : null;
    if (matches.length !== 1 || !name || (number !== null && (!Number.isInteger(number) || number < 1 || number > 9999))) { skipped++; continue; }
    const subject = matches[0], key = subject.id + '\0' + chapterNameKey(name);
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const order = nextOrders.get(subject.id);
    nextOrders.set(subject.id, order + 1);
    staged.push({id:uid('ch'), subjectId:subject.id, number, name,
      priority:['A','B','C'].includes(String(row.priority || '').trim().toUpperCase()) ? String(row.priority).trim().toUpperCase() : 'B',
      status:'not-started', completionPct:0, cqStatus:'not-started', mcqStatus:'not-started', writtenStatus:'not-started', revisionStatus:'not-started',
      notes:'', order, createdAt:nowISO(), updatedAt:nowISO()});
  }
  if (staged.length) {
    st.chapters.push(...staged);
    if (!save()) { st.chapters.splice(st.chapters.length - staged.length, staged.length); throw new Error('Unable to save; no chapters imported.'); }
  }
  return {added:staged.length, skipped};
}
