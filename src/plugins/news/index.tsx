import React from "react";
import type { PluginViewApi, TongyunPlugin } from "../host/types";
import { newsManifest } from "./manifest";

const NewsView = React.lazy(() =>
  import("../../components/NewsView").then((m) => ({ default: m.NewsView })),
);

/**
 * 朝花夕拾作为第一个内置插件挂到宿主上。
 *
 * 未隔离：NewsView 仍直接使用 localStorage 与 callAI，不经过 ctx.storage。
 * 宿主权限只约束 ctx.storage / saveTask / saveJournal。同一 JavaScript 进程没有安全沙箱。
 */
export const newsPlugin: TongyunPlugin = {
  manifest: newsManifest,
  sidebar: { label: "朝花夕拾", icon: "newspaper" },
  renderView(api: PluginViewApi) {
    return (
      <React.Suspense
        fallback={
          <div className="flex-grow flex items-center justify-center text-slate-400 text-sm py-20">
            <span className="animate-pulse">…</span>
          </div>
        }
      >
        <NewsView
          config={api.config}
          onSaveTask={api.saveTask ?? (() => {})}
          onSaveJournal={api.saveJournal ?? (() => {})}
        />
      </React.Suspense>
    );
  },
};
