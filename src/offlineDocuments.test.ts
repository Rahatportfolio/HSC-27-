import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function worker(online: boolean) {
  const root = 'https://example.test/HSC-27-/', handlers: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, string>([[`${root}index.html`, 'APP'], [`${root}recovery.html`, 'RECOVERY']]);
  const puts: string[] = [];
  const key = (value: string | { url: string }) => new URL(typeof value === 'string' ? value : value.url, root).href.split('?')[0];
  const caches = {
    open: async () => ({ put: async (target: string | { url: string }, response: Response) => { puts.push(key(target)); stored.set(key(target), await response.text()); } }),
    match: async (target: string | { url: string }) => stored.has(key(target)) ? new Response(stored.get(key(target))) : undefined,
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: new URL(root).origin, href: `${root}sw.js` }, registration: { scope: root }, addEventListener: (event: string, fn: (event: unknown) => void) => { handlers[event] = fn; } },
    caches, URL, Response,
    fetch: async (request: { url: string }) => { if (!online) throw new Error('offline'); return new Response(request.url.includes('recovery.html') ? 'NEW RECOVERY' : 'NEW APP'); },
  });
  return {
    puts, stored,
    navigate: async (path: string) => {
      let response: Promise<Response> | undefined; const pending: Promise<unknown>[] = [];
      handlers.fetch({ request: { url: `${root}${path}`, method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<Response>) => { response = value; }, waitUntil: (value: Promise<unknown>) => { pending.push(value); } });
      const value = await response; await Promise.all(pending); return value?.text();
    },
  };
}
describe('offline recovery and application documents cannot overwrite each other', () => {
  it('caches a network recovery document under its own URL, never the app index', async () => {
    const w = worker(true); expect(await w.navigate('recovery.html')).toBe('NEW RECOVERY');
    expect(w.puts).toEqual(['https://example.test/HSC-27-/recovery.html']);
    expect(w.stored.get('https://example.test/HSC-27-/index.html')).toBe('APP');
  });
  it('serves the independent recovery document offline rather than booting React', async () => {
    const w = worker(false); expect(await w.navigate('recovery.html')).toBe('RECOVERY'); expect(w.puts).toEqual([]);
  });
  it.each(['', 'index.html', '?collect=1', 'index.html?collect=1'])('keeps app navigation %s in the index cache slot', async path => {
    const w = worker(true); expect(await w.navigate(path)).toBe('NEW APP'); expect(w.puts).toEqual(['https://example.test/HSC-27-/index.html']);
    const offline = worker(false); expect(await offline.navigate(path)).toBe('APP');
  });
});
