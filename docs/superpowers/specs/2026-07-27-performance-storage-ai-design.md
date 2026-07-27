# 橦云手帐性能、存储与 AI 兼容性重构设计

日期：2026-07-27

## 目标

本次重构面向单用户长期使用场景。目标是在任务、日记、附件和专注记录持续增长后仍保持流畅，并修复 AI 散文无法可靠调用 OpenAI、失败原因不可见的问题。

验收目标：

- 日记连续输入不再逐字触发全局状态提交、全量 JSON 序列化或同步扫描。
- 1000 条任务和多年日记下，常用页面仍能流畅切换、搜索和编辑。
- 首屏不加载日历农历库、设置、资讯、Supabase 等非主页依赖。
- 旧数据自动迁移且任务、日记、附件引用、习惯及番茄记录不丢失。
- OpenAI 散文可以正常生成；失败时展示可操作的真实错误。
- WebDAV、HTTP 与 Supabase 同步继续兼容现有交换数据格式。

## 范围

### 包含

- SQLite 领域表和版本化迁移。
- 任务、已完成任务、日记、附件、习惯、番茄记录的增量读写。
- localStorage 旧数据迁移和可恢复备份。
- 日记编辑提交降频、关联任务增量更新。
- 页面级代码拆分和重依赖延迟加载。
- 大列表分段或虚拟化。
- OpenAI 与兼容接口的 URL、参数、响应和错误处理。
- 性能基线与回归验证。

### 不包含

- 新增产品功能或新页面。
- 修改现有云同步协议的外部数据结构。
- 多用户、账号权限和服务端协作。
- 全面视觉重设计。

## 总体架构

应用拆为四层：

1. `shell`：窗口、导航、命令面板和页面装载。
2. `features`：tasks、journal、focus、habits、news、memories 等独立领域模块。
3. `data`：SQLite repositories、迁移、附件文件服务和同步序列化器。
4. `services`：AI、通知、音频、云同步和跨窗口通信。

页面不得直接持久化领域数据。所有领域写入通过 repository；React 状态只保存当前界面所需的快照和草稿。

## 数据设计

### SQLite 表

- `tasks`：活动与完成任务共表，通过 `completed_at` 区分状态；子任务和标签暂以 JSON 列保存，避免过度拆表。
- `journal_entries`：一篇一行，按 `date`、`updated_at` 建索引。
- `attachments`：一条附件一行，关联 journal/task，保存文件相对路径、MIME、大小和时间。
- `pomodoro_logs`：一次专注一行，按时间建立索引。
- `habits`：习惯定义和当前连续状态。
- `app_settings`：仅存需要可靠持久化的小型设置。
- `schema_migrations`：记录已执行迁移版本。

### 迁移

首次运行新版本时：

1. 读取旧 localStorage JSON。
2. 把原始数据写入带时间戳的迁移备份文件或备份表。
3. 在单个 SQLite 事务中导入并去重。
4. 校验各类别数量与关键字段。
5. 写入迁移版本；失败则回滚事务并继续使用旧数据，不删除旧键。

旧 localStorage 数据在至少一个稳定版本内保留，只标记已迁移，不立即清除。

### 附件

新附件写入 Tauri 应用数据目录，使用生成 ID 作为文件名。数据库保存相对路径。迁移旧 Base64 附件时解码为文件；若单个附件失败，保留原记录并记录迁移错误，不阻断其他数据。

### 同步兼容

同步引擎不直接读取 React 状态。由同步序列化器从 repositories 导出原有 `SyncData`，拉取后通过事务导入。完成态仍优先于活动态，继续执行 ID 去重和分类版本控制。

## React 性能设计

### 日记编辑

- `textarea` 只更新局部 `draftContent`。
- 停止输入 600ms、失焦、切换日期和窗口隐藏时提交。
- 提交只更新当前 JournalEntry。
- 日记自动待办只根据本次变更的 entry 更新对应任务，不扫描整个 journal 数组。
- AI 评语、心情和附件操作立即提交，因为它们是低频离散操作。

### 状态边界

