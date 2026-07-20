-- TongYun Sync Server schema (MySQL 8+)
-- Aligns with App SyncCategory: tasks, completedTasks, stickyNotes,
-- pomodoroLogs, countdowns, habits, journal, config

CREATE DATABASE IF NOT EXISTS tongyun_sync
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE tongyun_sync;

CREATE TABLE IF NOT EXISTS sync_documents (
  user_id     VARCHAR(64)  NOT NULL,
  category    VARCHAR(32)  NOT NULL,
  version     BIGINT       NOT NULL DEFAULT 0 COMMENT 'client/server logical clock (ms timestamp)',
  payload     JSON         NOT NULL,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, category),
  KEY idx_sync_docs_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_meta (
  user_id     VARCHAR(64)  NOT NULL,
  meta_key    VARCHAR(64)  NOT NULL,
  meta_value  JSON         NOT NULL,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, meta_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
