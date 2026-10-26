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
 * 配了公司库且这次读失败才记失败。这个结果只给 Agent 面板的名册说明。
 * 不驱动侧栏。侧栏只在个人远端库写入失败时变红。派活写库失败也不走这里。
 */
export function noteCompanyRead(load: { dsnConfigured: boolean; error?: string }): void {
  const next: CompanyReadState = load.dsnConfigured && load.error ? "failed" : "ok";
  companyRead = next;
  for (const listener of listeners) listener(next);
}
