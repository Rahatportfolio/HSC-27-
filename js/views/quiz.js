/* Offline, self-assessed MCQ tests using only the student's question bank. */
'use strict';

function questionDuplicate(list, question, type, subjectId, chapterId) {
  const key = question.trim().toLocaleLowerCase();
  return list.some((item) => typeof item.question === 'string' && item.question.trim().toLocaleLowerCase() === key && item.type === type && (item.subjectId || null) === subjectId && (item.chapterId || null) === chapterId);
}

function quizEligible(q, exam) {
  return q && q.type === 'mcq' && Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every((s) => typeof s === 'string' && s.trim()) &&
    Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4 &&
    (exam.scope !== 'subject' || q.subjectId === exam.subjectId) &&
    (exam.scope !== 'chapter' || q.chapterId === exam.chapterId);
}

function startBankQuiz(examId) {
  const st = getState();
  const exam = st.exams.find((e) => e.id === examId);
  if (!exam || !Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0 || !Number.isFinite(exam.totalMarks) || exam.totalMarks <= 0) { toast('Exam is missing or invalid.'); return false; }
  if (exam.format === 'written' || (exam.scope === 'subject' && !exam.subjectId) || (exam.scope === 'chapter' && !exam.chapterId)) { toast('Choose an MCQ or mixed exam with a valid scope.'); return false; }
  if (st.activeQuiz) { toast('Finish the active MCQ test first.'); return false; }
  const questions = st.questionBank.filter((q) => quizEligible(q, exam)).slice(0, 50).map((q) => ({
    id: q.id, question: q.question, options: q.options.slice(), correctIndex: q.correctIndex,
    answer: q.answer || '', source: q.source || 'manual', chapterId: q.chapterId || null,
  }));
  if (!questions.length) { toast('Add matching MCQs with four choices and a correct answer to the question bank first.'); return false; }
  const start = Date.now();
  st.activeQuiz = { id: uid('quiz'), examId: exam.id, examName: exam.name, totalMarks: exam.totalMarks,
    startedAt: start, endsAt: start + exam.durationMinutes * 60000, questions, answers: {} };
  if (!save()) { st.activeQuiz = null; return false; }
  return true;
}

function renderBankQuiz() {
  const quiz = getState().activeQuiz;
  if (!quiz) return `<div class="page"><h1>MCQ test</h1><p>No active test.</p><button class="btn" data-nav="exams">Exams</button></div>`;
  const expired = Date.now() >= quiz.endsAt;
  return `<div class="page"><div class="page-head"><h1>${esc(quiz.examName)} — MCQ test</h1></div>
    <p class="muted small">From your own question bank, not official board content. Equal marks per question; no negative marking. Answers are saved on this device.</p>
    <p><strong id="quiz-timer">${expired ? 'Time is up' : formatClock(Math.ceil((quiz.endsAt - Date.now()) / 1000)) + ' remaining'}</strong></p>
    ${quiz.questions.map((q, i) => `<fieldset class="card"><legend><strong>${i + 1}. ${esc(q.question)}</strong></legend>
      ${q.options.map((choice, n) => `<label class="check"><input type="radio" name="q-${i}" data-quiz-answer="${i}" value="${n}" ${quiz.answers[i] === n ? 'checked' : ''} ${expired ? 'disabled' : ''}> ${esc(choice)}</label>`).join('')}
      <p class="muted small">Source: ${esc(q.source)}</p></fieldset>`).join('')}
    <button class="btn primary" id="quiz-submit">Submit test</button>
    <button class="btn ghost" data-nav="exams">Back to exams</button>
  </div>`;
}

function finishBankQuiz() {
  const st = getState();
  const quiz = st.activeQuiz;
  if (!quiz) return false;
  const existing = st.examResults.find((r) => r.quizId === quiz.id);
  const oldResults = st.examResults;
  if (!existing) {
    const correct = quiz.questions.filter((q, i) => quiz.answers[i] === q.correctIndex).length;
    const obtainedMarks = Math.round(correct / quiz.questions.length * quiz.totalMarks * 100) / 100;
    const g = gradeForMarks(obtainedMarks, quiz.totalMarks);
    const review = quiz.questions.map((q, i) => ({ question: q.question, options: q.options, selectedIndex: Number.isInteger(quiz.answers[i]) ? quiz.answers[i] : null, correctIndex: q.correctIndex, answer: q.answer, source: q.source, chapterId: q.chapterId || null }));
    st.examResults = oldResults.concat({ id: uid('res'), quizId: quiz.id, examId: quiz.examId,
      obtainedMarks, grade: g.grade, date: toDateKey(new Date(Math.min(Date.now(), quiz.endsAt))),
      notes: `MCQ test: ${correct}/${quiz.questions.length} correct, equal weighting, no negative marking.`,
      quizReview: review, createdAt: nowISO() });
  }
  st.activeQuiz = null;
  if (!save()) { st.activeQuiz = quiz; st.examResults = oldResults; return false; }
  return true;
}

let lastQuizSaveFailure = 0;
function checkQuizExpiry() {
  const quiz = getState().activeQuiz;
  if (quiz && Date.now() >= quiz.endsAt) {
    if (Date.now() - lastQuizSaveFailure < 30000) return;
    if (finishBankQuiz()) {
      toast('Time is up. Your MCQ test was submitted.');
      if (currentRoute.name === 'quiz' || currentRoute.name === 'exams') navigate('exams');
    } else lastQuizSaveFailure = Date.now();
  } else {
    const el = document.getElementById('quiz-timer');
    if (el && quiz) el.textContent = formatClock(Math.ceil((quiz.endsAt - Date.now()) / 1000)) + ' remaining';
  }
}

function quizReviewHTML(result) {
  return `<div class="page"><div class="page-head"><h1>MCQ review</h1></div>
    <p class="muted small">Questions supplied by you or imported; they are not presented as official board questions.</p>
    ${result.quizReview.map((q, i) => `<section class="card"><h2>${i + 1}. ${esc(q.question)}</h2>
      <p>Your answer: ${q.selectedIndex === null ? 'Not answered' : esc(q.options[q.selectedIndex] || '')}</p>
      <p>Correct answer: ${esc(q.options[q.correctIndex] || '')}</p>
      ${q.answer ? `<p>${esc(q.answer)}</p>` : ''}<p class="muted small">Source: ${esc(q.source)}</p>${q.selectedIndex !== q.correctIndex ? `<button class="btn small" data-quiz-weakness="${esc(result.id)}" data-index="${i}">Save as weakness</button>` : ''}</section>`).join('')}
    <button class="btn" data-nav="exams">Back to exams</button></div>`;
}
