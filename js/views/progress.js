/* HSC 2027 Smart Study App — views/progress.js
 * Analytics: study hours, subject breakdown, target vs actual, MCQ accuracy,
 * CQ marks, test performance, revision consistency, weakest/neglected items,
 * missed sessions, improvement over time. Charts are lightweight inline SVG.
 */
'use strict';

// Comparisons are within one exam and marking method only, never predictions.
function progressResults(st) {
  const exams = new Map(st.exams.map(e => [e.id,e]));
  return st.examResults.map(result => {
    const exam = exams.get(result.examId);
    const obtained = Number(result.obtainedMarks), total = exam && Number(exam.totalMarks);
    if (!exam || result.obtainedMarks === null || result.obtainedMarks === '' || !Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0 || obtained < 0 || obtained > total || !isValidDateKey(result.date)) return null;
    const method = Array.isArray(result.quizReview) ? 'MCQ auto-score' : Array.isArray(result.writtenReview) ? 'written self-score' : 'manually recorded';
    return {result, exam, method, percentage:obtained / total * 100};
  }).filter(Boolean).sort((a,b) => b.result.date.localeCompare(a.result.date) || String(b.result.createdAt || '').localeCompare(String(a.result.createdAt || '')));
}
function resultComparisons(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.exam.id,row.method]);
    if (!groups.has(key)) groups.set(key, []);
    const group = groups.get(key); if (group.length < 2) group.push(row);
  }
  return [...groups.values()].filter(g => g.length === 2 && (g[0].result.date !== g[1].result.date ||
    (Number.isFinite(Date.parse(g[0].result.createdAt)) && Number.isFinite(Date.parse(g[1].result.createdAt)) && Date.parse(g[0].result.createdAt) !== Date.parse(g[1].result.createdAt))))
    .map(([latest,previous]) => ({latest,previous,change:Math.round((latest.percentage-previous.percentage)*10)/10}))
    .sort((a,b) => b.latest.result.date.localeCompare(a.latest.result.date) || String(b.latest.result.createdAt || '').localeCompare(String(a.latest.result.createdAt || ''))).slice(0,5);
}

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
  const totalMinutes = st.sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const daysInCurrentMonth = new Date(Date.UTC(parseDateKey(today).getUTCFullYear(), parseDateKey(today).getUTCMonth() + 1, 0)).getUTCDate();

  // Practice totals
  const mcqAll = { attempted: 0, correct: 0 };
  const cqAll = { marks: 0, totalMarks: 0 };
  st.practice.forEach((p) => {
    if (p.type === 'mcq') { mcqAll.attempted += p.attempted || 0; mcqAll.correct += p.correct || 0; }
    if (p.type === 'cq') { cqAll.marks += p.marks || 0; cqAll.totalMarks += p.totalMarks || 0; }
  });
  const mcqAcc = accuracy(mcqAll.correct, mcqAll.attempted);

  // Averages exclude missing or invalid exam/results rather than treating them as zero.
  const results = st.examResults.slice().sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
  const scoreRows = progressResults(st), comparisons = resultComparisons(scoreRows);
  const avgPct = scoreRows.length ? Math.round(scoreRows.reduce((sum,row) => sum + row.percentage,0) / scoreRows.length) : null;

  // Revisions
  const revs = st.revisions;
  const revDone = revs.filter((r) => r.completedAt).length;
  const revOverdue = revs.filter((r) => !r.completedAt && r.dueDate <= today).length;

  // Missed sessions: days in last 14 with tasks planned but zero study
  const missedDays = days.filter((d) => d.key < today && d.minutes === 0 && st.tasks.some((t) => (t.originalDate || t.date) === d.key && t.type !== 'rest')).length;

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
    <div class="page-head"><h1 data-i18n="progress">Progress</h1></div>

    <section class="card">
      <h2>Personal study challenge</h2>
      ${st.challenge && isValidDateKey(st.challenge.startDate) && Number.isInteger(st.challenge.days) && st.challenge.days > 0 && st.challenge.days <= 90 && Number.isInteger(st.challenge.targetMinutes) && st.challenge.targetMinutes > 0 && st.challenge.targetMinutes <= 1440 ? (() => {
        const c = st.challenge;
        const completed = Array.from({ length: c.days }, (_, i) => addDays(c.startDate, i)).filter((d) => d <= today && minutesOn(d) >= c.targetMinutes).length;
        return `<p>${completed}/${c.days} days met your ${formatDuration(c.targetMinutes)} target · ${esc(formatDate(c.startDate))} to ${esc(formatDate(addDays(c.startDate, c.days - 1)))}</p><p class="muted small">${today > addDays(c.startDate, c.days - 1) ? 'Challenge ended.' : 'Progress comes from recorded sessions.'}</p><button class="btn" id="end-challenge">Remove challenge</button>`;
      })() : '<p class="muted">Set a daily target and track it from your recorded sessions.</p><button class="btn" id="start-challenge">Start challenge</button>'}
      <p class="muted small">Milestones: ${overallCompletion().done} chapter(s) marked complete · ${calcStreak(studyDateKeys())}-day current study streak.</p>
    </section>

    <section class="card">
      <h2>Daily study — last 14 days</h2>
      <p class="muted small">Target ${formatDuration(target)}/day · Green bars met the target</p>
      <div class="bar-chart">${days.map(bar).join('')}</div>
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">This week</span><strong>${formatDuration(minutesInWeek(weekStart))}</strong><span class="muted small">target ${formatDuration(target * 7)}</span></div>
        <div class="stat"><span class="stat-label">This month</span><strong>${formatDuration(minutesInMonth(mKey))}</strong><span class="muted small">target ${formatDuration(target * daysInCurrentMonth)}</span></div>
        <div class="stat"><span class="stat-label">All time</span><strong>${formatDuration(totalMinutes)}</strong><span class="muted small">${st.sessions.length} sessions</span></div>
        <div class="stat"><span class="stat-label">Streak</span><strong>${calcStreak(studyDateKeys())} days</strong><span class="muted small">current</span></div>
      </div>
      <p class="muted small">Trend (last 7 days vs previous 7): ${trend > 0 ? `▲ +${formatDuration(trend)}` : trend < 0 ? `▼ ${formatDuration(Math.abs(trend))}` : 'no change'}.</p>
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
        <li>MCQ: ${esc(mcqAll.attempted)} attempted · accuracy ${mcqAcc === null ? '—' : mcqAcc + '%'}</li>
        <li>CQ: ${esc(cqAll.marks)}/${esc(cqAll.totalMarks)} marks recorded</li>
        <li>Results recorded: ${results.length}${avgPct !== null ? ` · average ${avgPct}% across ${scoreRows.length} valid result(s)` : ''}</li>
        <li>Revisions: ${revDone} done · ${revOverdue} overdue</li>
      </ul>
      <p class="muted small">Average weights each valid result equally, including self-marked and manually entered results; it is not an official grade or prediction. Missing or invalid exam scores are excluded.</p>
      ${scoreRows.length ? `<h3>Recent valid results</h3><ul class="plain-list">${scoreRows.slice(0, 5).map(({result:r, exam:ex}) => `<li>${esc(formatDate(r.date))} — ${esc(ex.name)}: ${esc(r.obtainedMarks)}/${esc(ex.totalMarks)} (${esc(r.grade || '')})</li>`).join('')}</ul>` : `<p class="muted small">Record valid exam results in the Exams section to track performance here.</p>`}
    </section>

    <section class="card">
      <h2>Same-test score comparison</h2>
      <p class="muted small">Most recent two valid records for the same exam and marking method; same-day entries need distinct timestamps. A score change is not proof of learning or a future prediction.</p>
      ${comparisons.length ? `<ul class="plain-list">${comparisons.map(({latest,previous,change}) => `<li><strong>${esc(latest.exam.name)}</strong> · ${esc(latest.method)}<br>${esc(formatDate(previous.result.date))}: ${Math.round(previous.percentage)}% → ${esc(formatDate(latest.result.date))}: ${Math.round(latest.percentage)}% · ${change > 0 ? '+' : ''}${change} percentage points</li>`).join('')}</ul>` : '<p class="muted">Record two valid results for the same exam and marking method to compare.</p>'}
    </section>

    <section class="card">
      <h2>Chapter test performance</h2>
      <p class="muted small">Based only on your recorded scores. A low score can identify a topic to revisit, not a prediction.</p>
      ${(() => {
        const scores = st.chapters.map((c) => {
          const rows = scoreRows.filter(x => x.exam.chapterId === c.id);
          return { c, count: rows.length, avg: rows.length ? Math.round(rows.reduce((sum, x) => sum + x.percentage, 0) / rows.length) : null };
        }).filter((x) => x.count).sort((a, b) => a.avg - b.avg);
        return scores.length ? `<ul class="plain-list">${scores.map((x) => `<li><button class="link" data-nav="chapter" data-id="${esc(x.c.id)}">${esc(subjectName(x.c.subjectId))} — ${esc(chapterLabel(x.c.id))}</button> · ${x.avg}% average · ${x.count} result(s)</li>`).join('')}</ul>` : '<p class="muted">No linked chapter test scores yet.</p>';
      })()}
    </section>

    <section class="card">
      <h2>Most neglected chapters</h2>
      ${neglected.length ? `<ul class="plain-list">${neglected.map((x) => `
        <li><button class="link" data-nav="chapter" data-id="${esc(x.chapter.id)}">${esc(subjectName(x.chapter.subjectId))} — ${esc(chapterLabel(x.chapter.id))}</button>
        <span class="muted small"> (priority ${esc(x.chapter.priority || 'B')}, no study time yet)</span></li>`).join('')}</ul>`
      : `<p class="muted">${st.chapters.length ? 'Every chapter has at least some recorded study time.' : 'Add chapters to see this summary.'}</p>`}
    </section>
  </div>`;
}
