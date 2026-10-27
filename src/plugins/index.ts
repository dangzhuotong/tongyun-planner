import { pluginRegistry } from "./core/registry";
import { pipelinePlugin } from "./pipeline";
import { restoreInstalledDynamicPlugins } from "./core/zipLoader";

export * from "./core/types";
export * from "./core/registry";
export * from "./core/database";
export * from "./core/zipLoader";
export * from "./core/PluginErrorBoundary";
export * from "./core/GenericPluginDataView";
export * from "./core/IframePluginView";

let initialized = false;

/**
 * 初始化并注册所有内置插件以及恢复已导入的动态插件
 */
export function initPlugins(): void {
  if (initialized) return;
  initialized = true;

  // 1. 注册官方内置插件
  pluginRegistry.register(pipelinePlugin);

  // 2. 恢复并挂载用户之前导入过的动态插件
  restoreInstalledDynamicPlugins();
}
