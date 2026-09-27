import React, { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import type { CustomizationConfig, AlertSoundType, Locale } from "../../types";
import { NOISE_DEFINITIONS, getVisibleNoises, setVisibleNoises } from "../../constants";
import { audioEngine } from "../../utils/audioEngine";
import { CustomSelect } from "../CustomSelect";
import { useTranslation } from "../../i18n/LanguageContext";
import { useSetting } from "../../hooks/useSetting";
import { checkForAppUpdate } from "../../utils/updater";
import { openExternal } from "../../utils/openExternal";
import { getVersion } from "@tauri-apps/api/app";

interface SystemSettingsPanelProps {
  config: CustomizationConfig;
  onChange: (c: CustomizationConfig) => void;
  alertSoundType: AlertSoundType;
  setAlertSoundType: (type: AlertSoundType) => void;
  resetTasks: () => void;
  triggerToast: (text: string, type: "success" | "error") => void;
}

const ALERT_SOUND_OPTIONS: { value: AlertSoundType; label: string }[] = [
  { value: "beep", label: "电子 Chime 🔔 (Beep)" },
  { value: "cuckoo", label: "布谷鸟叫 🐦 (Cuckoo)" },
  { value: "meow", label: "猫咪叫 🐱 (Meow)" },
  { value: "chime", label: "风铃 Wind Chime 🎐 (Chime)" },
  { value: "ding", label: "叮咚 Doorbell 🛎️ (Ding)" },
  { value: "phone", label: "电话 Ring 📞 (Phone)" },
  { value: "marimba", label: "马林巴 Marimba 🎵 (Marimba)" },
  { value: "bells", label: "铃音 Bell Cascade 🔔 (Bells)" },
  { value: "alarm", label: "警报 Alarm 🚨 (Alarm)" },
];

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "中文 (简体)" },
  { value: "en", label: "English" },
];

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({
  config, onChange, alertSoundType, setAlertSoundType, resetTasks, triggerToast,
}) => {
  const { t } = useTranslation();
  const s = t.settings;
  const sb = t.sidebar;

  const [dueRemindEnabled, setDueRemindEnabled] = useSetting("tongyun_due_remind_enabled", true);
  const [dueRemindBeforeMinutes, setDueRemindBeforeMinutes] = useSetting("tongyun_due_remind_before_min", 15);
  const [visibleNoises, setVisibleNoisesState] = useState<string[]>(() => getVisibleNoises());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      getVersion().then(setAppVersion).catch(() => {});
    }
  }, []);

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await checkForAppUpdate();
      if (update) {
        window.dispatchEvent(new CustomEvent("tongyun-show-update", { detail: update }));
      } else {
        triggerToast(s.alreadyLatest || "当前已是最新版本 ✨", "success");
      }
    } catch (err: any) {
      triggerToast((s.checkUpdateError || "检查更新失败：") + (err?.message || err), "error");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleChange = <K extends keyof CustomizationConfig>(key: K, value: CustomizationConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-6 flex-grow overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
      {/* 语言选择 */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-700">{s.language}</h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.languageDesc}</p>
        <CustomSelect
          value={config.locale || "zh-CN"}
          onChange={(val) => handleChange("locale", val as Locale)}
          options={LOCALE_OPTIONS}
          className="w-full max-w-sm"
        />
      </div>

      {/* 系统声音选择 */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-700">{s.soundTitle}</h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.soundDesc}</p>
        <CustomSelect
          value={alertSoundType}
          onChange={(val) => {
            setAlertSoundType(val);
            localStorage.setItem("aero_alert_sound_type", val);
          }}
          options={ALERT_SOUND_OPTIONS}
          className="w-full max-w-sm"
        />
      </div>

      {/* 任务到期系统通知 */}
      <div className="space-y-3 pb-3 border-b border-[#EFEBE4]">
        <h4 className="text-xs font-bold text-slate-700">{s.dueRemindTitle}</h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.dueRemindDesc}</p>
        <div className="bg-[#FAF8F5] border border-[#EFEBE4] rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-700 block">{s.dueRemindToggle}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{s.dueRemindClickHint}</span>
          </div>
          <input
            type="checkbox"
            checked={dueRemindEnabled}
            onChange={(e) => setDueRemindEnabled(e.target.checked)}
            className="w-4 h-4 accent-[#4D7C5D] cursor-pointer flex-shrink-0"
          />
        </div>
        {dueRemindEnabled && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500">{s.dueRemindBefore}</span>
              <select
                value={dueRemindBeforeMinutes}
                onChange={(e) => setDueRemindBeforeMinutes(parseInt(e.target.value, 10))}
                className="bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-700 focus:outline-none focus:border-[#4D7C5D] cursor-pointer"
              >
                <option value={5}>5 {s.dueRemindMinutes}</option>
                <option value={15}>15 {s.dueRemindMinutes}</option>
                <option value={30}>30 {s.dueRemindMinutes}</option>
                <option value={60}>60 {s.dueRemindMinutes}</option>
              </select>
              <span className="text-[10px] text-slate-400 font-medium">{s.dueRemindBeforeDesc}</span>
            </div>
            {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await Notification.requestPermission();
                    if (result === "granted") {
                      triggerToast(s.dueRemindPermissionGranted || "通知权限已开启", "success");
                    } else if (result === "denied") {
                      triggerToast(s.dueRemindPermissionDenied || "通知被系统拒绝", "error");
                    }
                  } catch {
                    triggerToast(s.dueRemindPermissionDenied || "通知被系统拒绝", "error");
                  }
                }}
                className="text-[10px] font-bold text-[#4D7C5D] bg-[#F0F5F1] border border-[#DEEAE2] px-3 py-1.5 rounded-lg hover:bg-[#E4EDE6] cursor-pointer transition-colors"
              >
                {s.dueRemindPermission || "开启系统通知权限"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 白噪音管理 */}
      <div className="space-y-2 pb-3 border-b border-[#EFEBE4]">
        <h4 className="text-xs font-bold text-slate-700">{s.noiseSelectTitle}</h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.noiseSelectDesc}</p>
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {NOISE_DEFINITIONS.map((def) => {
            const checked = visibleNoises.includes(def.id);
            return (
              <div key={def.id} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${checked ? "bg-[#4D7C5D]/8 border-[#4D7C5D]/25" : "bg-white border-[#EFEBE4]"}`}>
                <button
                  onClick={() => {
                    audioEngine.stopNoise();
                    audioEngine.startNoise(def.id, 0.3);
                    setTimeout(() => audioEngine.stopNoise(), 2000);
                  }}
                  className="flex-shrink-0 w-5 h-5 rounded-md bg-slate-100 hover:bg-[#4D7C5D]/15 flex items-center justify-center cursor-pointer transition-colors"
                  title={`试听 ${(sb as any)[def.labelKey]}`}
                >
                  <span className="text-[9px]">▶</span>
                </button>
                <label className="flex items-center gap-1.5 flex-grow cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...visibleNoises, def.id] : visibleNoises.filter((id: string) => id !== def.id);
                      setVisibleNoises(next);
                      setVisibleNoisesState(next);
                    }}
                    className="sr-only"
                  />
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${checked ? "bg-[#4D7C5D]" : "bg-slate-200"}`} />
                  <span className={`font-medium ${checked ? "text-[#4D7C5D]" : "text-slate-400"}`}>{(sb as any)[def.labelKey]}</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* 软件更新 */}
      <div className="space-y-3 pb-3 border-b border-[#EFEBE4]">
        <h4 className="text-xs font-bold text-slate-700 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4 text-[#4D7C5D]" />
            <span>{s.softwareUpdate || "软件更新"}</span>
          </span>
          {appVersion && (
            <span className="text-[10px] font-mono text-slate-400 bg-[#FAF8F5] px-2 py-0.5 rounded-md border border-[#EFEBE4]">
              v{appVersion.replace(/^v/, "")}
            </span>
          )}
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">
          {s.softwareUpdateDesc || "支持在线自动检查新版本与一键安全热升级。"}
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            disabled={checkingUpdate}
            onClick={handleManualCheckUpdate}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#E4EDE6] border border-[#DEEAE2] px-3.5 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            {checkingUpdate ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{s.checkingUpdate || "正在检查更新..."}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{s.checkUpdate || "检查更新"}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://github.com/yibingzhi/tongyun-planner/issues/new/choose")}
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-[#EFEBE4] dark:border-slate-700 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span>{s.reportIssue || "反馈问题"}</span>
          </button>
        </div>
      </div>

      {/* 清空及重置 */}
      <div className="space-y-3 pt-5 border-t border-dashed border-[#EFEBE4]">
        <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-[#A34E36]" />
          <span>{s.dangerZone}</span>
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.dangerDesc}</p>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="bg-red-50 hover:bg-red-100 text-[#A34E36] border border-[#F5DFDB] px-4 py-2.5 rounded-xl text-[10px] font-extrabold hover:scale-105 transition-all shadow-xs cursor-pointer block"
        >
          {s.factoryReset}
        </button>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl border border-[#EFEBE4]" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-slate-800 mb-2">{s.factoryResetConfirm || "确认重置？"}</h4>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">{s.dangerDesc}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 rounded-xl text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer transition-all">
                {t.common.cancel || "取消"}
              </button>
              <button onClick={() => { resetTasks(); setShowResetConfirm(false); triggerToast(s.factoryResetDone, "success"); }} className="px-4 py-2 rounded-xl text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 cursor-pointer transition-all">
                {s.factoryReset}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
