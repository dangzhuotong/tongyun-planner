# TongYun Sync Server — AI 工具说明（无密钥）

> 仓库内 Cursor Agent 优先使用项目 Skill：`.cursor/skills/tongyun-data/`（一份数据模型，覆盖 HTTP / WebDAV / 快照）。本文件给外部助手或设置页「复制」使用，可与 Skill 并存。

你通过 HTTP API 管理用户的通云清单数据。数据库由服务端保管，**不要猜测或索要 MySQL 密码 / API Key**；用户会在本地配置鉴权头。

Base URL 由用户提供，例如：`https://sync.example.com` 或 `http://127.0.0.1:8787`。

鉴权（二选一）：

- `X-API-Key: <用户本地密钥>`
- `Authorization: Bearer <用户本地密钥>`

---

## 分类（category）

| category | 含义 | payload 形状 |
|----------|------|----------------|
| `tasks` | 活动待办 | `Task[]` |
| `completedTasks` | 已完成 | `Task[]` |
| `stickyNotes` | 便签 | `StickyNote[]` |
| `pomodoroLogs` | 番茄记录 | `PomodoroLog[]` |
| `countdowns` | 倒数日 | `CountdownEvent[]` |
| `habits` | 习惯+打卡+心情 | `{ "habits":[], "habitLogs":{}, "moods":{} }` |
| `journal` | 日记/随记 | `JournalEntry[]` |
| `config` | 应用配置 | `CustomizationConfig \| null` |

`version` 为毫秒时间戳逻辑时钟；越大越新。

---

## 常用操作

### 探活
`GET /health`

### 看各分类版本
`GET /v1/manifest`

### 读一类
`GET /v1/categories/{category}`

### 写一类（推荐带乐观锁）
`PUT /v1/categories/{category}`

```json
{
  "data": [],
  "version": 1721433600000,
  "base_version": 0
}
```

- 先 GET 拿到当前 `version`，写入时把该值放进 `base_version`
- 若 409：服务端更新，用返回的 `server_data` 再合并后重试

### 全量读写
- `GET /v1/snapshot` → 对齐桌面 `SyncData`（另含 `manifest`）
- `PUT /v1/snapshot` → `{ "snapshot": { ...SyncData }, "merge_by_version": false }`

完成任务：从 `tasks` 移除并写入 `completedTasks`（可带 `completedAt`），两类都要 bump。

---

## Task 最小示例

```json
{
  "id": "k3x8p2a",
  "title": "准备汇报",
  "category": "important-not-urgent",
  "dueDate": "2026-07-20",
  "dueTime": "18:00",
  "priority": "medium",
  "tags": ["工作"],
  "completedAt": null
}
```

`category`：`urgent-important` | `important-not-urgent` | `urgent-not-important` | `not-urgent-not-important`

## JournalEntry 最小示例

```json
{
  "id": "j1",
  "linkKey": "2026-07-20",
  "title": "2026-07-20",
  "content": "今天…",
  "date": "2026-07-20",
  "isDaily": true,
  "createdAt": 1721433600000,
  "updatedAt": 1721433600000
}
```

---

## 规则

1. 永远读写完整 payload，不要只 PATCH 半截数组导致丢数据  
2. 冲突（409）时先展示差异再写  
3. 不要把 API Key、数据库连接串写进回复或提交到 Git  
4. 未知 category 不要臆造；以 `GET /v1/categories` 为准  
