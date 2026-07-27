import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = typeof process !== "undefined" ? process.env?.TAURI_DEV_HOST : undefined;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  optimizeDeps: {
    include: ["lunar-javascript"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          tauri: ["@tauri-apps/api", "@tauri-apps/plugin-store", "@tauri-apps/plugin-opener"],
        },
      },
    },
  },
}));
