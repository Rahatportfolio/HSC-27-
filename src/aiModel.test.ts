import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_DTYPE, AI_MODEL_ID, AI_MODEL_SIZE_MB, TRANSFORMERS_CDN,
  aiErrorMessage, isAiModelCached,
} from './aiModel';

describe('on-device AI model configuration', () => {
  it('targets the 100–200 MB SmolLM2 instruct model', () => {
    expect(AI_MODEL_ID).toBe('HuggingFaceTB/SmolLM2-135M-Instruct');
    expect(AI_MODEL_DTYPE).toBe('q8');
    expect(AI_MODEL_SIZE_MB).toBeGreaterThanOrEqual(100);
    expect(AI_MODEL_SIZE_MB).toBeLessThanOrEqual(200);
  });

  it('loads the engine from the pinned transformers.js CDN', () => {
    expect(TRANSFORMERS_CDN).toContain('@huggingface/transformers@3.8.1');
    expect(TRANSFORMERS_CDN.startsWith('https://cdn.jsdelivr.net/npm/')).toBe(true);
  });

  it('reports not-cached when the Cache API is unavailable', async () => {
    await expect(isAiModelCached()).resolves.toBe(false);
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
