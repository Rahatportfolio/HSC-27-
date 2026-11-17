import { hasNativeFiles, NativeFiles } from "./nativeFiles";
import type { AppData } from "./planner";
import { parseBackup, newId } from "./storage";
import { getFile, putFile, deleteFile, storageEstimate } from "./files";
import type { StoredFile } from "./files";
import { parseTaskRangeId } from './taskReferences';
import { idbDelete, idbGet, idbSet } from './storage-manager';
import { isScannedPageDataUrl, SCANNED_NOTES_PREFIX } from './scanner';

// Container framing stays compatible. Manifest v2 additionally stores handwritten
// image data after the PDF/video bytes; v1 readers reject it rather than lose pages.
const MAGIC = "PROSTUTI-MEDIA-1\n";
const CHUNK = 4 * 1024 * 1024;
async function hashes(blob: Blob): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    const h = await crypto.subtle.digest("SHA-256", await blob.slice(offset, offset + CHUNK).arrayBuffer());
    out.push(Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join(""));
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
  version: 1 | 2;
  data: AppData;
  files: Entry[];
  scans?: Entry[];
}
interface ScannedBackupPage { key: string; dataUrl: string; size: number; createdAt: string }
export interface InspectedMediaBackup {
  data: AppData;
  files: StoredFile[];
  scans?: ScannedBackupPage[];
  warnings?: string[];
}
const mediaReferences = (data: AppData) => new Set([
  ...data.pdfs.filter(p => p.local).map(p => p.id),
  ...(data.advanced?.classes.filter(c => c.local).map(c => c.id) || []),
]);
const scanReferences = (data: AppData) => new Set(data.scannedNotes.flatMap(note => note.pageKeys));
const manifestEntry = async (file: StoredFile): Promise<Entry> => ({
  id: file.id, name: file.name, size: file.blob.size, type: file.blob.type,
  createdAt: file.createdAt, hashes: await hashes(file.blob),
});
export async function createMediaBackup(data: AppData, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const refs = mediaReferences(data), scanRefs = scanReferences(data);
  const total = refs.size + scanRefs.size;
  const files: StoredFile[] = [], scans: StoredFile[] = [];
  for (const id of refs) {
    const file = await getFile(id);
    if (!file) throw new Error(`Offline file missing: ${id}. Remove the missing download or re-download before full backup.`);
    files.push(file);
    onProgress?.(files.length, total);
  }
  for (const note of data.scannedNotes)
    if (note.pageKeys.length !== note.pageCount)
      throw new Error(`Scanned pages missing from note: ${note.title}. Export or repair it before full backup.`);
  for (const key of scanRefs) {
    const dataUrl = await idbGet(key);
    if (!isScannedPageDataUrl(dataUrl)) throw new Error(`Scanned page missing or invalid: ${key}. Keep the original device or an exported PDF.`);
    const blob = new Blob([dataUrl], { type: 'application/vnd.prostuti.scanned-page' });
    scans.push({ id: key, name: key, blob, size: blob.size, createdAt: data.scannedNotes.find(note => note.pageKeys.includes(key))!.createdAt });
    onProgress?.(files.length + scans.length, total);
  }
  const manifest: Manifest = { version: scans.length ? 2 : 1, data, files: [] };
  for (const file of files) manifest.files.push(await manifestEntry(file));
  if (scans.length) {
    manifest.scans = [];
    for (const file of scans) manifest.scans.push(await manifestEntry(file));
  }
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, json.length);
  return new Blob([MAGIC, length, json, ...files.map(f => f.blob), ...scans.map(f => f.blob)], { type: "application/vnd.prostuti.backup" });
}
export async function inspectMediaBackup(blob: Blob): Promise<InspectedMediaBackup> {
  const magicLength = new TextEncoder().encode(MAGIC).length;
  if ((await blob.slice(0, magicLength).text()) !== MAGIC) throw new Error("Not a Prostuti full backup");
  const lengthBytes = await blob.slice(magicLength, magicLength + 4).arrayBuffer();
  if (lengthBytes.byteLength !== 4) throw new Error("Truncated backup");
  const length = new DataView(lengthBytes).getUint32(0);
  if (length > 32 * 1024 * 1024 || length === 0 || magicLength + 4 + length > blob.size) throw new Error("Invalid manifest length");
  const manifest = JSON.parse(await blob.slice(magicLength + 4, magicLength + 4 + length).text()) as Manifest;
  if (!manifest || ![1, 2].includes(manifest.version) || !Array.isArray(manifest.files) || manifest.files.length > 1500 ||
      (manifest.version === 2 && (!Array.isArray(manifest.scans) || manifest.scans.length > 10000))) throw new Error("Unsupported backup");
  const data = parseBackup(JSON.stringify(manifest.data));
  if (manifest.version === 2 && data.scannedNotes.some(note => note.pageKeys.length !== note.pageCount))
    throw new Error('Scanned pages missing from backup metadata');
  let offset = magicLength + 4 + length;
  const readEntries = async (entries: Entry[], refs: Set<string>, scan: boolean): Promise<StoredFile[]> => {
    const seen = new Set<string>(), result: StoredFile[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' || !refs.has(entry.id) || seen.has(entry.id) ||
          typeof entry.name !== 'string' || entry.name.length > 500 || typeof entry.type !== 'string' || entry.type.length > 200 ||
          !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 2_000_000_000 ||
          typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)) || offset + entry.size > blob.size)
        throw new Error("Invalid or truncated media entry");
      seen.add(entry.id);
      const bytes = blob.slice(offset, offset + entry.size, entry.type);
      offset += entry.size;
      if (!scan && data.pdfs.some(p => p.id === entry.id) && !(await bytes.slice(0, 5).text()).startsWith('%PDF-')) throw new Error("Invalid PDF in backup");
      if (!Array.isArray(entry.hashes) || entry.hashes.length !== Math.ceil(entry.size / CHUNK) ||
          entry.hashes.some(h => typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h))) throw new Error("Missing media checksum");
      const actual = await hashes(bytes);
      if (actual.some((h, i) => h !== entry.hashes[i])) throw new Error("Media checksum mismatch: backup is damaged");
      if (scan && !isScannedPageDataUrl(await bytes.text())) throw new Error("Invalid scanned image in backup");
      result.push({ ...entry, blob: bytes });
    }
    if (refs.size !== seen.size) throw new Error("Missing files in backup");
    return result;
  };
  const files = await readEntries(manifest.files, mediaReferences(data), false);
  const scanFiles = manifest.version === 2 ? await readEntries(manifest.scans!, scanReferences(data), true) : [];
  if (offset !== blob.size) throw new Error("Missing files / trailing bytes");
  const scans: ScannedBackupPage[] = [];
  for (const file of scanFiles) scans.push({ key: file.id, dataUrl: await file.blob.text(), size: file.size, createdAt: file.createdAt });
  const warnings = manifest.version === 1 && data.scannedNotes.length ? [
    'Scanned image pages were not included in legacy full backups. Keep the old device or separately exported PDFs; missing images cannot be recovered from this file.',
  ] : [];
  return { data, files, scans, warnings };
}
/** Stage under fresh ids in BOTH stores. Roll back staged images/media on failure;
 * the caller may commit metadata only after every byte has been stored successfully. */
