/* HSC 2027 Smart Study App — views/progress.js
 * Analytics: study hours, subject breakdown, target vs actual, MCQ accuracy,
 * CQ marks, test performance, revision consistency, weakest/neglected items,
 * missed sessions, improvement over time. Charts are lightweight inline SVG.
 */
'use strict';

function renderProgress() {
  const st = getState();
  const today = todayKey();
  const target = st.settings.dailyTargetMinutes || 480;
  const weekStart = weekStartKey(today);
  const mKey = monthKey(today);

  // Last 14 days bar chart
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    days.push({ key: d, minutes: minutesOn(d) });
  }
  const maxDay = Math.max(target, ...days.map((d) => d.minutes), 1);

  // Subject breakdown
  const subjectRows = st.subjects.map((s) => ({
    subject: s, minutes: subjectMinutes(s.id), completion: subjectCompletion(s.id),
  })).sort((a, b) => b.minutes - a.minutes);
  const totalMinutes = subjectRows.reduce((a, r) => a + r.minutes, 0);

  // Practice totals
  const mcqAll = { attempted: 0, correct: 0 };
  const cqAll = { marks: 0, totalMarks: 0 };
  st.practice.forEach((p) => {
    if (p.type === 'mcq') { mcqAll.attempted += p.attempted || 0; mcqAll.correct += p.correct || 0; }
    if (p.type === 'cq') { cqAll.marks += p.marks || 0; cqAll.totalMarks += p.totalMarks || 0; }
  });
  const mcqAcc = accuracy(mcqAll.correct, mcqAll.attempted);

  // Exam results
  const results = st.examResults.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const avgPct = results.length
    ? Math.round(results.reduce((a, r) => {
        const ex = st.exams.find((e) => e.id === r.examId);
        return a + (ex && ex.totalMarks ? (r.obtainedMarks / ex.totalMarks) * 100 : 0);
      }, 0) / results.length) : null;

  // Revisions
  const revs = st.revisions;
  const revDone = revs.filter((r) => r.completedAt).length;
  const revOverdue = revs.filter((r) => !r.completedAt && r.dueDate <= today).length;

  // Missed sessions: days in last 14 with tasks planned but zero study
  const missedDays = days.filter((d) => d.minutes === 0 && tasksOn(d.key).length > 0).length;

  // Neglected chapters: chapters with zero study minutes, sorted by priority
  const neglected = st.chapters
    .map((c) => ({ chapter: c, minutes: chapterMinutes(c.id) }))
    .filter((x) => x.minutes === 0)
    .sort((a, b) => (a.chapter.priority || 'B').localeCompare(b.chapter.priority || 'B'))
    .slice(0, 5);

  // Improvement: first half vs second half of last 14 days
  const firstHalf = days.slice(0, 7).reduce((a, d) => a + d.minutes, 0);
  const secondHalf = days.slice(7).reduce((a, d) => a + d.minutes, 0);
  const trend = secondHalf - firstHalf;

  const bar = (d) => {
    const h = Math.max(2, Math.round((d.minutes / maxDay) * 100));
    const hit = d.minutes >= target;
    return `<div class="bar-col" title="${esc(formatDate(d.key))}: ${formatDuration(d.minutes)}">
      <div class="bar ${hit ? 'hit' : ''}" style="height:${h}%"></div>
      <span>${esc(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric' }).format(parseDateKey(d.key)))}</span>
    </div>`;
  };

  return `<div class="page">
    <div class="page-head"><h1>Progress</h1></div>

    <section class="card">
      <h2>Daily study — last 14 days</h2>
      <p class="muted small">Target ${formatDuration(target)}/day · Green bars met the target</p>
      <div class="bar-chart">${days.map(bar).join('')}</div>
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">This week</span><strong>${formatDuration(minutesInWeek(weekStart))}</strong><span class="muted small">target ${formatDuration(target * 7)}</span></div>
        <div class="stat"><span class="stat-label">This month</span><strong>${formatDuration(minutesInMonth(mKey))}</strong><span class="muted small">target ${formatDuration(target * 30)}</span></div>
        <div class="stat"><span class="stat-label">All time</span><strong>${formatDuration(totalMinutes)}</strong><span class="muted small">${st.sessions.length} sessions</span></div>
        <div class="stat"><span class="stat-label">Streak</span><strong>${calcStreak(studyDateKeys())} days</strong><span class="muted small">current</span></div>
      </div>
      <p class="muted small">Trend (last 7 days vs previous 7): ${trend > 0 ? `▲ +${formatDuration(trend)}` : trend < 0 ? `▼ ${formatDuration(trend)}` : 'no change'}.</p>
      ${missedDays ? `<p class="muted small">⚠ ${missedDays} day(s) in the last 14 had planned tasks but no recorded study.</p>` : ''}
    </section>

    <section class="card">
      <h2>Subject-wise study time &amp; completion</h2>
      ${subjectRows.length ? subjectRows.map((r) => `
        <div class="subject-stat">
          <div class="row between"><span><span class="dot" style="background:${esc(r.subject.color)}"></span> ${esc(r.subject.name)}</span>
          <span class="muted small">${formatDuration(r.minutes)} · ${r.completion.pct}%</span></div>
          <div class="progress-bar sm"><div class="progress-fill" style="width:${totalMinutes ? Math.round((r.minutes / totalMinutes) * 100) : 0}%"></div></div>
        </div>`).join('') : `<p class="muted">No study recorded yet.</p>`}
    </section>

    <section class="card">
      <h2>Practice &amp; tests</h2>
      <ul class="plain-list">
        <li>MCQ: ${mcqAll.attempted} attempted · accuracy ${mcqAcc === null ? '—' : mcqAcc + '%'}</li>
        <li>CQ: ${cqAll.marks}/${cqAll.totalMarks} marks recorded</li>
        <li>Exams taken: ${results.length}${avgPct !== null ? ` · average ${avgPct}%` : ''}</li>
        <li>Revisions: ${revDone} done · ${revOverdue} overdue</li>
      </ul>
      ${results.length ? `<h3>Recent results</h3><ul class="plain-list">${results.slice(0, 5).map((r) => {
        const ex = st.exams.find((e) => e.id === r.examId);
        return `<li>${esc(formatDate(r.date))} — ${esc(ex ? ex.name : 'Exam')}: ${r.obtainedMarks}/${ex ? ex.totalMarks : '?'} (${esc(r.grade || '')})</li>`;
      }).join('')}</ul>` : `<p class="muted small">Record exam results in the Exams section to track performance here.</p>`}
    </section>

    <section class="card">
      <h2>Most neglected chapters</h2>
      ${neglected.length ? `<ul class="plain-list">${neglected.map((x) => `
        <li><button class="link" data-nav="chapter" data-id="${esc(x.chapter.id)}">${esc(subjectName(x.chapter.subjectId))} — ${esc(chapterLabel(x.chapter.id))}</button>
        <span class="muted small"> (priority ${esc(x.chapter.priority || 'B')}, no study time yet)</span></li>`).join('')}</ul>`
      : `<p class="muted">Every chapter has at least some recorded study time.</p>`}
    </section>
  </div>`;
}
