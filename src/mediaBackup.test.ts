import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshData } from "./planner";
import { emptyAdvanced } from "./advanced";
import { CHAPTERS } from "./data";
import {
  createMediaBackup,
  inspectMediaBackup,
  stageMediaRestore,
} from "./mediaBackup";
import type { StoredFile } from "./files";
const store = vi.hoisted(() => new Map<string, StoredFile>());
const fail = vi.hoisted(() => ({ after: Infinity }));
vi.mock("./files", () => ({
  getFile: vi.fn(async (id: string) => store.get(id) || null),
  putFile: vi.fn(async (f: StoredFile) => {
    if (--fail.after < 0) return false;
    store.set(f.id, f);
    return true;
  }),
  deleteFile: vi.fn(async (id: string) => store.delete(id)),
  storageEstimate: vi.fn(async () => ({ usage: 0, quota: 1_000_000_000 })),
}));
const setup = () => {
  const d = freshData();
  d.advanced = {
    ...emptyAdvanced(),
    classes: [
      {
        id: "video",
        title: "Video",
        url: "https://example.org/a.mp4",
        chapterId: CHAPTERS[0].id,
        teacher: "T",
        duration: 100,
        watched: 50,
        position: 50,
        speed: 1,
        permitted: true,
        local: true,
        note: "My class note",
      },
    ],
  };
  d.pdfs = [
    {
      id: "pdf",
      title: "PDF",
      material: "notes",
      createdAt: "2026-11-15T00:00:00Z",
      local: true,
      classId: "video",
    },
  ];
  for (const [id, bytes, type] of [
    ["pdf", "%PDF-1.7\nhello", "application/pdf"],
    ["video", "video bytes", "video/mp4"],
  ]) {
    const blob = new Blob([bytes], { type });
    store.set(id, {
      id,
      name: id,
      blob,
      size: blob.size,
      createdAt: "2026-11-15T00:00:00Z",
    });
  }
  return d;
};
beforeEach(() => {
  store.clear();
  fail.after = Infinity;
});
describe("full media backup and safe staged restore", () => {
  it("round-trips actual PDF/video bytes plus metadata and leaves originals untouched", async () => {
    const data = setup();
    const bytes = await createMediaBackup(data);
    const parsed = await inspectMediaBackup(bytes);
    expect(parsed.data).toEqual(data);
    expect(await parsed.files[0].blob.text()).toBe("%PDF-1.7\nhello");
    const staged = await stageMediaRestore(parsed);
    const video = staged.data.advanced!.classes[0];
    expect(video.id).not.toBe("video");
    expect(video.note).toBe("My class note");
    expect(staged.data.pdfs[0].classId).toBe(video.id);
    expect(store.has("video")).toBe(true);
    expect(await store.get(video.id)!.blob.text()).toBe("video bytes");
    await staged.rollback();
    expect([...store.keys()]).toEqual(["pdf", "video"]);
  });
  it("restores media around malformed legacy completion keys without erasing them or failing the backup", async () => {
    const data = setup();
    const at = "2026-11-20T08:00:00Z";
    data.completed = {
      "smart-video|%|0|30000": at,
      "smart-video|video|NaN|30000": at,
      "smart-video|video|0|50000": at,
    };
    const original = JSON.stringify(data);
    const parsed = await inspectMediaBackup(await createMediaBackup(data));
    const staged = await stageMediaRestore(parsed);
    const id = staged.data.advanced!.classes[0].id;
    expect(staged.data.completed).toEqual({
      "smart-video|%|0|30000": at,
      "smart-video|video|NaN|30000": at,
      [`smart-video|${encodeURIComponent(id)}|0|50000`]: at,
    });
    expect(JSON.stringify(data)).toBe(original);
    await staged.rollback();
    expect([...store.keys()]).toEqual(["pdf", "video"]);
  });
  it("rejects truncation, corruption and missing source files without altering existing data", async () => {
    const data = setup();
    const full = await createMediaBackup(data);
    await expect(
      inspectMediaBackup(full.slice(0, full.size - 1)),
    ).rejects.toThrow();
    const corrupt = new Blob([full.slice(0, full.size - 1), "x"]);
    await expect(inspectMediaBackup(corrupt)).rejects.toThrow(/checksum/);
    store.delete("video");
    await expect(createMediaBackup(data)).rejects.toThrow(/missing/);
  });
  it("rolls staged files back on storage failure, never overwriting existing files", async () => {
    const data = setup();
    const parsed = await inspectMediaBackup(await createMediaBackup(data));
    fail.after = 1;
    await expect(stageMediaRestore(parsed)).rejects.toThrow(/restore failed/);
    expect([...store.keys()]).toEqual(["pdf", "video"]);
  });
});
