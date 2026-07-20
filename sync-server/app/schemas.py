from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Category = Literal[
    "tasks",
    "completedTasks",
    "stickyNotes",
    "pomodoroLogs",
    "countdowns",
    "habits",
    "journal",
    "config",
]


class ManifestEntry(BaseModel):
    version: int
    updated_at: str | None = None


class CategoryDocument(BaseModel):
    category: Category
    version: int
    data: Any
    updated_at: str | None = None


class PutCategoryRequest(BaseModel):
    """Write one category. If base_version is set and server is newer → 409."""

    data: Any
    version: int | None = Field(
        default=None,
        description="New version stamp; defaults to server now-ms if omitted",
    )
    base_version: int | None = Field(
        default=None,
        description="Client's last known version for optimistic concurrency",
    )


class Snapshot(BaseModel):
    version: int
    tasks: list[Any] = Field(default_factory=list)
    completedTasks: list[Any] = Field(default_factory=list)
    stickyNotes: list[Any] = Field(default_factory=list)
    pomodoroLogs: list[Any] = Field(default_factory=list)
    countdowns: list[Any] = Field(default_factory=list)
    habits: list[Any] = Field(default_factory=list)
    habitLogs: dict[str, Any] = Field(default_factory=dict)
    moods: dict[str, Any] = Field(default_factory=dict)
    journal: list[Any] = Field(default_factory=list)
    customizationConfig: Any | None = None


class PutSnapshotRequest(BaseModel):
    snapshot: Snapshot
    """If true, only overwrite categories where incoming version >= server."""
    merge_by_version: bool = False


class ConflictBody(BaseModel):
    detail: str
    category: str
    server_version: int
    client_base_version: int | None = None
    server_data: Any | None = None
