import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Precache the actual hashed build, so even a first-time visitor can reopen offline.
function offlineShell(): Plugin {
  return {
    name: 'prostuti-offline-shell',
    apply: 'build',
    async closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile())
        .map(entry => join(entry.parentPath || entry.path, entry.name));
      const shell = [...new Set(['./', './index.html', ...files
        .map(file => './' + file.slice(dist.length + 1).split('\\').join('/'))
        .filter(file => file !== './sw.js')])];
      const workerPath = join(dist, 'sw.js');
      const worker = await readFile(workerPath, 'utf8');
      await writeFile(workerPath, worker.replace(/const SHELL = \[[^\]]*\];/, `const SHELL = ${JSON.stringify(shell)};`));
    },
  };
}
export default defineConfig({
  base: './',
  plugins: [react(), offlineShell()],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true },
});
