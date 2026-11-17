/** Generated task ids can also arrive in old/imported backups. Never let a bad
 * percent escape or invalid range crash rendering, restore, or certify completion.
 * Unknown evidence remains stored unchanged; consumers simply do not use it.
 */
export interface TaskRangeReference {
  kind: 'part' | 'video';
  sourceId: string;
  from: number;
  to: number;
}
export function parseTaskRangeId(id: string): TaskRangeReference | null {
  const fields = id.split('|');
  if (fields.length !== 4 || !['smart-part', 'smart-video'].includes(fields[0]) ||
      !fields[1] || !fields[2].trim() || !fields[3].trim()) return null;
  let sourceId: string;
  try { sourceId = decodeURIComponent(fields[1]); }
  catch { return null; }
  const from = Number(fields[2]), to = Number(fields[3]);
  if (!sourceId || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) return null;
  return { kind: fields[0] === 'smart-part' ? 'part' : 'video', sourceId, from, to };
}
