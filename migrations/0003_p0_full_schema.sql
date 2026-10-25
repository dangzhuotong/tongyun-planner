-- Migration 0003: P0 Full Schema for TongYun Planner (Local SQLite & Remote MySQL/TiDB isomorphic)
-- Tables: tasks, journal_entries, pomodoro_logs, habits, agents, task_dispatch,
--         sticky_notes, countdowns, timeblocks, user_prefs, sync_state, sync_outbox

-- 1. tasks (待办主表)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  category TEXT NOT NULL DEFAULT 'urgent-important',
  due_date TEXT,
  due_time TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  repeat_rule TEXT,
  repeat_anchor_day INTEGER,
  priority TEXT DEFAULT 'medium',
  energy_level TEXT,
  estimated_pomodoros INTEGER,
  journal_id TEXT,
  completed_at INTEGER,
  assignee_kind TEXT DEFAULT 'human',
  assignee_agent_id TEXT,
  run_status TEXT,
  stamp TEXT,
  time_block_start TEXT,
  time_block_end TEXT,
  subtasks_json TEXT,
  tags_json TEXT,
  depends_on_json TEXT,
  attachments_json TEXT,
  data TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_agent_id);

-- 2. journal_entries (手帐日记与笔记正文)
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  link_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entry_date TEXT NOT NULL,
  is_daily INTEGER NOT NULL DEFAULT 1,
  mood TEXT,
  ai_comment TEXT,
  template_id TEXT,
  washi_tape TEXT,
  stamp TEXT,
  stickers_json TEXT,
  attachments_json TEXT,
  data TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_link ON journal_entries(link_key);

-- 3. pomodoro_logs (专注番茄记录)
CREATE TABLE IF NOT EXISTS pomodoro_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  task_id TEXT,
  task_title TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  data TEXT
);
CREATE INDEX IF NOT EXISTS idx_pomodoro_logs_time ON pomodoro_logs(timestamp);

-- 4. habits (习惯养成定义)
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  done_today INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_done_date TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  data TEXT
);

-- 5. agents (AI/工人名册)
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  meta TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 6. task_dispatch (任务派发队列与历史)
CREATE TABLE IF NOT EXISTS task_dispatch (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  pipeline_task_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_dispatch_task ON task_dispatch(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dispatch_status ON task_dispatch(status);

-- 7. sticky_notes (便签便利贴)
CREATE TABLE IF NOT EXISTS sticky_notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  text TEXT NOT NULL,
  color TEXT NOT NULL,
  rotate REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  data TEXT
);

-- 8. countdowns (倒计时事件)
CREATE TABLE IF NOT EXISTS countdowns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_date TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  is_lunar INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  data TEXT
);
CREATE INDEX IF NOT EXISTS idx_countdowns_target ON countdowns(target_date);

-- 9. timeblocks (时间块与日历规划)
CREATE TABLE IF NOT EXISTS timeblocks (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  task_id TEXT,
  title TEXT NOT NULL,
  color TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  data TEXT
);
CREATE INDEX IF NOT EXISTS idx_timeblocks_date ON timeblocks(date);

-- 10. user_prefs (单行用户偏好配置，绝不包含未加密密钥)
CREATE TABLE IF NOT EXISTS user_prefs (
  id INTEGER PRIMARY KEY DEFAULT 1,
  locale TEXT DEFAULT 'zh-CN',
  nickname TEXT,
  theme_mode TEXT DEFAULT 'auto',
  customization_json TEXT,
  pomodoro_focus_duration INTEGER DEFAULT 25,
  pomodoro_break_duration INTEGER DEFAULT 5,
  alert_sound_type TEXT DEFAULT 'ding',
  sidebar_collapsed INTEGER DEFAULT 0,
  random_break INTEGER DEFAULT 0,
  auto_noise INTEGER DEFAULT 0,
  daily_goal INTEGER,
  due_remind_enabled INTEGER DEFAULT 1,
  due_remind_before_min INTEGER DEFAULT 15,
  updated_at INTEGER NOT NULL
);

-- 11. sync_state (实体同步状态与版本戳)
CREATE TABLE IF NOT EXISTS sync_state (
  entity TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  last_sync_at INTEGER,
  backend TEXT
);

-- 12. sync_outbox (待推远端变更出件箱)
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity);
