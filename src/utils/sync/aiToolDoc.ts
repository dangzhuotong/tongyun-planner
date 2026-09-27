export interface BuildAiToolDocOptions {
  webdavUrl: string;
  webdavUser: string;
  /**
   * Secret values scrubbed out of the URL and username before interpolation.
   * They are never written into the document themselves.
   */
  redact?: ReadonlyArray<string | null | undefined>;
}

export interface AiToolDocSettings {
  webdavUrl: string;
  webdavUser: string;
  webdavPass?: string | null;
  aiApiKey?: string | null;
  providerApiKeys?: Record<string, string | null | undefined> | null;
  smtpPass?: string | null;
}

/** Ignore very short strings so scrubbing cannot eat URL fragments like "https" or "json". */
const SECRET_SCRUB_MIN_LEN = 8;

function secretsToScrub(values: ReadonlyArray<string | null | undefined> | undefined): string[] {
  const seen = new Set<string>();
  const secrets: string[] = [];
  for (const value of values ?? []) {
    const secret = value?.trim();
    if (!secret || secret.length < SECRET_SCRUB_MIN_LEN || seen.has(secret)) continue;
    seen.add(secret);
    secrets.push(secret);
  }
  secrets.sort((a, b) => b.length - a.length);
  return secrets;
}

function scrubSecrets(value: string, secrets: readonly string[]): string {
  let out = value;
  for (const secret of secrets) {
    if (out.includes(secret)) out = out.split(secret).join("");
  }
  return out;
}

/**
 * WebDAV base URL safe to paste onto `TongYunPlanner/`.
 * Drops userinfo, fragments, and the query string (it can carry secrets, and
 * the client joins the directory onto the path, not onto `?...`).
 * Adds a trailing slash so the join matches `build_target_url`.
 */
export function normalizeWebdavBaseUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/#[\s\S]*$/, "");
  url = url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@/i, "$1");
  const qIndex = url.indexOf("?");
  if (qIndex !== -1) url = url.slice(0, qIndex);
  url = url.replace(/([^:]\/)\/+/g, "$1");
  if (url && !url.endsWith("/")) url += "/";
  return url;
}

export function buildAiToolDocFromSettings(settings: AiToolDocSettings): string {
  const providerValues = settings.providerApiKeys ? Object.values(settings.providerApiKeys) : [];
  return buildAiToolDoc({
    webdavUrl: settings.webdavUrl,
    webdavUser: settings.webdavUser,
    redact: [settings.webdavPass, settings.aiApiKey, settings.smtpPass, ...providerValues],
  });
}

export function buildAiToolDoc(opts: BuildAiToolDocOptions): string {
  const secrets = secretsToScrub(opts.redact);
  const webdavUser = scrubSecrets(opts.webdavUser ?? "", secrets).trim();
  const webdavUrl = normalizeWebdavBaseUrl(scrubSecrets(opts.webdavUrl ?? "", secrets));

  return `# 🎯 TongYun-List 数据管理工具集

通过坚果云 WebDAV 读写用户的所有应用数据：待办、已完成、便签、日记、倒计时、专注记录、配置。

远程目录：\`${webdavUrl}TongYunPlanner/\`

> 密码不会被复制；使用前请在终端 \`export TONGYUN_WEBDAV_PASS='<你的坚果云应用密码>'\`，不要把密码粘贴给 AI。

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
curl -s -u "${webdavUser}:$TONGYUN_WEBDAV_PASS" \\
  "${webdavUrl}TongYunPlanner/tasks.json"
\`\`\`
404 → 空数组 \`[]\` 或空对象 \`{}\`。

### 写入（新增/更新/删除）
\`\`\`bash
# 1. 读取当前数据
curl -s -u "${webdavUser}:$TONGYUN_WEBDAV_PASS" "${webdavUrl}TongYunPlanner/tasks.json"

# 2. 修改（id 用 Date.now().toString(36)+Math.random().toString(36).slice(2,6)）

# 3. PUT 写回完整数据（永远整文件覆盖，勿丢其他条目）
curl -s -X PUT -u "${webdavUser}:$TONGYUN_WEBDAV_PASS" \\
  -H "Content-Type: application/json" \\
  -d '<完整 JSON>' \\
  "${webdavUrl}TongYunPlanner/tasks.json"

# 4. ⚠️ 更新 manifest：GET → 只改对应键 version 为 Date.now() → PUT 整份 manifest
curl -s -u "${webdavUser}:$TONGYUN_WEBDAV_PASS" "${webdavUrl}TongYunPlanner/manifest.json"
curl -s -X PUT -u "${webdavUser}:$TONGYUN_WEBDAV_PASS" \\
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
  "aiEndpoint": "",
  "aiModel": "",
  "aiAutoCategorize": false,
  "journalCommentPrompt": "",
  "enableAutoBackup": false,
  "syncInterval": 300
}
\`\`\`
- 修改配置前务必先 GET 再合并字段 PUT，勿用残缺对象覆盖
- \`aiApiKey\` 等敏感密钥仅保存在本机，不参与云端同步，各端需单独在设置中填写
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
}
