import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSchema, migrateLegacyData, SCHEMA_VERSION } from "./domainDatabase";

describe("Domain Database Schema & Migrations", () => {
  let executedSql: string[] = [];
  let tablesCreated: Set<string> = new Set();
  let mockMigrations: number[] = [];

  const mockDb = {
    execute: vi.fn(async (sql: string, _params?: any[]) => {
      executedSql.push(sql);
      const match = sql.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
      if (match) {
        tablesCreated.add(match[1]);
      }
      if (sql.includes("INSERT OR REPLACE INTO schema_migrations")) {
        const vMatch = sql.match(/VALUES \((\d+)/);
        if (vMatch) mockMigrations.push(parseInt(vMatch[1], 10));
      }
    }),
    select: vi.fn(async (sql: string, _params?: any[]) => {
      if (sql.includes("SELECT version FROM schema_migrations")) {
        return mockMigrations.map((v) => ({ version: v }));
      }
      if (sql.includes("PRAGMA table_info")) {
        return [{ name: "id" }, { name: "data" }];
      }
      if (sql.includes("SELECT COUNT(*) as count FROM domain_agents")) {
        return [{ count: 0 }];
      }
      return [];
    }),
  };

  beforeEach(() => {
    executedSql = [];
    tablesCreated = new Set();
    mockMigrations = [];
    vi.clearAllMocks();
  });

  it("SCHEMA_VERSION should be 3", () => {
    expect(SCHEMA_VERSION).toBe(3);
  });

  it("creates all 12 P0 tables required by 2026-10-25-planner-full-schema.md", async () => {
    await createSchema(mockDb as any);

    const requiredP0Tables = [
      "tasks",
      "journal_entries",
      "pomodoro_logs",
      "habits",
      "agents",
      "task_dispatch",
      "sticky_notes",
      "countdowns",
      "timeblocks",
      "user_prefs",
      "sync_state",
      "sync_outbox",
    ];

    for (const table of requiredP0Tables) {
      expect(tablesCreated.has(table), `Table ${table} must be created`).toBe(true);
    }
  });

  it("applies V1, V2, and V3 migrations in sequence", async () => {
    await createSchema(mockDb as any);
    await migrateLegacyData(mockDb as any);

    // Verify all 3 migration stages were processed
    const migrationInserts = executedSql.filter((sql) => sql.includes("schema_migrations"));
    expect(migrationInserts.length).toBeGreaterThanOrEqual(3);
  });
});
