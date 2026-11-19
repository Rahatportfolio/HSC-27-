// @vitest-environment jsdom
/** Simulated IFrame API contract tests; NOT a real YouTube-duration audit. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectYouTubeDuration } from './youtubeDuration';

const url = 'https://www.youtube.com/watch?v=abcdefghijk';
let destroyed = 0;
beforeEach(() => { vi.useFakeTimers(); destroyed = 0; document.body.replaceChildren(); });
afterEach(() => { vi.useRealTimers(); delete window.YT; });
function installPlayer(options: { seconds?: number; id?: string; isLive?: boolean; error?: boolean; throw?: boolean } = {}) {
  class Player {
    constructor(target: HTMLElement, config: { events: { onReady: () => void; onError: () => void } }) {
      if (options.throw) throw new Error('API constructor failed');
      target.replaceWith(document.createElement('iframe'));
      queueMicrotask(() => options.error ? config.events.onError() : config.events.onReady());
    }
    getDuration() { return options.seconds ?? 8 * 3600; }
    getVideoData() { return { video_id: options.id || 'abcdefghijk', isLive: options.isLive ?? false }; }
    destroy() { destroyed++; }
  }
  window.YT = { Player };
}
function mount() { const element = document.createElement('div'); document.body.append(element); return element; }
describe('browser metadata lifecycle', () => {
  it('reads only the selected finite non-live video and destroys the replaced child without replacing React’s container', async () => {
    installPlayer(); const container = mount(); const parent = container.parentElement;
    const result = inspectYouTubeDuration(url, container, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(350);
    expect(await result).toBe(480); expect(destroyed).toBe(1); expect(container.parentElement).toBe(parent); expect(container.children.length).toBe(0);
  });
  it('aborts and destroys an in-flight player instead of returning a default duration', async () => {
    installPlayer({ seconds: 0 }); const container = mount(); const controller = new AbortController();
    const result = inspectYouTubeDuration(url, container, controller.signal); const rejected = expect(result).rejects.toThrow('Cancelled');
    await vi.advanceTimersByTimeAsync(1); controller.abort(); await rejected; expect(destroyed).toBe(1); expect(container.children.length).toBe(0);
  });
  it('rejects blocked embedding and permits manual duration fallback without leaving an iframe behind', async () => {
    installPlayer({ error: true }); const container = mount(); const result = inspectYouTubeDuration(url, container, new AbortController().signal); const rejected = expect(result).rejects.toThrow(/blocked/);
    await vi.advanceTimersByTimeAsync(1); await rejected; expect(destroyed).toBe(1); expect(container.children.length).toBe(0);
  });
  it('times out for mismatched metadata rather than assigning a different video’s duration', async () => {
    installPlayer({ id: 'wrongvideo1' }); const container = mount(); const result = inspectYouTubeDuration(url, container, new AbortController().signal); const rejected = expect(result).rejects.toThrow(/did not provide/);
    await vi.advanceTimersByTimeAsync(20010); await rejected; expect(destroyed).toBe(1); expect(container.children.length).toBe(0);
  });
  it('cleans up a failed constructor and does not fetch a playlist as a chapter video', async () => {
    installPlayer({ throw: true }); const container = mount(); await expect(inspectYouTubeDuration(url, container, new AbortController().signal)).rejects.toThrow('API constructor failed'); expect(container.children.length).toBe(0);
    await expect(inspectYouTubeDuration('https://www.youtube.com/playlist?list=PLexample', container, new AbortController().signal)).rejects.toThrow(/single/);
  });
});
