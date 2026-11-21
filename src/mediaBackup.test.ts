import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshData } from "./planner";
import { emptyAdvanced } from "./advanced";
import { CHAPTERS } from "./data";
import { applyManualSchedule } from "./scheduleEdit";
import type { Day, Task } from "./planner";
import {
  createMediaBackup,
  inspectMediaBackup,
  stageMediaRestore,
} from "./mediaBackup";
import type { StoredFile } from "./files";
const store = vi.hoisted(() => new Map<string, StoredFile>());
const fail = vi.hoisted(() => ({ after: Infinity }));
const scanStore = vi.hoisted(() => new Map<string, string>());
const scanFail = vi.hoisted(() => ({ after: Infinity }));
vi.mock('./storage-manager', () => ({
  idbGet: vi.fn(async (key: string) => scanStore.get(key)),
  idbSet: vi.fn(async (key: string, value: string) => {
    if (--scanFail.after < 0) return null;
    scanStore.set(key, value);
    return new TextEncoder().encode(value).length;
  }),
  idbDelete: vi.fn(async (key: string) => scanStore.delete(key)),
}));
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
  scanStore.clear();
  scanFail.after = Infinity;
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

const scanImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const withScans = () => {
  const data = setup();
  data.scannedNotes = [{ id: 'scan-note', title: 'Handwritten physics', subject: 'physics', createdAt: '2026-11-20T08:00:00Z', pageCount: 2, sizeBytes: scanImage.length * 2, pdfExported: false, pageKeys: ['scan:one', 'scan:two'] }];
  scanStore.set('scan:one', scanImage); scanStore.set('scan:two', scanImage);
  return data;
};
describe('full backup includes the actual handwritten pages, not just their titles', () => {
  it('restores scan image bytes under fresh keys, updates metadata and rolls both stores back', async () => {
    const data = withScans();
    const full = await createMediaBackup(data);
    scanStore.clear(); // A fresh install has no old image store.
    const parsed = await inspectMediaBackup(full);
    const staged = await stageMediaRestore(parsed);
    const keys = staged.data.scannedNotes[0].pageKeys;
    expect(keys).toHaveLength(2);
    expect(keys.every(key => !data.scannedNotes[0].pageKeys.includes(key))).toBe(true);
    expect(keys.map(key => scanStore.get(key))).toEqual([scanImage, scanImage]);
    expect(data.scannedNotes[0].pageKeys).toEqual(['scan:one', 'scan:two']);
    await staged.rollback();
    expect(scanStore.size).toBe(0);
    expect([...store.keys()]).toEqual(['pdf', 'video']);
  });
  it('rejects scan metadata that promises more pages than its export references', async () => {
    const data = withScans(); data.scannedNotes[0].pageKeys = [];
    await expect(createMediaBackup(data)).rejects.toThrow(/scan|missing/i);
  });
  it('refuses a supposedly full export when a scanned page is missing', async () => {
    const data = withScans(); scanStore.delete('scan:two');
    await expect(createMediaBackup(data)).rejects.toThrow(/scan.*missing|missing.*scan/i);
  });
  it('rolls back PDF, video and earlier scanned pages when a later scan write fails', async () => {
    const data = withScans();
    const parsed = await inspectMediaBackup(await createMediaBackup(data));
    scanFail.after = 1;
    await expect(stageMediaRestore(parsed)).rejects.toThrow(/scan|stor|restore/i);
    expect([...store.keys()]).toEqual(['pdf', 'video']);
    expect([...scanStore.keys()]).toEqual(['scan:one', 'scan:two']);
  });
  it.each([{ pageKeys: ['scan:one', 'scan:two'] }, { pageKeys: [] }])('warns that a legacy v1 archive cannot supply missing scanned image bytes (%j)', async ({ pageKeys }) => {
    const data = freshData();
    data.scannedNotes = withScans().scannedNotes.map(note => ({ ...note, pageKeys }));
    const json = new TextEncoder().encode(JSON.stringify({ version: 1, data, files: [] }));
    const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, json.length);
    const legacy = new Blob(['PROSTUTI-MEDIA-1\n', length, json]);
    const parsed = await inspectMediaBackup(legacy);
    expect(parsed.data.scannedNotes).toEqual(data.scannedNotes);
    expect(parsed.warnings!.join(' ')).toMatch(/scan/i);
  });
  it('rejects a v2 manifest that promises scanned pages but contains no image references', async () => {
    const data = freshData();
    data.scannedNotes = withScans().scannedNotes.map(note => ({ ...note, pageKeys: [] }));
    const json = new TextEncoder().encode(JSON.stringify({ version: 2, data, files: [], scans: [] }));
    const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, json.length);
    await expect(inspectMediaBackup(new Blob(['PROSTUTI-MEDIA-1\n', length, json]))).rejects.toThrow(/scan|missing/i);
  });
  it('detects damaged scanned-image bytes before writing any restored file', async () => {
    const bytes = new Uint8Array(await (await createMediaBackup(withScans())).arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    await expect(inspectMediaBackup(new Blob([bytes]))).rejects.toThrow(/checksum|damaged/i);
    expect([...store.keys()]).toEqual(['pdf', 'video']);
    expect([...scanStore.keys()]).toEqual(['scan:one', 'scan:two']);
  });
});

