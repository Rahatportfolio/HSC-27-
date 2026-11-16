/**
 * Handwritten notes scanner logic.
 *
 * All processing happens client-side on HTMLCanvasElement — no server, no cloud,
 * no paid API. Images are stored as data URLs in IndexedDB via storage-manager,
 * and metadata (chapter, title, page count) is kept in localStorage/AppData so
 * the scanned library survives app restarts and updates.
 */

import { idbSet, idbGet, idbDelete, idbKeys } from './storage-manager';
import type { SubjectId } from './data';

export const SCANNED_NOTES_PREFIX = 'scan:';
export const SCANNED_NOTES_META_KEY = 'hsc27-scanned-notes-meta';

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
  const c = contrast / 100 - 1;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
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
  const rad = ((degrees % 360) * Math.PI) / 180;
  const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) return canvas;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  ctx.drawImage(canvas, 0, 0);
  const result = document.createElement('canvas');
  if (degrees % 180 === 90) {
    result.width = canvas.height;
    result.height = canvas.width;
  } else {
    result.width = canvas.width;
    result.height = canvas.height;
  }
  const rCtx = result.getContext('2d');
  if (!rCtx) return canvas;
  rCtx.drawImage(offscreen, 0, 0);
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

  // Bilinear inverse mapping from output quad to input quad.
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const u = x / outWidth;
      const v = y / outHeight;
      // Approximate bilinear interpolation inverse (Newton refinement skipped for speed)
      const ax = corners.tl[0] * (1 - u) * (1 - v) + corners.tr[0] * u * (1 - v) + corners.br[0] * u * v + corners.bl[0] * (1 - u) * v;
      const ay = corners.tl[1] * (1 - u) * (1 - v) + corners.tr[1] * u * (1 - v) + corners.br[1] * u * v + corners.bl[1] * (1 - u) * v;
      const sx = Math.max(0, Math.min(canvas.width - 1, ax));
      const sy = Math.max(0, Math.min(canvas.height - 1, ay));
      const pixel = ctx.getImageData(sx | 0, sy | 0, 1, 1);
      ctx.putImageData(pixel, x, y);
    }
  }
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
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('ক্যানভাস তৈরি করা যায়নি।')); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    if (src instanceof File) img.src = URL.createObjectURL(src);
    else img.src = src;
  });
}

/** Save scanned pages to IndexedDB and return per-page keys. */
export async function savePagesToDb(pages: ScannedPage[]): Promise<string[]> {
  const keys: string[] = [];
  for (const page of pages) {
    const key = `${SCANNED_NOTES_PREFIX}${crypto.randomUUID()}`;
    const size = new TextEncoder().encode(page.dataUrl).byteLength;
    await idbSet(key, page.dataUrl, 'image', undefined);
    keys.push(key);
    // eslint-disable-next-line no-void
    void size;
  }
  return keys;
}

/** Read all page images for a note from IndexedDB. */
export async function loadPagesFromDb(pageKeys: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const key of pageKeys) {
    const value = await idbGet(key);
    if (typeof value === 'string') urls.push(value);
  }
  return urls;
}

/** Delete all page images for a note from IndexedDB. */
export async function deletePagesFromDb(pageKeys: string[]): Promise<void> {
  for (const key of pageKeys) await idbDelete(key);
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
    const row = (await idbGet(key)) as { sizeBytes?: number } | undefined;
    total += row?.sizeBytes ?? 0;
  }
  return total;
}
