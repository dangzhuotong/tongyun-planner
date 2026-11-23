import type { TongyunPlugin } from "./host/types";

/**
 * 公开构建始终是空数组。
 * 私有组合构建通过环境变量 TONGYUN_EXTRA_PLUGINS 把这个模块替换成仓外文件。
 * 公开仓库不放置私有插件源码。
 */
export const extraPlugins: TongyunPlugin[] = [];
