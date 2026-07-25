from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from .. import CATEGORIES
from ..auth import require_user
from ..db import db_session, ensure_schema
from ..repo import ConflictError, get_document, list_manifest, load_snapshot, save_snapshot, upsert_document
from ..schemas import CategoryDocument, PutCategoryRequest, PutSnapshotRequest

router = APIRouter(prefix="/v1", tags=["sync"])


def _validate_category(category: str) -> str:
    if category not in CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown category '{category}'. Allowed: {', '.join(CATEGORIES)}",
        )
    return category


@router.get("/manifest")
def get_manifest(user_id: str = Depends(require_user)) -> dict[str, Any]:
    with db_session() as conn:
        ensure_schema(conn)
        return {"user_id": user_id, "manifest": list_manifest(conn, user_id)}


@router.get("/categories/{category}", response_model=CategoryDocument)
def get_category(category: str, user_id: str = Depends(require_user)) -> CategoryDocument:
    category = _validate_category(category)
    with db_session() as conn:
        ensure_schema(conn)
        doc = get_document(conn, user_id, category)
        if doc is None:
            from .. import EMPTY_PAYLOAD

            return CategoryDocument(category=category, version=0, data=EMPTY_PAYLOAD[category], updated_at=None)  # type: ignore[arg-type]
        return CategoryDocument(**doc)  # type: ignore[arg-type]


@router.put("/categories/{category}", response_model=CategoryDocument)
def put_category(
    category: str,
    body: PutCategoryRequest,
    user_id: str = Depends(require_user),
) -> CategoryDocument:
    category = _validate_category(category)
    with db_session() as conn:
        ensure_schema(conn)
        try:
            doc = upsert_document(
                conn,
                user_id,
                category,
                body.data,
                version=body.version,
                base_version=body.base_version,
            )
        except ConflictError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": str(exc),
                    "category": exc.category,
                    "server_version": exc.server_version,
                    "client_base_version": exc.client_base_version,
                    "server_data": exc.server_data,
                },
            ) from exc
        return CategoryDocument(**doc)  # type: ignore[arg-type]


@router.get("/snapshot")
def get_snapshot(user_id: str = Depends(require_user)) -> dict[str, Any]:
    with db_session() as conn:
        ensure_schema(conn)
        return {"user_id": user_id, **load_snapshot(conn, user_id)}


@router.put("/snapshot")
def put_snapshot(
    body: PutSnapshotRequest,
    user_id: str = Depends(require_user),
) -> dict[str, Any]:
    snap = body.snapshot.model_dump()
    with db_session() as conn:
        ensure_schema(conn)
        saved = save_snapshot(conn, user_id, snap, merge_by_version=body.merge_by_version)
        return {"user_id": user_id, **saved}


@router.get("/categories")
def list_categories(user_id: str = Depends(require_user)) -> dict[str, Any]:
    return {"user_id": user_id, "categories": list(CATEGORIES)}
