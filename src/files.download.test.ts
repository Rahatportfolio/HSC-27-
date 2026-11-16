import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadToFile } from "./files";
afterEach(() => vi.unstubAllGlobals());
describe("permitted downloads fail safely", () => {
  it("does not store a network error as a successful download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("CORS blocked")),
    );
    expect(
      await downloadToFile(
        "https://example.org/a.mp4",
        "v",
        "Video",
        undefined,
        "video",
      ),
    ).toEqual({ ok: false, error: "CORS blocked" });
  });
  it("rejects an HTML page masquerading as a video", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>private</html>", {
            headers: { "content-type": "text/html" },
          }),
        ),
    );
    expect(
      (
        await downloadToFile(
          "https://example.org/a.mp4",
          "v",
          "Video",
          undefined,
          "video",
        )
      ).ok,
    ).toBe(false);
  });
  it("checks actual PDF bytes instead of saving a login/Drive webpage", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Sign in</html>", {
            headers: { "content-type": "text/html" },
          }),
        ),
    );
    expect(await downloadToFile("https://example.org/a", "p", "PDF")).toEqual({
      ok: false,
      error: "URL did not return a PDF file",
    });
  });
  it("reports missing storage and never fabricates success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("%PDF-1.7\ndata", {
            headers: { "content-type": "application/pdf" },
          }),
        ),
    );
    const updates: number[] = [];
    expect(
      await downloadToFile("https://example.org/a", "p", "PDF", (_, total) =>
        updates.push(total),
      ),
    ).toEqual({ ok: false, error: "storage" });
    expect(updates).toEqual([0]);
  });
  it("rejects oversized downloads from their real response headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("data", {
            headers: {
              "content-length": "2000000000",
              "content-type": "video/mp4",
            },
          }),
        ),
    );
    expect(
      (
        await downloadToFile(
          "https://example.org/a.mp4",
          "v",
          "Video",
          undefined,
          "video",
        )
      ).error,
    ).toMatch(/Storage limit/);
  });
});
