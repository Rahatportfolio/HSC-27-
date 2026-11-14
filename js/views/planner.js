/* HSC 2027 Smart Study App — views/planner.js
 * Daily / weekly / monthly planner with carryover, deadlines, priority
 * ordering, rest scheduling and planned-vs-actual comparison.
 */
'use strict';

let plannerMode = 'day'; // day | week | month
let plannerCursor = todayKey();

function renderPlanner() {
  const st = getState();
  const target = st.settings.dailyTargetMinutes || 480;
  const tabs = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]
    .map(([m, l]) => `<button class="tab ${plannerMode === m ? 'active' : ''}" data-planner-mode="${m}">${l}</button>`).join('');

  let body = '';
  if (plannerMode === 'day') body = plannerDayView(plannerCursor, target);
  else if (plannerMode === 'week') body = plannerWeekView(weekStartKey(plannerCursor), target);
  else body = plannerMonthView(plannerCursor, target);

  return `<div class="page">
    <div class="page-head"><h1 data-i18n="planner">Planner</h1>
      <button class="btn small primary" id="add-task-btn">+ Add task</button></div>
    <div class="tabs">${tabs}</div>
    <div class="row gap">
      <button class="btn small ghost" id="planner-prev">←</button>
      <button class="btn small ghost" id="planner-today">Today</button>
      <button class="btn small ghost" id="planner-next">→</button>
    </div>
    ${body}
  </div>`;
}

function taskItem(t) {
  return `<li class="task-item ${t.status === 'done' ? 'done' : ''}">
    <input type="checkbox" data-task-toggle="${esc(t.id)}" ${t.status === 'done' ? 'checked' : ''} aria-label="Mark task done">
    <div class="task-body">
      <strong>${esc(t.title)}</strong>
      <span class="muted small">${t.type === 'rest' ? 'Break' : esc(subjectName(t.subjectId))}${t.startTime ? ' · ' + esc(t.startTime) : ''}${t.chapterId ? ' · ' + esc(chapterLabel(t.chapterId)) : ''} · planned ${formatDuration(t.plannedMinutes || 0)}${t.deadline ? ' · deadline ' + esc(formatDate(t.deadline)) : ''}${t.status === 'carried' ? ' · carried over' : ''}${t.originalDate ? ' · originally ' + esc(formatDate(t.originalDate)) : ''}</span>
    </div>
    <span class="badge prio-${esc(t.priority || 'B')}">${esc(t.priority || 'B')}</span>
    <button class="btn small ghost" data-task-edit="${esc(t.id)}" aria-label="Edit task">✎</button>
    <button class="btn small ghost" data-task-reschedule="${esc(t.id)}" aria-label="Reschedule task">↪</button>
    <button class="btn small ghost" data-task-delete="${esc(t.id)}" aria-label="Delete task">✕</button>
  </li>`;
}

function plannerDayView(dateKey, target) {
  const tasks = tasksOn(dateKey);
  const planned = tasks.filter((t) => t.type !== 'rest').reduce((a, t) => a + (t.plannedMinutes || 0), 0);
  const actual = minutesOn(dateKey);
  const isToday = dateKey === todayKey();
  return `<section class="card">
    <h2>${esc(formatDay(dateKey))}</h2>
    <p class="muted">Planned study ${formatDuration(planned)} · Studied ${formatDuration(actual)} · Daily target ${formatDuration(target)}</p>
    <p class="muted small">Studied time is the total for the day; sessions are not assigned to individual tasks.</p>
    ${getState().settings.preferredStart && getState().settings.preferredEnd ? `<p class="muted small">Preferred study hours: ${esc(getState().settings.preferredStart)}–${esc(getState().settings.preferredEnd)} (no automatic reminder)</p>` : ''}
    <div class="progress-bar"><div class="progress-fill" style="width:${pct(actual, target)}%"></div></div>
    ${tasks.length ? `<ul class="task-list">${tasks.map(taskItem).join('')}</ul>`
      : `<p class="muted">No tasks for this day. Add study, revision, test or rest tasks.</p>`}
    ${isToday ? `<p class="muted small">Unfinished tasks from previous days are automatically carried to today.</p>` : ''}
  </section>`;
}

function plannerWeekView(wStart, target) {
  let rows = '';
  let weekPlanned = 0, weekActual = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(wStart, i);
    const tasks = tasksOn(d);
    const planned = tasks.filter((t) => t.type !== 'rest').reduce((a, t) => a + (t.plannedMinutes || 0), 0);
    const actual = minutesOn(d);
    weekPlanned += planned; weekActual += actual;
    rows += `<div class="week-day ${d === todayKey() ? 'today' : ''}">
      <div class="week-day-head"><strong>${esc(formatDate(d))}</strong><span class="muted small">${esc(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(parseDateKey(d)))}</span></div>
      <p class="muted small">Planned ${formatDuration(planned)} · Studied ${formatDuration(actual)}</p>
      ${tasks.length ? `<ul class="task-list compact">${tasks.map(taskItem).join('')}</ul>` : `<p class="muted small">—</p>`}
    </div>`;
  }
  return `<section class="card">
    <h2>Week of ${esc(formatDate(wStart))}</h2>
    <p class="muted">Planned ${formatDuration(weekPlanned)} · Studied ${formatDuration(weekActual)} · Target ${formatDuration(target * 7)}</p>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct(weekActual, target * 7)}%"></div></div>
    ${rows}
  </section>`;
}

