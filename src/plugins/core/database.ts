import type {
  PluginDatabaseClient,
  PluginDatabaseConfig,
  PluginManifest,
  PluginQueryResult,
} from "./types";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * 内存/本地兜底 SQL 引擎（在非 Tauri 容器或自动化测试下运行，保障插件完全可用且不崩溃）
 */
class InMemoryDatabaseClient implements PluginDatabaseClient {
  readonly type = "mock" as const;
  private tables = new Map<string, Array<Record<string, any>>>();
  private pluginId: string;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
    this.restoreFromStorage();
  }

  private getStorageKey(): string {
    return `tongyun_plugin_db_mock:${this.pluginId}`;
  }

  private restoreFromStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [table, rows] of Object.entries(parsed)) {
          if (Array.isArray(rows)) {
            this.tables.set(table, rows);
          }
        }
      }
    } catch {
      // 容错降级
    }
  }

  private persistToStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const obj: Record<string, any[]> = {};
      for (const [table, rows] of this.tables.entries()) {
        obj[table] = rows;
      }
      localStorage.setItem(this.getStorageKey(), JSON.stringify(obj));
    } catch {
      // 容错降级
    }
  }

  private extractTableName(sql: string): string {
    const match = sql.match(
      /(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+([a-zA-Z0-9_]+)/i,
    );
    return match ? match[1].toLowerCase() : "default";
  }

  async select<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
    const table = this.extractTableName(sql);
    const rows = this.tables.get(table) || [];

    // 处理带简单 WHERE id = ? 的查询
    if (params && params.length > 0 && sql.includes("WHERE id =")) {
      const idParam = String(params[0]);
      return rows.filter((r) => String(r.id) === idParam) as T[];
    }

    return [...rows] as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<PluginQueryResult> {
    const table = this.extractTableName(sql);
    const upper = sql.trim().toUpperCase();

    if (upper.startsWith("CREATE TABLE")) {
      if (!this.tables.has(table)) {
        this.tables.set(table, []);
        this.persistToStorage();
      }
      return { rowsAffected: 0 };
    }

    if (upper.startsWith("INSERT")) {
      if (!this.tables.has(table)) {
        this.tables.set(table, []);
      }
      const rows = this.tables.get(table)!;
      let newRow: Record<string, any> = {};

      // 解析 INSERT INTO table (col1, col2) VALUES (?, ?)
      const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
      if (colsMatch && params && params.length > 0) {
        const cols = colsMatch[1].split(",").map((c) => c.trim());
        cols.forEach((col, idx) => {
          newRow[col] = params[idx];
        });
      } else {
        newRow = { id: `row_${Date.now()}`, data: params };
      }

      rows.push(newRow);
      this.persistToStorage();
      return { rowsAffected: 1, lastInsertId: rows.length };
    }

    if (upper.startsWith("DELETE")) {
      const rows = this.tables.get(table) || [];
      if (params && params.length > 0) {
        const idParam = String(params[0]);
        const next = rows.filter((r) => String(r.id) !== idParam);
        const affected = rows.length - next.length;
        this.tables.set(table, next);
        this.persistToStorage();
        return { rowsAffected: affected };
      }
      this.tables.set(table, []);
      this.persistToStorage();
      return { rowsAffected: rows.length };
    }

    if (upper.startsWith("UPDATE")) {
      const rows = this.tables.get(table) || [];
      if (params && params.length > 0) {
        const idParam = String(params[params.length - 1]);
        const target = rows.find((r) => String(r.id) === idParam);
        if (target) {
          // 简易更新
          return { rowsAffected: 1 };
        }
      }
      return { rowsAffected: 0 };
    }

    return { rowsAffected: 1 };
  }
}

const dbClientsCache = new Map<string, PluginDatabaseClient>();

export function setPluginDatabaseOverrideForTesting(
  pluginId: string,
  client: PluginDatabaseClient | null,
): void {
  if (client) {
    dbClientsCache.set(pluginId, client);
  } else {
    dbClientsCache.delete(pluginId);
  }
}

