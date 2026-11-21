import { useMemo, useRef, useState } from 'react';
import {
  Camera, Check, ChevronRight,  Download, FileImage, FolderOpen, Image,
  RotateCcw, Save, Scan, Trash2, X,
} from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, chapterById, SUBJECTS } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDate, todayKey } from '../planner';
import { LIMITS, newId, saveData } from '../storage';
import { idbGet } from '../storage-manager';
import {
  adjustImage, canvasToDataUrl, cropCanvas, deletePagesFromDb, loadImageToCanvas,
  loadPagesFromDb, MAX_SCANNED_PAGES, perspectiveCorrect, rotateCanvas, savePagesToDb,
} from '../scanner';
import { EmptyState, PageHeading, SubjectBadge } from '../components';
import { t } from '../i18n';
import { saveBackupBlob } from '../mediaBackup';

interface PageEdit {
  rotate: number;
  brightness: number;
  contrast: number;
  crop: { x: number; y: number; w: number; h: number } | null;
  perspective: { enabled: boolean; tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] } | null;
}
const freshEdit = (): PageEdit => ({ rotate: 0, brightness: 100, contrast: 100, crop: null, perspective: null });
interface WorkingPage {
  id: string; dataUrl: string; sourceDataUrl: string; width: number; height: number;
  edit: PageEdit; pending: boolean; error: string;
}

