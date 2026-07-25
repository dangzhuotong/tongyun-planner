import React from "react";
import { Heart, Sparkles } from "lucide-react";
import type { CustomizationConfig } from "../../types";
import { PLANNER_COLORS } from "../../constants";
import { StickyPin } from "../StickyPin";
import { audioEngine } from "../../utils/audioEngine";
import { useSetting } from "../../hooks/useSetting";
import { useTranslation } from "../../i18n/LanguageContext";

const THEME_PRESETS = [
  {
    id: "mint-light",
    name: "Mint Light (抹茶绿 浅色)",
    darkMode: "light" as const,
    qColors: {
      "urgent-important": "rose",
      "important-not-urgent": "mint",
      "urgent-not-important": "sky",
      "not-urgent-not-important": "yellow",
    },
    previewColors: ["#E8A0BF", "#C4D7B2", "#B2C8DF", "#E0A934"],
  },
  {
    id: "lemon-light",
    name: "Lemon Light (甘菊黄 浅色)",
    darkMode: "light" as const,
    qColors: {
      "urgent-important": "coral",
      "important-not-urgent": "yellow",
      "urgent-not-important": "mint",
      "not-urgent-not-important": "sky",
    },
    previewColors: ["#E57C58", "#E0A934", "#C4D7B2", "#B2C8DF"],
  },
  {
    id: "rose-light",
    name: "Rose Light (蜜桃粉 浅色)",
    darkMode: "light" as const,
    qColors: {
      "urgent-important": "rose",
      "important-not-urgent": "lavender",
      "urgent-not-important": "coral",
      "not-urgent-not-important": "yellow",
    },
    previewColors: ["#E8A0BF", "#9B7EC9", "#E57C58", "#E0A934"],
  },
  {
    id: "sky-light",
    name: "Sky Light (天空蓝 浅色)",
    darkMode: "light" as const,
    qColors: {
      "urgent-important": "sky",
      "important-not-urgent": "mint",
      "urgent-not-important": "lavender",
      "not-urgent-not-important": "yellow",
    },
    previewColors: ["#B2C8DF", "#C4D7B2", "#9B7EC9", "#E0A934"],
  },
  {
    id: "lavender-light",
    name: "Lavender Light (香芋紫 浅色)",
    darkMode: "light" as const,
    qColors: {
      "urgent-important": "lavender",
      "important-not-urgent": "rose",
      "urgent-not-important": "sky",
      "not-urgent-not-important": "mint",
    },
    previewColors: ["#9B7EC9", "#E8A0BF", "#B2C8DF", "#C4D7B2"],
  },
  {
    id: "mint-dark",
    name: "Mint Dark (抹茶绿 深色)",
    darkMode: "dark" as const,
    qColors: {
      "urgent-important": "rose",
      "important-not-urgent": "mint",
      "urgent-not-important": "sky",
      "not-urgent-not-important": "yellow",
    },
    previewColors: ["#D48AAA", "#6FAD84", "#8AACCC", "#D4C060"],
  },
  {
    id: "lemon-dark",
    name: "Lemon Dark (甘菊黄 深色)",
    darkMode: "dark" as const,
    qColors: {
      "urgent-important": "coral",
      "important-not-urgent": "yellow",
      "urgent-not-important": "mint",
      "not-urgent-not-important": "sky",
    },
    previewColors: ["#E57C58", "#D4C060", "#6FAD84", "#8AACCC"],
  },
  {
    id: "rose-dark",
    name: "Rose Dark (蜜桃粉 深色)",
    darkMode: "dark" as const,
    qColors: {
      "urgent-important": "rose",
      "important-not-urgent": "lavender",
      "urgent-not-important": "coral",
      "not-urgent-not-important": "yellow",
    },
    previewColors: ["#D48AAA", "#B8A0D8", "#E57C58", "#D4C060"],
  },
  {
    id: "sky-dark",
    name: "Sky Dark (天空蓝 深色)",
    darkMode: "dark" as const,
    qColors: {
      "urgent-important": "sky",
      "important-not-urgent": "mint",
      "urgent-not-important": "lavender",
      "not-urgent-not-important": "yellow",
    },
    previewColors: ["#8AACCC", "#6FAD84", "#B8A0D8", "#D4C060"],
  },
  {
    id: "lavender-dark",
    name: "Lavender Dark (香芋紫 深色)",
    darkMode: "dark" as const,
    qColors: {
      "urgent-important": "lavender",
      "important-not-urgent": "rose",
      "urgent-not-important": "sky",
      "not-urgent-not-important": "mint",
    },
    previewColors: ["#B8A0D8", "#D48AAA", "#8AACCC", "#6FAD84"],
  },
];

