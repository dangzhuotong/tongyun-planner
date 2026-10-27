import JSZip from "jszip";
import React from "react";
import type {
  DynamicPluginPackage,
  PluginManifest,
  PluginViewProps,
  TongyunPlugin,
} from "./types";
import { pluginRegistry } from "./registry";
import { GenericPluginDataView } from "./GenericPluginDataView";
import { IframePluginView } from "./IframePluginView";

const DYNAMIC_PLUGINS_KEY = "tongyun_dynamic_plugins";

/**
 * 将 ArrayBuffer 转为 Base64 字符串以便持久化
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== "undefined" ? btoa(binary) : "";
}

/**
 * 将 Base64 字符串转为 ArrayBuffer
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = typeof atob !== "undefined" ? atob(base64) : "";
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 解析并校验上传的插件 .zip 压缩包
 */
export async function parsePluginZip(
  data: ArrayBuffer | Uint8Array | Blob | File,
): Promise<DynamicPluginPackage> {
  const zip = await JSZip.loadAsync(data);

  // 1. 读取必须的 manifest.json
  const manifestFile =
    zip.file("manifest.json") ||
    zip.file(/manifest\.json$/i)[0];

  if (!manifestFile) {
    throw new Error("插件压缩包中未找到 manifest.json 描述文件");
  }

  const manifestText = await manifestFile.async("string");
  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (err) {
    throw new Error(`manifest.json 格式非法，无法解析为 JSON: ${String(err)}`);
  }

  if (!manifest.id || typeof manifest.id !== "string") {
    throw new Error("manifest.json 中必须包含唯一的 id 字段");
  }
  if (!manifest.name || typeof manifest.name !== "string") {
    throw new Error("manifest.json 中必须包含 name 字段");
  }

  // 2. 读取可选的 index.html / index.js / README.md
  const htmlFile =
    zip.file("index.html") || zip.file(/index\.html$/i)[0];
  const html = htmlFile ? await htmlFile.async("string") : undefined;

  const jsFile =
    zip.file("index.js") || zip.file("main.js") || zip.file(/\.js$/i)[0];
  const code = jsFile ? await jsFile.async("string") : undefined;

  const readmeFile =
    zip.file("README.md") || zip.file("readme.md");
  const readme = readmeFile ? await readmeFile.async("string") : undefined;

  // 3. 转 Base64 留底供持久化与二次导出
  let rawZipBase64: string | undefined;
  if (data instanceof Blob) {
    const buf = await data.arrayBuffer();
    rawZipBase64 = bufferToBase64(buf);
  } else if (data instanceof ArrayBuffer) {
    rawZipBase64 = bufferToBase64(data);
  } else if (ArrayBuffer.isView(data)) {
    rawZipBase64 = bufferToBase64(data.buffer);
  }

  return {
    manifest: {
      ...manifest,
      isDynamic: true,
      category: manifest.category || "custom",
    },
    code,
    html,
    readme,
    rawZipBase64,
    installedAt: Date.now(),
  };
}

/**
 * 将 DynamicPluginPackage 包装为可运行的 TongyunPlugin 实例
 */
export function createDynamicPluginFromPackage(
  pkg: DynamicPluginPackage,
): TongyunPlugin {
  const { manifest, html } = pkg;

  const renderView = (props: PluginViewProps) => {
    // 若包内含有 index.html，挂载带双向通信网桥的隔离沙箱
    if (html) {
      return React.createElement(IframePluginView, {
        pluginId: manifest.id,
        htmlContent: html,
        manifest,
        viewProps: props,
      });
    }

    // 默认或 Schema 驱动：挂载内置数据管理看板
    return React.createElement(GenericPluginDataView, {
      pluginId: manifest.id,
      manifest,
      viewProps: props,
    });
  };

  return {
    manifest,
    workbenchView: {
      id: manifest.id,
      label: manifest.name,
      render: renderView,
    },
    sidebarItem: {
      id: manifest.id,
      label: manifest.name,
      icon: manifest.icon || "📦",
      render: renderView,
    },
  };
}

/**
 * 获取本地已持久化保存的所有动态插件包
 */