it('remaps every saved reference to a restored video task, not just its completion', async () => {
  const data = setup();
  const task = 'smart-video|video|0|50000';
  const other = 'smart-video|%|0|50000';
  data.completed = { [task]: '2026-11-20T08:00:00Z', [other]: '2026-11-20T08:00:00Z' };
  data.taskEdits = { [task]: { date: '2026-11-22', title: 'My changed class' }, [other]: { title: 'Keep malformed' } };
  data.removedTasks = [task, other];
  data.dayOverrides = { '2026-11-22': { taskMinutes: { [task]: 30, [other]: 25 }, taskStartMinutes: { [task]: 480 } } };
  data.carryovers = [{ id: 'carry', taskId: task, title: 'Class', subject: 'physics', minutes: 30, fromDate: '2026-11-20', date: '2026-11-22', createdAt: '2026-11-20T08:00:00Z' }];
  data.revisions = [{ id: 'r', chapterId: CHAPTERS[0].id, subject: CHAPTERS[0].subject, dueDate: '2026-11-22', interval: 1, createdAt: '2026-11-20T08:00:00Z', sourceTaskId: task }];
  const parsed = await inspectMediaBackup(await createMediaBackup(data));
  const staged = await stageMediaRestore(parsed);
  const id = staged.data.advanced!.classes[0].id;
  const remapped = `smart-video|${encodeURIComponent(id)}|0|50000`;
  expect(staged.data.completed[remapped]).toBe(data.completed[task]);
  expect(staged.data.taskEdits[remapped]).toEqual(data.taskEdits[task]);
  expect(staged.data.removedTasks).toEqual([remapped, other]);
  expect(staged.data.dayOverrides['2026-11-22'].taskMinutes).toEqual({ [remapped]: 30, [other]: 25 });
  expect(staged.data.dayOverrides['2026-11-22'].taskStartMinutes).toEqual({ [remapped]: 480 });
  expect(staged.data.carryovers[0].taskId).toBe(remapped);
  expect(staged.data.revisions[0].sourceTaskId).toBe(remapped);
  expect(staged.data.taskEdits[other]).toEqual(data.taskEdits[other]);
  const taskAfter: Task = { id: remapped, date: '2026-11-20', dayIndex: 1, phase: 'learn', subject: 'physics', kind: 'learn', title: 'Original', detail: '', chapterIds: [CHAPTERS[0].id], startMinute: 480, endMinute: 510 };
  const days: Day[] = [
    { date: '2026-11-20', index: 1, phase: 'learn', tasks: [taskAfter], isCatchup: false },
    { date: '2026-11-22', index: 2, phase: 'learn', tasks: [], isCatchup: false },
  ];
  expect(applyManualSchedule(days, staged.data).flatMap(day => day.tasks)).toEqual([]);
  const visible = applyManualSchedule(days, { ...staged.data, removedTasks: [] });
  expect(visible[1].tasks[0]).toMatchObject({ id: remapped, title: 'My changed class', date: '2026-11-22' });
  expect(data.taskEdits[task].title).toBe('My changed class');
  await staged.rollback();
});
