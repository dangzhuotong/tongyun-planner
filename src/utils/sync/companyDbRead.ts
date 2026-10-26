export type CompanyReadState = "unknown" | "ok" | "failed";

let companyRead: CompanyReadState = "unknown";
const listeners = new Set<(state: CompanyReadState) => void>();

/** 还没读过公司库时是 unknown，侧栏先保持已同步，避免启动闪红。 */
export function companyReadState(): CompanyReadState {
  return companyRead;
}

export function subscribeCompanyRead(listener: (state: CompanyReadState) => void): () => void {
  listeners.add(listener);
  listener(companyRead);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 配了公司库且这次读失败才记失败。没配 DSN、或读成功，都不是侧栏错误。
 * 派活写库失败不走这里，只在 Agent 面板红字。
 */
export function noteCompanyRead(load: { dsnConfigured: boolean; error?: string }): void {
  const next: CompanyReadState = load.dsnConfigured && load.error ? "failed" : "ok";
  companyRead = next;
  for (const listener of listeners) listener(next);
}
