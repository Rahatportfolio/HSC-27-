import { useMemo, useRef, useState } from 'react';
import {
  Camera, Check, ChevronRight,  Download, FileImage, FolderOpen, Image,
  RotateCcw, Save, Scan, Trash2, X,
} from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, chapterById, SUBJECTS } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDate } from '../planner';
import { newId } from '../storage';
import { idbGet } from '../storage-manager';
import {
  adjustImage, canvasToDataUrl, cropCanvas, deletePagesFromDb, loadImageToCanvas,
  loadPagesFromDb, perspectiveCorrect, readScannedMeta, rotateCanvas, savePagesToDb,
  writeScannedMeta,
} from '../scanner';
import { EmptyState, PageHeading, SubjectBadge } from '../components';
import { t } from '../i18n';
import jsPDF from 'jspdf';

export default function NotesScannerView() {
  const { setData, notify } = usePlanner();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [pages, setPages] = useState<{ id: string; dataUrl: string; width: number; height: number }[]>([]);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [pageEdit, setPageEdit] = useState<{
    rotate: number;
    brightness: number;
    contrast: number;
    crop: { x: number; y: number; w: number; h: number } | null;
    perspective: { enabled: boolean; tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] } | null;
  } | null>(null);
  const [form, setForm] = useState({ subject: 'physics' as SubjectId, chapterId: '', title: '' });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'capture' | 'library'>('capture');

  const chapters = useMemo(() => subjectOptions(form.subject), [form.subject]);
  
  const meta = useMemo(() => readScannedMeta(), []);
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

  const addImageFile = async (file: File) => {
    try {
      setCapturing(true);
      const canvas = await loadImageToCanvas(file);
      const dataUrl = canvasToDataUrl(canvas);
      setPages(prev => [...prev, { id: newId(), dataUrl, width: canvas.width, height: canvas.height }]);
      setActivePage(pages.length);
      setPageEdit({ rotate: 0, brightness: 100, contrast: 100, crop: null, perspective: null });
      notify(`${bn(pages.length + 1)} নম্বর পৃষ্ঠা যোগ করা হয়েছে।`, 'info');
    } catch { notify('চিত্র লোড করা যায়নি।', 'error'); }
    finally { setCapturing(false); }
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) await addImageFile(file);
    e.target.value = '';
  };

  const removePage = (index: number) => {
    setPages(prev => prev.filter((_, i) => i !== index));
    if (activePage === index) setActivePage(null);
    else if (activePage !== null && activePage > index) setActivePage(activePage - 1);
    setPageEdit(null);
  };

  const clearPages = () => {
    setPages([]);
    setActivePage(null);
    setPageEdit(null);
  };

  const currentPage = activePage !== null ? pages[activePage] : null;

  const applyEditToCanvas = async (canvas: HTMLCanvasElement, edit: NonNullable<typeof pageEdit>): Promise<HTMLCanvasElement> => {
    let c = canvas;
    if (edit.rotate !== 0) c = rotateCanvas(c, edit.rotate);
    if (edit.brightness !== 100 || edit.contrast !== 100) adjustImage(c, { brightness: edit.brightness, contrast: edit.contrast });
    if (edit.crop) c = cropCanvas(c, edit.crop.x, edit.crop.y, edit.crop.w, edit.crop.h);
    if (edit.perspective?.enabled) {
      c = perspectiveCorrect(c, edit.perspective, c.width, c.height);
    }
    return c;
  };

  const updatePageEdit = async (patch: Partial<NonNullable<typeof pageEdit>>) => {
    if (!currentPage || !pageEdit) return;
    const next = { ...pageEdit, ...patch };
    setPageEdit(next);
    const canvas = await loadImageToCanvas(currentPage.dataUrl);
    const processed = await applyEditToCanvas(canvas, next);
    const dataUrl = canvasToDataUrl(processed);
    setPages(prev => prev.map((p, i) => (i === activePage ? { ...p, dataUrl, width: processed.width, height: processed.height } : p)));
  };

  const saveNote = async () => {
    if (!form.title.trim()) { notify('নোটের শিরোনাম লিখুন।'); return; }
    if (pages.length === 0) { notify('একটি পৃষ্ঠা স্ক্যান করুন।'); return; }
    setSaving(true);
    try {
      const pageData = pages.map(p => ({ dataUrl: p.dataUrl, width: p.width, height: p.height }));
      const pageKeys = await savePagesToDb(pageData);
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
      setData(d => ({ ...d, scannedNotes: [...d.scannedNotes, entry] }));
      writeScannedMeta(readScannedMeta().concat([entry]));
      notify(`${pages.length} পৃষ্ঠার নোট সেভ করা হয়েছে।`, 'success');
      setPages([]);
      setActivePage(null);
      setPageEdit(null);
      setForm({ subject: 'physics', chapterId: '', title: '' });
    } catch { notify('নোট সেভ করা যায়নি।', 'error'); }
    finally { setSaving(false); }
  };

  const exportPdf = async (note: import('../types').ScannedNoteMeta) => {
    const urls = await loadPagesFromDb(note.pageKeys);
    if (!urls.length) { notify('পৃষ্ঠা পাওয়া যায়নি।', 'error'); return; }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < urls.length; i++) {
      if (i > 0) pdf.addPage();
      const img = document.createElement('img');
      await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = urls[i]; });
      const iw = img.width, ih = img.height;
      const scale = Math.min(pageW / iw, pageH / ih);
      const dw = iw * scale, dh = ih * scale;
      pdf.addImage(urls[i], 'JPEG', (pageW - dw) / 2, (pageH - dh) / 2, dw, dh);
    }
    pdf.save(`${note.title.replace(/\s+/g, '_')}.pdf`);
    setData(d => {
      const idx = d.scannedNotes.findIndex(n => n.id === note.id);
      if (idx < 0) return d;
      const next = [...d.scannedNotes];
      next[idx] = { ...next[idx], pdfExported: true };
      return { ...d, scannedNotes: next };
    });
    writeScannedMeta(readScannedMeta().map(n => n.id === note.id ? { ...n, pdfExported: true } : n));
    notify('পিডিএফ রপ্তানি করা হয়েছে।', 'success');
  };

  const deleteNote = async (note: import('../types').ScannedNoteMeta) => {
    await deletePagesFromDb(note.pageKeys);
    setData(d => ({ ...d, scannedNotes: d.scannedNotes.filter(n => n.id !== note.id) }));
    writeScannedMeta(readScannedMeta().filter(n => n.id !== note.id));
    notify('নোট মুছে ফেলা হয়েছে।', 'success');
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
    <div className="page">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFiles}
        className="sr-only"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
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
            <button type="button" className="button primary" onClick={openCamera} disabled={capturing}>
              <Camera size={16} />{capturing ? t('ছবি নেওয়া চলছে...', 'Capturing...') : t('ক্যামেরা', 'Camera')}
            </button>
            <button type="button" className="button secondary" onClick={openFilePicker}>
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
                            <span>{formatDate(note.createdAt)}</span>
                            <span>{bn(Math.round(note.sizeBytes / 1024))} KB</span>
                          </div>
                          <div className="scanned-card-actions">
                            <button type="button" className="button secondary small" onClick={() => void exportPdf(note)}>
                              <Download size={14} />{t('পিডিএফ', 'PDF')}
                            </button>
                            <button type="button" className="button danger small" onClick={() => deleteNote(note)}>
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
                <button type="button" className="button secondary small" onClick={clearPages}><X size={16} />{t('সব মুছো', 'Clear all')}</button>
              </div>
              <div className="scanner-main">
                <div className="scanner-preview">
                  {currentPage && (
                    <div className="scanner-preview-wrap">
                      <img className="scanner-preview-img" src={currentPage.dataUrl} alt="scanned page" />
                      <div className="scanner-page-nav">
                        <button type="button" className="icon-button" disabled={activePage === 0} onClick={() => setActivePage(activePage! - 1)}><ChevronRight size={16} /></button>
                        <span>{bn(activePage! + 1)} / {bn(pages.length)}</span>
                        <button type="button" className="icon-button" disabled={activePage === pages.length - 1} onClick={() => setActivePage(activePage! + 1)}><ChevronRight size={16} /></button>
                        <button type="button" className="icon-button danger" onClick={() => removePage(activePage!)}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="scanner-tools">
                  <div className="scanner-tool-group">
                    <strong>{t('চিত্র সম্পাদনা', 'Edit image')}</strong>
                    <div className="scanner-edit-row">
                      <button type="button" className={`edit-btn ${pageEdit?.rotate === 90 || pageEdit?.rotate === 270 ? 'active' : ''}`} onClick={() => currentPage && updatePageEdit({ rotate: ((pageEdit?.rotate || 0) + 90) % 360 })}>
                        <RotateCcw size={16} />{t('রোটেট', 'Rotate')}
                      </button>
                      <button type="button" className={`edit-btn ${pageEdit?.crop ? 'active' : ''}`} onClick={() => setPageEdit(p => p ? null : { ...(p || { rotate: 0, brightness: 100, contrast: 100, crop: null, perspective: null }), crop: { x: 0, y: 0, w: currentPage!.width, h: currentPage!.height } })}>
                        <Image size={16} />{t('ক্রপ', 'Crop')}
                      </button>
                      <button type="button" className={`edit-btn ${pageEdit?.perspective?.enabled ? 'active' : ''}`} onClick={() => setPageEdit(p => p ? null : { ...(p || { rotate: 0, brightness: 100, contrast: 100, crop: null, perspective: null }), perspective: { enabled: true, tl: [0, 0], tr: [currentPage!.width, 0], br: [currentPage!.width, currentPage!.height], bl: [0, currentPage!.height] } })}>
                        <Scan size={16} />{t('পারস্পেক্টিভ', 'Perspective')}
                      </button>
                    </div>
                    <div className="scanner-slider-row">
                      <label>{t('ব্রাইটনেস', 'Brightness')}</label>
                      <input type="range" min="0" max="200" value={pageEdit?.brightness || 100} onChange={e => currentPage && updatePageEdit({ brightness: Number(e.target.value) })} className="scanner-slider" />
                      <span>{bn(pageEdit?.brightness || 100)}%</span>
                    </div>
                    <div className="scanner-slider-row">
                      <label>{t('কনট্রাস্ট', 'Contrast')}</label>
                      <input type="range" min="0" max="200" value={pageEdit?.contrast || 100} onChange={e => currentPage && updatePageEdit({ contrast: Number(e.target.value) })} className="scanner-slider" />
                      <span>{bn(pageEdit?.contrast || 100)}%</span>
                    </div>
                  </div>
                  <div className="scanner-tool-group">
                    <strong>{t('নোট বিবরনী', 'Note details')}</strong>
                    <label className="form-label">{t('বিষয়', 'Subject')}<select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value as SubjectId, chapterId: '' })}>{SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                    <label className="form-label">{t('অধ্যায়', 'Chapter')}<select value={form.chapterId} onChange={e => setForm({ ...form, chapterId: e.target.value })}>
                      <option value="">{t('অধ্যায়নির্বাচন না', 'No chapter')}</option>
                      {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select></label>
                    <label className="form-label">{t('শিরোনাম', 'Title')}<input data-autofocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t('যেমন: ভেক্টর অধ্যায়ের নোট', 'e.g. Vector chapter notes')} /></label>
                  </div>
                  <div className="scanner-tool-group">
                    <strong>{t('সংরক্ষণ', 'Save')}</strong>
                    <p className="tiny-muted">{t('পৃষ্ঠাগুলি এই ডিভাইসের ইনডেক্সডডিবিতে সেভ হবে এবং নোটের তালিকায় দেখানো হবে।', 'Pages are saved to this device’s IndexedDB and appear in the notes list.')}</p>
                    <button type="button" className="button primary full-width" disabled={saving || !form.title.trim() || pages.length === 0} onClick={saveNote}>
                      <Save size={16} />{saving ? t('সেভ করা চলছে...', 'Saving...') : t('নোট হিসেবে সেভ করো', 'Save as note')}
                    </button>
                  </div>
                </div>
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