export default function NotesScannerView() {
  const { data, setData, notify, confirm } = usePlanner();
  const latestData = useRef(data); latestData.current = data;
  const editVersions = useRef(new Map<string, number>());
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [pages, setPages] = useState<WorkingPage[]>([]);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [form, setForm] = useState({ subject: 'physics' as SubjectId, chapterId: '', title: '' });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'capture' | 'library'>('capture');

  const chapters = useMemo(() => subjectOptions(form.subject), [form.subject]);
  
  const meta = data.scannedNotes;
  const subjectMeta = useMemo(() => {
    const out = new Map<SubjectId, { total: number; pages: number }>();
    for (const s of SUBJECTS) out.set(s.id, { total: 0, pages: 0 });
    for (const m of meta) {
      const cur = out.get(m.subject)!;
      cur.total += 1;
      cur.pages += m.pageCount;
    }
    return out;
  }, [meta]);

  const openCamera = () => {
    if (cameraRef.current) cameraRef.current.click();
  };

  const openFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const addImageFile = async (file: File, index: number) => {
    try {
      const canvas = await loadImageToCanvas(file);
      const dataUrl = canvasToDataUrl(canvas);
      setPages(prev => [...prev, { id: newId(), dataUrl, sourceDataUrl: dataUrl, width: canvas.width, height: canvas.height, edit: freshEdit(), pending: false, error: '' }]);
      setActivePage(index);
      setViewMode('capture');
      notify(`${bn(index + 1)} নম্বর পৃষ্ঠা যোগ করা হয়েছে।`, 'info');
      return true;
    } catch { notify(t('চিত্র লোড করা যায়নি।', 'The image could not be loaded.'), 'error'); return false; }
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = Math.max(0, MAX_SCANNED_PAGES - pages.length);
    setCapturing(true);
    try {
      let index = pages.length;
      for (const file of files.slice(0, remaining)) if (await addImageFile(file, index)) index++;
      if (files.length > remaining) notify(t('এক নোটে সর্বোচ্চ ৫০টি পৃষ্ঠা রাখা যায়। বাকি ছবিগুলো অন্য নোটে যোগ করো।', 'A note can contain at most 50 pages. Add the remaining images as another note.'), 'info');
    } finally { setCapturing(false); e.target.value = ''; }
  };

  const removePage = (index: number) => {
    setPages(prev => prev.filter((_, i) => i !== index));
    editVersions.current.delete(pages[index].id);
    if (activePage === index) setActivePage(pages.length > 1 ? Math.min(index, pages.length - 2) : null);
    else if (activePage !== null && activePage > index) setActivePage(activePage - 1);
  };

  const clearPages = () => {
    setPages([]);
    setActivePage(null);
  };

  const currentPage = activePage !== null ? pages[activePage] : null;
  const pageEdit = currentPage?.edit;
  const editsPending = pages.some(page => page.pending || !!page.error);

  const applyEditToCanvas = async (canvas: HTMLCanvasElement, edit: PageEdit): Promise<HTMLCanvasElement> => {
    let c = canvas;
    if (edit.rotate !== 0) c = rotateCanvas(c, edit.rotate);
    if (edit.brightness !== 100 || edit.contrast !== 100) adjustImage(c, { brightness: edit.brightness, contrast: edit.contrast });
    if (edit.crop) {
      const { x, y, w, h } = edit.crop;
      if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > c.width || y + h > c.height)
        throw new Error(t('ক্রপের সীমানা ছবির মধ্যে রাখো।', 'Keep the crop rectangle inside the image.'));
      c = cropCanvas(c, x, y, w, h);
    }
    if (edit.perspective?.enabled) {
      const points = [edit.perspective.tl, edit.perspective.tr, edit.perspective.br, edit.perspective.bl];
      if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > c.width || y > c.height))
        throw new Error(t('চারটি কোণা ছবির মধ্যে রাখো।', 'Keep all four corners inside the image.'));
      const turns = points.map(([x, y], i) => {
        const [a, b] = points[(i + 1) % 4], [u, v] = points[(i + 2) % 4];
        return (a - x) * (v - b) - (b - y) * (u - a);
      });
      if (turns.some(turn => turn <= 0)) throw new Error(t('চারটি কোণা যেন একে অপরকে অতিক্রম না করে।', 'The four corners must form a non-crossing quadrilateral.'));
      c = perspectiveCorrect(c, edit.perspective, c.width, c.height);
    }
    return c;
  };

  const updatePageEdit = async (patch: Partial<PageEdit>) => {
    if (!currentPage) return;
    const page = currentPage, next = { ...page.edit, ...patch };
    const version = (editVersions.current.get(page.id) || 0) + 1;
    editVersions.current.set(page.id, version);
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, edit: next, pending: true, error: '' } : p));
    try {
      const canvas = await loadImageToCanvas(page.sourceDataUrl);
      const processed = await applyEditToCanvas(canvas, next);
      const dataUrl = canvasToDataUrl(processed);
      if (editVersions.current.get(page.id) !== version) return;
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, dataUrl, width: processed.width, height: processed.height, pending: false, error: '' } : p));
    } catch (error) {
      if (editVersions.current.get(page.id) !== version) return;
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, pending: false, error: (error as Error).message } : p));
    }
  };

  const saveNote = async () => {
    if (!form.title.trim()) { notify(t('নোটের শিরোনাম লিখুন।', 'Write a title for the note.')); return; }
    if (pages.length === 0) { notify(t('একটি পৃষ্ঠা স্ক্যান করুন।', 'Scan at least one page.')); return; }
    if (form.title.trim().length > 300 || pages.length > MAX_SCANNED_PAGES || data.scannedNotes.length >= LIMITS.scannedNotes) {
      notify(t('শিরোনাম সর্বোচ্চ ৩০০ অক্ষর, এক নোটে ৫০ পৃষ্ঠা ও সর্বোচ্চ ২০০টি নোট রাখা যায়।', 'Use at most 300 title characters, 50 pages per note and 200 saved notes.'), 'error'); return;
    }
    setSaving(true);
    const expected = latestData.current;
    let pageKeys: string[] = [], committed = false;
    try {
      const pageData = pages.map(p => ({ dataUrl: p.dataUrl, width: p.width, height: p.height }));
      pageKeys = await savePagesToDb(pageData);
      let sizeBytes = 0;
      for (const key of pageKeys) {
        const row = await idbGet(key);
        if (typeof row === 'string') sizeBytes += new TextEncoder().encode(row).byteLength;
      }
      const entry = {
        id: newId(),
        title: form.title.trim(),
        subject: form.subject,
        chapterId: form.chapterId || undefined,
        createdAt: new Date().toISOString(),
        pageCount: pages.length,
        sizeBytes,
        pdfExported: false,
        pageKeys,
      } as import('../types').ScannedNoteMeta;
      if (latestData.current !== expected) throw new Error('Study data changed while saving. Retry with the editable pages.');
      const next = { ...expected, scannedNotes: [...expected.scannedNotes, entry] };
      if (!saveData(next, true)) throw new Error('Note metadata could not be saved.');
      committed = true;
      setData(next);
      notify(`${pages.length} পৃষ্ঠার নোট সেভ করা হয়েছে।`, 'success');
      setPages([]);
      setActivePage(null);
      setForm({ subject: 'physics', chapterId: '', title: '' });
    } catch {
      if (!committed && pageKeys.length) await deletePagesFromDb(pageKeys);
      notify(t('নোট সেভ করা যায়নি। ছবিগুলো এখানেই আছে; খালি স্টোরেজ যাচাই করে আবার চেষ্টা করো।', 'The note could not be saved. Your editable images are still here; check free storage and retry.'), 'error');
    } finally { setSaving(false); }
  };

  const exportPdf = async (note: import('../types').ScannedNoteMeta) => {
    try {
      const urls = await loadPagesFromDb(note.pageKeys);
      if (urls.length !== note.pageCount) throw new Error('One or more scanned pages are missing.');
      // Keep the PDF renderer out of the initial app payload. The offline shell
      // precaches this build's dynamic chunks, so saved scans still export offline.
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
      for (const [index, url] of urls.entries()) {
        const image = await loadImageToCanvas(url);
        if (index > 0) pdf.addPage();
        const scale = Math.min(pageW / image.width, pageH / image.height);
        const width = image.width * scale, height = image.height * scale;
        pdf.addImage(image, 'JPEG', (pageW - width) / 2, (pageH - height) / 2, width, height);
      }
      await saveBackupBlob(pdf.output('blob'), `${note.title.replace(/\s+/g, '_')}.pdf`);
      setData(d => ({ ...d, scannedNotes: d.scannedNotes.map(item => item.id === note.id ? { ...item, pdfExported: true } : item) }));
      notify(t('পিডিএফ রপ্তানি করা হয়েছে।', 'PDF exported.'), 'success');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') notify(t('সম্পূর্ণ PDF রপ্তানি করা যায়নি। পৃষ্ঠাগুলো যাচাই করো; মূল ছবিগুলো অক্ষত আছে।', 'The complete PDF could not be exported. Check its pages; the original images are unchanged.'), 'error');
    }
  };

  const deleteNote = async (note: import('../types').ScannedNoteMeta) => {
    const current = latestData.current;
    const next = { ...current, scannedNotes: current.scannedNotes.filter(n => n.id !== note.id) };
    if (!saveData(next, true)) { notify(t('নোট মুছতে পারিনি। ছবিগুলো অক্ষত আছে।', 'The note could not be deleted. Its images are unchanged.'), 'error'); return; }
    setData(next);
    // Restored or imported notes can share page keys. Only erase a page when
    // the last surviving note no longer refers to it.
    const retained = new Set(next.scannedNotes.flatMap(item => item.pageKeys));
    const unreferenced = [...new Set(note.pageKeys)].filter(key => !retained.has(key));
    const imagesRemoved = await deletePagesFromDb(unreferenced);
    if (!imagesRemoved) {
      notify(t('নোটের তালিকা থেকে সরানো হয়েছে, কিন্তু কিছু ছবির ডেটা মুছতে পারিনি। ডিভাইস স্টোরেজ যাচাই করো।', 'The note was removed from the list, but some image data could not be erased. Check device storage.'), 'error');
      return;
    }
    notify(t('নোট মুছে ফেলা হয়েছে।', 'Note deleted.'), 'success');
  };

  const notesByChapter = useMemo(() => {
    const map = new Map<string, import('../types').ScannedNoteMeta[]>();
    for (const n of meta) {
      const key = n.chapterId || `__${n.subject}__`;
      const list = map.get(key) || [];
      list.push(n);
      map.set(key, list);
    }
    return map;
  }, [meta]);

  return (
    <div className="view scanner-view">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFiles}
        aria-label={t('ক্যামেরায় নোটের ছবি তোলো', 'Capture note with camera')}
        tabIndex={-1}
        className="sr-only"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        aria-label={t('নোটের ছবি ফাইল থেকে বেছে নাও', 'Choose note images from files')}
        tabIndex={-1}
        className="sr-only"
      />
      <PageHeading
        eyebrow={t('হস্তলিখিত নোট স্ক্যানার', 'Handwritten notes scanner')}
        title={t('নোট স্ক্যান করো', 'Scan notes')}
        titleEn="Scan notes"
        description={t('ক্যামেরায় নোটের ছবি তোলো, ক্রপ/রোটেট/ব্রাইটনেস ঠিক করো, বহুবিধ পৃষ্ঠা যোগ করো এবং অধ্যায়ভুক্ত পিডিএফ হিসেবে সেভ করো। সবকিছু এই ডিভাইসেই থাকে।', 'Capture note pages with the camera, crop/rotate/adjust brightness, add multiple pages and save chapter-wise as PDF. Everything stays on this device.')}
        descriptionEn=""
        action={
          <div className="scanner-header-actions">
            <button type="button" className="button primary" onClick={openCamera} disabled={capturing || saving}>
              <Camera size={16} />{capturing ? t('ছবি নেওয়া চলছে...', 'Capturing...') : t('ক্যামেরা', 'Camera')}
            </button>
            <button type="button" className="button secondary" onClick={openFilePicker} disabled={capturing || saving}>
              <FileImage size={16} />{t('ফাইল থেকে বেছে নেও', 'Choose files')}
            </button>
            <button type="button" className="button secondary" onClick={() => setViewMode('library')}>
              <FolderOpen size={16} />{t('সংরক্ষিত নোট', 'Saved notes')}
            </button>
          </div>
        }
      />
      {viewMode === 'library' ? (
        <div>
          {meta.length === 0 && (
            <EmptyState
              title={t('এখনও কোনো স্ক্যান নেই', 'No scanned notes yet')}
              description={t('ক্যামেরায় নোটের ছবি তোলা শুরু করো।', 'Start capturing notes with the camera.')}
              action={<button className="button primary" onClick={() => setViewMode('capture')}> <Scan size={15} />{t('নোট স্ক্যান করো', 'Scan a note')}</button>}
            />
          )}
          {meta.length > 0 && (
            <div className="scanned-library-grid">
              {[...notesByChapter.entries()].map(([key, notes]) => {
                const ch = chapterById[key.replace(/^__/, '').replace(/__$/, '')];
                const isSubjectGroup = key.startsWith('__') && key.endsWith('__');
                const subjectId = isSubjectGroup ? key.slice(2, -2) as SubjectId : (ch?.subject as SubjectId);
                return (
                  <div key={key} className="scanned-chapter-group">
                    <div className="scanned-group-head">
                      <SubjectBadge subject={subjectId} />
                      <span>{ch ? ch.title : t('অন্যান্য অধ্যায়', 'Other chapters')}</span>
                      <span className="tiny-muted">{bn(notes.length)} {t('নোট', 'notes')} · {bn(notes.reduce((a, b) => a + b.pageCount, 0))} {t('পৃষ্ঠা', 'pages')}</span>
                    </div>
                    <div className="scanned-card-grid">
                      {notes.map(note => (
                        <article key={note.id} className="scanned-card">
                          <div className="scanned-card-head">
                            <strong>{note.title}</strong>
                            <span className={`pdf-badge ${note.pdfExported ? 'done' : ''}`}>
                              {note.pdfExported ? <Check size={12} /> : <FileImage size={12} />}{note.pdfExported ? t('পিডিএফ', 'PDF') : t('চিত্র', 'Images')}
                            </span>
                          </div>
                          <div className="scanned-card-meta">
                            <span>{bn(note.pageCount)} {t('পৃষ্ঠা', 'pages')}</span>
                            <span>{formatDate(todayKey(new Date(note.createdAt)))}</span>
                            <span>{bn(Math.round(note.sizeBytes / 1024))} KB</span>
                          </div>
                          <div className="scanned-card-actions">
                            <button type="button" className="button secondary small" onClick={() => void exportPdf(note)}>
                              <Download size={14} />{t('পিডিএফ', 'PDF')}
                            </button>
                            <button type="button" className="button danger small" aria-label={t(`স্ক্যান করা নোট মুছো: ${note.title}`, `Delete scanned note: ${note.title}`)} onClick={() => confirm({ title: t('স্ক্যান করা নোট মুছবে?', 'Delete scanned note?'), message: t('শুধু এই নোটের পৃষ্ঠাগুলোও মুছবে; অন্য নোটে ব্যবহৃত পৃষ্ঠা থাকবে। আগে PDF বা full backup রাখো।', 'Pages used only by this note will also be deleted; pages shared with other notes will be kept. Keep a PDF or full backup first.'), danger: true, label: t('মুছে ফেলো', 'Delete'), action: () => { void deleteNote(note); } })}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {pages.length === 0 && (
            <EmptyState
              title={t('এখনও কোনো পৃষ্ঠা স্ক্যান করা হয়নি', 'No pages scanned yet')}
              description={t('ক্যামেরা বা ফাইল বোতামে চাপ দিয়ে নোটের ছবি যোগ করো।', 'Tap camera or choose files to add note pages.')}
            />
          )}
          {pages.length > 0 && (
            <>
              <div className="scanner-page-strip">
                <span className="scanner-page-count">{bn(pages.length)} {t('পৃষ্ঠা', 'pages')}</span>
                <button type="button" className="button secondary small" onClick={clearPages} disabled={capturing || saving}><X size={16} />{t('সব মুছো', 'Clear all')}</button>
              </div>
              <div className="scanner-main">
                <div className="scanner-preview">
                  {currentPage && (
                    <div className="scanner-preview-wrap">
                      <img className="scanner-preview-img" src={currentPage.dataUrl} alt="scanned page" />
                      <div className="scanner-page-nav">
                        <button type="button" className="icon-button" aria-label={t('আগের পৃষ্ঠা', 'Previous page')} disabled={activePage === 0 || capturing || saving} onClick={() => setActivePage(activePage! - 1)}><ChevronRight size={16} /></button>
                        <span>{bn(activePage! + 1)} / {bn(pages.length)}</span>
                        <button type="button" className="icon-button" aria-label={t('পরের পৃষ্ঠা', 'Next page')} disabled={activePage === pages.length - 1 || capturing || saving} onClick={() => setActivePage(activePage! + 1)}><ChevronRight size={16} /></button>
                        <button type="button" className="icon-button danger" aria-label={t('এই পৃষ্ঠা সরাও', 'Remove current page')} disabled={capturing || saving} onClick={() => removePage(activePage!)}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
                <fieldset className="scanner-tools" disabled={saving || capturing}>
                  <div className="scanner-tool-group">
                    <strong>{t('চিত্র সম্পাদনা', 'Edit image')}</strong>
                    <div className="scanner-edit-row">
                      <button type="button" className={`edit-btn ${pageEdit?.rotate === 90 || pageEdit?.rotate === 270 ? 'active' : ''}`} onClick={() => void updatePageEdit({ rotate: ((pageEdit?.rotate || 0) + 90) % 360, crop: null, perspective: null })}>
                        <RotateCcw size={16} />{t('রোটেট', 'Rotate')}
                      </button>
                      <button type="button" className={`edit-btn ${pageEdit?.crop ? 'active' : ''}`} aria-pressed={!!pageEdit?.crop} onClick={() => currentPage && void updatePageEdit({ crop: pageEdit?.crop ? null : { x: 0, y: 0, w: currentPage.width, h: currentPage.height } })}>
                        <Image size={16} />{t('ক্রপ', 'Crop')}
                      </button>
                      <button type="button" className={`edit-btn ${pageEdit?.perspective?.enabled ? 'active' : ''}`} aria-pressed={!!pageEdit?.perspective?.enabled} onClick={() => currentPage && void updatePageEdit({ perspective: pageEdit?.perspective ? null : { enabled: true, tl: [0, 0], tr: [currentPage.width, 0], br: [currentPage.width, currentPage.height], bl: [0, currentPage.height] } })}>
                        <Scan size={16} />{t('পারস্পেক্টিভ', 'Perspective')}
                      </button>
                      <button type="button" className="edit-btn" onClick={() => void updatePageEdit(freshEdit())}>{t('মূল ছবি', 'Reset edits')}</button>
                    </div>
                    <div className="scanner-slider-row">
                      <label htmlFor="scan-brightness">{t('ব্রাইটনেস', 'Brightness')}</label>
                      <input id="scan-brightness" type="range" min="0" max="200" value={pageEdit?.brightness ?? 100} onChange={e => void updatePageEdit({ brightness: Number(e.target.value) })} className="scanner-slider" />
                      <span>{bn(pageEdit?.brightness ?? 100)}%</span>
                    </div>
                    <div className="scanner-slider-row">
                      <label htmlFor="scan-contrast">{t('কনট্রাস্ট', 'Contrast')}</label>
                      <input id="scan-contrast" type="range" min="0" max="200" value={pageEdit?.contrast ?? 100} onChange={e => void updatePageEdit({ contrast: Number(e.target.value) })} className="scanner-slider" />
                      <span>{bn(pageEdit?.contrast ?? 100)}%</span>
                    </div>
                    {pageEdit?.crop && <div className="scanner-adjust-grid">{([
                      ['x', t('বাম সীমানা', 'Crop left')], ['y', t('উপরের সীমানা', 'Crop top')],
                      ['w', t('ক্রপের প্রস্থ', 'Crop width')], ['h', t('ক্রপের উচ্চতা', 'Crop height')],
                    ] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={key === 'w' || key === 'h' ? 1 : 0} value={pageEdit.crop![key]} onChange={e => void updatePageEdit({ crop: { ...pageEdit.crop!, [key]: Number(e.target.value) } })}/></label>)}</div>}
                    {pageEdit?.perspective && <div className="scanner-adjust-grid">{([
                      ['tl', t('উপরে বাম', 'Top-left')], ['tr', t('উপরে ডান', 'Top-right')],
                      ['br', t('নিচে ডান', 'Bottom-right')], ['bl', t('নিচে বাম', 'Bottom-left')],
                    ] as const).flatMap(([corner, label]) => ([0, 1] as const).map(axis => <label key={`${corner}-${axis}`}>{label} {axis === 0 ? 'x' : 'y'}<input type="number" min={0} value={pageEdit.perspective![corner][axis]} onChange={e => {
                      const point: [number, number] = [...pageEdit.perspective![corner]]; point[axis] = Number(e.target.value);
                      void updatePageEdit({ perspective: { ...pageEdit.perspective!, [corner]: point } });
                    }}/></label>))}</div>}
                    {currentPage?.pending && <p role="status">{t('ছবি প্রস্তুত হচ্ছে…', 'Processing image…')}</p>}
                    {currentPage?.error && <p role="alert">{currentPage.error}</p>}
                  </div>
                  <div className="scanner-tool-group">
                    <strong>{t('নোট বিবরনী', 'Note details')}</strong>
                    <label className="form-label">{t('বিষয়', 'Subject')}<select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value as SubjectId, chapterId: '' })}>{SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                    <label className="form-label">{t('অধ্যায়', 'Chapter')}<select value={form.chapterId} onChange={e => setForm({ ...form, chapterId: e.target.value })}>
                      <option value="">{t('অধ্যায়নির্বাচন না', 'No chapter')}</option>
                      {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select></label>
                    <label className="form-label">{t('শিরোনাম', 'Title')}<input data-autofocus maxLength={300} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t('যেমন: ভেক্টর অধ্যায়ের নোট', 'e.g. Vector chapter notes')} /></label>
                  </div>
                  <div className="scanner-tool-group">
                    <strong>{t('সংরক্ষণ', 'Save')}</strong>
                    <p className="tiny-muted">{t('পৃষ্ঠাগুলি এই ডিভাইসের ইনডেক্সডডিবিতে সেভ হবে এবং নোটের তালিকায় দেখানো হবে।', 'Pages are saved to this device’s IndexedDB and appear in the notes list.')}</p>
                    <button type="button" className="button primary full-width" disabled={saving || capturing || editsPending || !form.title.trim() || pages.length === 0} onClick={saveNote}>
                      <Save size={16} />{saving ? t('সেভ করা চলছে...', 'Saving...') : t('নোট হিসেবে সেভ করো', 'Save as note')}
                    </button>
                  </div>
                </fieldset>
                <div className="scanner-storage-info">
                  <SubjectBadge subject={form.subject} /> <strong>{subjectMeta.get(form.subject)?.pages ?? 0}</strong> {t('এই বিষয়ের স্ক্যান করা পৃষ্ঠা', 'scanned pages for this subject')} · {bn(subjectMeta.get(form.subject)?.total ?? 0)} {t('নোট', 'notes')}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function subjectOptions(subject: SubjectId) {
  return CHAPTERS.filter(c => c.subject === subject);
}
