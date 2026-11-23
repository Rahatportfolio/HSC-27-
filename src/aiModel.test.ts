import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_MODEL_DTYPE, AI_MODEL_ID, AI_MODEL_SIZE_MB, AI_MODELS,
  aiErrorMessage, loadAiModel, chatWithAi, unloadAiModel,
} from './aiModel';

afterEach(() => { unloadAiModel(); vi.unstubAllGlobals(); });

describe('on-device AI model configuration', () => {
  it('targets the on-device Qwen instruct model', () => {
    expect(AI_MODEL_ID).toBe('onnx-community/Qwen2.5-1.5B-Instruct');
    expect(AI_MODEL_DTYPE).toBe('q8');
    expect(AI_MODEL_SIZE_MB).toBeGreaterThanOrEqual(1500);
    expect(AI_MODEL_SIZE_MB).toBeLessThanOrEqual(1800);
    expect(AI_MODELS.light.id).toContain('0.5B');
    expect(AI_MODELS.light.sizeMB).toBeLessThan(AI_MODEL_SIZE_MB);
  });


});

describe('aiErrorMessage', () => {
  it('explains network failures in Bengali', () => {
    expect(aiErrorMessage(new Error('Failed to fetch'))).toContain('ইন্টারনেট');
  });

  it('explains storage and memory errors without suggesting data deletion', () => {
    expect(aiErrorMessage(new Error('QuotaExceededError'))).toContain('জায়গা');
    expect(aiErrorMessage(new Error('out of memory'))).toContain('মেমোরি');
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
  it('uses the chosen model for loading and the subsequent chat', async () => {
    class FakeWorker {
      static instance: FakeWorker;
      onmessage: ((event: { data: { id: number; kind: string; text?: string } }) => void) | null = null;
      onerror = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { FakeWorker.instance = this; }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const loading = loadAiModel(undefined, 'light');
    const w = FakeWorker.instance;
    expect(w.postMessage.mock.calls[0][0].model).toBe(AI_MODELS.light.id);
    w.onmessage?.({ data: { id: w.postMessage.mock.calls[0][0].id, kind: 'result' } });
    await loading;
    const chat = chatWithAi([{ role: 'user', content: 'Hello' }], undefined, 'light');
    expect(w.postMessage.mock.calls[1][0].model).toBe(AI_MODELS.light.id);
    w.onmessage?.({ data: { id: w.postMessage.mock.calls[1][0].id, kind: 'result', text: 'Hello' } });
    await expect(chat).resolves.toBe('Hello');
  });

  it('does not reject a replacement worker request on a late error from the terminated worker', async () => {
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((event: { data: { id: number; kind: string } }) => void) | null = null;
      onerror: ((event: { message: string }) => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { FakeWorker.instances.push(this); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const first = loadAiModel();
    const stopped = expect(first).rejects.toThrow('AI worker stopped');
    const previous = FakeWorker.instances[0];
    unloadAiModel();
    await stopped;
    const replacement = loadAiModel();
    const result = expect(replacement).resolves.toBeUndefined();
    previous.onerror?.({ message: 'late error' });
    const current = FakeWorker.instances[1];
    current.onmessage?.({ data: { id: current.postMessage.mock.calls[0][0].id, kind: 'result' } });
    await result;
    expect(current.terminate).not.toHaveBeenCalled();
  });

  it('rejects a current worker error and starts a new worker on retry', async () => {
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((event: { data: { id: number; kind: string } }) => void) | null = null;
      onerror: ((event: { message: string }) => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { FakeWorker.instances.push(this); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const first = loadAiModel();
    const rejected = expect(first).rejects.toThrow('worker failed to start: failed');
    FakeWorker.instances[0].onerror?.({ message: 'failed' });
    await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const retry = loadAiModel();
    const next = FakeWorker.instances[1];
    next.onmessage?.({ data: { id: next.postMessage.mock.calls[0][0].id, kind: 'result' } });
    await expect(retry).resolves.toBeUndefined();
  });

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
