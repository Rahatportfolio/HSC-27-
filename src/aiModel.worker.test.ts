import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  pipeline: vi.fn(),
  env: { backends: { onnx: { wasm: {} } } },
}));
vi.mock('@huggingface/transformers', () => ({ pipeline: fake.pipeline, env: fake.env }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

describe('AI model worker progress', () => {
  it('does not flood the UI with byte progress but still returns the loaded model', async () => {
    const sent = vi.fn();
    vi.stubGlobal('postMessage', sent);
    vi.stubGlobal('onmessage', null);
    fake.pipeline.mockImplementation(async (_task, _name, options) => {
      options.progress_callback({ status: 'download', name: 'model', file: 'weights' });
      for (let i = 0; i <= 10000; i++) options.progress_callback({ status: 'progress', name: 'model', file: 'weights', progress: i / 100, loaded: i, total: 10000 });
      options.progress_callback({ status: 'done', name: 'model', file: 'weights' });
      return vi.fn();
    });
    await import('./aiModel.worker');
    const worker = globalThis as unknown as { onmessage: (event: { data: { id: number; kind: string; model: string; dtype: string } }) => void };
    worker.onmessage({ data: { id: 1, kind: 'load', model: 'model', dtype: 'q8' } });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ id: 1, kind: 'result' }));
    expect(sent.mock.calls.filter(([message]) => message.kind === 'progress')).toHaveLength(103);
    expect(fake.pipeline.mock.calls[0][2]).toMatchObject({ device: 'wasm' });
    expect(fake.pipeline.mock.calls[0][2].session_options).toBeUndefined();
    expect(sent.mock.calls.at(-1)![0]).toEqual({ id: 1, kind: 'result' });
  });
  it('limits generated answer length to reduce memory growth', async () => {
    const sent = vi.fn();
    const model = vi.fn().mockResolvedValue([{ generated_text: [{ role: 'assistant', content: 'Water' }] }]);
    vi.stubGlobal('postMessage', sent); vi.stubGlobal('onmessage', null);
    fake.pipeline.mockResolvedValue(model);
    await import('./aiModel.worker');
    const worker = globalThis as unknown as { onmessage: (event: { data: unknown }) => void };
    worker.onmessage({ data: { id: 2, kind: 'chat', model: 'model', dtype: 'q4f16', messages: [{ role: 'user', content: 'Question' }] } });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ id: 2, kind: 'result', text: 'Water' }));
    expect(model.mock.calls[0][1]).toMatchObject({ max_new_tokens: 80 });
    expect(fake.pipeline.mock.calls[0][2]).toMatchObject({ session_options: { graphOptimizationLevel: 'disabled' } });
  });

});