interface PersonalizationPanelProps {
  config: CustomizationConfig;
  onChange: (c: CustomizationConfig) => void;
}

export const PersonalizationPanel: React.FC<PersonalizationPanelProps> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const s = t.settings;
  const [nickname, setNickname] = useSetting("tongyun_nickname", "");

  const quadrants = [
    { id: "urgent-important", label: "I. " + t.matrix.urgentImportant },
    { id: "important-not-urgent", label: "II. " + t.matrix.importantNotUrgent },
    { id: "urgent-not-important", label: "III. " + t.matrix.urgentNotImportant },
    { id: "not-urgent-not-important", label: "IV. " + t.matrix.notUrgentNotImportant },
  ] as const;

  const bgClassMap: Record<string, string> = {
    white: "bg-white",
    grid: "bg-grid-pattern",
    lined: "bg-lined-pattern",
    watercolor: "bg-watercolor-pattern",
    doodle: "bg-doodle-pattern",
  };

  const q1Color = PLANNER_COLORS[config.qColors["urgent-important"]] || PLANNER_COLORS.rose;

  const handleColorChange = (
    quadId: "urgent-important" | "important-not-urgent" | "urgent-not-important" | "not-urgent-not-important",
    colorKey: string,
  ) => {
    const newConfig = {
      ...config,
      qColors: {
        ...config.qColors,
        [quadId]: colorKey,
      },
    };
    onChange(newConfig);
  };

  const handleStyleChange = <K extends keyof CustomizationConfig>(
    key: K,
    value: CustomizationConfig[K],
  ) => {
    const newConfig = {
      ...config,
      [key]: value,
    };
    onChange(newConfig);
  };

  return (
    <div className="animate-fade-in-up grid grid-cols-1 lg:grid-cols-5 gap-6 flex-grow select-none">
      {/* 左侧配置栏 */}
      <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 flex flex-col gap-5 shadow-sm lg:col-span-3">
        <div className="space-y-5 flex-grow overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
          {/* 0. 昵称 */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              {s.nickname}
            </h4>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={s.nicknamePlaceholder}
              className="w-full px-3 py-2 rounded-xl border border-[#EFEBE4] bg-white/80 text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#C4D7B2] focus:border-transparent transition-all"
            />
          </div>
          {/* 0.2 主题显示模式 */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              {s.themeMode || "🌓 主题显示模式"}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "light", label: "☀️ " + (s.themeLight || "浅色模式") },
                { id: "dark", label: "🌙 " + (s.themeDark || "深色模式") },
                { id: "auto", label: "🖥️ " + (s.themeAuto || "跟随系统") },
              ].map((mode) => {
                const isSelected = (config.darkMode || "light") === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleStyleChange("darkMode", mode.id as any)}
                    className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all duration-200 cursor-pointer text-center hover:scale-105 active:scale-95 ${
                      isSelected
                        ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs"
                        : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 🎨 推荐主题预设 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              🎨 推荐主题预设 (10 个主题平铺)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {THEME_PRESETS.map((preset) => {
                const isMatch =
                  config.darkMode === preset.darkMode &&
                  JSON.stringify(config.qColors) === JSON.stringify(preset.qColors);
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      audioEngine.playStickSound();
                      onChange({
                        ...config,
                        darkMode: preset.darkMode,
                        qColors: preset.qColors,
                      });
                    }}
                    className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer text-left flex flex-col justify-between gap-1.5 hover:scale-105 active:scale-95 ${
                      isMatch
                        ? "border-[#4D7C5D] bg-[#F0F5F1]/30 ring-1 ring-[#4D7C5D]/20 shadow-xs"
                        : "bg-white border-[#EFEBE4] hover:border-slate-300"
                    }`}
                  >
                    <span className="text-[9px] font-bold text-slate-700 truncate block w-full">
                      {preset.name.split(" ")[0]} {preset.darkMode === "dark" ? "🌙" : "☀️"}
                    </span>
                    <div className="flex gap-1">
                      {preset.previewColors.map((c, i) => (
                        <span
                          key={i}
                          className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-2xs"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 0.5 城市 */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              {s.weatherCity}
            </h4>
            <input
              type="text"
              defaultValue={config.weatherCity || ""}
              onChange={(e) => handleStyleChange("weatherCity", e.target.value)}
              placeholder={s.weatherCityPlaceholder}
              className="w-full px-3 py-2 rounded-xl border border-[#EFEBE4] bg-white/80 text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#C4D7B2] focus:border-transparent transition-all"
            />
          </div>
          {/* 1.1 四象限色彩 */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              {s.quadColors}
            </h4>
            <div className="space-y-2.5">
              {quadrants.map((quad) => {
                const selectedColor = config.qColors[quad.id];
                return (
                  <div key={quad.id} className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-slate-600 min-w-[90px]">
                      {quad.label}
                    </span>
                    <div className="flex gap-2">
                      {Object.entries(PLANNER_COLORS).map(([colorKey, colorConfig]) => {
                        const isSelected = selectedColor === colorKey;
                        return (
                          <button
                            key={colorKey}
                            onClick={() => handleColorChange(quad.id, colorKey)}
                            className={`w-5.5 h-5.5 rounded-full ${colorConfig.dot} border border-slate-200 transition-all hover:scale-110 cursor-pointer relative ${
                              isSelected ? "ring-2 ring-slate-400 ring-offset-2 scale-110 shadow-xs" : "opacity-80 hover:opacity-100"
                            }`}
                            title={colorConfig.name}
                          >
                            {isSelected && (
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-extrabold">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 1.2 卡片纹理 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              {s.cardBg}
            </h4>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: "white", label: s.white },
                { id: "grid", label: s.grid },
                { id: "lined", label: s.lined },
                { id: "watercolor", label: s.watercolor },
                { id: "doodle", label: s.doodle },
              ].map((pattern) => {
                const isSelected = config.cardBackground === pattern.id;
                return (
                  <button
                    key={pattern.id}
                    onClick={() => handleStyleChange("cardBackground", pattern.id as any)}
                    className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all duration-200 cursor-pointer text-center hover:scale-105 active:scale-95 ${
                      isSelected
                        ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs"
                        : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"
                    }`}
                  >
                    {pattern.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1.3 别针夹子 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              {s.pinStyle}
            </h4>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: "pin", label: s.pin },
                { id: "tape", label: s.tape },
                { id: "clip", label: s.clip },
                { id: "heart", label: s.heart },
                { id: "smiley", label: s.smiley },
              ].map((pin) => {
                const isSelected = config.pinType === pin.id;
                return (
                  <button
                    key={pin.id}
                    onClick={() => handleStyleChange("pinType", pin.id as any)}
                    className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all duration-200 cursor-pointer text-center hover:scale-105 active:scale-95 ${
                      isSelected
                        ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs"
                        : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"
                    }`}
                  >
                    {pin.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1.4 毛玻璃及字体 */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
                {s.glass}
              </h4>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "light", label: s.glassLight },
                  { id: "matte", label: s.glassMatte },
                  { id: "solid", label: s.glassSolid },
                ].map((glass) => {
                  const isSelected = (config.interfaceGlass || "matte") === glass.id;
                  return (
                    <button
                      key={glass.id}
                      onClick={() => handleStyleChange("interfaceGlass", glass.id as any)}
                      className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all duration-200 cursor-pointer text-center hover:scale-105 active:scale-95 ${
                        isSelected
                          ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs"
                          : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"
                      }`}
                    >
                      {glass.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
                {s.font}
              </h4>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "sans", label: s.fontSans },
                  { id: "rounded", label: s.fontRounded },
                  { id: "serif", label: s.fontSerif },
                ].map((font) => {
                  const isSelected = (config.fontFamily || "sans") === font.id;
                  return (
                    <button
                      key={font.id}
                      onClick={() => handleStyleChange("fontFamily", font.id as any)}
                      className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all duration-200 cursor-pointer text-center hover:scale-105 active:scale-95 ${
                        isSelected
                          ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs"
                          : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"
                      }`}
                    >
                      {font.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 1.5 背景球 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
              {s.watercolorBg}
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "oasis", label: s.oasis },
                { id: "aurora", label: s.aurora },
                { id: "sunny", label: s.sunny },
                { id: "none", label: s.none },
              ].map((wc) => {
                const isSelected = (config.watercolorStyle || "oasis") === wc.id;
                return (
                  <button
                    key={wc.id}
                    onClick={() => handleStyleChange("watercolorStyle", wc.id as any)}
                    className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all duration-200 cursor-pointer text-center hover:scale-105 active:scale-95 ${
                      isSelected
                        ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs"
                        : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"
                    }`}
                  >
                    {wc.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧实时预览面板 */}
      <div className="lg:col-span-2 rounded-2xl bg-[#F4EFEA]/80 border border-[#EFEBE4] p-5 flex flex-col items-center justify-center gap-5 shadow-sm relative min-h-[360px]">
        <span className="absolute top-3.5 left-4 text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
          {s.livePreview}
        </span>

        {/* 待办卡片效果预览 */}
        <div className="w-full max-w-[250px] h-[165px] rounded-2xl p-4 flex flex-col justify-between shadow-md border border-[#EFEBE4] relative overflow-hidden bg-white select-none scale-95 transition-all">
          <div className={`absolute inset-0 z-0 ${bgClassMap[config.cardBackground]}`} />

          {config.cardBackground === "doodle" && (
            <div className="absolute right-4 bottom-12 opacity-10 pointer-events-none text-slate-700">
              <Sparkles className="w-9 h-9" />
            </div>
          )}

          <div className="z-10 flex items-center justify-between">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${q1Color.bg} border ${q1Color.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${q1Color.dot}`} />
              <span className={`text-[7.5px] font-extrabold uppercase tracking-wider ${q1Color.text}`}>
                {s.previewCardTag}
              </span>
            </div>
            <Heart className="w-3.5 h-3.5 text-[#E8A0BF] hover:fill-[#E8A0BF] cursor-pointer" />
          </div>

          <div className="z-10 flex-grow flex flex-col justify-center my-1.5">
            <h4 className="text-xs font-bold text-[#2D323A] line-clamp-1 leading-snug">
              {s.previewCardTitle}
            </h4>
            <p className="text-[9px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {s.previewCardDesc}
            </p>
          </div>

          <div className="z-10 flex items-center justify-between border-t border-[#FAF8F5] pt-2 text-[7.5px] text-slate-400 tracking-wider font-bold">
            <span>{t.taskCard.swipeLeft}</span>
            <span>{t.taskCard.swipeRight}</span>
          </div>
        </div>

        {/* 拟物化便签预览 */}
        <div className="w-full max-w-[250px] rounded-2xl border border-[#EFE5D3] bg-[#FAF5ED] p-4 pt-5 shadow-md flex flex-col justify-between min-h-[110px] relative scale-95 -rotate-1 select-none transition-all">
          <StickyPin type={config.pinType} />

          <div className="text-[10px] font-semibold text-[#8B6E3C] leading-relaxed flex-grow">
            {s.previewNote}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-dashed border-[#EFE5D3]/60 mt-1 text-[8px] text-[#8B6E3C]/60 font-bold">
            <span>{s.previewSticky}</span>
            <span>{s.previewFixed}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
