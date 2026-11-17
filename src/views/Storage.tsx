import { useCallback, useState } from 'react';
import { AlertCircle, BarChart3, HardDrive, RefreshCw, Trash2, Download } from 'lucide-react';
import { usePlanner } from '../context';
import { todayKey } from '../planner';
import { bn } from '../planner';
import { clearTempCache, findDuplicates, getStorageUsage } from '../storage-manager';
import { downloadBackup, needsBackup } from '../backup';
import { EmptyState, PageHeading } from '../components';
import { t } from '../i18n';

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return bn(bytes) + ' বাইট';
  if (bytes < 1024 * 1024) return bn(Math.round(bytes / 1024)) + ' কিলোবাইট';
  if (bytes < 1024 * 1024 * 1024) return bn(Math.round(bytes / (1024 * 1024))) + ' মেগাবাইট';
  return bn(Math.round(bytes / (1024 * 1024 * 1024))) + ' গিগাবাইট';
}

export default function StorageView() {
  const { data, notify } = usePlanner();
  const [usage, setUsage] = useState<{ localStorageBytes: number; indexedDBBytes: number; indexedDBAvailable: boolean; totalBytes: number; estimate: { quota: number; usage: number; usagePercent: number } | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<{ kind: string; id: string; title: string; url: string; subject?: string }[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setUsage(await getStorageUsage()); } catch { setUsage(null); }
    finally { setLoading(false); }
  }, []);

  const clearCache = async () => {
    const removed = await clearTempCache(7);
    await refresh();
    notify(removed ? `${bn(removed)} ${t('পুরোনো ক্যাশে এন্ট্রি মুছে ফেলা হয়েছে।', 'old cache entries cleared.')}` : t('ক্যাশে ইতিমধ্যে পরিষ্কার।', 'Cache already clean.'));
  };

  const checkDuplicates = async () => {
    setDuplicates(await findDuplicates(
      data.videos.map(v => ({ id: v.id, title: v.title, url: v.url, subject: v.subject })),
      data.pdfs.map(p => ({ id: p.id, title: p.title, url: p.url, subject: p.subject })),
    ));
  };

  const makeBackup = () => {
    try {
      const name = downloadBackup(data, todayKey());
      notify(`${name} সেভ হয়েছে। নিরাপদ জায়গায় রাখো।`);
    } catch { notify(t('ব্যাকআপ তৈরি হয়নি। সেটিংস থেকে আবার চেষ্টা করো।', 'The backup was not created. Try again from Settings.'), 'error'); }
  };

  return (
    <div className="view storage-view">
      <PageHeading
        eyebrow={t('স্টোরেজ ব্যবস্থাপনা', 'Storage management')}
        title={t('ডিভাইসের স্টোরেজ', 'Device storage')}
        titleEn="Device storage"
        description={t('অনলাইন সার্ভার ছাড়াই সব তথ্য এই ডিভাইসে থাকে। এখানে ব্যবহৃত জায়গা, ডুপ্লিকেট লিংক ও পুরোনো ক্যাশে পরিষ্কার করতে পারো।', 'Everything stays on this device — no online server. Check used space, find duplicate links and clear old caches here.')}
        descriptionEn=""
      />
      <div className="stat-row">
        <div className="stat-card"><div className="stat-value">{usage ? bytesLabel(usage.totalBytes) : '—'}</div><div className="stat-label">{t('ব্যবহৃত জায়গা', 'Space used')}</div></div>
        <div className="stat-card"><div className="stat-value">{bn(usage?.localStorageBytes || 0)}</div><div className="stat-label">{t('অ্যাপ ডাটা (লোকাল)', 'App data')}</div></div>
        <div className="stat-card"><div className="stat-value">{usage?.indexedDBAvailable ? bytesLabel(usage.indexedDBBytes) : t('নেই', 'n/a')}</div><div className="stat-label">{t('ক্যাশে ও ইনডেক্স', 'Cache & indexes')}</div></div>
        <div className="stat-card"><div className="stat-value">{usage?.estimate ? bn(usage.estimate.usagePercent) + '%' : '—'}</div><div className="stat-label">{t('কোটার ব্যবহার', 'Quota used')}</div></div>
      </div>

      <div className="storage-actions">
        <button type="button" className="button primary" disabled={loading} onClick={refresh}><RefreshCw size={16} />{t('পুনরায় যাচাই করো', 'Refresh')}</button>
        <button type="button" className="button secondary" onClick={clearCache}><Trash2 size={16} />{t('পুরোনো ক্যাশে মুছো', 'Clear old cache')}</button>
        <button type="button" className="button secondary" onClick={checkDuplicates}><Download size={16} />{t('ডুপ্লিকেট খোঁজা', 'Find duplicates')}</button>
        <button type="button" className="button secondary" onClick={makeBackup}><Download size={16} />{t('JSON ব্যাকআপ', 'JSON backup')}</button>
      </div>

      {usage && (
        <div className="usage-detail">
          <p><HardDrive size={16} /> {t('লোকাল স্টোরেজে অ্যাপ ডাটা', 'App data in local storage')}: {bytesLabel(usage.localStorageBytes)}</p>
          {usage.indexedDBAvailable ? <p><BarChart3 size={16} /> {t('ইনডেক্সডডিবিতে ক্যাশে', 'Cache in IndexedDB')}: {bytesLabel(usage.indexedDBBytes)}</p> : <p><AlertCircle size={16} /> {t('এই ব্রাউজারে ইনডেক্সডডিবি উপলব্ধ নয়।', 'IndexedDB unavailable in this browser.')}</p>}
          {usage.estimate && <p>{t('ব্রাউজার স্টোরেজ ব্যবহার: ', 'Browser storage usage: ')}{bn(usage.estimate.usage)} বাইট / {bytesLabel(usage.estimate.quota)} ({bn(usage.estimate.usagePercent)}%)</p>}
          <p>{needsBackup(data, todayKey()) ? t('এক সপ্তাহ ধরে ব্যাকআপ নেওয়া হয়নি।', 'No backup for a week.') : t('নিরাপদ ব্যাকআপ আছে।', 'A safe backup exists.')}</p>
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="duplicate-list">
          <h3>{t('ডুপ্লিকেট লিংক', 'Duplicate links')}</h3>
          <p>{t('একই উৎসের লিংক একাধিকবার যোগ করা হয়েছে।', 'Same source added more than once.')}</p>
          {duplicates.map(item => (
            <div key={item.url + item.id} className="duplicate-row">
              <span>{item.title}</span>
              <span className="tiny-muted">{item.url}</span>
            </div>
          ))}
        </div>
      )}

      {!usage && !loading && (
        <EmptyState title={t('স্টোরেজ তথ্য পাওয়ா যায়নি', 'Storage info unavailable')} description={t('ব্রাউজার স্টোরেজ APIs এই ডিভাইসে সীমাবদ্ধ হতে পারে।', 'Browser storage APIs may be limited on this device.')} />
      )}
    </div>
  );
}
