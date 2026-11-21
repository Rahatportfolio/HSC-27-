/** Progress payloads supplied by Transformers.js, including per-file events. */
export interface AiProgress {
  status: string;
  name?: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

/**
 * Keep individual loading phases and file boundaries, but avoid sending a
 * WebView message for every network chunk. Percentages shown to the user are
 * whole numbers; without a known total, forward roughly one event per MiB.
 */
export function limitAiProgress(forward: (event: AiProgress) => void): (event: AiProgress) => void {
  const buckets = new Map<string, string>();
  return event => {
    if (event.status === 'progress' || event.status === 'progress_total') {
      const key = JSON.stringify([event.status, event.name ?? '', event.file ?? '']);
      let bucket: string | null = null;
      if (typeof event.progress === 'number' && Number.isFinite(event.progress)) {
        bucket = `percent:${Math.floor(event.progress)}`;
      } else if (typeof event.loaded === 'number' && Number.isFinite(event.loaded)) {
        bucket = `bytes:${Math.floor(event.loaded / (1024 * 1024))}`;
      }
      if (bucket !== null) {
        if (buckets.get(key) === bucket) return;
        buckets.set(key, bucket);
      }
    }
    forward(event);
  };
}
