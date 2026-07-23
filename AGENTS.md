# 开发历史归档

## Session 1 (2026-07-06)

### 完成项
- **缓存与重试机制** (`src/utils/cache.ts`): 实现 `getCachedData<T>` / `setCachedData<T>` / `clearCache` / `fetchWithRetry`
- **TrendingView.tsx**: localStorage 缓存（30min TTL）+ 自动重试（1次）
- **RSSView.tsx**: localStorage 缓存（30min TTL），先显示缓存再后台刷新，失败保留缓存
- **ExploreView.tsx**: `addFeed` / `refreshFeed` 添加 `fetchWithRetry`（1次重试）
- **CalendarView.tsx**: 修复心情选择器弹出位置（`left-0` → `right-0`，加 `relative` 包装器）
- **Scale 类修复**: `scale-101/102/103` → `scale-105`, `scale-120` → `scale-110`, `active:scale-97/99` → `active:scale-95`（跨5个文件）
- **Sidebar.tsx**: 修复文件编码损坏（中文乱码导致 Babel 语法报错），通过 `git checkout HEAD` 恢复
- **SettingsView.tsx**: 新增"AI 智能体集成"卡片，复制 WebDAV 工具定义（含预填凭据、所有数据类型 schema、curl 示例、manifest.json 版本管理说明）
- **Dark mode**: 为 AI 集成卡片添加 `dark:` Tailwind 变体支持
- **AI tool prompt**: 多轮迭代优化（去除对话式风格→纯工具定义→包含所有 WebDAV 数据类型→去除 index.html 需求→新增 manifest.json 版本管理）

### 关键决策
- localStorage 缓存替代内存缓存，支持跨页面/跨会话持久化
- fetchWithRetry(1次重试, 1.5s延迟) 平衡响应速度与网络容错
- AI 工具定义使用自包含 Markdown 而非 OpenAI function-calling JSON，兼容多种 AI 助手
- manifest.json 版本管理必不可少：WebDAV 写入后不更新 manifest 则同步不会拉取
- 不要求生成 index.html（用户反馈后去除）

### 相关文件
- `src/utils/cache.ts`
- `src/components/news/TrendingView.tsx`
- `src/components/news/RSSView.tsx`
- `src/components/ExploreView.tsx`
- `src/components/CalendarView.tsx`
- `src/utils/sync/types.ts`
- `src/utils/sync/webdavProvider.ts`
- `src/components/SettingsView.tsx`

## Session 2 (2026-07-06)

### 完成项
- **AGENTS.md**: 创建本文件，用于跨会话持久记录开发历史
- **git pull**: 拉取远端提交（包含已在 Session 1 中讨论的 dark mode 修改、Android/iOS 图标资源、Gitee 镜像脚本等）
- **Dark mode 全量扫描**: 确认远端 commit `7c5c55d` 已包含 TrendingView / RSSView / ExploreView / CalendarView 的 `dark:` 变体，本地未丢失改动

### 关键决策
- AGENTS.md 作为持久化归档文件，解决跨会话上下文丢失问题
- `.opencode/` 目录部分 gitignore，不适合放归档文件，因此放项目根目录

### 相关文件
- `AGENTS.md`（本文件）

## Session 3 (2026-07-10)

### 背景
用户提出产品路线图 A-E，并确定「先做 A，之后立刻做 B」：
- A. 资讯 → 行动联动：RSS / Trending / Explore 里一键「稍后读 / 存为任务 / 收藏到日记」
- B. 全局剪贴板捕获（桌面端专属）：复制文字/链接时弹窗「存为任务 / 便签 / 日记」——**已取消（2026-07-21）**
- C. 智能规划：智能日计划编排 + 系统通知/到期提醒
- D. 日记延续：#标签浏览 + 单篇/整本导出
- E. 生活向：轻量记账 + 本地语音备忘（用户确认不做）

