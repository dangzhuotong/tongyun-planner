import type { Task, TaskRunStatus } from "../../types";
import type { CompanyRosterEntry, PipelineGateway } from "./companyRoster";

/**
 * 开工 / 改派只认 tongyun_pipeline.tasks。
 * 列名从 information_schema 读，不猜一套固定 DDL。
 * status 优先写库里的 todo（没有就用其它可领值）。工人领走之前，本机停在待跑。
 */

export const TASK_COLUMNS_SQL = `SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS column_default, EXTRA AS extra, COLUMN_TYPE AS column_type
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'`;

const CLAIMABLE = ["todo", "queued", "open", "pending", "ready", "backlog", "claimable", "new"];
const RUNNING = ["doing", "running", "in_progress", "claimed", "wip", "started", "busy", "working"];
const DONE = ["done", "completed", "complete", "closed", "resolved"];
const FAILED = ["failed", "error", "failure"];
const CANCELLED = ["cancelled", "canceled", "dropped", "abandoned"];
const BLOCKED = ["blocked", "paused"];

const ROLE_NAMES = {
  id: ["id"],
  title: ["title", "name", "summary"],
  detail: ["detail", "body", "description", "content"],
  assignee: ["assignee", "assignee_slug", "worker_slug", "worker"],
  status: ["status", "state"],
  source: ["source"],
  plannerTaskId: ["planner_task_id", "external_id", "source_task_id", "client_task_id"],
  createdAt: ["created_at"],
  updatedAt: ["updated_at"],
} as const;

type Role = keyof typeof ROLE_NAMES;

export interface TaskColumn {
  name: string;
  nullable: boolean;
  hasDefault: boolean;
  autoIncrement: boolean;
  columnType: string;
}

export interface PipelineTaskDraft {
  intent: "start" | "reassign" | "settle";
  plannerTaskId: string;
  title: string;
  detail?: string;
  assignee?: string;
  pipelineTaskId?: string | null;
  settleAs?: TaskRunStatus;
}

export interface PipelineTaskSnapshot {
  id: string;
  assignee: string;
  status: string;
  runStatus: TaskRunStatus;
  plannerTaskId?: string;
}

export interface PipelineTaskReceipt extends PipelineTaskSnapshot {
  written: boolean;
}

