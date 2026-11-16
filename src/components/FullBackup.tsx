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

export default function FullBackup() {
  const { data, setData, notify, confirm, timer } = usePlanner();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
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
        ),
        action: () => {
          void (async () => {
            setBusy(true);
            let staged:
              Awaited<ReturnType<typeof stageMediaRestore>> | undefined;
            try {
              staged = await stageMediaRestore(backup, progress);
              if (!saveData(staged.data, true))
                throw new Error(
                  "Metadata could not be saved. Existing data is unchanged.",
                );
              timer.reset();
              setData(staged.data);
              notify(
                t(
                  "ফাইল ও progress restore হয়েছে।",
                  "Files and progress restored.",
                ),
              );
            } catch (e) {
              await staged?.rollback();
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
          "JSON backup আগের মতোই থাকে। এই আলাদা binary backup-এ offline video, স্থানীয় PDF, notes ও সব progress একসঙ্গে থাকে। বড় ভিডিও থাকলে export/import-এ সময় ও অতিরিক্ত খালি storage প্রয়োজন।",
          "JSON backups still work. This binary backup includes offline videos, local PDFs, notes and all progress. Large media needs time and additional free storage.",
        )}
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
