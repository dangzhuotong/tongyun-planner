import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../../i18n/LanguageContext";
import { isDesktopRuntime } from "../../utils/tauriRuntime";

const operations = [
  "list_tasks",
  "create_task",
  "list_notes",
  "create_note",
  "list_journal",
  "create_journal",
] as const;
type Operation = (typeof operations)[number];
type Settings = {
  clients: { client: string; allow: Operation[] }[];
  audit: {
    time: number;
    requestId: string;
    client: string;
    operation: Operation | null;
    outcome: string;
  }[];
  listening: boolean;
};

export function AgentSettingsPanel() {
  const { locale } = useTranslation();
  const en = locale === "en";
  const labels: Record<Operation, string> = en
    ? {
        list_tasks: "Read tasks",
        create_task: "Create tasks",
        list_notes: "Read notes",
        create_note: "Create notes",
        list_journal: "Read journal",
        create_journal: "Create journal entries",
      }
    : {
        list_tasks: "查询任务",
        create_task: "创建任务",
        list_notes: "查询便签",
        create_note: "创建便签",
        list_journal: "查询日记",
        create_journal: "创建日记",
      };
  const [settings, setSettings] = useState<Settings>();
  const [client, setClient] = useState("");
  const [allow, setAllow] = useState<Operation[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => setSettings(await invoke<Settings>("agent_api_settings"));
  useEffect(() => {
    if (isDesktopRuntime()) void refresh().catch((err) => setError(String(err)));
  }, []);
  if (!isDesktopRuntime())
    return (
      <p>{en ? "Agent access is available in the desktop app." : "请在桌面版管理 Agent 授权。"}</p>
    );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const control = "rounded-lg border border-[#EFEBE4] dark:border-[#383D4A] px-3 py-2";
  return (
    <div className="space-y-5 text-sm text-slate-700 dark:text-slate-200">
      <p>
        {settings?.listening
          ? en
            ? "Listening at 127.0.0.1:17321"
            : "接口地址 127.0.0.1:17321"
          : en
            ? "Local API inactive"
            : "本机接口未启用"}
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await invoke<{ token: string; listening: boolean }>("agent_api_grant", {
              client: client.trim(),
              allow,
            });
            setToken(result.token);
            setClient("");
            setAllow([]);
            if (!result.listening)
              setError(
                en
                  ? "Grant saved. Port 17321 is unavailable."
                  : "授权已保存，端口 17321 未能开启。",
              );
          });
        }}
      >
        <label className="block">
          <span className="block mb-1">{en ? "Client name" : "客户端名称"}</span>
          <input
            className={control}
            required
            pattern="[A-Za-z0-9._-]+"
            maxLength={64}
            value={client}
            onChange={(event) => setClient(event.target.value)}
          />
        </label>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-2">{en ? "Allowed operations" : "允许的操作"}</legend>
          {operations.map((op) => (
            <label className="flex gap-1.5 items-center" key={op}>
              <input
                type="checkbox"
                checked={allow.includes(op)}
                onChange={(event) => {
                  setAllow((previous) =>
                    event.target.checked
                      ? [...previous, op]
                      : previous.filter((item) => item !== op),
                  );
                }}
              />
              {labels[op]}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={busy || !settings || !allow.length}
          className="rounded-lg bg-[#4D7C5D] text-white px-3 py-2 disabled:opacity-50"
        >
          {en ? "Create grant" : "创建授权"}
        </button>
      </form>
      {token && (
        <div className="space-y-2">
          <p>
            {en
              ? "Save this token. It is shown only once."
              : "请保存令牌。本次关闭后将无法再次查看。"}
          </p>
          <input
            aria-label={en ? "New token" : "新令牌"}
            className={`${control} w-full font-mono`}
            value={token}
            readOnly
            onFocus={(event) => event.target.select()}
          />
          <button className={control} type="button" onClick={() => setToken("")}>
            {en ? "Hide token" : "隐藏令牌"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
      <section>
        <h3 className="mb-2">{en ? "Authorized clients" : "已授权客户端"}</h3>
        {settings?.clients.length === 0 && <p>{en ? "No clients" : "暂无授权"}</p>}
        {settings?.clients.map((entry) => (
          <div
            key={entry.client}
            className="flex justify-between gap-3 py-2 border-b border-[#EFEBE4] dark:border-[#383D4A]"
          >
            <div className="min-w-0 break-all">
              {entry.client}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {entry.allow.map((op) => labels[op]).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              className={control}
              disabled={busy}
              onClick={() => void run(() => invoke("agent_api_revoke", { client: entry.client }))}
            >
              {en ? "Revoke" : "撤销"}
            </button>
          </div>
        ))}
      </section>
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3>{en ? "Recent operations" : "近期操作记录"}</h3>
          <button
            className={control}
            type="button"
            disabled={busy}
            onClick={() => void run(async () => {})}
          >
            {en ? "Refresh" : "刷新"}
          </button>
        </div>
        {settings?.audit.length === 0 && <p>{en ? "No operations yet" : "暂无操作记录"}</p>}
        <ul className="max-h-64 overflow-y-auto space-y-2 text-xs">
          {settings?.audit.map((row, index) => (
            <li key={`${row.requestId}-${index}`} title={row.requestId} className="break-all">
              {new Date(row.time).toLocaleString()} · {row.client} ·{" "}
              {row.operation ? labels[row.operation] : "—"} · {row.outcome}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
