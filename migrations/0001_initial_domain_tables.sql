-- Migration 0001: Initial Domain Tables
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_backups (
  source_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_tasks (
  id TEXT PRIMARY KEY,
  completed_at INTEGER,
  due_date TEXT,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domain_tasks_completed ON domain_tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_domain_tasks_due ON domain_tasks(due_date);

CREATE TABLE IF NOT EXISTS domain_journal (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  is_daily INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domain_journal_date ON domain_journal(entry_date);

CREATE TABLE IF NOT EXISTS domain_pomodoro_logs (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domain_pomodoro_time ON domain_pomodoro_logs(occurred_at);

CREATE TABLE IF NOT EXISTS domain_habits (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
