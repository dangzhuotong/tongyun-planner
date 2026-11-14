import { invoke } from "@tauri-apps/api/core";
import { strFromU8, strToU8, unzipSync, zip } from "fflate";
import type { Attachment, HabitItem, LedgerEntry, TimeBlock } from "../../types";
import { createId } from "../id";
import { safeJsonParse } from "../json";
import { saveJournalAttachment, deleteJournalAttachment } from "../journalAttachmentStorage";
import { loadLedgerEntries, saveLedgerEntries } from "../ledger/ledgerStorage";
import { normalizeLedgerEntries } from "../ledger/ledgerCore";
import { storageManager } from "../storage";
import { buildSnapshotPayload } from "./localSnapshots";
import { flushPendingStorage } from "../deferredStorage";
import { storage } from "../unifiedStorage";
import { applySyncData, getLocalSyncData, normalizeSyncData, type SyncData } from "./types";
import { SAVED_VIEWS_KEY, type TaskView } from "../taskOrganization";

const FORMAT = "tongyun-planner-portable-v1";
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MANIFEST = "planner.json";
export const PORTABLE_RESTORED = "tongyun-portable-restored";
const member = /^media\/[0-9]+$/;
const taskPath = /^attachments\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[^/\\\x00-\x1f]+$/;

interface BackupData {
  format: string;
  data: SyncData;
  habits: HabitItem[];
  timeBlocks: TimeBlock[];
  ledger: LedgerEntry[];
  savedViews: TaskView[];
}

interface BackupPreview {
  backup: BackupData;
  files: Record<string, Uint8Array>;
  count: number;
}

function list<T>(key: string): T[] {
  const raw = safeJsonParse<T[]>(localStorage.getItem(key), []);
  return Array.isArray(raw) ? raw : [];
}

export function downloadPlannerFile(bytes: BlobPart, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bytesFromBase64(base64: string) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function attachmentBytes(attachment: Attachment, journal: boolean) {
  if (attachment.path.startsWith("data:")) {
    const match = /^data:[^,]*;base64,([A-Za-z0-9+/=]+)$/.exec(attachment.path);
    return match ? bytesFromBase64(match[1]) : null;
  }
  if (!journal) {
    if (
      !taskPath.test(attachment.path) ||
      attachment.path.split("/").some((part) => part === "." || part === "..")
    )
      return null;
    return storageManager.downloadFile(attachment.path);
  }
  const base64 = await invoke<string>("read_planner_attachment", { path: attachment.path });
  return bytesFromBase64(base64);
}

async function mapAttachments<T extends { attachments?: Attachment[] }>(
  entries: T[],
  transform: (attachment: Attachment) => Promise<Attachment>,
): Promise<T[]> {
  const result: T[] = [];
  for (const entry of entries) {
    if (!entry.attachments?.length) {
      result.push(entry);
      continue;
    }
    const attachments = [];
    for (const attachment of entry.attachments) attachments.push(await transform(attachment));
    result.push({ ...entry, attachments });
  }
  return result;
}

export async function exportPortableBackup(): Promise<Uint8Array<ArrayBuffer>> {
  const snapshot = buildSnapshotPayload();
  const data = normalizeSyncData(snapshot);
  if (!data) throw new Error("手帐数据无法读取");
  const files: Record<string, Uint8Array> = {};
  let index = 0;
  let total = 0;
  const collect = (journal: boolean) => async (attachment: Attachment) => {
    let bytes: Uint8Array | null;
    try {
      bytes = await attachmentBytes(attachment, journal);
    } catch {
      throw new Error(`无法读取附件：${attachment.name}`);
    }
    if (!bytes) throw new Error(`找不到附件：${attachment.name}`);
    total += bytes.length;
    if (bytes.length > MAX_ATTACHMENT_BYTES || total > MAX_BACKUP_BYTES)
      throw new Error("备份附件超出大小限制");
    const path = `media/${++index}`;
    files[path] = bytes;
    return { ...attachment, path };
  };
  data.tasks = await mapAttachments(data.tasks, collect(false));
  data.completedTasks = await mapAttachments(data.completedTasks, collect(false));
  data.journal = await mapAttachments(data.journal, collect(true));
  const backup: BackupData = {
    format: FORMAT,
    data,
    habits: list("tongyun_habits"),
    timeBlocks: list("tongyun_timeblocks"),
    ledger: loadLedgerEntries(),
    savedViews: list(SAVED_VIEWS_KEY),
  };
  files[MANIFEST] = strToU8(JSON.stringify(backup));
  if (total + files[MANIFEST].length > MAX_BACKUP_BYTES) throw new Error("备份超出大小限制");
  return new Promise((resolve, reject) =>
    zip(files, { level: 0 }, (error, bytes) => {
      if (error) reject(error);
      else resolve(new Uint8Array(bytes));
    }),
  );
}

const syncLists = [
  "tasks",
  "completedTasks",
  "journal",
  "stickyNotes",
  "pomodoroLogs",
  "countdowns",
] as const;
const extraLists = ["habits", "timeBlocks", "ledger", "savedViews"] as const;
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validEntries(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && typeof entry.id === "string" && !!entry.id)
  );
}

