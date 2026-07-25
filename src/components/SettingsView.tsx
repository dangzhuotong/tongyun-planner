import React, { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import type { CustomizationConfig, AlertSoundType } from "../types";
import { useTranslation } from "../i18n/LanguageContext";
import { PersonalizationPanel } from "./personalization/PersonalizationPanel";
import { SunsetPanel } from "./sunset/SunsetPanel";
import { AISettingsPanel } from "./ai/AISettingsPanel";
import { EmailSettingsPanel } from "./email/EmailSettingsPanel";
import { SyncSettingsPanel } from "./sync/SyncSettingsPanel";
import { SystemSettingsPanel } from "./system/SystemSettingsPanel";
import { FunSettingsPanel } from "./fun/FunSettingsPanel";

interface SettingsViewProps {
  config: CustomizationConfig;
  onChange: (newConfig: CustomizationConfig) => void;
  alertSoundType: AlertSoundType;
  setAlertSoundType: (type: AlertSoundType) => void;
  resetTasks: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = React.memo(({
  config,
  onChange,
  alertSoundType,
  setAlertSoundType,
  resetTasks,
}) => {
  const { t } = useTranslation();
  const s = t.settings;
  const [subTab, setSubTab] = useState<"personalization" | "ai" | "sunset" | "sync" | "system" | "fun" | "email">("personalization");
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type: "success" | "error" }>>([]);
  const toastIdRef = useRef(0);

  const triggerToast = useCallback((text: string, type: "success" | "error") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === "error" ? 8000 : 3000);
  }, []);

  const TABS = [
    { id: "personalization", label: s.personalization, keywords: ["个性化", "装扮", "主题", "颜色", "字体", "纹理", "别针", "毛玻璃", "水彩", "personalize", "theme", "color"] },
    { id: "sunset", label: s.sunset, keywords: ["日落", "护眼", "暖色", "色温", "sunset", "warm"] },
    { id: "ai", label: s.ai, keywords: ["ai", "模型", "接口", "智能", "分类", "暖评", "openai", "anthropic", "deepseek", "opencode"] },
    { id: "email", label: s.emailTitle, keywords: ["邮件", "邮箱", "smtp", "提醒", "email", "mail"] },
    { id: "sync", label: s.sync, keywords: ["同步", "备份", "webdav", "坚果云", "云端", "sync", "backup"] },
    { id: "fun", label: s.fun, keywords: ["趣味", "夸夸", "庆祝", "fun", "celebration"] },
    { id: "system", label: s.system, keywords: ["系统", "语言", "声音", "通知", "白噪音", "重置", "system", "sound", "language", "reset"] },
  ];

  const filteredTabs = searchQuery.trim()
    ? TABS.filter(tab => {
        const q = searchQuery.toLowerCase();
        return tab.label.toLowerCase().includes(q) || tab.keywords.some(kw => kw.toLowerCase().includes(q));
      })
    : TABS;

  // auto-switch to only match
  useEffect(() => {
    if (searchQuery.trim() && filteredTabs.length === 1 && subTab !== filteredTabs[0].id) {
      setSubTab(filteredTabs[0].id as any);
    }
  }, [searchQuery, filteredTabs, subTab]);

  return (
    <div className="animate-fade-in-up flex-grow select-none">
      <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 shadow-sm">
        {/* 设置搜索 */}
        <div className="relative mb-5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索设置…"
            className="w-full pl-4 pr-10 py-2.5 text-sm bg-[#FAF8F5]/80 border border-[#EFEBE4] rounded-xl outline-none focus:border-[#C4D7B2] focus:ring-2 focus:ring-[#C4D7B2]/20 transition-all placeholder:text-slate-400 dark:bg-[#2A2A2A]/80 dark:border-[#3A3A3A] dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-[#6FAD84] dark:focus:ring-[#6FAD84]/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 标签导航 */}
        <div className="flex flex-wrap gap-2 mb-5">
          {filteredTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
                subTab === tab.id
                  ? "bg-[#2D323A] text-white shadow-md"
                  : "bg-[#FAF8F5] text-slate-600 hover:bg-[#F0EDE7] dark:bg-[#2A2A2A] dark:text-slate-400 dark:hover:bg-[#333]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 面板内容 */}
        {subTab === "personalization" && (
          <PersonalizationPanel config={config} onChange={onChange} />
        )}
        {subTab === "sunset" && (
          <SunsetPanel config={config} onChange={onChange} />
        )}
        {subTab === "ai" && (
          <AISettingsPanel config={config} onChange={onChange} triggerToast={triggerToast} />
        )}
        {subTab === "email" && (
          <EmailSettingsPanel triggerToast={triggerToast} />
        )}
        {subTab === "sync" && (
          <SyncSettingsPanel config={config} onChange={onChange} triggerToast={triggerToast} />
        )}
        {subTab === "system" && (
          <SystemSettingsPanel
            config={config}
            onChange={onChange}
            alertSoundType={alertSoundType}
            setAlertSoundType={setAlertSoundType}
            resetTasks={resetTasks}
            triggerToast={triggerToast}
          />
        )}
        {subTab === "fun" && (
          <FunSettingsPanel config={config} onChange={onChange} />
        )}

        {/* Toast 队列 */}
        {toasts.length > 0 && (
          <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
              <div
                key={toast.id}
                className={`pointer-events-auto px-4 py-2.5 rounded-xl shadow-lg text-sm font-bold animate-slide-up ${
                  toast.type === "success"
                    ? "bg-emerald-500 text-white"
                    : "bg-red-500 text-white"
                }`}
              >
                {toast.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
