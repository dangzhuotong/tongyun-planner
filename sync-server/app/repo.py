from __future__ import annotations

import json
import time
from typing import Any

from pymysql.connections import Connection

from . import CATEGORIES, EMPTY_PAYLOAD
from .db import decode_json


def _now_ms() -> int:
    return int(time.time() * 1000)


def get_document(conn: Connection, user_id: str, category: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT category, version, payload, updated_at FROM sync_documents "
            "WHERE user_id=%s AND category=%s",
            (user_id, category),
        )
        row = cur.fetchone()
    if not row:
        return None
    updated = row["updated_at"]
    return {
        "category": row["category"],
        "version": int(row["version"]),
        "data": decode_json(row["payload"]),
        "updated_at": updated.isoformat(sep=" ", timespec="milliseconds") if updated else None,
    }


def list_manifest(conn: Connection, user_id: str) -> dict[str, dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT category, version, updated_at FROM sync_documents WHERE user_id=%s",
            (user_id,),
        )
        rows = cur.fetchall()
    out: dict[str, dict[str, Any]] = {
        cat: {"version": 0, "updated_at": None} for cat in CATEGORIES
    }
    for row in rows:
        cat = row["category"]
        if cat not in out:
            continue
        updated = row["updated_at"]
        out[cat] = {
            "version": int(row["version"]),
            "updated_at": updated.isoformat(sep=" ", timespec="milliseconds") if updated else None,
        }
    return out


def upsert_document(
    conn: Connection,
    user_id: str,
    category: str,
    data: Any,
    *,
    version: int | None = None,
    base_version: int | None = None,
) -> dict[str, Any]:
    existing = get_document(conn, user_id, category)
    server_version = existing["version"] if existing else 0

    if base_version is not None and existing is not None and server_version > base_version:
        raise ConflictError(
            category=category,
            server_version=server_version,
            client_base_version=base_version,
            server_data=existing["data"],
        )

    new_version = version if version is not None else max(server_version + 1, _now_ms())
    if existing is not None and new_version < server_version:
        # Never go backwards unless client explicitly wins with higher stamp
        new_version = server_version + 1

    payload = json.dumps(data, ensure_ascii=False, default=str)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sync_documents (user_id, category, version, payload)
            VALUES (%s, %s, %s, CAST(%s AS JSON))
            ON DUPLICATE KEY UPDATE
              version = VALUES(version),
              payload = VALUES(payload)
            """,
            (user_id, category, new_version, payload),
        )
    doc = get_document(conn, user_id, category)
    assert doc is not None
    return doc


def load_snapshot(conn: Connection, user_id: str) -> dict[str, Any]:
    manifest = list_manifest(conn, user_id)
    global_version = max((m["version"] for m in manifest.values()), default=0)

    def payload(cat: str) -> Any:
        doc = get_document(conn, user_id, cat)
        if doc is None:
            return EMPTY_PAYLOAD[cat]
        return doc["data"]

    habits_blob = payload("habits")
    if not isinstance(habits_blob, dict):
        habits_blob = {"habits": [], "habitLogs": {}, "moods": {}}

    return {
        "version": global_version,
        "tasks": payload("tasks") or [],
        "completedTasks": payload("completedTasks") or [],
        "stickyNotes": payload("stickyNotes") or [],
        "pomodoroLogs": payload("pomodoroLogs") or [],
        "countdowns": payload("countdowns") or [],
        "habits": habits_blob.get("habits") or [],
        "habitLogs": habits_blob.get("habitLogs") or {},
        "moods": habits_blob.get("moods") or {},
        "journal": payload("journal") or [],
        "customizationConfig": payload("config"),
        "manifest": manifest,
    }


def save_snapshot(
    conn: Connection,
    user_id: str,
    snapshot: dict[str, Any],
    *,
    merge_by_version: bool = False,
) -> dict[str, Any]:
    stamp = int(snapshot.get("version") or _now_ms())
    habits_payload = {
        "habits": snapshot.get("habits") or [],
        "habitLogs": snapshot.get("habitLogs") or {},
        "moods": snapshot.get("moods") or {},
    }
    pieces: dict[str, Any] = {
        "tasks": snapshot.get("tasks") or [],
        "completedTasks": snapshot.get("completedTasks") or [],
        "stickyNotes": snapshot.get("stickyNotes") or [],
        "pomodoroLogs": snapshot.get("pomodoroLogs") or [],
        "countdowns": snapshot.get("countdowns") or [],
        "habits": habits_payload,
        "journal": snapshot.get("journal") or [],
        "config": snapshot.get("customizationConfig"),
    }

    for cat, data in pieces.items():
        existing = get_document(conn, user_id, cat)
        if merge_by_version and existing and existing["version"] > stamp:
            continue
        upsert_document(conn, user_id, cat, data, version=stamp, base_version=None)

    return load_snapshot(conn, user_id)


class ConflictError(Exception):
    def __init__(
        self,
        *,
        category: str,
        server_version: int,
        client_base_version: int | None,
        server_data: Any,
    ) -> None:
        self.category = category
        self.server_version = server_version
        self.client_base_version = client_base_version
        self.server_data = server_data
        super().__init__(f"Conflict on {category}: server={server_version} > base={client_base_version}")