### 完成项（Feature A）
- **资讯→行动联动** 全量打通：每条资讯新增「稍后读 / 存为任务 / 收藏到日记」一键操作
- 新增 `src/components/news/newsActions.ts`（NewsRef / NewsActions 类型）与 `src/components/news/NewsItemActions.tsx`（三按钮组件，hover 显隐）
- `App.tsx` 新增 `handleNewsSaveTask`（→ tasksHook.handleAddTask，category=important-not-urgent, priority=low, tags=["资讯"]）与 `handleNewsSaveJournal`（→ handleUpsertJournal，新建 JournalEntry）
- 经 `MainLayout` 透传 `onNewsSaveTask/onNewsSaveJournal` 到 `NewsView`（注意：`<NewsView>` 渲染在 `MainLayout` 内，不在 `AppInner` 直接作用域）
- `NewsView` 增加 toast 反馈，并把 `actions` 下发到 TrendingView / GitHubView / RSSView / BookmarksView / ExploreView
- **ExploreView 此前未被任何地方渲染**，本次新增为 NewsView 的「视野」子标签页（此前是孤立死代码）

### 关键决策
- 「稍后读」复用既有 bookmark 机制（toggleBookmark，title+link 作唯一键）
- 存为任务默认归入「重要不紧急」象限、低优先级、打「资讯」标签，降低打扰
- 动作按钮默认 opacity-0，hover/focus 时显现，避免污染信息流视觉

### 相关文件
- `src/components/news/newsActions.ts`
- `src/components/news/NewsItemActions.tsx`
- `src/components/news/TrendingView.tsx`
- `src/components/news/GitHubView.tsx`
- `src/components/news/RSSView.tsx`
- `src/components/news/BookmarksView.tsx`
- `src/components/ExploreView.tsx`
- `src/components/NewsView.tsx`
- `src/App.tsx`

### 待办
- ~~下一步 B（剪贴板）~~ → **已取消**，不再实现

## Session 4 (2026-07-10)

### 背景
路线图 D（日记延续）第一阶段：补齐「#标签浏览」与「单篇/整本 Markdown 导出」。此前日记已支持 Markdown 正文、双向链接、标签提取（`extractJournalTags`），但无标签筛选入口，也无导出能力。

### 完成项（Feature D 补全）
- **标签浏览**：左侧栏搜索框下方新增标签云，自动聚合所有日记/笔记正文中的 `#标签`（去重排序，按 locale 排序）
  - 点击标签 → `activeTag` 筛选日记与笔记列表；再次点击或「清除筛选」取消
  - 标题区顶部新增「导出此篇」按钮（Download 图标）→ 当前选中条目导出为 `journal-{date|title}.md`
- **整本导出**：右侧栏顶部新增「导出全部日记」按钮 → 按 `updatedAt` 降序合并所有条目为一个 `tongyun-journal-all-{date}.md`，条目间以 `---` 分隔，含元数据与 AI 评语
- 新增模块级工具函数 `entryToMarkdown(entry)` / `downloadMarkdown(filename, content)`（Blob + a.download）
- i18n：zh-CN / en 各增补 `tags / allTags / clearTag / exportCurrent / exportAll / noTags`

### 关键决策
- 标签筛选复用语义：`extractJournalTags` 仅认 `#中文英文数字_-`，与正文编辑器保持一致，避免两套解析逻辑
- 导出纯前端实现（无需 Tauri 权限），浏览器直接下载 `.md`，零后端依赖
- 整本导出按更新时间排序而非日期，使笔记与日记混排时顺序更合理

### 相关文件
- `src/components/JournalView.tsx`
- `src/i18n/zh-CN.ts`
- `src/i18n/en.ts`

### 验证
- `npm run typecheck` 通过（仅预存的 `ali-oss` 第三方依赖缺失报错，与本次无关）

### 待办（继续推进）
- D 还可做：标签固定侧栏分组视图、按年/月归档导出、导出为 PDF/HTML
- E / B 均已取消

## Session 5 (2026-07-10)

### 背景
路线图 C（智能规划）：经扫描发现「智能日计划编排」**已实现**——Dashboard 已有「AI 今日建议」卡片（`generateDailySuggestion` + 当日缓存，DashboardView:544-571），进入 Dashboard 自动生成、可手动重生成。C 真正缺失的仅为**任务到期系统通知**（此前只有番茄钟通知，无任务到期提醒）。用户确认不做 E（轻量记账）。

### 完成项（Feature C 补全）
- **任务到期系统通知**：`App.tsx` 新增每分钟扫描 effect
  - 条件：今日到期（dueDate===today）且有具体时间（dueTime）、未完成任务
  - 触发：到期前 15 分钟「即将截止」提醒 + 到期时刻起 1 小时内「已到截止时间」提醒
  - 仅 `main` 窗口触发（`windowLabelRef`），避免 widget/便签多窗口重复弹通知
  - `notifiedDueRef` Set 防止同一任务重复通知；依赖 Notification.permission==="granted"
  - 文案随 locale（zh-CN / en）切换

