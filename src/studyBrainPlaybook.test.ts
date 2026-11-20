import { expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { WORK_STAGES } from './personalRoutine';
import { brainChapterGuide, studyBrainPlaybook } from './studyBrainPlaybook';

it('covers every catalog chapter and routine stage without guessing an unknown chapter', () => {
  for (const chapter of CHAPTERS) {
    expect(brainChapterGuide(chapter.id)).toMatchObject({ title: chapter.title, focus: chapter.focus, method: [expect.any(String), expect.any(String)] });
  }
  expect(brainChapterGuide('__proto__')).toBeUndefined();
  expect(Object.keys(studyBrainPlaybook)).toEqual(WORK_STAGES.map(stage => stage.id));
});
