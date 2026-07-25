import { useState, useEffect, useRef } from "react";
import { Cloud, RefreshCw, Server, Copy, HardDrive, CheckCircle2, AlertTriangle, Sparkles, Download, Upload } from "lucide-react";
import type { CustomizationConfig } from "../../types";
import type { SyncBackendType } from "../../utils/sync/types";
import { storageManager, type StorageBackendType } from "../../utils/storage";
import { syncEngine } from "../../utils/sync/engine";
import { normalizeSyncData, applySyncData, getLocalSyncData } from "../../utils/sync/types";
import { openExternal } from "../../utils/openExternal";
import { useTranslation } from "../../i18n/LanguageContext";
import { safeJsonParse } from "../../utils/json";

interface SyncSettingsPanelProps {
  config: CustomizationConfig;
  onChange: (c: CustomizationConfig) => void;
  triggerToast: (text: string, type: "success" | "error") => void;
}

export function SyncSettingsPanel({ config, onChange, triggerToast }: SyncSettingsPanelProps) {
  const { t } = useTranslation();
  const s = t.settings;

  const [webdavUrl, setWebdavUrl] = useState(() => localStorage.getItem("tongyun_webdav_url") || "");
  const [webdavUser, setWebdavUser] = useState(() => localStorage.getItem("tongyun_webdav_user") || "");
  const [webdavPass, setWebdavPass] = useState(() => localStorage.getItem("tongyun_webdav_pass") || "");
  const [syncBackend, setSyncBackend] = useState<SyncBackendType>(() => syncEngine.currentBackend);
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem("tongyun_supabase_url") || "");
  const [supabaseKey, setSupabaseKey] = useState(() => localStorage.getItem("tongyun_supabase_anon_key") || "");
  const [httpSyncUrl, setHttpSyncUrl] = useState(() => localStorage.getItem("tongyun_http_sync_url") || "http://127.0.0.1:8787");
  const [httpSyncKey, setHttpSyncKey] = useState(() => localStorage.getItem("tongyun_http_sync_key") || "");

  const [storageBackend, setStorageBackend] = useState<StorageBackendType>(() => storageManager.current);
  const [syncStatus, setSyncStatus] = useState(syncEngine.status);
  const [syncLastTime, setSyncLastTime] = useState<number | null>(syncEngine.lastSyncTime);
  const [isLoading, setIsLoading] = useState(false);

  const snapshotFileRef = useRef<HTMLInputElement>(null);

  const applySyncProviderConfig = () => {
    if (syncBackend === "webdav") {
      syncEngine.webdavProvider.setConfig({
        url: webdavUrl,
        username: webdavUser,
        password: webdavPass || undefined,
      });
    } else if (syncBackend === "supabase") {
      syncEngine.supabaseProvider.setConfig({
        url: supabaseUrl,
        anonKey: supabaseKey,
      });
    } else if (syncBackend === "http") {
      syncEngine.httpProvider.setConfig({
        baseUrl: httpSyncUrl,
        apiKey: httpSyncKey,
      });
    }
  };

  useEffect(() => {
    return syncEngine.subscribe((state) => {
      setSyncStatus(state.status);
      setSyncLastTime(state.lastSyncTime);
    });
  }, []);

  return (
    <div className="space-y-4 flex-grow overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
      <div className="bg-[#FAF8F5] border border-[#EFEBE4] p-4 rounded-2xl flex items-start gap-3">
        <Cloud className="w-5 h-5 text-[#8B6E3C] mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed font-medium">
          <strong>☁️ {s.syncTitle || "数据同步"}</strong>
          <p className="mt-1">{s.syncDesc}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">同步后端</label>
        <div className="grid grid-cols-2 gap-2">
          {([["none", "不使用"], ["webdav", "坚果云 WebDAV"], ["http", "自建 Sync 服务"], ["supabase", "Supabase"]] as [SyncBackendType, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setSyncBackend(val);
                syncEngine.setBackend(val);
              }}
              className={`py-2 rounded-xl text-[10px] font-extrabold border transition-all cursor-pointer ${
                syncBackend === val
                  ? "bg-[#4D7C5D] text-white border-[#4D7C5D]"
                  : "bg-white text-slate-600 border-[#EFEBE4] hover:border-[#4D7C5D]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {syncBackend === "webdav" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[#F7F5F0] dark:bg-slate-800/60 border border-[#EFEBE4] dark:border-slate-700 p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <p className="mb-1.5">服务器地址一般为 <code className="text-slate-700 dark:text-slate-200">https://dav.jianguoyun.com/dav/</code>。密码<b>不是</b>登录密码，需在坚果云网页端「设置 → 安全」中生成<b>应用专用密码</b>。</p>
            <button type="button" onClick={() => openExternal("https://help.jianguoyun.com/?p=2066")} className="inline-flex items-center gap-1 text-[#4D7C5D] dark:text-[#6DAF7E] hover:underline font-medium">查看坚果云 WebDAV 开启教程 ↗</button>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{s.syncUrl}</label>
            <input
              type="text"
              placeholder="https://dav.jianguoyun.com/dav/"
              value={webdavUrl}
              onChange={(e) => {
                setWebdavUrl(e.target.value);
                localStorage.setItem("tongyun_webdav_url", e.target.value);
              }}
              className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{s.syncUser}</label>
              <input
                type="text"
                placeholder="your-email@example.com"
                value={webdavUser}
                onChange={(e) => {
                  setWebdavUser(e.target.value);
                  localStorage.setItem("tongyun_webdav_user", e.target.value);
                }}
                className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{s.syncPass}</label>
              <input
                type="password"
                placeholder="••••••••"
                value={webdavPass}
                onChange={(e) => {
                  setWebdavPass(e.target.value);
                  localStorage.setItem("tongyun_webdav_pass", e.target.value);
                }}
                className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
              />
            </div>
          </div>
        </div>
      )}

      {syncBackend === "http" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[#F7F5F0] dark:bg-slate-800/60 border border-[#EFEBE4] dark:border-slate-700 p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <p className="mb-1.5">对接仓库内 <code className="text-slate-700 dark:text-slate-200">sync-server/</code>（FastAPI + MySQL）。本机默认 <code className="text-slate-700 dark:text-slate-200">http://127.0.0.1:8787</code>，API Key 填服务器 <code className="text-slate-700 dark:text-slate-200">.env</code> 里的值。密钥只存本机，不要提交到 Git。</p>
            <p className="text-[10px] opacity-80">启动：<code className="text-slate-700 dark:text-slate-200">cd sync-server && docker compose up -d</code></p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">服务地址</label>
            <input
              type="text"
              placeholder="http://127.0.0.1:8787"
              value={httpSyncUrl}
              onChange={(e) => {
                setHttpSyncUrl(e.target.value);
                localStorage.setItem("tongyun_http_sync_url", e.target.value);
              }}
              className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">API Key</label>
            <input
              type="password"
              placeholder="与 sync-server/.env 中 API_KEY 一致"
              value={httpSyncKey}
              onChange={(e) => {
                setHttpSyncKey(e.target.value);
                localStorage.setItem("tongyun_http_sync_key", e.target.value);
              }}
              className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
            />
          </div>
          {httpSyncUrl.trim() && (
            <button
              type="button"
              onClick={() => {
                const base = httpSyncUrl.trim().replace(/\/+$/, "");
                const doc = `# TongYun 自建 Sync 服务（无密钥）

Base URL: ${base}
鉴权：请求头 \`X-API-Key\` 由用户本机配置，不要写入此文档或 Git。

分类与桌面端一致：tasks / completedTasks / stickyNotes / pomodoroLogs / countdowns / journal / config

## API
- GET ${base}/health
- GET ${base}/v1/manifest
- GET ${base}/v1/categories/{category}
- PUT ${base}/v1/categories/{category}  body: {"data":...,"version":ms,"base_version":n}
- GET ${base}/v1/snapshot
- PUT ${base}/v1/snapshot  body: {"snapshot":{...},"merge_by_version":false}

写操作先 GET 再带 base_version；409 时用 server_data 合并后重试。
完整字段说明见仓库 sync-server/AI_PROMPT.md。`;
                navigator.clipboard.writeText(doc);
                triggerToast("已复制 API 说明（不含密钥）✅", "success");
              }}
              className="w-full bg-white hover:bg-[#F5F1EA] border border-[#DEEAE2] text-[#4D7C5D] dark:text-[#6DAF7E] py-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <Copy className="w-3 h-3" />
              复制 AI 接口说明（无密钥）
            </button>
          )}
        </div>
      )}

      {syncBackend === "supabase" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[#F7F5F0] dark:bg-slate-800/60 border border-[#EFEBE4] dark:border-slate-700 p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <p className="mb-1.5">在 Supabase 新建项目后，进入 <b>Project Settings → API</b>，复制 <b>Project URL</b> 与 <b>anon public key</b> 填入下方。建议开启 Row Level Security 保护数据。</p>
            <button type="button" onClick={() => openExternal("https://supabase.com/docs/guides/api")} className="inline-flex items-center gap-1 text-[#4D7C5D] dark:text-[#6DAF7E] hover:underline font-medium">查看 Supabase 配置教程 ↗</button>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Supabase URL</label>
            <input
              type="text"
              placeholder="https://your-project.supabase.co"
              value={supabaseUrl}
              onChange={(e) => {
                setSupabaseUrl(e.target.value);
                localStorage.setItem("tongyun_supabase_url", e.target.value);
              }}
              className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Anon Key</label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={supabaseKey}
              onChange={(e) => {
                setSupabaseKey(e.target.value);
                localStorage.setItem("tongyun_supabase_anon_key", e.target.value);
              }}
              className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
            />
          </div>
        </div>
      )}

      {syncBackend !== "none" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#EFEBE4] bg-white/50">
            <div>
              <span className="text-xs font-bold text-slate-700 block">
                {syncStatus === "syncing" ? "同步中..." :
                 syncStatus === "success" ? "上次同步成功" :
                 syncStatus === "error" ? "同步出错" : "等待同步"}
              </span>
              {syncLastTime && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {new Date(syncLastTime).toLocaleString()}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              syncStatus === "syncing" ? "bg-blue-100 text-blue-600" :
              syncStatus === "success" ? "bg-green-100 text-green-600" :
              syncStatus === "error" ? "bg-red-100 text-red-600" :
              "bg-slate-100 text-slate-500"
            }`}>
              {syncStatus === "syncing" ? "同步中" :
               syncStatus === "success" ? "已同步" :
               syncStatus === "error" ? "失败" : "待同步"}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                applySyncProviderConfig();
                setIsLoading(true);
                const ok = await syncEngine.testConnection();
                setIsLoading(false);
                triggerToast(ok ? "连接成功 ✅" : "连接失败 ❌", ok ? "success" : "error");
              }}
              disabled={isLoading}
              className="flex-1 bg-white border border-[#EFEBE4] hover:border-[#4D7C5D] text-slate-600 py-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
              测试连接
            </button>
            <button
              onClick={async () => {
                applySyncProviderConfig();
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
              {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
              立即同步
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#EFEBE4] bg-white/50">
            <div>
              <span className="text-xs font-bold text-slate-700 block">自动同步</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">数据变更后自动同步到云端</span>
            </div>
            <input
              type="checkbox"
              checked={config.enableAutoBackup !== false}
              onChange={(e) => {
                syncEngine.setAutoSync(e.target.checked, (config.syncInterval || 60) * 1000);
                onChange({ ...config, enableAutoBackup: e.target.checked });
              }}
              className="w-4 h-4 accent-[#4D7C5D] cursor-pointer"
            />
          </div>
          {config.enableAutoBackup !== false && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-[#EFEBE4] bg-white/50 mt-2">
              <span className="text-[10px] font-bold text-slate-600 block">同步间隔</span>
              <select
                value={config.syncInterval || 60}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  syncEngine.setAutoSync(true, val * 1000);
                  onChange({ ...config, syncInterval: val });
                }}
                className="bg-[#FAF8F5] border border-[#EFEBE4] px-2 py-1 rounded-lg text-[10px] text-slate-700 font-bold focus:outline-none focus:border-[#C4D7B2]"
              >
                <option value={15}>每15秒</option>
                <option value={30}>每30秒</option>
                <option value={60}>每1分钟</option>
                <option value={300}>每5分钟</option>
                <option value={900}>每15分钟</option>
                <option value={1800}>每30分钟</option>
                <option value={3600}>每小时</option>
                <option value={0}>仅手动</option>
              </select>
            </div>
          )}

          <div className="pt-3 border-t border-[#EFEBE4]">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-3.5 h-3.5 text-[#8B6E3C]" />
              <span className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">附件存储</span>
            </div>
            <p className="text-[10px] text-slate-400 mb-3 font-medium">任务附件（图片/文件）的存储位置。云端后端支持公网 URL，AI 可直接读取。</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {([["local", "本地存储"], ["webdav", "WebDAV (坚果云)"], ["supabase", "Supabase"]] as [StorageBackendType, string][]).map(([val, label]) => {
                const selected = storageBackend === val;
                return (
                  <button key={val} onClick={() => { setStorageBackend(val); storageManager.setBackend(val); }}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold border transition-all cursor-pointer ${
                      selected ? "bg-[#4D7C5D] text-white border-[#4D7C5D]" : "bg-white text-slate-600 border-[#EFEBE4] hover:border-[#4D7C5D]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {storageBackend !== "local" && storageBackend !== "webdav" && (
              <p className="text-[10px] text-slate-400 mb-2 italic">云端后端需将 Bucket/容器设为「公共读」，公网 URL 才能真正被访问、被 AI 读取。</p>
            )}

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/60 border border-[#EFEBE4]">
              <div className="flex items-center gap-2">
                {storageManager.isConfigured() ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                <span className="text-[10px] font-bold text-slate-700">{storageManager.provider.displayName}</span>
                {storageManager.provider.supportsPublicUrl && storageManager.isConfigured() && (
                  <span className="text-[8px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-bold">AI 可读</span>
                )}
              </div>
              {storageBackend !== "local" && (
                <button onClick={async () => { setIsLoading(true); const ok = await storageManager.test(); setIsLoading(false); triggerToast(ok ? "连接成功 ✅" : "连接失败 ❌", ok ? "success" : "error"); }}
                  disabled={isLoading || !storageManager.isConfigured()}
                  className="text-[9px] px-2 py-1 rounded-lg border border-[#EFEBE4] hover:border-[#4D7C5D] disabled:opacity-40 text-slate-500 font-bold cursor-pointer transition-all"
                >
                  {isLoading ? <RefreshCw className="w-2.5 h-2.5 animate-spin inline" /> : null} 测试
                </button>
              )}
            </div>
          </div>

          {syncBackend === "webdav" && webdavUrl && webdavUser && (
            <div className="p-3 rounded-xl border border-[#DEEAE2] bg-[#F0F5F1]/50">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#6DAF7E]" />
                <span className="text-[11px] font-bold text-[#4D7C5D] dark:text-[#6DAF7E]">AI 智能体集成</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2">将待办管理能力作为工具赋予你的 AI 助手，一键复制函数定义即可粘贴到 OpenAI/Claude 的 tools 参数中。</p>
              <button
                onClick={() => {
                  const doc = `# 🎯 TongYun-List 数据管理工具集

通过坚果云 WebDAV 读写用户的所有应用数据：待办、已完成、便签、日记、倒计时、专注记录、配置。

远程目录：\`${webdavUrl}TongYunPlanner/\`

---

## 📦 数据文件一览

| # | 文件 | manifest 键名（必须精确） | 内容 | 结构 |
|---|------|---------------------------|------|------|
| 1 | \`tasks.json\` | \`tasks\` | 活动待办 | \`Task[]\` |
| 2 | \`completed.json\` | \`completedTasks\` | 已完成任务 | \`Task[]\` |
| 3 | \`notes.json\` | \`stickyNotes\` | 便签 | \`StickyNote[]\` |
| 4 | \`pomodoro.json\` | \`pomodoroLogs\` | 专注记录 | \`PomodoroLog[]\` |
| 5 | \`countdowns.json\` | \`countdowns\` | 倒计时事件 | \`CountdownEvent[]\` |
| 6 | \`journal.json\` | \`journal\` | 日记 + 随记 | \`JournalEntry[]\` |
| 7 | \`config.json\` | \`config\` | 应用配置 | \`CustomizationConfig\` |
| 8 | \`manifest.json\` | — | ⚠️ 版本清单 | 见下方 |

> **manifest 最关键**：文件名 ≠ 键名。键名必须用上表 camelCase（如 \`stickyNotes\`，不是 \`notes\`）。每次写数据后必须更新对应键的 \`version\`，否则 App 不会拉取。

### manifest.json 完整示例
\`\`\`json
{
  "tasks": { "version": 1721433600000 },
  "completedTasks": { "version": 1721433600000 },
  "stickyNotes": { "version": 1721433600000 },
  "pomodoroLogs": { "version": 1721433600000 },
  "countdowns": { "version": 1721433600000 },
  "journal": { "version": 1721433600000 },
  "config": { "version": 1721433600000 }
}
\`\`\`

---

## 🔧 通用操作

所有文件操作方式一致，以 tasks.json 为例：

### 读取
\`\`\`bash
curl -s -u "${webdavUser}:${webdavPass}" \\
  "${webdavUrl}TongYunPlanner/tasks.json"
\`\`\`
404 → 空数组 \`[]\` 或空对象 \`{}\`。

### 写入（新增/更新/删除）
\`\`\`bash
# 1. 读取当前数据
curl -s -u "${webdavUser}:${webdavPass}" "${webdavUrl}TongYunPlanner/tasks.json"

# 2. 修改（id 用 Date.now().toString(36)+Math.random().toString(36).slice(2,6)）

# 3. PUT 写回完整数据（永远整文件覆盖，勿丢其他条目）
curl -s -X PUT -u "${webdavUser}:${webdavPass}" \\
  -H "Content-Type: application/json" \\
  -d '<完整 JSON>' \\
  "${webdavUrl}TongYunPlanner/tasks.json"

# 4. ⚠️ 更新 manifest：GET → 只改对应键 version 为 Date.now() → PUT 整份 manifest
curl -s -u "${webdavUser}:${webdavPass}" "${webdavUrl}TongYunPlanner/manifest.json"
curl -s -X PUT -u "${webdavUser}:${webdavPass}" \\
  -H "Content-Type: application/json" \\
  -d '<更新后的完整 manifest>' \\
  "${webdavUrl}TongYunPlanner/manifest.json"
\`\`\`

---

## 📋 各数据格式

### Task（tasks.json / completed.json 共用）
\`\`\`json
{
  "id": "k3x8p2a",
  "title": "准备汇报",
  "description": "详情",
  "notes": "补充备注",
  "category": "important-not-urgent",
  "dueDate": "2026-07-10",
  "dueTime": "18:00",
  "priority": "medium",
  "tags": ["工作"],
  "isFavorite": false,
  "isPinned": false,
  "repeat": "none",
  "subtasks": [{ "id": "m9n", "title": "子任务", "completed": false }],
  "dependsOn": [],
  "attachments": [],
  "journalId": "",
  "completedAt": 1721433600000
}
\`\`\`
- \`category\`：\`urgent-important\` | \`important-not-urgent\` | \`urgent-not-important\` | \`not-urgent-not-important\`
- \`priority\`：\`high\` | \`medium\` | \`low\`
- \`repeat\`：\`none\` | \`daily\` | \`weekly\` | \`monthly\` 或自定义字符串
- \`dueDate\`：\`YYYY-MM-DD\`；\`dueTime\`：\`HH:mm\`
- \`dependsOn\`：前置任务 id 数组；\`journalId\`：由日记「加入待办」创建时关联日记 id
- \`attachments\`：\`{ id, name, path, type, size, createdAt }\`（附件本体不在 WebDAV 文本同步范围内，勿乱改 path）
- \`completedAt\`：完成时刻（毫秒时间戳）；仅已完成任务需要；撤销完成时删除该字段
- 完成任务：从 \`tasks.json\` 移除，写入 \`completed.json\`（结构相同），并分别 bump \`tasks\` / \`completedTasks\` 的 manifest

### StickyNote（notes.json）
\`\`\`json
{ "id": "abc", "text": "便签内容", "color": "#FFD700", "rotate": -3 }
\`\`\`
manifest 键：\`stickyNotes\`

### CountdownEvent（countdowns.json）
\`\`\`json
{ "id": "cde", "title": "春节", "targetDate": "2027-01-28", "emoji": "🎉", "color": "#D4380D" }
\`\`\`

### PomodoroLog（pomodoro.json）
\`\`\`json
{ "id": "xyz", "timestamp": 1700000000000, "duration": 1500, "taskId": "k3x", "taskTitle": "标题" }
\`\`\`
\`duration\` 单位秒；manifest 键：\`pomodoroLogs\`

### JournalEntry（journal.json）
\`\`\`json
{
  "id": "j1a2b3",
  "linkKey": "2026-07-20",
  "title": "2026-07-20",
  "content": "今天写点什么…",
  "date": "2026-07-20",
  "isDaily": true,
  "templateId": "",
  "mood": "😊",
  "aiComment": "",
  "createdAt": 1721433600000,
  "updatedAt": 1721433600000
}
\`\`\`
- 日记：\`isDaily: true\`，\`linkKey\` / \`date\` / \`title\` 均为 \`YYYY-MM-DD\`
- 随记：\`isDaily: false\`，\`linkKey\` 通常等于标题原文
- \`mood\`：可选，日记当日心情 emoji（如 😞😔😐😊😄）
- \`content\` 纯文本；改写后请更新 \`updatedAt\`

### config.json（CustomizationConfig）
\`\`\`json
{
  "qColors": {
    "urgent-important": "#...",
    "important-not-urgent": "#...",
    "urgent-not-important": "#...",
    "not-urgent-not-important": "#..."
  },
  "cardBackground": "white",
  "pinType": "pin",
  "interfaceGlass": "light",
  "watercolorStyle": "oasis",
  "fontFamily": "sans",
  "enableSunsetMode": false,
  "sunsetStartHour": 20,
  "sunsetEndHour": 7,
  "sunsetWarmth": 40,
  "enableCelebration": true,
  "locale": "zh-CN",
  "weatherCity": "北京",
  "darkMode": "auto",
  "aiProvider": "openai",
  "aiApiKey": "",
  "aiEndpoint": "",
  "aiModel": "",
  "aiAutoCategorize": false,
  "journalCommentPrompt": "",
  "enableAutoBackup": false,
  "syncInterval": 300
}
\`\`\`
- 修改配置前务必先 GET 再合并字段 PUT，勿用残缺对象覆盖
- \`aiApiKey\` 等敏感字段若已有值，默认不要清空或回显给用户
- \`syncInterval\`：秒，\`0\` 表示手动；常见 15/30/60/300/900/1800/3600
- \`cardBackground\`：\`white\` | \`grid\` | \`lined\` | \`watercolor\` | \`doodle\`
- \`darkMode\`：\`light\` | \`dark\` | \`auto\`；\`locale\`：\`zh-CN\` | \`en\`
- \`aiProvider\`：\`openai\` | \`anthropic\`

---

## 🚫 不在 WebDAV 同步范围内（勿臆造远程文件）
资讯收藏/历史、RSS 订阅源、AI 散文/建议缓存、昵称等仅本地。

---

## 📐 规则
1. **404** = 数据不存在，初始化为 \`[]\` 或 \`{}\`
2. **完整写回**：永远 PUT 完整文件，不丢失其他字段/条目
3. **manifest**：写完数据后更新对应 camelCase 键的 \`version\`（\`Date.now()\`），并 PUT 完整 manifest
4. **确认**：操作前展示变更内容让用户确认
5. **完成任务**：在 \`tasks\` 与 \`completedTasks\` 两侧同时维护，并分别 bump 两个 manifest 键`;

                  navigator.clipboard.writeText(doc);
                  triggerToast("已复制 ✅ 完整技能定义，可直接粘贴给 AI", "success");
                }}
                className="w-full bg-white hover:bg-[#F5F1EA] border border-[#DEEAE2] text-[#4D7C5D] dark:text-[#6DAF7E] py-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Copy className="w-3 h-3" />
                复制 AI 工具定义
              </button>
            </div>
          )}
        </div>
      )}

      <div className="pt-4 border-t border-[#EFEBE4] space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-[#8B6E3C]" />
          <span className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">{s.snapshotTitle || "本地快照备份"}</span>
        </div>
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
          {s.snapshotDesc || "一键导出全部数据为 JSON 文件，换电脑或重装后可拖入恢复，不依赖网络。"}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const sync = getLocalSyncData();
              const data = {
                ...sync,
                aiPraise: safeJsonParse(localStorage.getItem("tongyun_ai_praise"), []),
                exportedAt: new Date().toISOString(),
              };
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
              const headers = ["title", "description", "category", "priority", "dueDate", "dueTime", "repeat", "tags", "notes"];
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
            className="flex-1 bg-[#B2C8DF] hover:bg-[#9BB5CF] text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 transition-all shadow-xs"
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
      </div>
    </div>
  );
}