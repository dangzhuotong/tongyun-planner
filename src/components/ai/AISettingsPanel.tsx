import React, { useState } from "react";
import { Sparkles, Save, Link2, RefreshCw } from "lucide-react";
import type { CustomizationConfig } from "../../types";
import { testAIConnection, fetchAvailableModels } from "../../utils/aiEngine";
import { buildDefaultCommentPrompt } from "../JournalView";
import { useTranslation } from "../../i18n/LanguageContext";

interface AISettingsPanelProps {
  config: CustomizationConfig;
  onChange: (c: CustomizationConfig) => void;
  triggerToast: (text: string, type: "success" | "error") => void;
}

const AI_PROVIDER_PRESETS: { id: string; label: string; endpoint: string; keyRequired: boolean; defaultModel: string; badge?: string }[] = [
  { id: "opencode", label: "OpenCode", endpoint: "https://opencode.ai/zen/v1", keyRequired: false, defaultModel: "deepseek-v4-flash-free", badge: "免费" },
  { id: "openai", label: "OpenAI", endpoint: "https://api.openai.com/v1", keyRequired: true, defaultModel: "gpt-4o" },
  { id: "anthropic", label: "Anthropic", endpoint: "https://api.anthropic.com/v1/messages", keyRequired: true, defaultModel: "claude-3-5-sonnet-20241022" },
  { id: "deepseek", label: "DeepSeek", endpoint: "https://api.deepseek.com/v1", keyRequired: true, defaultModel: "deepseek-chat" },
  { id: "ollama", label: "Ollama", endpoint: "http://127.0.0.1:11434/v1", keyRequired: false, defaultModel: "llama3" },
  { id: "custom", label: "自定义", endpoint: "", keyRequired: false, defaultModel: "" },
];