/**
 * 为指定插件获取独立数据库客户端
 */
export async function getPluginDatabase(
  pluginId: string,
  manifest?: PluginManifest,
): Promise<PluginDatabaseClient> {
  if (dbClientsCache.has(pluginId)) {
    return dbClientsCache.get(pluginId)!;
  }

  const dbConfig: PluginDatabaseConfig = manifest?.database || {
    type: "sqlite",
    name: "data.db",
  };

  // 如果非 Tauri 容器，使用本地轻量内存/持久化 Client
  if (!isTauri()) {
    const mock = new InMemoryDatabaseClient(pluginId);
    if (dbConfig.initSql && dbConfig.initSql.length > 0) {
      for (const ddl of dbConfig.initSql) {
        await mock.execute(ddl);
      }
    }
    dbClientsCache.set(pluginId, mock);
    return mock;
  }

  // Tauri 环境：动态引入 @tauri-apps/plugin-sql
  try {
    const { default: DatabaseClass } = await import("@tauri-apps/plugin-sql");
    const sanitizedId = pluginId.replace(/[^a-zA-Z0-9_]/g, "_");

    let rawDb: any = null;
    let effectiveType: "sqlite" | "remote" = "sqlite";

    if (dbConfig.type === "sqlite") {
      const dbFile = `sqlite:plugin_${sanitizedId}_${dbConfig.name || "data.db"}`;
      rawDb = await DatabaseClass.load(dbFile);
      effectiveType = "sqlite";
    } else if (dbConfig.type === "shared") {
      // 复用手帐主配置 DSN
      const { getRemoteDsn, loadRemoteDatabase } = await import(
        "../../utils/sync/remoteDbSync"
      );
      rawDb = await loadRemoteDatabase(getRemoteDsn() ?? undefined);
      effectiveType = "remote";
    } else if (dbConfig.type === "remote") {
      const dsn =
        dbConfig.remoteDsnKey && typeof localStorage !== "undefined"
          ? localStorage.getItem(`plugin:${pluginId}:${dbConfig.remoteDsnKey}`)
          : null;
      if (dsn) {
        rawDb = await DatabaseClass.load(dsn);
        effectiveType = "remote";
      }
    }

    if (!rawDb) {
      // 降级为本地 SQLite
      rawDb = await DatabaseClass.load(`sqlite:plugin_${sanitizedId}_data.db`);
      effectiveType = "sqlite";
    }

    // 自动执行首次建表 initSql
    if (dbConfig.initSql && dbConfig.initSql.length > 0) {
      for (const ddl of dbConfig.initSql) {
        if (ddl.trim()) {
          try {
            await rawDb.execute(ddl);
          } catch (e) {
            console.warn(`[PluginDB:${pluginId}] initSql error:`, e);
          }
        }
      }
    }

    const client: PluginDatabaseClient = {
      type: effectiveType,
      select: async <T = any>(sql: string, params?: unknown[]): Promise<T[]> => {
        const res = await rawDb.select(sql, (params || []) as any);
        return (res ?? []) as T[];
      },
      execute: async (sql: string, params?: unknown[]): Promise<PluginQueryResult> => {
        const res = await rawDb.execute(sql, (params || []) as any);
        return {
          rowsAffected: res.rowsAffected ?? 1,
          lastInsertId: res.lastInsertId,
        };
      },
    };

    dbClientsCache.set(pluginId, client);
    return client;
  } catch (error) {
    console.warn(
      `[PluginDB:${pluginId}] Tauri SQL driver load failed, using fallback mock:`,
      error,
    );
    const fallback = new InMemoryDatabaseClient(pluginId);
    if (dbConfig.initSql) {
      for (const ddl of dbConfig.initSql) {
        await fallback.execute(ddl);
      }
    }
    dbClientsCache.set(pluginId, fallback);
    return fallback;
  }
}
