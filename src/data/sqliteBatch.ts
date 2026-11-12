import { invoke } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import { isDesktopRuntime } from "../utils/tauriRuntime";

type Value = string | number | boolean | null;
type Write = (sql: string, values?: Value[]) => Promise<unknown>;

export async function writeSqliteBatch(db: Database, prepare: (write: Write) => Promise<void>) {
  if (!isDesktopRuntime()) {
    await prepare((sql, values) => db.execute(sql, values));
    return;
  }
  const statements: { sql: string; values: Value[] }[] = [];
  await prepare(async (sql, values = []) => {
    statements.push({ sql, values });
  });
  if (statements.length) await invoke("planner_sqlite_write_batch", { statements });
}