### 关键决策
- 复用启动期已 `requestPermission()` 的 Notification 权限（App.tsx:234），无需新增授权流程
- 到期通知走桌面系统通知（非 EmailConfig 邮件提醒，邮件提醒为独立未实现项）
- 扫描窗口用「到期前 15min ~ 到期后 1h」，平衡及时性与不打扰
- 智能日计划编排（AI 今日建议）确认已存在，无需重复实现

### 相关文件
- `src/App.tsx`

### 验证
- `npm run typecheck` 通过（零报错）

### 待办（下一步）
- ~~B 全局剪贴板捕获~~ → **已取消**
- C 还可做：无 `dueTime` 的今日任务提醒、通知点击聚焦/完成任务

## Session 6 (2026-07-10)

### 背景
用户反馈日记页「还是不好，应该跟日记本一样」——原实现是笔记工具范式（左侧列表 + 中间 Markdown 编辑器 + 双链），缺真实日记本的沉浸感与翻页仪式感。经确认方向为「翻页日记本」。

### 完成项（JournalView 重构为翻页日记本）
- **双模式**：日记（按日期翻页）/ 随记（笔记），左侧目录切换
- **翻页交互**：每日一页 + 左右翻页箭头（严格 ±1 天，含空白页）+ 回到今天按钮 + 未来日标记
- **纸张质感**：暖纸色 `#FCFBF7`、书脊装订阴影/渐变、衬线大日期标题、textarea 淡横线背景（lineHeight 32px 近似对齐）
- **页眉**：大日期 + 星期 + 农历（`lunar-javascript` 动态导入，失败忽略，已验证返回「五月廿六」）+ 当日心情 emoji
- **关联区改为跟随当前翻页日期**（任务/习惯/番茄按 viewDate 过滤，而非固定 today）
- 保留：搜索、`#标签` 筛选、Markdown 工具栏、双向链接、AI 评语、单篇/整本导出
- i18n：zh-CN / en 各增补 `prevDay / goToday / futureDay / diaryPlaceholder`
- 编辑器主体抽为 `editorInner` 片段，日记/随记复用同一张「纸」，仅 diary 多书脊+翻页

### 关键决策
- 翻页严格 ±1 天，空白页输入即懒创建 daily 条目（`commit` 默认 linkKey/date=viewDate），避免预建空条目污染列表
- 笔记作为「随记」独立模式，复用同一纸张编辑器
- 农历用动态 `import("lunar-javascript")` + try/catch，不影响主流程

### 相关文件
- `src/components/JournalView.tsx`
- `src/i18n/zh-CN.ts`
- `src/i18n/en.ts`

### 验证
- `npm run typecheck` 零报错
- `lunar-javascript` API 已验证（`Solar.fromDate(...).getLunar().getMonthInChinese()+"月"+getDayInChinese()` → 五月廿六）

### 待办（继续打磨）
- 纸张横线与预览区/不同字号的对齐可进一步精调
- 翻页动画（page-flip 过渡）可加 framer-motion
- 双链/标签在翻页本子里可做得更「手帐」化（贴纸、手绘感）

## Session 7 (2026-07-10)

### 背景
用户反馈：日记本里不应有 Markdown 格式（工具栏、双栏预览、`#`/`[[ ]]` 语法），「就写个日记啊，要氛围就行」。决定把日记书写精简为**纯文字、所见即所得**。

### 完成项（去 Markdown 化）
- 移除 Markdown 工具栏（标题/加粗/斜体/列表/待办/代码/链接按钮）、双栏实时预览、模板下拉
- 移除双向链接（`[[ ]]`）与反向链接区（依赖 JournalMarkdown 渲染）；`JournalMarkdown`/`contentLinksTo` 不再被 JournalView 引用
- 书写区改为单栏纯文本 `textarea`（`font-serif` 衬线 + 横格背景），所见即所得
- 保留氛围要素：纸张/书脊质感、翻页（±1 天/回今天/未来标记）、大日期+星期+农历、当日心情、AI 温柔评语、标签 chips（仅展示，不强制语法）
- 右侧保留「今日关联」（任务/习惯/番茄，按 viewDate 过滤）；移除了反向链接块
- 导出仍为 Markdown（不影响书写体验）

