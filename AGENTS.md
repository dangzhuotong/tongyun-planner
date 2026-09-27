# TongYun Planner (橦云手帐) - 开发规范与 Agent 指南

本项目基于 **Tong 系列开发规范** 构建。所有进入本项目的 AI Agent 必须遵守本规范。

---

## 1. 项目定位与核心职责

- **定位**：本地优先（Local-First）的 AI 手帐式桌面效率工具，融合四象限任务、翻页日记、专注番茄钟、便签与多端云同步。
- **技术栈**：
  - 前端：React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Framer Motion + Lucide React
  - 桌面宿主：Tauri 2 + Rust（Tauri Plugin Updater, Process, SQL, Store, Opener）
  - 存储：SQLite 领域数据库（增量写入） + localStorage 兼容降级 + WebDAV / 自建 HTTP / Supabase 云同步

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
- 无论 WebDAV、自建 HTTP 还是 Supabase，**严禁半截 PATCH**，必须全量读出 → 变更 → 全量写入。
- 采用毫秒级逻辑时钟（`Date.now()`）作为版本标记，解决跨端冲突。

### ③ 敏感凭据绝对隔离（安全底线）
- **严禁**将用户的 `aiApiKey`、`providerApiKeys`（OpenAI, Anthropic, DeepSeek 等私钥）同步到任何云端。
- 同步上传前强制调用 `sanitizeConfigForSync()` 剥离敏感密钥。
- 云端拉取合并时，本地设备上已配置的密钥优先级最高，严禁被远端空值或缺失覆盖。

### ④ 空包与覆盖保护
- 本地 `journal` 为空且远端非空时，**强制跳过上传**并拉回远端，严禁开发期以空本地冲掉远端数据。
- 启动期注入的示例任务（id 为纯数字）不得覆盖远端真实用户待办。

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
