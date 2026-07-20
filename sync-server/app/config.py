from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "tongyun"
    mysql_password: str = "change-me"
    mysql_database: str = "tongyun_sync"

    api_key: str = "replace-with-a-long-random-secret"
    user_id: str = "default"
    # Optional "key:user,key2:user2"
    api_key_map: str = ""

    host: str = "0.0.0.0"
    port: int = 8787
    log_level: str = "info"

    @property
    def key_to_user(self) -> dict[str, str]:
        mapping: dict[str, str] = {}
        if self.api_key_map.strip():
            for part in self.api_key_map.split(","):
                part = part.strip()
                if not part or ":" not in part:
                    continue
                key, uid = part.split(":", 1)
                key, uid = key.strip(), uid.strip()
                if key and uid:
                    mapping[key] = uid
        if self.api_key.strip():
            mapping.setdefault(self.api_key.strip(), self.user_id.strip() or "default")
        return mapping


@lru_cache
def get_settings() -> Settings:
    return Settings()
