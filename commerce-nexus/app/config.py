import base64
from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Veridata Commerce Nexus"
    app_env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://demo:demo@postgres:5432/demo_saas"
    admin_api_key: str = "change-me-admin-key"
    cors_origins: str = "*"
    prismatic_organization_id: str | None = "T3JnYW5pemF0aW9uOmUyZDdiNTY5LWViN2ItNDAyYy04ZTYyLWRiOTQxMTE0OWI3Yg=="
    prismatic_url: str = "https://app.prismatic.io"
    prismatic_integration_name: str = "Veridata Commerce Nexus - Odoo"
    prismatic_embedded_signing_key: SecretStr | None = None
    prismatic_embedded_signing_key_base64: SecretStr | None = None
    prismatic_embedded_signing_key_file: str | None = ".secrets/prismatic-embedded-private-key.pem"
    prismatic_embedded_token_ttl_seconds: int = 3600
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

    @property
    def prismatic_signing_key(self) -> str | None:
        if self.prismatic_embedded_signing_key:
            return self.prismatic_embedded_signing_key.get_secret_value().replace("\\n", "\n")
        if self.prismatic_embedded_signing_key_base64:
            encoded = self.prismatic_embedded_signing_key_base64.get_secret_value()
            return base64.b64decode(encoded, validate=True).decode("utf-8")
        if self.prismatic_embedded_signing_key_file:
            key_path = Path(self.prismatic_embedded_signing_key_file)
            if key_path.is_file():
                return key_path.read_text(encoding="utf-8")
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
