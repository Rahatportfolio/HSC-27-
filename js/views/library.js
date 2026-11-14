/* HSC 2027 Smart Study App — views/library.js
 * Learning library: notes, formulas, YouTube resources, CQ/MCQ practice,
 * exams, spaced revisions, weakness tracking, question bank.
 */
'use strict';

/* ================= NOTES ================= */
let notesFilter = { q: '', category: '', bookmarkedOnly: false };

function renderNotes(prefillChapterId) {
  const st = getState();
  let list = st.notes.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (notesFilter.q) {
    const q = notesFilter.q.toLowerCase();
    list = list.filter((n) => (n.title + ' ' + n.body + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(q));
  }
  if (notesFilter.category) list = list.filter((n) => n.category === notesFilter.category);
  if (notesFilter.bookmarkedOnly) list = list.filter((n) => n.bookmarked);
  if (prefillChapterId) list = list.filter((n) => n.chapterId === prefillChapterId);

  const cats = ['note', 'formula', 'definition', 'trick', 'pdf', 'board-question'];
  return `<div class="page">
    <div class="page-head"><h1>Notes &amp; documents</h1>
      <button class="btn small primary" id="add-note-btn">+ Add note</button></div>
    <div class="search-row">
      <input id="notes-search" type="search" placeholder="Search notes…" value="${esc(notesFilter.q)}" aria-label="Search notes">
      <select id="notes-category" aria-label="Category">
        <option value="">All categories</option>
        ${cats.map((c) => `<option value="${c}" ${notesFilter.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <button class="btn small ${notesFilter.bookmarkedOnly ? 'primary' : ''}" id="notes-bookmarked">★ Bookmarked</button>
    </div>
    ${list.length ? `<ul class="card-list">${list.map((n) => `
      <li class="card">
        <div class="row between">
          <strong>${esc(n.title)}</strong>
          <button class="btn small ghost" data-note-bookmark="${esc(n.id)}" aria-label="Bookmark">${n.bookmarked ? '★' : '☆'}</button>
        </div>
        <p class="muted small">${esc(subjectName(n.subjectId))}${n.chapterId ? ' · ' + esc(chapterLabel(n.chapterId)) : ''} · ${esc(n.category)}${(n.tags || []).length ? ' · ' + esc(n.tags.join(', ')) : ''}</p>
        ${n.url ? `<p><a href="${esc(sanitizeUrl(n.url))}" target="_blank" rel="noopener">Open document ↗</a></p>` : ''}
        <p class="note-body">${esc(n.body || '').replace(/\n/g, '<br>')}</p>
        <div class="row gap wrap">
          <button class="btn small" data-note-edit="${esc(n.id)}">Edit</button>
          <button class="btn small danger-ghost" data-note-delete="${esc(n.id)}">Delete</button>
        </div>
      </li>`).join('')}</ul>`
    : `<div class="empty"><p>No notes found.</p><p class="muted small">Add personal notes, formulas, definitions, tricks, PDF links and board-question references.</p></div>`}
  </div>`;
}

function noteFormHTML(note) {
  const st = getState();
  return `<form id="note-form" class="form">
    <label class="field"><span>Title *</span><input name="title" required value="${note ? esc(note.title) : ''}"></label>
    <label class="field"><span>Category</span>
      <select name="category">${['note', 'formula', 'definition', 'trick', 'pdf', 'board-question'].map((c) => `<option value="${c}" ${note && note.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>Subject</span>
      <select name="subjectId"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}" ${note && note.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Chapter (optional)</span>
      <select name="chapterId"><option value="">—</option>${st.chapters.map((c) => `<option value="${esc(c.id)}" ${note && note.chapterId === c.id ? 'selected' : ''}>${esc(subjectName(c.subjectId))} — ${esc(chapterLabel(c.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Content</span><textarea name="body" rows="5">${note ? esc(note.body || '') : ''}</textarea></label>
    <label class="field"><span>Document URL (for PDFs / board questions)</span><input name="url" type="url" value="${note ? esc(note.url || '') : ''}" placeholder="https://…"></label>
    <label class="field"><span>Tags (comma separated)</span><input name="tags" value="${note ? esc((note.tags || []).join(', ')) : ''}"></label>
    <div class="row gap"><button class="btn primary" type="submit">${note ? 'Save note' : 'Add note'}</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveNoteFromForm(form, existingId) {
  const fd = new FormData(form);
  const title = sanitizeText(fd.get('title'), 300);
  if (!title) { toast('Title is required.'); return false; }
  const data = {
    title,
    category: String(fd.get('category') || 'note'),
    subjectId: String(fd.get('subjectId') || '') || null,
    chapterId: String(fd.get('chapterId') || '') || null,
    body: sanitizeText(fd.get('body'), 20000),
    url: sanitizeUrl(fd.get('url')),
    tags: String(fd.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20),
    updatedAt: nowISO(),
  };
  const st = getState();
  if (existingId) {
    const n = st.notes.find((x) => x.id === existingId);
    if (!n) return false;
    Object.assign(n, data);
  } else {
    st.notes.push(Object.assign({ id: uid('note'), bookmarked: false, createdAt: nowISO() }, data));
  }
  save();
  return true;
}

/* ================= FORMULAS ================= */
let formulaFilter = { q: '', subject: '' };

function renderFormulas(prefillChapterId) {
  const st = getState();
  let list = st.formulas.slice().sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (a.title || '').localeCompare(b.title || ''));
  if (formulaFilter.q) {
    const q = formulaFilter.q.toLowerCase();
    list = list.filter((f) => (f.title + ' ' + f.content).toLowerCase().includes(q));
  }
  if (formulaFilter.subject) list = list.filter((f) => f.subject === formulaFilter.subject);
  if (prefillChapterId) list = list.filter((f) => f.chapterId === prefillChapterId);

  return `<div class="page">
    <div class="page-head"><h1>Formula library</h1>
      <button class="btn small primary" id="add-formula-btn">+ Add formula</button></div>
    <div class="search-row">
      <input id="formula-search" type="search" placeholder="Search formulas…" value="${esc(formulaFilter.q)}" aria-label="Search formulas">
      <select id="formula-subject" aria-label="Subject">
        <option value="">All subjects</option>
        ${st.subjects.map((s) => `<option value="${esc(s.id)}" ${formulaFilter.subject === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    ${list.length ? `<ul class="card-list">${list.map((f) => `
      <li class="card">
        <div class="row between"><strong>${esc(f.title)}</strong>
          <button class="btn small ghost" data-formula-fav="${esc(f.id)}" aria-label="Favorite">${f.favorite ? '★' : '☆'}</button></div>
        <p class="muted small">${esc(subjectName(f.subject))}${f.chapterId ? ' · ' + esc(chapterLabel(f.chapterId)) : ''}</p>
        <p class="note-body">${esc(f.content || '').replace(/\n/g, '<br>')}</p>
        <div class="row gap wrap">
          <button class="btn small" data-formula-edit="${esc(f.id)}">Edit</button>
          <button class="btn small danger-ghost" data-formula-delete="${esc(f.id)}">Delete</button>
        </div>
      </li>`).join('')}</ul>`
    : `<div class="empty"><p>No formulas found.</p><p class="muted small">Keep Physics, Chemistry, Higher Math formulas, Biology definitions, ICT concepts and grammar rules here.</p></div>`}
  </div>`;
}

function formulaFormHTML(f) {
  const st = getState();
  return `<form id="formula-form" class="form">
    <label class="field"><span>Title *</span><input name="title" required value="${f ? esc(f.title) : ''}" placeholder="e.g. Newton's second law"></label>
    <label class="field"><span>Subject *</span>
      <select name="subject" required><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}" ${f && f.subject === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Chapter (optional)</span>
      <select name="chapterId"><option value="">—</option>${st.chapters.map((c) => `<option value="${esc(c.id)}" ${f && f.chapterId === c.id ? 'selected' : ''}>${esc(subjectName(c.subjectId))} — ${esc(chapterLabel(c.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Formula / content *</span><textarea name="content" rows="4" required>${f ? esc(f.content || '') : ''}</textarea></label>
    <div class="row gap"><button class="btn primary" type="submit">${f ? 'Save' : 'Add'} formula</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveFormulaFromForm(form, existingId) {
  const fd = new FormData(form);
  const title = sanitizeText(fd.get('title'), 300);
  const content = sanitizeText(fd.get('content'), 10000);
  const subject = String(fd.get('subject') || '');
  if (!title || !content || !subject) { toast('Title, subject and content are required.'); return false; }
  const data = { title, content, subject, chapterId: String(fd.get('chapterId') || '') || null };
  const st = getState();
  if (existingId) {
    const f = st.formulas.find((x) => x.id === existingId);
    if (!f) return false;
    Object.assign(f, data);
  } else {
    st.formulas.push(Object.assign({ id: uid('frm'), favorite: false, createdAt: nowISO() }, data));
  }
  save();
  return true;
}

/* ================= YOUTUBE LIBRARY ================= */
let libraryFilter = { q: '', subject: '', bookmarkedOnly: false, unwatchedOnly: false };

function renderLibrary(prefillChapterId) {
  const st = getState();
  let list = st.resources.slice().sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (libraryFilter.q) {
    const q = libraryFilter.q.toLowerCase();
    list = list.filter((r) => (r.title + ' ' + r.channel + ' ' + r.description).toLowerCase().includes(q));
  }
  if (libraryFilter.subject) list = list.filter((r) => r.subjectId === libraryFilter.subject);
  if (libraryFilter.bookmarkedOnly) list = list.filter((r) => r.bookmarked);
  if (libraryFilter.unwatchedOnly) list = list.filter((r) => !r.watched);
  if (prefillChapterId) list = list.filter((r) => r.chapterId === prefillChapterId);

  return `<div class="page">
    <div class="page-head"><h1>Video library</h1>
      <button class="btn small primary" id="add-resource-btn">+ Add video</button></div>
    <p class="muted small">Links only — videos play on YouTube. Nothing is scraped.</p>
    <div class="search-row">
      <input id="library-search" type="search" placeholder="Search videos…" value="${esc(libraryFilter.q)}" aria-label="Search videos">
      <select id="library-subject" aria-label="Subject">
        <option value="">All subjects</option>
        ${st.subjects.map((s) => `<option value="${esc(s.id)}" ${libraryFilter.subject === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
      <button class="btn small ${libraryFilter.bookmarkedOnly ? 'primary' : ''}" id="library-bookmarked">★</button>
      <button class="btn small ${libraryFilter.unwatchedOnly ? 'primary' : ''}" id="library-unwatched">Unwatched</button>
    </div>
    ${list.length ? `<ul class="card-list">${list.map((r) => `
      <li class="card">
        <div class="row between"><strong>${esc(r.title)}</strong>
          <button class="btn small ghost" data-resource-bookmark="${esc(r.id)}" aria-label="Bookmark">${r.bookmarked ? '★' : '☆'}</button></div>
        <p class="muted small">${esc(subjectName(r.subjectId))}${r.chapterId ? ' · ' + esc(chapterLabel(r.chapterId)) : ''}${r.channel ? ' · ' + esc(r.channel) : ''}${r.rating ? ' · ★ ' + esc(r.rating) + '/5' : ''}${r.lastOpenedAt ? ' · opened ' + esc(formatDate(toDateKey(new Date(r.lastOpenedAt)))) : ''}</p>
        <p>${esc(r.description || '')}</p>
        <div class="row gap wrap">
          <a class="btn small primary" href="${esc(sanitizeUrl(r.url))}" data-resource-open="${esc(r.id)}" target="_blank" rel="noopener">▶ Watch</a>
          ${r.playlistUrl ? `<a class="btn small" href="${esc(sanitizeUrl(r.playlistUrl))}" data-resource-open="${esc(r.id)}" target="_blank" rel="noopener">Playlist</a>` : ''}
          <button class="btn small ${r.watched ? 'primary' : ''}" data-resource-watched="${esc(r.id)}">${r.watched ? '✓ Watched' : 'Mark watched'}</button>
          <button class="btn small" data-resource-edit="${esc(r.id)}">Edit</button>
          <button class="btn small danger-ghost" data-resource-delete="${esc(r.id)}">Delete</button>
        </div>
      </li>`).join('')}</ul>`
    : `<div class="empty"><p>No videos found.</p><p class="muted small">Add YouTube links per subject/chapter with teacher or channel names.</p></div>`}
  </div>`;
}

function resourceFormHTML(r) {
  const st = getState();
  return `<form id="resource-form" class="form">
    <label class="field"><span>Title *</span><input name="title" required value="${r ? esc(r.title) : ''}"></label>
    <label class="field"><span>YouTube URL *</span><input name="url" type="url" required value="${r ? esc(sanitizeUrl(r.url)) : ''}" placeholder="https://www.youtube.com/watch?v=…"></label>
    <label class="field"><span>Teacher / channel</span><input name="channel" value="${r ? esc(r.channel || '') : ''}"></label>
    <label class="field"><span>Playlist URL</span><input name="playlistUrl" type="url" value="${r ? esc(r.playlistUrl || '') : ''}"></label>
    <label class="field"><span>Subject</span>
      <select name="subjectId"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}" ${r && r.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Chapter (optional)</span>
      <select name="chapterId"><option value="">—</option>${st.chapters.map((c) => `<option value="${esc(c.id)}" ${r && r.chapterId === c.id ? 'selected' : ''}>${esc(subjectName(c.subjectId))} — ${esc(chapterLabel(c.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Description</span><textarea name="description" rows="3">${r ? esc(r.description || '') : ''}</textarea></label>
    <label class="field"><span>Your rating (1–5)</span><input name="rating" type="number" min="1" max="5" value="${r ? esc(r.rating || '') : ''}"></label>
    <div class="row gap"><button class="btn primary" type="submit">${r ? 'Save' : 'Add'} video</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveResourceFromForm(form, existingId) {
  const fd = new FormData(form);
  const title = sanitizeText(fd.get('title'), 300);
  const url = sanitizeUrl(fd.get('url'));
  if (!title || !url) { toast('Title and a valid YouTube URL are required.'); return false; }
  const data = {
    title, url,
    channel: sanitizeText(fd.get('channel'), 200),
    playlistUrl: sanitizeUrl(fd.get('playlistUrl')),
    subjectId: String(fd.get('subjectId') || '') || null,
    chapterId: String(fd.get('chapterId') || '') || null,
    description: sanitizeText(fd.get('description'), 2000),
    rating: clamp(Number(fd.get('rating')) || 0, 0, 5) || null,
  };
  const st = getState();
  if (existingId) {
    const r = st.resources.find((x) => x.id === existingId);
    if (!r) return false;
    Object.assign(r, data);
  } else {
    st.resources.push(Object.assign({ id: uid('res'), bookmarked: false, watched: false, createdAt: nowISO() }, data));
  }
  save();
  return true;
}

/* ================= PRACTICE (CQ / MCQ / written) ================= */
function renderPractice(prefillChapterId) {
  const st = getState();
  const list = st.practice.filter((p) => !prefillChapterId || p.chapterId === prefillChapterId).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="page">
    <div class="page-head"><h1>Practice tracker</h1>
      <button class="btn small primary" id="add-practice-btn">+ Record practice</button></div>
    <p class="muted small">Record MCQ, CQ and written practice per chapter. Manual CQ marks are supported. Mistakes go to your mistake notebook.</p>
    ${list.length ? `<ul class="card-list">${list.map((p) => {
      const acc = p.type === 'mcq' ? accuracy(p.correct, p.attempted) : null;
      return `<li class="card">
        <div class="row between"><strong>${esc(p.type.toUpperCase())} — ${esc(chapterLabel(p.chapterId))}</strong>
          <span class="badge">${esc(p.type)}</span></div>
        <p class="muted small">${esc(formatDate(p.date))} · ${esc(subjectName(p.subjectId))}${p.durationMinutes ? ' · ' + formatDuration(p.durationMinutes) : ''}</p>
        <p>${p.type === 'mcq'
          ? `${p.attempted} attempted · ${p.correct} correct · ${p.attempted - p.correct} wrong · accuracy ${acc === null ? '—' : acc + '%'}`
          : p.type === 'cq'
            ? `Marks ${p.marks ?? '—'}/${p.totalMarks ?? '—'} · ${p.attempted} question(s)`
            : `${p.attempted} written answer(s) practiced`}</p>
        ${p.mistakes && p.mistakes.length ? `<p class="muted small">Mistakes: ${p.mistakes.map((m) => esc(m.q)).join('; ')}</p>` : ''}
        ${p.note ? `<p class="muted small">${esc(p.note)}</p>` : ''}
        <div class="row gap wrap">
          <button class="btn small ${p.bookmarked ? 'primary' : ''}" data-practice-bookmark="${esc(p.id)}">${p.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}</button>
          <button class="btn small ${p.reattempted ? 'primary' : ''}" data-practice-reattempt="${esc(p.id)}">${p.reattempted ? '✓ Reattempted' : 'Mark reattempted'}</button>
          <button class="btn small danger-ghost" data-practice-delete="${esc(p.id)}">Delete</button>
        </div>
      </li>`;
    }).join('')}</ul>`
    : `<div class="empty"><p>No practice recorded yet.</p><p class="muted small">Record your first MCQ/CQ/written session to start tracking accuracy.</p></div>`}
    <section class="card">
      <h2>Question bank</h2>
      <p class="muted small">Your own questions (manual or imported). AI-generated questions are always labelled and never presented as board questions.</p>
      <div class="row gap wrap">
        <button class="btn small" id="add-question-btn">+ Add question</button>
        <button class="btn small ghost" id="export-questions-btn">Export JSON</button>
        <label class="btn small ghost" for="import-questions-file">Import JSON</label>
        <input type="file" id="import-questions-file" accept=".json,application/json" hidden>
      </div>
      ${st.questionBank.length ? `<ul class="plain-list">${st.questionBank.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 20).map((q) => `
        <li><strong>${esc(q.type.toUpperCase())}</strong> ${esc(q.question)} <span class="muted small">(${esc(q.source)})</span>
        <button class="btn small danger-ghost" data-question-delete="${esc(q.id)}">Delete</button></li>`).join('')}</ul>`
      : `<p class="muted small">Question bank is empty.</p>`}
    </section>
  </div>`;
}

function practiceFormHTML(prefillChapterId) {
  const st = getState();
  return `<form id="practice-form" class="form">
    <label class="field"><span>Chapter *</span>
      <select name="chapterId" required><option value="">—</option>${st.chapters.map((c) => `<option value="${esc(c.id)}" ${prefillChapterId === c.id ? 'selected' : ''}>${esc(subjectName(c.subjectId))} — ${esc(chapterLabel(c.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Type</span>
      <select name="type"><option value="mcq">MCQ</option><option value="cq">CQ</option><option value="written">Written answer</option></select></label>
    <label class="field"><span>Date</span><input name="date" type="date" value="${todayKey()}"></label>
    <label class="field"><span>Questions attempted</span><input name="attempted" type="number" min="0" value="10"></label>
    <label class="field"><span>Correct (MCQ)</span><input name="correct" type="number" min="0" value="0"></label>
    <label class="field"><span>CQ marks obtained (optional)</span><input name="marks" type="number" min="0" step="0.5"></label>
    <label class="field"><span>CQ total marks (optional)</span><input name="totalMarks" type="number" min="0" step="0.5"></label>
    <label class="field"><span>Time spent (minutes)</span><input name="durationMinutes" type="number" min="0"></label>
    <label class="field"><span>Mistakes (one per line)</span><textarea name="mistakes" rows="3" placeholder="Question or topic you got wrong…"></textarea></label>
    <label class="field"><span>Note</span><input name="note"></label>
    <div class="row gap"><button class="btn primary" type="submit">Save practice</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function savePracticeFromForm(form) {
  const fd = new FormData(form);
  const chapterId = String(fd.get('chapterId') || '');
  const ch = chapterById(chapterId);
  if (!ch) { toast('Please choose a chapter.'); return false; }
  const attempted = Math.max(0, Number(fd.get('attempted')) || 0);
  const correct = Math.min(attempted, Math.max(0, Number(fd.get('correct')) || 0));
  const mistakes = String(fd.get('mistakes') || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 50)
    .map((q) => ({ q, reason: '' }));
  getState().practice.push({
    id: uid('prc'), chapterId, subjectId: ch.subjectId,
    type: String(fd.get('type') || 'mcq'),
    date: isValidDateKey(String(fd.get('date'))) ? String(fd.get('date')) : todayKey(),
    attempted, correct,
    marks: fd.get('marks') === '' || fd.get('marks') === null ? null : Number(fd.get('marks')),
    totalMarks: fd.get('totalMarks') === '' || fd.get('totalMarks') === null ? null : Number(fd.get('totalMarks')),
    durationMinutes: Math.max(0, Number(fd.get('durationMinutes')) || 0),
    mistakes, bookmarked: false, reattempted: false,
    note: sanitizeText(fd.get('note'), 1000), createdAt: nowISO(),
  });
  // Mistakes also become tracked weaknesses
  mistakes.forEach((m) => {
    getState().weaknesses.push({
      id: uid('wk'), subjectId: ch.subjectId, chapterId,
      topic: m.q, type: String(fd.get('type') || 'other'), reason: '', correctionTask: 'Reattempt this question',
      status: 'active', practiceCount: 0, createdAt: nowISO(), updatedAt: nowISO(),
    });
  });
  save();
  return true;
}

/* ================= EXAMS ================= */
function renderExams() {
  const st = getState();
  const today = todayKey();
  const upcoming = st.exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = st.exams.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const resultsByExam = (examId) => st.examResults.filter((r) => r.examId === examId).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const examCard = (e) => {
    const results = resultsByExam(e.id);
    const daysLeft = daysBetween(today, e.date);
    return `<li class="card">
      <div class="row between"><strong>${esc(e.name)}</strong>
        <span class="badge">${daysLeft >= 0 ? daysLeft + 'd left' : 'done'}</span></div>
      <p class="muted small">${esc(formatDate(e.date))} · ${esc(e.scope)} · ${e.durationMinutes} min · ${e.totalMarks} marks${e.subjectId ? ' · ' + esc(subjectName(e.subjectId)) : ''}${e.chapterId ? ' · ' + esc(chapterLabel(e.chapterId)) : ''}${e.format ? ' · ' + esc(e.format) : ''}</p>
      ${results.length ? `<ul class="plain-list">${results.map((r) => `<li>${esc(formatDate(r.date))}: ${r.obtainedMarks}/${e.totalMarks} (${esc(r.grade || '')})${r.notes ? ' — ' + esc(r.notes) : ''}</li>`).join('')}</ul>` : `<p class="muted small">No result recorded yet.</p>`}
      <div class="row gap wrap">
        <button class="btn small primary" data-result-add="${esc(e.id)}">Record result</button>
        <button class="btn small" data-exam-start="${esc(e.id)}">Start timed test</button>
        <button class="btn small danger-ghost" data-exam-delete="${esc(e.id)}">Delete exam</button>
      </div>
    </li>`;
  };

  return `<div class="page">
    <div class="page-head"><h1>Exams</h1>
      <button class="btn small primary" id="add-exam-btn">+ Schedule exam</button></div>
    ${st.activeExam ? `<section class="card"><h2>Timed test in progress</h2><p>${esc((st.exams.find((e) => e.id === st.activeExam.examId) || {}).name || 'Exam')} · <strong id="exam-timer-display"></strong></p><p class="muted small">Use your own questions. The timer does not submit answers or record marks; enter your result yourself.</p><button class="btn" id="end-timed-exam">End timer</button></section>` : ''}
    <p class="muted small">Chapter tests, subject tests and full-syllabus model tests. Record results and add notes about weak chapters. No GPA prediction is made.</p>
    <h2 class="section-title">Upcoming</h2>
    ${upcoming.length ? `<ul class="card-list">${upcoming.map(examCard).join('')}</ul>` : `<p class="muted">No upcoming exams.</p>`}
    <h2 class="section-title">Past</h2>
    ${past.length ? `<ul class="card-list">${past.map(examCard).join('')}</ul>` : `<p class="muted">No past exams.</p>`}
  </div>`;
}

function examFormHTML() {
  const st = getState();
  return `<form id="exam-form" class="form">
    <label class="field"><span>Exam name *</span><input name="name" required placeholder="e.g. Physics 1st — Chapter 2 test"></label>
    <label class="field"><span>Scope</span>
      <select name="scope"><option value="chapter">Chapter test</option><option value="subject">Subject test</option><option value="full">Full syllabus model test</option></select></label>
    <label class="field"><span>Subject</span>
      <select name="subjectId"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Chapter (required for chapter tests)</span><select name="chapterId"><option value="">—</option>${st.chapters.map((c) => `<option value="${esc(c.id)}">${esc(subjectName(c.subjectId))} — ${esc(chapterLabel(c.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Exam format</span><select name="format"><option value="mixed">Mixed</option><option value="mcq">MCQ</option><option value="written">Written</option></select></label>
    <label class="field"><span>Date</span><input name="date" type="date" value="${todayKey()}" required></label>
    <label class="field"><span>Duration (minutes)</span><input name="durationMinutes" type="number" min="1" value="60"></label>
    <label class="field"><span>Total marks</span><input name="totalMarks" type="number" min="1" value="25"></label>
    <div class="row gap"><button class="btn primary" type="submit">Schedule exam</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveExamFromForm(form) {
  const fd = new FormData(form);
  const name = sanitizeText(fd.get('name'), 300);
  const date = String(fd.get('date') || '');
  if (!name || !isValidDateKey(date)) { toast('Name and a valid date are required.'); return false; }
  const scope = String(fd.get('scope') || 'chapter');
  const subjectId = String(fd.get('subjectId') || '') || null;
  const chapterId = String(fd.get('chapterId') || '') || null;
  const durationMinutes = Number(fd.get('durationMinutes'));
  const totalMarks = Number(fd.get('totalMarks'));
  const ch = chapterId ? chapterById(chapterId) : null;
  if (!['chapter', 'subject', 'full'].includes(scope) || (scope !== 'full' && !subjectById(subjectId)) || (scope === 'chapter' && (!ch || ch.subjectId !== subjectId))) { toast('Choose a matching subject and chapter for a chapter test.'); return false; }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || !Number.isFinite(totalMarks) || totalMarks <= 0) { toast('Enter valid duration and total marks.'); return false; }
  getState().exams.push({
    id: uid('exam'), name, date, scope,
    subjectId: scope === 'full' ? null : subjectId,
    chapterId: scope === 'chapter' ? chapterId : null,
    format: ['mixed', 'mcq', 'written'].includes(fd.get('format')) ? fd.get('format') : 'mixed',
    durationMinutes, totalMarks,
    createdAt: nowISO(),
  });
  save();
  return true;
}

function resultFormHTML(exam) {
  return `<form id="result-form" class="form">
    <p><strong>${esc(exam.name)}</strong> — ${exam.totalMarks} marks</p>
    <label class="field"><span>Marks obtained *</span><input name="obtainedMarks" type="number" min="0" max="${exam.totalMarks}" step="0.5" required></label>
    <label class="field"><span>Date</span><input name="date" type="date" value="${todayKey()}"></label>
    <label class="field"><span>Notes / weak chapters</span><textarea name="notes" rows="3" placeholder="Which chapters were weak?"></textarea></label>
    <div class="row gap"><button class="btn primary" type="submit">Save result</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveResultFromForm(form, examId) {
  const exam = getState().exams.find((e) => e.id === examId);
  if (!exam) return false;
  const fd = new FormData(form);
  const obtained = Number(fd.get('obtainedMarks'));
  if (fd.get('obtainedMarks') === '' || !Number.isFinite(obtained) || obtained < 0 || obtained > exam.totalMarks) { toast('Marks must be between 0 and total.'); return false; }
  const g = gradeForMarks(obtained, exam.totalMarks);
  getState().examResults.push({
    id: uid('res'), examId, obtainedMarks: obtained,
    grade: g.grade, date: isValidDateKey(String(fd.get('date'))) ? String(fd.get('date')) : todayKey(),
    notes: sanitizeText(fd.get('notes'), 2000), createdAt: nowISO(),
  });
  save();
  return true;
}

/* ================= REVISIONS ================= */
function renderRevisions() {
  const st = getState();
  const today = todayKey();
  const due = dueRevisions();
  const upcoming = st.revisions.filter((r) => !r.completedAt && r.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = st.revisions.filter((r) => r.completedAt).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 20);

  const row = (r, actions) => `<li class="card">
    <div class="row between"><strong>${esc(chapterLabel(r.chapterId))}</strong>
      <span class="badge ${r.completedAt ? 'ok' : (r.dueDate <= today ? 'overdue' : '')}">${r.completedAt ? 'done' : (r.dueDate <= today ? 'overdue' : 'due ' + formatDate(r.dueDate))}</span></div>
    <p class="muted small">${esc(subjectName(r.subjectId))} · Cycle ${r.cycle}${r.difficulty ? ' · difficulty ' + r.difficulty + '/5' : ''}</p>
    ${actions ? `<div class="row gap wrap">
      <button class="btn small primary" data-revision-done="${esc(r.id)}">Mark revised</button>
      <button class="btn small ghost" data-revision-difficult="${esc(r.id)}">Still difficult → repeat</button>
    </div>` : ''}
  </li>`;

  return `<div class="page">
    <div class="page-head"><h1>Revisions</h1></div>
    <p class="muted small">Spaced revision every ${esc((st.settings.revisionIntervals || []).join(', '))} days after completing a chapter. Intervals are configurable in Settings.</p>
    <h2 class="section-title">Due &amp; overdue (${due.length})</h2>
    ${due.length ? `<ul class="card-list">${due.map((r) => row(r, true)).join('')}</ul>` : `<p class="muted">Nothing due. Complete a chapter to schedule revisions.</p>`}
    <h2 class="section-title">Upcoming</h2>
    ${upcoming.length ? `<ul class="card-list">${upcoming.slice(0, 10).map((r) => row(r, false)).join('')}</ul>` : `<p class="muted">No upcoming revisions.</p>`}
    <h2 class="section-title">History</h2>
    ${done.length ? `<ul class="card-list">${done.map((r) => row(r, false)).join('')}</ul>` : `<p class="muted">No completed revisions yet.</p>`}
  </div>`;
}

/* ================= WEAKNESSES ================= */
function renderWeaknesses(prefillChapterId) {
  const st = getState();
  let list = st.weaknesses.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (prefillChapterId) list = list.filter((w) => w.chapterId === prefillChapterId);
  const active = list.filter((w) => w.status === 'active');
  const improving = list.filter((w) => w.status === 'improving');
  const resolved = list.filter((w) => w.status === 'resolved');

  const card = (w) => `<li class="card">
    <div class="row between"><strong>${esc(w.topic)}</strong>
      <span class="badge ${w.status === 'resolved' ? 'ok' : ''}">${esc(w.status)}</span></div>
    <p class="muted small">${esc(subjectName(w.subjectId))}${w.chapterId ? ' · ' + esc(chapterLabel(w.chapterId)) : ''} · ${esc(w.type)} · practiced ${w.practiceCount || 0}×</p>
    ${w.reason ? `<p class="muted small">Reason: ${esc(w.reason)}</p>` : ''}
    ${w.correctionTask ? `<p class="muted small">Correction task: ${esc(w.correctionTask)}</p>` : ''}
    <div class="row gap wrap">
      <button class="btn small" data-weakness-practice="${esc(w.id)}">Practiced +1</button>
      <button class="btn small" data-weakness-status="${esc(w.id)}" data-status="improving">Improving</button>
      <button class="btn small primary" data-weakness-status="${esc(w.id)}" data-status="resolved">Resolved</button>
      <button class="btn small danger-ghost" data-weakness-delete="${esc(w.id)}">Delete</button>
    </div>
  </li>`;

  return `<div class="page">
    <div class="page-head"><h1>Weaknesses &amp; mistakes</h1>
      <button class="btn small primary" id="add-weakness-btn">+ Add weakness</button></div>
    <p class="muted small">Track difficult topics, wrong MCQs and CQ mistakes with reasons and correction tasks.</p>
    <h2 class="section-title">Active (${active.length})</h2>
    ${active.length ? `<ul class="card-list">${active.map(card).join('')}</ul>` : `<p class="muted">No active weaknesses.</p>`}
    <h2 class="section-title">Improving (${improving.length})</h2>
    ${improving.length ? `<ul class="card-list">${improving.map(card).join('')}</ul>` : `<p class="muted">None.</p>`}
    <h2 class="section-title">Resolved (${resolved.length})</h2>
    ${resolved.length ? `<ul class="card-list">${resolved.map(card).join('')}</ul>` : `<p class="muted">None yet.</p>`}
  </div>`;
}

function weaknessFormHTML(prefillChapterId) {
  const st = getState();
  return `<form id="weakness-form" class="form">
    <label class="field"><span>Difficult topic *</span><input name="topic" required placeholder="e.g. Rotational motion — torque sign"></label>
    <label class="field"><span>Subject</span>
      <select name="subjectId"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Chapter (optional)</span>
      <select name="chapterId"><option value="">—</option>${st.chapters.map((c) => `<option value="${esc(c.id)}" ${prefillChapterId === c.id ? 'selected' : ''}>${esc(subjectName(c.subjectId))} — ${esc(chapterLabel(c.id))}</option>`).join('')}</select></label>
    <label class="field"><span>Type</span>
      <select name="type"><option value="concept">Concept</option><option value="mcq">MCQ mistake</option><option value="cq">CQ mistake</option><option value="other">Other</option></select></label>
    <label class="field"><span>Reason for mistake</span><textarea name="reason" rows="2" placeholder="e.g. Sign error, formula confusion…"></textarea></label>
    <label class="field"><span>Correction task</span><input name="correctionTask" placeholder="e.g. Solve 10 similar problems"></label>
    <div class="row gap"><button class="btn primary" type="submit">Add weakness</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveWeaknessFromForm(form) {
  const fd = new FormData(form);
  const topic = sanitizeText(fd.get('topic'), 300);
  if (!topic) { toast('Topic is required.'); return false; }
  getState().weaknesses.push({
    id: uid('wk'), topic,
    subjectId: String(fd.get('subjectId') || '') || null,
    chapterId: String(fd.get('chapterId') || '') || null,
    type: String(fd.get('type') || 'concept'),
    reason: sanitizeText(fd.get('reason'), 1000),
    correctionTask: sanitizeText(fd.get('correctionTask'), 500),
    status: 'active', practiceCount: 0, createdAt: nowISO(), updatedAt: nowISO(),
  });
  save();
  return true;
}
