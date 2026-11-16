import { canonicalUrl, collectLinks, resourceKey } from '../advanced';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  Bookmark, Download, ExternalLink, FileText, FolderOpen, Link2, Minus, Plus,
  Search, ShieldCheck, Trash2, Upload, Clock3, HardDrive,
} from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDate } from '../planner';
import { newId, nowIso } from '../storage';
import { deleteFile, downloadToFile, filesAvailable, getFile, putFile, storageEstimate } from '../files';
import { EmptyState, Modal, PageHeading, SubjectBadge } from '../components';
import { t } from '../i18n';
import {
  OFFICIAL_SOURCES, PDF_MATERIALS, PDF_MATERIAL_LABEL, formatBytes, materialSlots, totalPdfBytes,
} from '../pdfCatalog';
import type { SlotStatus } from '../pdfCatalog';
import type { PdfMaterialType, PdfResource } from '../types';

const STATUS_LABEL: Record<SlotStatus, { bn: string; en: string }> = {
  inApp: { bn: 'অ্যাপের ভেতরেই আছে', en: 'Built into the app' },
  notAdded: { bn: 'এখনো যোগ করা হয়নি', en: 'Not added yet' },
  linked: { bn: 'তোমার লিংক যুক্ত', en: 'Your link attached' },
};

