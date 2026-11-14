import { createServer } from "node:http";
import { once } from "node:events";
import { expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { WebDAVProvider } from "../webdavProvider";
import { getLocalSyncData } from "../types";

function device() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

it("propagates a task clear between two clients and preserves an offline concurrent edit as a conflict", async () => {
  const files = new Map();
  let online = true;
  let revision = 0;
  const server = createServer(async (req, res) => {
    const path = req.url ?? "/";
    if (!online) {
      res.writeHead(503).end();
      return;
    }
    if (req.method === "PUT") {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const etag = `"etag-${++revision}"`;
      files.set(path, { value: Buffer.concat(chunks).toString(), etag });
      res.writeHead(201, { ETag: etag }).end();
      return;
    }
    const entry = files.get(path);
    if (!entry) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { ETag: entry.etag }).end(req.method === "HEAD" ? undefined : entry.value);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no fixture address");
    const url = `http://127.0.0.1:${address.port}/`;
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    // The provider is unchanged. Adapt its desktop IPC calls to the isolated HTTP fixture.
    vi.mocked(invoke).mockImplementation(async (command, raw) => {
      const args = raw;
      if (command === "webdav_mkcol") return null;
      if (command === "local_backup_write") return "/isolated-conflict-backup.json";
      const method =
        command === "webdav_stat" ? "HEAD" : command === "webdav_upload_meta" ? "PUT" : "GET";
      const response = await fetch(url + args.filename, { method, body: args.content });
      if (response.status === 404 && method === "HEAD") return { exists: false };
      if (!response.ok)
        throw new Error(response.status === 404 ? "E_NOT_FOUND" : "fixture offline");
      return {
        exists: true,
        etag: response.headers.get("etag"),
        lastModified: null,
        content: await response.text(),
      };
    });
    const a = new WebDAVProvider({ url, username: "fixture" });
    const b = new WebDAVProvider({ url, username: "fixture" });
    const first = device();
    const second = device();
    const dirty = new Set(["tasks"]);
    const original = { id: "shared", title: "Original", category: "urgent-important" };
    const switchTo = (profile) => vi.stubGlobal("localStorage", profile);
    const save = (items, version) => {
      localStorage.setItem("aero_todos", JSON.stringify(items));
      localStorage.setItem("tongyun_cat_ver_tasks", String(version));
    };
    switchTo(first);
    save([original], 100);
    expect((await a.push(getLocalSyncData(), dirty)).conflicts).toHaveLength(0);
    switchTo(second);
    expect((await b.pull())?.tasks).toEqual([original]);
    switchTo(first);
    save([], 200);
    expect((await a.push(getLocalSyncData(), dirty)).conflicts).toHaveLength(0);
    switchTo(second);
    expect((await b.pull())?.tasks).toEqual([]);

    const local = { ...original, id: "only-b", title: "Offline B" };
    const remote = { ...original, id: "only-a", title: "Online A" };
    save([local], 300);
    online = false;
    await expect(b.push(getLocalSyncData(), dirty)).rejects.toThrow("fixture offline");
    expect(getLocalSyncData().tasks).toEqual([local]);
    online = true;
    switchTo(first);
    save([remote], 400);
    expect((await a.push(getLocalSyncData(), dirty)).conflicts).toHaveLength(0);
    switchTo(second);
    expect((await b.pull(dirty))?.tasks).toEqual([local]);
    const { conflicts } = await b.push(getLocalSyncData(), dirty);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].remotePayload).toEqual([remote]);
    expect(getLocalSyncData().tasks).toEqual([local]);
  } finally {
    vi.unstubAllGlobals();
    vi.mocked(invoke).mockReset();
    await new Promise((resolve) => server.close(() => resolve()));
  }
});
