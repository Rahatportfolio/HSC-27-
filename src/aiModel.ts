/**
 * On-device AI model: SmolLM2-135M-Instruct (Q8, about 140 MB).
 *
 * The weights are deliberately NOT bundled. GitHub cannot store a single file
 * larger than 100 MB, and shipping 140 MB inside the site would slow every
 * first visit. Instead the app downloads the model once from Hugging Face
 * through the transformers.js engine (loaded from a CDN, only when this
 * feature is opened), the browser may cache it. Generation runs locally, but the remote runtime
 * and cache eviction mean offline startup is not guaranteed.
 *
 * The built-in rule-based brain in aiBrain.ts answers instantly with no
 * download at all; this module is only for open-ended chat.
 */

export const AI_MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';
export const AI_MODEL_DTYPE = 'q8';
/** Approximate size of the Q8 weights on disk, in megabytes. */
export const AI_MODEL_SIZE_MB = 140;
/** transformers.js v3 engine, loaded on demand so the app bundle stays lean. */
export const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';

export interface AiProgress {
  status: string;
  name?: string;
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
  'If you are unsure about something, say so honestly instead of inventing facts.',
].join(' ');

/** Map any engine/network failure to a clear Bengali message. Never leaks internals. */
export function aiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
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
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    const instance = new Worker(new URL('./aiModel.worker.ts', import.meta.url), { type: 'module' });
    instance.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data, task = pending.get(reply.id);
      if (!task) return;
      if (reply.kind === 'progress') { if (reply.progress) task.onProgress?.(reply.progress); return; }
      pending.delete(reply.id);
      if (reply.kind === 'error') task.reject(new Error(reply.message || 'AI worker failed'));
      else task.resolve(reply.text || '');
    };
    instance.onerror = () => {
      instance.terminate();
      if (worker === instance) worker = null;
      for (const task of pending.values()) task.reject(new Error('AI worker failed to start'));
      pending.clear();
    };
    worker = instance;
  }
  return worker;
}

function request(kind: 'load' | 'chat', messages?: AiChatMessage[], onProgress?: (progress: AiProgress) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const instance = getWorker(), id = ++nextId;
      pending.set(id, { resolve, reject, onProgress });
      try { instance.postMessage({ id, kind, messages, cdn: TRANSFORMERS_CDN, model: AI_MODEL_ID, dtype: AI_MODEL_DTYPE }); }
      catch (error) { pending.delete(id); throw error; }
    } catch (error) { reject(error instanceof Error ? error : new Error(String(error))); }
  });
}

/** Download/load the model in a worker. A failed request can be retried. */
export async function loadAiModel(onProgress?: (progress: AiProgress) => void): Promise<void> {
  await request('load', undefined, onProgress);
}

/** One chat turn against the on-device model; inference never blocks the UI thread. */
export async function chatWithAi(history: AiChatMessage[], onProgress?: (progress: AiProgress) => void): Promise<string> {
  const reply = await request('chat', [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...history], onProgress);
  return reply || 'মডেল কোনো উত্তর দিতে পারেনি। আবার চেষ্টা করো, অথবা স্মার্ট ব্রেইন মোড ব্যবহার করো।';
}
