---
name: tongyun-data
description: >-
  TongYun Planner (通云清单) data model and sync transports. Use when reading or
  writing tasks, journal, notes, pomodoro, countdowns, or config via
  WebDAV or local JSON snapshot; when fixing sync/manifest issues; or when an
  AI agent must manage TongYun backup data.
---

# TongYun 数据与同步

一份**数据模型**。远程同步仅支持 WebDAV，另支持本地 JSON 快照。改字段只改模型；选通道看用户当前配置。

## 安全（必须）

- **禁止**把 WebDAV 密码/应用密码、AI API Key（aiApiKey / providerApiKeys）、SMTP 密码（smtpPass）写入回复、提交或提示词正文
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

## 远程同步 — WebDAV（坚果云）

远程同步仅支持 WebDAV（推荐坚果云 Jianguoyun，预设地址 `https://dav.jianguoyun.com/dav/`，使用坚果云“应用密码”；也支持自定义 WebDAV 地址）。

- 目录：`{webdavUrl}TongYunPlanner/`
- 文件名 ↔ category：`tasks.json`→`tasks`，`completed.json`→`completedTasks`，`notes.json`→`stickyNotes`，`pomodoro.json`→`pomodoroLogs`，`countdowns.json`→`countdowns`，`journal.json`→`journal`，`config.json`→`config`
- **文件名 ≠ manifest 键**（键必须是上表 camelCase）
- 写完数据后必须更新 `manifest.json` 对应键的 `version`（`Date.now()`），否则 App 不拉
- Basic Auth；curl 示例见设置页「复制 AI 工具定义」（保留给外部助手用）

## 本地快照 JSON

本地 JSON 快照（导出/导入、本地每日快照，这不是远程同步）。

- 设置里导出/导入；形状对齐 `SyncData`（含 `journal`）
- 导入走 `normalizeSyncData` + `applySyncData`
- 无远程 manifest；适合换机/离线备份

## 旧版（legacy）说明

旧版的自建 HTTP 同步与 Supabase 已在 v1.1 移除；App 检测到旧配置（只要有旧 URL 或旧 key 之一）会显示一次迁移提示，引导改用 WebDAV；Agent 不要再对 HTTP / Supabase 端点读写。

## 不在同步范围（勿臆造远程文件）

资讯收藏/历史、RSS、AI 散文/建议缓存、昵称等仅本地。独立习惯打卡 / MoodPanel 已移除（2026-07）；日记当日心情写在 `JournalEntry.mood`。旧云端 `habits.json` 可忽略。

## 工作流

1. 问清用户用的通道（WebDAV / 快照）
2. 读 → 改 → 确认 → 写 →（WebDAV 还要 bump manifest）
3. 冲突先展示，再合并

### 空包保护（2026-07-23）

Push 时：本地 `journal` 为空且远端非空 → **跳过上传**并拉回远端；本地 `config` 为空而远端非空时，合并远端的非密钥配置（本地优先，`aiEndpoint`/`aiModel`/`aiProvider` 本地为空时取远端）并经 `sanitizeConfigForSync` 脱敏后再推。敏感密钥（`aiApiKey`、`providerApiKeys`、`smtpPass` 及键名以 apiKey/secret/password/passwd/token 结尾的字段）从不上传到 WebDAV，拉取远端 `config` 时保留本机密钥。防止开发时空本地盖掉云端。

桌面设置里的「复制 AI 工具定义」**仍然保留**，给 ChatGPT 等外部助手粘贴用；复制出的内容不含 WebDAV 密码或任何密钥，用占位符 / 环境变量 `TONGYUN_WEBDAV_PASS` 代替，需用户自己在本机填写。本仓库内 Agent 优先读本 Skill。
