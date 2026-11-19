/** Canonical synthetic profiles packaged only in the instrumentation test APK. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { freshData } from '../src/planner';
import { parseBackup } from '../src/storage';
import { personalDataFixture } from '../src/test/personalRoutineFixture';

export function nativeTestProfiles() {
  const legacy = freshData(), personal = personalDataFixture();
  return Object.fromEntries(Object.entries({ legacy, personal }).map(([name, data]) => {
    data.routineSetupRequired = false;
    data.settings.language = 'en'; data.settings.fontScale = 'lg';
    data.notes['2026-11-20'] = 'Synthetic native test note — keep through navigation and restart';
    return [name, parseBackup(JSON.stringify(data))];
  }));
}
export const nativeProfilePath = (name: string) => new URL(`../android/app/src/androidTest/assets/native-${name}-profile.json`, import.meta.url);

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  for (const [name, data] of Object.entries(nativeTestProfiles())) {
    const expected = `${JSON.stringify(data, null, 2)}\n`, path = nativeProfilePath(name);
    if (process.argv.includes('--check')) assert.equal(await readFile(path, 'utf8'), expected, `Regenerate stale ${name} instrumentation profile`);
    else await writeFile(path, expected);
  }
  console.log('PASS canonical legacy + S-only native instrumentation profiles');
}
