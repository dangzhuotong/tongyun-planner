export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "这块插件无法显示";
}
