# 项目架构

本文档描述 TongYun Planner 的技术架构和设计决策。

## 整体架构

TongYun Planner 采用 Tauri 框架构建，结合了 Web 技术的灵活性和原生应用的性能。

```
┌─────────────────────────────────────┐
│           Tauri 应用窗口            │
├─────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  │
│  │   主窗口    │  │  小组件窗口 │  │
│  │  (React)    │  │   (React)   │  │
│  └─────────────┘  └─────────────┘  │
├─────────────────────────────────────┤
│           Tauri 核心层              │
│  ┌─────────────────────────────┐   │
│  │  命令系统 (Rust)            │   │
│  │  文件系统访问               │   │
│  │  窗口管理                   │   │
│  │  数据持久化                 │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│           操作系统层                │
└─────────────────────────────────────┘
```

## 前端架构

### 技术栈
- **React 19**：用于构建用户界面
- **TypeScript**：提供类型安全
- **Vite 7**：快速构建工具
- **Tailwind CSS 4**：实用优先的 CSS 框架
- **Framer Motion**：动画库
- **Lucide React**：图标库

### 组件结构
```
src/
├── components/           # React 组件
│   ├── MatrixView.tsx    # 四象限矩阵视图
│   ├── ListView.tsx      # 列表视图
│   ├── CalendarView.tsx  # 日历视图
│   ├── Sidebar.tsx       # 侧边栏
│   ├── SettingsView.tsx  # 设置页面
│   ├── WidgetWindow.tsx  # 小组件窗口
│   └── ...               # 其他组件
├── App.tsx               # 主应用组件
├── types.ts              # TypeScript 类型定义
├── constants.ts          # 常量和配置
└── index.css             # 全局样式
```

### 状态管理
使用 React Hooks 进行状态管理：
- `useState`：组件本地状态
- `useEffect`：副作用处理
- `useCallback`：性能优化
- `useMemo`：计算缓存

### 数据流
```
用户交互 → 事件处理 → 状态更新 → UI 重新渲染
                ↓
        Tauri 命令调用
                ↓
        Rust 后端处理
                ↓
        数据持久化
```

## 后端架构

### 技术栈
- **Tauri 2**：桌面应用框架
- **Rust**：系统编程语言
- **Tauri Store**：数据持久化插件

### 核心功能
- 窗口管理（主窗口、小组件窗口）
- 文件系统访问
- 数据持久化
- 系统托盘集成
- 跨平台兼容性

### 命令系统
Tauri 提供了前端与后端的通信机制：
```rust
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    // 处理逻辑
    Ok("result".to_string())
}
```

## 数据存储 vs 数据同步

项目中存在两层看似重叠、实则职责不同的存储抽象，请勿混淆：

- **`src/utils/storage/` —— 本地/附件存储后端（StorageManager）**
  - 负责"数据落在哪里"：支持 `local`（浏览器 localStorage / Tauri Store）、`webdav`、`oss`、`cos`、`supabase` 多种后端。
  - 主要用于**附件**（图片/文件）的上传、下载、公开 URL 生成（`getAttachmentPath` / `uploadFile` / `getFileUrl`）。
  - `storageManager.setBackend()` 切换的是附件的落盘位置。

- **`src/utils/sync/` —— 跨设备同步引擎（SyncEngine）**
  - 负责"多设备之间如何保持一致"：支持 `webdav`、`supabase` 两种同步后端。
  - 以**分类增量 + manifest 版本比较**方式推送/拉取完整业务数据（任务、便签、习惯等），处理冲突。
  - `syncEngine.setBackend()` 切换的是跨设备同步通道。

> 注意：两层都支持 `webdav` / `supabase`，但**用途不同**——前者是附件存储位置，后者是数据同步通道，二者在 `SettingsView` 中是独立的两组配置，互不影响。修改其中一组不会自动改写另一组。

## 快捷键

- **Cmd / Ctrl + K**：打开命令面板（全局；在 `App.tsx` 中监听 `keydown`，调用 `CommandPalette`）。命令面板内可快速切换视图、新建任务、启动专注等。

## 数据模型

### 任务 (Task)
```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  category: TaskCategory;
  dueDate?: string;        // YYYY-MM-DD
  dueTime?: string;        // HH:mm
  isFavorite?: boolean;
  isPinned?: boolean;
  repeat?: RepeatType;     // 重复规则（含 rrule 字符串）
  priority?: "high" | "medium" | "low";
  subtasks?: SubTask[];
  tags?: string[];
  dependsOn?: string[];    // 前置任务 ID
  attachments?: Attachment[];
}
```

### 任务类别 (TaskCategory)
```typescript
type TaskCategory =
  | "urgent-important"
  | "urgent-not-important"
  | "important-not-urgent"
  | "not-urgent-not-important";
```

### 自定义配置 (CustomizationConfig)
```typescript
interface CustomizationConfig {
  qColors: { /* 四象限颜色 */ };
  cardBackground: "white" | "grid" | "lined" | "watercolor" | "doodle";
  pinType: "pin" | "tape" | "clip" | "heart" | "smiley";
  interfaceGlass?: "light" | "matte" | "solid";
  watercolorStyle?: "oasis" | "aurora" | "sunny" | "none";
  fontFamily?: "sans" | "rounded" | "serif";
  enableSunsetMode?: boolean;
  sunsetStartHour?: number;
  sunsetEndHour?: number;
  sunsetWarmth?: number;
  aiProvider?: "openai" | "anthropic";
  aiApiKey?: string;
  aiEndpoint?: string;
  aiModel?: string;
  aiAutoCategorize?: boolean;
}
```

## 构建系统

### 开发环境
```bash
npm run tauri dev
```
- 启动 Vite 开发服务器
- 启动 Tauri 开发模式
- 热重载支持

### 生产构建
```bash
npm run tauri build
```
- 构建前端资源
- 编译 Rust 代码
- 生成平台特定安装包

### 构建产物
- Windows：`.msi` 安装包
- macOS：`.dmg` 安装包
- Linux：`.deb`、`.AppImage` 安装包

## 性能优化

### 前端优化
- 代码分割和懒加载
- 虚拟滚动（长列表）
- 图片懒加载
- 缓存策略

### 后端优化
- Rust 零成本抽象
- 异步 I/O
- 内存安全
- 跨平台优化

## 安全考虑

### 数据安全
- 本地数据加密（可选）
- API 密钥安全存储
- WebDAV 连接加密

### 应用安全
- CSP 策略
- 权限最小化
- 输入验证

## 扩展性

### 插件系统
Tauri 提供了插件系统，可以扩展应用功能：
- 文件系统插件
- 通知插件
- 全局快捷键插件
- 剪贴板插件（路线图 B 已取消，未采用）

### 自定义主题
支持多种自定义选项：
- 颜色主题
- 字体样式
- 背景图案
- 界面布局

## 部署

### 桌面应用
- Windows：通过 `.msi` 安装包分发
- macOS：通过 `.dmg` 安装包分发
- Linux：通过 `.deb`、`.AppImage` 分发

### 自动更新
Tauri 支持自动更新功能，可以配置更新服务器。

## 未来规划

### 功能扩展
- 多语言支持
- 云端同步
- 移动端应用
- 团队协作

### 技术升级
- React Server Components
- WebAssembly 集成
- 边缘计算支持