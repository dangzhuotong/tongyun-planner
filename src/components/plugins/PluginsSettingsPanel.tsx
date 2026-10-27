import React, { useState, useRef } from "react";
import {
  Blocks,
  CheckCircle2,
  Power,
  Sparkles,
  UploadCloud,
  Download,
  Trash2,
  Database,
  FileArchive,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { usePluginRegistry } from "../../plugins/core/registry";
import {
  installZipPlugin,
  uninstallDynamicPlugin,
  exportPluginZip,
  generateQuickNotesSampleZip,
} from "../../plugins/core/zipLoader";
import type { PluginCategory } from "../../plugins/core/types";

const CATEGORY_NAMES: Record<PluginCategory, string> = {
  workflow: "工作流协同",
  ai: "AI 智能",
  integration: "外部数据集成",
  tool: "效能工具",
  media: "自媒体创作",
  custom: "自定义扩展",
};

interface Props {
  triggerToast?: (text: string, type: "success" | "error") => void;
}

export const PluginsSettingsPanel: React.FC<Props> = ({ triggerToast }) => {
  const { allPlugins, isEnabled, toggle } = usePluginRegistry();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleToggle = (id: string, name: string) => {
    toggle(id);
    const active = isEnabled(id);
    triggerToast?.(
      active ? `已停用插件「${name}」` : `已激活插件「${name}」`,
      "success",
    );
  };

  // 处理拖拽上传
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processUploadedFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processUploadedFile(files[0]);
      e.target.value = ""; // 重置以便再次选择同一文件
    }
  };

  // 执行插件包解压与安装流程
  const processUploadedFile = async (file: File) => {
    if (!file.name.endsWith(".zip") && !file.name.endsWith(".json")) {
      triggerToast?.("请上传 .zip 插件压缩包或 manifest.json 描述文件", "error");
      return;
    }

    try {
      setImporting(true);
      const plugin = await installZipPlugin(file);
      triggerToast?.(`成功导入并激活插件「${plugin.manifest.name}」！`, "success");
    } catch (err) {
      console.error("Plugin install failed:", err);
      triggerToast?.(
        `插件安装失败: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setImporting(false);
    }
  };

  // 一键生成并体验官方示例插件
  const handleInstallSampleDemo = async () => {
    try {
      setDemoLoading(true);
      const sampleZipBlob = await generateQuickNotesSampleZip();
      const plugin = await installZipPlugin(sampleZipBlob);
      triggerToast?.(`官方示例「${plugin.manifest.name}」安装成功！`, "success");
    } catch (err) {
      triggerToast?.(`安装示例插件失败: ${String(err)}`, "error");
    } finally {
      setDemoLoading(false);
    }
  };

  // 卸载动态插件
  const handleUninstall = (id: string, name: string) => {
    if (confirm(`确认卸载插件「${name}」吗？`)) {
      uninstallDynamicPlugin(id);
      triggerToast?.(`已成功卸载插件「${name}」`, "success");
    }
  };

  // 导出插件 .zip
  const handleExportZip = async (id: string, name: string) => {
    try {
      const blob = await exportPluginZip(id);
      if (!blob) {
        triggerToast?.("无法导出内置或缺失原包的插件", "error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}-plugin.zip`;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast?.(`已导出插件「${name}」为 .zip`, "success");
    } catch (err) {
      triggerToast?.(`导出失败: ${String(err)}`, "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-700 dark:text-slate-200">
      {/* 顶部标题栏 */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-[#4D7C5D]/5 to-transparent border border-emerald-500/20 dark:border-emerald-500/10 flex items-start gap-3.5">
        <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm shrink-0">
          <Blocks className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              插件扩展中心 (Plugin Hub)
            </h3>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
              微内核架构 · 支持 .zip 动态导入
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            支持拖拽导入第三方 .zip 插件包与独立 SQLite
            数据库隔离。所有扩展完全热插拔，关闭时零后台网络与进程消耗。
          </p>
        </div>
      </div>

      {/* 拖拽上传区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
          isDragging
            ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
            : "border-slate-200 dark:border-[#2D3039] hover:border-emerald-500/50 bg-white/50 dark:bg-[#1A1C22]/50 hover:bg-slate-50/80 dark:hover:bg-[#1E2028]/80"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mb-2">
          {importing ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <UploadCloud className="w-6 h-6" />
          )}
        </div>

        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
          {importing ? "正在解压并挂载插件..." : "拖拽 .zip 插件包至此处，或点击浏览本地文件"}
        </h4>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-md">
          包内需包含 manifest.json，可自带独立的 SQLite 表结构声明与 HTML/JS 界面。无需重新编译主程序。
        </p>

        {/* 快速体验官方示例按钮 */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#252830] w-full flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={demoLoading}
            onClick={(e) => {
              e.stopPropagation();
              handleInstallSampleDemo();
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252830] dark:hover:bg-[#2F323D] text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            {demoLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span>体验官方示例：灵感便签库 (.zip 演练)</span>
          </button>
        </div>
      </div>

      {/* 插件列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
          <span>已安装插件 ({allPlugins.length})</span>
          <span className="text-[11px] text-slate-400">热插拔 · 即开即用</span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {allPlugins.map((plugin) => {
            const active = isEnabled(plugin.manifest.id);
            const isDynamic = plugin.manifest.isDynamic;
            const dbType = plugin.manifest.database?.type;

            return (
              <div
                key={plugin.manifest.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  active
                    ? "bg-white dark:bg-[#1A1C22] border-slate-200/80 dark:border-[#2D3039] shadow-sm"
                    : "bg-slate-50/60 dark:bg-[#16171B]/60 border-slate-200/40 dark:border-[#22242A] opacity-75"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                      active
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-200/50 dark:bg-[#252830] text-slate-400"
                    }`}
                  >
                    {plugin.manifest.icon ? (
                      typeof plugin.manifest.icon === "string" ? (
                        <span className="text-lg leading-none">{plugin.manifest.icon}</span>
                      ) : (
                        plugin.manifest.icon
                      )
                    ) : (
                      <Blocks className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {plugin.manifest.name}
                      </h4>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#262830] text-slate-500 dark:text-slate-400">
                        v{plugin.manifest.version}
                      </span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300">
                        {CATEGORY_NAMES[plugin.manifest.category] || plugin.manifest.category}
                      </span>

                      {/* 数据库与架构标识 */}
                      {dbType === "sqlite" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-0.5">
                          <Database className="w-2.5 h-2.5" />
                          独立 SQLite
                        </span>
                      )}
                      {dbType === "remote" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-0.5">
                          <Database className="w-2.5 h-2.5" />
                          远端数据库
                        </span>
                      )}
                      {dbType === "shared" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          共享主库
                        </span>
                      )}
                      {isDynamic && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-300 flex items-center gap-0.5">
                          <FileArchive className="w-2.5 h-2.5" />
                          外部导入
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {plugin.manifest.description}
                    </p>
                  </div>
                </div>

                {/* 操作栏：开关 + 导出 + 卸载 */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  {/* 导出 .zip */}
                  {isDynamic && (
                    <button
                      onClick={() =>
                        handleExportZip(plugin.manifest.id, plugin.manifest.name)
                      }
                      title="导出此插件压缩包"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252830] transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* 卸载动态插件 */}
                  {isDynamic && (
                    <button
                      onClick={() =>
                        handleUninstall(plugin.manifest.id, plugin.manifest.name)
                      }
                      title="卸载插件"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* 激活状态 */}
                  <span
                    className={`text-[10px] font-bold flex items-center gap-1 ${
                      active
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {active ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        已激活
                      </>
                    ) : (
                      <>
                        <Power className="w-3 h-3" />
                        未启用
                      </>
                    )}
                  </span>

                  {/* 切换开关 */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    onClick={() => handleToggle(plugin.manifest.id, plugin.manifest.name)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      active ? "bg-emerald-600" : "bg-slate-300 dark:bg-[#33353A]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        active ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 帮助与说明 */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#2D3039] bg-slate-50/40 dark:bg-[#16171B]/30 flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400">
        <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            如何编写自己的插件包？
          </p>
          <p className="leading-relaxed">
            新建一个文件夹，包含 <code className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-[#282B34] text-slate-800 dark:text-slate-200 font-mono text-[10px]">manifest.json</code> 并在
            database 中声明 <code className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-[#282B34] text-slate-800 dark:text-slate-200 font-mono text-[10px]">type: "sqlite"</code> 与 <code className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-[#282B34] text-slate-800 dark:text-slate-200 font-mono text-[10px]">initSql</code>。若需要自定义界面，可放入
            <code className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-[#282B34] text-slate-800 dark:text-slate-200 font-mono text-[10px]">index.html</code> 并通过 <code className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-[#282B34] text-slate-800 dark:text-slate-200 font-mono text-[10px]">window.tongyun.db.select(...)</code> 访问数据库。压缩为 .zip 后拖拽至此处即可即插即用！
          </p>
        </div>
      </div>
    </div>
  );
};
