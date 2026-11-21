/**
 * Handwritten notes scanner logic.
 *
 * All processing happens client-side on HTMLCanvasElement — no server, no cloud,
 * no paid API. Images are stored as data URLs in IndexedDB via storage-manager,
 * and metadata (chapter, title, page count) is kept in localStorage/AppData so
 * the scanned library survives app restarts and updates.
 */

import { idbSet, idbGet, idbDelete, idbKeys } from './storage-manager';
import { newId } from './storage';
import type { SubjectId } from './data';

export const SCANNED_NOTES_PREFIX = 'scan:';
export const SCANNED_NOTES_META_KEY = 'hsc27-scanned-notes-meta';
export const MAX_SCANNED_PAGES = 50;
/** Stored canvas images only; never treat arbitrary cache values/URLs as note pages. */
export const isScannedPageDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);

/** A scanned note entry stored in AppData (lightweight metadata only). */
export interface ScannedNoteMeta {
  id: string;
  title: string;
  subject: SubjectId;
  chapterId?: string;
  /** ISO date the scan was created. */
  createdAt: string;
  /** Number of pages scanned. */
  pageCount: number;
  /** Total bytes of all page images stored in IndexedDB. */
  sizeBytes: number;
  /** True when exported to a single PDF. */
  pdfExported: boolean;
  /** IndexedDB keys for each page image (data URLs). */
  pageKeys: string[];
}

/** Raw scanned page before being saved as a note. */
export interface ScannedPage {
  /** Base64 data URL of the processed page image. */
  dataUrl: string;
  width: number;
  height: number;
}

/** Apply brightness/contrast to an image drawn on a canvas. */
export function adjustImage(
  canvas: HTMLCanvasElement,
  { brightness = 100, contrast = 100 }: { brightness?: number; contrast?: number },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const b = brightness / 100 - 1;
  const factor = contrast / 100;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(factor * (data[i] - 128) + 128 + b * 255);
    data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128 + b * 255);
    data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128 + b * 255);
  }
  ctx.putImageData(imageData, 0, 0);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

/** Rotate a canvas image by degrees (90/180/270 supported cleanly). */
export function rotateCanvas(canvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const rad = ((((degrees % 360) + 360) % 360) * Math.PI) / 180;
  const result = document.createElement('canvas');
  // Rotate inside the expanded destination, never inside a source-sized buffer
  // that clips the ends of a portrait/landscape page before it can be copied.
  result.width = Math.max(1, Math.ceil(Math.abs(canvas.width * Math.cos(rad)) + Math.abs(canvas.height * Math.sin(rad)) - 1e-10));
  result.height = Math.max(1, Math.ceil(Math.abs(canvas.width * Math.sin(rad)) + Math.abs(canvas.height * Math.cos(rad)) - 1e-10));
  const ctx = result.getContext('2d');
  if (!ctx) return canvas;
  ctx.translate(result.width / 2, result.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return result;
}

/** Crop a canvas to a rectangle. */
export function cropCanvas(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = w;
  result.height = h;
  const ctx = result.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return result;
}

/** Simple perspective correction: map four corners to a rectangle. Best-effort. */
export function perspectiveCorrect(
  canvas: HTMLCanvasElement,
  corners: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] },
  outWidth: number,
  outHeight: number,
): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = outWidth;
  result.height = outHeight;
  const ctx = result.getContext('2d');
  if (!ctx) return canvas;

  const source = canvas.getContext('2d');
  if (!source) return canvas;
  const pixels = source.getImageData(0, 0, canvas.width, canvas.height).data;
  const image = ctx.createImageData(outWidth, outHeight);
  // Approximate bilinear inverse mapping. Read SOURCE pixels once; sampling the
  // blank destination loses the note, and per-pixel canvas reads freeze large scans.
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const u = x / outWidth, v = y / outHeight;
      const ax = corners.tl[0] * (1 - u) * (1 - v) + corners.tr[0] * u * (1 - v) + corners.br[0] * u * v + corners.bl[0] * (1 - u) * v;
      const ay = corners.tl[1] * (1 - u) * (1 - v) + corners.tr[1] * u * (1 - v) + corners.br[1] * u * v + corners.bl[1] * (1 - u) * v;
      const sx = Math.max(0, Math.min(canvas.width - 1, ax)) | 0;
      const sy = Math.max(0, Math.min(canvas.height - 1, ay)) | 0;
      const from = (sy * canvas.width + sx) * 4, to = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 4; channel++) image.data[to + channel] = pixels[from + channel];
    }
  }
  ctx.putImageData(image, 0, 0);
  return result;
}

/** Convert a canvas to a JPEG data URL. */
export function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/** Load an image (file or data URL) into a canvas. */
export function loadImageToCanvas(src: string | File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = src instanceof File ? URL.createObjectURL(src) : null;
    const release = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('ক্যানভাস তৈরি করা যায়নি।');
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      } catch (error) { reject(error); }
      finally { release(); }
    };
    img.onerror = error => { release(); reject(error); };
    img.src = objectUrl ?? src as string;
  });
}

/** Save scanned pages to IndexedDB and return per-page keys. */
export async function savePagesToDb(pages: ScannedPage[]): Promise<string[]> {
  const keys: string[] = [];
  try {
    for (const page of pages) {
      const key = `${SCANNED_NOTES_PREFIX}${newId()}`;
      if (await idbSet(key, page.dataUrl, 'image') === null)
        throw new Error('Scanned pages could not be saved: image storage is unavailable or full.');
      keys.push(key);
    }
    return keys;
  } catch (error) {
    await deletePagesFromDb(keys);
    throw error;
  }
}

/** Read all page images for a note from IndexedDB. */
export async function loadPagesFromDb(pageKeys: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const key of pageKeys) {
    const value = await idbGet(key);
    // A partial PDF would silently lose handwritten pages and still look exported.
    if (typeof value !== 'string' || !isScannedPageDataUrl(value)) return [];
    urls.push(value);
  }
  return urls;
}

/** Delete all page images; report failure rather than claiming the bytes were removed. */
export async function deletePagesFromDb(pageKeys: string[]): Promise<boolean> {
  let complete = true;
  for (const key of pageKeys) if (!await idbDelete(key)) complete = false;
  return complete;
}

/** Read the scanned-notes metadata array from localStorage. */
export function readScannedMeta(): ScannedNoteMeta[] {
  try {
    const raw = localStorage.getItem(SCANNED_NOTES_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ScannedNoteMeta => !!item && typeof item.id === 'string');
  } catch { return []; }
}

/** Write the scanned-notes metadata array to localStorage. */
export function writeScannedMeta(list: ScannedNoteMeta[]): void {
  try {
    localStorage.setItem(SCANNED_NOTES_META_KEY, JSON.stringify(list));
  } catch { /* storage may be full */ }
}

/** Total bytes occupied by scanned note images in IndexedDB. */
export async function scannedNotesSizeBytes(): Promise<number> {
  const keys = await idbKeys();
  const scanKeys = keys.filter(k => k.startsWith(SCANNED_NOTES_PREFIX));
  let total = 0;
  for (const key of scanKeys) {
    const image = await idbGet(key);
    if (typeof image === 'string') total += new TextEncoder().encode(image).byteLength;
  }
  return total;
}
