import { BANGLA_LESSONS, CHAPTER_CLASSES } from './classLinks';
import { chapterById, subjectById } from './data';
import type { SubjectId } from './data';
import type { AppData } from './planner';

/**
 * Curated video-class catalog derived from the verified class-link dataset
 * (`classLinks.ts` — audited link-by-link in v2.5/v2.5.1, structurally re-checked by
 * `dataset.test.ts`). Nothing here is invented: every entry points at a real YouTube
 * video/playlist/channel-search URL that already exists in the repository.
 *
 * Category rules (deterministic, so the catalog is reproducible):
 *  - channel-search fallbacks            → `search` (not a playable class)
 *  - channel label mentions সাজেশন       → `important` (Important Questions & Suggestions)
 *  - channel label mentions বোর্ড        → `board` (Board Question Solving)
 *  - channel label mentions রিভিশন       → `revision` (Revision Classes)
 *  - full-course playlists (one-shot block) → `full` (Full Chapter Classes)
 *  - Bangla lesson classes               → `full`
 *  - otherwise the source block decides: one-shot / CQ solving / MCQ solving
 * `concept` and `practical` categories have no verified entries yet — the UI shows
 * "resource not added yet" instead of fabricating links.
 */

export type ClassType = 'full' | 'oneShot' | 'cq' | 'mcq' | 'board' | 'important' | 'revision' | 'concept' | 'practical' | 'search';

export const CLASS_TYPES: { id: ClassType; bn: string; en: string }[] = [
  { id: 'full', bn: 'ফুল চ্যাপ্টার ক্লাস', en: 'Full chapter class' },
  { id: 'oneShot', bn: 'ওয়ান শট ক্লাস', en: 'One-shot class' },
  { id: 'cq', bn: 'CQ সলভিং ক্লাস', en: 'CQ solving class' },
  { id: 'mcq', bn: 'MCQ সলভিং ক্লাস', en: 'MCQ solving class' },
  { id: 'board', bn: 'বোর্ড প্রশ্ন সলভিং', en: 'Board question solving' },
  { id: 'important', bn: 'গুরুত্বপূর্ণ প্রশ্ন ও সাজেশন', en: 'Important questions & suggestions' },
  { id: 'revision', bn: 'রিভিশন ক্লাস', en: 'Revision class' },
  { id: 'concept', bn: 'কনসেপ্ট ক্লিয়ারিং', en: 'Concept clearing' },
  { id: 'practical', bn: 'প্র্যাকটিক্যাল ক্লাস', en: 'Practical class' },
  { id: 'search', bn: 'চ্যানেল সার্চ', en: 'Channel search' },
];

export const classTypeLabel = (type: ClassType, en = false): string =>
  CLASS_TYPES.find(item => item.id === type)?.[en ? 'en' : 'bn'] || type;

/** Last date the underlying class-link dataset was audited against YouTube (v2.5.1 release). */
export const CATALOG_LAST_VERIFIED = '2026-11-14';

export type ClassKind = 'video' | 'playlist' | 'search';

export interface ClassResource {
  /** Stable key: the URL, or `lesson:<chapter>:<title>` for Bangla lesson rows. */
  id: string;
  /** Derived display title (chapter + category); the YouTube title is not stored offline. */
  title: string;
  /** Teacher / channel label exactly as recorded in the verified dataset. */
  channel: string;
  url: string;
  kind: ClassKind;
  classType: ClassType;
  chapterId: string;
  subject: SubjectId;
  paper: 1 | 2;
  language: 'bn';
  /** `search` rows open a channel search — they are not playable resources. */
  status: 'verified' | 'search';
  lastVerified: string;
  /** In-app playback URL when the resource can be embedded; absent for channel searches. */
  embedUrl?: string;
  /** Tracked locally for downloaded/imported class copies. */
  durationSec?: number;
  fileSizeBytes?: number;
  downloaded: boolean;
  localPath?: string;
  watchedPositionSec: number;
  watchedPercent: number;
  playbackSpeed: 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
  completed: boolean;
}

