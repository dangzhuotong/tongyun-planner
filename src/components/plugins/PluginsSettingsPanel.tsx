import React from "react";
import { Blocks, CheckCircle2, Power, Sparkles } from "lucide-react";
import { usePluginRegistry } from "../../plugins/core/registry";
import type { PluginCategory } from "../../plugins/core/types";

const CATEGORY_NAMES: Record<PluginCategory, string> = {
  workflow: "工作流协同",
  ai: "AI 智能",
  integration: "外部数据集成",
  tool: "效能工具",
};

interface Props {
  triggerToast?: (text: string, type: "success" | "error") => void;
}

export const PluginsSettingsPanel: React.FC<Props> = ({ triggerToast }) => {
  const { allPlugins, isEnabled, toggle } = usePluginRegistry();

  const handleToggle = (id: string, name: string) => {
    toggle(id);
    const active = isEnabled(id);
    // Note: state toggles synchronously in registry
    triggerToast?.(
      active ? `已停用插件「${name}」` : `已激活插件「${name}」`,
      "success",
    );
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
              微内核架构
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            按需开启团队派工、外部系统对接或 AI 助手插件。关闭插件时零网络轮询与后台开销，手帐始终保持纯粹与敏捷。
          </p>
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
                    {plugin.manifest.icon || <Blocks className="w-5 h-5" />}
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
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {plugin.manifest.description}
                    </p>
                  </div>
                </div>

                {/* 状态与开关 */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
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

      {/* 预告 / 自定义插件引导 */}
      <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-[#2D3039] bg-slate-50/40 dark:bg-[#16171B]/30 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>正在设计中的生态插件：本地大模型助手、业务系统快捷嵌入 (TD Portal)、浏览器自动化桥接...</span>
        </div>
      </div>
    </div>
  );
};