export function getInstalledDynamicPackages(): DynamicPluginPackage[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DYNAMIC_PLUGINS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("[zipLoader] Failed to read dynamic plugins:", e);
    return [];
  }
}

/**
 * 保存动态插件包到本地存储
 */
function saveDynamicPackages(packages: DynamicPluginPackage[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DYNAMIC_PLUGINS_KEY, JSON.stringify(packages));
  } catch (e) {
    console.warn("[zipLoader] Failed to save dynamic plugins:", e);
  }
}

/**
 * 安装 .zip 插件包：解压校验 -> 持久化 -> 动态注册到系统
 */
export async function installZipPlugin(
  fileOrBuffer: File | ArrayBuffer | Blob,
): Promise<TongyunPlugin> {
  const pkg = await parsePluginZip(fileOrBuffer);
  const plugin = createDynamicPluginFromPackage(pkg);

  // 保存到本地动态包存储
  const existing = getInstalledDynamicPackages().filter(
    (p) => p.manifest.id !== pkg.manifest.id,
  );
  existing.push(pkg);
  saveDynamicPackages(existing);

  // 注册并激活
  pluginRegistry.register(plugin);
  pluginRegistry.enable(plugin.manifest.id);

  return plugin;
}

/**
 * 卸载动态插件
 */
export function uninstallDynamicPlugin(pluginId: string): boolean {
  const packages = getInstalledDynamicPackages();
  const next = packages.filter((p) => p.manifest.id !== pluginId);
  saveDynamicPackages(next);

  // 从 Registry 卸载注销
  return pluginRegistry.unregister(pluginId);
}

/**
 * 导出已安装插件为 .zip 文件
 */
export async function exportPluginZip(pluginId: string): Promise<Blob | null> {
  const pkg = getInstalledDynamicPackages().find((p) => p.manifest.id === pluginId);
  if (!pkg) return null;

  if (pkg.rawZipBase64) {
    const buf = base64ToBuffer(pkg.rawZipBase64);
    return new Blob([buf], { type: "application/zip" });
  }

  // 现场用 JSZip 重新打包
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(pkg.manifest, null, 2));
  if (pkg.html) zip.file("index.html", pkg.html);
  if (pkg.code) zip.file("index.js", pkg.code);
  if (pkg.readme) zip.file("README.md", pkg.readme);

  return await zip.generateAsync({ type: "blob" });
}

/**
 * 生成并提供内置官方演练示例插件：「便签灵感库」(.zip 格式)
 */
export async function generateQuickNotesSampleZip(): Promise<Blob> {
  const zip = new JSZip();

  const manifest: PluginManifest = {
    id: "quick-notes",
    name: "便签灵感库",
    description: "随时记录闪念与便签，独立 SQLite 数据表存储与检索",
    version: "1.0.0",
    category: "tool",
    author: "橦云团队",
    defaultEnabled: true,
    database: {
      type: "sqlite",
      name: "quick_notes.db",
      initSql: [
        `CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT,
          content TEXT,
          category TEXT,
          created_at INTEGER
        )`,
      ],
    },
    ui: {
      type: "notes",
      title: "灵感便签看板",
    },
  };

  const readme = `# 便签灵感库插件 (Quick Notes)
这是一个完全开箱即用的官方示例插件，展示微内核架构下的特性：
1. **零代码接入**：无需重新编译主程序，直接以 .zip 格式导入。
2. **专属独立 SQLite 数据库**：自动分配 \`quick_notes.db\` 存储，零外部依赖。
3. **安全隔离**：全生命周期托管与优雅启停。
`;

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("README.md", readme);

  return await zip.generateAsync({ type: "blob" });
}

/**
 * 启动时恢复已安装的所有动态插件
 */
export function restoreInstalledDynamicPlugins(): void {
  const packages = getInstalledDynamicPackages();
  for (const pkg of packages) {
    try {
      const plugin = createDynamicPluginFromPackage(pkg);
      pluginRegistry.register(plugin);
    } catch (e) {
      console.warn(`[zipLoader] Failed to restore dynamic plugin "${pkg.manifest.id}":`, e);
    }
  }
}
