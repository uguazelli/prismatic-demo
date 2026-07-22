from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Veridata Commerce Nexus"
    app_env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://demo:demo@postgres:5432/demo_saas"
    admin_api_key: str = "change-me-admin-key"
    cors_origins: str = "*"
    prismatic_webhook_url: str | None = None
    prismatic_api_key: SecretStr | None = None
    prismatic_dispatch_interval_seconds: float = 2.0
    prismatic_dispatch_batch_size: int = 25
    prismatic_dispatch_max_attempts: int = 5
    prismatic_webhook_timeout_seconds: float = 10.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
