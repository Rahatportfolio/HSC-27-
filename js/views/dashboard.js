/* HSC 2027 Smart Study App — views/dashboard.js */
'use strict';

function renderDashboard() {
  const st = getState();
  const today = todayKey();
  const target = st.settings.dailyTargetMinutes || 480;
  const actual = minutesOn(today);
  const remaining = Math.max(0, target - actual);
  const dayPct = pct(actual, target);
  const weekStart = weekStartKey(today);
  const weekMinutes = minutesInWeek(weekStart);
  const weekTarget = target * 7;
  const overall = overallCompletion();
  const streak = calcStreak(studyDateKeys());
  const todayTasks = tasksOn(today);
  const pendingTasks = todayTasks.filter((t) => t.status !== 'done');
  const dueRevs = dueRevisions();
  const lastChapter = lastStudiedChapter();
  const weakest = weakestSubjects(3);
  const examDate = st.settings.examDate;
  const daysToExam = examDate && isValidDateKey(examDate) ? daysBetween(today, examDate) : null;

  const scheduledSubjects = [...new Set(todayTasks.map((t) => t.subjectId).filter(Boolean))];

  const motivational = pickMotivation(actual, target, streak);

  return `
  <div class="page">
    <section class="hero card">
      <div class="hero-top">
        <div>
          <p class="muted">${esc(formatDay(today))}</p>
          <h1>${esc(greeting())}${st.settings.studentName ? ', ' + esc(st.settings.studentName) : ''}</h1>
          <p class="muted small">${esc(motivational)}</p>
        </div>
        <div class="streak-badge" title="Study streak">
          <strong>${streak}</strong><span>day streak</span>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat"><span class="stat-label" data-i18n="extra69">Today</span><strong>${formatDuration(actual)}</strong><span class="muted small">of ${formatDuration(target)} target</span></div>
        <div class="stat"><span class="stat-label">Remaining</span><strong>${formatDuration(remaining)}</strong><span class="muted small">${dayPct}% done</span></div>
        <div class="stat"><span class="stat-label">This week</span><strong>${formatDuration(weekMinutes)}</strong><span class="muted small">of ${formatDuration(weekTarget)}</span></div>
        <div class="stat"><span class="stat-label">Syllabus</span><strong>${overall.pct}%</strong><span class="muted small">${overall.done}/${overall.total} chapters done</span></div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${dayPct}%"></div></div>
      <div class="row gap wrap">
        <button class="btn primary" data-nav="focus">▶ Start focus timer</button>
        ${lastChapter ? `<button class="btn" data-nav="chapter" data-id="${esc(lastChapter.id)}">Continue: ${esc(chapterLabel(lastChapter.id))}</button>` : `<button class="btn" data-nav="subjects">Add your chapters</button>`}
      </div>
    </section>

    ${daysToExam !== null && daysToExam >= 0 ? `
    <section class="card exam-countdown">
      <div><strong>HSC exam countdown</strong><p class="muted small">${esc(formatDate(examDate))}</p></div>
      <div class="countdown-num"><strong>${daysToExam}</strong><span>days left</span></div>
    </section>` : `
    <section class="card">
      <strong>Set your HSC exam date</strong>
      <p class="muted small">Add it in Settings so the countdown and exam reminders work. The app never guesses official dates.</p>
      <button class="btn small" data-nav="settings">Open settings</button>
    </section>`}

    <section class="card">
      <div class="card-head"><h2>Today's schedule</h2><button class="btn small ghost" data-nav="planner">Planner</button></div>
      ${todayTasks.length ? `<ul class="task-list">${todayTasks.map((t) => `
        <li class="task-item ${t.status === 'done' ? 'done' : ''}">
          <input type="checkbox" data-task-toggle="${esc(t.id)}" ${t.status === 'done' ? 'checked' : ''} aria-label="Mark task done">
          <div><strong>${esc(t.title)}</strong><span class="muted small">${esc(subjectName(t.subjectId))} · ${formatDuration(t.plannedMinutes || 0)}${t.status === 'carried' ? ' · carried over' : ''}</span></div>
          <span class="badge prio-${esc(t.priority || 'B')}">${esc(t.priority || 'B')}</span>
        </li>`).join('')}</ul>`
      : `<p class="muted">No tasks planned for today. <button class="link" data-nav="planner">Add a task</button> or start a focus session.</p>`}
      ${scheduledSubjects.length ? `<p class="muted small">Subjects today: ${scheduledSubjects.map((id) => esc(subjectName(id))).join(', ')}</p>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>Needs attention</h2></div>
      <ul class="plain-list">
        <li><button class="link" data-nav="revisions">Due revisions: <strong>${dueRevs.length}</strong></button></li>
        <li><button class="link" data-nav="planner">Pending tasks today: <strong>${pendingTasks.length}</strong></button></li>
        <li><button class="link" data-nav="weaknesses">Active weaknesses: <strong>${st.weaknesses.filter((w) => w.status === 'active').length}</strong></button></li>
        <li><button class="link" data-nav="exams">Upcoming exams: <strong>${st.exams.filter((e) => e.date >= today).length}</strong></button></li>
      </ul>
    </section>

    <section class="card">
      <div class="card-head"><h2>Lowest chapter completion</h2><button class="btn small ghost" data-nav="progress">Analytics</button></div>
      ${weakest.length && st.chapters.length ? `<ul class="plain-list">${weakest.map((w) => `
        <li><span class="dot" style="background:${esc(w.subject.color)}"></span> ${esc(w.subject.name)}
          <span class="muted small">— ${w.pct}% · ${formatDuration(w.minutes)} studied</span></li>`).join('')}</ul>`
      : `<p class="muted">Add chapters to your subjects to see completion.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Quick actions</h2></div>
      <div class="quick-grid">
        <button class="quick" data-nav="focus">⏱ Timer</button>
        <button class="quick" data-nav="planner">📅 Planner</button>
        <button class="quick" data-nav="revisions">🔁 Revisions</button>
        <button class="quick" data-nav="practice">✍ Practice</button>
        <button class="quick" data-nav="exams">📝 Exams</button>
        <button class="quick" data-nav="notes">🗒 Notes</button>
        <button class="quick" data-nav="formulas">∑ Formulas</button>
        <button class="quick" data-nav="library">▶ Videos</button>
        <button class="quick" data-nav="review">✅ Weekly review</button>
        <button class="quick" data-nav="search">🔍 Search</button>
        <button class="quick" data-nav="settings">⚙ Settings</button>
        <button class="quick" data-nav="backup">💾 Backup</button>
      </div>
    </section>
  </div>`;
}

function pickMotivation(actual, target, streak) {
  // Honest, data-based messages — no fake praise.
  if (actual === 0 && streak === 0) return 'No study recorded yet today. Start with one focused session — even 25 minutes counts.';
  if (actual === 0) return 'No study recorded yet today. Your streak is at risk — one session protects it.';
  if (actual >= target) return `Target reached: ${formatDuration(actual)} studied today. Extra study now is bonus, not obligation.`;
  const left = formatDuration(target - actual);
  if (actual >= target / 2) return `More than halfway to today's target. ${left} remaining.`;
  return `${formatDuration(actual)} studied so far. ${left} to reach today's target.`;
}
