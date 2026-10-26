# TongYun Planner (橦云手帐) - 开发规范与 Agent 指南

本项目基于 **Tong 系列开发规范** 构建。所有进入本项目的 AI Agent 必须遵守本规范。

---

## 1. 项目定位与核心职责

- **定位**：本地优先（Local-First）的 AI 手帐式桌面效率工具，融合四象限任务、翻页日记、专注番茄钟、便签与多端云同步。
- **技术栈**：
  - 前端：React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Framer Motion + Lucide React
  - 桌面宿主：Tauri 2 + Rust（Tauri Plugin Updater, Process, SQL, Store, Opener）
  - 存储：SQLite 领域数据库（增量写入） + localStorage 兼容降级 + WebDAV 云同步（内置坚果云预设）

---

## 2. 真实命令索引

所有命令必须有项目依据，提交或交付前确保命令执行通过：

| 目的 | 命令及工作目录 | 来源 | 前提 | 成功条件 |
| :--- | :--- | :--- | :--- | :--- |
| **全量检查** | `npm run check` (根目录) | `package.json` | Node 18+, Rust 1.77+ | TypeScript、Vitest、Cargo Check 均为 0 错误 |
| **类型检查** | `npm run typecheck` (根目录) | `package.json` | 依赖已安装 | `tsc --noEmit` 零报错 |
| **单元测试** | `npm test` (根目录) | `package.json` | Vitest 就绪 | 全部用例 PASS，执行时间 < 1s |
| **Rust 编译** | `npm run check:rust` (根目录) | `package.json` | Rust 工具链就绪 | `cargo check` 无错误退出 |
| **代码格式化** | `npm run format` (根目录) | `package.json` | Prettier | 自动格式化 src 下文件 |
| **代码规范检查** | `npm run lint` (根目录) | `package.json` | ESLint | 检查代码潜在语法与 React Hook 问题 |
| **本地开发** | `npm run dev` / `npm run tauri dev` | `package.json` | 本地环境 | 启动本地服务与 Tauri 窗口 |
| **打包构建** | `npm run build` | `package.json` | 本地环境 | 产出 `dist/` 静态资源 |

---

## 3. 数据模型与同步铁律 (TongYun Data 法典)

详细字段定义见 `.cursor/skills/tongyun-data/reference.md`。

### ① 数据分类唯一真相 (7 维 CamelCase)
数据仅允许归入以下 7 维类别：
- `tasks`（活动待办）
- `completedTasks`（已完成任务）
- `stickyNotes`（便签）
- `pomodoroLogs`（番茄钟记录）
- `countdowns`（倒数日）
- `journal`（手帐日记与随记）
- `config`（应用个性化与 AI 配置）

### ② 永远整包读写与逻辑时钟
- WebDAV 同步**严禁半截 PATCH**，必须全量读出 → 变更 → 全量写入。
- 采用毫秒级逻辑时钟（`Date.now()`）作为版本标记，解决跨端冲突。

### ③ 敏感凭据绝对隔离（安全底线）
- **严禁**将用户的 `aiApiKey`、`providerApiKeys`（OpenAI, Anthropic, DeepSeek 等私钥）同步到任何云端。
- 同步上传前强制调用 `sanitizeConfigForSync()` 剥离敏感密钥。
- 云端拉取合并时，本地设备上已配置的密钥优先级最高，严禁被远端空值或缺失覆盖。

### ④ 空包与覆盖保护
- 本地 `journal` 为空且远端非空时，**强制跳过上传**并拉回远端，严禁开发期以空本地冲掉远端数据。
- 启动期注入的示例任务（id 为纯数字）不得覆盖远端真实用户待办。

### ⑤ 派活名单以有心跳的工人为准
- Agent 下拉、筛选、派活人选只列 `tongyun_pipeline.workers` 里 enabled 且有 `last_seen` / 心跳的人（含 cursor-cloud）。
- `agents` 只给对得上的工人补显示名。没有 worker 心跳的成员不进派活名单。不另加显示用的 DDL 列。
- 本机 `domain_agents` 只在没配 DSN、且没有公司库缓存时作离线兜底，不是真相源。配了 DSN 时读库失败不得用本机静态登记顶上。
- 细则见 [docs/planner-db-ssot-not-local-roster.md](docs/planner-db-ssot-not-local-roster.md)。

---

## 4. 架构与目录分工