export function previewPortableBackup(input: Uint8Array): BackupPreview {
  if (input.length > MAX_BACKUP_BYTES + 1024 * 1024) throw new Error("备份文件过大");
  let total = 0;
  let count = 0;
  const names = new Set<string>();
  const files = unzipSync(input, {
    filter: (entry) => {
      if (entry.name !== MANIFEST && !member.test(entry.name)) return false;
      total += entry.originalSize;
      if (
        total > MAX_BACKUP_BYTES ||
        ++count > 10_000 ||
        names.has(entry.name) ||
        (entry.name !== MANIFEST && entry.originalSize > MAX_ATTACHMENT_BYTES)
      ) {
        throw new Error("备份超过限制或包含重复文件");
      }
      names.add(entry.name);
      return true;
    },
  });
  if (!files[MANIFEST]) throw new Error("不是橦云手帐完整备份");
  const raw: unknown = JSON.parse(strFromU8(files[MANIFEST]));
  if (!isRecord(raw) || raw.format !== FORMAT || !isRecord(raw.data))
    throw new Error("备份格式无效");
  const data = raw.data;
  for (const key of syncLists)
    if (!validEntries(data[key])) throw new Error(`备份字段无效：${key}`);
  for (const key of extraLists)
    if (!validEntries(raw[key])) throw new Error(`备份字段无效：${key}`);
  for (const key of ["tasks", "completedTasks", "journal"] as const) {
    for (const entry of data[key] as Record<string, unknown>[]) {
      if (
        typeof entry.title !== "string" ||
        (key === "journal"
          ? typeof entry.content !== "string" || typeof entry.date !== "string"
          : typeof entry.category !== "string")
      )
        throw new Error("备份记录格式无效");
      if (entry.attachments === undefined) continue;
      if (
        !validEntries(entry.attachments) ||
        entry.attachments.some(
          (attachment) =>
            typeof attachment.path !== "string" ||
            !member.test(attachment.path) ||
            !files[attachment.path] ||
            typeof attachment.name !== "string" ||
            typeof attachment.type !== "string",
        )
      ) {
        throw new Error("备份附件缺失或格式无效");
      }
    }
  }
  return { backup: raw as unknown as BackupData, files, count: count - 1 };
}

export function keepExisting<T extends { id: string }>(current: T[], imported: T[]): T[] {
  const seen = new Set(current.map((entry) => entry.id));
  const merged = [...current];
  for (const entry of imported) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged;
}

function newRecords(backup: BackupData, current: SyncData) {
  const ids = new Set([...current.tasks, ...current.completedTasks].map((task) => task.id));
  const journalIds = new Set(current.journal.map((entry) => entry.id));
  const journalDates = new Set(
    current.journal.filter((entry) => entry.isDaily).map((entry) => entry.date),
  );
  const taskIsNew = (task: { id: string }) => {
    if (ids.has(task.id)) return false;
    ids.add(task.id);
    return true;
  };
  const tasks = backup.data.tasks.filter(taskIsNew);
  const completed = backup.data.completedTasks.filter(taskIsNew);
  const journal = backup.data.journal.filter((entry) => {
    if (journalIds.has(entry.id) || (entry.isDaily && journalDates.has(entry.date))) return false;
    journalIds.add(entry.id);
    if (entry.isDaily) journalDates.add(entry.date);
    return true;
  });
  return { tasks, completed, journal };
}

