import { hasNativeFiles, NativeFiles } from "./nativeFiles";
import type { AppData } from "./planner";
import { parseBackup, newId } from "./storage";
import { getFile, putFile, deleteFile, storageEstimate } from "./files";
import type { StoredFile } from "./files";

// Versioned binary container, not base64 JSON: PDFs/videos keep their original bytes.
const MAGIC = "PROSTUTI-MEDIA-1\n";
const CHUNK = 4 * 1024 * 1024;
async function hashes(blob: Blob): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    const h = await crypto.subtle.digest(
      "SHA-256",
      await blob.slice(offset, offset + CHUNK).arrayBuffer(),
    );
    out.push(
      Array.from(new Uint8Array(h))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
  }
  return out;
}
interface Entry {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  hashes: string[];
}
interface Manifest {
  version: 1;
  data: AppData;
  files: Entry[];
}
export async function createMediaBackup(
  data: AppData,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const refs = [
    ...data.pdfs.filter((p) => p.local).map((p) => p.id),
    ...(data.advanced?.classes.filter((c) => c.local).map((c) => c.id) || []),
  ];
  const files: StoredFile[] = [];
  for (const id of new Set(refs)) {
    const file = await getFile(id);
    if (!file)
      throw new Error(
        `Offline file missing: ${id}. Remove the missing download or re-download before full backup.`,
      );
    files.push(file);
    onProgress?.(files.length, refs.length);
  }
  const manifest: Manifest = { version: 1, data, files: [] };
  for (const f of files)
    manifest.files.push({
      id: f.id,
      name: f.name,
      size: f.blob.size,
      type: f.blob.type,
      createdAt: f.createdAt,
      hashes: await hashes(f.blob),
    });
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, json.length);
  return new Blob([MAGIC, length, json, ...files.map((f) => f.blob)], {
    type: "application/vnd.prostuti.backup",
  });
}
export async function inspectMediaBackup(
  blob: Blob,
): Promise<{ data: AppData; files: StoredFile[] }> {
  const magicLength = new TextEncoder().encode(MAGIC).length;
  if ((await blob.slice(0, magicLength).text()) !== MAGIC)
    throw new Error("Not a Prostuti full backup");
  const lengthBytes = await blob
    .slice(magicLength, magicLength + 4)
    .arrayBuffer();
  if (lengthBytes.byteLength !== 4) throw new Error("Truncated backup");
  const length = new DataView(lengthBytes).getUint32(0);
  if (
    length > 32 * 1024 * 1024 ||
    length === 0 ||
    magicLength + 4 + length > blob.size
  )
    throw new Error("Invalid manifest length");
  const manifest = JSON.parse(
    await blob.slice(magicLength + 4, magicLength + 4 + length).text(),
  ) as Manifest;
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 1500
  )
    throw new Error("Unsupported backup");
  const data = parseBackup(JSON.stringify(manifest.data));
  const refs = new Set([
    ...data.pdfs.filter((p) => p.local).map((p) => p.id),
    ...(data.advanced?.classes.filter((c) => c.local).map((c) => c.id) || []),
  ]);
  const seen = new Set<string>();
  let offset = magicLength + 4 + length;
  const files: StoredFile[] = [];
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !refs.has(entry.id) ||
      seen.has(entry.id) ||
      typeof entry.name !== "string" ||
      entry.name.length > 500 ||
      typeof entry.type !== "string" ||
      entry.type.length > 200 ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > 2_000_000_000 ||
      typeof entry.createdAt !== "string" ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      offset + entry.size > blob.size
    )
      throw new Error("Invalid or truncated media entry");
    seen.add(entry.id);
    const bytes = blob.slice(offset, offset + entry.size, entry.type);
    offset += entry.size;
    if (
      data.pdfs.some((p) => p.id === entry.id) &&
      !(await bytes.slice(0, 5).text()).startsWith("%PDF-")
    )
      throw new Error("Invalid PDF in backup");
    if (
      !Array.isArray(entry.hashes) ||
      entry.hashes.length !== Math.ceil(entry.size / CHUNK) ||
      entry.hashes.some(
        (h) => typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h),
      )
    )
      throw new Error("Missing media checksum");
    const actual = await hashes(bytes);
    if (actual.some((h, i) => h !== entry.hashes[i]))
      throw new Error("Media checksum mismatch: backup is damaged");
    files.push({ ...entry, blob: bytes });
  }
  if (offset !== blob.size || refs.size !== seen.size)
    throw new Error("Missing files / trailing bytes");
  return { data, files };
}
/** Stage under fresh ids. Existing progress and old files are never overwritten.
 * On failure the staged files are removed; commit metadata only after all writes succeed. */
export async function stageMediaRestore(
  backup: Awaited<ReturnType<typeof inspectMediaBackup>>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ data: AppData; rollback: () => Promise<void> }> {
  const estimate = await storageEstimate();
  const needed = backup.files.reduce((s, f) => s + f.size, 0);
  if (estimate && needed > estimate.quota - estimate.usage - 5 * 1024 * 1024)
    throw new Error("Not enough free storage to restore safely");
  const staged: string[] = [];
  const mapping = new Map<string, string>();
  const rollback = async () => {
    for (const id of staged) await deleteFile(id);
  };
  try {
    for (const f of backup.files) {
      const id = newId();
      if (!(await putFile({ ...f, id })))
        throw new Error("File restore failed: storage full or unavailable");
      staged.push(id);
      mapping.set(f.id, id);
      onProgress?.(staged.length, backup.files.length);
    }
    const data: AppData = {
      ...backup.data,
      pdfs: backup.data.pdfs.map((p) => ({
        ...p,
        id: mapping.get(p.id) || p.id,
      })),
      pdfBookmarks: backup.data.pdfBookmarks.map((id) => mapping.get(id) || id),
      pdfRecent: backup.data.pdfRecent.map((p) => ({
        ...p,
        id: mapping.get(p.id) || p.id,
      })),
    };
    if (data.advanced)
      data.advanced = {
        ...data.advanced,
        classes: data.advanced.classes.map((c) => ({
          ...c,
          id: mapping.get(c.id) || c.id,
        })),
      };
    // Class references and video task completion identifiers follow the remapped media id.
    data.pdfs = data.pdfs.map((p) => ({
      ...p,
      ...(p.classId ? { classId: mapping.get(p.classId) || p.classId } : {}),
    }));
    data.completed = Object.fromEntries(
      Object.entries(data.completed).map(([id, at]) => {
        if (!id.startsWith("smart-video|")) return [id, at];
        const parts = id.split("|");
        parts[1] = encodeURIComponent(
          mapping.get(decodeURIComponent(parts[1])) ||
            decodeURIComponent(parts[1]),
        );
        return [parts.join("|"), at];
      }),
    );
    return { data, rollback };
  } catch (error) {
    await rollback();
    throw error;
  }
}
export async function saveBackupBlob(blob: Blob, name: string): Promise<void> {
  if (hasNativeFiles()) {
    const id = newId();
    if (
      !(await putFile({
        id,
        blob,
        name,
        size: blob.size,
        createdAt: new Date().toISOString(),
      }))
    )
      throw new Error("Not enough storage to prepare native export");
    try {
      await NativeFiles.exportFile({ id, name, type: blob.type });
    } catch (error) {
      if ((error as { code?: string }).code === "EXPORT_CANCELLED") {
        const e = new Error("Cancelled");
        e.name = "AbortError";
        throw e;
      }
      throw error;
    } finally {
      await deleteFile(id);
    }
    return;
  }
  // Use the system share sheet when supported, otherwise the standard browser download.
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ files: [file], title: "Prostuti full backup" });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
