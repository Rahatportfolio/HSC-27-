/** On-device Qwen2.5 model; weights are downloaded on demand, not bundled. */

export const AI_MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
export const AI_MODEL_DTYPE = 'q8';
/** Approximate size of the Q8 weights on disk, in megabytes. */
export const AI_MODEL_SIZE_MB = 1600;
/** Explicit choice: smaller files are easier to download but the model is less capable. */
export type AiModelChoice = 'light' | 'standard' | 'optimized' | 'gpu';
export const AI_MODELS: Record<AiModelChoice, { id: string; dtype: 'q8' | 'q4f16' | 'webgpu'; sizeMB: number }> = {
  gpu: { id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', dtype: 'webgpu', sizeMB: 1000 },
  optimized: { id: AI_MODEL_ID, dtype: 'q4f16', sizeMB: 1250 },
  light: { id: 'onnx-community/Qwen2.5-0.5B-Instruct', dtype: 'q8', sizeMB: 550 },
  standard: { id: AI_MODEL_ID, dtype: AI_MODEL_DTYPE, sizeMB: AI_MODEL_SIZE_MB },
};

export interface AiProgress {
  status: string;
  name?: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const AI_SYSTEM_PROMPT = [
  'You are Prostuti, a friendly HSC (Higher Secondary Certificate, Bangladesh) study assistant inside a study-planner app.',
  'Answer in the same language the student writes: Bengali, Banglish (Bengali in Latin letters), or English.',
  'Keep answers short, simple and practical. Explain HSC science concepts step by step (Physics, Chemistry, Biology, Higher Math, Bangla, English, ICT).',
  'Give MCQ and CQ exam tips when asked. Never claim to know the student\'s personal data, marks or routine.',
  'You cannot change app data. Never claim you added, moved, deleted, renamed, or saved a chapter. For chapter changes, tell the student to use Smart brain with the chapter name and subject.',
  'If you are unsure about something, say so honestly instead of inventing facts.',
].join(' ');

/** Map any engine/network failure to a clear Bengali message. Never leaks internals. */
export function aiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/quota|insufficient storage|not enough (?:disk|storage)|disk full/i.test(message)) {
    return 'ব্রাউজারে AI মডেলের জন্য জায়গা পর্যাপ্ত নয়। ডিভাইসে জায়গা খালি করে আবার চেষ্টা করো; পড়ার তথ্য মুছো না।';
  }
  if (/out of memory|memory access|allocation failed|cannot allocate/i.test(message)) {
    return 'মডেল চালাতে পর্যাপ্ত মেমোরি পাওয়া যায়নি। ছোট মডেল চেষ্টা করো বা অন্য ট্যাব বন্ধ করে আবার চেষ্টা করো।';
  }
  if (/failed to fetch|network|offline|load failed|net::/i.test(message)) {
    return 'ইন্টারনেট সংযোগ নেই বা ডাউনলোড ব্যর্থ হয়েছে। সংযোগ ঠিক করে আবার চেষ্টা করো।';
  }
  if (/webgpu|wasm|backend|onnx/i.test(message)) {
    return 'এই ডিভাইসে AI চালানোর সুবিধা পাওয়া যায়নি (WebGPU/WASM)। অন্য ব্রাউজার বা নতুন ডিভাইসে চেষ্টা করো। স্মার্ট ব্রেইন মোড তো সবসময় কাজ করবে।';
  }
  if (/404|not found|model.*not|file.*not/i.test(message)) {
    return 'AI মডেলের ফাইল পাওয়া যায়নি। পরে আবার চেষ্টা করো; স্মার্ট ব্রেইন মোড এখনই ব্যবহার করতে পারো।';
  }
  return 'AI চালু করা যায়নি। স্মার্ট ব্রেইন মোডে তোমার প্রশ্নের উত্তর এখনই পাবে; মডেলের জন্য পরে আবার চেষ্টা করো।';
}

interface WorkerReply {
  id: number;
  kind: 'progress' | 'result' | 'error';
  progress?: AiProgress;
  text?: string;
  message?: string;
}
type Pending = { resolve: (text: string) => void; reject: (error: Error) => void; onProgress?: (progress: AiProgress) => void };
let worker: Worker | null = null;
let workerChoice: AiModelChoice | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(choice: AiModelChoice): Worker {
  if (worker && workerChoice !== choice) throw new Error('Unload the current model before switching models');
  if (!worker) {
    const instance = choice === 'gpu'
      ? new Worker(new URL('./aiGpu.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./aiModel.worker.ts', import.meta.url), { type: 'module' });
    workerChoice = choice;
    instance.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (worker !== instance) return;
      const reply = event.data, task = pending.get(reply.id);
      if (!task) return;
      if (reply.kind === 'progress') { if (reply.progress) task.onProgress?.(reply.progress); return; }
      pending.delete(reply.id);
      if (reply.kind === 'error') task.reject(new Error(reply.message || 'AI worker failed'));
      else task.resolve(reply.text || '');
    };
    instance.onerror = event => {
      // A terminated worker may have already queued an event. It must not
      // reject requests that belong to a newer worker.
      if (worker !== instance) return;
      instance.terminate();
      worker = null;
      workerChoice = null;
      for (const task of pending.values()) task.reject(new Error('AI worker failed to start: ' + (event.message || 'unknown worker error')));
      pending.clear();
    };
    worker = instance;
  }
  return worker;
}

function request(kind: 'load' | 'chat', messages?: AiChatMessage[], onProgress?: (progress: AiProgress) => void, choice: AiModelChoice = 'standard'): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const instance = getWorker(choice), id = ++nextId;
      pending.set(id, { resolve, reject, onProgress });
      try { instance.postMessage({ id, kind, messages, model: AI_MODELS[choice].id, dtype: AI_MODELS[choice].dtype }); }
      catch (error) { pending.delete(id); throw error; }
    } catch (error) { reject(error instanceof Error ? error : new Error(String(error))); }
  });
}

/** Release the model and reject in-flight requests when leaving Study Brain. */
export function unloadAiModel(): void {
  worker?.terminate();
  worker = null;
  workerChoice = null;
  for (const task of pending.values()) task.reject(new Error('AI worker stopped'));
  pending.clear();
}

/** Download/load the model in a worker. A failed request can be retried. */
export async function loadAiModel(onProgress?: (progress: AiProgress) => void, choice: AiModelChoice = 'standard'): Promise<void> {
  await request('load', undefined, onProgress, choice);
}

/** One chat turn against the on-device model; inference never blocks the UI thread. */
export async function chatWithAi(history: AiChatMessage[], onProgress?: (progress: AiProgress) => void, choice: AiModelChoice = 'standard'): Promise<string> {
  const reply = await request('chat', [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...history], onProgress, choice);
  return reply || 'মডেল কোনো উত্তর দিতে পারেনি। আবার চেষ্টা করো, অথবা স্মার্ট ব্রেইন মোড ব্যবহার করো।';
}
