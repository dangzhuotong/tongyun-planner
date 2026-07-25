---
name: tongyun-data
description: >-
  TongYun Planner (通云清单) data model and sync transports. Use when reading or
  writing tasks, journal, notes, pomodoro, countdowns, or config via
  WebDAV, self-hosted HTTP sync-server, or local JSON snapshot; when fixing
  sync/manifest issues; or when an AI agent must manage TongYun backup data.
---

# TongYun 数据与同步

一份**数据模型**，三种**运输方式**。改字段只改模型；选通道看用户当前配置。

## 安全（必须）

- **禁止**把 WebDAV 密码、HTTP `API_KEY`、MySQL 连接串写入回复、提交或提示词正文
- 凭据只从用户本机设置 / `.env` / 用户当场提供的环境读取
- 写之前展示变更摘要，等用户确认（除非用户明确说「直接改」）

## 数据分类（唯一真相）

| category（camelCase） | 含义 | payload |
|----------------------|------|---------|
| `tasks` | 活动待办 | `Task[]` |
| `completedTasks` | 已完成 | `Task[]` |
| `stickyNotes` | 便签 | `StickyNote[]` |
| `pomodoroLogs` | 番茄 | `PomodoroLog[]` |
| `countdowns` | 倒数日 | `CountdownEvent[]` |
| `journal` | 日记/随记 | `JournalEntry[]` |
| `config` | 应用配置 | `CustomizationConfig \| null` |

`version` = 毫秒逻辑时钟，越大越新。字段细节见 [reference.md](reference.md)。

**完成任务**：从 `tasks` 移除 → 写入 `completedTasks`（可带 `completedAt`）→ 两类都 bump。

**永远整包读写**：GET 全量 → 改 → PUT 全量；禁止半截 PATCH 导致丢条目。

## 通道 A — 自建 HTTP（`sync-server/`）

优先：用户启用了「自建 Sync 服务」时。

- Base URL：用户提供（常见 `http://127.0.0.1:8787`）
- 头：`X-API-Key` 或 `Authorization: Bearer …`（密钥本机配置，不写进 Skill）
- `GET /health` · `GET /v1/manifest` · `GET|PUT /v1/categories/{category}` · `GET|PUT /v1/snapshot`
- PUT 带 `base_version`；**409** 时用 `server_data` 合并再重试
- 仓库说明：`sync-server/AI_PROMPT.md`、`sync-server/README.md`

## 通道 B — 坚果云 WebDAV

优先：用户启用了 WebDAV 时。

- 目录：`{webdavUrl}TongYunPlanner/`
- 文件名 ↔ category：`tasks.json`→`tasks`，`completed.json`→`completedTasks`，`notes.json`→`stickyNotes`，`pomodoro.json`→`pomodoroLogs`，`countdowns.json`→`countdowns`，`journal.json`→`journal`，`config.json`→`config`
- **文件名 ≠ manifest 键**（键必须是上表 camelCase）
- 写完数据后必须更新 `manifest.json` 对应键的 `version`（`Date.now()`），否则 App 不拉
- Basic Auth；curl 示例见设置页「复制 AI 工具定义」（保留给外部助手用）

## 通道 C — 本地快照 JSON

- 设置里导出/导入；形状对齐 `SyncData`（含 `journal`）
- 导入走 `normalizeSyncData` + `applySyncData`
- 无远程 manifest；适合换机/离线备份

## 不在同步范围（勿臆造远程文件）

资讯收藏/历史、RSS、AI 散文/建议缓存、昵称等仅本地。独立习惯打卡 / MoodPanel 已移除（2026-07）；日记当日心情写在 `JournalEntry.mood`。旧云端 `habits.json` 可忽略。

## 工作流

1. 问清用户用的通道（HTTP / WebDAV / 快照）
2. 读 → 改 → 确认 → 写 →（WebDAV 还要 bump manifest）
3. 冲突先展示，再合并

### 空包保护（2026-07-23）

Push 时：本地 `journal` 为空且远端非空 → **跳过上传**并拉回远端；本地 `config` 无 `aiApiKey` 且远端有 → **合并保留远端 Key** 再推。防止开发时空本地盖掉云端。

桌面设置里的「复制 AI 工具定义 / 复制 AI 接口说明」**仍然保留**，给 ChatGPT 等外部助手粘贴用；本仓库内 Agent 优先读本 Skill。
