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
  if (st.activeQuiz || st.activeWritten) { toast('Finish the active test first.'); return false; }
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
  if (!quiz) return `<div class="page"><h1 data-i18n="extra108">MCQ test</h1><p>No active test.</p><button class="btn" data-nav="exams">Exams</button></div>`;
  const expired = Date.now() >= quiz.endsAt;
  return `<div class="page"><div class="page-head"><h1>${esc(quiz.examName)} — MCQ test</h1></div>
    <p class="muted small">From your own question bank, not official board content. Equal marks per question; no negative marking. Answers are saved on this device.</p>
    <p><strong id="quiz-timer">${expired ? 'Time is up' : formatClock(Math.ceil((quiz.endsAt - Date.now()) / 1000)) + ' remaining'}</strong></p>
    ${quiz.questions.map((q, i) => `<fieldset class="card"><legend><strong>${i + 1}. ${esc(q.question)}</strong></legend>
      ${q.options.map((choice, n) => `<label class="check"><input type="radio" name="q-${i}" data-quiz-answer="${i}" value="${n}" ${quiz.answers[i] === n ? 'checked' : ''} ${expired ? 'disabled' : ''}> ${esc(choice)}</label>`).join('')}
      <p class="muted small">Source: ${esc(q.source)}</p></fieldset>`).join('')}
    <button class="btn primary" id="quiz-submit" data-i18n="extra112">Submit test</button>
    <button class="btn ghost" data-nav="exams" data-i18n="extra111">Back to exams</button>
    <button class="btn danger-ghost" id="quiz-discard" data-i18n="extra113">Discard test</button>
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
    <button class="btn" data-nav="exams" data-i18n="extra111">Back to exams</button></div>`;
}