### 关键决策
- 日记 = 纯文字记录；Markdown 仅作为「导出」格式保留，不进入书写界面
- 标签 `#灵感` 仍可写、可筛选、可随导出带出，但不再高亮为编辑语法

### 相关文件
- `src/components/JournalView.tsx`

### 验证
- `npm run typecheck` 零报错（清理了未用的 JOURNAL_TEMPLATES / DATE_RE / Sparkles import）

## Session 8 (2026-07-10)

### 背景
用户反馈：日记页左侧「列表」太显眼，冲淡写日记的沉浸感，希望改成「上边一个滑条选哪一天」。本次将左侧列表下沉，改为顶部日期滑条。

### 完成项（布局重构：列表 → 顶部日期滑条）
- 移除左侧大列表（日记/随记分组 + 搜索 + 标签常驻），改为**顶部一行**：模式切换（日记/随记）+ 可横滑日期滑条 + 搜索框 + 标签下拉（点击展开云）+ 新建按钮
- 日期滑条：生成过去 60 天 ~ 未来 7 天连续日期 chips，有日记的日子点亮圆点，当天高亮绿底，点击 `setCurrentDate` 跳天
- 随记模式：中间改为卡片网格（点击进入纸内编辑），不再依赖左侧列表
- 纸内翻页箭头（±1 天/回今天）与顶部滑条并存，两种跳天方式
- 右侧关联（心情/任务/习惯/番茄）保留

### 关键决策
- 滑条范围固定 60 天前 ~ 7 天后，覆盖绝大多数翻阅场景；超范围需翻页箭头或后续可加「跳到最早」
- 标签从常驻改为下拉，进一步弱化视觉权重，突出日记本主体
- 移除了未用的 `filteredDaily`/`dailyNotes`/`CalendarDays` 引用

### 相关文件
- `src/components/JournalView.tsx`

### 验证
- `npm run typecheck` 零报错

### 待办（继续打磨）
- 滑条可自动滚动定位当前天到可视区（scrollIntoView）
- 超范围日期（早于 60 天前）可通过翻页箭头到达，但滑条不显示；可加「跳到最早一篇」快捷

## Session 9 (2026-07-11)

### 背景
用户反馈：任务点击「完成」后，仍会出现在待办列表里（疑似云端同步把已完成任务又写回活动列表）。

### 根因
本地完成逻辑 `useTasks.handleComplete` 是对的（从 `tasks` 移除、移入 `completedTasks`）。
但 WebDAV 云端同步 `syncWebDAV` 采用按时间戳的 LWW：`pull()` 在 `push()` 之前执行，当远端
`tasks.json` 因多窗口/多端或时钟偏差而带更高版本号时，会把仍含该任务的远端数据写回
`aero_todos`，导致「完成」的任务又出现在活动列表。

### 完成项（修复）
- 新增 `dedupeActiveTasks(tasks, completed)`：剔除已存在于 `completed` 的任务 id
- `src/utils/sync/types.ts` 的 `getLocalSyncData()` 统一去重（供 pull / push / SYNC_APPLIED_EVENT 复用）
- `App.tsx` 的 `applySyncDataToState`（SYNC_APPLIED_EVENT 的中心消费者）去重
- `App.tsx` 启动 hydration 两路分支（store / localStorage 回退）均去重

### 关键决策
- 在「数据源」层去重而非仅渲染层：保证进度统计、云推送都不含重复，且无论脏数据如何进入
  localStorage 都不会再现「已完成却仍在列表」的观感
- 不改动完成/撤销的核心状态机，避免引入回归

### 相关文件
- `src/utils/sync/types.ts`
- `src/App.tsx`

### 验证
- `npm run typecheck` 零报错

## Session 10 (2026-07-11)

### 背景
延续 Session 9：「完成没反应、删都删不掉」。用户确认无云同步、单窗口、普通任务，并怀疑「本地数据不对」。上一轮 Session 9 的云端 LWW 去重不适用（用户没开云）。

