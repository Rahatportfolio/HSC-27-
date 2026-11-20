import { describe, expect, it } from 'vitest';
import { addDays, freshData } from './planner';
import type { AppData } from './planner';
import { backupJson, hasStudyData } from './backup';
import { parseBackup } from './storage';
import { buildStudyPlan } from './studyPlan';
import { personalDataFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { defaultChapterWorkload, isPersonalTaskComplete, personalUnfinishedRanges, RECOMMENDED_S_IDS } from './personalRoutine';
import { setTaskCompletion } from './study';
import { STARTER_QUESTIONS } from './quiz-data';
import { BRAIN_LIMITS, brainChapterEvidence, brainCurrentPair, brainStudyPattern, forgetStudyBrain, interpretBrainMessage, newStudyBrain, parseStudyBrain, saveBrainCheckIn, saveBrainFeedback, studyBrainSuggestion } from './studyBrain';
import type { BrainCheckInDraft } from './studyBrainTypes';

const now = new Date('2026-11-20T12:05:00.000Z'); // 18:05 Bangladesh, regardless of browser timezone
const today = '2026-11-20', at = now.toISOString();
function fixture() { const data = personalDataFixture(); data.studyBrain = newStudyBrain(); return data; }
const draft: BrainCheckInDraft = { energy: 'okay', availableMinutes: null, obstacle: 'none' };
const suggest = (data: AppData, clock = now, plan = buildStudyPlan(data, today)) => studyBrainSuggestion(data, plan, clock);
function session(data: AppData, date: string, minutes: number, chapterId = PERSONAL_IDS[0], stamp = `${date}T08:00:00Z`) {
  data.studySessions.push({ id: `${date}-${data.studySessions.length}`, date, at: stamp, minutes, subject: 'physics', chapterId, mode: 'countdown' });
}

describe('optional bounded Study Brain memory and backup safety', () => {
  it('does not silently enable or add memory to old profiles/backups', () => {
    const data = freshData(); expect(parseBackup(backupJson(data)).studyBrain).toBeUndefined();
    expect(suggest(data).status).toBe('off'); expect(data.studyBrain).toBeUndefined();
  });
  it('round-trips enabled/paused memory and leaves all original work intact', () => {
    const data = fixture(); data.notes[today] = 'private'; data.completed['legacy-history'] = at;
    const checked = saveBrainCheckIn(data, { ...draft, energy: 'low', availableMinutes: 30 }, today, at);
    const feedback = saveBrainFeedback(checked, PERSONAL_IDS[0], 'hard', today, at); feedback.studyBrain!.enabled = false;
    const restored = parseBackup(backupJson(feedback));
    expect(restored.studyBrain).toEqual(feedback.studyBrain); expect(restored.personalRoutine).toEqual(data.personalRoutine);
    expect(restored.notes).toEqual(data.notes); expect(restored.completed).toEqual(data.completed);
    expect(restored.studySessions).toEqual(data.studySessions);
  });
  it('replaces only the same day check-in / chapter feedback, not completion or duration evidence', () => {
    const data = fixture(); const before = JSON.stringify(data);
    let next = saveBrainCheckIn(data, { ...draft, availableMinutes: 60 }, today, at);
    next = saveBrainCheckIn(next, { ...draft, energy: 'low', availableMinutes: 15 }, today, at);
    next = saveBrainFeedback(next, PERSONAL_IDS[0], 'hard', today, at);
    next = saveBrainFeedback(next, PERSONAL_IDS[0], 'easy', today, at);
    expect(next.studyBrain!.checkIns).toHaveLength(1); expect(next.studyBrain!.checkIns[0].availableMinutes).toBe(15);
    expect(next.studyBrain!.feedback).toHaveLength(1); expect(next.studyBrain!.feedback[0].difficulty).toBe('easy');
    expect(JSON.stringify(data)).toBe(before); expect(next.completed).toBe(data.completed); expect(next.personalRoutine).toBe(data.personalRoutine);
    expect(next.studySessions).toBe(data.studySessions); expect(next.settings).toBe(data.settings);
  });
  it('bounds retained confirmations and retains the latest explicit input even with imported future-dated entries', () => {
    let data = fixture();
    for (let index = 0; index < BRAIN_LIMITS.checkIns + 5; index++) data = saveBrainCheckIn(data, draft, addDays(today, index), at);
    expect(data.studyBrain!.checkIns).toHaveLength(BRAIN_LIMITS.checkIns);
    data = saveBrainCheckIn(data, { ...draft, availableMinutes: 17 }, today, at);
    expect(data.studyBrain!.checkIns.at(-1)).toMatchObject({ date: today, availableMinutes: 17 });
    const ids = RECOMMENDED_S_IDS.slice(0, 4); data.personalRoutine!.chapterIds = ids;
    for (let index = 0; index < BRAIN_LIMITS.feedback + 5; index++) data = saveBrainFeedback(data, ids[index % ids.length], 'hard', addDays(today, Math.floor(index / ids.length)), at);
    expect(data.studyBrain!.feedback).toHaveLength(BRAIN_LIMITS.feedback);
    expect(parseStudyBrain(data.studyBrain)).toEqual(data.studyBrain);
  });
  it('paused memory does not accept check-ins or feedback; out-of-S feedback is ignored', () => {
    const data = fixture(); data.studyBrain!.enabled = false;
    expect(saveBrainCheckIn(data, draft, today, at)).toBe(data);
    expect(saveBrainFeedback(data, PERSONAL_IDS[0], 'hard', today, at)).toBe(data);
    data.studyBrain!.enabled = true;
    expect(saveBrainFeedback(data, 'math-1-4', 'hard', today, at)).toBe(data);
  });
  it('forgetting removes only brain memory and can never clear logs, files, notes or the routine', () => {
    const data = fixture(); data.notes[today] = 'keep'; data.completed.keep = at;
    const forgotten = forgetStudyBrain(data); expect(forgotten.studyBrain).toBeUndefined();
    const { studyBrain: _memory, ...original } = data; expect(forgotten).toEqual(original);
    expect(forgotten.notes).toBe(data.notes); expect(forgotten.scannedNotes).toBe(data.scannedNotes);
    expect(parseBackup(backupJson(forgotten)).completed).toEqual(data.completed);
  });
  it('counts explicitly retained memory as worth backing up', () => {
    const data = freshData(); data.studyBrain = newStudyBrain(); expect(hasStudyData(data)).toBe(false);
    expect(hasStudyData(saveBrainCheckIn(data, draft, today, at))).toBe(true);
  });
  it.each([
    { focusMinutes: 0 }, { focusMinutes: 91 }, { focusMinutes: '25' }, { enabled: 'yes' },
    { checkIns: [{ ...draft, date: '2026-02-30', at }] },
    { checkIns: [{ ...draft, date: today, at: '2026-11-20T24:00:00Z' }] },
    { checkIns: [{ ...draft, availableMinutes: -1, date: today, at }] },
    { checkIns: [{ ...draft, availableMinutes: 2.5, date: today, at }] },
    { checkIns: [{ ...draft, chapterId: '__proto__', date: today, at }] },
    { checkIns: [{ ...draft, date: today, at }, { ...draft, date: today, at }] },
    { feedback: [{ chapterId: PERSONAL_IDS[0], difficulty: 'diagnosed', date: today, at }] },
    { feedback: Array.from({ length: 181 }, () => ({ chapterId: PERSONAL_IDS[0], difficulty: 'hard', date: today, at })) },
  ])('rejects malformed memory without silently changing the student profile: %j', patch => {
    const data = fixture(); expect(() => parseStudyBrain({ ...data.studyBrain, ...patch })).toThrow(/Study Brain memory/);
    expect(() => parseBackup(JSON.stringify({ ...data, studyBrain: { ...data.studyBrain, ...patch } }))).toThrow(/Study Brain memory/);
  });
  it('strips unknown/transcript fields and cannot store executable instructions or prototype keys', () => {
    const memory = parseStudyBrain(JSON.parse(JSON.stringify({ ...newStudyBrain(), transcript: ['secret'], __proto__: { contaminated: true } })));
    expect(Object.keys(memory).sort()).toEqual(['checkIns', 'enabled', 'feedback', 'focusMinutes', 'version']);
    expect(({} as Record<string, unknown>).contaminated).toBeUndefined();
  });
});

describe('read-only, S/pair/source-aware local reasoning', () => {
  it('suggests a short focus in the existing live slot without adding work or writing progress', () => {
    const data = fixture(), plan = buildStudyPlan(data, today), snapshot = JSON.stringify({ data, plan });
    const result = suggest(data, now, plan);
    expect(result).toMatchObject({ status: 'ready', focusMinutes: 25, canStart: true, chapterId: PERSONAL_IDS[0], range: { from: 0, to: 25 } });
    expect(result.pair).toEqual(PERSONAL_IDS); expect(result.timerTaskId).toContain('personal%3A');
    expect(JSON.stringify({ data, plan })).toBe(snapshot);
  });
  it('offers only a scheduled preview before the start/time and never a timer outside availability', () => {
    const data = fixture(); expect(suggest(data, new Date('2026-11-16T12:00:00Z'))).toMatchObject({ status: 'scheduled', canStart: false });
    expect(suggest(data, new Date('2026-11-20T11:00:00Z'))).toMatchObject({ status: 'scheduled', canStart: false });
    const plan = buildStudyPlan(data, today); plan[0].tasks[0].startMinute = 900; plan[0].tasks[0].endMinute = 1020;
    expect(suggest(data, new Date('2026-11-20T09:05:00Z'), plan).status).toBe('outside');
  });
  it('takes tiredness, an offered time cap and explicit hard feedback as smaller-focus signals only', () => {
    let data = saveBrainCheckIn(fixture(), { ...draft, energy: 'low', availableMinutes: 8 }, today, at);
    expect(suggest(data).focusMinutes).toBe(8);
    data = saveBrainCheckIn(data, { ...draft, energy: 'fresh', availableMinutes: 300 }, today, at);
    data = saveBrainFeedback(data, PERSONAL_IDS[0], 'hard', today, at);
    expect(suggest(data).focusMinutes).toBe(15);
    expect(data.personalRoutine!.workloads[PERSONAL_IDS[0]].class.minutes).toBe(240);
    expect(data.completed).toEqual({}); expect(data.studySessions).toEqual([]);
  });
  it('today’s zero means rest, not completion; yesterday’s zero is not carried into today', () => {
    let data = saveBrainCheckIn(fixture(), { ...draft, availableMinutes: 0 }, today, at);
    expect(suggest(data).status).toBe('rest'); expect(data.completed).toEqual({});
    data.studyBrain!.checkIns[0].date = '2026-11-19'; expect(suggest(data).status).toBe('ready');
  });
  it('starts on a blank chapter with the 20-hour estimate instead of blocking the pair', () => {
    const ids = [...PERSONAL_IDS, ...RECOMMENDED_S_IDS.filter(id => !PERSONAL_IDS.includes(id)).slice(0, 2)];
    const data = personalDataFixture(ids); data.studyBrain = newStudyBrain(); data.personalRoutine!.workloads[PERSONAL_IDS[0]] = defaultChapterWorkload(PERSONAL_IDS[0]);
    const suggestion = suggest(data);
    expect(suggestion.status).not.toBe('duration');
    expect(suggestion.status).toBe('ready');
    expect(suggestion.pair).toEqual(PERSONAL_IDS);
    expect(suggestion.canStart).toBe(true);
    expect(suggestion.focusMinutes).toBeGreaterThan(0);
  });
  it('does not migrate a legacy profile or bypass first-launch setup', () => {
    const data = freshData(); data.studyBrain = newStudyBrain(); expect(suggest(data, now, []).status).toBe('legacy');
    data.routineSetupRequired = true; expect(suggest(data, now, []).status).toBe('setup'); expect(data.personalRoutine).toBeUndefined();
  });
  it('keeps unfinished earlier work visible instead of pushing it onto today or skipping ahead', () => {
    const data = fixture(), before = JSON.stringify(data);
    const result = suggest(data, new Date('2026-11-21T12:05:00Z'));
    expect(result.status).toBe('review'); expect(result.task!.date).toBe(today); expect(result.focusMinutes).toBe(0); expect(result.canStart).toBe(false);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('allows focus preference only inside the same pair, same owed date and original book order', () => {
    const data = saveBrainCheckIn(fixture(), { ...draft, chapterId: PERSONAL_IDS[1] }, today, at);
    expect(suggest(data)).toMatchObject({ chapterId: PERSONAL_IDS[1], status: 'scheduled', canStart: false });
    expect(suggest(data).task!.startMinute).toBe(1200);
    expect(brainCurrentPair(data, buildStudyPlan(data, today))).toEqual(PERSONAL_IDS);
  });
  it('uses old partition evidence, suggesting only the uncovered range without restamping it', () => {
    const data = fixture(), plan = buildStudyPlan(data, today), task = plan[0].tasks[0], source = encodeURIComponent(task.personalWork!.sourceId);
    data.completed[`smart-part|${source}|0|30`] = '2026-11-20T11:50:00Z'; data.completed[`smart-part|${source}|45|60`] = '2026-11-20T11:55:00Z';
    const original = { ...data.completed };
    expect(personalUnfinishedRanges(task, data.completed)).toEqual([{ from: 30, to: 45 }, { from: 60, to: 120 }]);
    expect(suggest(data, now, plan)).toMatchObject({ focusMinutes: 15, range: { from: 30, to: 45 } });
    expect(data.completed).toEqual(original);
  });
  it('does not resurrect covered/removed ranges or mistake an old manual-complete assertion for six-group completion', () => {
    let data = fixture(); let plan = buildStudyPlan(data, today);
    data = setTaskCompletion(data, [plan[0].tasks[0].id], true, plan); const timestamps = { ...data.completed };
    data.personalRoutine!.sessionMinutes = 30; plan = buildStudyPlan(data, today);
    const next = suggest(data, now, plan);
    expect(isPersonalTaskComplete(next.task!, data.completed)).toBe(false);
    expect(next.task?.originalTaskId !== plan[0].tasks[0].originalTaskId || next.range!.from >= 120).toBe(true);
    expect(data.completed).toEqual(timestamps);
    data.removedTasks = plan.flatMap(day => day.tasks.map(task => task.id)); expect(suggest(data).status).toBe('missing');
    for (const id of PERSONAL_IDS) data.chapterMeta[id] = { cq: 'none', mcq: 'none', weak: false, note: '', updatedAt: at, stage: 'completed' };
    expect(suggest(data).status).toBe('missing'); expect(data.personalRoutine!.chapterIds).toEqual(PERSONAL_IDS);
  });
  it('respects source evidence across session-size regeneration and explicit source changes', () => {
    let data = fixture(); let plan = buildStudyPlan(data, today);
    data = setTaskCompletion(data, plan.flatMap(day => day.tasks.map(task => task.id)), true, plan);
    expect(suggest(data).status).toBe('complete'); data.personalRoutine!.sessionMinutes = 25;
    expect(suggest(data).status).toBe('complete');
    data.personalRoutine!.workloads[PERSONAL_IDS[0]].class.minutes = 300;
    expect(suggest(data).status).toBe('scheduled'); expect(suggest(data).canStart).toBe(false); expect(Object.keys(data.completed).length).toBeGreaterThan(0);
  });
  it('has no ready timer when the cap is consumed, the slot expired, or a custom appointment overlaps', () => {
    const data = fixture(); session(data, today, data.personalRoutine!.dailyLimitMinutes!);
    expect(suggest(data).status).toBe('capacity'); expect(suggest(fixture(), new Date('2026-11-20T16:01:00Z')).status).toBe('review');
    const clean = fixture(), plan = buildStudyPlan(clean, today), task = plan[0].tasks[0];
    plan[0].tasks.push({ ...task, id: 'custom-overlap', kind: 'custom', personalWork: undefined, startMinute: 1100, endMinute: 1120 });
    expect(suggest(clean, now, plan).status).toBe('conflict');
  });
  it('caps a live focus by the actual remaining wall-clock slot and measured daily capacity', () => {
    const data = fixture(); expect(suggest(data, new Date('2026-11-20T13:57:00Z')).focusMinutes).toBe(3);
    session(data, today, data.personalRoutine!.dailyLimitMinutes! - 2); expect(suggest(data).focusMinutes).toBe(2);
  });
  it('never scans private notes, library bodies or scan data to create suggestions', () => {
    const data = fixture();
    for (const field of ['notes', 'libraryNotes', 'scannedNotes']) Object.defineProperty(data, field, { get: () => { throw new Error('private content read'); } });
    expect(() => suggest(data)).not.toThrow();
  });
});

describe('honest evidence thresholds and expiring signals', () => {
  it('waits for 3 actual S session logs across 2 days before using a median', () => {
    const data = fixture(); session(data, '2026-11-18', 10); session(data, '2026-11-18', 20); session(data, '2026-11-18', 30);
    expect(brainStudyPattern(data, now).enough).toBe(false); expect(suggest(data).focusMinutes).toBe(25);
    session(data, '2026-11-19', 10); expect(brainStudyPattern(data, now)).toEqual({ sessions: 4, days: 2, median: 15, enough: true });
    expect(suggest(data).focusMinutes).toBe(15);
  });
  it('ignores future, stale and unrelated chapter session logs', () => {
    const data = fixture(); session(data, '2026-11-21', 5); session(data, '2026-10-01', 5); session(data, '2026-11-19', 5, 'math-1-4');
    session(data, today, 5, PERSONAL_IDS[0], '2026-11-20T16:00:00Z');
    expect(brainStudyPattern(data, now)).toEqual({ sessions: 0, days: 0, median: null, enough: false });
  });
  it('maps built-in MCQ questions to the right chapter, never guesses unknown IDs or unrelated records', () => {
    const data = fixture(); const question = STARTER_QUESTIONS.find(item => item.chapterId === PERSONAL_IDS[0])!;
    for (let index = 0; index < 5; index++) data.attempts.push({ id: `answer-${index}`, questionId: question.id, correct: index === 0, chosen: 0, subject: 'physics', date: today, at });
    data.attempts.push({ ...data.attempts[0], id: 'unknown', questionId: 'removed-question' });
    expect(brainChapterEvidence(data, PERSONAL_IDS[0], now).mcq).toEqual({ answers: 5, correct: 1 });
    expect(brainChapterEvidence(data, PERSONAL_IDS[1], now).mcq.answers).toBe(0);
  });
  it('expires hard feedback after 14 days and ignores future imports', () => {
    const data = fixture(); data.studyBrain!.feedback = [{ chapterId: PERSONAL_IDS[0], date: '2026-10-01', at: '2026-10-01T12:00:00Z', difficulty: 'hard' }, { chapterId: PERSONAL_IDS[0], date: '2026-11-21', at: '2026-11-21T12:00:00Z', difficulty: 'hard' }];
    expect(suggest(data).focusMinutes).toBe(25); expect(brainChapterEvidence(data, PERSONAL_IDS[0], now).feedback).toBeUndefined();
  });
});

describe('small, non-destructive Bengali / Banglish / English intent parser', () => {
  it.each([
    ['আজ ৩০ মিনিট সময় আছে', { availableMinutes: 30 }], ['aj 30 min ache, onek tired', { availableMinutes: 30, energy: 'low' }],
    ['I have 1 hour 20 minutes, feeling fresh', { availableMinutes: 80, energy: 'fresh' }], ['আজ ১.৫ ঘণ্টা', { availableMinutes: 90 }],
    ['aj porte parbo na', { availableMinutes: 0 }], ['ক্লান্ত', { energy: 'low' }],
    ['physics bujhi na', { obstacle: 'understanding', chapterId: PERSONAL_IDS[0] }],
    ['chemistry mone thake na', { obstacle: 'remembering', chapterId: PERSONAL_IDS[1] }],
    ["can't start", { obstacle: 'starting' }],
  ] as const)('drafts %s without applying or retaining the message', (message, patch) => {
    expect(interpretBrainMessage(message, PERSONAL_IDS)).toMatchObject({ kind: 'draft', patch });
  });
  it('recognises an outside-pair subject only as an obstacle, never an extra chapter', () => {
    expect(interpretBrainMessage('math bujhi na', PERSONAL_IDS)).toEqual({ kind: 'draft', patch: { obstacle: 'understanding' }, outsidePair: true });
  });
  it.each(['30 min or 60 min', '-5 minutes', '1000 min', '0.25 minutes', 'no time but 30 min'])('does not confidently choose an ambiguous/invalid duration: %s', message => {
    expect(interpretBrainMessage(message, PERSONAL_IDS).kind).toBe('invalid-time');
  });
  it.each(['mark complete', 'I watched 30 min', 'delete all notes', 'পড়েছি', 'সব মুছে ফেলো'])('cannot execute completion, logging or deletion commands: %s', message => {
    expect(interpretBrainMessage(message, PERSONAL_IDS).kind).toBe('unsupported');
  });
  it.each([['ki porbo', 'next'], ['কী পড়ব', 'next'], ['what should I study next', 'next'], ['amar kotha mone ache', 'memory'], ['আমার সম্পর্কে কী জানো', 'memory'], ['make an image', 'help'], ['not tired', 'help'], ['a'.repeat(241), 'help']])('returns a bounded intent for %s', (message, kind) => {
    expect(interpretBrainMessage(message, PERSONAL_IDS).kind).toBe(kind);
  });
});
