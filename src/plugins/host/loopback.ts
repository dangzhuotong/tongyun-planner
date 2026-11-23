const SECRET_QUERY = new Set([
  "token",
  "access_token",
  "password",
  "secret",
  "key",
  "api_key",
  "authorization",
]);

const SEGMENT = /^[a-z0-9_-]{1,32}$/;

export interface LoopbackRule {
  origin?: string;
  pathPrefix: string;
  excludeSegments?: string[];
}

export interface ResolvedPrefix {
  prefix: string;
  excludeSegments: string[];
}

export function loopbackPrefix(rule: LoopbackRule, url: string): ResolvedPrefix {
  const parsed = new URL(url);
  const origin = rule.origin || `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
  return {
    prefix: `${origin}${rule.pathPrefix}`,
    excludeSegments: rule.excludeSegments ? [...rule.excludeSegments] : [],
  };
}

function pathMatches(pathname: string, pathPrefix: string): boolean {
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
}

function segmentBlocked(pathname: string, excludeSegments: string[]): boolean {
  const parts = new Set(pathname.split("/").filter(Boolean));
  return excludeSegments.some((segment) => parts.has(segment));
}

export function assertLoopbackRule(rule: LoopbackRule): void {
  if (rule.origin !== undefined && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rule.origin)) {
    throw new Error("loopback_rejected");
  }
  if (
    !rule.pathPrefix.startsWith("/") ||
    rule.pathPrefix === "/" ||
    rule.pathPrefix.includes("..") ||
    rule.pathPrefix.includes("?")
  ) {
    throw new Error("loopback_rejected");
  }
  const excluded = rule.excludeSegments ?? [];
  if (
    !Array.isArray(excluded) ||
    excluded.length > 8 ||
    excluded.some((segment) => !SEGMENT.test(segment))
  ) {
    throw new Error("loopback_rejected");
  }
}

/** 与 Rust `check_loopback_get` 同一边界：只允许已声明前缀上的本机 http GET。 */
export function assertLoopbackGet(url: string, rules: LoopbackRule[]): void {
  if (rules.length === 0 || rules.length > 8) throw new Error("loopback_rejected");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("loopback_rejected");
  }
  if (parsed.protocol !== "http:" || parsed.username || parsed.password) {
    throw new Error("loopback_rejected");
  }
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("loopback_rejected");
  }
  if (!parsed.port) throw new Error("loopback_rejected");
  if (parsed.pathname.split("/").includes("..")) throw new Error("loopback_rejected");
  for (const [key] of parsed.searchParams) {
    if (SECRET_QUERY.has(key.toLowerCase())) throw new Error("loopback_rejected");
  }
  const ok = rules.some((rule) => {
    assertLoopbackRule(rule);
    const origin = `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
    const originOk = !rule.origin || origin === rule.origin;
    return (
      originOk &&
      pathMatches(parsed.pathname, rule.pathPrefix) &&
      !segmentBlocked(parsed.pathname, rule.excludeSegments ?? [])
    );
  });
  if (!ok) throw new Error("loopback_rejected");
}
