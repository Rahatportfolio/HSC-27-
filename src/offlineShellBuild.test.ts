import { describe, expect, it } from 'vitest';
import { offlineShellBuildId } from '../scripts/offlineShellBuild';
const file = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) });
const files = [file('index.html', 'app entry'), file('recovery.html', 'independent help'), file('recovery.js', 'independent code'), file('sw.js', 'worker template')];
describe('offline cache identity includes unhashed public-file bytes', () => {
  it('is deterministic regardless of filesystem enumeration order', () => {
    expect(offlineShellBuildId(files)).toBe(offlineShellBuildId([...files].reverse()));
    expect(offlineShellBuildId(files)).toMatch(/^[a-f0-9]{12}$/);
  });
  it.each(files.map(value => value.path))('changes when only %s changes, even with identical filenames', path => {
    expect(offlineShellBuildId(files.map(value => value.path === path ? file(path, 'a real new fix') : value))).not.toBe(offlineShellBuildId(files));
  });
  it('includes paths and lengths, not just concatenated content', () => {
    expect(offlineShellBuildId([file('a', 'bc'), file('d', 'ef')])).not.toBe(offlineShellBuildId([file('a', 'b'), file('d', 'cef')]));
    expect(offlineShellBuildId([file('a', 'abc')])).not.toBe(offlineShellBuildId([file('b', 'abc')]));
  });
});