interface PlannedWrite {
  sql: string;
  params: unknown[];
  id: string;
  assignee: string;
  status: string;
  written: boolean;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

export function parseTaskColumns(rows: unknown): TaskColumn[] {
  if (!Array.isArray(rows)) return [];
  const columns: TaskColumn[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const name = stringField(record, ["name", "column_name", "COLUMN_NAME"]);
    if (!name || !IDENT.test(name)) continue;
    const nullableRaw = stringField(record, ["nullable", "is_nullable", "IS_NULLABLE"]);
    const extra = stringField(record, ["extra", "EXTRA"]);
    const columnType =
      stringField(record, ["column_type", "COLUMN_TYPE", "columnType", "data_type", "DATA_TYPE"]) ||
      "text";
    const fallback = record.column_default ?? record.COLUMN_DEFAULT ?? record.columnDefault;
    const hasDefault =
      fallback != null &&
      String(fallback).trim() !== "" &&
      String(fallback).toUpperCase() !== "NULL";
    columns.push({
      name,
      nullable: nullableRaw === "YES" || nullableRaw === "1" || nullableRaw === "true",
      hasDefault,
      autoIncrement: /auto_increment/i.test(extra),
      columnType,
    });
  }
  return columns;
}

export function mapPipelineTaskStatus(status: string | null | undefined): TaskRunStatus {
  const key = (status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!key) return "queued";
  if (RUNNING.includes(key)) return "running";
  if (DONE.includes(key)) return "done";
  if (FAILED.includes(key)) return "failed";
  if (CANCELLED.includes(key)) return "cancelled";
  if (BLOCKED.includes(key)) return "blocked";
  if (CLAIMABLE.includes(key)) return "queued";
  return "queued";
}

export function companyRosterSlug(
  roster: CompanyRosterEntry[],
  assigneeId: string | null | undefined,
): string | null {
  const wanted = (assigneeId || "").trim();
  if (!wanted) return null;
  const hit = roster.find(
    (entry) =>
      entry.source === "company" && entry.enabled && (entry.id === wanted || entry.slug === wanted),
  );
  return hit ? hit.slug : null;
}

export function resolveCompanyAssigneeId(
  companyIds: { id: string }[],
  preferred?: string | null,
): string {
  if (preferred && companyIds.some((entry) => entry.id === preferred)) return preferred;
  return companyIds[0]?.id || "";
}

/** 库里的状态盖过本机。已经改回自己的卡片不再被拉回 Agent 栏。 */
export function alignTaskWithPipeline(
  task: Task,
  row: PipelineTaskSnapshot,
  now = Date.now(),
): Partial<Task> | null {
  if (task.assigneeKind === "human") return null;
  const updates: Partial<Task> = {};
  if (row.runStatus !== task.runStatus) updates.runStatus = row.runStatus;
  if (row.assignee && row.assignee !== task.assigneeAgentId) {
    updates.assigneeKind = "agent";
    updates.assigneeAgentId = row.assignee;
  }
  if (row.id && row.id !== task.pipelineTaskId) updates.pipelineTaskId = row.id;
  if (Object.keys(updates).length === 0) return null;
  updates.updatedAt = now;
  return updates;
}

export function planPipelineTaskWrite(
  columns: TaskColumn[],
  draft: PipelineTaskDraft,
  existing: PipelineTaskSnapshot | null,
  insertId: string,
): PlannedWrite {
  const byRole = indexRoles(columns);
  const assigneeColumn = byRole.assignee;
  const statusColumn = byRole.status;
  if (!assigneeColumn) throw new Error("公司库 tasks 没有 assignee 列，任务未写入");
  if (!statusColumn) throw new Error("公司库 tasks 没有 status 列，任务未写入");

  if (
    draft.intent === "start" &&
    existing &&
    mapPipelineTaskStatus(existing.status) === "running"
  ) {
    return {
      sql: "",
      params: [],
      id: existing.id,
      assignee: existing.assignee || draft.assignee || "",
      status: existing.status,
      written: false,
    };
  }

  const runTarget: TaskRunStatus =
    draft.intent === "settle" ? draft.settleAs || "queued" : "queued";
  const status = statusValueFor(statusColumn, runTarget);
  const assignee =
    draft.intent === "settle"
      ? existing?.assignee || draft.assignee || ""
      : requireAssignee(draft.assignee);
  const id = existing?.id || draft.pipelineTaskId || insertId;

  if (!existing && draft.intent === "settle") {
    throw new Error("还没写入公司库，不能只改本机状态");
  }

  const idColumn = byRole.id;
  if (!idColumn) throw new Error("公司库 tasks 没有 id 列，任务未写入");

  if (existing) {
    const sets: string[] = [];
    const params: unknown[] = [];
    pushAssign(sets, params, assigneeColumn, assignee);
    pushAssign(sets, params, statusColumn, status);
    if (draft.intent !== "settle") {
      const title = draft.title.trim();
      if (title && byRole.title) pushAssign(sets, params, byRole.title, title);
      const detail = draft.detail?.trim();
      if (detail && byRole.detail && acceptsText(byRole.detail)) {
        pushAssign(sets, params, byRole.detail, detail);
      }
    }
    if (byRole.plannerTaskId && acceptsText(byRole.plannerTaskId) && draft.plannerTaskId) {
      pushAssign(sets, params, byRole.plannerTaskId, draft.plannerTaskId);
    }
    pushTimeAssign(sets, params, byRole.updatedAt);
    if (!SAFE_ID.test(id)) throw new Error("公司库任务 id 无效，任务未写入");
    params.push(id);
    return {
      sql: `UPDATE tasks SET ${sets.join(", ")} WHERE \`${idColumn.name}\` = $${params.length}`,
      params,
      id,
      assignee,
      status,
      written: true,
    };
  }

  const names: string[] = [];
  const values: string[] = [];
  const params: unknown[] = [];
  if (!idColumn.autoIncrement) {
    if (!SAFE_ID.test(insertId)) throw new Error("公司库任务 id 无效，任务未写入");
    pushInsert(names, values, params, idColumn, insertId);
  }
  const title = draft.title.trim();
  if (!title) throw new Error("标题不能为空");
  if (byRole.title) pushInsert(names, values, params, byRole.title, title);
  if (byRole.detail && acceptsText(byRole.detail) && draft.detail?.trim()) {
    pushInsert(names, values, params, byRole.detail, draft.detail.trim());
  }
  pushInsert(names, values, params, assigneeColumn, assignee);
  pushInsert(names, values, params, statusColumn, status);
  if (byRole.source && acceptsText(byRole.source)) {
    pushInsert(names, values, params, byRole.source, "planner");
  }
  if (byRole.plannerTaskId && acceptsText(byRole.plannerTaskId)) {
    pushInsert(names, values, params, byRole.plannerTaskId, draft.plannerTaskId);
  }
  pushTimeInsert(names, values, params, byRole.createdAt);
  pushTimeInsert(names, values, params, byRole.updatedAt);

  const writtenNames = new Set(names.map((name) => name.toLowerCase()));
  const missing = columns.filter(
    (column) =>
      !column.nullable &&
      !column.hasDefault &&
      !column.autoIncrement &&
      !writtenNames.has(column.name.toLowerCase()),
  );
  if (missing.length > 0) {
    throw new Error(
      `公司库 tasks 还有必填列未写入：${missing.map((column) => column.name).join(", ")}`,
    );
  }

  return {
    sql: `INSERT INTO tasks (${names.map((name) => `\`${name}\``).join(", ")}) VALUES (${values.join(", ")})`,
    params,
    id: insertId,
    assignee,
    status,
    written: true,
  };
}

export async function writePipelineTask(
  gateway: PipelineGateway,
  draft: PipelineTaskDraft,
  ids?: { insertId?: string },
): Promise<PipelineTaskReceipt> {
  let columns: TaskColumn[];
  try {
    columns = parseTaskColumns(await gateway.select(TASK_COLUMNS_SQL));
  } catch (error) {
    throw asPublic(error, "读不到公司库 tasks 的列，任务未写入");
  }
  if (columns.length === 0) throw new Error("读不到公司库 tasks 的列，任务未写入");

  const insertId = ids?.insertId || createPipelineTaskId();
  let existing: PipelineTaskSnapshot | null;
  try {
    existing = await findExisting(gateway, columns, draft);
  } catch (error) {
    throw asPublic(error, "没有读到公司库里的原任务，任务未写入");
  }

  const plan = planPipelineTaskWrite(columns, draft, existing, existing?.id || insertId);
  if (plan.written) {
    try {
      await gateway.execute(plan.sql, plan.params);
    } catch (error) {
      throw asPublic(error, "任务没有写入公司库");
    }
  }

  try {
    let confirmed = await selectTasks(gateway, columns, [plan.id]);
    if (!confirmed[0] && SAFE_ID.test(draft.plannerTaskId)) {
      const planner = indexRoles(columns).plannerTaskId;
      if (planner)
        confirmed = await selectTasks(gateway, columns, [draft.plannerTaskId], planner.name);
    }
    const row = confirmed[0];
    if (row) {
      if (
        plan.written &&
        draft.intent !== "settle" &&
        row.assignee &&
        row.assignee !== plan.assignee
      ) {
        throw new Error("公司库没有改到指定的工人，本机人选未改");
      }
      return {
        id: row.id,
        assignee: row.assignee || plan.assignee,
        status: row.status || plan.status,
        runStatus: mapPipelineTaskStatus(row.status || plan.status),
        plannerTaskId: row.plannerTaskId,
        written: plan.written,
      };
    }
  } catch (error) {
    // 确认到的工人和计划不一致是写失败，不能被「查询失败就用计划值」吞掉。
    if (error instanceof Error && error.message === "公司库没有改到指定的工人，本机人选未改") {
      throw error;
    }
    /* 确认查询失败时，写入已经成功，用计划值回执，避免再假装失败 */
  }

  return {
    id: plan.id,
    assignee: plan.assignee,
    status: plan.status,
    runStatus: mapPipelineTaskStatus(plan.status),
    written: plan.written,
  };
}

export async function readPipelineTasks(
  gateway: PipelineGateway,
  ids: string[],
): Promise<PipelineTaskSnapshot[]> {
  const safe = [...new Set(ids.map((id) => id.trim()).filter((id) => SAFE_ID.test(id)))].slice(
    0,
    80,
  );
  if (safe.length === 0) return [];
  const columns = parseTaskColumns(await gateway.select(TASK_COLUMNS_SQL));
  if (columns.length === 0) throw new Error("读不到公司库 tasks 的列");
  return selectTasks(gateway, columns, safe);
}

export function createPipelineTaskId(
  now = Date.now(),
  rand = Math.floor(Math.random() * 1_000_000),
): string {
  return `${now}${String(rand).padStart(6, "0")}`;
}

export interface MemoryTaskGateway extends PipelineGateway {
  rows: Array<Record<string, string | null>>;
}

/** 开发态 fixture 用。生产开工不会走这里。 */
export function createMemoryTaskGateway(columns: TaskColumn[]): MemoryTaskGateway {
  const rows: Array<Record<string, string | null>> = [];
  return {
    rows,
    async select(sql, params = []) {
      if (/information_schema/i.test(sql)) {
        return columns.map((column) => ({
          name: column.name,
          nullable: column.nullable ? "YES" : "NO",
          column_default: column.hasDefault ? "CURRENT_TIMESTAMP(3)" : null,
          extra: column.autoIncrement ? "auto_increment" : "",
          column_type: column.columnType,
        }));
      }
      if (!/FROM\s+tasks/i.test(sql)) return [];
      const wanted = params.map((value) => (value == null ? "" : String(value)));
      const matched = /WHERE\s+`planner_task_id`/i.test(sql)
        ? rows.filter((row) => row.planner_task_id === wanted[0])
        : rows.filter((row) => wanted.includes(String(row.id ?? "")));
      return matched.map((row) => ({
        id: row.id,
        assignee: row.assignee ?? row.assignee_slug ?? null,
        status: row.status ?? row.state ?? null,
        planner_task_id: row.planner_task_id ?? null,
      }));
    },
    async execute(sql, params = []) {
      if (/^INSERT\s+INTO\s+tasks/i.test(sql)) {
        const names = quotedNames(sql.slice(0, sql.toUpperCase().indexOf("VALUES")));
        const tokens =
          sql.slice(sql.toUpperCase().indexOf("VALUES")).match(/NOW\(3\)|\$\d+/g) || [];
        const row: Record<string, string | null> = {};
        tokens.forEach((token, index) => {
          const name = names[index];
          if (!name) return;
          if (token === "NOW(3)") row[name] = "now";
          else row[name] = paramAt(params, token);
        });
        rows.push(row);
        return { rowsAffected: 1, lastInsertId: row.id ?? undefined };
      }
      if (/^UPDATE\s+tasks/i.test(sql)) {
        const setPart = sql.slice(
          sql.toUpperCase().indexOf("SET"),
          sql.toUpperCase().lastIndexOf("WHERE"),
        );
        const where = sql.match(/WHERE\s+`([A-Za-z0-9_]+)`\s*=\s*\$(\d+)/i);
        if (!where) throw new Error("unsupported update");
        const id = String(params[Number(where[2]) - 1] ?? "");
        const row = rows.find((item) => item.id === id);
        if (!row) return { rowsAffected: 0 };
        for (const match of setPart.matchAll(/`([A-Za-z0-9_]+)`\s*=\s*(NOW\(3\)|\$(\d+))/g)) {
          row[match[1]] = match[2] === "NOW(3)" ? "now" : paramAt(params, `$${match[3]}`);
        }
        return { rowsAffected: 1 };
      }
      throw new Error("unsupported sql");
    },
  };
}

/** 和线上 requirements 同形的一列，测试和 fixture 共用。真实库仍以 information_schema 为准。 */
export function referenceTaskColumns(): TaskColumn[] {
  return [
    { name: "id", nullable: false, hasDefault: false, autoIncrement: false, columnType: "bigint" },
    {
      name: "title",
      nullable: false,
      hasDefault: false,
      autoIncrement: false,
      columnType: "varchar(255)",
    },
    { name: "detail", nullable: true, hasDefault: false, autoIncrement: false, columnType: "text" },
    {
      name: "assignee",
      nullable: true,
      hasDefault: false,
      autoIncrement: false,
      columnType: "varchar(64)",
    },
    {
      name: "status",
      nullable: false,
      hasDefault: true,
      autoIncrement: false,
      columnType: "enum('todo','doing','done','failed','cancelled')",
    },
    {
      name: "source",
      nullable: true,
      hasDefault: false,
      autoIncrement: false,
      columnType: "varchar(32)",
    },
    {
      name: "planner_task_id",
      nullable: true,
      hasDefault: false,
      autoIncrement: false,
      columnType: "varchar(64)",
    },
    {
      name: "created_at",
      nullable: false,
      hasDefault: true,
      autoIncrement: false,
      columnType: "datetime(3)",
    },
    {
      name: "updated_at",
      nullable: false,
      hasDefault: true,
      autoIncrement: false,
      columnType: "datetime(3)",
    },
  ];
}

function indexRoles(columns: TaskColumn[]): Partial<Record<Role, TaskColumn>> {
  const found: Partial<Record<Role, TaskColumn>> = {};
  for (const role of Object.keys(ROLE_NAMES) as Role[]) {
    const names = new Set(ROLE_NAMES[role].map((name) => name.toLowerCase()));
    const column = columns.find((item) => names.has(item.name.toLowerCase()));
    if (column) found[role] = column;
  }
  return found;
}

function statusValueFor(column: TaskColumn, run: TaskRunStatus): string {
  const enums = parseMysqlEnum(column.columnType);
  const prefs: Record<TaskRunStatus, string[]> = {
    queued: CLAIMABLE,
    running: RUNNING,
    done: DONE,
    failed: FAILED,
    cancelled: CANCELLED,
    blocked: BLOCKED,
  };
  const fallback: Record<TaskRunStatus, string> = {
    queued: "todo",
    running: "doing",
    done: "done",
    failed: "failed",
    cancelled: "cancelled",
    blocked: "blocked",
  };
  if (enums.length === 0) return fallback[run];
  const found = prefs[run].find((value) => enums.includes(value));
  if (!found) {
    throw new Error(`公司库 tasks.${column.name} 不能写成 ${run}（现有：${enums.join(", ")}）`);
  }
  return found;
}

function parseMysqlEnum(columnType: string): string[] {
  const match = columnType.trim().match(/^enum\((.*)\)$/i);
  if (!match) return [];
  return [...match[1].matchAll(/'((?:\\'|[^'])*)'/g)].map((item) => item[1].replace(/\\'/g, "'"));
}

function requireAssignee(assignee: string | null | undefined): string {
  const slug = (assignee || "").trim();
  if (!slug) throw new Error("先指定公司名册工人，任务未写入");
  if (!SAFE_ID.test(slug)) throw new Error("工人标识无效，任务未写入");
  return slug;
}

function acceptsText(column: TaskColumn): boolean {
  const type = column.columnType.toLowerCase();
  return type.includes("char") || type.includes("text") || type.includes("json") || type === "";
}

function pushInsert(
  names: string[],
  values: string[],
  params: unknown[],
  column: TaskColumn,
  value: unknown,
) {
  names.push(column.name);
  params.push(value);
  values.push(`$${params.length}`);
}

function pushTimeInsert(
  names: string[],
  values: string[],
  params: unknown[],
  column: TaskColumn | undefined,
) {
  if (!column) return;
  names.push(column.name);
  const type = column.columnType.toLowerCase();
  if (type.includes("datetime") || type.includes("timestamp")) {
    values.push("NOW(3)");
    return;
  }
  params.push(Date.now());
  values.push(`$${params.length}`);
}

function pushAssign(sets: string[], params: unknown[], column: TaskColumn, value: unknown) {
  params.push(value);
  sets.push(`\`${column.name}\` = $${params.length}`);
}