export const AISettingsPanel: React.FC<AISettingsPanelProps> = ({ config, onChange, triggerToast }) => {
  const { t } = useTranslation();
  const s = t.settings;

  const [isAiTesting, setIsAiTesting] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const currentProvider = config.aiProvider || "openai";
  const currentApiKey = config.providerApiKeys?.[currentProvider]?.trim() || config.aiApiKey?.trim() || "";

  const handleChange = <K extends keyof CustomizationConfig>(key: K, value: CustomizationConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const handleSaveAiConfig = () => {
    onChange({ ...config });
    triggerToast(s.aiConfigSaved, "success");
  };

  const handleTestAiConnection = async () => {
    if (!currentApiKey && config.aiProvider !== "opencode" && config.aiProvider !== "ollama") {
      triggerToast(s.aiFillKey, "error");
      return;
    }
    if (config.aiModel === "custom" || !config.aiModel?.trim()) {
      triggerToast(s.aiFillModel, "error");
      return;
    }
    setIsAiTesting(true);
    try {
      const reply = await testAIConnection(config);
      triggerToast(`${s.aiTestSuccess}${reply.slice(0, 40)}${reply.length > 40 ? "…" : ""}`, "success");
    } catch (e: any) {
      console.error(e);
      triggerToast(`${s.aiTestFail}: ${e.message || e}`, "error");
    } finally {
      setIsAiTesting(false);
    }
  };

  return (
    <div className="space-y-4 flex-grow overflow-y-auto max-h-[520px] pr-1 custom-scrollbar">
      <div className="bg-[#FAF5ED] border border-[#EFE5D3] p-4 rounded-2xl flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-[#8B6E3C] mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed font-medium">
          <strong>🤖 AI 智能优先级分类助手</strong>
          <p className="mt-1">{s.aiDesc}</p>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl border border-[#EFEBE4] bg-white/50">
        <div>
          <span className="text-xs font-bold text-slate-700 block">{s.aiAutoToggle}</span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">{s.aiAutoToggleDesc}</span>
        </div>
        <input
          type="checkbox"
          checked={config.aiAutoCategorize || false}
          onChange={(e) => handleChange("aiAutoCategorize", e.target.checked)}
          className="w-4 h-4 accent-[#4D7C5D] cursor-pointer"
        />
      </div>

      {/* 提供商预设 */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase block">{s.aiProvider}</label>
        <div className="flex flex-wrap gap-1.5">
          {AI_PROVIDER_PRESETS.map((preset) => {
            const isSelected = preset.id !== "custom"
              ? config.aiProvider === preset.id
              : config.aiProvider !== "anthropic" && config.aiProvider !== "opencode" && config.aiProvider !== "openai" && config.aiProvider !== "deepseek" && config.aiProvider !== "ollama";
            return (
              <button key={preset.id}
                onClick={() => {
                  const updates: Partial<CustomizationConfig> = { aiProvider: preset.id as any };
                  if (preset.endpoint) updates.aiEndpoint = preset.endpoint;
                  if (preset.defaultModel) updates.aiModel = preset.defaultModel;
                  onChange({ ...config, ...updates });
                }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold border transition-all cursor-pointer hover:scale-105 active:scale-95 ${isSelected ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs" : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"}`}
              >
                {preset.label}{preset.badge ? <span className="ml-1 text-[8px] opacity-60">({preset.badge})</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* API 地址 */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase block">{s.aiEndpoint}</label>
        <input type="text" placeholder="https://api.openai.com/v1" value={config.aiEndpoint || ""}
          onChange={(e) => handleChange("aiEndpoint", e.target.value)}
          className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
        />
      </div>

      {/* API Key */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase block">
          {AI_PROVIDER_PRESETS.find(p => p.id === config.aiProvider)?.label || config.aiProvider} {s.aiApiKey}
          {!AI_PROVIDER_PRESETS.find(p => p.id === config.aiProvider)?.keyRequired && (
            <span className="text-[9px] text-slate-400 font-medium ml-1">(可选)</span>
          )}
        </label>
        <input type="password"
          placeholder={config.aiProvider === "opencode" || config.aiProvider === "ollama" ? "此提供商可不填 API Key" : "sk-..."}
          value={config.providerApiKeys?.[config.aiProvider || "openai"] || ""}
          onChange={(e) => onChange({
            ...config,
            providerApiKeys: { ...config.providerApiKeys, [config.aiProvider || "openai"]: e.target.value }
          })}
          className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
        />
      </div>

      {/* 模型名称 + 获取列表 */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase block">{s.aiModel}</label>
        <div className="flex gap-2">
          <input type="text" placeholder="deepseek-v4-flash-free" value={config.aiModel || ""}
            onChange={(e) => handleChange("aiModel", e.target.value)}
            className="flex-1 bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
          />
          <button onClick={async () => {
              setIsFetchingModels(true);
              try {
                const models = await fetchAvailableModels(config.aiEndpoint!, currentApiKey);
                setFetchedModels(models);
                if (models.length > 0) triggerToast(`获取到 ${models.length} 个可用模型`, "success");
                else triggerToast("未获取到模型列表", "error");
              } catch (e: any) {
                triggerToast(`获取失败: ${e.message || e}`, "error");
              }
              setIsFetchingModels(false);
            }}
            disabled={!config.aiEndpoint || isFetchingModels}
            className="px-3 py-1.5 rounded-xl border border-[#C4D7B2] text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#E4EEE6] text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${isFetchingModels ? "animate-spin" : ""}`} />获取列表
          </button>
        </div>
        {fetchedModels.length > 0 && (
          <div className="mt-2 p-2 rounded-xl border border-[#DEEAE2] bg-[#F0F5F1]/50 max-h-[180px] overflow-y-auto custom-scrollbar">
            <div className="flex flex-wrap gap-1">{fetchedModels.map((m) => (
              <button key={m} onClick={() => handleChange("aiModel", m)}
                className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${config.aiModel === m ? "bg-[#4D7C5D] text-white border-[#4D7C5D]" : "bg-white text-slate-600 border-[#EFEBE4] hover:border-[#4D7C5D]"}`}
              >{m}</button>
            ))}</div>
          </div>
        )}
      </div>


      {/* 保存 & 测试连接 */}
      <div className="flex gap-3 pt-1 sticky bottom-0 bg-white/90 pb-1">
        <button type="button" onClick={handleSaveAiConfig}
          className="flex-1 bg-[#4D7C5D] hover:bg-[#3F684C] text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 transition-all shadow-xs"
        ><Save className="w-3.5 h-3.5" />{s.aiSave}</button>
        <button type="button" onClick={handleTestAiConnection} disabled={isAiTesting}
          className="flex-1 bg-[#8B6E3C] hover:bg-[#725A31] disabled:bg-slate-300 text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 transition-all shadow-xs"
        >{isAiTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}{s.aiTest}</button>
      </div>

      {/* 暖评系统提示词 */}
      <div className="pt-3 border-t border-[#EFEBE4]">
        <div className="bg-[#FAF8F5]/80 border border-[#EFEBE4] p-3 rounded-xl space-y-2">
          <div>
            <label className="text-[10px] font-bold text-[#8B6E3C] uppercase block">{s.journalPromptTitle}</label>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{s.journalPromptDesc}</p>
          </div>
          <textarea value={config.journalCommentPrompt || ""} onChange={(e) => handleChange("journalCommentPrompt", e.target.value)}
            placeholder={s.journalPromptPlaceholder} rows={6}
            className="w-full bg-white border border-[#EFEBE4] px-2.5 py-2 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] resize-y leading-relaxed custom-scrollbar"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => handleChange("journalCommentPrompt", buildDefaultCommentPrompt("${lang}"))}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-[#C4D7B2] text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#E4EEE6] cursor-pointer transition-colors"
            >{s.journalPromptFillDefault}</button>
            {config.journalCommentPrompt && (
              <button type="button" onClick={() => handleChange("journalCommentPrompt", "")}
                className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] cursor-pointer transition-colors"
              >{s.journalPromptReset}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
