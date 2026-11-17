// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adjustImage, loadImageToCanvas, perspectiveCorrect, rotateCanvas } from './scanner';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const canvasContext = () => ({ translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() });

describe('scanner edits preserve the original page pixels', () => {
  it('changes contrast around the midpoint rather than making the slider nearly ineffective', () => {
    const pixels = new Uint8ClampedArray([64, 128, 192, 255]);
    const image = { data: pixels };
    const context = { getImageData: vi.fn(() => image), putImageData: vi.fn() };
    adjustImage({ width: 1, height: 1, getContext: () => context } as unknown as HTMLCanvasElement, { contrast: 200 });
    expect([...pixels]).toEqual([0, 128, 255, 255]);
    expect(context.putImageData).toHaveBeenCalledWith(image, 0, 0);
  });

  it('keeps neutral contrast/brightness and the alpha channel unchanged', () => {
    const pixels = new Uint8ClampedArray([64, 128, 192, 80]);
    const context = { getImageData: () => ({ data: pixels }), putImageData: vi.fn() };
    adjustImage({ width: 1, height: 1, getContext: () => context } as unknown as HTMLCanvasElement, {});
    expect([...pixels]).toEqual([64, 128, 192, 80]);
    adjustImage({ width: 1, height: 1, getContext: () => context } as unknown as HTMLCanvasElement, { contrast: 0 });
    expect([...pixels]).toEqual([128, 128, 128, 80]);
  });

  it.each([[90, 2, 4], [270, 2, 4], [-90, 2, 4], [180, 4, 2]])('rotates %s degrees within an expanded, centred output canvas', (angle, width, height) => {
    const context = canvasContext(), oldOffscreenContext = canvasContext();
    const output = { width: 0, height: 0, getContext: () => context };
    vi.spyOn(document, 'createElement').mockReturnValue(output as unknown as HTMLCanvasElement);
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return oldOffscreenContext; }
    });
    const original = { width: 4, height: 2 } as HTMLCanvasElement;
    expect(rotateCanvas(original, angle)).toBe(output);
    expect([output.width, output.height]).toEqual([width, height]);
    expect(context.translate).toHaveBeenCalledWith(width / 2, height / 2);
    expect(context.drawImage).toHaveBeenCalledWith(original, -2, -1);
  });

  it('copies source pixels during perspective correction rather than sampling a blank destination', () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 200, 80, 90, 100, 255]);
    const read = vi.fn(() => ({ data: pixels }));
    const image = { data: new Uint8ClampedArray(16) };
    const outputContext = { createImageData: vi.fn(() => image), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })), putImageData: vi.fn() };
    const output = { width: 0, height: 0, getContext: () => outputContext };
    vi.spyOn(document, 'createElement').mockReturnValue(output as unknown as HTMLCanvasElement);
    const source = { width: 2, height: 2, getContext: () => ({ getImageData: read }) } as unknown as HTMLCanvasElement;
    perspectiveCorrect(source, { tl: [0, 0], tr: [2, 0], br: [2, 2], bl: [0, 2] }, 2, 2);
    expect(read).toHaveBeenCalledExactlyOnceWith(0, 0, 2, 2);
    expect(outputContext.putImageData).toHaveBeenCalledExactlyOnceWith(image, 0, 0);
    expect([...image.data]).toEqual([...pixels]);
  });

  it('rejects and releases the uploaded-image URL if drawing the decoded file fails', async () => {
    vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => ({ drawImage: () => { throw new Error('Canvas allocation failed'); } }) } as unknown as HTMLCanvasElement);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:scanner-upload'), revokeObjectURL });
    vi.stubGlobal('Image', class {
      naturalWidth = 4; naturalHeight = 2;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    await expect(loadImageToCanvas(new File(['pixels'], 'notes.png', { type: 'image/png' }))).rejects.toThrow('Canvas allocation failed');
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:scanner-upload');
  });

  it.each([false, true])('releases a temporary uploaded-image URL on success/failure (%s)', async fail => {
    const context = canvasContext();
    vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => context } as unknown as HTMLCanvasElement);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:scanner-upload'), revokeObjectURL });
    vi.stubGlobal('Image', class {
      naturalWidth = 4; naturalHeight = 2;
      onload: (() => void) | null = null;
      onerror: ((error: Event) => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => fail ? this.onerror?.(new Event('error')) : this.onload?.());
      }
    });
    const loading = loadImageToCanvas(new File(['pixels'], 'notes.png', { type: 'image/png' }));
    if (fail) await expect(loading).rejects.toBeDefined();
    else await expect(loading).resolves.toMatchObject({ width: 4, height: 2 });
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:scanner-upload');
  });
});
