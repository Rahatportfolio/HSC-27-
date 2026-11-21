import { describe, expect, it, vi } from 'vitest';
import { limitAiProgress } from './aiProgress';

describe('AI progress updates', () => {
  it('coalesces thousands of byte events without losing percentage changes or status events', () => {
    const send = vi.fn();
    const emit = limitAiProgress(send);
    emit({ status: 'download', name: 'model', file: 'weights.onnx' });
    for (let i = 0; i <= 10000; i++) emit({ status: 'progress', name: 'model', file: 'weights.onnx', loaded: i, total: 10000, progress: i / 100 });
    emit({ status: 'done', name: 'model', file: 'weights.onnx' });
    expect(send).toHaveBeenCalledTimes(103);
    expect(send.mock.calls[0][0].status).toBe('download');
    expect(send.mock.calls.at(-1)![0].status).toBe('done');
    expect(send.mock.calls.at(-2)![0]).toMatchObject({ loaded: 10000, progress: 100 });
  });

  it('tracks separate files and permits a second read of the same file', () => {
    const send = vi.fn();
    const emit = limitAiProgress(send);
    for (const [file, progress] of [['first', 0], ['second', 0], ['first', 100], ['first', 0], ['first', 0]] as const) {
      emit({ status: 'progress', name: 'model', file, progress });
    }
    expect(send.mock.calls.map(([event]) => [event.file, event.progress])).toEqual([
      ['first', 0], ['second', 0], ['first', 100], ['first', 0],
    ]);
  });

  it('bounds byte events without known percentages and passes lifecycle events', () => {
    const send = vi.fn();
    const emit = limitAiProgress(send);
    for (let loaded = 0; loaded <= 4 * 1024 * 1024; loaded += 1024) emit({ status: 'progress', name: 'model', file: 'file', loaded });
    emit({ status: 'ready' });
    expect(send).toHaveBeenCalledTimes(6);
    expect(send.mock.calls.at(-1)![0].status).toBe('ready');
  });
});