export async function stageMediaRestore(backup: InspectedMediaBackup, onProgress?: (done: number, total: number) => void): Promise<{ data: AppData; rollback: () => Promise<void> }> {
  const estimate = await storageEstimate();
  const scans = backup.scans || [];
  const needed = backup.files.reduce((s, f) => s + f.size, 0) + scans.reduce((s, f) => s + f.size, 0);
  if (estimate && needed > estimate.quota - estimate.usage - 5 * 1024 * 1024) throw new Error("Not enough free storage to restore safely");
  const staged: string[] = [], stagedPages: string[] = [];
  const mapping = new Map<string, string>(), pageMapping = new Map<string, string>();
  const rollback = async () => {
    for (const id of staged) await deleteFile(id);
    for (const key of stagedPages) await idbDelete(key);
  };
  const total = backup.files.length + scans.length;
  try {
    for (const f of backup.files) {
      const id = newId();
      if (!(await putFile({ ...f, id }))) throw new Error("File restore failed: storage full or unavailable");
      staged.push(id);
      mapping.set(f.id, id);
      onProgress?.(staged.length, total);
    }
    for (const page of scans) {
      const key = `${SCANNED_NOTES_PREFIX}${newId()}`;
      if (await idbSet(key, page.dataUrl, 'image') === null) throw new Error("Scanned image restore failed: storage full or unavailable");
      stagedPages.push(key);
      pageMapping.set(page.key, key);
      onProgress?.(staged.length + stagedPages.length, total);
    }
    const data: AppData = {
      ...backup.data,
      pdfs: backup.data.pdfs.map(p => ({ ...p, id: mapping.get(p.id) || p.id })),
      pdfBookmarks: backup.data.pdfBookmarks.map(id => mapping.get(id) || id),
      pdfRecent: backup.data.pdfRecent.map(p => ({ ...p, id: mapping.get(p.id) || p.id })),
      scannedNotes: backup.data.scannedNotes.map(note => ({ ...note, pageKeys: note.pageKeys.map(key => pageMapping.get(key) || key) })),
    };
    if (data.advanced) data.advanced = { ...data.advanced, classes: data.advanced.classes.map(c => ({ ...c, id: mapping.get(c.id) || c.id })) };
    data.pdfs = data.pdfs.map(p => ({ ...p, ...(p.classId ? { classId: mapping.get(p.classId) || p.classId } : {}) }));
    data.completed = Object.fromEntries(Object.entries(data.completed).map(([id, at]) => {
      if (!id.startsWith("smart-video|")) return [id, at];
      const range = parseTaskRangeId(id);
      if (!range || range.kind !== 'video') return [id, at];
      const parts = id.split("|");
      parts[1] = encodeURIComponent(mapping.get(range.sourceId) || range.sourceId);
      return [parts.join("|"), at];
    }));
    return { data, rollback };
  } catch (error) {
    await rollback();
    throw error;
  }
}
export async function saveBackupBlob(blob: Blob, name: string): Promise<void> {
  if (hasNativeFiles()) {
    const id = newId();
    if (!(await putFile({ id, blob, name, size: blob.size, createdAt: new Date().toISOString() }))) throw new Error("Not enough storage to prepare native export");
    try {
      await NativeFiles.exportFile({ id, name, type: blob.type });
    } catch (error) {
      if ((error as { code?: string }).code === "EXPORT_CANCELLED") {
        const e = new Error("Cancelled"); e.name = "AbortError"; throw e;
      }
      throw error;
    } finally { await deleteFile(id); }
    return;
  }
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ files: [file], title: "Prostuti full backup" });
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
