import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
      const buildId = createHash('sha256').update(JSON.stringify(shell)).digest('hex').slice(0, 12);
      await writeFile(workerPath, worker
        .replace(/const SHELL = \[[^\]]*\];/, `const SHELL = ${JSON.stringify(shell)};`)
        .replace(/const CACHE = '[^']*';/, `const CACHE = 'prostuti-hsc27-${buildId}';`));
    },
  };
}
export default defineConfig({
  base: './',
  plugins: [react(), offlineShell()],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  build: {
    manifest: true,
    // Split independent, cacheable libraries/data, not arbitrary slices of a
    // cyclic planner. Heavy optional feature routes remain dynamic imports.
    rollupOptions: { output: { manualChunks(id) {
      if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-runtime';
      if (id.includes('/node_modules/lucide-react/')) return 'icons';
      if (id.includes('/node_modules/@capacitor/core/')) return 'platform-runtime';
      if (/\/src\/(classLinks|data|questionBankIndex)\.ts$/.test(id)) return 'class-resources';
    } } },
  },
});
