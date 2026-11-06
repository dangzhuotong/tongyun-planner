import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

const isTauri =
  typeof window !== "undefined" &&
  (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

export function formatDiagnosticMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 2_000);
}

const pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function enqueue(message: string) {
  const line = formatDiagnosticMessage(message);
  if (!line) return;
  pending.push(line);
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      void flushDiagnosticLog();
    }, 300);
  }
}

export function recordDiagnostic(message: string) {
  if (!isTauri) return;
  enqueue(message);
}

export async function flushDiagnosticLog(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!isTauri || pending.length === 0) return;
  const batch = pending.splice(0, pending.length).join("\n");
  try {
    await invoke("append_diagnostic_log", { line: batch });
  } catch (error) {
    console.warn("[diagnostic] append failed", error);
  }
}

export function installDiagnosticLog() {
  if (!isTauri || installed) return;
  installed = true;
  recordDiagnostic("app start");
  window.addEventListener("error", (event) => {
    recordDiagnostic(`window.error ${event.message}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    recordDiagnostic(`unhandledrejection ${reason}`);
  });
  const original = console.error;
  console.error = (...args: unknown[]) => {
    original(...args);
    recordDiagnostic(args.map((item) => (item instanceof Error ? item.stack || item.message : String(item))).join(" "));
  };
}

/** 把已经落盘的诊断日志复制到下载目录，并在访达 / 资源管理器里显示。 */
export async function exportDiagnosticLog(): Promise<string> {
  await flushDiagnosticLog();
  const path = await invoke<string>("export_diagnostic_log");
  await revealItemInDir(path);
  return path;
}