```text
src/
├── components/      # React 视图与手帐组件（四象限、日记、番茄钟、时光长廊、设置等）
├── context/         # 全局上下文（PersonalContext, PomodoroContext）
├── data/            # 领域数据库层（domainDatabase.ts SQLite 领域表与串行写入队列）
├── hooks/           # 业务逻辑 Hook（任务、计时器、到期提醒、跨窗口同步、存储初始化）
├── i18n/            # 中英文多语言配置与 LanguageContext
├── utils/           # 工具库（同步体系 sync/、音频引擎、日期解析、updater 更新工具等）
src-tauri/
├── capabilities/    # Tauri 2 窗口权限配置（process, updater, sql, store）
├── src/             # Rust 后端入口（lib.rs, main.rs, email.rs）
└── tauri.conf.json  # Tauri 桌面端配置、版本号与 Updater 公钥
```

---

## 5. 配套技能选配 (TongSkills Routing)

遇到特定领域的复杂任务时，按以下路由对标相应规范：

| 任务场景 | 选配技能 | 路由与工作边界 |
| :--- | :--- | :--- |
| **数据与同步排查** | `.cursor/skills/tongyun-data` | 遵循数据分类唯一真相、WebDAV/HTTP transport 与敏感凭据隔离规则。 |
| **界面与视觉改造** | `tong-ui-design-pro` | 遵循手帐暖纸质感视觉风格，保持 Tailwind CSS 4 规范与暗黑模式适配。 |
| **代码与架构审查** | `tong-code-review-pro` | 审查改动边界、生命周期副作用、内存泄露与跨窗口消息同步。 |
| **功能范围与需求** | `tong-product-pro` | 明确用户目标、功能范围，杜绝过度设计与偏离核心手帐定位的冗余功能。 |
| **测试与质量验收** | `tong-test-pro` | 编写/补充 Vitest 行为单测，执行 `npm run check` 闭环验证。 |

---

## 6. 变更与提交守则

1. **改动前**：先读所属模块代码与关联组件，确认改动影响范围。
2. **改动时**：严禁随意更改公开存储模型；保持向后兼容。
3. **改动后**：
   - 运行 `npm run check` 确保类型检查、单元测试、Rust 检查全部通过。
   - 保持工作区整洁，遵循独立任务单独提交原则。
4. **历史追溯**：
   - 历史研发流水已归档至 [docs/archive/DEV_SESSIONS.md](docs/archive/DEV_SESSIONS.md)。
   - 根 `AGENTS.md` 仅维护现行有效规则与命令，保持精简。

---

## 7. 发版（检查更新）

正式包只来自 tag `vX.Y.Z` 触发的 GitHub Release（版本号与 `package.json` / `tauri.conf.json` 一致，并写出 `latest.json`）。用户在 **设置 → 系统与语言 → 检查更新**，或等启动提示。

阿装只在 Release 工作流失败，或用户本机环境损坏时介入。`main` 每次合并之后，不做例行本机打包和重装。细则见 [docs/RELEASE.md](docs/RELEASE.md)。Apple 公证未做，不在当前发版路径里。

---

## 代码审查规矩

1. **本地测试进 PR**：改代码必须在本地跑相关测试，把测试命令和输出贴进 PR 描述（或附件）。没跑过别声称通过。
2. **提 PR 前自查 diff**：提交前自己过一遍 diff，重点看正确性、兼容（旧接口/旧数据）、权限、生命周期（启停、清理、泄漏）。
3. **已知坑沉淀**：同类问题第二次出现，就写进本文件「已知坑」一节（没有就新建），避免反复踩。
4. **AI 改稿轮次上限**：AI 修改来回审超过 3 轮还没过，停下重想方案并上报（阿码/阿审），不要硬改硬怼。
5. **风险分级合入**：
   - **低风险**：文档、测试的小改动，CI 绿可直接合。
   - **功能改动**：要阿审审过再合。
   - **高风险（必须阿橦本人批）**：计费、密钥相关、CI/发布流程（`.github/workflows`、updater、签名）的改动。

不要把密钥、Token、密码写进本文件或仓库任何位置。

## 已知坑

- `tongyun_pipeline.tasks.id` 在 TiDB 上是 `AUTO_RANDOM`，`information_schema.COLUMNS.EXTRA` 是空字符串。不能只拿 `/auto_increment/` 判断。要看 `SHOW CREATE TABLE` 里的 `AUTO_RANDOM`，插入省略 id；显式插入会 8216。回执 id 用 `lastInsertId` 或按 `planner_task_id` 回读，不要把本机雪花数当成库内 id。
- 派活名单不要把 `agents` 行直接列出来。只列 enabled 且有心跳的 `workers`。不要为这个加 DDL 显示列。
- 侧栏「数据库同步失败」只认个人库 `backend=database && channel=database && status=error`。`user_prefs` 只有「机密无口令拒明文」可以打断整次同步；单表失败和存储恢复前的「未配置」不能把侧栏打红。公司库派活失败只在 Agent 面板。
