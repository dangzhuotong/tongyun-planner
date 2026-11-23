import { useState } from "react";
import { useTranslation } from "../../i18n/LanguageContext";
import { usePluginHost } from "../../plugins/host/PluginHostContext";
import type { PluginStatus } from "../../plugins/host/types";

const PERMISSION_LABEL: Record<string, string> = {
  "storage:read": "读取自己的本机键",
  "storage:write": "写入自己的本机键",
  "tasks:write": "存成任务",
  "journal:write": "写入日记",
  "commands:register": "注册命令",
};

function statusLabel(status: PluginStatus, reason?: string): string {
  if (status === "enabled") return "已启用";
  if (status === "disabled") return "已停用";
  if (status === "failed") return reason ? `加载失败：${reason}` : "加载失败";
  if (status === "incompatible") return reason ? `不兼容：${reason}` : "不兼容";
  return reason ? `清单无效：${reason}` : "清单无效";
}

export function PluginsSettingsPanel() {
  const { t } = useTranslation();
  const { host, revision, setEnabled, retry } = usePluginHost();
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);
  const rows = host.list();
  const settingsPlugin = rows.find(
    (row) => row.plugin.manifest.id === openSettingsId && row.status === "enabled",
  );
  const settingsApi = settingsPlugin ? host.viewApi(settingsPlugin.plugin.manifest.id) : null;
  const settingsNode =
    settingsApi && settingsPlugin
      ? (settingsPlugin.plugin.renderSettings?.(settingsApi) ?? null)
      : null;

  if (settingsNode && settingsPlugin) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setOpenSettingsId(null)}
          className="text-xs font-bold text-slate-500 underline"
        >
          返回插件列表
        </button>
        <h3 className="font-bold text-slate-800 dark:text-slate-100">
          {settingsPlugin.plugin.manifest.name}
        </h3>
        {settingsNode}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-revision={revision}>
      <div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100">
          {t.settings.plugins || "插件"}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          列表来自内置注册表，不是单独写死的一页开关。停用只隐藏入口，不删除插件数据。这里没有导入
          zip 或脚本。同一进程里的权限只约束宿主交出的函数，不是安全沙箱。
        </p>
      </div>
      {rows.map((row) => {
        const manifest = row.plugin.manifest;
        const switchable =
          row.status === "enabled" || row.status === "disabled" || row.status === "failed";
        const checked = row.status === "enabled";
        return (
          <div
            key={manifest.id}
            className="rounded-2xl border border-[#EFEBE4] dark:border-[#33353A] p-4 bg-white/70 dark:bg-[#1C1D21]"
          >
            <div className="flex items-start gap-3">
              <div className="flex-grow min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    {manifest.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">v{manifest.version}</span>
                  <span className="text-[11px] font-mono text-slate-400">{manifest.id}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {manifest.description}
                </p>
                <p className="text-xs mt-2 text-slate-600 dark:text-slate-300">
                  {statusLabel(row.status, row.reason)}
                </p>
                {manifest.permissions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {manifest.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-[#FAF8F5] dark:bg-[#252830] text-slate-500"
                      >
                        {PERMISSION_LABEL[permission] ?? permission}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  {row.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => retry(manifest.id)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#252830]"
                    >
                      再试一次
                    </button>
                  )}
                  {row.status === "enabled" && row.plugin.renderSettings && (
                    <button
                      type="button"
                      onClick={() => setOpenSettingsId(manifest.id)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#252830]"
                    >
                      设置
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={`${manifest.name} 启停`}
                disabled={!switchable}
                onClick={() => setEnabled(manifest.id, !checked)}
                className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-40 ${
                  checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    checked ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
