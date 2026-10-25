-- Migration 0002: Agent and Dispatch Domain Tables
ALTER TABLE domain_tasks ADD COLUMN assignee_kind TEXT;
ALTER TABLE domain_tasks ADD COLUMN assignee_agent_id TEXT;
ALTER TABLE domain_tasks ADD COLUMN run_status TEXT;

CREATE TABLE IF NOT EXISTS domain_agents (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  meta TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_task_dispatch (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  pipeline_task_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dispatch_task ON domain_task_dispatch(task_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_status ON domain_task_dispatch(status);
