/** A per-tab breadcrumb, never a prompt or study data. Best effort only. */
const KEY = 'prostuti-ai-attempt-v1';
export type AiAttempt = 'loading' | 'answering';
export function recordAiAttempt(stage: AiAttempt): void {
  try { sessionStorage.setItem(KEY, stage); } catch { /* unavailable in private/restricted contexts */ }
}
export function clearAiAttempt(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* unavailable */ }
}
export function previousAiAttempt(): AiAttempt | null {
  try {
    const stage = sessionStorage.getItem(KEY);
    return stage === 'loading' || stage === 'answering' ? stage : null;
  } catch { return null; }
}
