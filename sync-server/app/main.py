from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import sync_router

settings = get_settings()

app = FastAPI(
    title="TongYun Sync Server",
    description=(
        "Self-hosted sync API for TongYun Planner. "
        "App talks HTTP + API key; MySQL stays on your server — never expose DB to the client."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tongyun-sync"}


def run() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level,
    )


if __name__ == "__main__":
    run()
