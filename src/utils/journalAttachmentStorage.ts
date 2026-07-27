import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { JournalEntry } from "../types";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function extensionFor(file: File): string {
  const fromName = file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  return file.type.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
}

async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function saveJournalAttachment(file: File, attachmentId: string): Promise<string> {
  if (!isTauri()) return fileToDataUrl(file);
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  return invoke<string>("save_local_attachment", {
    fileName: `${attachmentId}.${extensionFor(file)}`,
    bytes,
  });
}

export function journalAttachmentSrc(path: string): string {
  if (!path || /^(data:|blob:|https?:)/i.test(path) || !isTauri()) return path;
  return convertFileSrc(path);
}

export async function deleteJournalAttachment(path: string): Promise<void> {
  if (!isTauri() || /^(data:|blob:|https?:)/i.test(path)) return;
  const fileName = path.split(/[\\/]/).pop();
  if (fileName) await invoke("delete_local_attachment", { fileName }).catch(() => undefined);
}

function dataUrlToFile(dataUrl: string, name: string, type: string): File | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  try {
    const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new File([bytes], name, { type: match[1] || type || "application/octet-stream" });
  } catch {
    return null;
  }
}

export async function migrateLegacyJournalAttachments(entries: JournalEntry[]): Promise<JournalEntry[]> {
  if (!isTauri()) return entries;
  let changed = false;
  const migrated: JournalEntry[] = [];
  for (const entry of entries) {
    if (!entry.attachments?.some((attachment) => attachment.path.startsWith("data:"))) {
      migrated.push(entry);
      continue;
    }
    let entryChanged = false;
    const attachments = [];
    for (const attachment of entry.attachments) {
      if (!attachment.path.startsWith("data:")) {
        attachments.push(attachment);
        continue;
      }
      const file = dataUrlToFile(attachment.path, attachment.name, attachment.type);
      if (!file) {
        attachments.push(attachment);
        continue;
      }
      try {
        attachments.push({ ...attachment, path: await saveJournalAttachment(file, attachment.id) });
        changed = true;
        entryChanged = true;
      } catch {
        attachments.push(attachment);
      }
    }
    migrated.push(entryChanged ? { ...entry, attachments, updatedAt: Date.now() } : entry);
  }
  return changed ? migrated : entries;
}
