/**
 * On-device AI model: SmolLM2-135M-Instruct (Q8, about 140 MB).
 *
 * The weights are deliberately NOT bundled. GitHub cannot store a single file
 * larger than 100 MB, and shipping 140 MB inside the site would slow every
 * first visit. Instead the app downloads the model once from Hugging Face
 * through the transformers.js engine (loaded from a CDN, only when this
 * feature is opened), the browser caches it, and afterwards the AI runs
 * fully offline on the device (WebGPU when available, WASM fallback).
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

interface AiGenerator {
  (messages: AiChatMessage[], options?: Record<string, unknown>): Promise<Array<{ generated_text: AiChatMessage[] }>>;
}

interface TransformersModule {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<AiGenerator>;
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
    return 'ইন্টারনেট সংযোগ নেই বা ডাউনলোড ব্যর্থ হয়েছে। সংযোগ ঠিক করে আবার চেষ্টা করো। মডেল একবার ডাউনলোড হয়ে গেলে আর ইন্টারনেট লাগবে না।';
  }
  if (/webgpu|wasm|backend|onnx/i.test(message)) {
    return 'এই ডিভাইসে AI চালানোর সুবিধা পাওয়া যায়নি (WebGPU/WASM)। অন্য ব্রাউজার বা নতুন ডিভাইসে চেষ্টা করো। স্মার্ট ব্রেইন মোড তো সবসময় কাজ করবে।';
  }
  if (/404|not found|model.*not|file.*not/i.test(message)) {
    return 'AI মডেলের ফাইল পাওয়া যায়নি। পরে আবার চেষ্টা করো; স্মার্ট ব্রেইন মোড এখনই ব্যবহার করতে পারো।';
  }
  return 'AI চালু করা যায়নি। স্মার্ট ব্রেইন মোডে তোমার প্রশ্নের উত্তর এখনই পাবে; মডেলের জন্য পরে আবার চেষ্টা করো।';
}

/** True when the model files are already in the browser cache (no download needed). */
export async function isAiModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      if (requests.some(request => request.url.includes('SmolLM2-135M-Instruct'))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

let generatorPromise: Promise<AiGenerator> | null = null;

/**
 * Load (and, on first use, download) the on-device model.
 * The engine itself is fetched from the CDN only when this is called, so the
 * main app bundle never carries it. Rejects with a Bengali-friendly error.
 */
export function loadAiModel(onProgress?: (progress: AiProgress) => void): Promise<AiGenerator> {
  if (!generatorPromise) {
    generatorPromise = (async (): Promise<AiGenerator> => {
      let mod: TransformersModule;
      try {
        mod = await import(/* @vite-ignore */ TRANSFORMERS_CDN) as TransformersModule;
      } catch {
        throw new Error('Failed to fetch the AI engine.');
      }
      const options: Record<string, unknown> = {
        dtype: AI_MODEL_DTYPE,
        progress_callback: (progress: AiProgress) => onProgress?.(progress),
      };
      try {
        return await mod.pipeline('text-generation', AI_MODEL_ID, options);
      } catch (firstError) {
        // WebGPU can exist but fail in some WebViews; retry once on plain WASM.
        try {
          return await mod.pipeline('text-generation', AI_MODEL_ID, { ...options, device: 'wasm' });
        } catch {
          throw firstError;
        }
      }
    })();
    // Allow a later retry after a failure instead of caching the rejection.
    generatorPromise.catch(() => { generatorPromise = null; });
  }
  return generatorPromise;
}

/** One chat turn against the on-device model. Returns the assistant reply text. */
export async function chatWithAi(history: AiChatMessage[], onProgress?: (progress: AiProgress) => void): Promise<string> {
  const generator = await loadAiModel(onProgress);
  const output = await generator(
    [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...history],
    { max_new_tokens: 256, temperature: 0.7, top_p: 0.9, do_sample: true },
  );
  const messages = output?.[0]?.generated_text ?? [];
  const last = messages[messages.length - 1];
  return last?.content?.trim() || 'মডেল কোনো উত্তর দিতে পারেনি। আবার চেষ্টা করো, অথবা স্মার্ট ব্রেইন মোড ব্যবহার করো।';
}
