import { createContext, useContext, useState, type ReactNode } from "react";
import type { CustomizationConfig } from "../../types";
import { builtinPlugins } from "../builtins";
import { extraPlugins } from "tongyun-extra-plugins";
import { createDesktopLoopbackTransport } from "./desktopLoopback";
import { PluginHost } from "./registry";
import type { KeyValueStore, PluginBridges } from "./types";

interface PluginHostContextValue {
  host: PluginHost;
  revision: number;
  bridges: PluginBridges;
  setEnabled: (id: string, enabled: boolean) => void;
  retry: (id: string) => void;
  markFailed: (id: string, message: string) => void;
}

const PluginHostContext = createContext<PluginHostContextValue | null>(null);

function browserStore(): KeyValueStore {
  return {
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* 配额或隐私模式写失败时，本次会话仍用内存里的宿主状态 */
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* 同上 */
      }
    },
  };
}

export function PluginHostProvider({
  saveTask,
  saveJournal,
  config,
  children,
}: PluginBridges & { children: ReactNode; config: CustomizationConfig }) {
  const [host] = useState(() => {
    const created = new PluginHost(browserStore());
    created.setLoopbackTransport(createDesktopLoopbackTransport());
    created.load([...builtinPlugins, ...extraPlugins]);
    return created;
  });
  const [revision, setRevision] = useState(0);
  const bridges: PluginBridges = { saveTask, saveJournal, config };

  const value: PluginHostContextValue = {
    host,
    revision,
    bridges,
    setEnabled(id, enabled) {
      host.setEnabled(id, enabled);
      setRevision((n) => n + 1);
    },
    retry(id) {
      host.retry(id);
      setRevision((n) => n + 1);
    },
    markFailed(id, message) {
      host.markFailed(id, message);
      setRevision((n) => n + 1);
    },
  };

  return <PluginHostContext.Provider value={value}>{children}</PluginHostContext.Provider>;
}

export function usePluginHost(): PluginHostContextValue {
  const ctx = useContext(PluginHostContext);
  if (!ctx) throw new Error("usePluginHost 必须在 PluginHostProvider 内使用");
  return ctx;
}
