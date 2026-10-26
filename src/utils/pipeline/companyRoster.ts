import type { AgentKind, DomainAgent } from "../../types";

/**
 * 公司名册的唯一真相是 tongyun_pipeline.agents（active）+ workers（enabled）。
 * 本机 domain_agents 只在「没配 DSN 且没有公司库缓存」时作离线兜底。
 * 配了 DSN 时，读库失败不得用本机静态登记顶上。
 * 见 docs/planner-db-ssot-not-local-roster.md。
 */

export const PIPELINE_DATABASE = "tongyun_pipeline";
export const COMPANY_ROSTER_CACHE_KEY = "tongyun_company_roster_cache";
export const REQUIREMENT_SOURCE = "planner";
export const REQUIREMENT_STATUS = "open";
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export const AGENTS_SQL =
  "SELECT id, slug, display_name, short_title, scope, status, sort_order, aliases_json FROM agents";
export const WORKERS_SQL =
  "SELECT assignee, machine, status, enabled, last_seen_at, current_task_id FROM workers";

const ASSIGNEE_LABELS: Record<string, string> = {
  "cursor-cloud": "Cursor",
};

const OFFLINE_STATUSES = new Set(["offline", "dead", "stopped", "down", "disabled", "paused"]);
const ONLINE_STATUSES = new Set(["online", "idle", "busy", "running", "active", "ready", "alive"]);
const PRIORITIES = new Set(["p0", "p1", "p2", "p3"]);

export type HeartbeatTone = "online" | "offline" | "none";
export type RosterVia = "pipeline" | "fixture" | "cache" | "local" | "unavailable";
export type PipelineDsnVia = "home" | "remote" | "remote-sibling" | "none";

export interface Heartbeat {
  online: boolean;
  tone: HeartbeatTone;
  ageMs: number | null;
}

export interface PipelineAgentRow {
  id?: string | number | null;
  slug?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  short_title?: string | null;
  shortTitle?: string | null;
  scope?: string | null;
  status?: string | null;
  sort_order?: number | string | null;
  sortOrder?: number | string | null;
  aliases_json?: unknown;
  aliasesJson?: unknown;
}

export interface PipelineWorkerRow {
  assignee?: string | null;
  machine?: string | null;
  status?: string | null;
  enabled?: unknown;
  last_seen_at?: unknown;
  lastSeenAt?: unknown;
  current_task_id?: unknown;
}

export interface CompanyRosterEntry {
  id: string;
  handle: string;
  slug: string;
  kind: AgentKind;
  enabled: boolean;
  source: "company" | "local";
  scope?: string;
  online: boolean;
  tone: HeartbeatTone;
  ageMs: number | null;
  lastSeenAt: number | null;
  machine?: string;
  workerStatus?: string;
  sortOrder: number;
  updatedAt: number;
}

export interface RosterCacheFile {
  fetchedAt: number;
  entries: CompanyRosterEntry[];
}

export interface PipelineGateway {
  select(sql: string, params?: unknown[]): Promise<unknown>;
  execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ lastInsertId?: number | string; rowsAffected?: number }>;
}

export interface RequirementDraft {
  title: string;
  detail?: string;
  productId?: string | null;
  priority?: string;
}

export interface HomePipelineFiles {
  "pipeline.dsn"?: string;
  "pipeline.json"?: string;
  "config.json"?: string;
  ".env"?: string;
}

interface NormalizedAgent {
  slug: string;
  handle: string;
  scope?: string;
  sortOrder: number;
  aliases: string[];
  numericId: string;
}

export function sanitizeMysqlDsn(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^mysql:\/\//i.test(trimmed)) return null;
  if (trimmed.length > 2000 || /\s/.test(trimmed)) return null;
  return trimmed;
}

export function databaseNameOf(dsn: string): string | null {
  const match = dsn.match(/^mysql:\/\/([\s\S]+)$/i);
  if (!match) return null;
  const body = stripSuffix(match[1]);
  const at = body.lastIndexOf("@");
  const afterAt = at >= 0 ? body.slice(at + 1) : body;
  const slash = afterAt.indexOf("/");
  if (slash < 0) return null;
  const name = afterAt.slice(slash + 1);
  return name || null;
}

export function rewriteDatabaseName(dsn: string, database: string): string | null {
  const match = dsn.match(/^(mysql:\/\/)([\s\S]+)$/i);
  if (!match || !database) return null;
  const body = match[2];
  const suffixAt = suffixIndex(body);
  const main = body.slice(0, suffixAt);
  const suffix = body.slice(suffixAt);
  const at = main.lastIndexOf("@");
  const afterAt = at >= 0 ? main.slice(at + 1) : main;
  const slash = afterAt.indexOf("/");
  const authority = slash >= 0 ? afterAt.slice(0, slash) : afterAt;
  if (!authority) return null;
  const userinfo = at >= 0 ? main.slice(0, at + 1) : "";
  return `mysql://${userinfo}${authority}/${database}${suffix}`;
}

