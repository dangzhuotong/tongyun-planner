import { pluginRegistry } from "./core/registry";
import { pipelinePlugin } from "./pipeline";

export * from "./core/types";
export * from "./core/registry";
export * from "./core/PluginErrorBoundary";

let initialized = false;

/**
 * 初始化并注册所有内置插件
 */
export function initPlugins(): void {
  if (initialized) return;
  initialized = true;

  // 注册官方内置插件
  pluginRegistry.register(pipelinePlugin);
}
