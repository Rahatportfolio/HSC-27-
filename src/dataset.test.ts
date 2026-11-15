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
      badPlaylistId: Object.values(CHAPTER_CLASSES).flatMap(c => [...c.oneShot, ...c.mcq, ...c.cq]).filter(o => o.kind === 'playlist' && o.url.split('list=')[1].length !== 34).map(o => o.url),
      badVideoId: Object.values(CHAPTER_CLASSES).flatMap(c => [...c.oneShot, ...c.mcq, ...c.cq]).filter(o => o.kind === 'video' && o.url.split('v=')[1].length !== 11).map(o => o.url),
      duplicateLinks: Object.entries(CHAPTER_CLASSES).filter(([, c]) => { const urls = [...c.oneShot, ...c.mcq, ...c.cq].map(o => o.url); return new Set(urls).size !== urls.length; }).map(([id]) => id),
    };
    console.log(JSON.stringify({ total: ids.length, ...res }, null, 1));
    expect(res.noSched).toEqual([]);
    expect(res.noClass).toEqual([]);
    expect(res.emptyType).toEqual([]);
    expect(res.lessonOrphans).toEqual([]);
    expect(res.badUrl).toEqual([]);
    expect(res.badPlaylistId).toEqual([]);
    expect(res.badVideoId).toEqual([]);
    expect(res.duplicateLinks).toEqual([]);
    expect(Object.values(CHAPTER_CLASSES).flatMap(c => [c.oneShot, c.mcq, c.cq]).every(list => list.length >= 2)).toBe(true);
  });
});
