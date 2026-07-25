"""TongYun Sync Server — self-hosted sync API for personal / small-team use."""

from __future__ import annotations

CATEGORIES: tuple[str, ...] = (
    "tasks",
    "completedTasks",
    "stickyNotes",
    "pomodoroLogs",
    "countdowns",
    "habits",
    "journal",
    "config",
)

# Default empty payloads matching App / WebDAV shapes
EMPTY_PAYLOAD: dict[str, object] = {
    "tasks": [],
    "completedTasks": [],
    "stickyNotes": [],
    "pomodoroLogs": [],
    "countdowns": [],
    "habits": {"habits": [], "habitLogs": {}, "moods": {}},
    "journal": [],
    "config": None,
}