### 根因
`src/App.tsx:117-146` 的「日记自动加入待办」同步 effect 依赖数组含 `tasksHook.tasks`，导致**每次任务状态变化（删除/完成）都会重跑该 effect**。当「日记自动加入待办」开关（`tongyun_journal_add_todo`，默认 false）开启时，effect 发现某日记对应的任务不存在（被删/被完成移走）→ 立即 `handleAddTask` 重建 → 表现就是「删都删不掉、完成弹回」。这是对用户全部症状唯一能自洽的**本地**（非云）机制。

### 完成项（修复）
- 新增 `tasksRef = useRef(tasksHook.tasks)`（`App.tsx:60`），render 期持续同步
- effect 内部 `const currentTasks = tasksRef.current`（不再读闭包里的 `tasksHook.tasks`）
- effect 依赖从 `[journal, tasksHook.tasks, journalAddTodo]` 改为 `[journal, journalAddTodo]`：effect 只在「日记变化 / 开关切换」时跑，不再因「任务增删改」重跑，从而删除/完成日记任务后不会被重建
- `useRef` 已在 `App.tsx:1` 导入（无需新增）

### 验证
- `npm run typecheck` 零报错
- Playwright（dev server :1420，注入 Tauri stub）实测：开启 `journalAddTodo` + 一篇 isDaily 日记 → 自动生成任务；删除该任务后 `aero_todos` 中对应条数归 0 并稳定（不再回弹到 1/2）。修复前会回弹重建

### 关键决策
- 不动 `handleComplete`/`handleDeleteTask` 状态机，仅在「数据源触发条件」层修复，避免回归
- dev 下 React StrictMode 会让该 effect 在挂载时双跑、产生一条重复日记任务（仅开发期伪影，生产构建单跑）；测试中以「删除全部卡片后计数是否回弹」判定，最终稳定为 0 即修复成立

### 相关文件
- `src/App.tsx`

### 给用户的确认建议
- 若症状仍存在，请在「设置 → 日记 → 日记自动加入待办」确认该开关状态；本修复保证：即便开启，删除/完成的日记任务也不会再自动复活
- 普通（非日记生成）任务本就与 effect 无关，删除/完成逻辑此前已验证正常

## Session 12 (2026-07-21)

### 完成项
- **移除习惯打卡**：删除 HabitsView / 侧栏入口 / 命令面板 / sync `habits` 分类
- **移除结构化心情**：删除 MoodPanel、日历心情点、moods/moodNotes/moodAttachments 状态；心情写在日记正文即可
- PersonalContext 仅保留日记 + 日历导航；同步 payload 不再含习惯/心情

## Session 13 (2026-07-21)

### 完成项
- **主页去重**：有「今日回顾」后，删除下方四格统计卡（剩余待办 / 已完成 / 进度 / 年度）及对应 CSS
- **专注统计**：番茄热力图旁的周趋势折线图改为「本周速览」（本周次数 / 活跃天数 / 对比上周），后改为热力图下方横排三格
- **日记心情**：日记页页眉恢复五级 emoji 心情（😞😔😐😊😄），写入 `JournalEntry.mood`；再点同一项清除；日期滑条有心情时显示 emoji
- **主页去重续**：删除「本周回顾」条（与今日回顾重复）；AI 建议/一言硬编码中文补 i18n
- **日记心情排版**：心情选择器从独占一行压缩到「回到今天」同行，更紧凑

### 相关文件
- `src/components/DashboardView.tsx`
- `src/components/AnalyticsView.tsx`
- `src/components/JournalView.tsx`
- `src/types.ts`
- `src/i18n/zh-CN.ts`
- `src/i18n/en.ts`
- `src/index.css`
- `.cursor/skills/tongyun-data/reference.md`

## Session 14 (2026-07-22)

### 完成项
- **番茄专注热力图重构升级**：
  - 时间跨度由 18 周扩展为 **26 周 (半年/182天)**
  - 实现 **响应式自适应铺满 (Responsive viewBox)**：使热力图 100% 优雅填满大卡片宽度，彻底解决原来右侧空出大片空白的问题
  - **4 维数据速览与连胜**：底部整合扩充为 4 维速览面板（本周番茄、活跃天数、对比上周、当前连续打卡 🔥 / 单日最高 🏆）
  - **统一组件与代码重构**：将 AnalyticsView 原有的局部内联热力图和速览逻辑统一收拢到 `FocusHeatmap.tsx` 组件，实现样式与逻辑复用，包含暗黑模式色阶适配与 i18n
  - **文档同步**：同步更新 `README.md` 与国际化语言包（zh-CN / en）

