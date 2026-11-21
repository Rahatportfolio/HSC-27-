import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

// Deliberately small correctness/security baseline; TypeScript's strict and
// no-unused checks remain separate. This is not a comprehensive security audit.
const rules = {
  'no-debugger': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-constant-binary-expression': 'error',
  'no-invalid-regexp': 'error',
  'no-loss-of-precision': 'error',
  'no-sparse-arrays': 'error',
  'no-unexpected-multiline': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'valid-typeof': 'error',
};

export default [
  { ignores: ['dist/**', 'build/**', 'node_modules/**', 'android/**', '.arena/**'] },
  { files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', '*.config.ts'], languageOptions: { parser: tsParser }, plugins: { 'react-hooks': reactHooks }, linterOptions: { reportUnusedDisableDirectives: 'off' }, rules },
  { files: ['src/**/*.{ts,tsx}'], ignores: ['src/**/*.test.{ts,tsx}', 'src/test/**'], rules: { 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error' } },
  { files: ['scripts/**/*.{js,mjs,cjs}', 'eslint.config.js'], rules },
];
