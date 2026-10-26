import type { DomainAgent } from "../../types";
import { getRemoteDsn, loadRemoteDatabase } from "../sync/remoteDbSync";
import {
  type CompanyRosterEntry,
  type HomePipelineFiles,
  type PipelineDsnVia,
  type PipelineGateway,
  type RequirementDraft,
  type RosterVia,
  localAgentsToRoster,
  mergeCompanyRoster,
  parsePipelineDsnFromHomeFiles,
  queryCompanyRoster,
  readRosterCache,
  resolvePipelineDsn,
  selectVisibleRoster,
  submitRequirement,
  writeRosterCache,
} from "./companyRoster";
import { fixtureAgentRows, fixtureWorkerRows } from "./rosterFixture";

export const ROSTER_FIXTURE_KEY = "tongyun_roster_fixture";

export interface RosterLoad {
  entries: CompanyRosterEntry[];
  via: RosterVia;
  dsnConfigured: boolean;
  error?: string;
}

interface HomeFilesPayload {
  "pipeline.dsn"?: string | null;
  "pipeline.json"?: string | null;
  "config.json"?: string | null;
  ".env"?: string | null;
  remoteDsnFromEnv?: string | null;
}

export interface FetchCompanyRosterDeps {
  now?: number;
  fixture?: boolean;
  force?: boolean;
  loadLocal?: () => Promise<DomainAgent[]>;
  readCache?: () => ReturnType<typeof readRosterCache>;
  writeCache?: (file: { fetchedAt: number; entries: CompanyRosterEntry[] }) => void;
  resolveDsn?: () => Promise<{ dsn: string | null; via: PipelineDsnVia }>;
  openGateway?: (dsn: string) => Promise<PipelineGateway | null>;
}

const ROSTER_MEMORY_TTL_MS = 15_000;
let rosterMemory: { at: number; load: RosterLoad } | null = null;
let rosterInflight: Promise<RosterLoad> | null = null;

