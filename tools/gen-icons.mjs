// Generates PWA PNG icons (192/512) without dependencies.
// Draws a simple book + checkmark glyph on a blue rounded square.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const s = size / 512; // scale factor
  const R = Math.round(96 * s); // corner radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded-square background (blue #1d4ed8)
      const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
      const corner = (cx < R && cy < R) ? (Math.hypot(R - cx, R - cy) <= R) : true;
      if (corner) set(x, y, 29, 78, 216, 255);
      else set(x, y, 0, 0, 0, 0);
    }
  }
  // Book: white pages
  const bx0 = Math.round(150 * s), bx1 = Math.round(362 * s);
  const by0 = Math.round(140 * s), by1 = Math.round(372 * s);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) set(x, y, 255, 255, 255, 255);
  // Spine
  const sp = Math.round(252 * s);
  for (let y = by0; y <= by1; y++) for (let x = sp - Math.round(6 * s); x <= sp + Math.round(6 * s); x++) set(x, y, 29, 78, 216, 255);
  // Text lines (left page)
  for (let i = 0; i < 5; i++) {
    const ly = Math.round((180 + i * 34) * s);
    for (let x = Math.round(180 * s); x <= Math.round(230 * s); x++) set(x, ly, 100, 116, 139, 255);
  }
  // Checkmark (right page, green)
  const pts = [[286, 262], [306, 282], [340, 232]];
  for (let i = 0; i < pts.length - 1; i++) {
    let [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    x0 = Math.round(x0 * s); y0 = Math.round(y0 * s); x1 = Math.round(x1 * s); y1 = Math.round(y1 * s);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= steps; t++) {
      const x = Math.round(x0 + (x1 - x0) * t / steps);
      const y = Math.round(y0 + (y1 - y0) * t / steps);
      const w = Math.max(2, Math.round(9 * s));
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) set(x + dx, y + dy, 21, 128, 61, 255);
    }
  }
  return png(size, buf);
}
mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-192.png', makeIcon(192));
writeFileSync('icons/icon-512.png', makeIcon(512));
console.log('icons written');
