import React from "react";
import type { Task } from "../../types";

export type PluginCategory = "workflow" | "ai" | "integration" | "tool";

export interface PluginManifest {
  /** 插件唯一 ID，如 "pipeline" */
  id: string;
  /** 插件名称，如 "团队派工中枢 (Pipeline)" */
  name: string;
  /** 插件简介 */
  description: string;
  /** 版本号 */
  version: string;
  /** 图标组件或标识 */
  icon?: React.ReactNode;
  /** 分类 */
  category: PluginCategory;
  /** 作者或组织 */
  author?: string;
  /** 默认是否启用 */
  defaultEnabled?: boolean;
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
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload?: unknown) => void): () => void;
}

export interface TongyunPlugin {
  manifest: PluginManifest;

  /** 激活插件（如启动后台轮询、注册事件监听） */
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