function pushTimeAssign(sets: string[], params: unknown[], column: TaskColumn | undefined) {
  if (!column) return;
  const type = column.columnType.toLowerCase();
  if (type.includes("datetime") || type.includes("timestamp")) {
    sets.push(`\`${column.name}\` = NOW(3)`);
    return;
  }
  params.push(Date.now());
  sets.push(`\`${column.name}\` = $${params.length}`);
}

async function findExisting(
  gateway: PipelineGateway,
  columns: TaskColumn[],
  draft: PipelineTaskDraft,
): Promise<PipelineTaskSnapshot | null> {
  if (draft.pipelineTaskId && SAFE_ID.test(draft.pipelineTaskId)) {
    const byId = await selectTasks(gateway, columns, [draft.pipelineTaskId]);
    if (byId[0]) return byId[0];
  }
  const planner = indexRoles(columns).plannerTaskId;
  if (!planner || !acceptsText(planner) || !SAFE_ID.test(draft.plannerTaskId)) return null;
  const rows = await selectTasks(gateway, columns, [draft.plannerTaskId], planner.name);
  return rows[0] || null;
}

async function selectTasks(
  gateway: PipelineGateway,
  columns: TaskColumn[],
  ids: string[],
  columnName = "id",
): Promise<PipelineTaskSnapshot[]> {
  const roles = indexRoles(columns);
  const idColumn = roles.id;
  if (!idColumn) throw new Error("公司库 tasks 没有 id 列");
  const pieces = [
    `CAST(\`${idColumn.name}\` AS CHAR) AS id`,
    roles.assignee ? `\`${roles.assignee.name}\` AS assignee` : "NULL AS assignee",
    roles.status ? `\`${roles.status.name}\` AS status` : "NULL AS status",
    roles.plannerTaskId
      ? `\`${roles.plannerTaskId.name}\` AS planner_task_id`
      : "NULL AS planner_task_id",
  ];
  const target =
    columns.find((column) => column.name.toLowerCase() === columnName.toLowerCase()) || idColumn;
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
  const where =
    ids.length === 1 ? `\`${target.name}\` = $1` : `\`${target.name}\` IN (${placeholders})`;
  const sql = `SELECT ${pieces.join(", ")} FROM tasks WHERE ${where}`;
  const raw = await gateway.select(sql, ids);
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((row) => snapshotFromRow(row))
    .filter((row): row is PipelineTaskSnapshot => Boolean(row));
}