// Self-administered written practice. The student, not an algorithm, marks answers.
function startWrittenTest(examId) {
  const st = getState(), exam = st.exams.find(e => e.id === examId);
  if (!exam || exam.format === 'mcq' || !['full','subject','chapter'].includes(exam.scope) || (exam.scope === 'subject' && !exam.subjectId) || (exam.scope === 'chapter' && !exam.chapterId) || !Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0 || !Number.isFinite(exam.totalMarks) || exam.totalMarks <= 0) { toast('Choose a valid written or mixed exam.'); return false; }
  if (st.activeWritten || st.activeQuiz) { toast('Finish the active test first.'); return false; }
  const questions = st.questionBank.filter(q => q && q.type === 'cq' && typeof q.question === 'string' && q.question.trim() &&
    (exam.scope !== 'subject' || q.subjectId === exam.subjectId) && (exam.scope !== 'chapter' || q.chapterId === exam.chapterId))
    .slice(0,10).map(q => ({question:q.question, answer:q.answer || '', source:q.source || 'manual', chapterId:q.chapterId || null}));
  if (!questions.length) { toast('Add matching written/CQ questions to your question bank first.'); return false; }
  const now = Date.now();
  st.activeWritten = {id:uid('written'), examId:exam.id, examName:exam.name, totalMarks:exam.totalMarks, startedAt:now, endsAt:now+exam.durationMinutes*60000, questions, answers:{}, scores:{}, submittedAt:null};
  if (!save()) { st.activeWritten = null; return false; }
  return true;
}
function renderWrittenTest() {
  const test = getState().activeWritten;
  if (!test) return `<div class="page"><h1 data-i18n="extra109">Written test</h1><p>No active test.</p><button class="btn" data-nav="exams">Exams</button></div>`;
  const marking = !!test.submittedAt, expired = Date.now() >= test.endsAt;
  return `<div class="page"><h1>${esc(test.examName)} — written test</h1>
    <p class="muted small">Your own questions, not official board content. Answers are saved on this device. ${marking ? 'Mark each answer yourself from 0 to 100%; questions carry equal weight. No automatic grading.' : 'After submission, mark your answers yourself.'}</p>
    ${!marking ? `<p><strong id="written-timer">${expired ? 'Time is up' : formatClock(Math.ceil((test.endsAt-Date.now())/1000))+' remaining'}</strong></p>` : ''}
    ${test.questions.map((q,i) => `<section class="card"><h2>${i+1}. ${esc(q.question)}</h2><p class="muted small">Source: ${esc(q.source)}</p>
      ${marking ? `<p><strong data-i18n="extra114">Your answer</strong></p><p>${esc(test.answers[i] || '').replace(/\n/g,'<br>')}</p>${q.answer ? `<p><strong data-i18n="extra115">Your reference answer</strong></p><p>${esc(q.answer).replace(/\n/g,'<br>')}</p>` : ''}<label class="field"><span data-i18n="extra116">Self-mark percentage (0–100) *</span><input type="number" min="0" max="100" step="1" data-written-score="${i}" value="${Number.isInteger(test.scores[i]) ? test.scores[i] : ''}"></label>`
        : `<label class="field"><span data-i18n="extra114">Your answer</span><textarea rows="5" maxlength="4000" data-written-answer="${i}" ${expired ? 'disabled' : ''}>${esc(test.answers[i] || '')}</textarea></label>`}</section>`).join('')}
    ${marking ? '<button class="btn primary" id="written-finish" data-i18n="extra117">Save self-marked result</button>' : '<button class="btn primary" id="written-submit" data-i18n="extra118">Submit for self-marking</button>'}
    <button class="btn ghost" data-nav="exams" data-i18n="extra111">Back to exams</button><button class="btn danger-ghost" id="written-discard" data-i18n="extra113">Discard test</button></div>`;
}
function submitWrittenTest() {
  const st = getState(), test = st.activeWritten;
  if (!test || test.submittedAt) return false;
  const previous = test.submittedAt;
  test.submittedAt = Math.min(Date.now(),test.endsAt);
  if (!save()) { test.submittedAt = previous; return false; }
  return true;
}
function finishWrittenTest() {
  const st = getState(), test = st.activeWritten;
  if (!test || !test.submittedAt) return false;
  const scores = test.questions.map((_,i) => test.scores[i]);
  if (scores.some(n => !Number.isInteger(n) || n < 0 || n > 100)) { toast('Enter a percentage from 0 to 100 for every answer.'); return false; }
  const obtainedMarks = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length / 100 * test.totalMarks * 100) / 100;
  const grade = gradeForMarks(obtainedMarks,test.totalMarks).grade;
  const review = test.questions.map((q,i)=>({...q, response:test.answers[i] || '', selfScore:scores[i]}));
  const oldResults = st.examResults;
  if (!st.examResults.some(r=>r.writtenId===test.id)) st.examResults = oldResults.concat({id:uid('res'),writtenId:test.id,examId:test.examId,obtainedMarks,grade,date:toDateKey(new Date(test.submittedAt)),notes:'Self-marked written test; equal weighting. Not an automatic assessment.',writtenReview:review,createdAt:nowISO()});
  st.activeWritten = null;
  if (!save()) { st.activeWritten = test; st.examResults = oldResults; return false; }
  return true;
}
function writtenReviewHTML(result) {
  return `<div class="page"><h1 data-i18n="extra119">Written test review</h1><p class="muted small">Self-marked, equal weighting; not an automatic assessment or official questions.</p>
    ${result.writtenReview.map((q,i)=>`<section class="card"><h2>${i+1}. ${esc(q.question)}</h2><p>Self-mark: ${esc(q.selfScore)}%</p><p><strong data-i18n="extra114">Your answer</strong></p><p>${esc(q.response || '').replace(/\n/g,'<br>')}</p>${q.answer ? `<p><strong data-i18n="extra120">Reference answer</strong></p><p>${esc(q.answer).replace(/\n/g,'<br>')}</p>` : ''}<p class="muted small">Source: ${esc(q.source)}</p></section>`).join('')}
    <button class="btn" data-nav="exams" data-i18n="extra111">Back to exams</button></div>`;
}
let lastWrittenSaveFailure = 0;
function checkWrittenExpiry() {
  const test = getState().activeWritten;
  if (!test || test.submittedAt) return;
  if (Date.now() >= test.endsAt) {
    if (Date.now()-lastWrittenSaveFailure < 30000) return;
    if (submitWrittenTest()) { toast('Time is up. Mark your written answers yourself.'); if (currentRoute.name === 'written') render(); }
    else lastWrittenSaveFailure = Date.now();
  } else {
    const el = document.getElementById('written-timer');
    if (el) el.textContent = formatClock(Math.ceil((test.endsAt-Date.now())/1000))+' remaining';
  }
}

