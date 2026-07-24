from datetime import datetime

from app.schemas.common import ApiSchema


class PrismaticEmbeddedToken(ApiSchema):
    token: str
    expires_at: datetime
    prismatic_url: str
    integration_name: str


class PrismaticSettingsRead(ApiSchema):
    prismatic_organization_id: str | None = None
    prismatic_webhook_url: str | None = None
    prismatic_integration_name: str | None = None
    prismatic_url: str | None = None


class PrismaticSettingsUpdate(ApiSchema):
    prismatic_organization_id: str | None = None
    prismatic_webhook_url: str | None = None
    prismatic_integration_name: str | None = None
    prismatic_url: str | None = None
