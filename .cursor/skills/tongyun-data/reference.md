# TongYun 数据字段参考

与 `src/types.ts`、`src/utils/sync/types.ts` 对齐。Agent 改数据时以本表为准。

## Task（`tasks` / `completedTasks`）

```json
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
```

- `category`：`urgent-important` | `important-not-urgent` | `urgent-not-important` | `not-urgent-not-important`
- `priority`：`high` | `medium` | `low`
- `repeat`：`none` | `daily` | `weekly` | `monthly` 或自定义
- `dueDate`：`YYYY-MM-DD`；`dueTime`：`HH:mm`
- `completedAt`：完成毫秒时间戳；活动任务无此字段；撤销完成时删除
- `attachments`：`{ id, name, path, type, size, createdAt }`（附件文件本身不同步，勿乱改 path）
- id 建议：`Date.now().toString(36)+Math.random().toString(36).slice(2,6)`

## StickyNote

```json
{ "id": "abc", "text": "便签内容", "color": "#FFD700", "rotate": -3 }
```

## CountdownEvent

```json
{ "id": "cde", "title": "春节", "targetDate": "2027-01-28", "emoji": "🎉", "color": "#D4380D" }
```

## PomodoroLog

```json
{ "id": "xyz", "timestamp": 1700000000000, "duration": 1500, "taskId": "k3x", "taskTitle": "标题" }
```

`duration` 单位：秒。

## habits bundle

```json
{
  "habits": [{ "id": "h1", "title": "早起", "emoji": "🌅" }],
  "habitLogs": { "2026-07-05": ["h1"] },
  "moods": { "2026-07-05": 4 }
}
```

- `habitLogs`：日期 → habit id 数组  
- `moods`：日期 → 1–5  
- 心情备注/附件不同步

## JournalEntry

```json
{
  "id": "j1a2b3",
  "linkKey": "2026-07-20",
  "title": "2026-07-20",
  "content": "今天写点什么…",
  "date": "2026-07-20",
  "isDaily": true,
  "templateId": "",
  "aiComment": "",
  "createdAt": 1721433600000,
  "updatedAt": 1721433600000
}
```

- 日记：`isDaily: true`，`linkKey` / `date` / `title` 多为 `YYYY-MM-DD`
- 随记：`isDaily: false`，`linkKey` 常等于标题
- 改写后更新 `updatedAt`

## config（CustomizationConfig 要点）

含四象限色、主题、日落护眼、locale、天气城市、AI 提供商字段、`syncInterval` 等。  
修改前必须先读后合并；**不要清空**已有 `aiApiKey`。

## WebDAV manifest 示例

```json
{
  "tasks": { "version": 1721433600000 },
  "completedTasks": { "version": 1721433600000 },
  "stickyNotes": { "version": 1721433600000 },
  "pomodoroLogs": { "version": 1721433600000 },
  "countdowns": { "version": 1721433600000 },
  "habits": { "version": 1721433600000 },
  "journal": { "version": 1721433600000 },
  "config": { "version": 1721433600000 }
}
```

## SyncData 快照顶层（本地导出 / HTTP snapshot）

```
version, tasks, completedTasks, stickyNotes, pomodoroLogs, countdowns,
habits, habitLogs, moods, journal, customizationConfig
```

注意：HTTP/WebDAV 的 `habits` **分类**是 bundle；快照顶层把 `habits` / `habitLogs` / `moods` 拆开（与桌面 `getLocalSyncData()` 一致）。
