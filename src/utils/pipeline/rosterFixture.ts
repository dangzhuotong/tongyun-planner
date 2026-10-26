import type { PipelineAgentRow, PipelineWorkerRow } from "./companyRoster";

/** 本机没有 TiDB 时，开发态 sessionStorage.tongyun_roster_fixture=1 用这组行演示合并结果。生产构建忽略该开关。 */
export function fixtureAgentRows(): PipelineAgentRow[] {
  return [
    {
      id: 1,
      slug: "adang",
      display_name: "阿当",
      short_title: "阿当",
      scope: "company",
      status: "active",
      sort_order: 10,
      aliases_json: "[]",
    },
    {
      id: 2,
      slug: "ama",
      display_name: "阿码",
      short_title: "阿码",
      scope: "company",
      status: "active",
      sort_order: 20,
      aliases_json: JSON.stringify(["阿码"]),
    },
    {
      id: 3,
      slug: "agy",
      display_name: "阿衡",
      short_title: "阿衡",
      scope: "company",
      status: "paused",
      sort_order: 30,
    },
  ];
}

export function fixtureWorkerRows(now: number): PipelineWorkerRow[] {
  return [
    {
      assignee: "cursor-cloud",
      machine: "cursor-cloud",
      status: "online",
      enabled: 1,
      last_seen_at: now - 12_000,
    },
    {
      assignee: "ama",
      machine: "mac-studio",
      status: "online",
      enabled: 1,
      last_seen_at: now - 90_000,
    },
    {
      assignee: "adang",
      machine: "mac-mini",
      status: "offline",
      enabled: 1,
      last_seen_at: now - 2 * 60 * 60 * 1000,
    },
    {
      assignee: "agy",
      machine: "old",
      status: "online",
      enabled: 1,
      last_seen_at: now - 5_000,
    },
    {
      assignee: "retired-bot",
      machine: "shelf",
      status: "online",
      enabled: 0,
      last_seen_at: now,
    },
  ];
}
