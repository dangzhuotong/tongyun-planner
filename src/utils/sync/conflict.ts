/**
 * 冲突安全同步（Fingerprint 机制与冲突辅助函数）
 */

export interface FingerprintStore {
  account: string;
  files: Record<string, string>;
}

const FP_STORAGE_KEY = "tongyun_webdav_fp";

/**
 * 计算远程文件的指纹（优先 ETag，其次 Last-Modified，最后 manifest 逻辑版本号）。
 * 若文件在远端不存在（!meta?.exists），返回 null。
 */
export function remoteFingerprint(
  meta: { exists: boolean; etag?: string | null; lastModified?: string | null } | null,
  manifestVersion?: number
): string | null {
  if (!meta?.exists) return null;
  const etag = normalizeEtag(meta.etag);
  if (etag) return "etag:" + etag;
  const lastModified = meta.lastModified?.trim();
  if (lastModified) return "lm:" + lastModified;
  return manifestVersion ? "v:" + manifestVersion : null;
}

/** 统一 ETag 格式：去掉弱校验前缀 W/ 与两侧引号，避免 HEAD / GET / PROPFIND 返回格式不同导致误判 */
export function normalizeEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  const v = etag.trim().replace(/^W\//i, "").replace(/^"+|"+$/g, "").trim();
  return v || null;
}

/**
 * 读取指定账户的文件指纹映射表。
 * 若无数据、格式损坏或账户不匹配，返回空对象。
 */
export function loadFingerprints(account: string): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(FP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<FingerprintStore>;
    if (!parsed || typeof parsed !== "object") return {};
    if (parsed.account !== account || !parsed.files || typeof parsed.files !== "object") {
      return {};
    }
    return parsed.files as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * 获取指定文件在指定账户下的已知指纹。
 */
export function getFingerprint(account: string, file: string): string | undefined {
  const fps = loadFingerprints(account);
  return fps[file];
}

/**
 * 记录指定文件在指定账户下的最新指纹。
 */
export function setFingerprint(account: string, file: string, fp: string): void {
  if (typeof localStorage === "undefined") return;
  const current = loadFingerprints(account);
  const updated: FingerprintStore = {
    account,
    files: {
      ...current,
      [file]: fp,
    },
  };
  localStorage.setItem(FP_STORAGE_KEY, JSON.stringify(updated));
}

/**
 * 清除本地存储的所有指纹记录。
 */
export function clearFingerprints(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(FP_STORAGE_KEY);
}

/**
 * 判断远程文件是否被其他设备修改。
 * - false: 远端不存在该文件；
 * - false: 无法获取远端指纹 (currentFp === null，由调用方警告无法检测)；
 * - true: 本机未曾同步过该文件 (knownFp === undefined，但远端已存在，必须询问用户)；
 * - 否则: knownFp !== currentFp。
 */
export function isRemoteChanged(
  knownFp: string | undefined,
  currentFp: string | null,
  remoteExists: boolean
): boolean {
  if (!remoteExists) return false;
  if (currentFp === null) return false;
  if (knownFp === undefined) return true;
  return knownFp !== currentFp;
}

/**
 * 生成冲突备份的文件名。
 * 格式例如："20260927-153012-tasks-remote.json"（本地时间，补零）。
 * 满足字符集 [A-Za-z0-9._-]+ 且以 .json 结尾。
 */
export function conflictBackupFileName(
  date: Date,
  category: string,
  side: "remote" | "local"
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${MM}${dd}-${hh}${mm}${ss}-${category}-${side}.json`;
}