export function resolvePipelineDsn(input: { homeDsn?: string | null; remoteDsn?: string | null }): {
  dsn: string | null;
  via: PipelineDsnVia;
} {
  const home = sanitizeMysqlDsn(input.homeDsn);
  if (home) return { dsn: home, via: "home" };
  const remote = sanitizeMysqlDsn(input.remoteDsn);
  if (!remote) return { dsn: null, via: "none" };
  if (databaseNameOf(remote) === PIPELINE_DATABASE) return { dsn: remote, via: "remote" };
  const sibling = rewriteDatabaseName(remote, PIPELINE_DATABASE);
  if (!sibling) return { dsn: null, via: "none" };
  return { dsn: sibling, via: "remote-sibling" };
}

export function parsePipelineDsnFromHomeFiles(files: HomePipelineFiles): {
  pipelineDsn: string | null;
  remoteDsn: string | null;
} {
  const env = envAssignments(files[".env"]);
  const remoteDsn = sanitizeMysqlDsn(envGet(env, ["TONGYUN_REMOTE_DSN"]));
  const plain = firstDsnLine(files["pipeline.dsn"]);
  if (plain) return { pipelineDsn: plain, remoteDsn };
  const fromPipelineJson = dsnFromJson(files["pipeline.json"], true);
  if (fromPipelineJson) return { pipelineDsn: fromPipelineJson, remoteDsn };
  const fromConfig = dsnFromJson(files["config.json"], false);
  if (fromConfig) return { pipelineDsn: fromConfig, remoteDsn };
  return { pipelineDsn: envGet(env, ["PIPELINE_DSN", "TONGYUN_PIPELINE_DSN"]), remoteDsn };
}

export function parseSeenAt(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return epochToMs(value);
  if (typeof value === "bigint") return epochToMs(Number(value));
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return epochToMs(Number(trimmed));
    const parsed = Date.parse(trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T"));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function isWorkerEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const norm = value.trim().toLowerCase();
    return norm === "1" || norm === "true" || norm === "yes" || norm === "enabled";
  }
  return false;
}

export function describeHeartbeat(
  lastSeenAt: number | null,
  status: string | null | undefined,
  now: number,
  onlineWindowMs = ONLINE_WINDOW_MS,
): Heartbeat {
  const ageMs = lastSeenAt == null ? null : Math.max(0, now - lastSeenAt);
  const statusNorm = (status || "").trim().toLowerCase();
  const forcedOffline = OFFLINE_STATUSES.has(statusNorm);
  const statusOnline = ONLINE_STATUSES.has(statusNorm);
  const fresh = ageMs != null && ageMs <= onlineWindowMs;
  if (!statusNorm && lastSeenAt == null) {
    return { online: false, tone: "none", ageMs: null };
  }
  const online = !forcedOffline && (fresh || (statusOnline && ageMs == null));
  return { online, tone: online ? "online" : "offline", ageMs };
}

export function formatHeartbeat(heartbeat: Heartbeat, locale = "zh-CN"): string {
  const en = locale.toLowerCase().startsWith("en");
  if (heartbeat.tone === "none") return en ? "no heartbeat" : "无心跳";
  const state = heartbeat.tone === "online" ? (en ? "online" : "在线") : en ? "offline" : "离线";
  if (heartbeat.ageMs == null) return state;
  return `${state} · ${formatAge(heartbeat.ageMs, en)}`;
}

export function mergeCompanyRoster(
  agents: PipelineAgentRow[] | null | undefined,
  workers: PipelineWorkerRow[] | null | undefined,
  now: number,
): CompanyRosterEntry[] {
  const active = (agents || [])
    .map(normalizeAgent)
    .filter((agent): agent is NormalizedAgent => Boolean(agent));
  const groups = new Map<string, PipelineWorkerRow[]>();
  for (const worker of workers || []) {
    if (!isWorkerEnabled(worker.enabled)) continue;
    const assignee = String(worker.assignee || "").trim();
    if (!assignee) continue;
    const key = assignee.toLowerCase();
    const list = groups.get(key) || [];
    list.push(worker);
    groups.set(key, list);
  }

  const consumed = new Set<string>();
  const entries: CompanyRosterEntry[] = [];

  for (const agent of active) {
    const keys = matchKeys(agent);
    const matched: PipelineWorkerRow[] = [];
    for (const [key, rows] of groups) {
      if (!keys.has(key)) continue;
      matched.push(...rows);
      consumed.add(key);
    }
    const best = pickFreshest(matched);
    entries.push(entryFromAgent(agent, best, now));
  }

  for (const [key, rows] of groups) {
    if (consumed.has(key)) continue;
    const best = pickFreshest(rows);
    if (!best) continue;
    entries.push(entryFromWorker(best, now));
  }

  entries.sort(compareRosterEntries);
  return entries;
}