/** Parses YouTube watch/playlist URLs into embeddable ids (null when unsupported). */
export function youtubeIds(url: string): { video?: string; playlist?: string } {
  const out: { video?: string; playlist?: string } = {};
  const watch = /[?&]v=([A-Za-z0-9_-]{11})/.exec(url);
  if (watch && url.includes('youtube.com/watch')) out.video = watch[1];
  const list = /[?&]list=([A-Za-z0-9_-]{10,})/.exec(url);
  if (list && (url.includes('youtube.com/watch') || url.includes('youtube.com/playlist'))) out.playlist = list[1];
  return out;
}

export function embedUrlFor(url: string): string | undefined {
  const { video, playlist } = youtubeIds(url);
  if (video && playlist) return `https://www.youtube.com/embed/${video}?list=${playlist}&rel=0`;
  if (video) return `https://www.youtube.com/embed/${video}?rel=0`;
  if (playlist && url.includes('youtube.com/playlist')) return `https://www.youtube.com/embed/videoseries?list=${playlist}&rel=0`;
  return undefined;
}

export function isEmbeddable(url: string): boolean {
  return !!embedUrlFor(url);
}

type Block = 'oneShot' | 'cq' | 'mcq';

function classify(block: Block, channel: string, kind: string): ClassType {
  if (kind === 'search') return 'search';
  if (channel.includes('সাজেশন')) return 'important';
  if (channel.includes('বোর্ড')) return 'board';
  if (channel.includes('রিভিশন')) return 'revision';
  if (block === 'oneShot' && kind === 'playlist') return 'full';
  if (block === 'oneShot') return 'oneShot';
  if (block === 'cq') return 'cq';
  return 'mcq';
}

function buildCatalog(): ClassResource[] {
  const out: ClassResource[] = [];
  for (const [chapterId, classes] of Object.entries(CHAPTER_CLASSES)) {
    const chapter = chapterById[chapterId];
    if (!chapter) continue;
    const blocks: [Block, { channel: string; url: string; kind: string }[]][] = [
      ['oneShot', classes.oneShot], ['cq', classes.cq], ['mcq', classes.mcq],
    ];
    for (const [block, options] of blocks) {
      for (const option of options) {
        const kind: ClassKind = option.kind === 'playlist' ? 'playlist' : option.kind === 'search' ? 'search' : 'video';
        const classType = classify(block, option.channel, option.kind);
        const embedUrl = kind === 'search' ? undefined : embedUrlFor(option.url);
        out.push({
          id: option.url,
          title: `${chapter.title} · ${classTypeLabel(classType)}`,
          channel: option.channel,
          url: option.url,
          kind,
          classType,
          chapterId,
          subject: chapter.subject,
          paper: chapter.paper,
          language: 'bn',
          status: kind === 'search' ? 'search' : 'verified',
          lastVerified: CATALOG_LAST_VERIFIED,
          downloaded: false,
          watchedPositionSec: 0,
          watchedPercent: 0,
          playbackSpeed: 1,
          completed: false,
          ...(embedUrl ? { embedUrl } : {}),
        });
      }
    }
    for (const lesson of BANGLA_LESSONS[chapterId] || []) {
      if (!lesson.url) continue;
        out.push({
          id: `lesson:${chapterId}:${lesson.title}`,
          title: `${lesson.title} · ${classTypeLabel('full')}`,
          channel: lesson.channel || 'সাকিব স্যার',
          url: lesson.url,
          kind: 'video',
          classType: 'full',
          chapterId,
          subject: chapter.subject,
          paper: chapter.paper,
          language: 'bn',
          status: 'verified',
          lastVerified: CATALOG_LAST_VERIFIED,
          downloaded: false,
          watchedPositionSec: 0,
          watchedPercent: 0,
          playbackSpeed: 1,
          completed: false,
          ...(embedUrlFor(lesson.url) ? { embedUrl: embedUrlFor(lesson.url)! } : {}),
        });
    }
  }
  return out;
}

