/** Optional GPU engine. The worker never sends chat text to a server. */
import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import type { MLCEngine } from '@mlc-ai/web-llm';

interface Message { role: 'system' | 'user' | 'assistant'; content: string }
interface Request { id: number; kind: 'load' | 'chat'; messages?: Message[] }
const MODEL = 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC';
const worker = globalThis as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: unknown) => void };
let engine: Promise<MLCEngine> | null = null;

async function getEngine(id: number): Promise<MLCEngine> {
  if (!engine) {
    engine = (async () => {
      if (!navigator.gpu || !await navigator.gpu.requestAdapter()) throw new Error('WebGPU unavailable');
      const record = prebuiltAppConfig.model_list.find(item => item.model_id === MODEL);
      if (!record) throw new Error('Model configuration not found');
      return CreateMLCEngine(MODEL, {
        appConfig: { model_list: [record] },
        initProgressCallback: report => worker.postMessage({ id, kind: 'progress', progress: {
          status: 'progress_total', progress: Math.max(0, Math.min(100, report.progress * 100)),
        } }),
      }, { context_window_size: 1024 });
    })();
    engine.catch(() => { engine = null; });
  }
  return engine;
}
worker.onmessage = event => {
  const request = event.data;
  void (async () => {
    try {
      const model = await getEngine(request.id);
      if (request.kind === 'load') worker.postMessage({ id: request.id, kind: 'result' });
      else {
        const stream = await model.chat.completions.create({ messages: request.messages ?? [], max_tokens: 128, temperature: 0.7, stream: true });
        let text = '';
        for await (const chunk of stream) {
          text += chunk.choices[0]?.delta?.content || '';
          if (text.trim()) worker.postMessage({ id: request.id, kind: 'partial', text });
        }
        worker.postMessage({ id: request.id, kind: 'result', text: text.trim() });
      }
    } catch (error) {
      worker.postMessage({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  })();
};