/* Offline self-study cards from the student's own question bank. */
let flashcardSession = null;
function flashcardAnswer(q) {
  const answer = typeof q.answer === 'string' ? q.answer.trim() : '';
  const choice = q.type === 'mcq' && Array.isArray(q.options) && q.options.length === 4 &&
    Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4 &&
    typeof q.options[q.correctIndex] === 'string' ? q.options[q.correctIndex].trim() : '';
  return {answer, choice};
}
function startFlashcards(subjectId, type) {
  if ((subjectId && !subjectById(subjectId)) || !['all','mcq','cq'].includes(type)) { toast('Choose a valid subject and question type.'); return false; }
  const cards = getState().questionBank.filter(q => {
    if (!q || typeof q.question !== 'string' || !q.question.trim() || (subjectId && q.subjectId !== subjectId) || (type !== 'all' && q.type !== type)) return false;
    const a = flashcardAnswer(q); return !!(a.answer || a.choice);
  }).slice(0, 500).map(q => ({question:q.question, ...flashcardAnswer(q), type:q.type}));
  if (!cards.length) { toast('Add matching questions with answers or a correct MCQ choice first.'); return false; }
  flashcardSession = {cards, index:0, revealed:false}; return true;
}
function renderFlashcards() {
  const session = flashcardSession;
  if (!session) return `<div class="page"><h1 data-i18n="flashTitle">Flashcards</h1><section class="card">
    <p class="muted small">Review up to the first 500 matching questions with answers from your own question bank. No official questions or automatic grading. Session position is not saved after closing the app.</p>
    <form id="flashcard-form" class="form"><label class="field"><span data-i18n="extra10">Subject</span><select name="subjectId"><option value="">All subjects</option>${getState().subjects.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field"><span data-i18n="extra41">Type</span><select name="type"><option value="all">All types</option><option value="mcq">MCQ</option><option value="cq">CQ</option></select></label>
    <button class="btn primary" type="submit" data-i18n="flashStart">Start review</button></form></section><button class="btn" data-nav="practice">Question bank</button></div>`;
  const card = session.cards[session.index];
  return `<div class="page"><h1 data-i18n="flashTitle">Flashcards</h1><section class="card">
    <p class="muted small">Card ${session.index + 1} of ${session.cards.length} · ${esc(card.type || 'question')} · Your question bank</p>
    <h2>${esc(card.question).replace(/\n/g,'<br>')}</h2>
    ${session.revealed ? `<div><strong data-i18n="flashAnswer">Answer</strong>${card.choice ? `<p>${esc(card.choice).replace(/\n/g,'<br>')}</p>` : ''}${card.answer ? `<p>${esc(card.answer).replace(/\n/g,'<br>')}</p>` : ''}</div>` : '<button class="btn primary" id="flash-reveal" data-i18n="flashReveal">Show answer</button>'}
    </section><div class="row gap wrap"><button class="btn" id="flash-prev" ${session.index === 0 ? 'disabled' : ''} data-i18n="flashPrev">Previous</button><button class="btn" id="flash-next" ${session.index === session.cards.length - 1 ? 'disabled' : ''} data-i18n="flashNext">Next</button><button class="btn" id="flash-end" data-i18n="flashEnd">End review</button></div></div>`;
}
