import { useState } from "react";
import { taskRepository, journalRepository } from "../../data/repositories";
import { isDesktopRuntime } from "../../utils/tauriRuntime";
import { flushPendingStorage } from "../../utils/deferredStorage";
import { getLocalSyncData, SYNC_APPLIED_EVENT } from "../../utils/sync/types";
import { requestCategoryReplace } from "../../utils/sync/syncApplyGuard";
import { storage } from "../../utils/unifiedStorage";
import {
  MAX_BACKUP_BYTES,
  downloadPlannerFile,
  exportPortableBackup,
  keepExisting,
  previewPortableBackup,
  restorePortableBackup,
  summarizePortableRestore,
} from "../../utils/sync/portableBackup";
import { previewTaskCsv } from "../../utils/sync/taskCsvImport";

type Preview =
  | {
      kind: "backup";
      value: ReturnType<typeof previewPortableBackup>;
      summary: ReturnType<typeof summarizePortableRestore>;
    }
  | { kind: "csv"; value: Awaited<ReturnType<typeof previewTaskCsv>> };

export function PortableBackupPanel() {
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const desktop = isDesktopRuntime();

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!preview) return;
    if (preview.kind === "backup") {
      await restorePortableBackup(preview.value);
    } else {
      flushPendingStorage();
      const current = getLocalSyncData();
      const ids = new Set([...current.tasks, ...current.completedTasks].map((task) => task.id));
      const newTasks = preview.value.items.filter((task) => !ids.has(task.id));
      const tasks = keepExisting(
        current.tasks,
        newTasks.filter((task) => !task.completedAt),
      );
      const completedTasks = keepExisting(
        current.completedTasks,
        newTasks.filter((task) => !!task.completedAt),
      );
      localStorage.setItem("aero_todos", JSON.stringify(tasks));
      localStorage.setItem("aero_completed_todos", JSON.stringify(completedTasks));
      requestCategoryReplace("tasks", "completedTasks");
      window.dispatchEvent(
        new CustomEvent(SYNC_APPLIED_EVENT, { detail: { ...current, tasks, completedTasks } }),
      );
      setMessage(`已导入 ${newTasks.length} 项待办`);
    }
    await Promise.all([
      taskRepository.flushPendingWrites(),
      journalRepository.flushPendingWrites(),
    ]);
    flushPendingStorage();
    await storage.flushNow();
    if (preview.kind === "backup") setMessage("已合并备份，现有同 ID 记录与同日日记已保留");
    setPreview(undefined);
  }

  const summary = preview?.kind === "backup" ? preview.summary : undefined;
  const button = "border rounded-lg px-3 py-2 disabled:opacity-50";
  return (
    <section className="space-y-3 border-t pt-4 text-xs">
      <h3 className="font-semibold text-sm">完整备份与迁移</h3>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || !desktop}
          onClick={() =>
            void run(async () => {
              const bytes = await exportPortableBackup();
              downloadPlannerFile(
                bytes,
                `tongyun-complete-${new Date().toISOString().slice(0, 10)}.zip`,
                "application/zip",
              );
              setMessage("完整备份已生成");
            })
          }
        >
          导出完整备份（含附件）
        </button>
        <label className={button}>
          选择备份 ZIP
          <input
            type="file"
            accept=".zip"
            className="block max-w-56"
            disabled={busy || !desktop}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setPreview(undefined);
              void run(async () => {
                if (file.size > MAX_BACKUP_BYTES + 1024 * 1024) throw new Error("备份文件过大");
                const value = previewPortableBackup(new Uint8Array(await file.arrayBuffer()));
                setPreview({ kind: "backup", value, summary: summarizePortableRestore(value) });
              });
            }}
          />
        </label>
        <label className={button}>
          选择待办 CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="block max-w-56"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setPreview(undefined);
              void run(async () => {
                if (file.size > 5 * 1024 * 1024) throw new Error("CSV 文件最大 5 MB");
                setPreview({ kind: "csv", value: await previewTaskCsv(await file.text()) });
              });
            }}
          />
        </label>
      </div>
      {preview && (
        <div className="rounded-lg border p-3 space-y-2">
          <p>
            {preview.kind === "backup"
              ? `预计新增 ${summary?.tasks ?? 0} 项任务、${summary?.journal ?? 0} 篇日记、${summary?.attachments ?? 0} 个附件。合并时保留现有同 ID 记录和同日日记。`
              : `识别到 ${preview.value.items.length} 项任务，跳过 ${preview.value.skipped} 行非任务记录。重复导入同一份文件不会重复创建。`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => void run(restore)}
            >
              确认合并到本机
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {busy && <p role="status">处理中…</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
