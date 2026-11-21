import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const lint = input => spawnSync(process.execPath, [
  'node_modules/eslint/bin/eslint.js', '--stdin', '--stdin-filename', 'src/lint-regression.ts',
], { encoding: 'utf8', input });

test('lint baseline accepts valid TypeScript and rejects risky JavaScript constructs', () => {
  const valid = lint('const value: number = 1;\nconsole.log(value);\n');
  assert.equal(valid.status, 0, valid.stderr + valid.stdout);
  const invalid = lint("debugger;\nconst x = { a: 1, a: 2 };\neval('2');\n");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stdout, /no-debugger/);
  assert.match(invalid.stdout, /no-dupe-keys/);
  assert.match(invalid.stdout, /no-eval/);
});