### 相关文件
- `src/components/FocusHeatmap.tsx`
- `src/components/AnalyticsView.tsx`
- `src/i18n/zh-CN.ts`
- `src/i18n/en.ts`
- `README.md`
- `AGENTS.md`

## Session 11 (2026-07-21)

### 背景
用户确认砍掉路线图 B（桌面剪贴板捕获）；其余体验加固按「降级诚实邮件 + 无时刻到期通知 + 同步完成态优先 + AI 建议加厚 + 日记小打磨」落地。

### 完成项
- **路线图 B**：正式取消（文档标注）
- **邮件降级诚实**：保留 SMTP 测试；到期/每日汇总开关灰显并标明未实现
- **无 dueTime 今日任务**：默认 09:00 系统通知
- **同步加固**：tasks↔completed 完成态优先交叉去重
- **AI 今日建议**：加厚习惯/番茄/心情上下文，失败可见
- **附件轻量清理**：hydrate 丢弃 legacy `data:` 项
- **日记**：翻页过渡 + 滑条外日期跳转

## Session 15 (2026-07-23)

### 完成项
- **全新【时光长廊 · 岁月印记】展示页 (MemoryView)**：
  - **月度记忆沉淀**：整合 `journal` 日记手帐、`completedTasks` 高光成果、`pomodoroLogs` 深度专注以及当日 Mood 心情。
  - **高光速览面板**：顶部显示当月积累的手账篇数、已完成任务项、专注小时数与常见 Mood 趋势。
  - **按月筛选与岁月时间轴 (Timeline Stream)**：自动解析所有记录月份，支持年月快速切换与全部/日记/高光/专注多分类筛选。
  - **拟物拍立得抽卡 (Memory Card Drawer)**：提供“抽取记忆手牌”温故知新交互，伴随 3D 翻牌弹窗呈现历史上的某一天或精彩瞬间。
  - **一键联动**：点击日记卡片可直接无缝跳转回日记手帐，查阅当日全文。
- **导航与国际化**：`Sidebar` 归档组新增“时光长廊”入口，同步补全 `zh-CN` / `en` 国际化文案。

### 相关文件
- `src/components/MemoryView.tsx`
- `src/components/Sidebar.tsx`
- `src/App.tsx`
- `src/types.ts`
- `src/i18n/zh-CN.ts`
- `src/i18n/en.ts`

## Session 16 (2026-07-23)

### 完成项
- **甘特图交互升华 (GanttView)**：
  - **拖拽排期**：支持直接按住甘特图中的任务区块拖拽放置到目标日期网格，自动更新截止日期 (`dueDate`)。
  - **依赖与搜索**：增加 `dependsOn` 依赖提示标记与关键词实时筛选，带有今日醒目标线 (`Today line`)。
- **倒数日农历支持 (CountdownView)**：
  - **农历生日/节日重复**：新增 `isLunar` 勾选项，基于 `lunar-javascript` 自动推算今年或下一年的目标公历日期，实现农历倒计时准确计算。
- **全局命令面板全搜 (CommandPalette / Cmd+K)**：
  - **全文深度搜索**：命令面板打通对 `journal` 日记标题与正文摘要的模糊检索。
  - **快捷新建指令**：增加快捷写日记、搜索“时光长廊”等指令。
- **时光长廊暗黑模式修复 (MemoryView)**：
  - 为顶部面板、月度概览卡片、时间轴流水卡片、抽卡弹窗补全全套 `dark:` 暗黑适配类，保证在暗黑模式下文本对比度与视觉柔和度。
- **四象限看板交互与法则升级 (MatrixView)**：
  - **跨象限拖拽放置**：实现按住任务卡片直接拖投至任意象限，即时更改任务分类。
  - **容量占比与方法论指引**：增加象限任务比重百分比，内置“艾森豪威尔法则指引”展开卡片。

### 相关文件
- `src/components/MemoryView.tsx`
- `src/components/MatrixView.tsx`
- `src/components/GanttView.tsx`
- `src/components/CountdownView.tsx`
- `src/components/CommandPalette.tsx`
- `src/App.tsx`
- `src/types.ts`
