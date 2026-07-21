from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Veridata Commerce Nexus"
    app_env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://demo:demo@postgres:5432/demo_saas"
    admin_api_key: str = "change-me-admin-key"
    cors_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
