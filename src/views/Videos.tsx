import { emptyAdvanced, canonicalUrl } from '../advanced';
import { newId } from '../storage';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Bookmark, Check, ChevronRight, ExternalLink, Filter, Play, Search, ShieldCheck,
  Youtube, ListVideo, BarChart3, Clock3, HardDrive,
} from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDurationBn, percent } from '../planner';
import { toggleClassWatched } from '../classes';
import { EmptyState, Modal, PageHeading, ProgressBar } from '../components';
import { isEnglish, t } from '../i18n';
import {
  CLASS_CATALOG, CLASS_TYPES, TEACHERS, classTypeCounts, classTypeLabel, filterClasses,
} from '../videoCatalog';
import type { ClassFilters, ClassResource, ClassType } from '../videoCatalog';

const SPEEDS: number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

function speedKey(resource: ClassResource): string {
  return `hsc27-player-speed-${resource.id}`;
}

function getSpeed(resource: ClassResource): number {
  try {
    const raw = localStorage.getItem(speedKey(resource));
    const value = raw ? Number(raw) : 1;
    return SPEEDS.includes(value) ? value : 1;
  } catch { return 1; }
}

function setSpeed(resource: ClassResource, value: number): void {
  try { localStorage.setItem(speedKey(resource), String(value)); } catch { /* storage may be full */ }
}

function sizeLabel(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return bn(Math.round(bytes / 1024)) + ' KB';
  return bn(Math.round(bytes / (1024 * 1024))) + ' MB';
}

