import { describe, expect, it } from 'vitest';
import { verifiedPlayerMinutes, youtubeVideoId } from './youtubeDuration';
import type { DurationPlayer } from './youtubeDuration';
const id = 'abcdefghijk';
const player = (seconds = 8 * 3600, video = id, live = false): DurationPlayer => ({ getDuration: () => seconds, getVideoData: () => ({ video_id: video, isLive: live }), destroy: () => {} });
describe('actual YouTube duration metadata, never a guessed chapter estimate', () => {
  it('accepts exact video IDs on public YouTube URLs, not a channel search or playlist total', () => {
    expect(youtubeVideoId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(youtubeVideoId(`https://youtu.be/${id}`)).toBe(id);
    expect(youtubeVideoId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    for (const url of ['https://www.youtube.com/playlist?list=PLexample', 'https://www.youtube.com/@teacher/search?query=chapter', `https://youtube.com.evil.example/watch?v=${id}`, `javascript:alert(1)`, `https://user:pass@youtube.com/watch?v=${id}`]) expect(youtubeVideoId(url)).toBeNull();
  });
  it('keeps an eight-hour class as 480 minutes, not an 80-minute block', () => expect(verifiedPlayerMinutes(player(), id)).toBe(480));
  it('accepts a finite archived broadcast, but rejects metadata that does not establish it is no longer live', () => {
    expect(verifiedPlayerMinutes({ ...player(), getVideoData: () => ({ video_id: id, isLive: false, isLiveContent: true }) }, id)).toBe(480);
    expect(() => verifiedPlayerMinutes({ ...player(), getVideoData: () => ({ video_id: id }) }, id)).toThrow();
  });
  it('preserves source seconds rather than rounding a short video up to a whole session', () => expect(verifiedPlayerMinutes(player(721), id)).toBe(721 / 60));
  for (const [label, p] of [['zero', player(0)], ['NaN', player(NaN)], ['Infinity', player(Infinity)], ['wrong video', player(14400, 'wrongvideo1')], ['live', player(14400, id, true)]] as const)
    it(`rejects ${label} metadata and cannot quietly return a default`, () => expect(() => verifiedPlayerMinutes(p, id)).toThrow());
});
