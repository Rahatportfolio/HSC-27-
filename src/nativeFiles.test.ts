import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  native: true,
  clear: vi.fn(),
  begin: vi.fn(),
  append: vi.fn(),
  commit: vi.fn(),
  abort: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
  estimate: vi.fn(),
  download: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock("./nativeFiles", () => ({
  hasNativeFiles: () => mock.native,
  NativeFiles: mock,
  nativeFileUrl: (s: string) => `native:${s}`,
}));
import {
  downloadToFile,
  clearFiles,
  getFile,
  playableFile,
  putFile,
  storageEstimate,
} from "./files";
beforeEach(() => {
  vi.clearAllMocks();
  mock.native = true;
  mock.clear.mockResolvedValue({ removed: 2 });
  mock.commit.mockResolvedValue(undefined);
  mock.abort.mockResolvedValue(undefined);
  mock.estimate.mockResolvedValue({ usage: 20, quota: 500 });
  mock.info.mockResolvedValue({ uri: "file:///private/video", size: 50 });
  mock.addListener.mockResolvedValue({ remove: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
describe("Android device storage adapter", () => {
  it("resets native media and prevents an in-flight download from resurrecting a cleared file", async () => {
    let finish!: (result: { size: number }) => void;
    mock.remove.mockResolvedValue(undefined);
    mock.download.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const download = downloadToFile(
      "https://example.org/movie.mp4",
      "late",
      "Video",
      undefined,
      "video",
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(await clearFiles()).toBe(2);
    finish({ size: 20 });
    expect(await download).toMatchObject({
      ok: false,
      error: expect.stringContaining("reset"),
    });
    expect(mock.remove).toHaveBeenCalledWith({ id: "late" });
  });

  it("keeps native PDF MIME for preview even when the local file server returns octet-stream", async () => {
    mock.info.mockResolvedValueOnce({
      id: "p",
      name: "P",
      createdAt: "2026-11-15T00:00:00Z",
      uri: "file:///p",
      size: 8,
      type: "application/pdf",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("%PDF-1.7", {
          headers: { "content-type": "application/octet-stream" },
        }),
      ),
    );
    expect((await getFile("p"))?.blob.type).toBe("application/pdf");
  });
  it("writes small chunks, commits atomically, and does not base64 an entire video at once", async () => {
    const blob = new Blob([new Uint8Array(600000)], { type: "video/mp4" });
    expect(
      await putFile({
        id: "v",
        blob,
        name: "Video",
        size: blob.size,
        createdAt: "2026-11-15T00:00:00Z",
      }),
    ).toBe(true);
    expect(mock.append).toHaveBeenCalledTimes(3);
    expect(mock.commit).toHaveBeenCalledWith({ id: "v" });
  });
  it("cleans staged chunks on failure instead of reporting success", async () => {
    mock.commit.mockRejectedValueOnce(new Error("disk full"));
    expect(
      await putFile({
        id: "v",
        blob: new Blob(["bytes"]),
        name: "V",
        size: 5,
        createdAt: "2026-11-15T00:00:00Z",
      }),
    ).toBe(false);
    expect(mock.abort).toHaveBeenCalledWith({ id: "v" });
  });
  it("streams native download with a progress listener and removes it afterward", async () => {
    const remove = vi.fn();
    mock.addListener.mockResolvedValue({ remove });
    mock.download.mockResolvedValue({ size: 1024 });
    const progress = vi.fn();
    expect(
      await downloadToFile(
        "https://example.org/a.mp4",
        "v",
        "Video",
        progress,
        "video",
      ),
    ).toEqual({ ok: true, size: 1024 });
    mock.addListener.mock.calls[0][1]({ id: "v", loaded: 512, total: 1024 });
    expect(progress).toHaveBeenCalledWith(512, 1024);
    expect(remove).toHaveBeenCalled();
  });
  it("plays native files through Capacitor without loading a video Blob into JS", async () => {
    expect((await playableFile("v"))?.url).toBe("native:file:///private/video");
    expect(await storageEstimate()).toEqual({ usage: 20, quota: 500 });
  });
});

it('does not claim a native file is fully deleted when legacy IndexedDB cleanup fails', async () => {
  vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('blocked', 'SecurityError'); } });
  mock.remove.mockResolvedValue(undefined);
  const { deleteFile } = await import('./files');
  expect(await deleteFile('legacy')).toBe(false);
  expect(mock.remove).not.toHaveBeenCalled();
});

it('retains the legacy file when native deletion fails', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  vi.stubGlobal('indexedDB', new IDBFactory());
  const { putFile, getFile, deleteFile } = await import('./files');
  mock.native = false;
  const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
  expect(await putFile({ id: 'legacy2', name: 'Notes', blob, size: blob.size, createdAt: '2026-11-20T00:00:00Z' })).toBe(true);
  mock.native = true;
  mock.remove.mockRejectedValueOnce(new Error('native store unavailable'));
  mock.info.mockRejectedValueOnce(new Error('native store unavailable'));
  expect(await deleteFile('legacy2')).toBe(false);
  expect((await getFile('legacy2'))?.size).toBe(blob.size);
});

it('falls back to a legacy file if the native file URL returns an error', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  vi.stubGlobal('indexedDB', new IDBFactory());
  mock.native = false;
  const blob = new Blob(['legacy content'], { type: 'application/pdf' });
  expect(await putFile({ id: 'legacy3', name: 'Notes', blob, size: blob.size, createdAt: '2026-11-20T00:00:00Z' })).toBe(true);
  mock.native = true;
  mock.info.mockResolvedValueOnce({ id: 'legacy3', uri: 'file:///missing', size: 14 });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
  expect((await getFile('legacy3'))?.size).toBe(blob.size);
});
