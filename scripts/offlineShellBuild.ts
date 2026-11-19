/** Every byte matters, including unhashed recovery HTML/JS and the worker template.
 * A filename-only cache ID can leave a public-file-only fix permanently stale. */
import { createHash } from 'node:crypto';
export function offlineShellBuildId(files: readonly { path: string; bytes: Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    hash.update(JSON.stringify([file.path, file.bytes.byteLength]));
    hash.update(file.bytes);
  }
  return hash.digest('hex').slice(0, 12);
}
