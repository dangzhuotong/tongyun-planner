import type { JournalEntry } from "../../types";
import { equivalentJournalPayloads } from "./conflict";
import type { SyncCategory } from "./types";

/**
 * 指纹（ETag / Last-Modified）变了之后怎么处理。
 * 坚果云经常不给稳定 ETag，Last-Modified 会在正文没变时自己变。
 * 正文相同就只认新指纹，不重新上传。
 * 日记只是某一边多了一篇、相同 id 的整篇字段一致时，合并后继续上传。
 * 同一篇有字段不同，才是真冲突。
 */
export type DriftDecision =
  | { action: "conflict" }
  | { action: "align" }
  | { action: "upload"; payload: unknown; changed: true };

function canonical(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = normalize(source[key]);
    }
    return out;
  }
  return value;
}

function withoutClock(entry: JournalEntry): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...entry };
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest;
}

function sameJournalEntry(left: JournalEntry, right: JournalEntry): boolean {
  return equivalentJournalPayloads([withoutClock(left)], [withoutClock(right)]);
}

function asEntries(payload: unknown): JournalEntry[] | null {
  if (!Array.isArray(payload)) return null;
  const entries = payload as JournalEntry[];
  if (
    entries.some(
      (item) => !item || typeof item !== "object" || typeof item.id !== "string" || !item.id,
    )
  ) {
    return null;
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) return null;
  return entries;
}

/** 同一篇字段不同才算冲突。某一边多出来的日记留在合并结果里。 */
export function reconcileFingerprintDrift(
  cat: SyncCategory,
  localPayload: unknown,
  remotePayload: unknown,
): DriftDecision {
  if (cat === "journal" && equivalentJournalPayloads(localPayload, remotePayload)) {
    return { action: "align" };
  }
  if (canonical(localPayload) === canonical(remotePayload)) {
    return { action: "align" };
  }
  if (cat !== "journal") return { action: "conflict" };

  const local = asEntries(localPayload);
  const remote = asEntries(remotePayload);
  if (!local || !remote) return { action: "conflict" };

  const remoteById = new Map(remote.map((entry) => [entry.id, entry]));
  for (const entry of local) {
    const other = remoteById.get(entry.id);
    if (other && !sameJournalEntry(entry, other)) return { action: "conflict" };
  }

  const merged = new Map<string, JournalEntry>();
  for (const entry of remote) merged.set(entry.id, entry);
  for (const entry of local) {
    const other = merged.get(entry.id);
    if (!other || (entry.updatedAt || 0) > (other.updatedAt || 0)) merged.set(entry.id, entry);
  }
  return { action: "upload", payload: Array.from(merged.values()), changed: true };
}
