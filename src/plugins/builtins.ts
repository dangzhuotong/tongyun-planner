import type { TongyunPlugin } from "./host/types";
import { newsPlugin } from "./news";

/** 生产环境只认这个数组。测试要证明能再登记一个插件时，把 fixture 追加进 load()，不要改宿主。 */
export const builtinPlugins: TongyunPlugin[] = [newsPlugin];
