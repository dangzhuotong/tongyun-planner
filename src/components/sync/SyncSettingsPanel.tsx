import { useState, useEffect, useRef, useCallback } from "react";
import {
  Cloud,
  RefreshCw,
  Server,
  Copy,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Download,
  Upload,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import type { CustomizationConfig } from "../../types";
import type { SyncBackendType } from "../../utils/sync/types";
import { storageManager, type StorageBackendType } from "../../utils/storage";
import { syncEngine } from "../../utils/sync/engine";
import {
  JIANGUOYUN_WEBDAV_URL,
  commitWebDavDraftAt,
  isWebDavUrlLocked,
  urlForPreset,
} from "../../utils/sync/webdavForm";
import { getRemoteDsn, setRemoteDsn } from "../../utils/sync/remoteDbSync";
import {
  hasSyncSecretsDecryptFailed,
  readSyncSecretsPassphrase,
  secretSyncDecryptWarning,
  setSyncSecretsOptIn,
  writeSyncSecretsPassphrase,
} from "../../utils/sync/syncSecretsPref";
import {
  normalizeSyncData,
  applySyncData,
  bumpCategoryVersion,
  ALL_SYNC_CATEGORIES,
} from "../../utils/sync/types";
import {
  buildSnapshotPayload,
  ensureDailySnapshot,
  listDailySnapshots,
  readDailySnapshot,
  getBackupDir,
  type DailySnapshotItem,
} from "../../utils/sync/localSnapshots";
import { openExternal } from "../../utils/openExternal";
import { useTranslation } from "../../i18n/LanguageContext";
import { safeJsonParse } from "../../utils/json";
import { buildAiToolDocFromSettings } from "../../utils/sync/aiToolDoc";

function readStoredSmtpPass(): string {
  try {
    const raw = localStorage.getItem("tongyun_email_config");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { smtpPass?: unknown };
    return typeof parsed.smtpPass === "string" ? parsed.smtpPass : "";
  } catch {
    return "";
  }
}

interface SyncSettingsPanelProps {
  config: CustomizationConfig;
  onChange: (c: CustomizationConfig) => void;
  triggerToast: (text: string, type: "success" | "error") => void;
}

export function SyncSettingsPanel({ config, onChange, triggerToast }: SyncSettingsPanelProps) {
  const { t } = useTranslation();
  const s = t.settings;

  const [webdavUrl, setWebdavUrl] = useState(() => {
    const saved = localStorage.getItem("tongyun_webdav_url");
    if (!saved) return JIANGUOYUN_WEBDAV_URL;
    return saved;
  });
  const [webdavUser, setWebdavUser] = useState(
    () => localStorage.getItem("tongyun_webdav_user") || "",
  );
  const [webdavPass, setWebdavPass] = useState(
    () => localStorage.getItem("tongyun_webdav_pass") || "",
  );
  const [remoteDsn, setRemoteDsnState] = useState(() => getRemoteDsn() || "");
  const [syncBackend, setSyncBackend] = useState<SyncBackendType>(() => syncEngine.currentBackend);
  const [webdavPreset, setWebdavPreset] = useState<"jianguoyun" | "custom">(() => {
    const saved = localStorage.getItem("tongyun_webdav_url") || "";
    return !saved || saved.startsWith("https://dav.jianguoyun.com") ? "jianguoyun" : "custom";
  });
  const [syncPassphrase, setSyncPassphrase] = useState(() => readSyncSecretsPassphrase());
  const [secretsDecryptFailed, setSecretsDecryptFailed] = useState(() =>
    hasSyncSecretsDecryptFailed(),
  );
  const [urlError, setUrlError] = useState("");

  const [storageBackend, setStorageBackend] = useState<StorageBackendType>(
    () => storageManager.current,
  );
  const [syncStatus, setSyncStatus] = useState(syncEngine.status);
  const [syncLastTime, setSyncLastTime] = useState<number | null>(syncEngine.lastSyncTime);
  const [isLoading, setIsLoading] = useState(false);

  const snapshotFileRef = useRef<HTMLInputElement>(null);
  const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
  const [backupDir, setBackupDir] = useState<string | null>(null);
  const [dailySnapshots, setDailySnapshots] = useState<DailySnapshotItem[]>([]);
  const [isBackingUpDaily, setIsBackingUpDaily] = useState(false);

  const loadDailySnapshots = useCallback(async () => {
    if (!isTauri) return;
    try {
      const [dir, list] = await Promise.all([getBackupDir(), listDailySnapshots()]);
      setBackupDir(dir);
      setDailySnapshots(list);
    } catch (err) {
      console.warn("[SyncSettingsPanel] Failed to load daily snapshots:", err);
    }
  }, [isTauri]);

  useEffect(() => {
    if (!isTauri) return;
    let alive = true;
    Promise.all([getBackupDir(), listDailySnapshots()]).then(([dir, list]) => {
      if (!alive) return;
      setBackupDir(dir);
      setDailySnapshots(list);
    });
    return () => {
      alive = false;
    };
  }, [isTauri]);

  const handleImmediateDailyBackup = async () => {
    setIsBackingUpDaily(true);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("tongyun_last_daily_snapshot");
      }
      const path = await ensureDailySnapshot();
      if (path) {
        triggerToast("快照已生成 ✅", "success");
      } else {
        triggerToast("快照生成失败（无数据或系统异常）", "error");
      }
      await loadDailySnapshots();
    } catch {
      triggerToast("快照生成失败", "error");
    } finally {
      setIsBackingUpDaily(false);
    }
  };

  const handleRestoreDailySnapshot = async (fileName: string) => {
    const confirmed = window.confirm(
      "恢复会用该快照覆盖本机当前数据（密钥不受影响），确定继续吗？建议先导出一份当前快照。",
    );
    if (!confirmed) return;

    try {
      const content = await readDailySnapshot(fileName);
      if (!content) {
        triggerToast("读取快照文件失败", "error");
        return;
      }
      const rawData = JSON.parse(content);
      const normalized = normalizeSyncData(rawData);
      if (!normalized) {
        triggerToast("恢复失败，快照格式不正确", "error");
        return;
      }
      applySyncData(normalized);
      if (rawData.aiPraise) {
        localStorage.setItem("tongyun_ai_praise", JSON.stringify(rawData.aiPraise));
      }
      // 与导入一致：视为本机主动恢复，刷新版本并标记待同步（上传前仍会做云端冲突检测）
      bumpCategoryVersion(...ALL_SYNC_CATEGORIES);
      syncEngine.markDirty();
      triggerToast("已恢复 ✅", "success");
    } catch (err) {
      console.warn("[SyncSettingsPanel] Restore snapshot failed:", err);
      triggerToast("恢复失败，快照解析异常", "error");
    }
  };

  // 地址在失焦或点击测试/同步时提交。按键只改草稿，避免半截 http 地址带着 Basic 认证发出去。
  const persistWebDavDraft = (
    point: "blur" | "save",
    draft: { url: string; username: string; password: string },
  ) => {
    const saved = commitWebDavDraftAt(point, draft, (config) => {
      syncEngine.webdavProvider.setConfig(config);
      storageManager.webdav.setConfig(config);
    });
    if (!saved && draft.url.trim()) {
      setUrlError(s.syncUrlInsecure || "只允许 https。http 仅可用于本机 localhost / 127.0.0.1。");
      return false;
    }
    setUrlError("");
    return saved != null;
  };

  const handleSelectPreset = (preset: "jianguoyun" | "custom") => {
    setWebdavPreset(preset);
    const nextUrl = urlForPreset(preset, webdavUrl);
    setWebdavUrl(nextUrl);
    persistWebDavDraft("save", { url: nextUrl, username: webdavUser, password: webdavPass });
  };

  const applySyncProviderConfig = () => {
    if (syncBackend === "webdav") {
      return persistWebDavDraft("save", {
        url: webdavUrl,
        username: webdavUser,
        password: webdavPass,
      });
    }
    if (syncBackend === "database") {
      setRemoteDsn(remoteDsn);
      return true;
    }
    return true;
  };

  useEffect(() => {
    return syncEngine.subscribe((state) => {
      setSyncStatus(state.status);
      setSyncLastTime(state.lastSyncTime);
      setSecretsDecryptFailed(hasSyncSecretsDecryptFailed());
    });
  }, []);

  return (
    <div className="space-y-4 flex-grow overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
      <div className="bg-[#FAF8F5] dark:bg-slate-800/40 border border-[#EFEBE4] dark:border-slate-700 p-4 rounded-2xl flex items-start gap-3">
        <Cloud className="w-5 h-5 text-[#8B6E3C] mt-0.5 flex-shrink-0" />
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium space-y-2">
          <div>
            <strong>☁️ {s.syncTitle || "数据同步"}</strong>
            <p className="mt-1">{s.syncDesc}</p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#4D7C5D] dark:text-[#6FAD84] font-semibold bg-[#F0F5F1] dark:bg-[#233527] px-2.5 py-1.5 rounded-xl border border-[#DEEAE2] dark:border-[#2D4533]">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {s.syncSecurityNote ||
                "🔒 安全说明：云端同步不会上传任何 AI API Key 等敏感密钥，密钥仅保存在本机。在其他设备使用 AI 功能时，请在设置中单独填写密钥。"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
          同步后端
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["none", "不使用"],
              ["webdav", "WebDAV"],
              ["database", "远端数据库"],
            ] as [SyncBackendType, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setSyncBackend(val);
                syncEngine.setBackend(val);
              }}
              className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all cursor-pointer ${
                syncBackend === val
                  ? "bg-[#4D7C5D] text-white border-[#4D7C5D]"
                  : "bg-white dark:bg-[#1E2026] text-slate-600 dark:text-slate-300 border-[#EFEBE4] dark:border-[#2D3039] hover:border-[#4D7C5D] dark:hover:border-[#6DAF7E]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {syncBackend === "database" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[#F7F5F0] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <p>
              支持 MySQL 5.7+ / 8.0+ / TiDB 远端同构数据库全表同步。本地 SQLite 默认落盘持久化，配
              DSN 后全量领域表推到远端并可拉回；断网本机可写，上线自动追平。
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
              远端数据库 DSN (MySQL / TiDB)
            </label>
            <input
              type="password"
              placeholder="mysql://user:password@host:port/dbname"
              value={remoteDsn}
              onChange={(e) => {
                const val = e.target.value;
                setRemoteDsnState(val);
                setRemoteDsn(val);
              }}
              className="w-full bg-white dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2D3039] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#6DAF7E]"
            />
          </div>
        </div>
      )}

      {syncBackend === "webdav" && (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
              服务商
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPreset("jianguoyun")}
                className={`py-1.5 rounded-xl text-[10px] font-extrabold border transition-all cursor-pointer ${
                  webdavPreset === "jianguoyun"
                    ? "bg-[#4D7C5D] text-white border-[#4D7C5D]"
                    : "bg-white dark:bg-[#1E2026] text-slate-600 dark:text-slate-300 border-[#EFEBE4] dark:border-[#2D3039] hover:border-[#4D7C5D] dark:hover:border-[#6DAF7E]"
                }`}
              >
                坚果云（推荐）
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset("custom")}
                className={`py-1.5 rounded-xl text-[10px] font-extrabold border transition-all cursor-pointer ${
                  webdavPreset === "custom"
                    ? "bg-[#4D7C5D] text-white border-[#4D7C5D]"
                    : "bg-white dark:bg-[#1E2026] text-slate-600 dark:text-slate-300 border-[#EFEBE4] dark:border-[#2D3039] hover:border-[#4D7C5D] dark:hover:border-[#6DAF7E]"
                }`}
              >
                自定义 WebDAV
              </button>
            </div>
          </div>

          {webdavPreset === "jianguoyun" ? (
            <div className="rounded-xl bg-[#F7F5F0] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              <p className="mb-1.5">
                密码请填写坚果云「应用密码」：登录坚果云网页版 → 账户信息 → 安全选项 →
                第三方应用管理 → 添加应用生成。不要填写登录密码。
              </p>
              <button
                type="button"
                onClick={() => openExternal("https://help.jianguoyun.com/?p=2066")}
                className="inline-flex items-center gap-1 text-[#4D7C5D] dark:text-[#6DAF7E] hover:underline font-medium cursor-pointer"
              >
                查看坚果云 WebDAV 开启教程 ↗
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-[#F7F5F0] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              <p>
                支持任何标准 WebDAV 服务器（如 Nextcloud、ownCloud、群晖 WebDAV Server
                等），请确保支持 HTTPS 连接。
              </p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
              {s.syncUrl}
            </label>
            <input
              type="text"
              readOnly={isWebDavUrlLocked(webdavPreset)}
              placeholder="https://dav.jianguoyun.com/dav/"
              value={webdavUrl}
              onChange={(e) => {
                setWebdavUrl(e.target.value);
                setUrlError("");
              }}
              onBlur={(e) =>
                persistWebDavDraft("blur", {
                  url: e.target.value,
                  username: webdavUser,
                  password: webdavPass,
                })
              }
              className="w-full bg-white dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2D3039] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#6DAF7E]"
            />
            {urlError && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 leading-relaxed">
                {urlError}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                {s.syncUser}
              </label>
              <input
                type="text"
                placeholder="your-email@example.com"
                value={webdavUser}
                onChange={(e) => setWebdavUser(e.target.value)}
                onBlur={(e) =>
                  persistWebDavDraft("blur", {
                    url: webdavUrl,
                    username: e.target.value,
                    password: webdavPass,
                  })
                }
                className="w-full bg-white dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2D3039] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#6DAF7E]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                {s.syncPass}
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={webdavPass}
                onChange={(e) => setWebdavPass(e.target.value)}
                onBlur={(e) =>
                  persistWebDavDraft("blur", {
                    url: webdavUrl,
                    username: webdavUser,
                    password: e.target.value,
                  })
                }
                className="w-full bg-white dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2D3039] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#6DAF7E]"
              />
            </div>
          </div>
        </div>
      )}

      {(syncBackend === "webdav" || syncBackend === "database") && (
        <div className="space-y-3">
          {secretsDecryptFailed && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5 rounded-xl">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {secretSyncDecryptWarning(
                  s.syncSecretsDecryptFailed ||
                    "口令与云端不一致，已保留云端密文，没有用本机口令覆盖。请改成加密时使用的口令后再同步。",
                )}
              </span>
            </div>
          )}

          <div className="rounded-xl border border-[#EFEBE4] dark:border-[#2D3039] bg-white/60 dark:bg-[#1E2026]/60 p-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.syncSecrets === true}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setSyncSecretsOptIn(enabled);
                  onChange({ ...config, syncSecrets: enabled });
                  if (enabled && !syncPassphrase) {
                    triggerToast(
                      s.syncSecretsNeedPass || "请先设置加密口令，否则密钥仍不会上传",
                      "error",
                    );
                  }
                }}
                className="mt-0.5 w-4 h-4 accent-[#4D7C5D] cursor-pointer"
              />
              <span>
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {s.syncSecretsTitle || "同步 API 密钥（默认关闭）"}
                </span>
                <span className="block text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  {s.syncSecretsDesc ||
                    "开启后，AI API Key 与邮箱授权码会用口令加密再上传。关闭时密钥只留在本机。"}
                </span>
              </span>
            </label>
            {config.syncSecrets === true && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                  {s.syncSecretsPassphrase || "加密口令"}
                </label>
                <input
                  type="password"
                  value={syncPassphrase}
                  autoComplete="new-password"
                  placeholder={s.syncSecretsPassphraseHint || "仅保存在本机，不会上传"}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSyncPassphrase(next);
                    writeSyncSecretsPassphrase(next);
                  }}
                  onBlur={() => {
                    if (config.syncSecrets && syncPassphrase) setSyncSecretsOptIn(true);
                  }}
                  className="w-full bg-white dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2D3039] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#6DAF7E]"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  {s.syncSecretsTradeoff ||
                    "云端只保存密文。口令太弱时，拿到文件的人仍可能离线破解；口令丢失则无法在其他设备解密。本机已经填写的密钥不会被云端空值覆盖。WebDAV 密码不会放进加密包。"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {syncBackend !== "none" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#EFEBE4] dark:border-[#2D3039] bg-white/50 dark:bg-[#1E2026]/50">
            <div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                {syncStatus === "syncing"
                  ? "同步中..."
                  : syncStatus === "success"
                    ? "上次同步成功"
                    : syncStatus === "error"
                      ? "同步出错"
                      : syncStatus === "conflict"
                        ? "有冲突待处理"
                        : syncStatus === "offline"
                          ? "离线，稍后自动补传"
                          : "等待同步"}
              </span>
              {syncLastTime && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {new Date(syncLastTime).toLocaleString()}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                syncStatus === "syncing"
                  ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300"
                  : syncStatus === "success"
                    ? "bg-green-100 dark:bg-emerald-950/60 text-green-600 dark:text-emerald-300"
                    : syncStatus === "error"
                      ? "bg-red-100 dark:bg-rose-950/60 text-red-600 dark:text-rose-300"
                      : syncStatus === "conflict"
                        ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                        : syncStatus === "offline"
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              }`}
            >
              {syncStatus === "syncing"
                ? "同步中"
                : syncStatus === "success"
                  ? "已同步"
                  : syncStatus === "error"
                    ? "失败"
                    : syncStatus === "conflict"
                      ? "有冲突"
                      : syncStatus === "offline"
                        ? "离线"
                        : "待同步"}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!applySyncProviderConfig()) {
                  triggerToast(
                    s.syncUrlInsecure || "只允许 https。http 仅可用于本机 localhost / 127.0.0.1。",
                    "error",
                  );
                  return;
                }
                setIsLoading(true);
                const ok = await syncEngine.testConnection();
                setIsLoading(false);
                triggerToast(ok ? "连接成功 ✅" : "连接失败 ❌", ok ? "success" : "error");
              }}
              disabled={isLoading}
              className="flex-1 bg-white dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2D3039] hover:border-[#4D7C5D] dark:hover:border-[#6DAF7E] text-slate-600 dark:text-slate-200 py-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              {isLoading ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Server className="w-3 h-3" />
              )}
              测试连接
            </button>
            <button
              onClick={async () => {
                if (!applySyncProviderConfig()) {
                  triggerToast(
                    s.syncUrlInsecure || "只允许 https。http 仅可用于本机 localhost / 127.0.0.1。",
                    "error",
                  );
                  return;
                }
                setIsLoading(true);
                await syncEngine.sync();
                setIsLoading(false);
                if (syncEngine.status === "success") {
                  triggerToast("同步成功 ✅", "success");
                } else if (syncEngine.status === "error") {
                  triggerToast(syncEngine.errorMessage || "同步失败", "error");
                }
              }}
              disabled={isLoading || syncStatus === "syncing"}
              className="flex-1 bg-[#4D7C5D] hover:bg-[#3F684C] disabled:bg-slate-300 text-white py-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              {isLoading ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Cloud className="w-3 h-3" />
              )}
              立即同步
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#EFEBE4] dark:border-[#2D3039] bg-white/50 dark:bg-[#1E2026]/50">
            <div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                自动同步
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                启动时、关闭窗口/退出时、每 5 分钟自动同步；编辑停止约 30
                秒后上传，离线时自动排队，恢复网络后补传。
              </span>
            </div>
            <input
              type="checkbox"
              checked={config.enableAutoBackup !== false}
              onChange={(e) => {
                syncEngine.setAutoSync(e.target.checked);
                onChange({ ...config, enableAutoBackup: e.target.checked });
              }}
              className="w-4 h-4 accent-[#4D7C5D] cursor-pointer"
            />
          </div>

          <div className="pt-3 border-t border-[#EFEBE4] dark:border-[#2D3039]">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-3.5 h-3.5 text-[#8B6E3C] dark:text-[#D4AF37]" />
              <span className="text-[11px] font-bold text-[#8B6E3C] dark:text-[#D4AF37] tracking-wide uppercase">
                附件存储
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mb-3 font-medium">
              任务附件（图片/文件）的存储位置。云端后端支持公网 URL，AI 可直接读取。
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
              {(
                [
                  ["local", "本地存储"],
                  ["webdav", "WebDAV (坚果云)"],
                ] as [StorageBackendType, string][]
              ).map(([val, label]) => {
                const selected = storageBackend === val;
                return (
                  <button
                    key={val}
                    onClick={() => {
                      setStorageBackend(val);
                      storageManager.setBackend(val);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold border transition-all cursor-pointer ${
                      selected
                        ? "bg-[#4D7C5D] text-white border-[#4D7C5D]"
                        : "bg-white dark:bg-[#1E2026] text-slate-600 dark:text-slate-300 border-[#EFEBE4] dark:border-[#2D3039] hover:border-[#4D7C5D] dark:hover:border-[#6DAF7E]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/60 dark:bg-[#1E2026]/60 border border-[#EFEBE4] dark:border-[#2D3039]">
              <div className="flex items-center gap-2">
                {storageManager.isConfigured() ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                  {storageManager.provider.displayName}
                </span>
                {storageManager.provider.supportsPublicUrl && storageManager.isConfigured() && (
                  <span className="text-[8px] text-green-600 bg-green-50 dark:bg-green-950/60 dark:text-green-300 px-1.5 py-0.5 rounded-full font-bold">
                    AI 可读
                  </span>
                )}
              </div>
              {storageBackend !== "local" && (
                <button
                  onClick={async () => {
                    setIsLoading(true);
                    const ok = await storageManager.test();
                    setIsLoading(false);
                    triggerToast(ok ? "连接成功 ✅" : "连接失败 ❌", ok ? "success" : "error");
                  }}
                  disabled={isLoading || !storageManager.isConfigured()}
                  className="text-[9px] px-2 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#2D3039] hover:border-[#4D7C5D] dark:hover:border-[#6DAF7E] disabled:opacity-40 text-slate-500 dark:text-slate-400 font-bold cursor-pointer transition-all"
                >
                  {isLoading ? <RefreshCw className="w-2.5 h-2.5 animate-spin inline" /> : null}{" "}
                  测试
                </button>
              )}
            </div>
          </div>

          {syncBackend === "webdav" && webdavUrl && webdavUser && (
            <div className="p-3 rounded-xl border border-[#DEEAE2] dark:border-[#294231] bg-[#F0F5F1]/50 dark:bg-[#18261D]/50">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#6DAF7E]" />
                <span className="text-[11px] font-bold text-[#4D7C5D] dark:text-[#6DAF7E]">
                  AI 智能体集成
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                将待办管理能力作为工具赋予你的 AI 助手，一键复制函数定义即可粘贴到 OpenAI/Claude 的
                tools 参数中。
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    buildAiToolDocFromSettings({
                      webdavUrl,
                      webdavUser,
                      webdavPass,
                      aiApiKey: config.aiApiKey,
                      providerApiKeys: config.providerApiKeys,
                      smtpPass: readStoredSmtpPass(),
                    }),
                  );
                  triggerToast("已复制 ✅ 完整技能定义，可直接粘贴给 AI", "success");
                }}
                className="w-full bg-white dark:bg-[#202E24] hover:bg-[#F5F1EA] dark:hover:bg-[#283B2E] border border-[#DEEAE2] dark:border-[#294231] text-[#4D7C5D] dark:text-[#6DAF7E] py-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Copy className="w-3 h-3" />
                复制 AI 工具定义
              </button>
            </div>
          )}
        </div>
      )}

      <div className="pt-4 border-t border-[#EFEBE4] dark:border-[#2D3039] space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-[#8B6E3C]" />
          <span className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">
            {s.snapshotTitle || "本地快照备份"}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
          {s.snapshotDesc || "一键导出全部数据为 JSON 文件，换电脑或重装后可拖入恢复，不依赖网络。"}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const data = buildSnapshotPayload();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `tongyun-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              triggerToast(s.snapshotExported || "导出成功 ✅", "success");
            }}
            className="flex-1 bg-[#4D7C5D] hover:bg-[#3F684C] text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {s.snapshotExport || "导出快照"}
          </button>
          <button
            onClick={() => {
              const tasks: any[] = safeJsonParse(localStorage.getItem("aero_todos"), []);
              const headers = [
                "title",
                "description",
                "category",
                "priority",
                "dueDate",
                "dueTime",
                "repeat",
                "tags",
                "notes",
              ];
              const escape = (v: any) => {
                const str = v == null ? "" : Array.isArray(v) ? v.join("|") : String(v);
                return `"${str.replace(/"/g, '""')}"`;
              };
              const rows = tasks.map((t) => headers.map((h) => escape((t as any)[h])).join(","));
              const csv = "﻿" + [headers.join(","), ...rows].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `tongyun-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              triggerToast(s.exportTasksCsvDone || "任务 CSV 已导出 ✅", "success");
            }}
            className="flex-1 bg-[#8B6E3C] hover:bg-[#74592F] text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {s.exportTasksCsv || "导出任务 CSV"}
          </button>
          <button
            onClick={() => snapshotFileRef.current?.click()}
            className="flex-1 bg-[#B2C8DF] dark:bg-[#34495E] hover:bg-[#9BB5CF] dark:hover:bg-[#415B76] text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 transition-all shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            {s.snapshotImport || "导入快照"}
          </button>
          <input
            ref={snapshotFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                try {
                  const data = JSON.parse(ev.target?.result as string);
                  const normalized = normalizeSyncData(data);
                  if (!normalized) {
                    triggerToast(s.snapshotImportError || "导入失败，文件格式不正确", "error");
                    return;
                  }
                  applySyncData(normalized);
                  if (data.aiPraise) {
                    localStorage.setItem("tongyun_ai_praise", JSON.stringify(data.aiPraise));
                  }
                  // 导入视为本机主动恢复：刷新各分类版本并标记待同步，下次同步时上传（上传前仍会做云端冲突检测）
                  bumpCategoryVersion(...ALL_SYNC_CATEGORIES);
                  syncEngine.markDirty();
                  triggerToast(s.snapshotImported || "导入成功 ✅", "success");
                } catch {
                  triggerToast(s.snapshotImportError || "导入失败，文件格式不正确", "error");
                }
              };
              reader.readAsText(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* 自动每日快照子区块 */}
        <div className="pt-3 border-t border-[#EFEBE4] dark:border-[#2D3039] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              自动每日快照
            </span>
            {isTauri && (
              <button
                type="button"
                onClick={handleImmediateDailyBackup}
                disabled={isBackingUpDaily}
                className="px-2.5 py-1 rounded-lg bg-[#4D7C5D] hover:bg-[#3F684C] disabled:bg-slate-300 text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
              >
                {isBackingUpDaily ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : null}
                立即备份
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
            每天自动在本机保存一份完整数据快照（不含密钥），保留最近 14 天，不依赖网络。
          </p>

          {!isTauri ? (
            <div className="text-[10px] text-slate-400 bg-white/50 dark:bg-[#1E2026]/40 border border-[#EFEBE4] dark:border-[#2D3039] rounded-xl p-2.5">
              仅桌面端可用
            </div>
          ) : (
            <div className="space-y-2">
              {backupDir && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono select-all break-all bg-white/60 dark:bg-[#1E2026]/70 px-2.5 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#2D3039]">
                  {backupDir}
                </div>
              )}

              {dailySnapshots.length === 0 ? (
                <div className="text-[10px] text-slate-400 text-center py-2.5 bg-white/30 dark:bg-[#1E2026]/40 rounded-xl border border-dashed border-[#EFEBE4] dark:border-[#2D3039]">
                  暂无每日快照（系统将在每天使用时自动创建）
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                  {dailySnapshots.map((snap) => {
                    const dateMatch = snap.name.match(/\d{4}-\d{2}-\d{2}/);
                    const dateLabel = dateMatch ? dateMatch[0] : snap.name;
                    const sizeKb = Math.max(1, Math.round(snap.size / 1024));
                    return (
                      <div
                        key={snap.name}
                        className="flex items-center justify-between p-2 rounded-xl bg-white/60 dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 font-mono">
                            {dateLabel}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium">{sizeKb} KB</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreDailySnapshot(snap.name)}
                          className="px-2.5 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#2D3039] hover:border-[#4D7C5D] dark:hover:border-[#6DAF7E] hover:bg-[#F0F5F1] dark:hover:bg-[#233527] text-slate-600 dark:text-slate-300 hover:text-[#4D7C5D] dark:hover:text-[#6DAF7E] text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          恢复
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