export function isRosterFixtureEnabled(): boolean {
  if (import.meta.env?.MODE === "production") return false;
  try {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(ROSTER_FIXTURE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 生产接法（不新开机密通道）：
 * 1. 桌面端读 ~/.tongyun 的 pipeline.dsn / pipeline.json / config.json 的 pipeline_dsn / .env 的 PIPELINE_DSN
 * 2. 否则用现成远端 DSN：localStorage tongyun_remote_dsn，或环境变量 TONGYUN_REMOTE_DSN
 * 3. 库名不是 tongyun_pipeline 时，沿用同一主机和账号，只把库名改成 tongyun_pipeline
 * 没有 DSN 时不连网，用手帐里上次成功读到的公司名册缓存；缓存也没有才退回本机 domain_agents。
 */
export async function resolveRuntimePipelineDsn(): Promise<{
  dsn: string | null;
  via: PipelineDsnVia;
}> {
  const home = await readHomePipelineFiles();
  const parsed = parsePipelineDsnFromHomeFiles(home.files);
  const remote = getRemoteDsn() || home.remoteDsnFromEnv || parsed.remoteDsn;
  return resolvePipelineDsn({ homeDsn: parsed.pipelineDsn, remoteDsn: remote });
}

export async function fetchCompanyRoster(deps: FetchCompanyRosterDeps = {}): Promise<RosterLoad> {
  const isolated =
    deps.force ||
    deps.fixture != null ||
    deps.now != null ||
    deps.resolveDsn != null ||
    deps.openGateway != null ||
    deps.readCache != null ||
    deps.writeCache != null;
  if (!isolated) {
    if (rosterMemory && Date.now() - rosterMemory.at < ROSTER_MEMORY_TTL_MS)
      return rosterMemory.load;
    if (rosterInflight) return rosterInflight;
    rosterInflight = loadCompanyRoster(deps)
      .then((load) => {
        rosterMemory = { at: Date.now(), load };
        rosterInflight = null;
        return load;
      })
      .catch((error) => {
        rosterInflight = null;
        throw error;
      });
    return rosterInflight;
  }
  const load = await loadCompanyRoster(deps);
  if (deps.force) rosterMemory = { at: Date.now(), load };
  return load;
}

async function loadCompanyRoster(deps: FetchCompanyRosterDeps): Promise<RosterLoad> {
  const now = deps.now ?? Date.now();
  if (deps.fixture ?? isRosterFixtureEnabled()) {
    return {
      entries: mergeCompanyRoster(fixtureAgentRows(), fixtureWorkerRows(now), now),
      via: "fixture",
      dsnConfigured: true,
    };
  }

  const local = await (deps.loadLocal ?? defaultLoadLocal)().catch(() => [] as DomainAgent[]);
  const localFallback = localAgentsToRoster(local, now);
  const cache = (deps.readCache ?? defaultReadCache)()?.entries ?? [];
  let resolved = { dsn: null as string | null, via: "none" as PipelineDsnVia };
  try {
    resolved = await (deps.resolveDsn ?? resolveRuntimePipelineDsn)();
  } catch {
    resolved = { dsn: null, via: "none" };
  }
  const dsnConfigured = Boolean(resolved.dsn);
  if (!dsnConfigured) {
    const picked = selectVisibleRoster({
      dsnConfigured: false,
      company: null,
      companyCache: cache,
      localFallback,
    });
    return { ...picked, dsnConfigured: false };
  }

  try {
    const gateway = await (deps.openGateway ?? openPipelineGateway)(resolved.dsn!);
    if (!gateway) throw new Error("gateway");
    const company = await queryCompanyRoster(gateway, now);
    if (!company) throw new Error("query");
    (deps.writeCache ?? defaultWriteCache)({ fetchedAt: now, entries: company });
    return { entries: company, via: "pipeline", dsnConfigured: true };
  } catch {
    const picked = selectVisibleRoster({
      dsnConfigured: true,
      company: null,
      companyCache: cache,
      localFallback,
    });
    return {
      ...picked,
      dsnConfigured: true,
      error:
        picked.via === "cache"
          ? "公司库这次没读到，先显示上次缓存"
          : "已配置公司库，这次没读到，未用本机登记顶上",
    };
  }
}

export async function submitPlannerRequirement(
  draft: RequirementDraft,
): Promise<{ id: string; persisted: "pipeline" | "fixture" }> {
  if (isRosterFixtureEnabled()) {
    const receipt = await submitRequirement(echoRequirementGateway(), draft);
    return { ...receipt, persisted: "fixture" };
  }
  const resolved = await resolveRuntimePipelineDsn();
  if (!resolved.dsn) throw new Error("未配置公司库，需求未入库");
  const gateway = await openPipelineGateway(resolved.dsn);
  if (!gateway) throw new Error("连不上 tongyun_pipeline，需求未入库");
  const receipt = await submitRequirement(gateway, draft);
  return { ...receipt, persisted: "pipeline" };
}

export function echoRequirementGateway(): PipelineGateway {
  let lastId = "";
  return {
    async execute(_sql, params) {
      lastId = String(params?.[0] ?? "");
      return { rowsAffected: 1, lastInsertId: lastId };
    },
    async select() {
      return [{ id: lastId }];
    },
  };
}

async function openPipelineGateway(dsn: string): Promise<PipelineGateway | null> {
  try {
    const db = await loadRemoteDatabase(dsn);
    if (!db) return null;
    return {
      select: (sql, params) => db.select(sql, params) as Promise<unknown>,
      execute: async (sql, params) => {
        const result = await db.execute(sql, params);
        return { lastInsertId: result.lastInsertId, rowsAffected: result.rowsAffected };
      },
    };
  } catch {
    return null;
  }
}

async function defaultLoadLocal(): Promise<DomainAgent[]> {
  const { agentRepository } = await import("../../data/repositories");
  return agentRepository.load();
}

function defaultReadCache() {
  if (typeof localStorage === "undefined") return null;
  return readRosterCache(localStorage);
}

function defaultWriteCache(file: { fetchedAt: number; entries: CompanyRosterEntry[] }) {
  if (typeof localStorage === "undefined") return;
  writeRosterCache(localStorage, file);
}

async function readHomePipelineFiles(): Promise<{
  files: HomePipelineFiles;
  remoteDsnFromEnv: string | null;
}> {
  const empty = { files: {}, remoteDsnFromEnv: null as string | null };
  if (
    typeof window === "undefined" ||
    !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  ) {
    return empty;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = await invoke<HomeFilesPayload>("read_pipeline_home_files");
    return {
      files: {
        "pipeline.dsn": payload?.["pipeline.dsn"] || undefined,
        "pipeline.json": payload?.["pipeline.json"] || undefined,
        "config.json": payload?.["config.json"] || undefined,
        ".env": payload?.[".env"] || undefined,
      },
      remoteDsnFromEnv: payload?.remoteDsnFromEnv?.trim() || null,
    };
  } catch {
    return empty;
  }
}