function plannerMonthView(cursor, target) {
  const mKey = monthKey(cursor);
  const [y, m] = mKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let totalPlanned = 0, totalActual = 0;
  let cells = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const tasks = tasksOn(key);
    const planned = tasks.filter((t) => t.type !== 'rest').reduce((a, t) => a + (t.plannedMinutes || 0), 0);
    const actual = minutesOn(key);
    totalPlanned += planned; totalActual += actual;
    cells += `<button class="cal-cell ${key === todayKey() ? 'today' : ''} ${actual >= target ? 'hit' : ''}" data-planner-jump="${key}">
      <span>${d}</span><span class="cal-min">${actual ? formatDuration(actual) : ''}</span>
      <span class="cal-tasks">${tasks.length ? tasks.length + ' task' + (tasks.length > 1 ? 's' : '') : ''}</span></button>`;
  }
  return `<section class="card">
    <h2>${esc(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(parseDateKey(mKey + '-01')))}</h2>
    <p class="muted">Planned ${formatDuration(totalPlanned)} · Studied ${formatDuration(totalActual)}</p>
    <div class="cal-grid">${cells}</div>
    <p class="muted small">Tap a day to open it. Green days met the daily target.</p>
  </section>`;
}

function taskFormHTML(prefillDate, task = null) {
  const st = getState();
  const sel = (actual, expected) => actual === expected ? 'selected' : '';
  return `<form id="task-form" class="form" data-chapter="${esc(task?.chapterId || '')}">
    <label class="field"><span>Task title *</span><input name="title" maxlength="300" required value="${esc(task?.title || '')}" placeholder="e.g. Physics Ch 2 — CQ practice"></label>
    <label class="field"><span>Subject</span>
      <select name="subjectId"><option value="">—</option>${st.subjects.map((s) => `<option value="${esc(s.id)}" ${sel(task?.subjectId, s.id)}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Chapter (optional)</span><select name="chapterId"><option value="">—</option></select></label>
    <label class="field"><span>Date</span><input name="date" type="date" required value="${esc(task?.date || prefillDate || todayKey())}"></label>
    <label class="field"><span>Start time (optional)</span><input name="startTime" type="time" value="${esc(task?.startTime || '')}"></label>
    <label class="field"><span>Planned minutes (1–1440)</span><input name="plannedMinutes" type="number" min="1" max="1440" step="1" required value="${esc(task?.plannedMinutes ?? 60)}"></label>
    <label class="field"><span>Type</span>
      <select name="type">${[['study','Study'],['revision','Revision'],['test','Test'],['rest','Rest / break']].map(([v,l]) => `<option value="${v}" ${sel(task?.type || 'study',v)}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Priority</span>
      <select name="priority">${['A','B','C'].map(p => `<option value="${p}" ${sel(task?.priority || 'B',p)}>${p}</option>`).join('')}</select></label>
    <label class="field"><span>Deadline (optional)</span><input name="deadline" type="date" value="${esc(task?.deadline || '')}"></label>
    <div class="row gap"><button class="btn primary" type="submit">${task ? 'Save task' : 'Add task'}</button>
    <button class="btn ghost" type="button" data-close-modal>Cancel</button></div>
  </form>`;
}

function saveTaskFromForm(form, existingId = null) {
  const fd = new FormData(form), st = getState();
  const title = sanitizeText(fd.get('title'), 300), date = String(fd.get('date') || '');
  const subjectId = String(fd.get('subjectId') || '') || null, chapterId = String(fd.get('chapterId') || '') || null;
  const chapter = chapterId && chapterById(chapterId);
  const startTime = String(fd.get('startTime') || ''), deadline = String(fd.get('deadline') || '') || null;
  const plannedMinutes = Number(fd.get('plannedMinutes')), type = String(fd.get('type') || ''), priority = String(fd.get('priority') || '');
  if (!title) { toast('Task title is required.'); return false; }
  if (!isValidDateKey(date) || (deadline && !isValidDateKey(deadline))) { toast('Enter valid dates.'); return false; }
  if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) { toast('Enter a valid start time.'); return false; }
  if (!Number.isInteger(plannedMinutes) || plannedMinutes < 1 || plannedMinutes > 1440) { toast('Planned minutes must be a whole number between 1 and 1440.'); return false; }
  if (subjectId && !subjectById(subjectId) || chapterId && (!chapter || chapter.subjectId !== subjectId)) { toast('Choose a matching subject and chapter.'); return false; }
  if (!['study','revision','test','rest'].includes(type) || !['A','B','C'].includes(priority)) { toast('Choose a valid type and priority.'); return false; }
  const values = {title, subjectId, chapterId, date, startTime, plannedMinutes, type, priority, deadline};
  if (existingId) {
    const task = st.tasks.find(t => t.id === existingId);
    if (!task) return false;
    const previous = {...task};
    Object.assign(task, values, {updatedAt:nowISO()});
    if (!save()) { Object.keys(task).forEach(key => delete task[key]); Object.assign(task, previous); return false; }
  } else {
    st.tasks.push({id:uid('task'), ...values, status:'pending', createdAt:nowISO()});
    if (!save()) { st.tasks.pop(); return false; }
  }
  return true;
}