function PlayerModal({ resource, onClose }: { resource: ClassResource; onClose: () => void }) {
  const { data, setData, notify, openChapter, navigate } = usePlanner();
  const [durationMinutes, setDurationMinutes] = useState('');
  const [embedFailed, setEmbedFailed] = useState(false);
  const watched = !!data.classWatched[resource.id];
  const bookmarked = !!data.classBookmarks[resource.id];
  const chapter = chapterById[resource.chapterId];
  const canEmbed = !!resource.embedUrl && resource.kind !== 'search';

  const toggleBookmark = () => {
    setData(d => {
      const next = { ...d.classBookmarks };
      if (next[resource.id]) delete next[resource.id];
      else next[resource.id] = new Date().toISOString();
      return { ...d, classBookmarks: next };
    });
    notify(bookmarked ? t('বুকমার্ক থেকে সরানো হয়েছে।', 'Bookmark removed.') : t('ক্লাসটি বুকমার্ক করা হয়েছে।', 'Class bookmarked.'));
  };

  return (
    <Modal title={resource.title} onClose={onClose} wide>
      <div className="chapter-modal-meta">
        <span className={`video-type-badge t-${resource.classType}`}>{classTypeLabel(resource.classType, isEnglish())}</span>
        <span>{subjectById[resource.subject].name} · {t('পত্র', 'Paper')} {bn(resource.paper)}</span>
        <span>{resource.channel}</span>
        {chapter && <span>{chapter.title}</span>}
        {resource.durationSec && <span className="meta-chip"><Clock3 size={13} />{formatDurationBn(resource.durationSec)}</span>}
        {resource.downloaded && resource.fileSizeBytes && <span className="meta-chip"><HardDrive size={13} />{sizeLabel(resource.fileSizeBytes)}</span>}
        {resource.downloaded && <span className="meta-chip saved">{t('ডিভাইসে সেভ করা', 'Saved on device')}</span>}
      </div>
      {resource.watchedPercent > 0 && (
        <div className="video-progress-strip">
          <span>{t('আগের অবস্থানে ফিরে যাও', 'Resume')} {bn(resource.watchedPercent)}%</span>
          <ProgressBar value={resource.watchedPercent} />
        </div>
      )}

      {canEmbed && !embedFailed ? (
        <div className="video-embed-wrap">
          <iframe
            className="video-embed"
            src={resource.embedUrl}
            title={resource.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="video-fallback-box">
          <ShieldCheck size={20} />
          <p>{resource.kind === 'search'
            ? t('এটি সরাসরি ভিডিও নয় — শিক্ষকের চ্যানেলে সার্চ লিংক। সার্চ ফল থেকে প্রাসঙ্গিক ক্লাস বেছে নাও।', 'This is a channel-search link, not a playable video. Pick the relevant class from the search results.')
            : t('ইন-অ্যাপ প্লেব্যাক দেখা যাচ্ছে না (এমবেড বন্ধ বা ইন্টারনেট সমস্যা)। নিচের বোতাম দিয়ে মূল ভিডিওটি YouTube-এ খোলো।', 'In-app playback is unavailable (embedding disabled or network issue). Open the original video on YouTube with the button below.')}</p>
        </div>
      )}

      <div className="video-player-actions"><button className="button secondary" onClick={() => { navigate('studySystem'); onClose(); }}>Offline / duration planner</button>
        <button className="button primary" onClick={() => window.open(resource.url, '_blank', 'noopener,noreferrer')}>
          <Youtube size={16} />
          {resource.kind === 'playlist' ? t('YouTube-এ প্লেলিস্ট খোলো', 'Open playlist on YouTube')
            : resource.kind === 'search' ? t('চ্যানেল সার্চ খোলো', 'Open channel search')
              : t('YouTube-এ মূল ভিডিও খোলো', 'Open original video on YouTube')}
        </button>
        {canEmbed && (
          <button className="button secondary" onClick={() => setEmbedFailed(true)}>
            <Play size={15} />{t('প্লেব্যাক কাজ করছে না — ফলব্যাক', 'Playback broken — fallback')}
          </button>
        )}
        <button className={`button secondary ${bookmarked ? 'selected' : ''}`} aria-pressed={bookmarked} onClick={toggleBookmark}>
          <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />{bookmarked ? t('বুকমার্ক করা', 'Bookmarked') : t('বুকমার্ক', 'Bookmark')}
        </button>
        <div className="speed-chip-group"><strong style={{ fontSize: 12 }}>{t('গতি', 'Speed')}</strong>{SPEEDS.map(speed => <button key={speed} type="button" className={`speed-chip ${getSpeed(resource) === speed ? 'active' : ''}`} onClick={() => { setSpeed(resource, speed); notify(`×${speed}`); }}>{bn(speed)}×</button>)}</div>
        <button
          className={`button secondary ${watched ? 'selected' : ''}`}
          aria-pressed={watched}
          onClick={() => { setData(d => toggleClassWatched(d, resource.id)); notify(watched ? t('দেখা হিসেব থেকে সরানো হয়েছে।', 'Marked as unwatched.') : t('দেখা হয়েছে হিসেবে রাখা হয়েছে।', 'Marked as watched.')); }}
        >
          <Check size={15} />{watched ? t('দেখা হয়েছে', 'Watched') : t('দেখেছি মার্ক করো', 'Mark watched')}
        </button>
        {chapter && (
          <button className="button ghost" onClick={() => { openChapter(chapter); onClose(); }}>
            {t('অধ্যায়ের পেজ', 'Chapter page')}<ChevronRight size={15} />
          </button>
        )}
      </div>
      <form className="study-panel study-form" onSubmit={e=>{
        e.preventDefault();
        const duration=Number(durationMinutes)*60;
        if(!Number.isFinite(duration)||duration<=0||duration>604800)return;
        if(data.advanced?.classes.some(c=>canonicalUrl(c.url)===canonicalUrl(resource.url))){navigate('studySystem');onClose();return;}
        setData(d=>{const a=d.advanced || emptyAdvanced();return {...d,advanced:{...a,classes:[...a.classes,{id:newId(),title:resource.title,url:resource.url,chapterId:resource.chapterId,teacher:resource.channel,duration,watched:0,position:0,speed:1,permitted:false,note:''}]}};});
        notify(t('Duration planner-এ ক্লাস যোগ হয়েছে।','Class added to duration planner.'));navigate('studySystem');onClose();
      }}><label>{t('প্রকৃত class duration (minutes)','Actual class duration (minutes)')}<input type="number" required min="1" max="10080" step="0.1" value={durationMinutes} onChange={e=>setDurationMinutes(e.target.value)}/></label><button className="button secondary">{t('দিনে ভাগ করে পড়ার প্ল্যানে যোগ করো','Split into daily study sessions')}</button><p className="tiny-muted">{t('YouTube থেকে duration বা watch time অনুমান করা হয় না। ভিডিওতে দেখানো প্রকৃত duration লেখো; progress নিজে log করো।','YouTube duration and watch time are not guessed. Enter the real duration displayed by the video and log progress manually.')}</p></form>
      <p className="tiny-muted video-player-note">
        {t('ডাউনলোড নয়: YouTube ভিডিও অফলাইন সেভ করা হয় না — অফিসিয়াল অফলাইন ফিচার ব্যবহার করো। পারমিশন থাকা পিডিএফ ও ফাইল পিডিএফ লাইব্রেরিতে ডাউনলোড করা যায়।', 'Not downloadable: videos are never saved offline inside the app — use YouTube’s official offline features. Permitted PDFs can be downloaded in the PDF library.')}
      </p>
    </Modal>
  );
}

export default function VideosView() {
  const { data, setData, openChapter, plan, today } = usePlanner();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [paper, setPaper] = useState<1 | 2 | 'all'>('all');
  const [chapterId, setChapterId] = useState<string>('all');
  const [teacher, setTeacher] = useState<string>('all');
  const [classType, setClassType] = useState<ClassType | 'all'>('all');
  const [watched, setWatched] = useState<'all' | 'watched' | 'unwatched'>('all');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [mode, setMode] = useState<'classes' | 'chapters'>('classes');
  const [playing, setPlaying] = useState<ClassResource | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  // "ক্লাস দেখা চালিয়ে যাও" from Home deep-links here: open the next unwatched
  // class player once — today's chapters first, then any unwatched playable class.
  useEffect(() => {
    if (!sessionStorage.getItem('prostuti.openClass')) return;
    sessionStorage.removeItem('prostuti.openClass');
    const todayChapters = new Set(plan.find(d => d.date === today)?.tasks.flatMap(tk => tk.chapterIds) ?? []);
    const unwatched = CLASS_CATALOG.filter(c => c.kind !== 'search' && !data.classWatched[c.id]);
    const next = unwatched.find(c => todayChapters.has(c.chapterId)) ?? unwatched[0];
    if (next) setPlaying(next);
    // One-shot handoff from Home — must not re-trigger on later re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => classTypeCounts(), []);
  const chapterOptions = useMemo(
    () => CHAPTERS.filter(chapter => subject === 'all' || chapter.subject === subject),
    [subject],
  );
  const results = useMemo(() => {
    const filters: ClassFilters = { subject, paper, chapterId, teacher, classType, watched, bookmarkedOnly, query };
    return filterClasses(CLASS_CATALOG, filters, data);
  }, [subject, paper, chapterId, teacher, classType, watched, bookmarkedOnly, query, data]);

  const watchedCount = useMemo(() => CLASS_CATALOG.filter(item => item.status !== 'search' && data.classWatched[item.id]).length, [data.classWatched]);
  const bookmarkedCount = useMemo(() => CLASS_CATALOG.filter(item => data.classBookmarks[item.id]).length, [data.classBookmarks]);
  const playableTotal = useMemo(() => CLASS_CATALOG.filter(item => item.status !== 'search').length, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ClassResource[]>();
    for (const item of results) {
      const list = map.get(item.chapterId) || [];
      list.push(item);
      map.set(item.chapterId, list);
    }
    return [...map.entries()].sort((a, b) => {
      const ca = chapterById[a[0]];
      const cb = chapterById[b[0]];
      return SUBJECTS.findIndex(s => s.id === ca?.subject) - SUBJECTS.findIndex(s => s.id === cb?.subject)
        || (ca?.paper || 0) - (cb?.paper || 0);
    });
  }, [results]);

  const resetFilters = () => {
    setQuery(''); setSubject('all'); setPaper('all'); setChapterId('all');
    setTeacher('all'); setClassType('all'); setWatched('all'); setBookmarkedOnly(false);
  };
  const activeFilterCount = [subject !== 'all', paper !== 'all', chapterId !== 'all', teacher !== 'all', classType !== 'all', watched !== 'all', bookmarkedOnly].filter(Boolean).length;

  const toggleBookmark = (id: string) => setData(d => {
    const next = { ...d.classBookmarks };
    if (next[id]) delete next[id];
    else next[id] = new Date().toISOString();
    return { ...d, classBookmarks: next };
  });

  return (
    <div className="view videos-view">
      <PageHeading
        eyebrow="VIDEO CLASSES"
        title="ক্লাস খুঁজে দেখো।"
        titleEn="Find your classes."
        description="১১৪ অধ্যায়ের যাচাই করা ক্লাস — শিক্ষক, ধরন ও অগ্রগতি দিয়ে ছাঁকো। প্রতিটি রিসোর্সের শেষ যাচাইয়ের তারিখ দেওয়া আছে।"
        descriptionEn="Verified classes across all 114 chapters — filter by teacher, type and progress. Every resource carries its last-verified date."
        action={
          <div className="video-stats">
            <span><strong>{bn(CLASS_CATALOG.length)}</strong>{t('ক্লাস সেল', 'class rows')}</span>
            <span><strong>{bn(watchedCount)}/{bn(playableTotal)}</strong>{t('দেখা', 'watched')}</span>
            <span><strong>{bn(bookmarkedCount)}</strong>{t('বুকমার্ক', 'bookmarked')}</span>
          </div>
        }
      />

      <section className="card video-type-strip" aria-label={t('ক্লাসের ধরন', 'Class types')}>
        <button className={`type-chip ${classType === 'all' ? 'active' : ''}`} onClick={() => setClassType('all')}>
          <ListVideo size={15} /><strong>{t('সব ক্লাস', 'All classes')}</strong><span>{bn(CLASS_CATALOG.length)}</span>
        </button>
        {CLASS_TYPES.map(type => (
          <button
            key={type.id}
            className={`type-chip ${classType === type.id ? 'active' : ''} ${counts[type.id] === 0 ? 'empty' : ''}`}
            onClick={() => setClassType(type.id)}
            title={counts[type.id] === 0 ? t('এই ধরনের যাচাই করা রিসোর্স এখনো যোগ করা হয়নি।', 'No verified resource of this type yet.') : undefined}
          >
            <strong>{classTypeLabel(type.id, isEnglish())}</strong><span>{bn(counts[type.id])}</span>
          </button>
        ))}
      </section>

      <section className="card video-library-card">
        <div className="filter-bar video-filter-bar">
          <label className="search-field">
            <Search size={17} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('অধ্যায়, শিক্ষক বা চ্যানেল খুঁজো…', 'Search chapter, teacher or channel…')} aria-label={t('ক্লাস খুঁজো', 'Search classes')} />
          </label>
          <button className={`button secondary small filter-toggle ${showFilters ? 'selected' : ''}`} onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
            <Filter size={15} />{t('ফিল্টার', 'Filters')}{activeFilterCount > 0 && <span className="count-badge">{bn(activeFilterCount)}</span>}
          </button>
          <div className="segmented">
            <button className={mode === 'classes' ? 'active' : ''} onClick={() => setMode('classes')}><ListVideo size={14} />{t('ক্লাস তালিকা', 'Class list')}</button>
            <button className={mode === 'chapters' ? 'active' : ''} onClick={() => setMode('chapters')}><BarChart3 size={14} />{t('অগ্রগতি', 'Progress')}</button>
          </div>
        </div>

        {(showFilters || activeFilterCount > 0) && (
          <div className="video-filters">
            <label>{t('বিষয়', 'Subject')}
              <select value={subject} onChange={e => { setSubject(e.target.value as SubjectId | 'all'); setChapterId('all'); }}>
                <option value="all">{t('সব বিষয়', 'All subjects')}</option>
                {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>{t('পত্র', 'Paper')}
              <select value={paper} onChange={e => setPaper(e.target.value === 'all' ? 'all' : Number(e.target.value) as 1 | 2)}>
                <option value="all">{t('সব পত্র', 'All papers')}</option>
                <option value={1}>{t('১ম পত্র', '1st paper')}</option>
                <option value={2}>{t('২য় পত্র', '2nd paper')}</option>
              </select>
            </label>
            <label>{t('অধ্যায়', 'Chapter')}
              <select value={chapterId} onChange={e => setChapterId(e.target.value)}>
                <option value="all">{t('সব অধ্যায়', 'All chapters')}</option>
                {chapterOptions.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number ? `${chapter.number}. ` : ''}{chapter.title}</option>)}
              </select>
            </label>
            <label>{t('শিক্ষক / চ্যানেল', 'Teacher / channel')}
              <select value={teacher} onChange={e => setTeacher(e.target.value)}>
                <option value="all">{t('সব শিক্ষক', 'All teachers')}</option>
                {TEACHERS.map(item => <option key={item.name} value={item.name}>{item.name} ({bn(item.count)})</option>)}
              </select>
            </label>
            <label>{t('দেখা অবস্থা', 'Watched')}
              <select value={watched} onChange={e => setWatched(e.target.value as 'all' | 'watched' | 'unwatched')}>
                <option value="all">{t('সব অবস্থা', 'All')}</option>
                <option value="watched">{t('দেখা', 'Watched')}</option>
                <option value="unwatched">{t('দেখা বাকি', 'Unwatched')}</option>
              </select>
            </label>
            <button className={`button small ${bookmarkedOnly ? 'primary' : 'secondary'}`} aria-pressed={bookmarkedOnly} onClick={() => setBookmarkedOnly(v => !v)}>
              <Bookmark size={14} />{t('শুধু বুকমার্ক', 'Bookmarked only')}
            </button>
            {activeFilterCount > 0 && <button className="button ghost small" onClick={resetFilters}>{t('ফিল্টার মুছো', 'Clear filters')}</button>}
          </div>
        )}
        <p className="tiny-muted video-verified-note">
          <ShieldCheck size={13} /> {t(`ডেটাসেট শেষ যাচাই: ${bn(CATALOG_DATE)} · প্রতি বিল্ডে স্ট্রাকচার টেস্ট সব লিংক যাচাই করে`, `Dataset last verified: ${CATALOG_DATE} · structural tests re-check every link on each build`)}
        </p>

        {mode === 'classes' ? (
          grouped.length ? grouped.map(([cid, items]) => {
            const chapter = chapterById[cid];
            if (!chapter) return null;
            const subjectInfo = subjectById[chapter.subject];
            return (
              <div className="video-chapter-group" key={cid}>
                <button className="video-chapter-head" onClick={() => openChapter(chapter)}>
                  <span className="subject-dot" style={{ background: subjectInfo.color }} />
                  <strong>{chapter.title}</strong>
                  <small>{subjectInfo.name} · {t('পত্র', 'Paper')} {bn(chapter.paper)}</small>
                  <span className={`priority-badge ${chapter.priority.toLowerCase()}`}>{chapter.priority}</span>
                  <ChevronRight size={16} />
                </button>
                <div className="video-card-grid">
                  {items.map(item => {
                    const isWatched = !!data.classWatched[item.id];
                    const isBookmarked = !!data.classBookmarks[item.id];
                    return (
                      <article className={`video-card ${isWatched ? 'watched' : ''}`} key={item.id}>
                        <div className="video-card-top">
                          <span className={`video-type-badge t-${item.classType}`}>{classTypeLabel(item.classType, isEnglish())}</span>
                          {item.kind === 'playlist' && <span className="video-kind-badge">{t('প্লেলিস্ট', 'Playlist')}</span>}
                          {item.kind === 'search' && <span className="video-kind-badge search">{t('সার্চ', 'Search')}</span>}
                        </div>
                        <h3>{item.title}</h3>
                        <p className="video-card-channel">{item.channel}</p>
                        <div className="video-card-meta">
                          {item.durationSec && <span className="meta-chip"><Clock3 size={13} />{formatDurationBn(item.durationSec)}</span>}
                          {item.downloaded && item.fileSizeBytes && <span className="meta-chip"><HardDrive size={13} />{sizeLabel(item.fileSizeBytes)}</span>}
                          {item.downloaded && <span className="meta-chip saved">{t('ডাউনলোড করা', 'Downloaded')}</span>}
                          {item.watchedPercent && <span className="meta-chip"><span style={{ width: '34px', height: '8px', background: '#e5e7eb', borderRadius: '4px', display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }} /><span style={{ width: `${Math.min(100, item.watchedPercent)}%`, height: '8px', background: '#15803d', borderRadius: '4px', display: 'inline-block', verticalAlign: 'middle' }} />{bn(item.watchedPercent)}%</span>}
                        </div>
                        <div className="video-card-actions">
                          <button className="button primary small" onClick={() => setPlaying(item)}>
                            <Play size={14} fill="currentColor" />{item.kind === 'search' ? t('সার্চ খোলো', 'Open search') : t('চালাও', 'Play')}
                          </button>
                          <button
                            className={`icon-button ${isBookmarked ? 'selected' : ''}`}
                            aria-label={isBookmarked ? t('বুকমার্ক থেকে সরাও', 'Remove bookmark') : t('ক্লাস বুকমার্ক করো', 'Bookmark class')}
                            aria-pressed={isBookmarked}
                            onClick={() => toggleBookmark(item.id)}
                          >
                            <Bookmark size={15} fill={isBookmarked ? 'currentColor' : 'none'} />
                          </button>
                          {item.kind !== 'search' && (
                            <button
                              className={`icon-button ${isWatched ? 'selected' : ''}`}
                              aria-label={isWatched ? t('দেখা বাদ দাও', 'Unmark watched') : t('দেখেছি', 'Mark watched')}
                              aria-pressed={isWatched}
                              onClick={() => setData(d => toggleClassWatched(d, item.id))}
                            >
                              <Check size={15} />
                            </button>
                          )}
                          <a className="icon-button" href={item.url} target="_blank" rel="noreferrer" aria-label={t('YouTube-এ খোলো', 'Open on YouTube')}>
                            <ExternalLink size={15} />
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          }) : (
            <EmptyState
              title={classType === 'concept' || classType === 'practical'
                ? t('এই ধরনের ক্লাস এখনো যোগ করা হয়নি', 'This class type is not added yet')
                : t('মিলে যাওয়া ক্লাস নেই', 'No matching class')}
              description={classType === 'concept' || classType === 'practical'
                ? t('যাচাই করা রিসোর্স পাওয়া গেলে এখানে দেখানো হবে। ভুল বা কাল্পনিক লিংক দেওয়া হয় না।', 'Verified resources will appear here. Fake or unverified links are never shown.')
                : t('ফিল্টার বদলাও বা সার্চের শব্দ কমাও।', 'Change the filters or shorten your search.')}
              action={<button className="button secondary" onClick={resetFilters}>{t('ফিল্টার মুছো', 'Clear filters')}</button>}
            />
          )
        ) : (
          <ChapterProgressPanel watched={data.classWatched} subject={subject === 'all' ? undefined : subject} onOpen={cid => { const ch = chapterById[cid]; if (ch) openChapter(ch); }} />
        )}
      </section>

      <div className="info-panel">
        <ShieldCheck size={18} />
        <p>{t('সব লিংক স্থানীয় যাচাইকৃত ডেটাসেট থেকে এসেছে; কোনো ভিডিও, শিক্ষক বা প্লেলিস্ট বানানো হয়নি। কোনো অধ্যায়ে রিসোর্স না থাকলে "রিসোর্স এখনো যোগ করা হয়নি" দেখানো হয়।', 'All links come from the locally verified dataset — no video, teacher or playlist is invented. Chapters without a resource honestly show “not added yet”.')}</p>
      </div>

      {playing && <PlayerModal resource={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

const CATALOG_DATE = CLASS_CATALOG[0]?.lastVerified || '';

function ChapterProgressPanel({ watched, subject, onOpen }: {
  watched: Record<string, string>;
  subject?: SubjectId;
  onOpen: (chapterId: string) => void;
}) {
  const rows = useMemo(() => {
    const byChapter = new Map<string, { total: number; watchedCount: number }>();
    for (const item of CLASS_CATALOG) {
      if (item.status === 'search') continue;
      if (subject && item.subject !== subject) continue;
      const row = byChapter.get(item.chapterId) || { total: 0, watchedCount: 0 };
      row.total++;
      if (watched[item.id]) row.watchedCount++;
      byChapter.set(item.chapterId, row);
    }
    return [...byChapter.entries()]
      .map(([chapterId, row]) => ({ chapterId, ...row, percent: percent(row.watchedCount, row.total) }))
      .sort((a, b) => a.percent - b.percent || a.chapterId.localeCompare(b.chapterId));
  }, [watched, subject]);

  if (!rows.length) return <EmptyState title={t('কোনো অগ্রগতি নেই', 'No progress yet')} description={t('ফিল্টার বদলে অন্য বিষয় দেখো।', 'Switch the subject filter to see other subjects.')} />;
  return (
    <div className="video-chapter-progress">
      {rows.map(row => {
        const chapter = chapterById[row.chapterId];
        if (!chapter) return null;
        const info = subjectById[chapter.subject];
        return (
          <button key={row.chapterId} className="chapter-progress-row" onClick={() => onOpen(row.chapterId)}>
            <span className="chapter-progress-name">
              <strong>{chapter.title}</strong>
              <small style={{ color: info.color } as CSSProperties}>{info.short} · {t('পত্র', 'Paper')} {bn(chapter.paper)}</small>
            </span>
            <span className="chapter-progress-bar">
              <span className="progress-track"><span style={{ width: `${row.percent}%`, background: info.color }} /></span>
              <small>{bn(row.watchedCount)}/{bn(row.total)}</small>
            </span>
            <strong className="chapter-progress-percent">{bn(row.percent)}%</strong>
          </button>
        );
      })}
    </div>
  );
}
