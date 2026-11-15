import { describe, it, expect } from 'vitest';
import { CHAPTERS } from './data';
import { CHAPTER_SCHEDULE } from './schedule';
import { CHAPTER_CLASSES, BANGLA_LESSONS } from './classLinks';
describe('audit', () => {
  it('coverage', () => {
    const ids = CHAPTERS.map(c => c.id);
    const res = {
      noSched: ids.filter(id => !CHAPTER_SCHEDULE[id]),
      noClass: ids.filter(id => !CHAPTER_CLASSES[id]),
      emptyType: Object.entries(CHAPTER_CLASSES).flatMap(([id, c]) => (['oneShot','mcq','cq'] as const).filter(k => c[k].length === 0).map(k => `${id}:${k}`)),
      lessonOrphans: Object.keys(BANGLA_LESSONS).filter(id => !ids.includes(id)),
      badUrl: Object.values(CHAPTER_CLASSES).flatMap(c => [...c.oneShot, ...c.mcq, ...c.cq]).filter(o => !/^https:\/\/www\.youtube\.com\/(watch\?v=[\w-]{11}|playlist\?list=[\w-]{10,}|@[\w]+|@[\w]+\/search\?query=.+)$/.test(o.url)).map(o => o.url).slice(0, 5),
      lessonNoUrl: Object.values(BANGLA_LESSONS).flat().filter(l => l.url && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(l.url)).length,
    };
    console.log(JSON.stringify({ total: ids.length, ...res }, null, 1));
    expect(res.noSched).toEqual([]);
    expect(res.noClass).toEqual([]);
    expect(res.emptyType).toEqual([]);
    expect(res.lessonOrphans).toEqual([]);
    expect(res.badUrl).toEqual([]);
  });
});
