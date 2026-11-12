import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import { WebDAVProvider } from "../webdavProvider";
import { getFingerprint, setFingerprint } from "../conflict";
import { buildSnapshotPayload } from "../localSnapshots";
import { registerPersistenceFlusher } from "../../deferredStorage";
const config = { url: "https://example.com/", username: "test" };
const account = `${config.url}|${config.username}`;
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("window", { isTauri: true, __TAURI_INTERNALS__: {} });
  vi.mocked(invoke).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it.each(["", "not json", "null", "{}"])(
  "rejects unusable remote journal snapshot %s without clearing local data",
  async (content) => {
    const p = new WebDAVProvider(config);
    const entries = [{ id: "j", content: "local text" }];
    localStorage.setItem("tongyun_journal", JSON.stringify(entries));
    await expect(
      p.acceptRemote({
        category: "journal",
        fileName: "journal.json",
        remotePayload: null,
        remoteContent: content,
        remoteFingerprint: "etag:remote",
        remoteManifestVersion: 2,
        backupPaths: [],
      }),
    ).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem("tongyun_journal")!)).toEqual(entries);
    expect(getFingerprint(account, "journal.json")).toBeUndefined();
  },
);
it("keeps edits made during a remote download and leaves fingerprint unacknowledged", async () => {
  const p = new WebDAVProvider(config);
  const dirty = new Set<"journal">();
  localStorage.setItem("tongyun_journal", JSON.stringify([{ id: "j", content: "old" }]));
  setFingerprint(account, "journal.json", "etag:old");
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "webdav_download_meta") {
      if (String((args as Record<string, unknown>).filename).endsWith("manifest.json"))
        return { content: JSON.stringify({ journal: { version: 100 } }) };
      localStorage.setItem("tongyun_journal", JSON.stringify([{ id: "j", content: "just typed" }]));
      dirty.add("journal");
      return {
        content: JSON.stringify([{ id: "j", content: "cloud" }]),
        etag: "new",
        lastModified: null,
      };
    }
    return null;
  });
  await p.pull(dirty);
  expect(JSON.parse(localStorage.getItem("tongyun_journal")!)[0].content).toBe("just typed");
  expect(getFingerprint(account, "journal.json")).toBe("etag:old");
});
it("flushes pending persistence before exporting a backup", () => {
  localStorage.setItem("tongyun_journal", "[]");
  const unregister = registerPersistenceFlusher(() =>
    localStorage.setItem("tongyun_journal", JSON.stringify([{ id: "j", content: "latest text" }])),
  );
  try {
    expect((buildSnapshotPayload().journal as any[])[0]?.content).toBe("latest text");
  } finally {
    unregister();
  }
});

it.each([false, true])(
  "applies a newer completed-task clear only when clean (dirty=%s)",
  async (dirty) => {
    const provider = new WebDAVProvider(config);
    const completed = [
      { id: "done", title: "Done", category: "urgent-important", completedAt: 20 },
    ];
    localStorage.setItem("aero_completed_todos", JSON.stringify(completed));
    localStorage.setItem("tongyun_cat_ver_completedTasks", "30");
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command !== "webdav_download_meta") return null;
      const filename = String((args as Record<string, unknown>).filename);
      return {
        content: filename.endsWith("manifest.json")
          ? JSON.stringify({ completedTasks: { version: 100 } })
          : "[]",
        etag: "new",
        lastModified: null,
      };
    });

    const result = await provider.pull(new Set<"completedTasks">(dirty ? ["completedTasks"] : []));
    expect(result?.completedTasks).toEqual(dirty ? completed : []);
    expect(localStorage.getItem("tongyun_cat_ver_completedTasks")).toBe(dirty ? "30" : "100");
  },
);

it.each([false, true])(
  "does not replay deleted tasks or startup examples on pull (dirty=%s)",
  async (dirty) => {
    const provider = new WebDAVProvider(config);
    const local = ["1", "deleted"].map((id) => ({ id, title: id, category: "urgent-important" }));
    const remote = [{ id: "keep", title: "Keep", category: "urgent-important" }];
    localStorage.setItem("aero_todos", JSON.stringify(local));
    localStorage.setItem("tongyun_cat_ver_tasks", "30");
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command !== "webdav_download_meta") return null;
      const filename = String((args as Record<string, unknown>).filename);
      return {
        content: JSON.stringify(
          filename.endsWith("manifest.json") ? { tasks: { version: 100 } } : remote,
        ),
        etag: "new",
        lastModified: null,
      };
    });
    const result = await provider.pull(new Set<"tasks">(dirty ? ["tasks"] : []));
    expect(result?.tasks).toEqual(dirty ? local : remote);
  },
);

it("keeps real local tasks on an unversioned migration without reintroducing sample IDs", async () => {
  const provider = new WebDAVProvider(config);
  const real = { id: "legacy-real", title: "Legacy", category: "urgent-important" };
  const remote = { id: "remote", title: "Remote", category: "urgent-important" };
  localStorage.setItem("aero_todos", JSON.stringify([{ ...real, id: "1" }, real]));
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command !== "webdav_download_meta") return null;
    const filename = String((args as Record<string, unknown>).filename);
    return {
      content: JSON.stringify(
        filename.endsWith("manifest.json") ? { tasks: { version: 100 } } : [remote],
      ),
      etag: "new",
      lastModified: null,
    };
  });
  expect((await provider.pull())?.tasks).toEqual([real, remote]);
});
