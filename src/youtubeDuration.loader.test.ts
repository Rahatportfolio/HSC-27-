// @vitest-environment jsdom
/** Simulated script/network lifecycle only; never a live YouTube-content audit. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const url = 'https://www.youtube.com/watch?v=abcdefghijk';
let readDuration: typeof import('./youtubeDuration')['inspectYouTubeDuration'];
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); document.head.replaceChildren(); document.body.replaceChildren();
  delete window.YT; delete window.onYouTubeIframeAPIReady;
  readDuration = (await import('./youtubeDuration')).inspectYouTubeDuration;
});
afterEach(async () => { await vi.runOnlyPendingTimersAsync(); vi.useRealTimers(); delete window.YT; delete window.onYouTubeIframeAPIReady; });
function mount() { const target = document.createElement('div'); document.body.append(target); return target; }
function ready() {
  window.YT = { Player: class {
    constructor(_target: HTMLElement, options: { events: { onReady: () => void } }) { queueMicrotask(options.events.onReady); }
    getDuration() { return 26734; }
    getVideoData() { return { video_id: 'abcdefghijk', isLive: false }; }
    destroy() { /* Simulated contract. */ }
  } };
  window.onYouTubeIframeAPIReady?.();
}
const scripts = () => document.querySelectorAll<HTMLScriptElement>('script[data-prostuti-youtube-api]');

describe('full recheck: retryable, cancellable YouTube API loading', () => {
  it('cancels immediately while the API script is still unavailable, without waiting twenty seconds', async () => {
    const controller = new AbortController(), container = mount();
    const result = readDuration(url, container, controller.signal);
    let rejected = '';
    void result.catch(error => { rejected = error.message; });
    controller.abort(); await vi.advanceTimersByTimeAsync(1);
    expect(rejected).toBe('Cancelled');
    expect(container.childElementCount).toBe(0);
  });
  it('removes a stalled API script after timeout and creates a fresh one for a real retry', async () => {
    const first = readDuration(url, mount(), new AbortController().signal);
    const firstFailure = expect(first).rejects.toThrow(/timed out/), original = scripts()[0];
    await vi.advanceTimersByTimeAsync(20001); await firstFailure;
    expect(original.isConnected).toBe(false);
    const retry = readDuration(url, mount(), new AbortController().signal);
    expect(scripts()).toHaveLength(1); expect(scripts()[0]).not.toBe(original);
    ready(); await vi.advanceTimersByTimeAsync(1);
    expect(await retry).toBe(26734 / 60);
  });
  it('does not let another integration’s throwing readiness callback break a valid duration read', async () => {
    const previous = vi.fn(() => { throw new Error('Unrelated player callback failed'); });
    window.onYouTubeIframeAPIReady = previous;
    const result = readDuration(url, mount(), new AbortController().signal);
    void result.catch(() => {}); // Retain the assertion failure without an unrelated unhandled timeout.
    expect(() => ready()).not.toThrow(); await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(26734 / 60); expect(previous).toHaveBeenCalledOnce();
    expect(window.onYouTubeIframeAPIReady).toBe(previous);
  });
  it('shares the script but not cancellation across two simultaneous requests', async () => {
    const controller = new AbortController();
    const first = readDuration(url, mount(), controller.signal), second = readDuration(url, mount(), new AbortController().signal);
    const cancelled = expect(first).rejects.toThrow('Cancelled');
    expect(scripts()).toHaveLength(1); controller.abort(); ready(); await vi.advanceTimersByTimeAsync(1);
    await cancelled; expect(await second).toBe(26734 / 60);
  });
});
