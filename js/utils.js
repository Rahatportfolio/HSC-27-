/* HSC 2027 Smart Study App — utils.js
 * Pure helper functions: dates (Asia/Dhaka), formatting, escaping,
 * calculations. No DOM access, no state — safe to unit test in Node.
 */
'use strict';

const TZ = 'Asia/Dhaka';
// The Android package supplies this bridge only to its bundled local app.
function isOfflineAndroid() { return typeof HSCAndroid !== 'undefined' && typeof HSCAndroid.saveFile === 'function'; }

/* ---------- HTML escaping (XSS protection for all user content) ---------- */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- IDs ---------- */
let _idCounter = 0;
function uid(prefix) {
  _idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return (prefix || 'id') + '-' + time + '-' + rand + '-' + _idCounter;
}

/* ---------- Dates (Bangladesh local time) ---------- */
function toDateKey(d) {
  // YYYY-MM-DD in Asia/Dhaka
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d || new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
function todayKey() { return toDateKey(new Date()); }
function nowISO() { return new Date().toISOString(); }

function parseDateKey(key) {
  // Parse YYYY-MM-DD as a Dhaka-local calendar date
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}
function addDays(key, n) {
  const d = parseDateKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateKey(d);
}
function daysBetween(aKey, bKey) {
  const a = parseDateKey(aKey).getTime();
  const b = parseDateKey(bKey).getTime();
  return Math.round((b - a) / 86400000);
}
function weekStartKey(key) {
  // Monday-start week
  const d = parseDateKey(key);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (dow + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return toDateKey(d);
}
function monthKey(key) { return key.slice(0, 7); } // YYYY-MM
function formatDate(key) {
  if (!key) return '';
  const d = parseDateKey(key);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(d);
}
function formatDay(key) {
  if (!key) return '';
  const d = parseDateKey(key);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  }).format(d);
}
function formatTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}
function greeting(hour) {
  const h = hour === undefined ? Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date())) : hour;
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ---------- Numbers & time ---------- */
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function minutesToHours(min) { return Math.round((min / 60) * 10) / 10; }
function formatDuration(min) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return m + 'm';
  if (m === 0) return h + 'h';
  return h + 'h ' + m + 'm';
}
function formatClock(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? pad(h) + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}
function pct(part, whole) {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
function accuracy(correct, attempted) {
  if (!attempted || attempted <= 0) return null;
  return Math.round((correct / attempted) * 100);
}

/* ---------- Bangladesh board grading (GPA scale) ---------- */
function gradeForMarks(obtained, total) {
  if (total === null || total === undefined || total <= 0) return { grade: '', gpa: null, label: '' };
  const p = (obtained / total) * 100;
  if (p >= 80) return { grade: 'A+', gpa: 5.0, label: 'A+ (80+)' };
  if (p >= 70) return { grade: 'A', gpa: 4.0, label: 'A (70–79)' };
  if (p >= 60) return { grade: 'A-', gpa: 3.5, label: 'A- (60–69)' };
  if (p >= 50) return { grade: 'B', gpa: 3.0, label: 'B (50–59)' };
  if (p >= 40) return { grade: 'C', gpa: 2.0, label: 'C (40–49)' };
  if (p >= 33) return { grade: 'D', gpa: 1.0, label: 'D (33–39)' };
  return { grade: 'F', gpa: 0.0, label: 'F (<33)' };
}

/* ---------- Streaks ---------- */
function calcStreak(dateKeys) {
  // dateKeys: array of YYYY-MM-DD with >=1 study minute. Returns current streak.
  const set = new Set(dateKeys);
  let streak = 0;
  let cursor = todayKey();
  if (!set.has(cursor)) cursor = addDays(cursor, -1); // streak can survive "today not yet"
  while (set.has(cursor)) { streak += 1; cursor = addDays(cursor, -1); }
  return streak;
}

/* ---------- CSV ---------- */
function toCSV(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
function parseCSV(text, strict = false) {
  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (strict && inQuotes) throw new Error('CSV contains an unclosed quoted field.');
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/* ---------- Validation ---------- */
function isValidDateKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(parseDateKey(key).getTime()) && parseDateKey(key).toISOString().slice(0, 10) === key;
}
function sanitizeText(s, maxLen) {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, maxLen || 5000);
}
function sanitizeUrl(u) {
  if (typeof u !== 'string') return '';
  const t = u.trim();
  if (/[\u0000-\u001f\u007f]/.test(t)) return '';
  try { const parsed = new URL(t); return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password ? t : ''; }
  catch { return ''; }
}

/* ---------- Export for Node tests ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    esc, uid, toDateKey, todayKey, nowISO, parseDateKey, addDays, daysBetween,
    weekStartKey, monthKey, formatDate, formatDay, formatTime, greeting,
    clamp, minutesToHours, formatDuration, formatClock, pct, accuracy,
    gradeForMarks, calcStreak, toCSV, parseCSV, isValidDateKey, sanitizeText, sanitizeUrl,
  };
}