export function summarizePortableRestore(preview: BackupPreview) {
  flushPendingStorage();
  const records = newRecords(preview.backup, getLocalSyncData());
  const attachments = [...records.tasks, ...records.completed, ...records.journal].reduce(
    (total, entry) => total + (entry.attachments?.length ?? 0),
    0,
  );
  return {
    tasks: records.tasks.length + records.completed.length,
    journal: records.journal.length,
    attachments,
  };
}

export async function restorePortableBackup({ backup, files }: BackupPreview) {
  flushPendingStorage();
  const current = getLocalSyncData();
  const records = newRecords(backup, current);
  const staged: Array<() => Promise<void>> = [];
  const materialize = (journal: boolean) => async (attachment: Attachment) => {
    const bytes = files[attachment.path];
    const suffix = attachment.name.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? ".bin";
    const file = new File([new Uint8Array(bytes)], `attachment${suffix}`, {
      type: attachment.type,
    });
    const id = createId("restore");
    if (journal) {
      const path = await saveJournalAttachment(file, id);
      staged.push(() => deleteJournalAttachment(path));
      return { ...attachment, path };
    }
    const path = `attachments/portable-local/${id}/attachment${suffix}`;
    await storageManager.local.uploadFile(path, bytes, attachment.type);
    staged.push(() => storageManager.local.deleteFile(path));
    return { ...attachment, path };
  };
  let importedTasks, importedCompleted, importedJournal;
  try {
    importedTasks = await mapAttachments(records.tasks, materialize(false));
    importedCompleted = await mapAttachments(records.completed, materialize(false));
    importedJournal = await mapAttachments(records.journal, materialize(true));
  } catch (error) {
    await Promise.allSettled(staged.map((rollback) => rollback()));
    throw error;
  }
  // Re-read after file writes so an edit made during staging is retained.
  flushPendingStorage();
  const fresh = getLocalSyncData();
  const freshIds = new Set([...fresh.tasks, ...fresh.completedTasks].map((task) => task.id));
  const freshDays = new Set(
    fresh.journal.filter((entry) => entry.isDaily).map((entry) => entry.date),
  );
  applySyncData({
    ...fresh,
    tasks: keepExisting(
      fresh.tasks,
      importedTasks.filter((task) => !freshIds.has(task.id)),
    ),
    completedTasks: keepExisting(
      fresh.completedTasks,
      importedCompleted.filter((task) => !freshIds.has(task.id)),
    ),
    journal: keepExisting(
      fresh.journal,
      importedJournal.filter((entry) => !entry.isDaily || !freshDays.has(entry.date)),
    ),
    stickyNotes: keepExisting(fresh.stickyNotes, backup.data.stickyNotes),
    pomodoroLogs: keepExisting(fresh.pomodoroLogs, backup.data.pomodoroLogs),
    countdowns: keepExisting(fresh.countdowns, backup.data.countdowns),
  });
  localStorage.setItem(
    "tongyun_habits",
    JSON.stringify(keepExisting(list<HabitItem>("tongyun_habits"), backup.habits)),
  );
  localStorage.setItem(
    "tongyun_timeblocks",
    JSON.stringify(keepExisting(list<TimeBlock>("tongyun_timeblocks"), backup.timeBlocks)),
  );
  localStorage.setItem(
    SAVED_VIEWS_KEY,
    JSON.stringify(keepExisting(list<TaskView>(SAVED_VIEWS_KEY), backup.savedViews)),
  );
  saveLedgerEntries(keepExisting(loadLedgerEntries(), normalizeLedgerEntries(backup.ledger)));
  window.dispatchEvent(new Event(PORTABLE_RESTORED));
  await storage.flushNow();
}
