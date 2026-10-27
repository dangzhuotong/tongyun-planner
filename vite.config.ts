import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const host = typeof process !== "undefined" ? process.env?.TAURI_DEV_HOST : undefined;

function devCorsProxyPlugin(): Plugin {
  return {
    name: "dev-cors-proxy",
    configureServer(server) {
      server.middlewares.use("/api/proxy-fetch", async (req, res) => {
        try {
          const u = new URL(req.url || "", "http://127.0.0.1:1430");
          const targetUrl = u.searchParams.get("url");
          if (!targetUrl) {
            res.statusCode = 400;
            res.end("Missing url parameter");
            return;
          }
          const response = await fetch(targetUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              Accept:
                "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
              "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
          });
          const text = await response.text();
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(text);
        } catch (e: any) {
          res.statusCode = 502;
          res.end(e?.message || "Proxy request failed");
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), devCorsProxyPlugin()],
  optimizeDeps: {
    include: ["lunar-javascript"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1430,
    strictPort: true,
    host: host || "0.0.0.0",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          tauri: ["@tauri-apps/api", "@tauri-apps/plugin-store", "@tauri-apps/plugin-opener"],
          motion: ["framer-motion"],
          lunar: ["lunar-javascript"],
          icons: ["lucide-react"],
        },
      },
    },
  },
}));
