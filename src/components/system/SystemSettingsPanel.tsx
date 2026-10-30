import React, { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw, Loader2, ExternalLink, Calendar } from "lucide-react";
import type { CustomizationConfig, AlertSoundType, Locale } from "../../types";
import { NOISE_DEFINITIONS, getVisibleNoises, setVisibleNoises } from "../../constants";
import { audioEngine } from "../../utils/audioEngine";
import { CustomSelect } from "../CustomSelect";
import { useTranslation } from "../../i18n/LanguageContext";
import { useSetting } from "../../hooks/useSetting";
import { checkForAppUpdate, resolveDisplayedAppVersion } from "../../utils/updater";
import { openExternal } from "../../utils/openExternal";
import { getVersion } from "@tauri-apps/api/app";
import { version as bundledVersion } from "../../../package.json";
import {
  fetchAndParseICal,
  saveCachedICalHolidays,
  clearCachedICalHolidays,
  getRegionIcalUrl,
  HOLIDAY_REGIONS,
  DEFAULT_HOLIDAY_REGION,
  type HolidayRegion,
} from "../../utils/holiday";

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
  config,
  onChange,
  alertSoundType,
  setAlertSoundType,
  resetTasks,
  triggerToast,
}) => {
  const { t } = useTranslation();
  const s = t.settings;
  const sb = t.sidebar;

  const [dueRemindEnabled, setDueRemindEnabled] = useSetting("tongyun_due_remind_enabled", true);
  const [dueRemindBeforeMinutes, setDueRemindBeforeMinutes] = useSetting(
    "tongyun_due_remind_before_min",
    15,
  );
  const [visibleNoises, setVisibleNoisesState] = useState<string[]>(() => getVisibleNoises());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [icalInputUrl, setIcalInputUrl] = useState(config.calendarIcalUrl || "");
  const [syncingIcal, setSyncingIcal] = useState(false);
  const [icalStatus, setIcalStatus] = useState<{ msg: string; isError: boolean } | null>(null);

  // 配置里的订阅地址变化时同步输入框。
  // 采用 React 官方的「渲染期派生 state」模式：与上次记录的地址不同才更新，
  // 避免在 effect 里 setState 触发级联渲染。
  const [syncedIcalUrl, setSyncedIcalUrl] = useState(config.calendarIcalUrl || "");
  if (config.calendarIcalUrl !== syncedIcalUrl) {
    setSyncedIcalUrl(config.calendarIcalUrl || "");
    setIcalInputUrl(config.calendarIcalUrl || "");
  }

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      getVersion()
        .then(setAppVersion)
        .catch(() => {});
    }
  }, []);

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await checkForAppUpdate();
      if (update) {
        window.dispatchEvent(new CustomEvent("tongyun-show-update", { detail: update }));
      } else {
        triggerToast(s.alreadyLatest || "已是最新版本", "success");
      }
    } catch (err: any) {
      triggerToast((s.checkUpdateError || "检查更新失败：") + (err?.message || err), "error");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const displayVersion = resolveDisplayedAppVersion(appVersion, bundledVersion);

  const handleChange = <K extends keyof CustomizationConfig>(
    key: K,
    value: CustomizationConfig[K],
  ) => {
    onChange({ ...config, [key]: value });
  };

  const handleSyncIcal = async () => {
    const trimmed = icalInputUrl.trim();
    if (!trimmed) {
      handleChange("calendarIcalUrl", "");
      clearCachedICalHolidays(config.calendarIcalUrl);
      setIcalStatus(null);
      triggerToast(s.icalClearSuccess || "已清空 iCal 订阅，恢复内置法定节假日", "success");
      return;
    }

    setSyncingIcal(true);
    setIcalStatus(null);
    try {
      const res = await fetchAndParseICal(trimmed);
      if (!res.ok) {
        const errMsg = `${s.icalSyncFailed || "iCal 订阅同步失败："}${res.error || "无法解析日历数据"}`;
        setIcalStatus({ msg: errMsg, isError: true });
        triggerToast(errMsg, "error");
        return;
      }
      saveCachedICalHolidays(trimmed, res.holidays);
      handleChange("calendarIcalUrl", trimmed);
      const successMsg = (
        s.icalSyncSuccess || "iCal 订阅同步成功，已载入 {count} 个节假日日程"
      ).replace("{count}", String(res.count));
      setIcalStatus({ msg: successMsg, isError: false });
      triggerToast(successMsg, "success");
    } catch (err: any) {
      const errMsg = `${s.icalSyncFailed || "iCal 订阅同步失败："}${err?.message || "网络请求异常"}`;
      setIcalStatus({ msg: errMsg, isError: true });
      triggerToast(errMsg, "error");
    } finally {
      setSyncingIcal(false);
    }
  };

  const handleClearIcal = () => {
    setIcalInputUrl("");
    handleChange("calendarIcalUrl", "");
    clearCachedICalHolidays(config.calendarIcalUrl);
    setIcalStatus(null);
    triggerToast(s.icalClearSuccess || "已清空 iCal 订阅，恢复内置法定节假日", "success");
  };

  // 切换地区：清掉旧订阅地址，改用新地区的官方订阅并尝试拉取
  const handleRegionChange = async (region: HolidayRegion) => {
    handleChange("calendarHolidayRegion", region);
    const previousUrl = config.calendarIcalUrl;
    const nextUrl = getRegionIcalUrl(region);

    handleChange("calendarIcalUrl", nextUrl);
    setIcalInputUrl(nextUrl);
    clearCachedICalHolidays(previousUrl);

    if (!nextUrl) {
      setIcalStatus(null);
      return;
    }
    setSyncingIcal(true);
    setIcalStatus(null);
    try {
      const res = await fetchAndParseICal(nextUrl);
      if (!res.ok) {
        const errMsg = `${s.icalSyncFailed || "iCal 订阅同步失败："}${res.error || "无法解析日历数据"}`;
        setIcalStatus({ msg: errMsg, isError: true });
        triggerToast(errMsg, "error");
        return;
      }
      saveCachedICalHolidays(nextUrl, res.holidays);
      const successMsg = (
        s.icalSyncSuccess || "iCal 订阅同步成功，已载入 {count} 个节假日日程"
      ).replace("{count}", String(res.count));
      setIcalStatus({ msg: successMsg, isError: false });
      triggerToast(successMsg, "success");
    } catch (err: any) {
      const errMsg = `${s.icalSyncFailed || "iCal 订阅同步失败："}${err?.message || "网络请求异常"}`;
      setIcalStatus({ msg: errMsg, isError: true });
      triggerToast(errMsg, "error");
    } finally {
      setSyncingIcal(false);
    }
  };

  return (
    <div className="space-y-6 flex-grow overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
      {/* 软件更新 */}
      <div className="space-y-3 pb-3 border-b border-[#EFEBE4] dark:border-[#2D3039]">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4 text-[#4D7C5D] dark:text-[#6DAF7E]" />
          <span>{s.softwareUpdate || "软件更新"}</span>
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">
          {s.softwareUpdateDesc ||
            "日常更新点下面的「检查更新」，或等启动后的提示。已经是最新会显示「已是最新版本」。"}
        </p>
        <div className="bg-[#FAF8F5] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">
              {s.currentVersion || "当前版本"}
            </span>
            <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100 block mt-0.5">
              v{displayVersion}
            </span>
          </div>
          <button
            type="button"
            disabled={checkingUpdate}
            onClick={handleManualCheckUpdate}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[#4D7C5D] dark:text-[#6DAF7E] bg-[#F0F5F1] dark:bg-[#1A261E] hover:bg-[#E4EDE6] dark:hover:bg-[#233527] border border-[#DEEAE2] dark:border-[#294231] px-3.5 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex-shrink-0"
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
        </div>
        <button
          type="button"
          onClick={() =>
            openExternal("https://github.com/dangzhuotong/tongyun-planner/issues/new/choose")
          }
          className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#1E2026] hover:bg-slate-50 dark:hover:bg-[#252830] border border-[#EFEBE4] dark:border-[#2D3039] px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
        >
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          <span>{s.reportIssue || "反馈问题"}</span>
        </button>
      </div>

      {/* 语言选择 */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.language}</h4>
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
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.soundTitle}</h4>
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
      <div className="space-y-3 pb-3 border-b border-[#EFEBE4] dark:border-[#2D3039]">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.dueRemindTitle}</h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.dueRemindDesc}</p>
        <div className="bg-[#FAF8F5] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
              {s.dueRemindToggle}
            </span>
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
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {s.dueRemindBefore}
              </span>
              <select
                value={dueRemindBeforeMinutes}
                onChange={(e) => setDueRemindBeforeMinutes(parseInt(e.target.value, 10))}
                className="bg-white dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2D3039] px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#6DAF7E] cursor-pointer"
              >
                <option value={5}>5 {s.dueRemindMinutes}</option>
                <option value={15}>15 {s.dueRemindMinutes}</option>
                <option value={30}>30 {s.dueRemindMinutes}</option>
                <option value={60}>60 {s.dueRemindMinutes}</option>
              </select>
              <span className="text-[10px] text-slate-400 font-medium">
                {s.dueRemindBeforeDesc}
              </span>
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
                className="text-[10px] font-bold text-[#4D7C5D] dark:text-[#6DAF7E] bg-[#F0F5F1] dark:bg-[#1A261E] border border-[#DEEAE2] dark:border-[#294231] px-3 py-1.5 rounded-lg hover:bg-[#E4EDE6] dark:hover:bg-[#233527] cursor-pointer transition-colors"
              >
                {s.dueRemindPermission || "开启系统通知权限"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 日历节假日与调休设置 */}
      <div className="space-y-3 pb-3 border-b border-[#EFEBE4] dark:border-[#2D3039]">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-[#4D7C5D] dark:text-[#6DAF7E]" />
          <span>{s.calendarHolidayTitle || "日历节假日与调休"}</span>
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">
          {s.calendarHolidayDesc ||
            "控制日历中的法定节假日与调休补班标记，并支持自定义 iCal (.ics) 日历订阅覆盖。"}
        </p>

        {/* 节假日与调休开关 */}
        <div className="bg-[#FAF8F5] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
              {s.showHolidaysToggle || "显示法定节假日与调休补班"}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {s.showHolidaysHint ||
                "在日历月视图与周视图中标记节假日「休」与调休「班」；关闭后均不显示。"}
            </span>
          </div>
          <input
            type="checkbox"
            checked={config.calendarShowHolidays !== false}
            onChange={(e) => handleChange("calendarShowHolidays", e.target.checked)}
            className="w-4 h-4 accent-[#4D7C5D] cursor-pointer flex-shrink-0"
          />
        </div>

        {/* 节假日地区选择 */}
        <div className="bg-[#FAF8F5] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] rounded-2xl p-3.5 space-y-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
            {s.holidayRegionTitle || "节假日地区"}
          </span>
          <p className="text-[10px] text-slate-400 font-medium">
            {s.holidayRegionDesc ||
              "中国内地使用内置离线年表（含调休补班）；中国香港使用特区政府 1823 官方公众假期订阅。"}
          </p>
          <div className="flex gap-2 flex-wrap">
            {HOLIDAY_REGIONS.map((region) => {
              const active = (config.calendarHolidayRegion ?? DEFAULT_HOLIDAY_REGION) === region.id;
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => handleRegionChange(region.id)}
                  disabled={syncingIcal}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 ${
                    active
                      ? "bg-[#4D7C5D] dark:bg-[#3F684C] text-white shadow-2xs"
                      : "bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#2D3039] text-slate-500 dark:text-slate-400 hover:bg-[#F0EDE7] dark:hover:bg-[#252830]"
                  }`}
                >
                  {region.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 自定义 iCal 日历订阅 */}
        <div className="bg-[#FAF8F5] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] rounded-2xl p-3.5 space-y-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
            {s.icalSubscriptionTitle || "自定义 iCal (.ics) 日历订阅"}
          </span>
          <p className="text-[10px] text-slate-400 font-medium">
            {s.icalSubscriptionDesc ||
              "支持填入公开的 iCal 日历订阅地址（如香港特区政府 1823 公众假期、学校校历或企业轮班），覆盖内置年表。"}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={icalInputUrl}
              onChange={(e) => setIcalInputUrl(e.target.value)}
              placeholder="https://example.com/calendar.ics"
              className="flex-1 bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#2D3039] px-3 py-1.5 rounded-xl text-[11px] text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#6DAF7E] font-medium"
            />
            <button
              type="button"
              disabled={syncingIcal}
              onClick={handleSyncIcal}
              className="px-3 py-1.5 rounded-xl bg-[#4D7C5D] hover:bg-[#3D6A4F] text-white text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 flex-shrink-0 shadow-2xs"
            >
              {syncingIcal ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span>{s.icalSyncButton || "保存并同步"}</span>
            </button>
            {config.calendarIcalUrl && (
              <button
                type="button"
                onClick={handleClearIcal}
                className="px-2.5 py-1.5 rounded-xl border border-[#EFEBE4] dark:border-[#2D3039] hover:bg-slate-100 dark:hover:bg-[#282B34] text-slate-500 text-[10px] font-bold transition-all cursor-pointer flex-shrink-0"
                title={s.icalClearButton || "清空订阅恢复内置"}
              >
                {s.icalClearButton || "清空"}
              </button>
            )}
          </div>
          {icalStatus && (
            <p
              className={`text-[10px] font-bold ${
                icalStatus.isError
                  ? "text-[#D4380D] dark:text-[#F06A4B]"
                  : "text-[#4D7C5D] dark:text-[#6DAF7E]"
              }`}
            >
              {icalStatus.msg}
            </p>
          )}
        </div>
      </div>

      {/* 白噪音管理 */}
      <div className="space-y-2 pb-3 border-b border-[#EFEBE4] dark:border-[#2D3039]">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
          {s.noiseSelectTitle}
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.noiseSelectDesc}</p>
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {NOISE_DEFINITIONS.map((def) => {
            const checked = visibleNoises.includes(def.id);
            return (
              <div
                key={def.id}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${checked ? "bg-[#4D7C5D]/8 dark:bg-[#4D7C5D]/15 border-[#4D7C5D]/25 dark:border-[#4D7C5D]/40" : "bg-white dark:bg-[#1E2026] border-[#EFEBE4] dark:border-[#2D3039]"}`}
              >
                <button
                  onClick={() => {
                    audioEngine.stopNoise();
                    audioEngine.startNoise(def.id, 0.3);
                    setTimeout(() => audioEngine.stopNoise(), 2000);
                  }}
                  className="flex-shrink-0 w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-[#4D7C5D]/15 dark:hover:bg-[#4D7C5D]/30 flex items-center justify-center cursor-pointer transition-colors text-slate-600 dark:text-slate-300"
                  title={`试听 ${(sb as any)[def.labelKey]}`}
                >
                  <span className="text-[9px]">▶</span>
                </button>
                <label className="flex items-center gap-1.5 flex-grow cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...visibleNoises, def.id]
                        : visibleNoises.filter((id: string) => id !== def.id);
                      setVisibleNoises(next);
                      setVisibleNoisesState(next);
                    }}
                    className="sr-only"
                  />
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${checked ? "bg-[#4D7C5D]" : "bg-slate-200 dark:bg-slate-700"}`}
                  />
                  <span
                    className={`font-medium ${checked ? "text-[#4D7C5D] dark:text-[#6DAF7E]" : "text-slate-400 dark:text-slate-500"}`}
                  >
                    {(sb as any)[def.labelKey]}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* 清空及重置 */}
      <div className="space-y-3 pt-5 border-t border-dashed border-[#EFEBE4] dark:border-[#2D3039]">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-[#A34E36] dark:text-[#E88C7D]" />
          <span>{s.dangerZone}</span>
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">{s.dangerDesc}</p>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="bg-red-50 dark:bg-[#2F1D1F] hover:bg-red-100 dark:hover:bg-[#3D2528] text-[#A34E36] dark:text-[#E88C7D] border border-[#F5DFDB] dark:border-[#523330] px-4 py-2.5 rounded-xl text-[10px] font-extrabold hover:scale-105 transition-all shadow-xs cursor-pointer block"
        >
          {s.factoryReset}
        </button>
      </div>

      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="bg-white dark:bg-[#1E2026] rounded-2xl p-6 max-w-sm mx-4 shadow-xl border border-[#EFEBE4] dark:border-[#2D3039]"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
              {s.factoryResetConfirm || "确认重置？"}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              {s.dangerDesc}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#282B34] hover:bg-slate-200 dark:hover:bg-[#323642] cursor-pointer transition-all"
              >
                {t.common.cancel || "取消"}
              </button>
              <button
                onClick={() => {
                  resetTasks();
                  setShowResetConfirm(false);
                  triggerToast(s.factoryResetDone, "success");
                }}
                className="px-4 py-2 rounded-xl text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 cursor-pointer transition-all"
              >
                {s.factoryReset}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