- `AppBody` 不订阅完整日记正文集合。
- Sidebar 只订阅数量与状态摘要。
- 每个页面通过领域 hook 获取需要的数据。
- Provider value 使用稳定回调与 memo；长正文变化不传播到无关模块。
- `App.tsx` 只负责窗口分流、应用外壳和页面选择。

### 长列表

- 任务列表和已完成列表超过阈值后采用虚拟化。
- 时光长廊按月分页，不一次挂载全部历史卡片。
- 搜索在 debounce 后执行，并优先查询 SQLite 索引或受限结果集。

## 包体和渲染设计

- Dashboard、Matrix、List、Calendar、StickyNotes 也改为页面级动态导入。
- `lunar-javascript` 仅在日历、日记或倒数日实际需要时加载。
- Framer Motion 仅随使用动画的功能块加载。
- Supabase SDK 继续只在选择 Supabase 后加载。
- Google Fonts 改为本地字体或系统字体栈，避免打包 App 启动依赖网络。
- 将 `transition-all` 收敛为 `transition-colors`、`transition-opacity` 或 `transition-transform`；尊重 `prefers-reduced-motion`。

## AI 兼容设计

### 请求规范化

- Provider preset 明确其协议类型，不再只依靠字符串分支。
- Endpoint 接受服务根地址或完整请求地址，规范化后只追加一次路径。
- OpenAI Chat Completions 根据模型能力选择 `max_tokens` 或 `max_completion_tokens`。
- 对不接受自定义 temperature 的模型省略该参数。
- 保持 Anthropic 原生 Messages API、DeepSeek/OpenCode/Ollama 的 OpenAI 兼容路径。

### 响应与错误

- `generateProse` 不捕获并吞掉异常。
- Rust `ai_proxy` 返回状态码、响应体和网络错误类别，而不是只返回不可区分的字符串。
- TypeScript 将错误映射为：Key 缺失/无效、余额或额度、模型不存在、参数不兼容、限流、网络超时、服务端错误、空响应。
- ProseCard 显示简短原因和下一步，详细信息写入开发日志；不显示 API Key。
- 连接测试与散文生成走同一 request builder。

## 错误处理与恢复

- 数据迁移使用事务，任一步失败都不删除旧数据。
- repository 写入失败时保留 UI 草稿并提示重试。
- 附件采用临时文件写入后原子重命名，避免半文件。
- 同步导入先校验结构，再在事务中应用。
- AI 请求默认超时，按钮支持再次请求且不会并发重复提交。

## 实施顺序

1. 建立性能基线和关键回归测试。
2. 实现 SQLite schema、repositories 和旧数据迁移。
3. 实现附件文件化与迁移。
4. 切换任务、日记、习惯和番茄到 repository。
5. 重构日记草稿提交和关联任务增量更新。
6. 缩小 Context 与 AppBody 状态边界。
7. 完成页面懒加载、依赖拆分和长列表优化。
8. 重构 AI request builder、Rust proxy 错误和 ProseCard 提示。
9. 执行数据、性能、类型、Rust 和生产构建验证。

每个阶段保持可构建，并在切换主数据源前保留兼容读取路径。

## 测试与验收

- 单元测试：迁移去重、任务增量 CRUD、日记 upsert、AI URL/参数构造、错误映射。
- 集成测试：旧 localStorage 到 SQLite、同步导出导入、Base64 附件迁移。
- UI 测试：连续输入日记、切换日期、完成/撤销任务、打开各懒加载页面、AI 散文成功与失败。
- 大数据测试：1000 条活动任务、5000 条已完成任务、5 年日记和大量番茄记录。
- 工程验证：`npm run typecheck`、`npm run check:rust`、`npm run build`。
- 构建对比：记录首屏预加载 chunk、主 chunk 和关键交互耗时。

## 安全与隐私

- API Key 不写入日志、错误信息或同步导出。
- 优先使用 Tauri 侧安全存储；若平台安全存储不可用，至少从普通配置与云同步 payload 中隔离。
- 附件只写入应用数据目录，所有目标路径必须由应用生成并验证。