function PdfViewer({ pdf, onClose }: { pdf: PdfResource; onClose: () => void }) {
  const { data, setData } = usePlanner();
  const [scale, setScale] = useState(1);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const bookmarked = data.pdfBookmarks.includes(pdf.id);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    if (pdf.local) {
      void getFile(pdf.id).then(file => {
        if (cancelled) return;
        if (!file) { setMissing(true); return; }
        url = URL.createObjectURL(file.blob);
        setObjectUrl(url);
      });
    }
    setData(d => {
      const recents = [{ id: pdf.id, at: nowIso() }, ...d.pdfRecent.filter(item => item.id !== pdf.id)].slice(0, 30);
      return {
        ...d,
        pdfRecent: recents,
        pdfs: d.pdfs.map(item => item.id === pdf.id ? { ...item, lastOpenedAt: nowIso() } : item),
      };
    });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // Recording "recently opened" must happen once per viewer open, not on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf.id]);

  const src = pdf.local ? objectUrl : pdf.url;
  const download = () => {
    if (pdf.local && objectUrl) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${pdf.title}.pdf`;
      a.click();
      return;
    }
    if (pdf.url) window.open(pdf.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal title={pdf.title} onClose={onClose} wide>
      <div className="chapter-modal-meta">
        <SubjectBadge subject={pdf.subject || 'physics'} />
        <span>{PDF_MATERIAL_LABEL(pdf.material)}</span>
        {pdf.sizeBytes ? <span>{formatBytes(pdf.sizeBytes)}</span> : null}
        {pdf.lastOpenedAt ? <span>{t('শেষ খোলা', 'Last opened')} {formatDate(pdf.lastOpenedAt.slice(0, 10))}</span> : null}
      </div>

      <div className="pdf-viewer-toolbar">
        <button className="icon-button" aria-label={t('ছোট করো', 'Zoom out')} onClick={() => setScale(s => Math.max(0.6, Math.round((s - 0.2) * 10) / 10))}><Minus size={16} /></button>
        <span className="pdf-zoom-label">{bn(Math.round(scale * 100))}%</span>
        <button className="icon-button" aria-label={t('বড় করো', 'Zoom in')} onClick={() => setScale(s => Math.min(2.5, Math.round((s + 0.2) * 10) / 10))}><Plus size={16} /></button>
        <button className="button ghost small" onClick={() => setScale(1)}>{t('রিসেট', 'Reset')}</button>
        <span className="pdf-toolbar-spacer" />
        <button className="button secondary small" onClick={download}><Download size={14} />{t('ডাউনলোড', 'Download')}</button>
        {pdf.url && <a className="button secondary small" href={pdf.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('নতুন ট্যাব', 'New tab')}</a>}
        <button className={`button secondary small ${bookmarked ? 'selected' : ''}`} aria-pressed={bookmarked} onClick={() => setData(d => ({ ...d, pdfBookmarks: bookmarked ? d.pdfBookmarks.filter(id => id !== pdf.id) : [...d.pdfBookmarks, pdf.id] }))}>
          <Bookmark size={14} fill={bookmarked ? 'currentColor' : 'none'} />{t('বুকমার্ক', 'Bookmark')}
        </button>
      </div>

      {src ? (
        <div className="pdf-viewer-frame" style={{ '--pdf-scale': scale } as CSSProperties}>
          <iframe src={src} title={pdf.title} className="pdf-iframe" />
        </div>
      ) : (
        <EmptyState
          title={missing ? t('ফাইলটি এখন পাওয়া যাচ্ছে না', 'File unavailable right now') : t('লোড হচ্ছে…', 'Loading…')}
          description={missing
            ? t('লোকাল ফাইলটি ডিভাইসের ফাইল স্টোরে পাওয়া যায়নি। আবার ডাউনলোড করো বা মূল লিংক ব্যবহার করো।', 'The local file is missing from the device store. Download it again or use the original link.')
            : t('ফাইলটি ডিভাইস থেকে আনা হচ্ছে।', 'Fetching the file from the device.')}
        />
      )}
      <p className="tiny-muted">
        {t('ভেতরে সার্চ ও পৃষ্ঠা নেভিগেশন ব্রাউজারের বিল্ট-ইন ভিউয়ারে থাকে (Ctrl/⌘+F সার্চ, ↑↓ পৃষ্ঠা)। কিছু সাইট ইফ্রেমে ফাইল বন্ধ রাখে — তখন "নতুন ট্যাব" বোতাম ব্যবহার করো।', 'Search and page navigation live in the built-in browser viewer (Ctrl/⌘+F to search, ↑↓ for pages). Some hosts block framing — use the “New tab” button then.')}
      </p>
    </Modal>
  );
}

export default function PdfsView() {
  const { data, setData, notify, navigate, confirm } = usePlanner();
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | 'all'>('all');
  const [materialFilter, setMaterialFilter] = useState<PdfMaterialType | 'all'>('all');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [openPdf, setOpenPdf] = useState<PdfResource | null>(null);
  const [showAdd, setShowAdd] = useState(()=>new URLSearchParams(window.location.search).get('collect')==='1');
  const [filesReady, setFilesReady] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add-form state
  const [copiedText, setCopiedText] = useState(()=>{const q=new URLSearchParams(window.location.search);return q.get('collect')==='1'?[q.get('text'),q.get('url')].filter(Boolean).join('\n').slice(0,20000):'';});
  const [title, setTitle] = useState(()=>new URLSearchParams(window.location.search).get('collect')==='1'?(new URLSearchParams(window.location.search).get('title')||'').slice(0,200):'');
  const [url, setUrl] = useState(()=>collectLinks(copiedText)[0]||'');
  const [pdfSubject, setPdfSubject] = useState<SubjectId>('physics');
  const [material, setMaterial] = useState<PdfMaterialType>('notes');
  const [pdfChapter, setPdfChapter] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [teacher, setTeacher] = useState('');
  const [className, setClassName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [checking, setChecking] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [prefillSlot, setPrefillSlot] = useState<string | null>(null);

  useEffect(() => {
    void filesAvailable().then(setFilesReady);
    void storageEstimate().then(setEstimate);
  }, []);

  const slots = useMemo(() => materialSlots(data), [data.pdfs]);
  const myPdfs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.pdfs
      .filter(pdf => subjectFilter === 'all' || pdf.subject === subjectFilter)
      .filter(pdf => materialFilter === 'all' || pdf.material === materialFilter)
      .filter(pdf => !chapterFilter || pdf.chapterId === chapterFilter)
      .filter(pdf => !bookmarkedOnly || data.pdfBookmarks.includes(pdf.id))
      .filter(pdf => !q || `${pdf.title} ${pdf.teacher || ''} ${pdf.className || ''} ${pdf.chapterId ? chapterById[pdf.chapterId]?.title : ''} ${PDF_MATERIAL_LABEL(pdf.material)}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.pdfs, data.pdfBookmarks, query, subjectFilter, materialFilter, bookmarkedOnly, chapterFilter]);

  const visibleSlots = slots.filter(slot => subjectFilter === 'all' || slot.subject === subjectFilter);

  const addPdf = (event: FormEvent) => {
    event.preventDefault();
    let cleanUrl: string;
    try { cleanUrl = canonicalUrl(url); if(sourceUrl) canonicalUrl(sourceUrl); } catch { notify('সঠিক public HTTP/HTTPS লিংক দাও', 'error'); return; }
    if(data.pdfs.some(p => p.url && resourceKey(p.url) === resourceKey(cleanUrl))) { notify('এই resource আগেই যোগ করা আছে', 'info'); return; }
    if (!title.trim()) { notify(t('ফাইলের নাম লেখো।', 'Give the file a title.'), 'error'); return; }
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) { notify(t('লিংক http/https দিয়ে শুরু হতে হবে।', 'The link must start with http/https.'), 'error'); return; }
    if (!cleanUrl) { notify(t('একটি পিডিএফ লিংক দাও অথবা নিচ থেকে ফাইল বাছো।', 'Paste a PDF link or pick a file below.'), 'error'); return; }
    if (data.pdfs.length >= 500) { notify(t('সর্বোচ্চ ৫০০টি পিডিএফ রাখা যায়।', 'Up to 500 PDFs can be stored.'), 'error'); return; }
    const entry: PdfResource = {
      id: newId(), title: title.trim(), url: cleanUrl, subject: pdfSubject, material,
      createdAt: nowIso(), classId: data.advanced?.classes.find(c=>c.title===className)?.id, chapterId: pdfChapter || undefined, teacher, className, sourceUrl: sourceUrl || undefined, linkStatus: 'unverified',
    };
    setData(d => ({ ...d, pdfs: [...d.pdfs, entry] }));
    setTitle(''); setUrl(''); setPrefillSlot(null); setShowAdd(false);
    notify(t('পিডিএফ লাইব্রেরিতে যোগ হয়েছে। ডাউনলোড করলে অফলাইনেও থাকবে।', 'Added to the PDF library. Download it to keep it offline.'));
  };

  const importFile = async (file: File) => {
    try{if(sourceUrl)canonicalUrl(sourceUrl);}catch{notify('সঠিক source HTTP/HTTPS link দাও','error');return;}
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify(t('শুধু PDF ফাইল বাছো।', 'Choose a PDF file only.'), 'error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) { notify(t('সর্বোচ্চ ১০০ MB ফাইল রাখা যায়।', 'Files up to 100 MB are allowed.'), 'error'); return; }
    if (filesReady === false) { notify(t('এই ব্রাউজারে লোকাল ফাইল স্টোর নেই — লিংক দিয়ে যোগ করো।', 'No local file store in this browser — add a link instead.'), 'error'); return; }
    if(importing) return;
    setImporting(true);
    let fingerprint: string;
    try {
      if(!(await file.slice(0,5).text()).startsWith('%PDF-')) throw new Error('Not a PDF');
      fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
    } catch { setImporting(false); notify('PDF যাচাই করা যায়নি', 'error'); return; }
    if(data.pdfs.some(p=>p.fingerprint===fingerprint)){setImporting(false);notify('একই PDF আগেই আছে','info');return;}
    const id = newId();
    const ok = await putFile({ id, blob: file, name: file.name, size: file.size, createdAt: nowIso() });
    setImporting(false);
    if (!ok) { notify(t('ফাইল সেভ হয়নি — ডিভাইসের স্টোরেজ খালি করে আবার চেষ্টা করো।', 'File not saved — free device storage and try again.'), 'error'); return; }
    const entry: PdfResource = {
      id, title: title.trim() || file.name.replace(/\.pdf$/i, ''), local: true, sizeBytes: file.size,
      subject: pdfSubject, material, createdAt: nowIso(), fingerprint, chapterId: pdfChapter || undefined, teacher, className, sourceUrl: sourceUrl || undefined,
    };
    setData(d => ({ ...d, pdfs: [...d.pdfs, entry] }));
    setTitle(''); setPrefillSlot(null); setShowAdd(false);
    notify(t('ফাইলটি ডিভাইসে সেভ হয়েছে — ইন্টারনেট ছাড়াই খোলা যাবে।', 'Saved on this device — opens without internet.'));
  };

  const startDownload = async (pdf: PdfResource) => {
    if (!pdf.url) return;
    setDownloading(prev => ({ ...prev, [pdf.id]: 0 }));
    const result = await downloadToFile(pdf.url, pdf.id, pdf.title, (loaded, total) => {
      setDownloading(prev => ({ ...prev, [pdf.id]: total ? Math.round((loaded / total) * 100) : -1 }));
    });
    setDownloading(prev => { const next = { ...prev }; delete next[pdf.id]; return next; });
    if (result.ok) {
      setData(d => ({ ...d, pdfs: d.pdfs.map(item => item.id === pdf.id ? { ...item, local: true, sizeBytes: result.size ?? item.sizeBytes } : item) }));
      notify(t('ডাউনলোড সম্পন্ন — এখন অফলাইনেও খোলা যাবে।', 'Downloaded — now it opens offline too.'));
    } else {
      notify(t('ডাউনলোড করা যায়নি (সাইট অনুমতি দেয় না বা ইন্টারনেট সমস্যা)। নতুন ট্যাবে খুলে সেভ করো।', 'Download failed (site blocks it or network issue). Open in a new tab and save instead.'), 'error');
    }
  };

  const removePdf = (pdf: PdfResource) => {
    confirm({
      title: t('এই পিডিএফটি মুছবে?', 'Remove this PDF?'),
      message: t(`"${pdf.title}" লাইব্রেরি থেকে সরানো হবে। লোকাল ফাইলও মুছে যাবে।`, `"${pdf.title}" will be removed from the library. A stored local file is deleted too.`),
      danger: true,
      label: t('মুছে ফেলো', 'Remove'),
      action: () => {void(async()=>{
        if(pdf.local&&!await deleteFile(pdf.id)){notify(t('ফাইল মুছতে ব্যর্থ; entry রাখা হয়েছে।','Could not delete file; entry retained.'),'error');return;}
        setData(d => ({ ...d, pdfs: d.pdfs.filter(item => item.id !== pdf.id), pdfBookmarks: d.pdfBookmarks.filter(id => id !== pdf.id), pdfRecent: d.pdfRecent.filter(item => item.id !== pdf.id) }));
        notify(t('পিডিএফ সরানো হয়েছে।', 'PDF removed.'));
      })();},
    });
  };

  const totalBytes = totalPdfBytes(data);
  const recentPdfs = data.pdfRecent
    .map(item => data.pdfs.find(pdf => pdf.id === item.id))
    .filter((pdf): pdf is PdfResource => !!pdf)
    .slice(0, 8);

  return (
    <div className="view pdfs-view">
      <PageHeading
        eyebrow="PDF & STUDY MATERIALS"
        title="সব নোট, শিট ও পিডিএফ — এক জায়গায়।"
        titleEn="Notes, sheets and PDFs — in one place."
        description="যাচাই করা লিংক ছাড়া কোনো পিডিএফ দেখানো হয় না। নিজের পারমিশনযোগ্য পিডিএফ যোগ করো, ডাউনলোড করে অফলাইনে রাখো।"
        descriptionEn="No PDF is shown without a verified link. Add your own permitted PDFs, download them and read offline."
        action={
          <div className="video-stats">
            <span><strong>{bn(data.pdfs.length)}</strong>{t('পিডিএফ', 'PDFs')}</span>
            <span><strong>{formatBytes(totalBytes)}</strong>{t('সেভ করা', 'stored')}</span>
            <span><strong>{bn(data.pdfBookmarks.length)}</strong>{t('বুকমার্ক', 'bookmarked')}</span>
          </div>
        }
      />

      <section className="card pdf-add-card">
        <div className="card-heading">
          <div>
            <h2><Upload size={18} />{t('নতুন পিডিএফ যোগ করো', 'Add a PDF')}</h2>
            <p>{t('নিজের খোঁজা বা কলেজ থেকে পাওয়া পারমিশনযোগ্য পিডিএফের লিংক বসাও, অথবা ফাইল বেছে নাও।', 'Paste a link to a permitted PDF you found, or pick a file.')}</p>
          </div>
          <button className="button secondary small" onClick={() => setShowAdd(v => !v)} aria-expanded={showAdd}>
            <Link2 size={14} />{showAdd ? t('বন্ধ করো', 'Close') : t('লিংক/ফাইল', 'Link / file')}
          </button>
        </div>
        {showAdd && (
          <form className="pdf-add-form" onSubmit={addPdf}>
            <label>{t('কপি করা description / comment','Copied description / comment')}<textarea maxLength={20000} value={copiedText} onChange={e=>setCopiedText(e.target.value)} placeholder={t('বৈধভাবে পাওয়া লেখা paste করো; কোনো scraping হয় না','Paste publicly shared text; nothing is scraped')}/></label>
            {collectLinks(copiedText).map(link=><button type="button" className="button secondary small collector-link" key={link} onClick={()=>{setUrl(link);if(!title)setTitle('Study material');}}>{link}</button>)}
            <label>{t('নাম', 'Title')}
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder={t('যেমন: ভেক্টর অধ্যায় নোট', 'e.g. Vector chapter notes')} required />
            </label>
            <label>{t('পিডিএফ লিংক', 'PDF link')}
              <input value={url} onChange={e => setUrl(e.target.value)} maxLength={2000} placeholder="https://…/file.pdf" inputMode="url" />
            </label>
            <label>{t('বিষয়', 'Subject')}
              <select value={pdfSubject} onChange={e => {setPdfSubject(e.target.value as SubjectId);setPdfChapter('');}}>
                {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Chapter<select value={pdfChapter} onChange={e=>setPdfChapter(e.target.value)}><option value="">General</option>{CHAPTERS.filter(c=>c.subject===pdfSubject).map(c=><option key={c.id} value={c.id}>Paper {c.paper} · {c.title}</option>)}</select></label>
            <label>Teacher<input value={teacher} maxLength={200} onChange={e=>setTeacher(e.target.value)}/></label>
            <label>Class name<select value={className} onChange={e=>{const name=e.target.value;setClassName(name);const c=data.advanced?.classes.find(c=>c.title===name);if(c){setTeacher(c.teacher);setPdfChapter(c.chapterId);setPdfSubject(chapterById[c.chapterId].subject);}}}><option value="">None / general</option>{data.advanced?.classes.map(c=><option key={c.id}>{c.title}</option>)}</select><input aria-label="Custom class name" value={className} maxLength={300} onChange={e=>setClassName(e.target.value)}/></label>
            <label>Source link<input type="url" value={sourceUrl} maxLength={2000} onChange={e=>setSourceUrl(e.target.value)}/></label>
            <label>{t('ধরন', 'Type')}
              <select value={material} onChange={e => setMaterial(e.target.value as PdfMaterialType)}>
                {PDF_MATERIALS.map(item => <option key={item.id} value={item.id}>{item.bn}</option>)}
              </select>
            </label>
            <div className="pdf-add-actions">
              <button className="button primary" type="submit"><Link2 size={15} />{t('লিংক যোগ করো', 'Add link')}</button>
              <button className="button secondary" type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}><Upload size={15} />{t('ফাইল বাছো', 'Pick file')}</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }}
              />
            </div>
            {prefillSlot && <p className="tiny-muted">{t('স্লট থেকে এসেছে — লিংক বসিয়ে যোগ করলে সেই ঘর ভরে যাবে।', 'Pre-filled from the material slot — saving the link fills that slot.')}</p>}
          </form>
        )}
      </section>

      <div className="filter-bar pdf-filter-bar"><select aria-label="Chapter filter" value={chapterFilter} onChange={e=>setChapterFilter(e.target.value)}><option value="">All chapters</option>{CHAPTERS.filter(c=>subjectFilter==='all'||c.subject===subjectFilter).map(c=><option key={c.id} value={c.id}>{subjectById[c.subject].short} {c.paper} · {c.title}</option>)}</select>
        <label className="search-field">
          <Search size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('পিডিএফ খুঁজো…', 'Search PDFs…')} aria-label={t('পিডিএফ খুঁজো', 'Search PDFs')} />
        </label>
        <select aria-label={t('বিষয় ফিল্টার', 'Subject filter')} value={subjectFilter} onChange={e => setSubjectFilter(e.target.value as SubjectId | 'all')}>
          <option value="all">{t('সব বিষয়', 'All subjects')}</option>
          {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label={t('ধরন ফিল্টার', 'Type filter')} value={materialFilter} onChange={e => setMaterialFilter(e.target.value as PdfMaterialType | 'all')}>
          <option value="all">{t('সব ধরন', 'All types')}</option>
          {PDF_MATERIALS.map(item => <option key={item.id} value={item.id}>{item.bn}</option>)}
        </select>
        <button className={`button small ${bookmarkedOnly ? 'primary' : 'secondary'}`} aria-pressed={bookmarkedOnly} onClick={() => setBookmarkedOnly(v => !v)}>
          <Bookmark size={14} />{t('বুকমার্ক', 'Bookmarked')}
        </button>
      </div>

      <section className="card">
        <div className="card-heading">
          <div><h2><FolderOpen size={18} />{t('আমার পিডিএফ', 'My PDFs')}</h2><p>{t('ডাউনলোড করা বা যোগ করা ফাইল — বিষয় ও অধ্যায় অনুযায়ী সাজানো।', 'Downloaded or added files — organised by subject and chapter.')}</p></div>
          <span className="count-badge">{bn(myPdfs.length)}</span>
        </div>
        {myPdfs.length ? (
          <div className="pdf-list">
            {myPdfs.map(pdf => {
              const progress = downloading[pdf.id];
              const isBookmarked = data.pdfBookmarks.includes(pdf.id);
              return (
                <article className="pdf-row" key={pdf.id}>
                  <span className="pdf-row-icon"><FileText size={19} /></span>
                  <div className="pdf-row-main">
                    <strong>{pdf.title}</strong><span>{pdf.teacher} · {pdf.className} · {pdf.linkStatus || 'unverified'}</span>
                    <span>
                      {pdf.subject ? subjectById[pdf.subject]?.short : t('সাধারণ', 'General')} · {PDF_MATERIAL_LABEL(pdf.material)}
                      {pdf.chapterId && chapterById[pdf.chapterId] ? ` · ${chapterById[pdf.chapterId].title}` : ''}
                    </span>
                    <small>
                      {pdf.local ? <><HardDrive size={11} /> {t('ডিভাইসে সেভ', 'Saved on device')}</> : <><ExternalLink size={11} /> {t('শুধু লিংক', 'Link only')}</>}
                      {pdf.sizeBytes ? ` · ${formatBytes(pdf.sizeBytes)}` : ''}
                      {pdf.lastOpenedAt ? ` · ${t('শেষ খোলা', 'Last opened')} ${formatDate(pdf.lastOpenedAt.slice(0, 10))}` : ''}
                    </small>
                    {progress !== undefined && <span className="pdf-download-progress">{t('ডাউনলোড', 'Download')} {progress < 0 ? t('সাইজ অজানা…','size unknown…') : `${bn(progress)}%`}</span>}
                  </div>
                  <div className="pdf-row-actions">
                    {pdf.url && <button className="button secondary small" disabled={checking===pdf.id} onClick={()=>void (async()=>{
                      setChecking(pdf.id);let linkStatus: 'available'|'broken'|'unverified'='unverified';
                      try{const r=await fetch(pdf.url!,{method:'HEAD',credentials:'omit',signal:AbortSignal.timeout(12000)});linkStatus=r.ok?'available':r.status===404||r.status===410?'broken':'unverified';}catch{ /* CORS/offline is not proof of a broken link */ }
                      setData(d=>({...d,pdfs:d.pdfs.map(p=>p.id===pdf.id?{...p,linkStatus}:p)}));setChecking(null);
                      notify(linkStatus==='unverified'?'যাচাই সম্ভব হয়নি (CORS/offline)। মূল source খোলো।':linkStatus==='broken'?'Broken link':'Link available',linkStatus==='broken'?'error':'info');
                    })()}>{checking===pdf.id?'Checking…':'Check link'}</button>}
                    <button className="button primary small" onClick={() => setOpenPdf(pdf)}><FileText size={14} />{t('খোলো', 'Open')}</button>
                    {pdf.url && !pdf.local && (
                      <button className="button secondary small" onClick={() => void startDownload(pdf)} disabled={progress !== undefined}>
                        <Download size={14} />{progress !== undefined ? (progress < 0 ? '…' : `${bn(progress)}%`) : t('ডাউনলোড', 'Download')}
                      </button>
                    )}
                    <button className={`icon-button ${isBookmarked ? 'selected' : ''}`} aria-label={t('বুকমার্ক', 'Bookmark')} aria-pressed={isBookmarked} onClick={() => setData(d => ({ ...d, pdfBookmarks: isBookmarked ? d.pdfBookmarks.filter(id => id !== pdf.id) : [...d.pdfBookmarks, pdf.id] }))}>
                      <Bookmark size={15} fill={isBookmarked ? 'currentColor' : 'none'} />
                    </button>
                    <button className="icon-button delete-button" aria-label={t('মুছো', 'Delete')} onClick={() => removePdf(pdf)}><Trash2 size={15} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={t('এখনো কোনো পিডিএফ নেই', 'No PDFs yet')}
            description={t('উপরে থেকে নিজের পিডিএফের লিংক বা ফাইল যোগ করো। ভাঙা বা অনুমতিহীন লিংক দেওয়া হয় না।', 'Add your own PDF link or file above. Broken or unpermitted links are never provided.')}
          />
        )}
      </section>

      <section className="card pdf-slots-card">
        <div className="card-heading">
          <div>
            <h2><ShieldCheck size={18} />{t('স্টাডি মেটেরিয়াল স্লট', 'Study-material slots')}</h2>
            <p>{t('প্রতিটি বিষয়ের জন্য প্রয়োজনীয় উপকরণের ঘর। যাচাই করা পিডিএফ না থাকলে স্পষ্ট "যোগ করা হয়নি" দেখানো হয় — ভুল বোতাম নয়।', 'Slots for every material a subject needs. Without a verified PDF the slot honestly says “not added yet” — never a fake button.')}</p>
          </div>
        </div>
        <div className="pdf-slot-grid">
          {visibleSlots.map(slot => (
            <div className={`pdf-slot s-${slot.status}`} key={slot.key}>
              <span className="pdf-slot-subject" style={{ color: subjectById[slot.subject].color }}>{subjectById[slot.subject].short}</span>
              <strong>{PDF_MATERIAL_LABEL(slot.material)}</strong>
              <em className={`pdf-slot-status ${slot.status}`}>{t(STATUS_LABEL[slot.status].bn, STATUS_LABEL[slot.status].en)}</em>
              {slot.status === 'inApp' && (
                <button className="text-button" onClick={() => navigate(slot.inAppTarget === 'practice' ? 'practice' : 'library')}>
                  {t('অ্যাপে খোলো', 'Open in app')}<ExternalLink size={13} />
                </button>
              )}
              {slot.status === 'linked' && slot.linkedPdfIds[0] && (
                <button className="text-button" onClick={() => { const pdf = data.pdfs.find(item => item.id === slot.linkedPdfIds[0]); if (pdf) setOpenPdf(pdf); }}>
                  {t('খোলো', 'Open')}<FileText size={13} />
                </button>
              )}
              {slot.status === 'notAdded' && (
                <button className="text-button" onClick={() => {
                  setPdfSubject(slot.subject); setMaterial(slot.material); setPrefillSlot(slot.key); setShowAdd(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}>
                  <Link2 size={13} />{t('লিংক যোগ করো', 'Attach a link')}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {recentPdfs.length > 0 && (
        <section className="card">
          <div className="card-heading"><div><h2><Clock3 size={18} />{t('সাম্প্রতিক খোলা', 'Recently opened')}</h2></div></div>
          <div className="pdf-recent-row">
            {recentPdfs.map(pdf => <button key={pdf.id} className="recent-chip" onClick={() => setOpenPdf(pdf)}><FileText size={14} />{pdf.title}</button>)}
          </div>
        </section>
      )}

      <section className="card pdf-storage-card">
        <div className="card-heading"><div><h2><HardDrive size={18} />{t('স্টোরেজ ও ডাউনলোড', 'Storage & downloads')}</h2>
          <p>{filesReady === false
            ? t('এই ব্রাউজারে লোকাল ফাইল স্টোর পাওয়া যায়নি — শুধু লিংক-ভিত্তিক পিডিএফ কাজ করবে।', 'No local file store in this browser — link-based PDFs only.')
            : t('ডাউনলোড করা ফাইল ডিভাইসেই থাকে; ইন্টারনেট ছাড়াই খোলা যায়।', 'Downloaded files stay on the device and open without internet.')}</p>
        </div></div>
        <div className="storage-facts">
          <span><strong>{bn(data.pdfs.filter(pdf => pdf.local).length)}</strong>{t('অফলাইন ফাইল', 'offline files')}</span>
          <span><strong>{formatBytes(totalBytes)}</strong>{t('মেটাডেটা সাইজ', 'metadata size')}</span>
          {estimate && <span><strong>{formatBytes(estimate.usage)}</strong>{t(`ব্রাউজার ব্যবহার (${formatBytes(estimate.quota)} কোটা)`, `browser usage (${formatBytes(estimate.quota)} quota)`)}</span>}
        </div>
        <p className="tiny-muted">{t('YouTube বা অন্য প্ল্যাটফর্মের ভিডিও এখানে ডাউনলোড করা হয় না — তার নিয়ম ভাঙা হয় না। শুধু তোমার যোগ করা বা উৎসে অনুমতিথাকা ফাইলই সেভ হয়।', 'Videos from YouTube or other platforms are never downloaded here — their terms are respected. Only files you add, or sources that permit it, are stored.')}</p>
      </section>

      <section className="card pdf-sources-card">
        <div className="card-heading"><div><h2><ShieldCheck size={18} />{t('সরকারি উৎস', 'Official sources')}</h2><p>{t('পাঠ্যবই ও সিলেবাসের জন্য NCTB-র যাচাই করা পাতা। সরাসরি PDF লিংক নিশ্চয়তা নেই — পাতা থেকে নিজে খুঁজে নাও।', 'Verified NCTB pages for textbooks and syllabus. No direct-PDF guarantee — find the file from the page yourself.')}</p></div></div>
        <div className="pdf-source-list">
          {OFFICIAL_SOURCES.map(source => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="pdf-source-row">
              <strong>{source.name}</strong>
              <span>{source.note}</span>
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      </section>

      {openPdf && <PdfViewer pdf={openPdf} onClose={() => setOpenPdf(null)} />}
    </div>
  );
}
