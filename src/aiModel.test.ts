import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_MODEL_DTYPE, AI_MODEL_ID, AI_MODEL_SIZE_MB,
  aiErrorMessage, loadAiModel, chatWithAi, unloadAiModel,
} from './aiModel';

afterEach(() => { unloadAiModel(); vi.unstubAllGlobals(); });

describe('on-device AI model configuration', () => {
  it('targets the 100–200 MB SmolLM2 instruct model', () => {
    expect(AI_MODEL_ID).toBe('HuggingFaceTB/SmolLM2-135M-Instruct');
    expect(AI_MODEL_DTYPE).toBe('q8');
    expect(AI_MODEL_SIZE_MB).toBeGreaterThanOrEqual(100);
    expect(AI_MODEL_SIZE_MB).toBeLessThanOrEqual(200);
  });


});

describe('aiErrorMessage', () => {
  it('explains network failures in Bengali', () => {
    expect(aiErrorMessage(new Error('Failed to fetch'))).toContain('ইন্টারনেট');
  });

  it('explains missing WebGPU/WASM support', () => {
    expect(aiErrorMessage(new Error('WebGPU backend unavailable'))).toContain('WebGPU');
  });

  it('explains missing model files', () => {
    expect(aiErrorMessage(new Error('404 Not Found'))).toContain('পাওয়া যায়নি');
  });

  it('never leaks an empty or raw error', () => {
    const message = aiErrorMessage(undefined);
    expect(message.length).toBeGreaterThan(20);
    expect(message).not.toContain('undefined');
  });
});

describe('AI worker lifecycle', () => {
  it('releases RAM, rejects pending work, and permits a later retry', async () => {
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((event: { data: { id: number; kind: string; text?: string } }) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { FakeWorker.instances.push(this); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const loading = loadAiModel();
    expect(FakeWorker.instances).toHaveLength(1);
    const instance = FakeWorker.instances[0];
    const id = instance.postMessage.mock.calls[0][0].id;
    instance.onmessage?.({ data: { id, kind: 'result' } });
    await expect(loading).resolves.toBeUndefined();
    const reply = chatWithAi([{ role: 'user', content: 'Hello' }]);
    const rejected = expect(reply).rejects.toThrow('AI worker stopped');
    unloadAiModel();
    await rejected;
    expect(instance.terminate).toHaveBeenCalledOnce();
    const next = loadAiModel();
    expect(FakeWorker.instances).toHaveLength(2);
    const newWorker = FakeWorker.instances[1];
    newWorker.onmessage?.({ data: { id: newWorker.postMessage.mock.calls[0][0].id, kind: 'result' } });
    await expect(next).resolves.toBeUndefined();
  });
});
