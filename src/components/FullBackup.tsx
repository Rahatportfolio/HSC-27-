import { useRef, useState } from "react";
import { usePlanner } from "../context";
import {
  createMediaBackup,
  inspectMediaBackup,
  saveBackupBlob,
  stageMediaRestore,
} from "../mediaBackup";
import { saveData } from "../storage";
import { markBackup } from "../backup";
import { t } from "../i18n";
import type { Settings } from '../planner';

export default function FullBackup({ onRestored }: { onRestored?: (settings: Settings) => void }) {
  const { data, setData, notify, confirm, timer, setSelectedDate } = usePlanner();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const latestData = useRef(data);
  latestData.current = data;
  const progress = (done: number, total: number) =>
    setStatus(`${done} / ${total} files`);
  const exportAll = async () => {
    setBusy(true);
    setStatus(t("ফাইল প্রস্তুত হচ্ছে…", "Preparing files…"));
    try {
      const blob = await createMediaBackup(data, progress);
      await saveBackupBlob(
        blob,
        `prostuti-full-${new Date().toISOString().slice(0, 10)}.prostuti`,
      );
      markBackup();
      notify(t("Full backup রপ্তানি হয়েছে।", "Full backup exported."));
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        notify((e as Error).message, "error");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };
  const restore = async (file: File) => {
    setBusy(true);
    setStatus(t("ব্যাকআপ যাচাই হচ্ছে…", "Validating backup…"));
    try {
      const backup = await inspectMediaBackup(file);
      confirm({
        title: t("Media-সহ backup ফিরিয়ে আনবে?", "Restore full backup?"),
        message: t(
          "বর্তমান metadata এই backup দিয়ে বদলাবে। পুরোনো file overwrite হবে না। আগে বর্তমান backup রাখো।",
          "Current metadata will be replaced. Existing files are never overwritten. Keep a backup first.",
        ) + (backup.warnings?.length ? `\n${backup.warnings.join(' ')}` : ''),
        action: () => {
          void (async () => {
            setBusy(true);
            let staged:
              Awaited<ReturnType<typeof stageMediaRestore>> | undefined;
            const expected = latestData.current;
            let committed = false;
            try {
              staged = await stageMediaRestore(backup, progress);
              if (latestData.current !== expected)
                throw new Error(
                  "Study data changed during restore. New progress was kept; retry when no session is being saved.",
                );
              const restoredData = { ...staged.data };
              delete restoredData.activeExam; // A restore resets live papers, like the other clocks.
              if (!saveData(restoredData, true))
                throw new Error(
                  "Metadata could not be saved. Existing data is unchanged.",
                );
              committed = true;
              timer.reset();
              try { localStorage.removeItem('hsc27-exam-clock-v1'); } catch { /* storage unavailable */ }
              setData(restoredData);
              setSelectedDate(staged.data.settings.startDate);
              onRestored?.(staged.data.settings);
              const warnings = backup.warnings || [];
              notify(
                t("ফাইল ও progress restore হয়েছে।", "Files and progress restored.") + (warnings.length ? ` ${warnings.join(' ')}` : ''),
                warnings.length ? 'info' : 'success',
              );
            } catch (e) {
              // Once metadata refers to staged files, rolling them back would corrupt
              // the saved profile. A later UI failure must leave those bytes intact.
              if (!committed) await staged?.rollback();
              notify((e as Error).message, "error");
            } finally {
              setBusy(false);
              setStatus("");
            }
          })();
        },
      });
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };
  return (
    <section className="study-panel">
      <h2>{t("ফাইল-সহ সম্পূর্ণ ব্যাকআপ", "Full backup including files")}</h2>
      <p>
        {t(
          "এই binary backup-এ offline video, স্থানীয় PDF, হস্তলিখিত নোটের ছবি ও সব progress একসঙ্গে থাকে। বড় মিডিয়া থাকলে export/import-এ সময় ও অতিরিক্ত খালি storage প্রয়োজন।",
          "This binary backup includes offline videos, local PDFs, handwritten image pages and all progress. Large media needs time and additional free storage.",
        )}
      </p>
      <p className="notice-box" role="note" aria-label={t('স্ক্যানের ব্যাকআপের সীমা', 'Scan backup limitations')}>
        {t('শুধু নতুন Full backup-এ হস্তলিখিত ছবির bytes থাকে। JSON ও পুরোনো Full backup-এ স্ক্যানের নাম-তথ্য থাকে, ছবি নয়। মূল ডিভাইস বা আলাদা PDF রাখো; ওই পুরোনো ফাইল থেকে অনুপস্থিত ছবি উদ্ধার করা যায় না।', 'Only new full backups include handwritten image bytes. JSON and legacy full backups contain scan metadata, not images. Keep the original device or separate PDFs; missing images cannot be recovered from those files.')}
      </p>
      <div className="study-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void exportAll()}
        >
          {t("Full backup export", "Export full backup")}
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {t("Full backup import", "Import full backup")}
        </button>
        <input
          ref={input}
          type="file"
          accept=".prostuti,application/vnd.prostuti.backup"
          hidden
          aria-label={t("সম্পূর্ণ ব্যাকআপ ফাইল", "Full backup file")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void restore(f);
          }}
        />
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
