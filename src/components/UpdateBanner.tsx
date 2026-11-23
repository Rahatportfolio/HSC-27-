import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import { applyServiceWorkerUpdate, SW_UPDATE_EVENT } from '../swUpdate';

/** One-tap reload banner shown only after a new version has fully downloaded
 * and is waiting. Never appears mid-timer on its own — the student decides. */
export default function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const show = () => setReady(true);
    window.addEventListener(SW_UPDATE_EVENT, show);
    return () => window.removeEventListener(SW_UPDATE_EVENT, show);
  }, []);
  if (!ready) return null;
  return <div className="update-banner" role="status">
    <RefreshCw size={16} aria-hidden="true" />
    <p>{t('নতুন সংস্করণ এসেছে — টাইমারসহ সব ঠিকঠাক পেতে রিলোড করো।', 'A new version is ready — reload to get it, including the fixed timers.')}</p>
    <button type="button" className="button primary small" onClick={applyServiceWorkerUpdate}>{t('রিলোড করো', 'Reload')}</button>
  </div>;
}