function snapshotFromRow(row: unknown): PipelineTaskSnapshot | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = stringField(record, ["id", "ID"]);
  if (!id) return null;
  const status = stringField(record, ["status", "state"]) || "";
  const assignee = stringField(record, ["assignee", "assignee_slug", "worker"]);
  const plannerTaskId = stringField(record, ["planner_task_id", "plannerTaskId"]);
  return {
    id,
    assignee,
    status,
    runStatus: mapPipelineTaskStatus(status),
    plannerTaskId: plannerTaskId || undefined,
  };
}

function stringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "bigint") return value.toString();
    // 超过 MAX_SAFE_INTEGER 的 BIGINT 经 JSON number 会丢精度（例如 5214548946653707513）。
    // 读路径用 CAST AS CHAR，只接受还精确的整数；丢精度的 number 不当成 id。
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  }
  return "";
}

function quotedNames(sql: string): string[] {
  return [...sql.matchAll(/`([A-Za-z0-9_]+)`/g)].map((match) => match[1]);
}

function paramAt(params: unknown[], token: string): string | null {
  const value = params[Number(token.slice(1)) - 1];
  if (value == null) return null;
  return String(value);
}

function asPublic(error: unknown, fallback: string): Error {
  const text = error instanceof Error ? error.message : "";
  if (
    text &&
    !/mysql:\/\//i.test(text) &&
    !/password/i.test(text) &&
    /公司库|未写入|先指定|不能写成|标题不能为空|工人标识|必填列/.test(text)
  ) {
    return error instanceof Error ? error : new Error(text);
  }
  if (!text || /mysql:\/\//i.test(text) || /password/i.test(text)) return new Error(fallback);
  return new Error(`${fallback}（${text.slice(0, 180)}）`);
}
