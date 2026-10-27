import { describe, it, expect, beforeEach } from "vitest";
import { getPluginDatabase, setPluginDatabaseOverrideForTesting } from "../database";
import type { PluginManifest } from "../types";

class LocalStorageMock {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null;
  }
}

(globalThis as any).localStorage = new LocalStorageMock();

describe("Plugin Database Gateway", () => {
  const dummyManifest: PluginManifest = {
    id: "test-plugin-db",
    name: "测试插件",
    description: "测试独立数据库",
    version: "1.0.0",
    category: "tool",
    database: {
      type: "sqlite",
      name: "notes.db",
      initSql: [
        "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT)",
      ],
    },
  };

  beforeEach(() => {
    localStorage.clear();
    setPluginDatabaseOverrideForTesting("test-plugin-db", null);
  });

  it("provisions an independent database client and executes initSql", async () => {
    const db = await getPluginDatabase("test-plugin-db", dummyManifest);
    expect(db).toBeDefined();
    expect(typeof db.select).toBe("function");
    expect(typeof db.execute).toBe("function");
  });

  it("supports INSERT, SELECT and DELETE on the plugin table", async () => {
    const db = await getPluginDatabase("test-plugin-db", dummyManifest);

    // 1. Insert row
    const insertRes = await db.execute(
      "INSERT INTO notes (id, title, content) VALUES (?, ?, ?)",
      ["n1", "测试便签", "便签内容 123"],
    );
    expect(insertRes.rowsAffected).toBe(1);

    // 2. Select rows
    const rows = await db.select<{ id: string; title: string; content: string }>(
      "SELECT * FROM notes",
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("n1");
    expect(rows[0].title).toBe("测试便签");
    expect(rows[0].content).toBe("便签内容 123");

    // 3. Delete row
    const delRes = await db.execute("DELETE FROM notes WHERE id = ?", ["n1"]);
    expect(delRes.rowsAffected).toBe(1);

    // 4. Verify empty
    const afterRows = await db.select("SELECT * FROM notes");
    expect(afterRows.length).toBe(0);
  });

  it("isolates data between different plugin databases", async () => {
    const manifestA: PluginManifest = {
      id: "plugin-a",
      name: "Plugin A",
      description: "A",
      version: "1.0",
      category: "tool",
    };
    const manifestB: PluginManifest = {
      id: "plugin-b",
      name: "Plugin B",
      description: "B",
      version: "1.0",
      category: "tool",
    };

    const dbA = await getPluginDatabase("plugin-a", manifestA);
    const dbB = await getPluginDatabase("plugin-b", manifestB);

    await dbA.execute("INSERT INTO items (id, title) VALUES (?, ?)", ["a1", "Item A"]);
    await dbB.execute("INSERT INTO items (id, title) VALUES (?, ?)", ["b1", "Item B"]);

    const rowsA = await dbA.select("SELECT * FROM items");
    const rowsB = await dbB.select("SELECT * FROM items");

    expect(rowsA.length).toBe(1);
    expect(rowsA[0].title).toBe("Item A");

    expect(rowsB.length).toBe(1);
    expect(rowsB[0].title).toBe("Item B");
  });
});
