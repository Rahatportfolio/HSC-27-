// @vitest-environment jsdom
/** Independent recovery must work even when every application import is broken. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const primary = 'hsc27-prostuti-v1', previous = `${primary}-recovery`;
function start() {
  const html = readFileSync('public/recovery.html', 'utf8');
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1];
  // This is deliberately a classic independent script, not an imported app module.
  window.eval(readFileSync('public/recovery.js', 'utf8'));
}
const click = (id: string) => (document.getElementById(id) as HTMLButtonElement).click();
const text = () => (document.getElementById('recovery-json') as HTMLTextAreaElement).value;
const status = () => document.getElementById('recovery-status')!.textContent!;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('read-only startup recovery outside React', () => {
  it('ships a readable pre-React fallback that remains in the HTML on a failed entry import', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('id="startup-recovery"');
    expect(html).toContain('href="./recovery.html"');
    expect(html).toContain('#root:not(:empty) + #startup-recovery');
    expect(html).toContain('<noscript>');
  });
  it.each([
    '  {"notes":{"2026-11-20":"বাংলা <script>no HTML execution</script>"}}\n',
    '{"a": "truncated evidence',
    'null',
  ])('shows exact raw primary bytes without parsing, repairing or writing storage: %s', raw => {
    localStorage.setItem(primary, raw); localStorage.setItem(`${primary}-saved-at`, 'keep original stamp');
    const set = vi.spyOn(Storage.prototype, 'setItem'), remove = vi.spyOn(Storage.prototype, 'removeItem'), clear = vi.spyOn(Storage.prototype, 'clear');
    start(); click('recovery-profile');
    expect(text()).toBe(raw); expect(document.querySelector('#recovery-json')!.getAttribute('readonly')).not.toBeNull();
    expect(document.querySelector('#recovery-json script')).toBeNull();
    expect(set).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${primary}-saved-at`)).toBe('keep original stamp');
  });
  it('keeps the old raw recovery evidence separate from the primary snapshot', () => {
    localStorage.setItem(primary, 'primary'); localStorage.setItem(previous, 'unrepaired previous'); start();
    click('recovery-profile'); expect(text()).toBe('primary'); click('recovery-old'); expect(text()).toBe('unrepaired previous');
    expect(localStorage.getItem(primary)).toBe('primary');
  });
  it('reports absent storage without producing an empty successful backup', () => {
    start(); click('recovery-profile'); expect(status()).toContain('No saved JSON found'); expect(text()).toBe('');
    expect((document.getElementById('recovery-download') as HTMLButtonElement).disabled).toBe(true);
  });
  it('distinguishes denied storage access from an absent profile, keeping any previously shown evidence', () => {
    localStorage.setItem(primary, 'keep displayed evidence'); start(); click('recovery-profile');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('privacy denied'); });
    click('recovery-old'); expect(status()).toContain('Cannot read'); expect(text()).toBe('keep displayed evidence');
  });
  it('does not claim clipboard success when neither clipboard API nor manual-copy command works', async () => {
    localStorage.setItem(primary, 'copy these exact bytes');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    const copy = vi.fn(() => false); vi.stubGlobal('document', document); Object.defineProperty(document, 'execCommand', { configurable: true, value: copy });
    start(); click('recovery-profile'); click('recovery-copy'); await new Promise(resolve => setTimeout(resolve, 0));
    expect(status()).toContain('select and copy'); expect(text()).toBe('copy these exact bytes');
  });
  it('only reports copied after the clipboard operation succeeds', async () => {
    const writeText = vi.fn(async () => undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    localStorage.setItem(primary, '  unmodified bytes\n'); start(); click('recovery-profile'); click('recovery-copy');
    await new Promise(resolve => setTimeout(resolve, 0)); expect(writeText).toHaveBeenCalledWith('  unmodified bytes\n'); expect(status()).toContain('Copied');
  });
  it('uses a parser-compatible classic script without application imports or destructive operations', () => {
    const script = readFileSync('public/recovery.js', 'utf8');
    expect(script).not.toMatch(/\b(?:import|export|const|let|async|await)\s|=>|\?\./);
    expect(script).not.toMatch(/localStorage\.(?:setItem|removeItem|clear)|indexedDB\.deleteDatabase|caches\.delete|fetch\(|XMLHttpRequest/);
    const html = readFileSync('public/recovery.html', 'utf8');
    expect(html).toContain('Do not uninstall or clear app data');
    expect(html).toContain('not SQLite'); expect(html).toContain('not images');
  });
});