/** Every catalog row (chapter-scoped; the same URL can serve several chapters). */
export const CLASS_CATALOG: ClassResource[] = buildCatalog();

/** Unique playable/search URLs across the catalog. */
export const UNIQUE_CLASS_URLS: string[] = [...new Set(CLASS_CATALOG.map(item => item.id))];

export const classTypeCounts = (): Record<ClassType, number> => {
  const counts = Object.fromEntries(CLASS_TYPES.map(item => [item.id, 0])) as Record<ClassType, number>;
  for (const item of CLASS_CATALOG) counts[item.classType]++;
  return counts;
};

/** Distinct teacher/channel labels, sorted by number of resources. */
export const TEACHERS: { name: string; count: number }[] = (() => {
  const map = new Map<string, number>();
  for (const item of CLASS_CATALOG) map.set(item.channel, (map.get(item.channel) || 0) + 1);
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
})();

export interface ClassFilters {
  subject?: SubjectId | 'all';
  paper?: 1 | 2 | 'all';
  chapterId?: string | 'all';
  teacher?: string | 'all';
  classType?: ClassType | 'all';
  watched?: 'all' | 'watched' | 'unwatched';
  bookmarkedOnly?: boolean;
  query?: string;
}

/**
 * Applies subject/paper/chapter/teacher/type/watched/bookmarked/search filters.
 * `watched` and `bookmark` come from the student's local data.
 */
export function filterClasses(
  list: ClassResource[],
  filters: ClassFilters,
  data: Pick<AppData, 'classWatched' | 'classBookmarks'>,
): ClassResource[] {
  const query = (filters.query || '').trim().toLowerCase();
  return list.filter(item => {
    if (filters.subject && filters.subject !== 'all' && item.subject !== filters.subject) return false;
    if (filters.paper && filters.paper !== 'all' && item.paper !== filters.paper) return false;
    if (filters.chapterId && filters.chapterId !== 'all' && item.chapterId !== filters.chapterId) return false;
    if (filters.teacher && filters.teacher !== 'all' && item.channel !== filters.teacher) return false;
    if (filters.classType && filters.classType !== 'all' && item.classType !== filters.classType) return false;
    const watched = !!data.classWatched[item.id];
    if (filters.watched === 'watched' && !watched) return false;
    if (filters.watched === 'unwatched' && watched) return false;
    if (filters.bookmarkedOnly && !data.classBookmarks[item.id]) return false;
    if (query) {
      const chapter = chapterById[item.chapterId];
      const haystack = `${item.title} ${item.channel} ${chapter?.title || ''} ${chapter?.focus || ''} ${subjectById[item.subject].name} ${subjectById[item.subject].english}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Chapter-wise class progress used by the Video Classes dashboard. */
export function chapterClassRows(
  data: Pick<AppData, 'classWatched' | 'classBookmarks'>,
  subject?: SubjectId,
): { chapterId: string; total: number; watched: number; bookmarked: number; percent: number }[] {
  const byChapter = new Map<string, { total: number; watched: number; bookmarked: number }>();
  for (const item of CLASS_CATALOG) {
    if (item.status === 'search') continue;
    if (subject && item.subject !== subject) continue;
    const row = byChapter.get(item.chapterId) || { total: 0, watched: 0, bookmarked: 0 };
    row.total++;
    if (data.classWatched[item.id]) row.watched++;
    if (data.classBookmarks[item.id]) row.bookmarked++;
    byChapter.set(item.chapterId, row);
  }
  return [...byChapter.entries()].map(([chapterId, row]) => ({
    chapterId,
    ...row,
    percent: row.total ? Math.round((row.watched / row.total) * 100) : 0,
  })).sort((a, b) => a.percent - b.percent || a.chapterId.localeCompare(b.chapterId));
}