export function compareRosterEntries(
  a: Pick<CompanyRosterEntry, "id" | "slug" | "sortOrder" | "handle">,
  b: Pick<CompanyRosterEntry, "id" | "slug" | "sortOrder" | "handle">,
): number {
  const pin = (entry: { id: string; slug: string }) =>
    entry.id === "cursor-cloud" || entry.slug === "cursor-cloud" ? 0 : 1;
  const pinned = pin(a) - pin(b);
  if (pinned !== 0) return pinned;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.handle.localeCompare(b.handle, "zh");
}

export function localAgentsToRoster(agents: DomainAgent[], now = Date.now()): CompanyRosterEntry[] {
  return agents.map((agent) => ({
    id: agent.id,
    handle: agent.handle,
    slug: agent.id,
    kind: agent.kind,
    enabled: agent.enabled,
    source: "local",
    online: false,
    tone: "none",
    ageMs: null,
    lastSeenAt: null,
    sortOrder: 1000,
    updatedAt: agent.updatedAt || now,
  }));
}

/** 配了 DSN 时只承认公司库或它的离线缓存。没配 DSN 才允许本机兜底。 */
export function selectVisibleRoster(input: {
  dsnConfigured: boolean;
  company: CompanyRosterEntry[] | null;
  companyCache: CompanyRosterEntry[];
  localFallback: CompanyRosterEntry[];
}): { entries: CompanyRosterEntry[]; via: Exclude<RosterVia, "fixture"> } {
  if (input.company) {
    return { entries: input.company, via: "pipeline" };
  }
  const cache = input.companyCache.filter((entry) => entry.source === "company" && entry.id);
  if (input.dsnConfigured) {
    return cache.length > 0
      ? { entries: cache, via: "cache" }
      : { entries: [], via: "unavailable" };
  }
  if (cache.length > 0) return { entries: cache, via: "cache" };
  return { entries: input.localFallback, via: "local" };
}

export function rosterEntryToDomainAgent(entry: CompanyRosterEntry): DomainAgent {
  const meta: Record<string, unknown> = {
    source: entry.source,
    slug: entry.slug,
    online: entry.online,
    tone: entry.tone,
    ageMs: entry.ageMs,
    lastSeenAt: entry.lastSeenAt,
    machine: entry.machine ?? "",
    workerStatus: entry.workerStatus ?? "",
    scope: entry.scope ?? "",
  };
  return {
    id: entry.id,
    handle: entry.handle,
    kind: entry.kind,
    enabled: entry.enabled,
    updatedAt: entry.updatedAt,
    meta,
  };
}

export function formatRosterOption(
  agent: {
    id: string;
    handle: string;
    kind?: AgentKind;
    slug?: string;
    source?: "company" | "local";
    tone?: HeartbeatTone;
    ageMs?: number | null;
    online?: boolean;
    meta?: DomainAgent["meta"];
  },
  opts: { locale?: string; withHeartbeat?: boolean; style?: "filter" | "assignee" } = {},
): string {
  const meta = readMeta(agent.meta);
  const source = agent.source || metaString(meta, "source") || "local";
  const slug = agent.slug || metaString(meta, "slug") || agent.id;
  if (source !== "company") {
    if (opts.style === "filter") return agent.handle;
    const kind = agent.kind || "manual";
    const kindLabel = kind === "manual" ? "手动" : kind === "local_runner" ? "Runner" : "网关";
    return `${agent.handle} (${kindLabel})`;
  }
  const name = slug && slug !== agent.handle ? `${agent.handle}（${slug}）` : agent.handle;
  if (!opts.withHeartbeat) return name;
  const tone = agent.tone || (metaString(meta, "tone") as HeartbeatTone | undefined) || "none";
  const ageRaw = agent.ageMs ?? meta.ageMs;
  const ageMs = typeof ageRaw === "number" ? ageRaw : null;
  const online = agent.online ?? meta.online === true;
  const safeTone: HeartbeatTone =
    tone === "online" || tone === "offline" || tone === "none" ? tone : "none";
  return `${name} · ${formatHeartbeat({ online, tone: safeTone, ageMs }, opts.locale || "zh-CN")}`;
}

