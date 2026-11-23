import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  create: vi.fn(),
  config: { model_list: [{ model_id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', model: 'test', model_lib: 'test' }] },
}));
vi.mock('@mlc-ai/web-llm', () => ({ CreateMLCEngine: fake.create, prebuiltAppConfig: fake.config }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

describe('optional local GPU worker', () => {
  it('reports unsupported WebGPU before downloading a model', async () => {
    const sent = vi.fn();
    vi.stubGlobal('navigator', {}); vi.stubGlobal('postMessage', sent); vi.stubGlobal('onmessage', null);
    await import('./aiGpu.worker');
    const scope = globalThis as unknown as { onmessage: (event: { data: unknown }) => void };
    scope.onmessage({ data: { id: 1, kind: 'load' } });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ id: 1, kind: 'error', message: 'WebGPU unavailable' }));
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('loads one local engine, reports overall progress and sends chat only to the engine', async () => {
    const sent = vi.fn();
    const createAnswer = vi.fn().mockImplementation(async () => (async function* () { yield { choices: [{ delta: { content: 'Water' } }] }; yield { choices: [{ delta: { content: '.' } }] }; })());
    vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn().mockResolvedValue({}) } });
    vi.stubGlobal('postMessage', sent); vi.stubGlobal('onmessage', null);
    fake.create.mockImplementation(async (_id, config) => {
      config.initProgressCallback({ progress: 0.5 });
      return { chat: { completions: { create: createAnswer } } };
    });
    await import('./aiGpu.worker');
    const scope = globalThis as unknown as { onmessage: (event: { data: unknown }) => void };
    scope.onmessage({ data: { id: 1, kind: 'load' } });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ id: 1, kind: 'result' }));
    expect(sent).toHaveBeenCalledWith({ id: 1, kind: 'progress', progress: { status: 'progress_total', progress: 50 } });
    const messages = [{ role: 'user', content: 'What is water?' }];
    scope.onmessage({ data: { id: 2, kind: 'chat', messages } });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ id: 2, kind: 'result', text: 'Water.' }));
    expect(fake.create).toHaveBeenCalledOnce();
    expect(sent).toHaveBeenCalledWith({ id: 2, kind: 'partial', text: 'Water' });
    expect(createAnswer).toHaveBeenCalledWith(expect.objectContaining({ messages, max_tokens: 128, stream: true }));
  });
});
