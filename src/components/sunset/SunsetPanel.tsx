import React from "react";
import { Moon } from "lucide-react";
import type { CustomizationConfig } from "../../types";
import { CustomSelect } from "../CustomSelect";
import { useTranslation } from "../../i18n/LanguageContext";

interface SunsetPanelProps {
  config: CustomizationConfig;
  onChange: (c: CustomizationConfig) => void;
}

const SUNSET_HOUR_OPTIONS = Array.from({ length: 24 }).map((_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, "0")}:00`,
}));

export const SunsetPanel: React.FC<SunsetPanelProps> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const s = t.settings;

  const handleChange = <K extends keyof CustomizationConfig>(key: K, value: CustomizationConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-5 flex-grow overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
      <div className="bg-[#FAF5ED] border border-[#EFE5D3] p-4 rounded-2xl flex items-start gap-3">
        <Moon className="w-5 h-5 text-[#8B6E3C] mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed font-medium">
          <strong>🌅 {s.sunsetDesc}</strong>
        </div>
      </div>

      <div className="flex items-center justify-between p-3.5 rounded-2xl border border-[#EFEBE4] bg-white/50">
        <div>
          <span className="text-xs font-bold text-slate-700 block">{s.sunsetToggle}</span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">{s.sunsetToggleDesc}</span>
        </div>
        <input
          type="checkbox"
          checked={config.enableSunsetMode !== false}
          onChange={(e) => handleChange("enableSunsetMode", e.target.checked)}
          className="w-4 h-4 accent-[#A34E36] cursor-pointer"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 block uppercase">{s.sunsetStart}</label>
          <CustomSelect
            value={config.sunsetStartHour ?? 18}
            onChange={(val) => handleChange("sunsetStartHour", val)}
            options={SUNSET_HOUR_OPTIONS}
            disabled={config.enableSunsetMode === false}
            className="w-full"
            dropdownAlign="top"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 block uppercase">{s.sunsetEnd}</label>
          <CustomSelect
            value={config.sunsetEndHour ?? 6}
            onChange={(val) => handleChange("sunsetEndHour", val)}
            options={SUNSET_HOUR_OPTIONS}
            disabled={config.enableSunsetMode === false}
            className="w-full"
            dropdownAlign="top"
          />
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-slate-100">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-700">{s.sunsetWarmth}</span>
          <span className="text-[10px] font-extrabold text-[#A34E36]">{config.sunsetWarmth ?? 50}%</span>
        </div>
        <input
          type="range"
          min="10"
          max="90"
          value={config.sunsetWarmth ?? 50}
          onChange={(e) => handleChange("sunsetWarmth", parseInt(e.target.value, 10))}
          disabled={config.enableSunsetMode === false}
          className="w-full cursor-pointer accent-[#A34E36]"
        />
        <div className="flex justify-between text-[8px] text-slate-400 font-extrabold uppercase">
          <span>{s.sunsetWarmthLow}</span>
          <span>{s.sunsetWarmthHigh}</span>
        </div>
      </div>
    </div>
  );
};