export async function queryCompanyRoster(
  gateway: PipelineGateway,
  now = Date.now(),
): Promise<CompanyRosterEntry[] | null> {
  const agents = await safeSelect<PipelineAgentRow>(gateway, AGENTS_SQL);
  const workers = await safeSelect<PipelineWorkerRow>(gateway, WORKERS_SQL);
  if (agents == null && workers == null) return null;
  return mergeCompanyRoster(agents || [], workers || [], now);
}

export function createRequirementId(
  now = Date.now(),
  rand = Math.floor(Math.random() * 1_000_000),
): string {
  return `${now}${String(rand).padStart(6, "0")}`;
}

export async function submitRequirement(
  gateway: PipelineGateway,
  draft: RequirementDraft,
  now = Date.now(),
): Promise<{ id: string }> {
  const title = draft.title.trim();
  if (!title) throw new Error("标题不能为空");
  const priority = PRIORITIES.has(draft.priority || "") ? draft.priority! : "p2";
  const id = createRequirementId(now);
  const detail = draft.detail?.trim() || "";
  const productId = draft.productId?.trim() ? draft.productId.trim() : null;
  try {
    await gateway.execute(
      `INSERT INTO requirements (id, title, detail, product_id, source, status, priority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(3), NOW(3))`,
      [id, title, detail, productId, REQUIREMENT_SOURCE, REQUIREMENT_STATUS, priority],
    );
  } catch (error) {
    throw publicDbError(error, "需求没有写入公司库");
  }
  try {
    const rows = (await gateway.select(
      "SELECT CAST(id AS CHAR) AS id FROM requirements WHERE id = $1 LIMIT 1",
      [id],
    )) as Array<{ id?: unknown }>;
    const confirmed = Array.isArray(rows) ? rows[0]?.id : undefined;
    return { id: confirmedId(confirmed, id) };
  } catch {
    return { id };
  }
}

export function readRosterCache(
  storage: Pick<Storage, "getItem"> | null | undefined,
): RosterCacheFile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(COMPANY_ROSTER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RosterCacheFile;
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return {
      fetchedAt: Number(parsed.fetchedAt) || 0,
      entries: parsed.entries.filter((entry) => entry && entry.source === "company" && entry.id),
    };
  } catch {
    return null;
  }
}

export function writeRosterCache(
  storage: Pick<Storage, "setItem"> | null | undefined,
  file: RosterCacheFile,
): void {
  if (!storage) return;
  const entries = file.entries.filter((entry) => entry.source === "company");
  try {
    storage.setItem(
      COMPANY_ROSTER_CACHE_KEY,
      JSON.stringify({ fetchedAt: file.fetchedAt, entries }),
    );
  } catch {
    /* 配额满时只留在这次会话 */
  }
}

function entryFromAgent(
  agent: NormalizedAgent,
  worker: PipelineWorkerRow | null,
  now: number,
): CompanyRosterEntry {
  const seen = worker ? workerSeen(worker) : null;
  const heartbeat = worker
    ? describeHeartbeat(seen, worker.status, now)
    : { online: false, tone: "none" as const, ageMs: null };
  return {
    id: agent.slug,
    handle: agent.handle,
    slug: agent.slug,
    kind: "pipeline_bridge",
    enabled: true,
    source: "company",
    scope: agent.scope,
    online: heartbeat.online,
    tone: heartbeat.tone,
    ageMs: heartbeat.ageMs,
    lastSeenAt: seen,
    machine: worker?.machine || undefined,
    workerStatus: worker?.status || undefined,
    sortOrder: agent.sortOrder,
    updatedAt: now,
  };
}

function entryFromWorker(worker: PipelineWorkerRow, now: number): CompanyRosterEntry {
  const assignee = String(worker.assignee || "").trim();
  const seen = workerSeen(worker);
  const heartbeat = describeHeartbeat(seen, worker.status, now);
  return {
    id: assignee,
    handle: ASSIGNEE_LABELS[assignee] || assignee,
    slug: assignee,
    kind: "pipeline_bridge",
    enabled: true,
    source: "company",
    online: heartbeat.online,
    tone: heartbeat.tone,
    ageMs: heartbeat.ageMs,
    lastSeenAt: seen,
    machine: worker.machine || undefined,
    workerStatus: worker.status || undefined,
    sortOrder: assignee === "cursor-cloud" ? 0 : 500,
    updatedAt: now,
  };
}

