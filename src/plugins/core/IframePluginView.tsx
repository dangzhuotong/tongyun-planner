import React, { useEffect, useRef, useState, useMemo } from "react";
import type { PluginManifest, PluginViewProps } from "./types";
import { getPluginDatabase } from "./database";

interface Props {
  pluginId: string;
  htmlContent: string;
  manifest: PluginManifest;
  viewProps: PluginViewProps;
}

export const IframePluginView: React.FC<Props> = ({
  pluginId,
  htmlContent,
  manifest,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // 注入轻量通信网桥脚本
  const injectedHtml = useMemo(() => {
    const bridgeScript = `
<script>
(function() {
  const reqMap = new Map();
  let reqSeq = 0;

  window.addEventListener("message", function(e) {
    const msg = e.data;
    if (!msg || !msg.type || !msg.reqId) return;
    if (reqMap.has(msg.reqId)) {
      const { resolve, reject } = reqMap.get(msg.reqId);
      reqMap.delete(msg.reqId);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.data);
    }
  });

  window.tongyun = {
    pluginId: ${JSON.stringify(pluginId)},
    db: {
      select: function(sql, params) {
        return new Promise(function(resolve, reject) {
          const id = ++reqSeq;
          reqMap.set(id, { resolve, reject });
          window.parent.postMessage({
            source: "tongyun-plugin",
            pluginId: ${JSON.stringify(pluginId)},
            type: "DB_SELECT",
            reqId: id,
            sql: sql,
            params: params || []
          }, "*");
        });
      },
      execute: function(sql, params) {
        return new Promise(function(resolve, reject) {
          const id = ++reqSeq;
          reqMap.set(id, { resolve, reject });
          window.parent.postMessage({
            source: "tongyun-plugin",
            pluginId: ${JSON.stringify(pluginId)},
            type: "DB_EXECUTE",
            reqId: id,
            sql: sql,
            params: params || []
          }, "*");
        });
      }
    },
    storage: {
      get: function(key) {
        return new Promise(function(resolve) {
          const id = ++reqSeq;
          reqMap.set(id, { resolve: resolve, reject: resolve });
          window.parent.postMessage({
            source: "tongyun-plugin",
            pluginId: ${JSON.stringify(pluginId)},
            type: "STORAGE_GET",
            reqId: id,
            key: key
          }, "*");
        });
      },
      set: function(key, val) {
        window.parent.postMessage({
          source: "tongyun-plugin",
          pluginId: ${JSON.stringify(pluginId)},
          type: "STORAGE_SET",
          key: key,
          value: val
        }, "*");
      }
    }
  };
})();
</script>
`;
    // 在 head 之后插入，若无 head 则在最前面插入
    if (htmlContent.includes("<head>")) {
      return htmlContent.replace("<head>", `<head>${bridgeScript}`);
    }
    return bridgeScript + htmlContent;
  }, [htmlContent, pluginId]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "tongyun-plugin" || data.pluginId !== pluginId) {
        return;
      }

      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      try {
        const db = await getPluginDatabase(pluginId, manifest);

        if (data.type === "DB_SELECT") {
          const res = await db.select(data.sql, data.params);
          iframe.contentWindow.postMessage(
            { type: "DB_SELECT_RES", reqId: data.reqId, data: res },
            "*",
          );
        } else if (data.type === "DB_EXECUTE") {
          const res = await db.execute(data.sql, data.params);
          iframe.contentWindow.postMessage(
            { type: "DB_EXECUTE_RES", reqId: data.reqId, data: res },
            "*",
          );
        } else if (data.type === "STORAGE_GET") {
          const val = localStorage.getItem(`plugin:${pluginId}:${data.key}`);
          iframe.contentWindow.postMessage(
            { type: "STORAGE_GET_RES", reqId: data.reqId, data: val },
            "*",
          );
        } else if (data.type === "STORAGE_SET") {
          localStorage.setItem(`plugin:${pluginId}:${data.key}`, String(data.value));
        }
      } catch (err) {
        iframe.contentWindow.postMessage(
          {
            type: "DB_ERROR",
            reqId: data.reqId,
            error: err instanceof Error ? err.message : String(err),
          },
          "*",
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [pluginId, manifest]);

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-white dark:bg-[#1A1C22] rounded-2xl overflow-hidden border border-slate-200/80 dark:border-[#2D3039] shadow-xs relative">
      <iframe
        ref={iframeRef}
        srcDoc={injectedHtml}
        sandbox="allow-scripts allow-forms allow-same-origin"
        className="w-full h-full border-none"
        onLoad={() => setReady(true)}
        title={manifest.name}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-[#1A1C22]/60 backdrop-blur-xs text-xs text-slate-400">
          加载插件沙箱中...
        </div>
      )}
    </div>
  );
};
