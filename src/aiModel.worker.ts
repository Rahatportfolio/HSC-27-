import { pipeline, env } from '@huggingface/transformers';
import { limitAiProgress } from './aiProgress';
import wasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import mjsUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
/** Run inference away from the UI thread, especially on Android WebView. */
interface AiChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface Generator { (messages: AiChatMessage[], options: Record<string, unknown>): Promise<Array<{ generated_text: AiChatMessage[] }>> }
interface Request { id: number; kind: 'load' | 'chat'; model: string; dtype: 'q8'; messages?: AiChatMessage[] }
const worker = globalThis as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: unknown) => void };
let generator: Promise<Generator> | null = null;
let activeModel: string | null = null;

function load(request: Request): Promise<Generator> {
  if (generator && activeModel !== request.model) return Promise.reject(new Error('Unload the current model before switching models.'));
  if (!generator) {
    activeModel = request.model;
    generator = (async () => {
      env.backends.onnx.wasm!.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
      return await pipeline('text-generation', request.model, {
        dtype: request.dtype,
        device: 'wasm',
        progress_callback: limitAiProgress(progress => worker.postMessage({ id: request.id, kind: 'progress', progress })),
      }) as unknown as Generator;
    })();
    generator.catch(() => { generator = null; activeModel = null; });
  }
  return generator;
}
worker.onmessage = event => {
  const request = event.data;
  void (async () => {
    try {
      const model = await load(request);
      if (request.kind === 'load') {
        worker.postMessage({ id: request.id, kind: 'result' });
      } else {
        const output = await model(request.messages ?? [], { max_new_tokens: 256, temperature: 0.7, top_p: 0.9, do_sample: true });
        const messages = output?.[0]?.generated_text ?? [];
        worker.postMessage({ id: request.id, kind: 'result', text: messages[messages.length - 1]?.content?.trim() || '' });
      }
    } catch (error) {
      worker.postMessage({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  })();
};
