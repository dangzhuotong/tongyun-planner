import React from "react";
import type { Task } from "../../types";

export type PluginCategory =
  | "workflow"
  | "ai"
  | "integration"
  | "tool"
  | "media"
  | "custom";

export interface PluginDatabaseConfig {
  /** 存储类型：独立本地 SQLite、远端自定义库或复用手帐已有主库连接 */
  type: "sqlite" | "remote" | "shared";
  /** SQLite 文件名（如 "notes.db"），系统会自动隔离映射为 `sqlite:plugin_<id>_<name>` */
  name?: string;
  /** 当 type 为 "shared" 时，指向已有的全局连接："personal"（个人主库）或 "pipeline"（团队派工库） */
  sharedRef?: "personal" | "pipeline";
  /** 插件自定义远端数据库连接串（DSN），若未配置则读取插件配置项 */
  remoteDsnKey?: string;
  /** 插件首次载入/启用时自动执行的建表 DDL 语句列表 */
  initSql?: string[];
}

export interface PluginQueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface PluginDatabaseClient {
  /** 当前数据库类型 */
  readonly type: "sqlite" | "remote" | "mock";
  /** 执行 SQL 查询（SELECT），返回行数组 */
  select<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  /** 执行 SQL 写入或更新（INSERT / UPDATE / DELETE / DDL） */
  execute(sql: string, params?: unknown[]): Promise<PluginQueryResult>;
}

export interface PluginManifest {
  /** 插件唯一 ID，如 "quick-notes" */
  id: string;
  /** 插件名称，如 "灵感便签库" */
  name: string;
  /** 插件简介 */
  description: string;
  /** 版本号，如 "1.0.0" */
  version: string;
  /** 图标组件或字符串标识 */
  icon?: React.ReactNode | string;
  /** 分类 */
  category: PluginCategory;
  /** 作者或组织 */
  author?: string;
  /** 主页或仓库链接 */
  homepage?: string;
  /** 默认是否启用 */
  defaultEnabled?: boolean;
  /** 数据库配置声明 */
  database?: PluginDatabaseConfig;
  /** 是否为外部动态导入的插件 */
  isDynamic?: boolean;
  /** 动态插件安装时间戳 */
  installedAt?: number;
  /** UI 呈现配置 */
  ui?: {
    type: "workbench" | "sidebar" | "notes" | "custom";
    title?: string;
  };
}

export interface PluginViewProps {
  tasks: Task[];
  onAddTask?: (taskData: any) => Promise<void> | void;
  onEditTask?: (id: string, updates: Partial<Task>) => void;
  onTaskClick?: (task: Task) => void;
  onOpenSettings?: () => void;
}

export interface PluginContext {
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  /** 插件专属独立数据库客户端（统一本地 SQLite 与远端 DB） */
  db: PluginDatabaseClient;
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload?: unknown) => void): () => void;
}

export interface TongyunPlugin {
  manifest: PluginManifest;

  /** 激活插件（如启动后台轮询、创建数据库表、注册事件监听） */
  activate?: (context: PluginContext) => void | Promise<void>;

  /** 停用插件（如清理定时器、取消订阅，彻底释放资源） */
  deactivate?: () => void | Promise<void>;

  /** 顶层工作台扩展点（如 Agent 看板切换） */
  workbenchView?: {
    id: string;
    label: string;
    render: (props: PluginViewProps) => React.ReactNode;
  };

  /** 侧栏导航扩展点（可选） */
  sidebarItem?: {
    id: string;
    label: string;
    icon: React.ReactNode;
    render: (props: PluginViewProps) => React.ReactNode;
  };

  /** 插件专有配置面板（可选） */
  renderSettings?: () => React.ReactNode;
}

export interface DynamicPluginPackage {
  manifest: PluginManifest;
  code?: string;
  html?: string;
  readme?: string;
  rawZipBase64?: string;
  installedAt: number;
}