function normalizeAgent(row: PipelineAgentRow): NormalizedAgent | null {
  if (
    String(row.status || "")
      .trim()
      .toLowerCase() !== "active"
  )
    return null;
  const slug = String(row.slug || "").trim();
  if (!slug) return null;
  const handle = String(
    row.display_name || row.displayName || row.short_title || row.shortTitle || slug,
  ).trim();
  const sortRaw = Number(row.sort_order ?? row.sortOrder ?? 100);
  return {
    slug,
    handle: handle || slug,
    scope: row.scope || undefined,
    sortOrder: Number.isFinite(sortRaw) ? sortRaw : 100,
    aliases: parseAliases(row.aliases_json ?? row.aliasesJson),
    numericId: row.id == null ? "" : String(row.id),
  };
}

function matchKeys(agent: NormalizedAgent): Set<string> {
  const keys = new Set<string>([agent.slug.toLowerCase()]);
  if (agent.numericId) keys.add(agent.numericId.toLowerCase());
  for (const alias of agent.aliases) {
    const trimmed = alias.trim().toLowerCase();
    if (trimmed) keys.add(trimmed);
  }
  return keys;
}

function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item));
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function workerSeen(worker: PipelineWorkerRow): number | null {
  return parseSeenAt(worker.last_seen_at ?? worker.lastSeenAt);
}

function pickFreshest(rows: PipelineWorkerRow[]): PipelineWorkerRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) =>
    (workerSeen(row) ?? -1) >= (workerSeen(best) ?? -1) ? row : best,
  );
}

function epochToMs(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
}

function formatAge(ageMs: number, en: boolean): string {
  if (ageMs < 1000) return en ? "just now" : "刚刚";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return en ? `${seconds}s ago` : `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return en ? `${minutes}m ago` : `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return en ? `${hours}h ago` : `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return en ? `${days}d ago` : `${days}天前`;
}

function suffixIndex(body: string): number {
  const query = body.indexOf("?");
  const hash = body.indexOf("#");
  if (query < 0) return hash < 0 ? body.length : hash;
  if (hash < 0) return query;
  return Math.min(query, hash);
}

function stripSuffix(body: string): string {
  return body.slice(0, suffixIndex(body));
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function envAssignments(text: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!text) return map;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    map.set(body.slice(0, eq).trim(), unquote(body.slice(eq + 1)));
  }
  return map;
}

function envGet(map: Map<string, string>, keys: string[]): string | null {
  for (const [key, value] of map) {
    if (keys.some((want) => want.toLowerCase() === key.toLowerCase())) {
      const dsn = sanitizeMysqlDsn(value);
      if (dsn) return dsn;
    }
  }
  return null;
}

function firstDsnLine(text: string | undefined): string | null {
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return sanitizeMysqlDsn(unquote(trimmed));
  }
  return null;
}

function dsnFromJson(text: string | undefined, allowGenericDsn: boolean): string | null {
  if (!text || !text.trim()) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  for (const key of ["pipeline_dsn", "pipelineDsn"]) {
    const dsn = sanitizeMysqlDsn(typeof parsed[key] === "string" ? (parsed[key] as string) : null);
    if (dsn) return dsn;
  }
  const nested = parsed.pipeline;
  if (nested && typeof nested === "object") {
    const dsn = sanitizeMysqlDsn(
      typeof (nested as { dsn?: unknown }).dsn === "string"
        ? ((nested as { dsn?: string }).dsn ?? null)
        : null,
    );
    if (dsn) return dsn;
  }
  if (!allowGenericDsn) return null;
  return sanitizeMysqlDsn(typeof parsed.dsn === "string" ? parsed.dsn : null);
}

async function safeSelect<T>(gateway: PipelineGateway, sql: string): Promise<T[] | null> {
  try {
    const rows = (await gateway.select(sql)) as T[] | T;
    if (Array.isArray(rows)) return rows;
    if (rows && typeof rows === "object") return [rows as T];
    return [];
  } catch {
    return null;
  }
}

function confirmedId(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim() && raw.trim() !== "0") return raw.trim();
  if (typeof raw === "bigint") return raw.toString();
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) return String(raw);
  return fallback;
}

function publicDbError(error: unknown, fallback: string): Error {
  const text = error instanceof Error ? error.message : "";
  if (!text || /mysql:\/\//i.test(text) || /password/i.test(text)) return new Error(fallback);
  return new Error(`${fallback}（${text.slice(0, 180)}）`);
}

function readMeta(meta: DomainAgent["meta"]): Record<string, unknown> {
  if (!meta || typeof meta === "string") return {};
  return meta;
}

function metaString(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  return typeof value === "string" ? value : undefined;
}
